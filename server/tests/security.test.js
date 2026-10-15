/**
 * Security regression suite — OWASP API Top-10 oriented.
 *
 * Every test here encodes a DEFENSIVE contract the API must hold in
 * production. A failure is a finding, not a flaky test.
 *
 * Covers: injection (SQL/NoSQL/parameter tampering), broken auth (JWT
 * forgery, token confusion), broken object/function-level authorization
 * (IDOR, mass assignment), unrestricted resource consumption (body/query
 * abuse, credential stuffing), security misconfiguration (headers, CORS,
 * error leakage), and static-file path traversal.
 *
 * Brute-force / rate-limit bursts live in security-ratelimit.test.js so this
 * file can raise its own limits and stay deterministic.
 */
process.env.AUTH_RATE_MAX = '1000'; // abuse limits are exercised in the ratelimit suite
process.env.REGISTER_RATE_MAX = '1000';
process.env.WRITE_RATE_MAX = '1000';

const request = require('supertest');
const jwt = require('jsonwebtoken');
const { app, db, seedDestinations, cleanup } = require('./setup');
const { JWT_SECRET } = require('../auth');

jest.setTimeout(30000);

let seq = 0;
const uniq = (p = 'sec') => `${p}${Date.now().toString(36)}${seq++}`;
const GOOD_PW = 'Str0ng-Passw0rd!';
const isJson = (res) => String(res.headers['content-type'] || '').includes('application/json');
const bodyText = (res) => `${res.text || ''}${res.body ? JSON.stringify(res.body) : ''}`;
// Stack traces, absolute paths, or password hash columns leaking into a response.
const LEAK_RE = /(\/home\/|\/usr\/lib\/|node_modules|at Object\.|at Layer\.|at Route\.|password_hash|\$2[aby]\$\d\d\$|scrypt\$\d+\$)/;

async function signup(over = {}) {
  const username = over.username || uniq('sec');
  const res = await request(app)
    .post('/api/auth/register')
    .send({ username, email: `${username}@ex.com`, password: GOOD_PW, ...over });
  return { res, username, token: res.body && res.body.token };
}

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const forgedNoneToken = () =>
  `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ sub: 1, username: 'attacker' })}.`;

// =====================================================================
// 1. Injection — parameterized queries, no SQL/NoSQL execution
// =====================================================================
describe('Sec/injection', () => {
  afterAll(() => cleanup());

  const injections = [
    "' OR 1=1 --",
    "admin'--",
    "' OR '1'='1",
    '" OR ""="',
    "1;UPDATE users SET is_admin=1 WHERE id=1;--",
    "x' UNION SELECT id,username,email,password_hash,1,1,1,1,1,1,1,1 FROM users --",
    "'; DROP TABLE users; --",
  ];

  test('login identifier is parameterized — no auth bypass, no crash', async () => {
    for (const identifier of injections) {
      const res = await request(app).post('/api/auth/login').send({ identifier, password: GOOD_PW });
      expect([400, 401]).toContain(res.status);
      expect(res.body.token).toBeUndefined();
      expect(LEAK_RE.test(bodyText(res))).toBe(false);
    }
    // schema survived the DROP/UPDATE attempts
    expect(db.prepare('SELECT COUNT(*) AS c FROM users').get().c).toBeGreaterThanOrEqual(0);
  });

  test('search query (q) cannot be turned into SQL', async () => {
    for (const q of ["%' OR 1=1 --", "' OR 1=1 --", "x%'; DROP TABLE destinations; --"]) {
      const res = await request(app).get('/api/destinations').query({ q });
      expect(res.status).toBe(200);
      expect(res.body.count).toBe(0);
    }
    expect(db.prepare('SELECT COUNT(*) AS c FROM destinations').get().c).toBeGreaterThanOrEqual(0);
  });

  test('slug parameter cannot be turned into SQL (404, never 500)', async () => {
    for (const slug of ["' OR 1=1 --", 'x;DROP TABLE destinations;--', "'; SELECT * FROM users --"]) {
      const res = await request(app).get(`/api/destinations/${encodeURIComponent(slug)}`);
      expect(res.status).toBe(404);
      expect(LEAK_RE.test(bodyText(res))).toBe(false);
    }
  });

  test('stored text is inert — payload round-trips literally, schema intact', async () => {
    seedDestinations();
    const { token } = await signup();
    const payload = "'); DROP TABLE users;-- <img src=x onerror=alert(1)>";
    const post = await request(app)
      .post('/api/destinations/phewa-lake/comments')
      .set('Authorization', `Bearer ${token}`)
      .send({ text: payload });
    expect(post.status).toBe(201);
    expect(post.body.comment.text).toBe(payload); // stored verbatim, not executed

    const list = await request(app).get('/api/destinations/phewa-lake/comments');
    expect(list.body.comments[0].text).toBe(payload);
    // users table still present and usable
    expect((await signup()).res.status).toBe(201);
  });

  test('rating score rejects non-integer / non-numeric types', async () => {
    seedDestinations();
    const { token } = await signup();
    const bad = [{ a: 1 }, [5], true, null, '5 OR 1=1', '5;DROP TABLE ratings', 5.5, 'five', {}, 'F'];
    for (const score of bad) {
      const res = await request(app)
        .post('/api/destinations/phewa-lake/ratings')
        .set('Authorization', `Bearer ${token}`)
        .send({ score });
      expect(res.status).toBe(400);
    }
    const ok = await request(app)
      .post('/api/destinations/phewa-lake/ratings')
      .set('Authorization', `Bearer ${token}`)
      .send({ score: 4 });
    expect(ok.status).toBe(200);
    expect(ok.body.my_rating).toBe(4);
  });

  test('prototype pollution via JSON body is inert', async () => {
    const username = uniq('pp');
    const res = await request(app)
      .post('/api/auth/register')
      .set('Content-Type', 'application/json')
      .send(`{"__proto__":{"is_admin":true},"constructor":{"prototype":{"polluted":1}},"username":"${username}","email":"${username}@ex.com","password":"${GOOD_PW}"}`);
    expect(res.status).toBe(201);
    expect({}.is_admin).toBeUndefined();
    expect(Object.prototype.polluted).toBeUndefined();

    const me = await request(app).get('/api/users/me').set('Authorization', `Bearer ${res.body.token}`);
    expect(me.status).toBe(200);
    expect(me.body.user.is_admin).toBeUndefined();
  });
});

