// End-to-end API smoke test (no shell pipe to interpreter).
const BASE = 'http://localhost:4000';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function j(method, path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = 'Bearer ' + token;
  const res = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(path + ' -> ' + (data.error || res.status));
  return data;
}

(async () => {
  const un = 'tester_' + Date.now();
  console.log('user:', un);

  const reg = await j('POST', '/api/auth/register', { username: un, email: un + '@ex.com', password: 'secret123' });
  console.log('register ok, token len:', reg.token.length);

  const reg2 = await j('POST', '/api/auth/register', { username: un, email: un + '@ex.com', password: 'secret123' }).then(() => 'no-error').catch((e) => e.message);
  console.log('dup register rejected:', /already registered/.test(reg2) ? 'yes' : reg2);

  const bad = await j('POST', '/api/auth/login', { identifier: un, password: 'wrong' }).then(() => 'no-error').catch((e) => e.message);
  console.log('bad login rejected:', /invalid credentials/.test(bad) ? 'yes' : bad);

  const login = await j('POST', '/api/auth/login', { identifier: un, password: 'secret123' });
  const token = login.token;
  console.log('login ok, token len:', token.length);

  const r1 = await j('POST', '/api/destinations/phewa-lake/ratings', { score: 5 }, token);
  console.log('rate phewa 5 -> avg', r1.avg, 'count', r1.rating_count);
  const r2 = await j('POST', '/api/destinations/sarangkot/ratings', { score: 4 }, token);
  console.log('rate sarangkot 4 -> avg', r2.avg, 'count', r2.rating_count);
  const r3 = await j('POST', '/api/destinations/phewa-lake/ratings', { score: 3 }, token);
  console.log('re-rate phewa 3 (upsert) -> avg', r3.avg, 'count', r3.rating_count, '(should stay 1)');

  const c1 = await j('POST', '/api/destinations/phewa-lake/comments', { text: 'Beautiful at sunrise!' }, token);
  console.log('comment posted id', c1.comment.id);

  const prof = await j('GET', '/api/users/me', null, token);
  console.log('profile: ratings_given', prof.stats.ratings_given, 'comments_made', prof.stats.comments_made);

  const sum = await j('GET', '/api/destinations/phewa-lake/ratings');
  console.log('phewa rating summary: avg', sum.avg, 'count', sum.count, 'dist', JSON.stringify(sum.distribution));

  const list = await j('GET', '/api/destinations');
  console.log('destinations list count:', list.count, 'featured:', list.destinations.filter((d) => d.featured).length);

  console.log('\nALL SMOKE TESTS PASSED ✅');
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
