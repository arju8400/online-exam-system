const request = require('supertest');
const createApp = require('../src/app');

const app = createApp();
let studentToken, adminToken;

beforeAll(async () => {
  studentToken = (await request(app).post('/api/login').send({ username: 'student', password: 'student123' })).body.token;
  adminToken = (await request(app).post('/api/login').send({ username: 'admin', password: 'admin123' })).body.token;
});

test('health endpoint works', async () => {
  const r = await request(app).get('/health');
  expect(r.statusCode).toBe(200);
  expect(r.body.status).toBe('ok');
});

test('login fails with wrong password', async () => {
  const r = await request(app).post('/api/login').send({ username: 'student', password: 'wrong' });
  expect(r.statusCode).toBe(401);
});

test('exams need authentication', async () => {
  expect((await request(app).get('/api/exams')).statusCode).toBe(401);
});

test('exam questions do not leak answers', async () => {
  const r = await request(app).get('/api/exams/1').set('Authorization', `Bearer ${studentToken}`);
  expect(r.statusCode).toBe(200);
  expect(r.body.questions[0].answer).toBeUndefined();
});

test('student submit gives correct score', async () => {
  const r = await request(app).post('/api/exams/1/submit')
    .set('Authorization', `Bearer ${studentToken}`).send({ answers: [0, 1, 0, 1] });
  expect(r.body.score).toBe(4);
});

test('student cannot create exam, admin can', async () => {
  const body = { title: 'T', duration: 5, questions: [{ q: 'a?', options: ['x', 'y'], answer: 0 }] };
  expect((await request(app).post('/api/exams').set('Authorization', `Bearer ${studentToken}`).send(body)).statusCode).toBe(403);
  expect((await request(app).post('/api/exams').set('Authorization', `Bearer ${adminToken}`).send(body)).statusCode).toBe(201);
});

test('metrics endpoint exposes custom metrics', async () => {
  const r = await request(app).get('/metrics');
  expect(r.text).toContain('exam_submissions_total');
  expect(r.text).toContain('http_requests_total');
});