// =====================================================================
// 2. Authentication & token handling
// =====================================================================
describe('Sec/auth', () => {
  afterAll(() => cleanup());

  const protectedRoutes = [
    ['get', '/api/users/me'],
    ['post', '/api/destinations/phewa-lake/comments'],
    ['post', '/api/destinations/phewa-lake/ratings'],
    ['get', '/api/destinations/phewa-lake/my-rating'],
    ['delete', '/api/comments/1'],
  ];

  const hit = (app_, method, path, token) =>
    request(app_)[method](path).set('Authorization', `Bearer ${token}`).send({});

  test('every protected route rejects an unsigned (alg=none) token', async () => {
    for (const [m, p] of protectedRoutes) {
      const res = await hit(app, m, p, forgedNoneToken());
      expect(res.status).toBe(401);
      expect(LEAK_RE.test(bodyText(res))).toBe(false);
    }
  });

  test('tokens signed with another secret are rejected', async () => {
    const foreign = jwt.sign({ sub: 1, username: 'attacker' }, 'some-other-secret');
    for (const [m, p] of protectedRoutes) {
      expect((await hit(app, m, p, foreign)).status).toBe(401);
    }
  });

  test('the shipped default dev secret is not accepted in this environment', async () => {
    const devDefault = jwt.sign({ sub: 1, username: 'attacker' }, 'pokhara-tourism-dev-secret-change-me');
    const res = await hit(app, 'get', '/api/users/me', devDefault);
    expect(res.status).toBe(401); // fails loudly if JWT_SECRET was never configured
    expect(JWT_SECRET).not.toBe('pokhara-tourism-dev-secret-change-me');
  });

  test('expired tokens are rejected', async () => {
    const expired = jwt.sign({ sub: 1, username: 'x' }, JWT_SECRET, { expiresIn: '-10s' });
    for (const [m, p] of protectedRoutes) {
      expect((await hit(app, m, p, expired)).status).toBe(401);
    }
  });

  test('payload tampering invalidates the signature', async () => {
    const { token } = await signup();
    const [h, p, s] = token.split('.');
    const tampered = `${h}.${b64({ ...JSON.parse(Buffer.from(p, 'base64url').toString()), sub: 999 })}.${s}`;
    expect((await hit(app, 'get', '/api/users/me', tampered)).status).toBe(401);
  });

  test('malformed tokens are rejected without leaking internals', async () => {
    for (const bad of ['', 'abc', 'a.b.c', 'Bearer', 'null', '..', 'eyJhbGciOiJIUzI1NiJ9..x']) {
      const res = await request(app).get('/api/users/me').set('Authorization', `Bearer ${bad}`);
      expect(res.status).toBe(401);
      expect(LEAK_RE.test(bodyText(res))).toBe(false);
    }
  });

  test('auth scheme is case-insensitive per RFC 7235', async () => {
    const { token } = await signup();
    const res = await request(app).get('/api/users/me').set('Authorization', `bearer ${token}`);
    expect(res.status).toBe(200);
  });

  test('token is not accepted from a query string', async () => {
    const { token } = await signup();
    const res = await request(app).get(`/api/users/me?token=${token}&access_token=${token}`);
    expect(res.status).toBe(401);
  });

  test('unknown-but-valid-signature subject yields no data', async () => {
    const ghost = jwt.sign({ sub: 999999, username: 'ghost' }, JWT_SECRET);
    const res = await request(app).get('/api/users/me').set('Authorization', `Bearer ${ghost}`);
    expect([401, 404]).toContain(res.status);
    expect(res.body.user).toBeUndefined();
  });

  test('login failures are indistinguishable (no account enumeration)', async () => {
    const { username } = await signup();
    const unknown = await request(app).post('/api/auth/login').send({ identifier: uniq('nobody'), password: GOOD_PW });
    const wrong = await request(app).post('/api/auth/login').send({ identifier: username, password: 'Wrong-Passw0rd!' });
    expect(unknown.status).toBe(401);
    expect(wrong.status).toBe(401);
    expect(unknown.body).toEqual(wrong.body);
  });

  test('secret material never appears in auth responses', async () => {
    const { res } = await signup();
    expect(res.body.user.password_hash).toBeUndefined();
    expect(bodyText(res)).not.toMatch(/\$2[aby]\$/);
    const login = await request(app)
      .post('/api/auth/login')
      .send({ identifier: res.body.user.username, password: GOOD_PW });
    expect(login.body.user.password_hash).toBeUndefined();
  });
});

