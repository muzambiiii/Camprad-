const express = require('express');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = process.env.PORT || 3000;
const SECRET = process.env.JWT_SECRET || 'change-this-secret-in-production';
const DB_FILE = path.join(__dirname, 'data.json');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

/* ---------- tiny JSON "database" (swap for SQLite/Postgres later) ---------- */
let db;
const save = () => fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));

function seed() {
  const hash = bcrypt.hashSync('password123', 10);
  db = {
    nextId: 100,
    users: [
      { id: 1, name: 'Demo Student', email: 'demo@campus.edu', hash },
      { id: 2, name: 'Priya Shah', email: 'priya@campus.edu', hash },
      { id: 3, name: 'Liam Carter', email: 'liam@campus.edu', hash }
    ],
    books: [
      { id: 1, title: 'Calculus: Early Transcendentals', author: 'James Stewart', course: 'MATH 101', condition: 'Good', price: 35, sellerId: 2, sold: false },
      { id: 2, title: 'Introduction to Algorithms', author: 'Cormen et al.', course: 'CS 201', condition: 'Like new', price: 55, sellerId: 3, sold: false },
      { id: 3, title: 'Organic Chemistry', author: 'Paula Bruice', course: 'CHEM 210', condition: 'Fair', price: 28, sellerId: 2, sold: false },
      { id: 4, title: 'Principles of Economics', author: 'N. Gregory Mankiw', course: 'ECON 100', condition: 'Good', price: 30, sellerId: 3, sold: false }
    ],
    tutors: [
      { id: 1, userId: 2, name: 'Priya Shah', subject: 'Calculus & Linear Algebra', rate: 18, bio: 'Math major, 3 years tutoring experience.' },
      { id: 2, userId: 3, name: 'Liam Carter', subject: 'Computer Science', rate: 22, bio: 'Teaching assistant for Data Structures.' },
      { id: 3, userId: 2, name: 'Priya Shah', subject: 'Organic Chemistry', rate: 20, bio: 'Pre-med, scored top of class in Orgo.' }
    ],
    orders: [],
    bookings: []
  };
  save();
}
if (fs.existsSync(DB_FILE)) db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
else seed();

/* ---------- helpers ---------- */
const publicUser = u => ({ id: u.id, name: u.name, email: u.email });
const sign = u => jwt.sign({ id: u.id }, SECRET, { expiresIn: '7d' });
const nameOf = id => (db.users.find(u => u.id === id) || {}).name || 'Unknown';

function auth(req, res, next) {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  try {
    const { id } = jwt.verify(token, SECRET);
    req.user = db.users.find(u => u.id === id);
    if (!req.user) throw new Error();
    next();
  } catch {
    res.status(401).json({ error: 'Please log in first.' });
  }
}
const clean = s => String(s || '').trim().slice(0, 200);

/* ---------- auth ---------- */
app.post('/api/register', (req, res) => {
  const name = clean(req.body.name), email = clean(req.body.email).toLowerCase(), password = String(req.body.password || '');
  if (!name || !email.includes('@') || password.length < 6)
    return res.status(400).json({ error: 'Enter a name, valid email and a password of 6+ characters.' });
  if (db.users.some(u => u.email === email)) return res.status(409).json({ error: 'Email already registered.' });
  const user = { id: db.nextId++, name, email, hash: bcrypt.hashSync(password, 10) };
  db.users.push(user); save();
  res.json({ token: sign(user), user: publicUser(user) });
});

app.post('/api/login', (req, res) => {
  const email = clean(req.body.email).toLowerCase();
  const user = db.users.find(u => u.email === email);
  if (!user || !bcrypt.compareSync(String(req.body.password || ''), user.hash))
    return res.status(401).json({ error: 'Wrong email or password.' });
  res.json({ token: sign(user), user: publicUser(user) });
});

app.get('/api/me', auth, (req, res) => res.json({ user: publicUser(req.user) }));

