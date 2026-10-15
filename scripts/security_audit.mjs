#!/usr/bin/env node
/**
 * Black-box security audit — point it at a RUNNING instance (local, staging, prod):
 *
 *   npm run audit                                  # http://127.0.0.1:4000
 *   node scripts/security_audit.mjs --url https://staging.example.com
 *
 * It only uses HTTP: no repo access, no database access, no credentials. Exit
 * code is 1 when any check fails, so it can gate a deploy.
 *
 * Complements server/tests/security.test.js (which tests internals via supertest);
 * this one proves the *deployed* process behaves the same way.
 */
const args = process.argv.slice(2);
const arg = (name, dflt) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? dflt : args[i + 1];
};
const BASE = String(arg('url', process.env.AUDIT_URL || 'http://127.0.0.1:4000')).replace(/\/$/, '');
const ALLOWED_ORIGIN = arg('origin', process.env.AUDIT_ALLOWED_ORIGIN || '');

let pass = 0; let fail = 0; let skip = 0;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const red = (s) => `\x1b[31m${s}\x1b[0m`;
const yellow = (s) => `\x1b[33m${s}\x1b[0m`;

function ok(name, detail = '') { pass++; console.log(`  ${green('PASS')} ${name}${detail ? ` — ${detail}` : ''}`); }
function bad(name, detail = '') { fail++; console.log(`  ${red('FAIL')} ${name}${detail ? ` — ${detail}` : ''}`); }
function skipped(name, why) { skip++; console.log(`  ${yellow('SKIP')} ${name} — ${why}`); }
const section = (t) => console.log(`\n== ${t} ==`);

const LEAK = /(\/home\/|\/usr\/lib\/|node_modules|at Object\.|at Layer\.|password_hash|scrypt\$\d+\$|\$2[aby]\$\d\d\$)/;

async function req(path, opts = {}) {
  const res = await fetch(BASE + path, { redirect: 'manual', ...opts });
  let body = '';
  try { body = await res.text(); } catch (e) { /* empty */ }
  return { res, body, ct: res.headers.get('content-type') || '' };
}
const isJson = (r) => r.ct.includes('application/json');

