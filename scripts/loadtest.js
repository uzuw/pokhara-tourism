#!/usr/bin/env node
/**
 * Load test under "moderate conditions".
 *
 *   node scripts/loadtest.js [--dir <repo>] [--label old|new] [--connections 50]
 *                            [--duration 15] [--port 4199] [--out reports/x.json]
 *
 * What it does:
 *  1. builds a realistic dataset in a throwaway SQLite file (14 real
 *     destinations + 500 users + 3k ratings + 4k comments),
 *  2. boots <repo>/server/index.js as a CHILD process (so the load generator
 *     and the server are not fighting over one event loop),
 *  3. runs autocannon scenarios at moderate concurrency and prints a table,
 *  4. writes a JSON report you can diff between revisions.
 *
 * Because the fixtures and the driver are identical for every revision, the
 * numbers are comparable across git checkouts — that is how the before/after
 * table in docs/AUDIT.md was produced.
 */
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { spawn } = require('child_process');

const autocannon = require('autocannon');

// ---- args ------------------------------------------------------------------
const argv = process.argv.slice(2);
const arg = (name, dflt) => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? dflt : argv[i + 1];
};
const REPO = path.resolve(arg('dir', path.join(__dirname, '..')));
const LABEL = arg('label', path.basename(REPO));
const CONNECTIONS = Number(arg('connections', 50));
const DURATION = Number(arg('duration', 15));
const PORT = Number(arg('port', 4199));
const OUT = arg('out', path.join(REPO, 'reports', `loadtest-${LABEL}-${Date.now()}.json`));
// --only "substr,substr" filters scenarios by name (for quick A/B runs)
const ONLY = String(arg('only', '')).split(',').map((s) => s.trim()).filter(Boolean);
// --flood runs the parallel "reads while logins hash" probe instead of scenarios
const FLOOD = argv.includes('--flood');
// --env "KEY=VAL,KEY=VAL" adds env overrides for the server child process
const EXTRA_ENV = Object.fromEntries(
  String(arg('env', '')).split(',').filter(Boolean).map((kv) => {
    const i = kv.indexOf('=');
    return [kv.slice(0, i).trim(), kv.slice(i + 1).trim()];
  })
);

const BASE = `http://127.0.0.1:${PORT}`;
const DB_NAME = `loadtest-${process.pid}.db`;
const JWT_SECRET = crypto.randomBytes(48).toString('hex'); // generated, never a literal
const PASSWORD = 'Load-Test-Pass1!';
const USERS = 500;
const RATINGS = 3000;
const COMMENTS = 4000;

const childEnv = {
  ...process.env,
  NODE_ENV: 'development',
  PORT: String(PORT),
  HOST: '127.0.0.1',
  JWT_SECRET,
  TOURISM_TEST_DB: DB_NAME,
  RATE_LIMIT_DISABLED: '1', // the abuse guards are a separate, deliberate constraint
  TRUST_PROXY: 'false',
  BODY_LIMIT: '1mb',
  ...EXTRA_ENV,
};

// ---- fixtures --------------------------------------------------------------
function buildFixtures() {
  // Require the target revision's own db module so the schema always matches.
  process.env.JWT_SECRET = JWT_SECRET;
  process.env.TOURISM_TEST_DB = DB_NAME;
  process.env.NODE_ENV = 'development';

  const targetDb = require(path.join(REPO, 'server', 'db.js'));
  const { db, seedIfEmpty } = targetDb;
  const bcrypt = require(path.join(REPO, 'node_modules', 'bcryptjs'));
  const { signToken } = require(path.join(REPO, 'server', 'auth.js'));

  seedIfEmpty();
  const destIds = db.prepare('SELECT id FROM destinations ORDER BY id').all().map((r) => r.id);

  db.exec('DELETE FROM ratings; DELETE FROM comments; DELETE FROM users;');
  const hash = bcrypt.hashSync(PASSWORD, 10); // hash once, reuse — fixture cost, not a measurement
  const insUser = db.prepare('INSERT INTO users (username,email,password_hash,bio,created_at) VALUES (?,?,?,?,?)');
  const insRating = db.prepare('INSERT OR IGNORE INTO ratings (user_id,destination_id,score,created_at) VALUES (?,?,?,?)');
  const insComment = db.prepare('INSERT INTO comments (user_id,destination_id,text,created_at) VALUES (?,?,?,?)');
  const LOREM = 'Spent a few hours here and it was worth every minute. Great views, easy to reach, and the locals were lovely. ';

  const users = [];
  db.exec('BEGIN');
  for (let i = 0; i < USERS; i++) {
    const username = `loaduser${i}`;
    const info = insUser.run(username, `${username}@load.test`, hash, 'Load-test fixture account.', `2026-01-${String((i % 28) + 1).padStart(2, '0')} 08:00:00`);
    users.push(Number(info.lastInsertRowid));
  }
  for (let i = 0; i < RATINGS; i++) {
    const u = users[i % users.length];
    const d = destIds[(i * 7 + Math.floor(i / users.length)) % destIds.length];
    insRating.run(u, d, (i % 5) + 1, `2026-02-${String((i % 28) + 1).padStart(2, '0')} 10:00:00`);
  }
  for (let i = 0; i < COMMENTS; i++) {
    const u = users[i % users.length];
    const d = destIds[(i * 3 + 1) % destIds.length];
    insComment.run(u, d, `${LOREM}(${i})`, `2026-03-${String((i % 28) + 1).padStart(2, '0')} 12:00:00`);
  }
  db.exec('COMMIT');

  const counts = {
    destinations: db.prepare('SELECT COUNT(*) AS c FROM destinations').get().c,
    users: db.prepare('SELECT COUNT(*) AS c FROM users').get().c,
    ratings: db.prepare('SELECT COUNT(*) AS c FROM ratings').get().c,
    comments: db.prepare('SELECT COUNT(*) AS c FROM comments').get().c,
  };

  // Pre-sign a pool of tokens (both revisions verify with the same secret).
  const tokens = users.slice(0, 200).map((id, i) => signToken({ id, username: `loaduser${i}`, email: `loaduser${i}@load.test` }));

  try { db.close(); } catch (e) { /* newer revisions expose close() */ }
  return { counts, tokens };
}

