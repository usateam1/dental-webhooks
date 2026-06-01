const express = require('express');
const { Pool } = require('pg');
const https   = require('https');

const app  = express();
const PORT = process.env.PORT || 3000;

/* ── Env ── */
const DATABASE_URL = process.env.DATABASE_URL || '';   // Neon / Railway PostgreSQL URL
const TG_TOKEN     = process.env.TG_TOKEN     || '';
const TG_CHATID    = process.env.TG_CHATID    || '';
const ADMIN_KEY    = process.env.ADMIN_KEY    || 'secret123';

/* ── PostgreSQL pool ── */
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: DATABASE_URL.includes('neon.tech') || DATABASE_URL.includes('railway')
    ? { rejectUnauthorized: false }
    : false,
});

/* ── Init table ── */
async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS reviews (
      id        TEXT PRIMARY KEY,
      name      TEXT NOT NULL,
      txt       TEXT NOT NULL,
      svc       TEXT DEFAULT '',
      stars     INTEGER NOT NULL,
      ts        BIGINT NOT NULL,
      status    TEXT DEFAULT 'pending',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  console.log('✅ DB ready');
}

/* ── CORS ── */
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});
app.use(express.json());

/* ════════════════════════════
   POST /pending — новый отзыв
════════════════════════════ */
app.post('/pending', async (req, res) => {
  const { id, name, txt, svc, stars, ts } = req.body;
  if (!id || !name || !txt || !stars) return res.status(400).json({ error: 'bad fields' });

  try {
    await pool.query(
      `INSERT INTO reviews (id, name, txt, svc, stars, ts, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending')
       ON CONFLICT (id) DO NOTHING`,
      [id, name.slice(0,100), txt.slice(0,1000), (svc||'').slice(0,80), +stars, +ts || Date.now()]
    );

    if (TG_TOKEN && TG_CHATID) {
      const review = { id, name, txt, svc, stars: +stars };
      sendTelegram(review);
    }

    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'db error' });
  }
});

