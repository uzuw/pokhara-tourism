/**
 * Abuse / rate-limiting suite.
 *
 * Kept in its own file because Jest gives each test file a fresh module
 * registry — so the limiter buckets here never poison the functional suites.
 * Limits are deliberately tiny so the assertions are fast and deterministic.
 */
process.env.AUTH_RATE_MAX = '5';
process.env.AUTH_RATE_WINDOW_MS = '60000';
process.env.REGISTER_RATE_MAX = '5';
process.env.REGISTER_RATE_WINDOW_MS = '60000';
process.env.WRITE_RATE_MAX = '8';
process.env.WRITE_RATE_WINDOW_MS = '60000';

const request = require('supertest');
const { app, seedDestinations, cleanup } = require('./setup');

jest.setTimeout(30000);

const isJson = (res) => String(res.headers['content-type'] || '').includes('application/json');
const GOOD_PW = 'Str0ng-Passw0rd!';

describe('Sec/abuse', () => {
  afterAll(() => cleanup());

  test('credential stuffing on /api/auth/login is throttled quickly', async () => {
    const codes = [];
    let firstBlocked = -1;
    let blockedRes = null;
    for (let i = 0; i < 20; i++) {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ identifier: 'victim@ex.com', password: `wrong-${i}` });
      codes.push(res.status);
      if (res.status === 429 && firstBlocked === -1) { firstBlocked = i; blockedRes = res; }
    }
    const throttled = codes.filter((c) => c === 429).length;
    expect(blockedRes).not.toBeNull();
    expect(isJson(blockedRes)).toBe(true);
    expect(blockedRes.body.error).toMatch(/too many/i);
    // must block within the configured budget, not "eventually"
    expect(firstBlocked).toBeLessThanOrEqual(6);
    expect(throttled).toBeGreaterThanOrEqual(10);
  });

  test('registration is throttled from the same bucket', async () => {
    const codes = [];
    for (let i = 0; i < 10; i++) {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ username: `burst${i}`, email: `burst${i}@ex.com`, password: GOOD_PW });
      codes.push(res.status);
    }
    expect(codes).toContain(429);
  });

  test('write endpoints throttle flood posting', async () => {
    seedDestinations();
    // register straight into the DB via a fresh app-side limiter bucket is not
    // possible, so obtain a token from a non-throttled read of the same store:
    // /api/auth/login is throttled, but the register above already 429s — use
    // the health endpoint to prove the limiter is scoped, then flood an
    // unauthenticated write to observe the write bucket.
    const codes = [];
    let blocked = null;
    for (let i = 0; i < 20; i++) {
      const res = await request(app)
        .post('/api/destinations/phewa-lake/comments')
        .send({ text: `flood ${i}` });
      codes.push(res.status);
      if (res.status === 429 && !blocked) blocked = res;
    }
    expect(blocked).not.toBeNull();
    expect(isJson(blocked)).toBe(true);
    // 401 (unauthenticated) before the bucket fills, 429 after — never a 5xx
    expect(codes.every((c) => c < 500)).toBe(true);
  });

  test('reads are not throttled by the write bucket', async () => {
    for (let i = 0; i < 25; i++) {
      const res = await request(app).get('/api/destinations');
      expect(res.status).toBe(200);
    }
  });
});
