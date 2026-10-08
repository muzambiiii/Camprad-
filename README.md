# Campradé

Student marketplace: buy books, book tutors, and trade (sell books / list yourself as a tutor).

## Run it

1. Install Node.js 18+
2. In this folder:
   ```
   npm install
   npm start
   ```
3. Open http://localhost:3000

Demo login: `demo@campus.edu` / `password123`

## Structure

```
camptrade/
├── server.js        Express API (auth, books, tutors, bookings)
├── package.json
├── data.json        created on first run, with example data
└── public/
    ├── index.html   header, sections, footer, login modal
    ├── style.css
    └── app.js       frontend logic
```

## Before going live

- Set a strong `JWT_SECRET` environment variable
- Replace data.json with a real database (SQLite/Postgres)
- Serve over HTTPS and add rate limiting on /api/login
- Restrict sign-up to your school's email domain if you want students only
- Add real payments (e.g. Stripe) — "Buy now" currently just reserves the book