/* ---------- books ---------- */
app.get('/api/books', (req, res) => {
  const q = clean(req.query.q).toLowerCase();
  const list = db.books
    .filter(b => !b.sold && (!q || `${b.title} ${b.author} ${b.course}`.toLowerCase().includes(q)))
    .map(b => ({ ...b, seller: nameOf(b.sellerId) }));
  res.json(list);
});

app.post('/api/books', auth, (req, res) => {
  const { title, author, course, condition } = req.body, price = Number(req.body.price);
  if (!clean(title) || !(price >= 0)) return res.status(400).json({ error: 'Title and a valid price are required.' });
  const book = { id: db.nextId++, title: clean(title), author: clean(author), course: clean(course),
    condition: clean(condition) || 'Good', price, sellerId: req.user.id, sold: false };
  db.books.push(book); save();
  res.json(book);
});

app.post('/api/books/:id/buy', auth, (req, res) => {
  const book = db.books.find(b => b.id === +req.params.id && !b.sold);
  if (!book) return res.status(404).json({ error: 'Book no longer available.' });
  if (book.sellerId === req.user.id) return res.status(400).json({ error: "You can't buy your own book." });
  book.sold = true;
  db.orders.push({ id: db.nextId++, bookId: book.id, buyerId: req.user.id, price: book.price, date: new Date().toISOString() });
  save();
  res.json({ message: `You bought "${book.title}" for $${book.price}. Contact ${nameOf(book.sellerId)} to arrange pickup.` });
});

/* ---------- tutors ---------- */
app.get('/api/tutors', (req, res) => {
  const q = clean(req.query.q).toLowerCase();
  res.json(db.tutors.filter(t => !q || `${t.name} ${t.subject}`.toLowerCase().includes(q)));
});

app.post('/api/tutors', auth, (req, res) => {
  const rate = Number(req.body.rate);
  if (!clean(req.body.subject) || !(rate > 0)) return res.status(400).json({ error: 'Subject and hourly rate are required.' });
  const tutor = { id: db.nextId++, userId: req.user.id, name: req.user.name,
    subject: clean(req.body.subject), rate, bio: clean(req.body.bio) };
  db.tutors.push(tutor); save();
  res.json(tutor);
});

app.post('/api/tutors/:id/book', auth, (req, res) => {
  const tutor = db.tutors.find(t => t.id === +req.params.id);
  if (!tutor) return res.status(404).json({ error: 'Tutor not found.' });
  if (tutor.userId === req.user.id) return res.status(400).json({ error: "You can't book yourself." });
  const when = clean(req.body.when);
  if (!when) return res.status(400).json({ error: 'Pick a date and time.' });
  db.bookings.push({ id: db.nextId++, tutorId: tutor.id, studentId: req.user.id, when });
  save();
  res.json({ message: `Session requested with ${tutor.name} for ${when.replace('T', ' ')}.` });
});

/* ---------- my activity (dashboard) ---------- */
app.get('/api/mine', auth, (req, res) => {
  const id = req.user.id;
  res.json({
    listings: db.books.filter(b => b.sellerId === id),
    tutoring: db.tutors.filter(t => t.userId === id),
    purchases: db.orders.filter(o => o.buyerId === id).map(o => ({ ...o, title: (db.books.find(b => b.id === o.bookId) || {}).title })),
    bookings: db.bookings.filter(b => b.studentId === id).map(b => ({ ...b, tutor: (db.tutors.find(t => t.id === b.tutorId) || {}).name }))
  });
});

app.delete('/api/books/:id', auth, (req, res) => {
  const i = db.books.findIndex(b => b.id === +req.params.id && b.sellerId === req.user.id);
  if (i < 0) return res.status(404).json({ error: 'Not found.' });
  db.books.splice(i, 1); save(); res.json({ ok: true });
});

app.delete('/api/tutors/:id', auth, (req, res) => {
  const i = db.tutors.findIndex(t => t.id === +req.params.id && t.userId === req.user.id);
  if (i < 0) return res.status(404).json({ error: 'Not found.' });
  db.tutors.splice(i, 1); save(); res.json({ ok: true });
});

app.listen(PORT, () => console.log(`Campus Trade running at http://localhost:${PORT}`));