// =====================================================================
// 3. Authorization — IDOR & mass assignment
// =====================================================================
describe('Sec/authorization', () => {
  afterAll(() => cleanup());

  test('PATCH /api/users/me ignores privileged/immutable fields', async () => {
    seedDestinations();
    const a = await signup();
    const before = db.prepare('SELECT id,email,is_admin,password_hash FROM users WHERE username=?').get(a.username);

    const res = await request(app)
      .patch('/api/users/me')
      .set('Authorization', `Bearer ${a.token}`)
      .send({
        username: a.username,
        is_admin: 1,
        id: 1,
        email: 'attacker@evil.example',
        password_hash: '$2a$10$attacker',
        created_at: '1970-01-01',
        role: 'admin',
      });
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(before.email);
    expect(res.body.user.id).toBe(Number(before.id));

    const after = db.prepare('SELECT id,email,is_admin,password_hash FROM users WHERE username=?').get(a.username);
    expect(Number(after.is_admin)).toBe(Number(before.is_admin));
    expect(after.email).toBe(before.email);
    expect(after.password_hash).toBe(before.password_hash);
  });

  test('registration cannot self-assign admin', async () => {
    const username = uniq('adm');
    await request(app).post('/api/auth/register').send({
      username,
      email: `${username}@ex.com`,
      password: GOOD_PW,
      is_admin: 1,
      role: 'admin',
      email_verified: 1,
    });
    const row = db.prepare('SELECT is_admin,email_verified FROM users WHERE username=?').get(username);
    expect(Number(row.is_admin)).toBe(0);
    expect(Number(row.email_verified)).toBe(0);
  });

  test('IDOR: a user cannot delete another user\'s comment', async () => {
    seedDestinations();
    const a = await signup();
    const b = await signup();
    const post = await request(app)
      .post('/api/destinations/phewa-lake/comments')
      .set('Authorization', `Bearer ${a.token}`)
      .send({ text: 'belongs to A' });
    const del = await request(app)
      .delete(`/api/comments/${post.body.comment.id}`)
      .set('Authorization', `Bearer ${b.token}`);
    expect(del.status).toBe(403);
    const still = await request(app).get('/api/destinations/phewa-lake/comments');
    expect(still.body.count).toBeGreaterThanOrEqual(1);
  });

  test('no user-enumeration / admin surface is exposed', async () => {
    for (const path of ['/api/users', '/api/users/1', '/api/admin/products', '/api/users/me/../1']) {
      const res = await request(app).get(path);
      expect([401, 404]).toContain(res.status);
      expect(LEAK_RE.test(bodyText(res))).toBe(false);
    }
  });
});

