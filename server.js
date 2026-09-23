const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const { Pool } = require('pg');

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS joueurs (
      uid TEXT PRIMARY KEY,
      balance INTEGER NOT NULL DEFAULT 1000,
      collection JSONB NOT NULL DEFAULT '{}'
    )
  `);
}
initDb().catch(err => console.error('Erreur init DB', err));

function getUid(req, res) {
  let uid = req.cookies.uid;
  if (!uid) {
    uid = 'u_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
    res.cookie('uid', uid, { maxAge: 1000 * 60 * 60 * 24 * 365, httpOnly: true });
  }
  return uid;
}

app.get('/api/state', async (req, res) => {
  const uid = getUid(req, res);
  const result = await pool.query('SELECT balance, collection FROM joueurs WHERE uid = $1', [uid]);
  if (result.rows.length === 0) {
    await pool.query('INSERT INTO joueurs (uid) VALUES ($1)', [uid]);
    return res.json({ balance: 1000, collection: {} });
  }
  res.json(result.rows[0]);
});

const CATALOG = [
  { id: 'monarque', r: 'commune', w: 60 },
  { id: 'renard', r: 'commune', w: 60 },
  { id: 'islande', r: 'rare', w: 25 },
  { id: 'miura', r: 'rare', w: 25 },
  { id: 'andromede', r: 'epique', w: 12 },
  { id: 'toutankh', r: 'epique', w: 12 },
  { id: 'msm', r: 'legendaire', w: 3 },
  { id: 'eiffel', r: 'legendaire', w: 3 }
];
const PACK_COST = 200, PACK_SIZE = 3;

function pickCard() {
  const total = CATALOG.reduce((s, c) => s + c.w, 0);
  let r = Math.random() * total, acc = 0;
  for (const c of CATALOG) { acc += c.w; if (r <= acc) return c; }
  return CATALOG[0];
}

app.post('/api/pack', async (req, res) => {
  const uid = getUid(req, res);
  const result = await pool.query('SELECT balance, collection FROM joueurs WHERE uid = $1', [uid]);
  if (result.rows.length === 0) return res.status(404).json({ error: 'not_found' });
  let { balance, collection } = result.rows[0];
  if (balance < PACK_COST) return res.status(400).json({ error: 'insufficient_funds' });
  balance -= PACK_COST;
  const got = [];
  for (let i = 0; i < PACK_SIZE; i++) {
    const c = pickCard();
    got.push(c.id);
    collection[c.id] = (collection[c.id] || 0) + 1;
  }
  await pool.query('UPDATE joueurs SET balance = $1, collection = $2 WHERE uid = $3', [balance, collection, uid]);
  res.json({ balance, collection, got });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Cartex en ligne sur le port ' + PORT));
