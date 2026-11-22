// OrchardTube — сервер: REST API (MongoDB) + раздача фронтенда.
// Локально: node server.js [port]. На Render порт берётся из process.env.PORT.
const path = require('path');
const crypto = require('crypto');
require('dotenv').config();
const express = require('express');
const Busboy = require('busboy');
const store = require('./db');
const auth = require('./auth');

const app = express();
const PORT = Number(process.env.PORT || process.argv[2] || 8777);
const MAX_UPLOAD_BYTES = (Number(process.env.MAX_UPLOAD_MB) || 100) * 1024 * 1024;
const MAX_THUMB_BYTES = 2 * 1024 * 1024;

app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});
app.use(express.json({ limit: '100kb' }));
app.use(auth.sessionMiddleware);

// Защита от CSRF поверх SameSite=Lax: запросы с изменением данных принимаем только со своего сайта
app.use((req, res, next) => {
  if (/^(GET|HEAD|OPTIONS)$/.test(req.method)) return next();
  const origin = req.get('origin');
  if (origin) {
    let host = '';
    try { host = new URL(origin).host; } catch (e) { /* пусто */ }
    if (host !== req.get('host')) return res.status(403).json({ error: 'origin', message: 'Запрос с чужого сайта' });
  }
  next();
});

/* ---------- утилиты ---------- */

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// Простой лимитер в памяти (на один экземпляр сервера): не более max событий за окно
const buckets = new Map();
function hit(key, max, windowMs) {
  const now = Date.now();
  const arr = (buckets.get(key) || []).filter((t) => now - t < windowMs);
  if (arr.length >= max) { buckets.set(key, arr); return false; }
  arr.push(now);
  buckets.set(key, arr);
  return true;
}
setInterval(() => { const now = Date.now(); for (const [k, a] of buckets) if (!a.length || now - a[a.length - 1] > 3600e3) buckets.delete(k); }, 600e3).unref();

const limited = (name, max, windowMs, by = 'sub') => (req, res, next) => {
  const id = by === 'ip' ? req.ip : (req.sub || req.ip);
  if (hit(`${name}:${id}`, max, windowMs)) return next();
  res.status(429).json({ error: 'rate', message: 'Слишком часто, попробуйте позже' });
};

/* ---------- служебное ---------- */

app.get('/api/health', (req, res) => {
  res.json({ ok: true, db: store.connected() ? 'mongodb' : 'down', maxUploadMb: Math.round(MAX_UPLOAD_BYTES / 1024 / 1024) });
});

app.get('/api/config', (req, res) => {
  res.json({ googleClientId: auth.GOOGLE_CLIENT_ID, maxUploadMb: Math.round(MAX_UPLOAD_BYTES / 1024 / 1024) });
});

app.get('/api/bootstrap', wrap(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json(await store.getBootstrap());
}));

/* ---------- вход и канал ---------- */

app.get('/api/me', wrap(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const me = req.sub ? await store.getMe(req.sub) : null;
  if (req.sub && !me) auth.clearSession(req, res);
  res.json(me || { user: null });
}));

app.post('/api/auth/google', limited('login', 20, 600e3, 'ip'), wrap(async (req, res) => {
  const profile = await auth.verifyGoogle(req.body && req.body.credential);
  await store.upsertUser(profile);
  auth.setSession(req, res, profile.sub);
  res.json(await store.getMe(profile.sub));
}));

app.post('/api/auth/logout', (req, res) => {
  auth.clearSession(req, res);
  res.json({ ok: true });
});

app.post('/api/channel', auth.requireAuth, limited('channel', 5, 3600e3), wrap(async (req, res) => {
  const channel = await store.createChannel(req.sub, req.body || {});
  res.status(201).json({ channel });
}));

app.patch('/api/channel', auth.requireAuth, wrap(async (req, res) => {
  const { name, description } = req.body || {};
  res.json({ channel: await store.updateChannel(req.sub, { name, description }) });
}));

/* ---------- видео ---------- */

const DURATION_RE = /^\d{1,2}(:\d{2}){1,2}$/;
const CATEGORIES = ['Технологии', 'Музыка', 'Игры', 'Новости', 'Обучение', 'Спорт', 'Дизайн', 'Путешествия', 'Еда', 'Юмор'];

