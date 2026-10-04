let token = null, role = null, user = '';
let exam = null, cur = 0, answers = [], visited = [], marked = [];
let timerId = null, violations = 0, examActive = false;
const MAX_VIOLATIONS = 3;
const $ = id => document.getElementById(id);
const screens = ['login-view', 'home-view', 'instr-view', 'exam-view', 'result-view'];
const show = id => screens.forEach(v => $(v).classList.toggle('hidden', v !== id));

async function api(url, method = 'GET', body) {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Error');
  return data;
}
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };

/* ---------- Login / Home ---------- */
$('login-btn').onclick = async () => {
  try {
    const d = await api('/api/login', 'POST', { username: $('username').value.trim(), password: $('password').value });
    token = d.token; role = d.role; user = d.username;
    $('who').textContent = `${d.username} (${d.role})`;
    $('userbar').classList.remove('hidden');
    $('admin-panel').classList.toggle('hidden', role !== 'admin');
    $('login-err').textContent = '';
    loadHome();
  } catch (e) { $('login-err').textContent = e.message; }
};
$('password').addEventListener('keydown', e => { if (e.key === 'Enter') $('login-btn').click(); });
$('logout').onclick = () => { token = null; examActive = false; clearInterval(timerId); $('userbar').classList.add('hidden'); show('login-view'); };

async function loadHome() {
  show('home-view');
  const exams = await api('/api/exams');
  $('exam-list').innerHTML = '';
  exams.forEach(e => {
    const d = el('div', 'exam-item');
    const info = el('div');
    info.appendChild(el('b', '', e.title));
    info.appendChild(el('div', 'muted small', `${e.totalQuestions} questions • ${e.duration} minutes`));
    d.appendChild(info);
    if (role === 'student') {
      const b = el('button', 'btn primary', 'Start Exam');
      b.onclick = () => openInstructions(e.id);
      d.appendChild(b);
    }
    $('exam-list').appendChild(d);
  });
  const results = await api('/api/results');
  const box = $('results'); box.innerHTML = '';
  if (!results.length) { box.appendChild(el('p', 'muted', 'No attempts yet.')); return; }
  const t = el('table');
  t.innerHTML = '<tr><th>Candidate</th><th>Exam</th><th>Score</th><th>Date</th></tr>';
  results.forEach(r => {
    const tr = el('tr');
    [r.username, r.examTitle, `${r.score}/${r.total}`, new Date(r.date).toLocaleString()].forEach(x => tr.appendChild(el('td', '', x)));
    t.appendChild(tr);
  });
  box.appendChild(t);
}

/* ---------- Instructions ---------- */
async function openInstructions(id) {
  exam = await api('/api/exams/' + id);
  $('instr-title').textContent = exam.title;
  $('instr-meta').textContent = `Duration: ${exam.duration} minutes • Total Questions: ${exam.questions.length}`;
  $('agree').checked = false; $('begin-btn').disabled = true;
  show('instr-view');
}
$('agree').onchange = () => { $('begin-btn').disabled = !$('agree').checked; };
$('back-home').onclick = loadHome;

/* ---------- Exam ---------- */
$('begin-btn').onclick = () => {
  const n = exam.questions.length;
  answers = Array(n).fill(-1); visited = Array(n).fill(false); marked = Array(n).fill(false);
  cur = 0; violations = 0; examActive = true;
  $('exam-title').textContent = exam.title;
  $('exam-sub').textContent = `Total Questions: ${n}`;
  $('cand-name').textContent = user;
  $('warn').classList.add('hidden');
  try { document.documentElement.requestFullscreen && document.documentElement.requestFullscreen(); } catch (e) { /* ignore */ }
  show('exam-view');
  startTimer(exam.duration * 60);
  buildPalette(); gotoQ(0);
};

function startTimer(secs) {
  clearInterval(timerId);
  const tick = () => {
    const m = String(Math.floor(secs / 60)).padStart(2, '0'), s = String(secs % 60).padStart(2, '0');
    $('timer').textContent = `${m}:${s}`;
    $('timer').classList.toggle('low', secs <= 60);
    if (secs <= 0) { clearInterval(timerId); finalSubmit(true); }
    secs--;
  };
  tick(); timerId = setInterval(tick, 1000);
}

