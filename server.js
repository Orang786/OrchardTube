// OrchardTube — сервер: REST API (MongoDB или демо-данные) + раздача статики.
// Локально: node server.js [port]. В Render: порт берётся из process.env.PORT.
const path = require('path');
const crypto = require('crypto');
require('dotenv').config();
const express = require('express');
const Busboy = require('busboy');
const store = require('./db');

const app = express();
const PORT = Number(process.env.PORT || process.argv[2] || 8777);

app.use(express.json({ limit: '100kb' }));

const MAX_UPLOAD_BYTES = (Number(process.env.MAX_UPLOAD_MB) || 200) * 1024 * 1024;
const MAX_THUMB_BYTES = 2 * 1024 * 1024;
const UPLOAD_TOKEN = process.env.UPLOAD_TOKEN || '';

// Если задан UPLOAD_TOKEN — загрузка и удаление видео требуют заголовок x-upload-token
function requireUploadToken(req, res, next) {
  if (!UPLOAD_TOKEN) return next();
  const given = Buffer.from(String(req.get('x-upload-token') || ''));
  const want = Buffer.from(UPLOAD_TOKEN);
  if (given.length === want.length && crypto.timingSafeEqual(given, want)) return next();
  res.status(401).json({ error: 'bad-token', message: 'Неверный ключ загрузки' });
}

/* ---------- API ---------- */

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    db: store.connected() ? 'mongodb' : 'demo',
    upload: store.connected(),
    uploadTokenRequired: !!UPLOAD_TOKEN,
    maxUploadMb: Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)
  });
});

app.get('/api/bootstrap', async (req, res) => {
  try {
    res.json(await store.getBootstrap());
  } catch (e) {
    console.error('[api] bootstrap:', e.message);
    res.status(500).json({ error: 'bootstrap failed' });
  }
});

app.post('/api/comments', async (req, res) => {
  const { videoId, author, text } = req.body || {};
  if (!videoId || !text) return res.status(400).json({ error: 'videoId и text обязательны' });
  try {
    const r = await store.addComment(String(videoId), {
      author: String(author || 'Гость'),
      avatar: 'Г',
      color: '#ff6b00',
      ago: 'только что',
      likes: 0,
      text: String(text).slice(0, 2000)
    });
    res.status(r.ok ? 201 : 200).json(r);
  } catch (e) {
    console.error('[api] comment:', e.message);
    res.status(500).json({ error: 'comment failed' });
  }
});

app.post('/api/videos/:id/like', async (req, res) => {
  const delta = Number(req.body && req.body.delta) === -1 ? -1 : 1;
  try {
    res.json(await store.bumpLikes(req.params.id, delta));
  } catch (e) {
    console.error('[api] like:', e.message);
    res.status(500).json({ error: 'like failed' });
  }
});

app.post('/api/channels/:id/subscribe', async (req, res) => {
  const delta = Number(req.body && req.body.delta) === -1 ? -1 : 1;
  try {
    res.json(await store.bumpSubs(req.params.id, delta));
  } catch (e) {
    console.error('[api] subscribe:', e.message);
    res.status(500).json({ error: 'subscribe failed' });
  }
});

/* ---------- загрузка и раздача видео ---------- */

const DURATION_RE = /^\d{1,2}(:\d{2}){1,2}$/;

app.post('/api/videos', requireUploadToken, (req, res) => {
  if (!store.connected()) return res.status(503).json({ error: 'no-db', message: 'Загрузка работает только при подключённой MongoDB' });

  const fields = {};
  const saved = {}; // { video: id, thumb: id }
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
    const p = store.saveMedia(file, filename || name, /^video\//.test(mimeType) || !isVideo ? mimeType : 'video/mp4')
      .then((id) => { if (size > limit) { store.deleteMedia(id); fail(413, 'Файл слишком большой'); } else saved[name] = id; })
      .catch((e) => { fail(e.code === 'LIMIT' ? 413 : 500, e.code === 'LIMIT' ? 'Файл слишком большой' : 'Не удалось сохранить файл'); });
    pending.push(p);
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

      const video = await store.addVideo({
        id: 'u-' + crypto.randomBytes(5).toString('hex'),
        title,
        channel: 'orchardtech',
        views: 0,
        duration: DURATION_RE.test(fields.duration || '') ? fields.duration : '0:00',
        category: String(fields.category || 'Все').slice(0, 40),
        emoji: '🎬', g1: '#ffb347', g2: '#f25c00',
        watched: 0, likes: 0,
        desc: String(fields.desc || '').slice(0, 5000),
        media: '/api/media/' + saved.video,
        mediaId: saved.video,
        thumb: saved.thumb ? '/api/media/' + saved.thumb : '',
        thumbId: saved.thumb || ''
      });
      res.status(201).json({ ok: true, video });
    } catch (e) {
      console.error('[api] upload:', e.message);
      await cleanup();
      res.status(500).json({ error: 'upload-failed', message: 'Не удалось сохранить видео' });
    }
  });

  req.on('aborted', () => { fail(499, 'aborted'); });
  req.pipe(bb);
});

app.delete('/api/videos/:id', requireUploadToken, async (req, res) => {
  if (!store.connected()) return res.status(503).json({ error: 'no-db' });
  try {
    const r = await store.removeUserVideo(String(req.params.id));
    res.status(r.ok ? 200 : r.status).json(r.ok ? { ok: true } : { error: 'not-found' });
  } catch (e) {
    console.error('[api] delete video:', e.message);
    res.status(500).json({ error: 'delete failed' });
  }
});

app.post('/api/videos/:id/view', async (req, res) => {
  try {
    res.json(await store.bumpViews(String(req.params.id)));
  } catch (e) {
    res.status(500).json({ error: 'view failed' });
  }
});

// Потоковая отдача медиа из GridFS с поддержкой Range (перемотка в <video>)
app.get('/api/media/:id', async (req, res) => {
  if (!store.connected()) return res.status(404).end();
  try {
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
  } catch (e) {
    console.error('[api] media:', e.message);
    res.status(500).end();
  }
});

/* ---------- статика фронтенда ---------- */

// Раздаём только фронтенд — не весь каталог (иначе наружу уходят .env, server.js, db.js)
const noCache = {
  setHeaders(res, filePath) {
    if (/\.(css|js)$/.test(filePath)) res.setHeader('Cache-Control', 'no-cache');
  }
};
app.use('/css', express.static(path.join(__dirname, 'css'), noCache));
app.use('/js', express.static(path.join(__dirname, 'js'), noCache));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/index.html', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

/* ---------- запуск ---------- */

async function start() {
  try {
    await store.connect();
  } catch (e) {
    console.warn('[db] не удалось подключиться (' + e.message + ') — переключаемся на демо-данные');
  }
  app.listen(PORT, () => console.log(`OrchardTube: http://localhost:${PORT} (db: ${store.connected() ? 'mongodb' : 'demo'})`));
}

start();