app.post('/api/videos', auth.requireAuth, limited('upload', 10, 3600e3), wrap(async (req, res) => {
  // не принимаем файл, пока нет канала
  const user = await store.getUser(req.sub);
  if (!user) return res.status(401).json({ error: 'auth', message: 'Войдите в аккаунт Google' });
  if (!user.channelId) return res.status(403).json({ error: 'no-channel', message: 'Сначала создайте канал' });

  const fields = {};
  const saved = {};
  const pending = [];
  let failed = null;
  const fail = (status, message) => { if (!failed) failed = { status, message }; };

  let bb;
  try {
    bb = Busboy({ headers: req.headers, limits: { files: 2, fields: 10, fileSize: MAX_UPLOAD_BYTES, fieldSize: 8 * 1024 } });
  } catch (e) {
    return res.status(400).json({ error: 'bad-request', message: 'Ожидается multipart/form-data' });
  }

  bb.on('field', (name, val) => { fields[name] = val; });

  bb.on('file', (name, file, info) => {
    const { filename, mimeType } = info;
    // Браузеры иногда отдают пустой/octet-stream тип для .mkv/.mov — тогда смотрим на расширение
    const byExt = /\.(mp4|m4v|webm|mkv|mov|avi|ogv|3gp)$/i.test(filename || '') && /^(|application\/octet-stream)$/.test(mimeType);
    const isVideo = name === 'video' && (/^video\//.test(mimeType) || byExt);
    const isThumb = name === 'thumb' && /^image\/(jpeg|png|webp)$/.test(mimeType);
    if (!isVideo && !isThumb) {
      if (name === 'video') fail(400, 'Нужен видеофайл');
      file.resume();
      return;
    }
    let size = 0;
    const limit = isVideo ? MAX_UPLOAD_BYTES : MAX_THUMB_BYTES;
    file.on('data', (c) => { size += c.length; });
    file.on('limit', () => fail(413, 'Файл слишком большой'));
    const type = /^video\//.test(mimeType) || !isVideo ? mimeType : 'video/mp4';
    pending.push(
      store.saveMedia(file, filename || name, type)
        .then((id) => { if (size > limit) { store.deleteMedia(id); fail(413, 'Файл слишком большой'); } else saved[name] = id; })
        .catch((e) => { fail(e.code === 'LIMIT' ? 413 : 500, e.code === 'LIMIT' ? 'Файл слишком большой' : 'Не удалось сохранить файл'); })
    );
  });

  bb.on('error', () => fail(400, 'Ошибка разбора формы'));

  bb.on('close', async () => {
    await Promise.all(pending);
    const cleanup = () => Promise.all(Object.values(saved).map((id) => store.deleteMedia(id)));
    try {
      const title = String(fields.title || '').trim().slice(0, 120);
      if (!failed && !saved.video) fail(400, 'Выберите видеофайл');
      if (!failed && !title) fail(400, 'Укажите название');
      if (failed) { await cleanup(); return res.status(failed.status).json({ error: 'upload-failed', message: failed.message }); }

      const video = await store.addVideo(req.sub, {
        title,
        desc: String(fields.desc || '').slice(0, 5000),
        category: CATEGORIES.includes(fields.category) ? fields.category : 'Все',
        duration: DURATION_RE.test(fields.duration || '') ? fields.duration : '0:00',
        mediaId: saved.video,
        thumbId: saved.thumb || ''
      });
      res.status(201).json({ ok: true, video });
    } catch (e) {
      await cleanup();
      if (e.status) return res.status(e.status).json({ error: e.code || 'upload-failed', message: e.message });
      console.error('[api] upload:', e.message);
      res.status(500).json({ error: 'upload-failed', message: 'Не удалось сохранить видео' });
    }
  });

  req.pipe(bb);
}));

app.delete('/api/videos/:id', auth.requireAuth, wrap(async (req, res) => {
  await store.removeVideo(String(req.params.id), req.sub);
  res.json({ ok: true });
}));

app.post('/api/videos/:id/view', wrap(async (req, res) => {
  // один просмотр с одного IP на одно видео в 30 минут
  if (!hit(`view:${req.ip}:${req.params.id}`, 1, 30 * 60e3)) return res.json({ ok: true, counted: false });
  const r = await store.bumpViews(String(req.params.id));
  res.json({ ok: !!r, counted: !!r, ...(r || {}) });
}));

app.post('/api/videos/:id/like', auth.requireAuth, limited('like', 60, 600e3), wrap(async (req, res) => {
  res.json(await store.setLike(String(req.params.id), req.sub, !!(req.body && req.body.on)));
}));

app.get('/api/videos/:id/comments', wrap(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({ comments: await store.listComments(String(req.params.id), req.sub) });
}));

