const request = require('supertest');
const { app, db, seedDestinations, cleanup } = require('./setup');

// ---------- helpers ----------
function uniq() { return 'u' + Math.random().toString(36).slice(2, 9); }
async function registerUser() {
  const username = uniq();
  const res = await request(app).post('/api/auth/register')
    .send({ username, email: username + '@ex.com', password: 'secret123' });
  return { username, token: res.body.token };
}

// ================= AUTH =================
describe('Auth', () => {
  beforeEach(() => { db.exec('DELETE FROM users;'); });
  afterAll(() => cleanup());

  test('registers a user and returns a JWT + safe user object', async () => {
    const username = uniq();
    const res = await request(app).post('/api/auth/register')
      .send({ username, email: username + '@ex.com', password: 'secret123' });
    expect(res.status).toBe(201);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.username).toBe(username);
    expect(res.body.user.password_hash).toBeUndefined();
  });

  test('rejects registration with short password', async () => {
    const res = await request(app).post('/api/auth/register')
      .send({ username: uniq(), email: 'x@ex.com', password: '123' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/6 characters/);
  });

  test('rejects registration with invalid email', async () => {
    const res = await request(app).post('/api/auth/register')
      .send({ username: uniq(), email: 'not-an-email', password: 'secret123' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/email/);
  });

  test('rejects duplicate username/email with 409', async () => {
    const username = uniq();
    await request(app).post('/api/auth/register').send({ username, email: username + '@ex.com', password: 'secret123' });
    const res = await request(app).post('/api/auth/register').send({ username, email: 'other@ex.com', password: 'secret123' });
    expect(res.status).toBe(409);
  });

  test('logs in with username and returns a token', async () => {
    const username = uniq();
    await request(app).post('/api/auth/register').send({ username, email: username + '@ex.com', password: 'secret123' });
    const res = await request(app).post('/api/auth/login').send({ identifier: username, password: 'secret123' });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
  });

  test('logs in with email too', async () => {
    const username = uniq();
    const email = username + '@ex.com';
    await request(app).post('/api/auth/register').send({ username, email, password: 'secret123' });
    const res = await request(app).post('/api/auth/login').send({ identifier: email, password: 'secret123' });
    expect(res.status).toBe(200);
  });

  test('rejects login with wrong password (401)', async () => {
    const username = uniq();
    await request(app).post('/api/auth/register').send({ username, email: username + '@ex.com', password: 'secret123' });
    const res = await request(app).post('/api/auth/login').send({ identifier: username, password: 'wrongpass' });
    expect(res.status).toBe(401);
  });

  test('GET /api/auth/me requires a valid token', async () => {
    const noToken = await request(app).get('/api/auth/me');
    expect(noToken.status).toBe(401);
    const { token } = await registerUser();
    const ok = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
    expect(ok.status).toBe(200);
    expect(ok.body.user.username).toBeDefined();
  });
});

// ================= DESTINATIONS =================
describe('Destinations', () => {
  beforeEach(() => seedDestinations());
  afterAll(() => cleanup());

  test('lists all seeded destinations with stats attached', async () => {
    const res = await request(app).get('/api/destinations');
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(3);
    expect(res.body.destinations[0]).toHaveProperty('avg_rating');
    expect(res.body.destinations[0]).toHaveProperty('comment_count');
  });

  test('filters by category', async () => {
    const res = await request(app).get('/api/destinations?category=Lake');
    expect(res.body.count).toBe(1);
    expect(res.body.destinations[0].slug).toBe('phewa-lake');
  });

  test('filters by search query (q)', async () => {
    const res = await request(app).get('/api/destinations?q=paragliding');
    expect(res.body.count).toBeGreaterThanOrEqual(1);
    expect(res.body.destinations.some((d) => d.slug === 'sarangkot')).toBe(true);
  });

  test('returns a single destination by slug with stats', async () => {
    const res = await request(app).get('/api/destinations/phewa-lake');
    expect(res.status).toBe(200);
    expect(res.body.destination.name).toBe('Phewa Lake');
    expect(res.body.destination).toHaveProperty('my_rating');
  });

  test('404 for unknown slug', async () => {
    const res = await request(app).get('/api/destinations/does-not-exist');
    expect(res.status).toBe(404);
  });
});

// ================= RATINGS =================
describe('Ratings', () => {
  beforeEach(() => seedDestinations());
  afterAll(() => cleanup());

  test('requires auth to post a rating', async () => {
    const res = await request(app).post('/api/destinations/phewa-lake/ratings').send({ score: 5 });
    expect(res.status).toBe(401);
  });

  test('rejects out-of-range scores', async () => {
    const { token } = await registerUser();
    const res = await request(app).post('/api/destinations/phewa-lake/ratings')
      .set('Authorization', `Bearer ${token}`).send({ score: 9 });
    expect(res.status).toBe(400);
  });

  test('posts a rating and updates the average', async () => {
    const { token } = await registerUser();
    const res = await request(app).post('/api/destinations/phewa-lake/ratings')
      .set('Authorization', `Bearer ${token}`).send({ score: 4 });
    expect(res.status).toBe(200);
    expect(res.body.avg).toBe(4);
    expect(res.body.rating_count).toBe(1);
    expect(res.body.my_rating).toBe(4);
  });

  test('upserts a rating (count stays 1, value changes)', async () => {
    const { token } = await registerUser();
    await request(app).post('/api/destinations/phewa-lake/ratings').set('Authorization', `Bearer ${token}`).send({ score: 5 });
    const res = await request(app).post('/api/destinations/phewa-lake/ratings').set('Authorization', `Bearer ${token}`).send({ score: 2 });
    expect(res.body.rating_count).toBe(1);
    expect(res.body.avg).toBe(2);
  });

  test('summary endpoint computes average + distribution', async () => {
    const a = await registerUser();
    const b = await registerUser();
    await request(app).post('/api/destinations/sarangkot/ratings').set('Authorization', `Bearer ${a.token}`).send({ score: 5 });
    await request(app).post('/api/destinations/sarangkot/ratings').set('Authorization', `Bearer ${b.token}`).send({ score: 3 });
    const res = await request(app).get('/api/destinations/sarangkot/ratings');
    expect(res.body.count).toBe(2);
    expect(res.body.avg).toBe(4);
    expect(res.body.distribution[5]).toBe(1);
    expect(res.body.distribution[3]).toBe(1);
  });

  test('404 when rating a missing destination', async () => {
    const { token } = await registerUser();
    const res = await request(app).post('/api/destinations/nope/ratings').set('Authorization', `Bearer ${token}`).send({ score: 3 });
    expect(res.status).toBe(404);
  });
});

// ================= COMMENTS =================
describe('Comments', () => {
  beforeEach(() => seedDestinations());
  afterAll(() => cleanup());

  test('requires auth to post a comment', async () => {
    const res = await request(app).post('/api/destinations/phewa-lake/comments').send({ text: 'lovely' });
    expect(res.status).toBe(401);
  });

  test('rejects too-short comments', async () => {
    const { token } = await registerUser();
    const res = await request(app).post('/api/destinations/phewa-lake/comments').set('Authorization', `Bearer ${token}`).send({ text: 'x' });
    expect(res.status).toBe(400);
  });

  test('posts a comment and appears in the list', async () => {
    const { token, username } = await registerUser();
    const post = await request(app).post('/api/destinations/phewa-lake/comments').set('Authorization', `Bearer ${token}`).send({ text: 'Beautiful at sunrise!' });
    expect(post.status).toBe(201);
    expect(post.body.comment.username).toBe(username);
    const list = await request(app).get('/api/destinations/phewa-lake/comments');
    expect(list.body.count).toBe(1);
    expect(list.body.comments[0].text).toBe('Beautiful at sunrise!');
  });

  test('owner can delete their comment', async () => {
    const { token } = await registerUser();
    const post = await request(app).post('/api/destinations/phewa-lake/comments').set('Authorization', `Bearer ${token}`).send({ text: 'delete me' });
    const id = post.body.comment.id;
    const del = await request(app).delete(`/api/comments/${id}`).set('Authorization', `Bearer ${token}`);
    expect(del.status).toBe(200);
    const list = await request(app).get('/api/destinations/phewa-lake/comments');
    expect(list.body.count).toBe(0);
  });

  test('another user cannot delete my comment (403)', async () => {
    const a = await registerUser();
    const b = await registerUser();
    const post = await request(app).post('/api/destinations/phewa-lake/comments').set('Authorization', `Bearer ${a.token}`).send({ text: 'mine' });
    const del = await request(app).delete(`/api/comments/${post.body.comment.id}`).set('Authorization', `Bearer ${b.token}`);
    expect(del.status).toBe(403);
  });

  test('404 deleting a missing comment', async () => {
    const { token } = await registerUser();
    const res = await request(app).delete('/api/comments/999999').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });
});

// ================= USERS / PROFILE =================
describe('User profile', () => {
  beforeEach(() => seedDestinations());
  afterAll(() => cleanup());

  test('GET /api/users/me returns ratings + comments + stats', async () => {
    const { token } = await registerUser();
    await request(app).post('/api/destinations/phewa-lake/ratings').set('Authorization', `Bearer ${token}`).send({ score: 5 });
    await request(app).post('/api/destinations/phewa-lake/comments').set('Authorization', `Bearer ${token}`).send({ text: 'great spot' });
    const res = await request(app).get('/api/users/me').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.stats.ratings_given).toBe(1);
    expect(res.body.stats.comments_made).toBe(1);
    expect(res.body.myRatings).toHaveLength(1);
    expect(res.body.myComments).toHaveLength(1);
  });

  test('PATCH /api/users/me updates bio and username', async () => {
    const { token, username } = await registerUser();
    const newName = 'traveler_' + Math.random().toString(36).slice(2, 7);
    const res = await request(app).patch('/api/users/me').set('Authorization', `Bearer ${token}`)
      .send({ bio: 'I love Pokhara', username: newName });
    expect(res.status).toBe(200);
    expect(res.body.user.bio).toBe('I love Pokhara');
    expect(res.body.user.username).toBe(newName);
  });

  test('PATCH rejects a too-short username (400)', async () => {
    const { token } = await registerUser();
    const res = await request(app).patch('/api/users/me').set('Authorization', `Bearer ${token}`).send({ username: 'ab' });
    expect(res.status).toBe(400);
  });

  test('PATCH rejects a username taken by another user (409)', async () => {
    const a = await registerUser();
    const b = await registerUser();
    const res = await request(app).patch('/api/users/me').set('Authorization', `Bearer ${b.token}`).send({ username: a.username });
    expect(res.status).toBe(409);
  });
});