function status(i) {
  if (marked[i]) return 'mr';
  if (answers[i] >= 0) return 'an';
  return visited[i] ? 'na' : 'nv';
}
function buildPalette() {
  const p = $('palette'); p.innerHTML = '';
  exam.questions.forEach((_, i) => {
    const b = el('button', 'pbtn ' + status(i), String(i + 1));
    if (i === cur) b.classList.add('cur');
    b.onclick = () => gotoQ(i);
    p.appendChild(b);
  });
  const c = { nv: 0, na: 0, an: 0, mr: 0 };
  exam.questions.forEach((_, i) => c[status(i)]++);
  ['nv', 'na', 'an', 'mr'].forEach(k => $('c-' + k).textContent = c[k]);
}
function gotoQ(i) {
  cur = i; visited[i] = true;
  const q = exam.questions[i];
  $('q-no').textContent = `Question ${i + 1} of ${exam.questions.length}`;
  $('q-flag').classList.toggle('hidden', !marked[i]);
  $('q-text').textContent = q.q;
  const box = $('q-options'); box.innerHTML = '';
  q.options.forEach((o, j) => {
    const d = el('div', 'opt' + (answers[i] === j ? ' sel' : ''));
    const r = el('input'); r.type = 'radio'; r.name = 'opt'; r.checked = answers[i] === j;
    d.appendChild(r); d.appendChild(el('span', '', `${String.fromCharCode(65 + j)}. ${o}`));
    d.onclick = () => { answers[i] = j; gotoQ(i); };
    box.appendChild(d);
  });
  $('btn-prev').disabled = i === 0;
  buildPalette();
}
const next = () => { if (cur < exam.questions.length - 1) gotoQ(cur + 1); else buildPalette(); };
$('btn-save').onclick = () => { marked[cur] = false; next(); };
$('btn-mark').onclick = () => { marked[cur] = true; next(); };
$('btn-clear').onclick = () => { answers[cur] = -1; marked[cur] = false; gotoQ(cur); };
$('btn-prev').onclick = () => { if (cur > 0) gotoQ(cur - 1); };

/* ---------- Submit ---------- */
$('btn-submit').onclick = () => {
  const n = exam.questions.length;
  const answered = answers.filter(a => a >= 0).length;
  const mk = marked.filter(Boolean).length;
  $('modal-summary').innerHTML = '';
  [['Total Questions', n], ['Answered', answered], ['Not Answered', n - answered], ['Marked for Review', mk]].forEach(([k, v]) => {
    $('modal-summary').appendChild(el('p', '', `${k}: ${v}`));
  });
  $('modal').classList.remove('hidden');
};
$('modal-cancel').onclick = () => $('modal').classList.add('hidden');
$('modal-ok').onclick = () => finalSubmit(false);

async function finalSubmit(auto) {
  if (!examActive) return;
  examActive = false; clearInterval(timerId);
  $('modal').classList.add('hidden');
  try { if (document.fullscreenElement) document.exitFullscreen(); } catch (e) { /* ignore */ }
  try {
    const r = await api(`/api/exams/${exam.id}/submit`, 'POST', { answers });
    showResult(r, auto);
  } catch (e) { alert(e.message); }
}
function showResult(r, auto) {
  const pct = Math.round((r.score / r.total) * 100);
  const box = $('result-card'); box.innerHTML = '';
  if (auto) box.appendChild(el('p', 'err', 'Exam was auto-submitted (time over / rule violation).'));
  box.appendChild(el('div', 'big-score', `${r.score} / ${r.total}`));
  box.appendChild(el('p', '', `Percentage: ${pct}%`));
  box.appendChild(el('p', pct >= 40 ? 'pass' : 'fail', pct >= 40 ? 'RESULT: PASS' : 'RESULT: FAIL'));
  box.appendChild(el('p', 'muted small', `Exam: ${r.examTitle} • Violations recorded: ${violations}`));
  show('result-view');
}
$('result-home').onclick = loadHome;

/* ---------- Exam rules ---------- */
document.addEventListener('visibilitychange', () => {
  if (!examActive || !document.hidden) return;
  violations++;
  const w = $('warn'); w.classList.remove('hidden');
  w.textContent = `⚠ Tab switch detected (${violations}/${MAX_VIOLATIONS}). Exam will be auto-submitted after ${MAX_VIOLATIONS} violations.`;
  if (violations >= MAX_VIOLATIONS) finalSubmit(true);
});
['contextmenu', 'copy', 'paste', 'cut'].forEach(ev => document.addEventListener(ev, e => { if (examActive) e.preventDefault(); }));
window.addEventListener('beforeunload', e => { if (examActive) { e.preventDefault(); e.returnValue = ''; } });

/* ---------- Admin create ---------- */
$('create-exam').onclick = async () => {
  try {
    const r = await api('/api/exams', 'POST', {
      title: $('ex-title').value, duration: $('ex-duration').value, questions: JSON.parse($('ex-questions').value)
    });
    $('admin-msg').textContent = 'Created: ' + r.title; loadHome();
  } catch (e) { $('admin-msg').textContent = e.message; }
};