app.post('/api/videos/:id/comments', auth.requireAuth, limited('comment', 30, 600e3), wrap(async (req, res) => {
  res.status(201).json({ comment: await store.addComment(String(req.params.id), req.sub, req.body && req.body.text) });
}));

app.delete('/api/comments/:id', auth.requireAuth, wrap(async (req, res) => {
  await store.deleteComment(String(req.params.id), req.sub);
  res.json({ ok: true });
}));

app.post('/api/channels/:id/subscribe', auth.requireAuth, limited('sub', 60, 600e3), wrap(async (req, res) => {
  res.json(await store.setSubscription(req.sub, String(req.params.id), !!(req.body && req.body.on)));
}));

// Потоковая отдача медиа из GridFS с поддержкой Range (перемотка в <video>)
app.get('/api/media/:id', wrap(async (req, res) => {
  const f = await store.statMedia(req.params.id);
  if (!f) return res.status(404).end();
  res.setHeader('Content-Type', f.contentType);
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Cache-Control', 'public, max-age=86400');

  const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
  if (!m || (m[1] === '' && m[2] === '')) {
    res.setHeader('Content-Length', f.length);
    return store.readMedia(f.oid).on('error', () => res.destroy()).pipe(res);
  }
  let start, end;
  if (m[1] === '') { start = Math.max(0, f.length - Number(m[2])); end = f.length - 1; }
  else { start = Number(m[1]); end = m[2] === '' ? f.length - 1 : Math.min(Number(m[2]), f.length - 1); }
  if (start > end || start >= f.length) {
    res.setHeader('Content-Range', `bytes */${f.length}`);
    return res.status(416).end();
  }
  res.status(206);
  res.setHeader('Content-Range', `bytes ${start}-${end}/${f.length}`);
  res.setHeader('Content-Length', end - start + 1);
  store.readMedia(f.oid, { start, end }).on('error', () => res.destroy()).pipe(res);
}));

app.use('/api', (req, res) => res.status(404).json({ error: 'not-found' }));

/* ---------- статика фронтенда ---------- */

// Раздаём только фронтенд — не весь каталог (иначе наружу уходят .env, server.js, db.js)
const noCache = {
  setHeaders(res, filePath) {
    if (/\.(css|js)$/.test(filePath)) res.setHeader('Cache-Control', 'no-cache');
  }
};
app.use('/css', express.static(path.join(__dirname, 'css'), noCache));
app.use('/js', express.static(path.join(__dirname, 'js'), noCache));
app.get(['/', '/index.html'], (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

/* ---------- ошибки ---------- */

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err.status && err.status < 500) return res.status(err.status).json({ error: err.code || 'error', message: err.message });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'bad-json', message: 'Некорректный JSON' });
  console.error('[api]', req.method, req.path, err.message);
  res.status(500).json({ error: 'server', message: 'Внутренняя ошибка сервера' });
});

/* ---------- запуск ---------- */

store.connect()
  .then(() => {
    if (!auth.GOOGLE_CLIENT_ID) console.warn('[auth] GOOGLE_CLIENT_ID не задан — вход через Google отключён');
    app.listen(PORT, () => console.log(`OrchardTube: http://localhost:${PORT}`));
  })
  .catch((e) => {
    console.error('[db] не удалось подключиться к MongoDB:', e.message);
    console.error('Задайте MONGODB_URI (см. .env.example).');
    process.exit(1);
  });