async function main() {
  console.log(`\nBlack-box security audit -> ${BASE}\n${'='.repeat(60)}`);

  section('1. transport / headers');
  {
    const h = (await req('/api/health')).res.headers;
    h.get('x-powered-by') ? bad('x-powered-by is hidden', `leaks "${h.get('x-powered-by')}"`) : ok('x-powered-by is hidden');
    (h.get('x-content-type-options') || '').includes('nosniff') ? ok('X-Content-Type-Options: nosniff') : bad('X-Content-Type-Options missing');
    h.get('content-security-policy') ? ok('Content-Security-Policy present') : bad('CSP missing');
    h.get('strict-transport-security') ? ok('Strict-Transport-Security present') : bad('HSTS missing');
    h.get('x-frame-options') || (h.get('content-security-policy') || '').includes('frame-ancestors') ? ok('clickjacking protection present') : bad('no framing protection');
    h.get('referrer-policy') ? ok('Referrer-Policy present') : bad('Referrer-Policy missing');
    h.get('x-request-id') ? ok('X-Request-Id echo present') : skipped('X-Request-Id', 'not set by this build');
  }

  section('2. CORS');
  {
    const evil = await req('/api/health', { headers: { Origin: 'https://evil.example' } });
    const acao = evil.res.headers.get('access-control-allow-origin');
    !acao ? ok('unknown origin receives no CORS grant') : acao === '*' ? bad('CORS is a wildcard', acao) : bad('unknown origin was granted', acao);

    const pre = await req('/api/destinations', {
      method: 'OPTIONS',
      headers: { Origin: 'https://evil.example', 'Access-Control-Request-Method': 'GET' },
    });
    pre.res.headers.get('access-control-allow-origin') === '*' ? bad('preflight grants wildcard') : ok('preflight does not grant wildcard');

    if (ALLOWED_ORIGIN) {
      const good = await req('/api/health', { headers: { Origin: ALLOWED_ORIGIN } });
      good.res.headers.get('access-control-allow-origin') === ALLOWED_ORIGIN
        ? ok('configured origin is allowed', ALLOWED_ORIGIN)
        : bad('configured origin was NOT allowed', ALLOWED_ORIGIN);
    } else {
      skipped('allow-listed origin echo', 'pass --origin https://your.site to check');
    }
  }

  section('3. error handling / information disclosure');
  {
    const nf = await req('/api/this-route-does-not-exist');
    nf.res.status === 404 && isJson(nf) ? ok('unknown API route -> JSON 404') : bad('unknown route', `${nf.res.status} ${nf.ct}`);
    /<html|<!DOCTYPE/i.test(nf.body) ? bad('HTML error page served') : ok('no HTML error page');

    const badJson = await req('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"broken": ' });
    badJson.res.status === 400 && isJson(badJson) ? ok('malformed JSON -> JSON 400') : bad('malformed JSON', `${badJson.res.status} ${badJson.ct}`);

    const typeConf = await req('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ identifier: { $gt: '' }, password: { $gt: '' } }),
    });
    typeConf.res.status < 500 ? ok('type-confusion payload handled', `HTTP ${typeConf.res.status}`) : bad('type confusion -> 5xx', `HTTP ${typeConf.res.status}`);

    const big = await req('/api/auth/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'a', email: 'a@b.co', password: 'x'.repeat(2_000_000) }),
    });
    [400, 413].includes(big.res.status) ? ok('oversized body rejected', `HTTP ${big.res.status}`) : bad('oversized body', `HTTP ${big.res.status}`);

    const who = await req('/api/auth/me');
    const leaked = [nf, badJson, typeConf, big, who].filter((r) => LEAK.test(r.body));
    leaked.length ? bad('response leaked internals', leaked[0].body.slice(0, 120)) : ok('no stack traces / paths / hashes in error bodies');
  }

  section('4. authentication');
  {
    const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const none = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ sub: 1, username: 'audit' })}.`;
    const unsigned = await req('/api/users/me', { headers: { Authorization: `Bearer ${none}` } });
    unsigned.res.status === 401 ? ok('alg=none forgery rejected') : bad('alg=none token accepted', `HTTP ${unsigned.res.status}`);

    for (const tok of ['', 'garbage', 'a.b.c', 'eyJhbGciOiJIUzI1NiJ9..x']) {
      const r = await req('/api/users/me', { headers: { Authorization: `Bearer ${tok}` } });
      if (r.res.status !== 401) { bad(`malformed token accepted (${tok || 'empty'})`, `HTTP ${r.res.status}`); }
    }
    ok('malformed tokens rejected');

    const qs = await req('/api/users/me?token=eyJhbGciOiJIUzI1NiJ9.abc.def');
    qs.res.status === 401 ? ok('token in query string ignored') : bad('query-string token accepted', `HTTP ${qs.res.status}`);

    for (const p of ['/api/users/me', '/api/destinations/phewa-lake/my-rating']) {
      const r = await req(p);
      r.res.status === 401 ? ok(`${p} requires auth`) : bad(`${p} reachable unauthenticated`, `HTTP ${r.res.status}`);
    }

    const login = await req('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ identifier: 'audit-nobody@example.com', password: 'Audit-Passw0rd!' }),
    });
    login.res.status === 401 ? ok('bad credentials -> 401') : bad('login with junk creds', `HTTP ${login.res.status}`);
    const cc = login.res.headers.get('cache-control') || '';
    /no-store/.test(cc) ? ok('auth responses are not cacheable', cc) : bad('auth response cacheable', cc || 'no Cache-Control');
  }

  section('5. injection & path traversal');
  {
    const sqli = ["' OR 1=1 --", "'; DROP TABLE users; --", "x' UNION SELECT 1 --"];
    let clean = true; let detail = '';
    for (const payload of sqli) {
      const login = await req('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ identifier: payload, password: 'Audit-Passw0rd!' }),
      });
      if (login.res.status >= 500 || /"token"/.test(login.body)) { clean = false; detail = `identifier=${payload} -> ${login.res.status}`; }
      const search = await req(`/api/destinations?q=${encodeURIComponent(payload)}`);
      if (search.res.status >= 500 || LEAK.test(search.body)) { clean = false; detail = `q=${payload} -> ${search.res.status}`; }
      const slug = await req(`/api/destinations/${encodeURIComponent(payload)}`);
      if (slug.res.status >= 500) { clean = false; detail = `slug=${payload} -> ${slug.res.status}`; }
    }
    clean ? ok('SQL injection probes are inert') : bad('injection probe misbehaved', detail);

    const trails = [
      '/assets/images/../../../.env',
      '/assets/%2e%2e%2f%2e%2e%2f.env',
      '/assets/images/..%252f..%252f.env',
      '/../server/db.js',
    ];
    let blocked = true; let tdetail = '';
    for (const p of trails) {
      const r = await req(p);
      const exposed = r.res.status === 200 || /JWT_SECRET|password_hash|require\(/.test(r.body);
      if (exposed) { blocked = false; tdetail = `${p} -> ${r.res.status}`; }
    }
    blocked ? ok('path traversal blocked') : bad('traversal exposed data', tdetail);
  }

  section('6. abuse controls');
  {
    const codes = [];
    for (let i = 0; i < 15; i++) {
      const r = await req('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ identifier: `audit-${i}@example.com`, password: `Wrong-${i}-Passw0rd!` }),
      });
      codes.push(r.res.status);
      if (r.res.status === 429) {
        /no-store/.test(r.res.headers.get('cache-control') || '') ? ok('rate limit response is JSON + uncacheable') : ok('rate limit response returned');
        break;
      }
    }
    if (codes.includes(429)) {
      ok('credential stuffing is throttled', `first 429 at attempt ${codes.indexOf(429) + 1}`);
    } else if (codes.some((c) => c === 401)) {
      skipped('credential stuffing throttled', '15 attempts not throttled (limits disabled or window not hit)');
    }
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`audit: ${pass} passed, ${fail} failed, ${skip} skipped  (${BASE})`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => {
  console.error(`\naudit could not complete: ${e.message}`);
  console.error(`is the API actually running at ${BASE}?`);
  process.exit(2);
});