/* ════════════════════════════
   GET /approved — одобренные
════════════════════════════ */
app.get('/approved', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM reviews WHERE status='approved' ORDER BY ts DESC LIMIT 100`
    );
    res.json(rows);
  } catch (e) {
    res.json([]);
  }
});

/* ════════════════════════════
   GET /pending — pending (admin)
════════════════════════════ */
app.get('/pending', async (req, res) => {
  if (req.query.key !== ADMIN_KEY) return res.status(403).json({ error: 'forbidden' });
  try {
    const { rows } = await pool.query(
      `SELECT * FROM reviews WHERE status='pending' ORDER BY created_at DESC`
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: 'db error' });
  }
});

/* ════════════════════════════
   POST /approve/:id
════════════════════════════ */
app.post('/approve/:id', async (req, res) => {
  if (req.query.key !== ADMIN_KEY) return res.status(403).json({ error: 'forbidden' });
  try {
    const { rows } = await pool.query(
      `UPDATE reviews SET status='approved' WHERE id=$1 AND status='pending' RETURNING *`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'not found' });
    res.json({ ok: true, review: rows[0] });
  } catch (e) {
    res.status(500).json({ error: 'db error' });
  }
});

/* ════════════════════════════
   POST /reject/:id
════════════════════════════ */
app.post('/reject/:id', async (req, res) => {
  if (req.query.key !== ADMIN_KEY) return res.status(403).json({ error: 'forbidden' });
  try {
    await pool.query(`DELETE FROM reviews WHERE id=$1`, [req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'db error' });
  }
});

/* ════════════════════════════
   GET /admin — HTML панель
════════════════════════════ */
app.get('/admin', async (req, res) => {
  if (req.query.key !== ADMIN_KEY) {
    return res.send(`
      <html><body style="font-family:sans-serif;padding:2rem;max-width:400px;margin:0 auto">
        <h2 style="color:#0b2056">🦷 Панель модерации</h2>
        <p style="color:#64748b">Введите ключ доступа для входа</p>
        <form style="display:flex;gap:8px">
          <input name="key" type="password" placeholder="ADMIN_KEY"
            style="flex:1;padding:10px;border-radius:10px;border:1.5px solid #e5e7eb;font-size:1rem">
          <button type="submit"
            style="padding:10px 20px;background:linear-gradient(130deg,#2979ff,#00c6fb);color:#fff;border:none;border-radius:10px;cursor:pointer;font-weight:700">
            Войти
          </button>
        </form>
      </body></html>`);
  }

  const key = req.query.key;
  let pending = [], approved = [];
  try {
    const p = await pool.query(`SELECT * FROM reviews WHERE status='pending' ORDER BY created_at DESC`);
    const a = await pool.query(`SELECT * FROM reviews WHERE status='approved' ORDER BY ts DESC`);
    pending  = p.rows;
    approved = a.rows;
  } catch(e) {}

  const stars = n => '★'.repeat(n) + '☆'.repeat(5 - n);
  const rows = (list, type) => list.length === 0
    ? `<p style="color:#9ca3af;padding:1rem 0">Нет отзывов</p>`
    : list.map(r => `
      <div style="background:#f8faff;border-radius:14px;padding:18px;margin-bottom:12px;border:1px solid #e2e8f0">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
          <b style="color:#0b2056">${r.name}</b>
          <span style="color:#f6c90e;font-size:1.1rem">${stars(r.stars)}</span>
        </div>
        ${r.svc ? `<div style="color:#2979ff;font-size:.82rem;margin-bottom:6px">💊 ${r.svc}</div>` : ''}
        <p style="color:#374151;margin:0 0 8px">"${r.txt}"</p>
        <small style="color:#9ca3af">${new Date(+r.ts).toLocaleString('ru')}</small>
        ${type === 'pending' ? `
          <div style="margin-top:12px;display:flex;gap:8px">
            <form method="post" action="/approve/${r.id}?key=${key}" style="display:inline">
              <button style="background:#10b981;color:#fff;border:none;padding:9px 20px;border-radius:10px;cursor:pointer;font-weight:700;font-size:.9rem">
                ✅ Одобрить
              </button>
            </form>
            <form method="post" action="/reject/${r.id}?key=${key}" style="display:inline">
              <button style="background:#ef4444;color:#fff;border:none;padding:9px 20px;border-radius:10px;cursor:pointer;font-weight:700;font-size:.9rem">
                ❌ Отклонить
              </button>
            </form>
          </div>` : `<div style="margin-top:8px;color:#10b981;font-weight:600;font-size:.85rem">✓ Одобрен и опубликован</div>`}
      </div>`).join('');

  res.send(`<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Модерация отзывов</title>
  <style>
    *{box-sizing:border-box}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f5f8ff;margin:0;padding:2rem}
    .container{max-width:820px;margin:0 auto}
    h1{color:#0b2056;font-size:1.5rem;margin-bottom:2rem;display:flex;align-items:center;gap:10px}
    h2{color:#2979ff;font-size:1.1rem;margin:1.8rem 0 .8rem;padding-bottom:.4rem;border-bottom:2px solid #e5e7eb;display:flex;align-items:center;gap:8px}
    .badge{background:rgba(41,121,255,.1);color:#2979ff;border-radius:50px;padding:2px 12px;font-size:.8rem;font-weight:700}
    .stats{display:flex;gap:1rem;margin-bottom:1.5rem}
    .stat{background:#fff;border-radius:14px;padding:14px 20px;box-shadow:0 2px 12px rgba(41,121,255,.08);flex:1;text-align:center}
    .stat-n{font-size:2rem;font-weight:800;color:#2979ff}
    .stat-l{font-size:.8rem;color:#64748b;margin-top:2px}
    .refresh{display:inline-block;margin-bottom:1rem;padding:8px 18px;background:#2979ff;color:#fff;border-radius:50px;text-decoration:none;font-size:.85rem;font-weight:700}
  </style>
</head>
<body>
<div class="container">
  <h1>🦷 Minbaev Dental — Модерация отзывов</h1>
  <div class="stats">
    <div class="stat"><div class="stat-n">${pending.length}</div><div class="stat-l">Ожидают</div></div>
    <div class="stat"><div class="stat-n">${approved.length}</div><div class="stat-l">Одобрено</div></div>
    <div class="stat"><div class="stat-n">${pending.length + approved.length}</div><div class="stat-l">Всего</div></div>
  </div>
  <a class="refresh" href="/admin?key=${key}">🔄 Обновить</a>
  <h2>⏳ Ожидают одобрения <span class="badge">${pending.length}</span></h2>
  ${rows(pending, 'pending')}
  <h2>✅ Одобренные <span class="badge">${approved.length}</span></h2>
  ${rows(approved, 'approved')}
</div>
</body></html>`);
});

/* ════════════════════════════
   POST /tg-webhook — Telegram inline кнопки
════════════════════════════ */
app.post('/tg-webhook', async (req, res) => {
  const body = req.body;
  if (body.callback_query) {
    const cb = body.callback_query;
    const [action, id] = cb.data.split(':');

    if (action === 'approve') {
      const { rows } = await pool.query(
        `UPDATE reviews SET status='approved' WHERE id=$1 AND status='pending' RETURNING name`,
        [id]
      );
      if (rows.length) {
        tgAnswerCallback(cb.id, `✅ Отзыв одобрен!`);
        tgEditMessage(cb.message.chat.id, cb.message.message_id,
          cb.message.text + '\n\n✅ ОДОБРЕН — опубликован на сайте');
      } else {
        tgAnswerCallback(cb.id, 'Уже обработан');
      }
    } else if (action === 'reject') {
      await pool.query(`DELETE FROM reviews WHERE id=$1`, [id]);
      tgAnswerCallback(cb.id, '❌ Отклонён и удалён');
      tgEditMessage(cb.message.chat.id, cb.message.message_id,
        cb.message.text + '\n\n❌ ОТКЛОНЁН');
    }
  }
  res.sendStatus(200);
});

/* ── Healthcheck ── */
app.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT COUNT(*) FROM reviews WHERE status='pending'`);
    const { rows: a } = await pool.query(`SELECT COUNT(*) FROM reviews WHERE status='approved'`);
    res.json({ status: 'ok', pending: +rows[0].count, approved: +a[0].count });
  } catch(e) {
    res.json({ status: 'db_error', error: e.message });
  }
});

/* ════════════════════════════
   Telegram helpers
════════════════════════════ */
function tgPost(method, body) {
  const data = JSON.stringify(body);
  const opts = {
    hostname: 'api.telegram.org',
    path: `/bot${TG_TOKEN}/${method}`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
  };
  const req = https.request(opts, r => { r.resume(); });
  req.on('error', e => console.error('TG error:', e.message));
  req.write(data);
  req.end();
}

function sendTelegram(r) {
  const stars = '★'.repeat(r.stars) + '☆'.repeat(5 - r.stars);
  const text = `🦷 *Новый отзыв — нужна проверка*\n\n👤 ${r.name}\n${stars}${r.svc ? `\n💊 ${r.svc}` : ''}\n\n"${r.txt}"`;
  tgPost('sendMessage', {
    chat_id: TG_CHATID,
    text,
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [[
        { text: '✅ Одобрить', callback_data: `approve:${r.id}` },
        { text: '❌ Отклонить', callback_data: `reject:${r.id}` }
      ]]
    }
  });
}

function tgAnswerCallback(callbackId, text) {
  tgPost('answerCallbackQuery', { callback_query_id: callbackId, text });
}

function tgEditMessage(chatId, messageId, text) {
  tgPost('editMessageText', { chat_id: chatId, message_id: messageId, text });
}

/* ── Start ── */
initDB()
  .then(() => app.listen(PORT, () => console.log(`🦷 Dental server running on :${PORT}`)))
  .catch(err => { console.error('DB init failed:', err); process.exit(1); });