// =====================================================================
// 4. Credential policy
// =====================================================================
describe('Sec/credentials', () => {
  afterAll(() => cleanup());

  const reject = async (password, pattern) => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ username: uniq('pw'), email: `${uniq('pw')}@ex.com`, password });
    expect(res.status).toBe(400);
    if (pattern) expect(res.body.error).toMatch(pattern);
    return res;
  };

  test('rejects passwords shorter than 8 characters', async () => {
    await reject('Sh0rt!', /8 characters/);
  });

  test('rejects over-long passwords (bounded hash input, no silent truncation)', async () => {
    await reject('A1'.repeat(100));           // 200 chars
    await reject('pässwörd'.repeat(12));      // > 72 bytes multi-byte
  });

  test('rejects all-numeric and all-whitespace passwords', async () => {
    await reject('12345678');
    await reject('        ');
    await reject('        ');  // whitespace-only, exactly 8
  });

  test('rejects common passwords', async () => {
    for (const pw of ['password', 'password123', 'qwertyui', 'letmein1', 'iloveyou', 'admin1234']) {
      await reject(pw);
    }
  });

  test('accepts a reasonable passphrase', async () => {
    const { res } = await signup({ password: 'Phewa-Lake-2019!' });
    expect(res.status).toBe(201);
  });

  test('stores a salted scrypt hash, never plaintext', async () => {
    const { username } = await signup({ password: 'Hash-Me-Please9!' });
    const row = db.prepare('SELECT password_hash FROM users WHERE username=?').get(username);
    expect(row.password_hash).not.toBe('Hash-Me-Please9!');
    expect(row.password_hash).toMatch(/^scrypt\$\d+\$\d+\$\d+\$/); // salted, self-describing format
    const [algo, N, r, p, salt] = row.password_hash.split('$');
    expect(Number(N)).toBeGreaterThanOrEqual(16384);
    expect(Buffer.from(salt, 'base64').length).toBeGreaterThanOrEqual(16);
  });

  test('weak usernames are rejected or normalized', async () => {
    for (const username of ['ab', 'a'.repeat(40), 'bad\u0000name', 'line\nbreak', '   ']) {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ username, email: `${uniq('u')}@ex.com`, password: GOOD_PW });
      expect(res.status).toBe(400);
    }
  });

  test('username uniqueness is case-insensitive (no impersonation)', async () => {
    const username = uniq('Case');
    await signup({ username });
    const res = await request(app)
      .post('/api/auth/register')
      .send({ username: username.toUpperCase(), email: `${uniq('c')}@ex.com`, password: GOOD_PW });
    expect(res.status).toBe(409);
  });
});

// =====================================================================
// 5. Security headers, CORS & information disclosure
// =====================================================================
describe('Sec/config', () => {
  afterAll(() => cleanup());

  test('security headers are present and the framework banner is gone', async () => {
    const res = await request(app).get('/api/health');
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBeDefined();
    expect(res.headers['referrer-policy']).toBeDefined();
    expect(res.headers['content-security-policy']).toBeDefined();
    expect(res.headers['strict-transport-security']).toBeDefined();
  });

  test('CORS never reflects a wildcard and restricts unknown origins', async () => {
    const evil = await request(app).get('/api/health').set('Origin', 'https://evil.example');
    expect(evil.headers['access-control-allow-origin']).toBeUndefined();

    const pre = await request(app)
      .options('/api/destinations')
      .set('Origin', 'https://evil.example')
      .set('Access-Control-Request-Method', 'GET');
    expect(pre.headers['access-control-allow-origin']).not.toBe('*');
  });

  test('error responses are JSON, never HTML stack traces', async () => {
    const cases = [
      await request(app).get('/api/does-not-exist'),
      await request(app).get('/definitely/not/here'),
      await request(app).post('/api/auth/login').set('Content-Type', 'application/json').send('{"broken": '),
      await request(app).put('/api/destinations/phewa-lake').send({ name: 'x' }),
    ];
    for (const res of cases) {
      expect(res.status).toBeLessThan(500);
      expect(isJson(res)).toBe(true);
      expect(LEAK_RE.test(bodyText(res))).toBe(false);
      expect(res.text || '').not.toMatch(/<html|<!DOCTYPE/i);
    }
  });

  test('oversized bodies are rejected as JSON 413, not a crash', async () => {
    const huge = 'x'.repeat(1_500_000); // > 1mb json limit
    const res = await request(app)
      .post('/api/auth/register')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ username: 'big', email: 'big@ex.com', password: huge }));
    expect([400, 413]).toContain(res.status);
    expect(isJson(res)).toBe(true);
  });

  test('pathologically nested JSON cannot crash the parser', async () => {
    const depth = 20000;
    const nested = '['.repeat(depth) + ']'.repeat(depth);
    const res = await request(app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send(nested);
    expect(res.status).toBeLessThan(500);
    expect(isJson(res)).toBe(true);
  });

  test('over-long query parameters are refused', async () => {
    const res = await request(app).get('/api/destinations').query({ q: 'a'.repeat(5000) });
    expect(res.status).toBe(400);
  });

  test('token-bearing responses are not cacheable', async () => {
    const { res } = await signup();
    expect(String(res.headers['cache-control'] || '')).toMatch(/no-store/);
    const login = await request(app)
      .post('/api/auth/login')
      .send({ identifier: res.body.user.username, password: GOOD_PW });
    expect(String(login.headers['cache-control'] || '')).toMatch(/no-store/);
  });
});

