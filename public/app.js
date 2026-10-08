const $ = s => document.querySelector(s);
let token = localStorage.getItem('token');
let user = null;
let registerMode = false;

/* ---------- helpers ---------- */
function toast(msg, isError) {
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'toast' + (isError ? ' error' : '');
  t.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (t.hidden = true), 3500);
}

async function api(url, method = 'GET', body) {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401) openModal();
    throw new Error(data.error || 'Something went wrong.');
  }
  return data;
}

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ---------- auth UI ---------- */
function openModal() { $('#authModal').hidden = false; }
function closeModal() { $('#authModal').hidden = true; }

function setMode(reg) {
  registerMode = reg;
  $('#authTitle').textContent = reg ? 'Create account' : 'Log in';
  $('#authSubmit').textContent = reg ? 'Sign up' : 'Log in';
  $('#nameField').hidden = !reg;
  $('#nameField').required = reg;
  $('#switchMode').textContent = reg ? 'Have an account? Log in' : 'New here? Create an account';
}

function renderAuth() {
  const on = !!user;
  $('#loginBtn').hidden = on;
  $('#logoutBtn').hidden = !on;
  $('#hello').hidden = !on;
  $('#hello').textContent = on ? 'Hi, ' + user.name.split(' ')[0] : '';
  $('#mineLink').hidden = !on;
  $('#mine').hidden = !on;
  if (on) loadMine();
}

$('#loginBtn').onclick = () => { setMode(false); openModal(); };
$('#closeModal').onclick = closeModal;
$('#switchMode').onclick = e => { e.preventDefault(); setMode(!registerMode); };
$('#logoutBtn').onclick = () => {
  token = null; user = null; localStorage.removeItem('token');
  renderAuth(); toast('Logged out.');
};

$('#authForm').onsubmit = async e => {
  e.preventDefault();
  const f = Object.fromEntries(new FormData(e.target));
  try {
    const data = await api(registerMode ? '/api/register' : '/api/login', 'POST', f);
    token = data.token; user = data.user;
    localStorage.setItem('token', token);
    e.target.reset(); closeModal(); renderAuth();
    toast('Welcome, ' + user.name + '!');
  } catch (err) { toast(err.message, true); }
};

/* ---------- books ---------- */
async function loadBooks() {
  const q = encodeURIComponent($('#bookSearch').value);
  const books = await api('/api/books?q=' + q);
  $('#bookList').innerHTML = books.length ? books.map(b => `
    <div class="card">
      <span class="tag">${esc(b.course || 'General')}</span>
      <h3>${esc(b.title)}</h3>
      <div class="meta">${esc(b.author)} · ${esc(b.condition)}</div>
      <div class="meta">Seller: ${esc(b.seller)}</div>
      <div class="price">$${b.price}</div>
      <button class="btn" data-buy="${b.id}">Buy now</button>
    </div>`).join('') : '<p class="empty">No books found.</p>';
}

$('#bookList').onclick = async e => {
  const id = e.target.dataset.buy;
  if (!id) return;
  try {
    const r = await api(`/api/books/${id}/buy`, 'POST');
    toast(r.message); loadBooks(); loadMine();
  } catch (err) { toast(err.message, true); }
};

/* ---------- tutors ---------- */
async function loadTutors() {
  const q = encodeURIComponent($('#tutorSearch').value);
  const tutors = await api('/api/tutors?q=' + q);
  $('#tutorList').innerHTML = tutors.length ? tutors.map(t => `
    <div class="card">
      <span class="tag">$${t.rate}/hour</span>
      <h3>${esc(t.name)}</h3>
      <div class="meta"><b>${esc(t.subject)}</b></div>
      <p class="meta">${esc(t.bio)}</p>
      <input type="datetime-local" id="when${t.id}">
      <button class="btn" data-book="${t.id}">Book session</button>
    </div>`).join('') : '<p class="empty">No tutors found.</p>';
}

$('#tutorList').onclick = async e => {
  const id = e.target.dataset.book;
  if (!id) return;
  try {
    const r = await api(`/api/tutors/${id}/book`, 'POST', { when: $('#when' + id).value });
    toast(r.message); loadMine();
  } catch (err) { toast(err.message, true); }
};

/* ---------- trade forms ---------- */
$('#bookForm').onsubmit = async e => {
  e.preventDefault();
  try {
    await api('/api/books', 'POST', Object.fromEntries(new FormData(e.target)));
    e.target.reset(); toast('Book listed!'); loadBooks(); loadMine();
  } catch (err) { toast(err.message, true); }
};

$('#tutorForm').onsubmit = async e => {
  e.preventDefault();
  try {
    await api('/api/tutors', 'POST', Object.fromEntries(new FormData(e.target)));
    e.target.reset(); toast('You are now listed as a tutor!'); loadTutors(); loadMine();
  } catch (err) { toast(err.message, true); }
};

/* ---------- my activity ---------- */
async function loadMine() {
  if (!token) return;
  try {
    const m = await api('/api/mine');
    const list = (items, fn, empty) => items.length ? items.map(fn).join('') : `<p class="empty">${empty}</p>`;
    $('#mineBox').innerHTML = `
      <div class="card"><h3>Books I'm selling</h3>${list(m.listings,
        b => `<div class="row"><span>${esc(b.title)} · $${b.price} ${b.sold ? '(sold)' : ''}</span>
          <button class="btn danger" data-delbook="${b.id}">Remove</button></div>`, 'Nothing listed yet.')}</div>
      <div class="card"><h3>My tutoring</h3>${list(m.tutoring,
        t => `<div class="row"><span>${esc(t.subject)} · $${t.rate}/h</span>
          <button class="btn danger" data-deltutor="${t.id}">Remove</button></div>`, 'Not listed as a tutor.')}</div>
      <div class="card"><h3>My purchases</h3>${list(m.purchases,
        p => `<div class="row"><span>${esc(p.title)} · $${p.price}</span></div>`, 'No purchases yet.')}</div>
      <div class="card"><h3>My tutor bookings</h3>${list(m.bookings,
        b => `<div class="row"><span>${esc(b.tutor)} · ${esc(b.when.replace('T', ' '))}</span></div>`, 'No sessions booked.')}</div>`;
  } catch {}
}

$('#mineBox').onclick = async e => {
  const { delbook, deltutor } = e.target.dataset;
  try {
    if (delbook) await api('/api/books/' + delbook, 'DELETE');
    else if (deltutor) await api('/api/tutors/' + deltutor, 'DELETE');
    else return;
    toast('Removed.'); loadBooks(); loadTutors(); loadMine();
  } catch (err) { toast(err.message, true); }
};

/* ---------- misc ---------- */
$('#bookSearch').oninput = loadBooks;
$('#tutorSearch').oninput = loadTutors;
$('#menuBtn').onclick = () => $('#nav').classList.toggle('open');
$('#nav').onclick = () => $('#nav').classList.remove('open');
$('#year').textContent = new Date().getFullYear();

(async function init() {
  if (token) {
    try { user = (await api('/api/me')).user; }
    catch { token = null; localStorage.removeItem('token'); }
  }
  renderAuth(); loadBooks(); loadTutors();
})();