// ---- server lifecycle ------------------------------------------------------
function startServer() {
  const child = spawn(process.execPath, ['server/index.js'], {
    cwd: REPO,
    env: childEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const log = [];
  child.stdout.on('data', (d) => log.push(String(d)));
  child.stderr.on('data', (d) => log.push(String(d)));
  return { child, log };
}

async function waitForHealth(timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE}/api/health`);
      if (res.ok) return true;
    } catch (e) { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  return false;
}

// ---- scenarios -------------------------------------------------------------
let tokenCursor = 0;
let TOKEN_POOL = [];
const nextToken = () => TOKEN_POOL[(tokenCursor++) % TOKEN_POOL.length];

function scenarioRequests() {
  return [
    {
      name: 'GET /api/destinations (list, 14 rows + stats)',
      method: 'GET',
      path: '/api/destinations',
    },
    {
      name: 'GET /api/destinations/:slug (detail + stats)',
      method: 'GET',
      path: '/api/destinations/phewa-lake',
    },
    {
      name: 'GET /api/destinations/:slug/ratings (aggregate + join)',
      method: 'GET',
      path: '/api/destinations/phewa-lake/ratings',
    },
    {
      name: 'GET /api/destinations/:slug/comments (join + 100 rows)',
      method: 'GET',
      path: '/api/destinations/phewa-lake/comments',
    },
    {
      name: 'POST /api/auth/login (bcrypt + token)',
      method: 'POST',
      path: '/api/auth/login',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ identifier: 'loaduser0@load.test', password: PASSWORD }),
    },
    {
      name: 'mixed: 85% browse + 15% authenticated comment write',
      setupRequest: (req) => {
        const roll = Math.random();
        if (roll < 0.15) {
          req.method = 'POST';
          req.path = '/api/destinations/sarangkot/comments';
          req.headers = { ...req.headers, 'content-type': 'application/json', authorization: `Bearer ${nextToken()}` };
          req.body = JSON.stringify({ text: `load-test comment ${Math.random().toString(36).slice(2)}` });
        } else if (roll < 0.65) {
          req.method = 'GET';
          req.path = '/api/destinations';
          req.body = undefined;
        } else {
          req.method = 'GET';
          req.path = '/api/destinations/phewa-lake';
          req.body = undefined;
        }
        return req;
      },
    },
    {
      name: 'flood: 60% logins + 40% reads (event-loop responsiveness)',
      setupRequest: (req) => {
        if (Math.random() < 0.6) {
          req.method = 'POST';
          req.path = '/api/auth/login';
          req.headers = { ...req.headers, 'content-type': 'application/json' };
          req.body = JSON.stringify({ identifier: 'loaduser0@load.test', password: PASSWORD });
        } else {
          req.method = 'GET';
          req.path = '/api/destinations/phewa-lake';
          req.body = undefined;
        }
        return req;
      },
    },
  ];
}

async function run() {
  console.log(`\n=== loadtest: ${LABEL}  (${REPO})`);
  console.log(`    connections=${CONNECTIONS} duration=${DURATION}s per scenario\n`);

  const { counts, tokens } = buildFixtures();
  TOKEN_POOL = tokens;
  console.log('    fixtures:', JSON.stringify(counts));

  const { child, log } = startServer();
  const stop = () => { if (!child.killed) child.kill('SIGTERM'); };
  process.on('exit', stop);

  if (!(await waitForHealth())) {
    stop();
    console.error('server never became healthy:\n' + log.join(''));
    process.exit(1);
  }

  // --flood: hammer logins with one load generator while measuring READS with
  // another. This is the only honest way to answer "does a burst of password
  // hashing freeze the whole API?" — aggregate latency of a mixed scenario hides it.
  if (FLOOD) {
    const [flood, reads] = await Promise.all([
      autocannon({
        url: BASE,
        connections: CONNECTIONS,
        duration: DURATION,
        requests: [{
          method: 'POST',
          path: '/api/auth/login',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ identifier: 'loaduser0@load.test', password: PASSWORD }),
        }],
      }),
      autocannon({
        url: BASE,
        connections: 10,
        duration: DURATION,
        requests: [{ method: 'GET', path: '/api/destinations/phewa-lake' }],
      }),
    ]);
    stop();
    const results = [
      { name: 'reads WHILE logins are hashing', rps: Math.round(reads.requests.average), p50: reads.latency.p50, p99: reads.latency.p99, non2xx: reads.non2xx, errors: reads.errors, timeouts: reads.timeouts },
      { name: 'login flood (same window)', rps: Math.round(flood.requests.average), p50: flood.latency.p50, p99: flood.latency.p99, non2xx: flood.non2xx, errors: flood.errors, timeouts: flood.timeouts },
    ];
    results.forEach((s) => console.log(`    ${String(s.rps).padStart(6)} req/s | p50 ${String(s.p50).padStart(5)}ms | p99 ${String(s.p99).padStart(5)}ms | ${s.name}`));
    for (const suffix of ['', '-wal', '-shm']) {
      try { fs.unlinkSync(path.join(REPO, 'server', 'data', DB_NAME + suffix)); } catch (e) { /* gone */ }
    }
    const report = { label: LABEL, mode: 'flood', repo: REPO, connections: CONNECTIONS, duration_s: DURATION, fixtures: counts, when: new Date().toISOString(), results };
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
    console.log(`\n    report -> ${OUT}\n`);
    process.exit(0);
  }

  const results = [];
  const scenarios = scenarioRequests().filter((s) => !ONLY.length || ONLY.some((o) => s.name.toLowerCase().includes(o.toLowerCase())));
  if (!scenarios.length) {
    console.error(`--only "${ONLY.join(',')}" matched no scenario`);
    process.exit(1);
  }
  for (const req of scenarios) {
    const started = Date.now();
    const r = await autocannon({
      url: BASE,
      connections: CONNECTIONS,
      duration: DURATION,
      pipelining: 1,
      headers: { 'accept-encoding': 'gzip, deflate', accept: 'application/json' },
      requests: [{ ...req }],
    });
    const one = r;
    const scenario = {
      name: req.name,
      rps: Math.round(one.requests.average),
      p50: one.latency.p50,
      p99: one.latency.p99,
      mean: one.latency.mean,
      throughput_kbps: Math.round(one.throughput.average / 1024),
      non2xx: one.non2xx,
      errors: one.errors,
      timeouts: one.timeouts,
      seconds: Math.round((Date.now() - started) / 1000),
    };
    results.push(scenario);
    const flag = scenario.non2xx || scenario.errors ? `  <-- non-2xx:${scenario.non2xx} err:${scenario.errors}` : '';
    console.log(
      `    ${String(scenario.rps).padStart(6)} req/s | p50 ${String(scenario.p50).padStart(4)}ms | p99 ${String(scenario.p99).padStart(4)}ms | ${String(scenario.throughput_kbps).padStart(6)} KB/s | ${scenario.name}${flag}`
    );
  }

  stop();
  await new Promise((r) => setTimeout(r, 500));

  // clean up the throwaway DB
  for (const suffix of ['', '-wal', '-shm']) {
    try { fs.unlinkSync(path.join(REPO, 'server', 'data', DB_NAME + suffix)); } catch (e) { /* gone */ }
  }

  const report = { label: LABEL, repo: REPO, connections: CONNECTIONS, duration_s: DURATION, fixtures: counts, when: new Date().toISOString(), results };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));

  // Guard against fooling ourselves: a fast scenario full of 401s/429s measures
  // nothing. Fail loudly instead of reporting a meaningless throughput number.
  const bogus = results.filter((r) => r.non2xx > 0 || r.errors > 0 || r.timeouts > 0);
  if (bogus.length) {
    console.error('\n!! INVALID RUN — these scenarios did not return clean 2xx:');
    bogus.forEach((b) => console.error(`   ${b.name}: non2xx=${b.non2xx} errors=${b.errors} timeouts=${b.timeouts}`));
    console.error('   (fix the harness/fixtures before trusting any number above)\n');
    process.exit(2);
  }

  console.log(`\n    report -> ${OUT}\n`);
  process.exit(0);
}

run().catch((e) => { console.error(e); process.exit(1); });