// =====================================================================
// 6. Static file serving — path traversal
// =====================================================================
describe('Sec/static', () => {
  afterAll(() => cleanup());

  test('traversal out of the static root is blocked', async () => {
    const paths = [
      '/assets/images/../../../.env',
      '/assets/images/....//....//.env',
      '/assets/%2e%2e%2f%2e%2e%2f.env',
      '/assets/images/%2e%2e%2f%2e%2e%2f%2e%2e%2f.env',
      '/assets/images/..%252f..%252f.env',
      '/../server/db.js',
      '/assets/../../server/data/tourism.db',
      '/assets/images/%2e%2e/%2e%2e/.env',
    ];
    for (const p of paths) {
      const res = await request(app).get(p);
      expect([400, 403, 404]).toContain(res.status);
      expect(bodyText(res)).not.toMatch(/JWT_SECRET|DATABASE|require\(/);
    }
  });

  test('no directory listing is exposed', async () => {
    for (const p of ['/assets/', '/assets/images/', '/']) {
      const res = await request(app).get(p);
      expect(bodyText(res)).not.toMatch(/Index of|Directory listing|<pre>/i);
    }
  });
});

// =====================================================================
// 7. Fuzz sweep — nothing weird may produce a 5xx
// =====================================================================
describe('Sec/fuzz', () => {
  afterAll(() => cleanup());

  const weird = [
    '', 'null', 'true', '[]', '{}', '"string"', '0',
    '{"a":"' + 'A'.repeat(2000) + '"}',
    '\u0000', 'ünïcödé', '🎉', '../../etc/passwd',
    '{"score":1e309}', '{"text":{"$ne":null}}', '{"identifier":{"$gt":""},"password":{"$gt":""}}',
  ];

  test('register/login survive hostile payloads (no 5xx, always JSON)', async () => {
    for (const raw of weird) {
      for (const path of ['/api/auth/register', '/api/auth/login']) {
        const res = await request(app)
          .post(path)
          .set('Content-Type', 'application/json')
          .send(raw);
        expect(res.status).toBeLessThan(500);
        expect(isJson(res)).toBe(true);
        expect(LEAK_RE.test(bodyText(res))).toBe(false);
      }
    }
  });

  test('write + lookup endpoints survive hostile payloads', async () => {
    const { token } = await signup();
    const paths = [
      ['post', '/api/destinations/phewa-lake/comments'],
      ['post', '/api/destinations/phewa-lake/ratings'],
      ['patch', '/api/users/me'],
    ];
    for (const raw of weird) {
      for (const [method, path] of paths) {
        const res = await request(app)[method](path)
          .set('Content-Type', 'application/json')
          .set('Authorization', `Bearer ${token}`)
          .send(raw);
        expect(res.status).toBeLessThan(500);
        expect(LEAK_RE.test(bodyText(res))).toBe(false);
      }
    }
    for (const id of ['abc', '-1', '0', '1e9', "' OR 1=1", '9999999999999999999999', '', '%00']) {
      const res = await request(app)
        .delete(`/api/comments/${encodeURIComponent(id)}`)
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBeLessThan(500);
    }
  });
});
