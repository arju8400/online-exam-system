const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const client = require('prom-client');

function createApp({ dataFile } = {}) {
  const app = express();
  app.use(express.json());

  // ---------- Metrics (Prometheus) ----------
  const register = new client.Registry();
  client.collectDefaultMetrics({ register });
  const httpReqs = new client.Counter({
    name: 'http_requests_total', help: 'Total HTTP requests',
    labelNames: ['method', 'route', 'status'], registers: [register]
  });
  const loginCount = new client.Counter({
    name: 'exam_logins_total', help: 'Login attempts',
    labelNames: ['result'], registers: [register]
  });
  const submissions = new client.Counter({
    name: 'exam_submissions_total', help: 'Exams submitted', registers: [register]
  });
  app.use((req, res, next) => {
    res.on('finish', () => {
      const route = req.route ? req.route.path : req.path;
      if (route !== '/metrics') httpReqs.inc({ method: req.method, route, status: res.statusCode });
    });
    next();
  });

  // ---------- Data ----------
  const users = {
    admin: { password: process.env.ADMIN_PASSWORD || 'admin123', role: 'admin' },
    student: { password: process.env.STUDENT_PASSWORD || 'student123', role: 'student' }
  };
  let db = {
    exams: [
      {
        id: 1, title: 'DevOps Basics', duration: 10,
        questions: [
          { q: 'Which tool is used for containerization?', options: ['Docker', 'Git', 'Jenkins', 'Grafana'], answer: 0 },
          { q: 'CI stands for?', options: ['Code Island', 'Continuous Integration', 'Central Image', 'Cloud Interface'], answer: 1 },
          { q: 'Which tool collects metrics?', options: ['Prometheus', 'Docker', 'GitHub', 'Maven'], answer: 0 },
          { q: 'Which tool shows dashboards?', options: ['Git', 'Grafana', 'npm', 'Node'], answer: 1 },
          { q: 'Which file defines how a Docker image is built?', options: ['Dockerfile', 'package.json', 'README.md', '.gitignore'], answer: 0 },
          { q: 'Which command creates a new Git commit?', options: ['git push', 'git commit', 'git clone', 'git init'], answer: 1 },
          { q: 'GitHub Actions workflows are written in which format?', options: ['XML', 'YAML', 'CSV', 'SQL'], answer: 1 },
          { q: 'Default port of Prometheus is?', options: ['80', '3000', '9090', '8081'], answer: 2 },
          { q: 'Which command starts all services in docker-compose?', options: ['docker compose up', 'docker pull', 'git status', 'npm init'], answer: 0 },
          { q: 'Jest is mainly used for?', options: ['Monitoring', 'Testing', 'Containerization', 'Hosting'], answer: 1 }
        ]
      }
    ],
    results: []
  };
  if (dataFile && fs.existsSync(dataFile)) {
    try { db = JSON.parse(fs.readFileSync(dataFile, 'utf8')); } catch (e) { /* ignore bad file */ }
  }
  const save = () => {
    if (!dataFile) return;
    fs.mkdirSync(path.dirname(dataFile), { recursive: true });
    fs.writeFileSync(dataFile, JSON.stringify(db, null, 2));
  };

  const sessions = new Map(); // token -> {username, role}

  const auth = (roles) => (req, res, next) => {
    const token = (req.headers.authorization || '').replace('Bearer ', '');
    const s = sessions.get(token);
    if (!s) return res.status(401).json({ error: 'Unauthorized' });
    if (roles && !roles.includes(s.role)) return res.status(403).json({ error: 'Forbidden' });
    req.user = s;
    next();
  };

  // ---------- Routes ----------
  app.get('/health', (req, res) => res.json({ status: 'ok' }));

  app.get('/metrics', async (req, res) => {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  });

  app.post('/api/login', (req, res) => {
    const { username, password } = req.body || {};
    const u = users[username];
    if (!u || u.password !== password) {
      loginCount.inc({ result: 'fail' });
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    loginCount.inc({ result: 'success' });
    const token = crypto.randomBytes(16).toString('hex');
    sessions.set(token, { username, role: u.role });
    res.json({ token, username, role: u.role });
  });

  app.get('/api/exams', auth(), (req, res) => {
    res.json(db.exams.map(e => ({ id: e.id, title: e.title, duration: e.duration, totalQuestions: e.questions.length })));
  });

  app.get('/api/exams/:id', auth(), (req, res) => {
    const e = db.exams.find(x => x.id === Number(req.params.id));
    if (!e) return res.status(404).json({ error: 'Exam not found' });
    res.json({
      id: e.id, title: e.title, duration: e.duration,
      questions: e.questions.map(({ q, options }) => ({ q, options })) // answers hidden
    });
  });

  app.post('/api/exams/:id/submit', auth(['student']), (req, res) => {
    const e = db.exams.find(x => x.id === Number(req.params.id));
    if (!e) return res.status(404).json({ error: 'Exam not found' });
    const answers = (req.body && req.body.answers) || [];
    let score = 0;
    e.questions.forEach((q, i) => { if (answers[i] === q.answer) score++; });
    const result = {
      username: req.user.username, examId: e.id, examTitle: e.title,
      score, total: e.questions.length, date: new Date().toISOString()
    };
    db.results.push(result);
    save();
    submissions.inc();
    res.json(result);
  });

  app.post('/api/exams', auth(['admin']), (req, res) => {
    const { title, duration, questions } = req.body || {};
    if (!title || !Array.isArray(questions) || questions.length === 0) {
      return res.status(400).json({ error: 'title and questions required' });
    }
    const exam = { id: db.exams.length + 1, title, duration: Number(duration) || 10, questions };
    db.exams.push(exam);
    save();
    res.status(201).json({ id: exam.id, title: exam.title });
  });

  app.get('/api/results', auth(), (req, res) => {
    const list = req.user.role === 'admin' ? db.results : db.results.filter(r => r.username === req.user.username);
    res.json(list);
  });

  app.use(express.static(path.join(__dirname, '..', 'public')));
  return app;
}

module.exports = createApp;
