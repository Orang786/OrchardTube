// Слой данных: MongoDB (+GridFS для видео). Никаких демо-данных: всё создают пользователи.
const crypto = require('crypto');
const { MongoClient, GridFSBucket, ObjectId } = require('mongodb');

let client = null;
let db = null;
let bucket = null;

const col = (name) => db.collection(name);
const connected = () => !!db;

class HttpError extends Error {
  constructor(status, message, code) { super(message); this.status = status; this.code = code; }
}

async function connect() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI не задан');
  client = new MongoClient(uri, { serverSelectionTimeoutMS: 10000 });
  await client.connect();
  db = client.db(process.env.MONGODB_DB || 'orchardtube');
  bucket = new GridFSBucket(db, { bucketName: 'media' });
  await Promise.all([
    col('videos').createIndex({ id: 1 }, { unique: true }),
    col('videos').createIndex({ createdAt: -1 }),
    col('videos').createIndex({ channel: 1 }),
    col('comments').createIndex({ videoId: 1, createdAt: -1 }),
    col('likes').createIndex({ videoId: 1, sub: 1 }, { unique: true }),
    col('likes').createIndex({ sub: 1 }),
    col('subs').createIndex({ sub: 1, channelId: 1 }, { unique: true }),
    col('subs').createIndex({ channelId: 1 })
  ]);
  console.log('[db] подключено к MongoDB');
}

async function close() { if (client) await client.close(); }

/* ---------- форматирование ---------- */

function plural(n, one, few, many) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
  return many;
}

function agoText(date) {
  const sec = Math.max(0, Math.round((Date.now() - new Date(date).getTime()) / 1000));
  if (sec < 60) return 'только что';
  const units = [
    [60, 'минуту', 'минуты', 'минут', 3600],
    [3600, 'час', 'часа', 'часов', 86400],
    [86400, 'день', 'дня', 'дней', 604800],
    [604800, 'неделю', 'недели', 'недель', 2592000],
    [2592000, 'месяц', 'месяца', 'месяцев', 31536000],
    [31536000, 'год', 'года', 'лет', Infinity]
  ];
  for (const [size, one, few, many, limit] of units) {
    if (sec < limit) {
      const n = Math.floor(sec / size);
      return `${n} ${plural(n, one, few, many)} назад`;
    }
  }
  return '';
}

function compactNum(n) {
  n = Number(n) || 0;
  const trim = (x, d) => String(Number(x.toFixed(d))).replace('.', ',');
  if (n >= 1e6) return trim(n / 1e6, 2) + ' млн';
  if (n >= 1e4) return Math.round(n / 1e3) + ' тыс.';
  if (n >= 1e3) return trim(n / 1e3, 1) + ' тыс.';
  return String(n);
}

const viewsText = (n) => `${Number(n).toLocaleString('ru-RU')} ${plural(n, 'просмотр', 'просмотра', 'просмотров')}`;

const hash = (s) => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };

const initials = (name) => {
  const w = String(name || '?').trim().split(/\s+/).filter(Boolean);
  return ((w[0] ? w[0][0] : '?') + (w.length > 1 ? w[1][0] : '')).toUpperCase().slice(0, 2);
};

const PALETTE = [
  ['#ff6b00', '#ff9a3c', '#f25c00'], ['#2e9e6b', '#5fd0a0', '#1c7a55'], ['#3b82f6', '#6cb2ff', '#2563eb'],
  ['#8b5cf6', '#b794ff', '#6d28d9'], ['#ec4899', '#ff9ecb', '#db2777'], ['#6366f1', '#a5b4fc', '#4338ca'],
  ['#e11d48', '#fb7185', '#9f1239'], ['#0d9488', '#5eead4', '#115e59']
];
const GRADS = [['#ffb347', '#f25c00'], ['#7bd8a8', '#166b4c'], ['#7cb8ff', '#1d4ed8'], ['#b794ff', '#6d28d9'], ['#ff9ecb', '#db2777'], ['#a5b4fc', '#3730a3']];

function channelView(ch, stats) {
  const p = PALETTE[hash(ch._id) % PALETTE.length];
  const s = stats || { count: 0, views: 0 };
  return {
    id: ch._id,
    name: ch.name,
    handle: '@' + ch._id,
    avatar: initials(ch.name),
    color: p[0],
    subs: compactNum(ch.subsCount || 0),
    subsNum: ch.subsCount || 0,
    verified: false,
    banner: [p[1], p[2]],
    joined: new Date(ch.createdAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }),
    viewsNum: s.views,
    videoCount: s.count,
    description: ch.description || ''
  };
}

function videoView(v) {
  const g = GRADS[hash(v.id) % GRADS.length];
  return {
    id: v.id,
    title: v.title,
    channel: v.channel,
    views: v.views || 0,
    viewsText: viewsText(v.views || 0),
    ago: agoText(v.createdAt),
    duration: v.duration,
    category: v.category,
    emoji: '🎬', g1: g[0], g2: g[1],
    watched: 0,
    likes: v.likes || 0,
    desc: v.desc || '',
    media: v.media,
    thumb: v.thumb || ''
  };
}

/* ---------- пользователи и каналы ---------- */

async function upsertUser(p) {
  await col('users').updateOne(
    { _id: p.sub },
    { $set: { email: p.email, name: p.name || p.email.split('@')[0], picture: p.picture || '', lastLoginAt: new Date() },
      $setOnInsert: { channelId: null, createdAt: new Date() } },
    { upsert: true }
  );
  return col('users').findOne({ _id: p.sub });
}

const getUser = (sub) => col('users').findOne({ _id: sub });

async function statsFor(ids) {
  const rows = await col('videos').aggregate([
    { $match: { channel: { $in: ids } } },
    { $group: { _id: '$channel', count: { $sum: 1 }, views: { $sum: '$views' } } }
  ]).toArray();
  const m = {};
  rows.forEach((r) => { m[r._id] = { count: r.count, views: r.views }; });
  return m;
}

async function getChannelView(id) {
  const ch = await col('channels').findOne({ _id: id });
  if (!ch) return null;
  const st = await statsFor([id]);
  return channelView(ch, st[id]);
}

const HANDLE_RE = /^[a-z0-9_]{3,30}$/;

async function createChannel(sub, { name, handle, description }) {
  name = String(name || '').trim();
  handle = String(handle || '').trim().toLowerCase().replace(/^@/, '');
  description = String(description || '').trim().slice(0, 1000);
  if (name.length < 2 || name.length > 50) throw new HttpError(400, 'Название канала — от 2 до 50 символов');
  if (!HANDLE_RE.test(handle)) throw new HttpError(400, 'Адрес канала: 3–30 символов, латиница, цифры и «_»');
  const user = await getUser(sub);
  if (!user) throw new HttpError(401, 'Войдите в аккаунт');
  if (user.channelId) throw new HttpError(409, 'У вас уже есть канал');
  try {
    await col('channels').insertOne({ _id: handle, name, description, ownerSub: sub, subsCount: 0, createdAt: new Date() });
  } catch (e) {
    if (e.code === 11000) throw new HttpError(409, 'Этот адрес канала уже занят');
    throw e;
  }
  const r = await col('users').updateOne({ _id: sub, channelId: null }, { $set: { channelId: handle } });
  if (!r.modifiedCount) {
    await col('channels').deleteOne({ _id: handle });
    throw new HttpError(409, 'У вас уже есть канал');
  }
  return getChannelView(handle);
}

async function updateChannel(sub, { name, description }) {
  const user = await getUser(sub);
  if (!user || !user.channelId) throw new HttpError(404, 'Канал не найден');
  const set = {};
  if (name !== undefined) {
    name = String(name).trim();
    if (name.length < 2 || name.length > 50) throw new HttpError(400, 'Название канала — от 2 до 50 символов');
    set.name = name;
  }
  if (description !== undefined) set.description = String(description).trim().slice(0, 1000);
  if (Object.keys(set).length) await col('channels').updateOne({ _id: user.channelId }, { $set: set });
  return getChannelView(user.channelId);
}

async function getMe(sub) {
  const user = await getUser(sub);
  if (!user) return null;
  const [channel, likes, subs] = await Promise.all([
    user.channelId ? getChannelView(user.channelId) : null,
    col('likes').find({ sub }).project({ videoId: 1 }).toArray(),
    col('subs').find({ sub }).project({ channelId: 1 }).toArray()
  ]);
  return {
    user: { name: user.name, email: user.email, picture: user.picture },
    channel,
    likes: likes.map((l) => l.videoId),
    subs: subs.map((s) => s.channelId)
  };
}

/* ---------- чтение ленты ---------- */

async function getBootstrap() {
  const videos = await col('videos').find({}).sort({ createdAt: -1 }).limit(300).toArray();
  const channels = await col('channels').find({}).limit(1000).toArray();
  const stats = await statsFor(channels.map((c) => c._id));
  const map = {};
  channels.forEach((c) => { map[c._id] = channelView(c, stats[c._id]); });
  return { VIDEOS: videos.map(videoView), CHANNELS: map };
}

/* ---------- видео и медиа (GridFS) ---------- */

function saveMedia(stream, filename, contentType) {
  return new Promise((resolve, reject) => {
    const up = bucket.openUploadStream(filename, { metadata: { contentType } });
    stream.on('error', (e) => { up.destroy(); reject(e); });
    stream.on('limit', () => { up.abort().catch(() => {}); reject(Object.assign(new Error('Файл слишком большой'), { code: 'LIMIT' })); });
    up.on('error', reject);
    up.on('finish', () => resolve(String(up.id)));
    stream.pipe(up);
  });
}

async function deleteMedia(id) {
  try { await bucket.delete(new ObjectId(id)); } catch (e) { /* уже удалён */ }
}

async function statMedia(id) {
  let oid;
  try { oid = new ObjectId(id); } catch (e) { return null; }
  const f = await col('media.files').findOne({ _id: oid });
  return f ? { oid, length: f.length, contentType: (f.metadata && f.metadata.contentType) || 'application/octet-stream' } : null;
}

const readMedia = (oid, range) => bucket.openDownloadStream(oid, range ? { start: range.start, end: range.end + 1 } : undefined);

async function addVideo(sub, fields) {
  const user = await getUser(sub);
  if (!user || !user.channelId) throw new HttpError(403, 'Сначала создайте канал', 'no-channel');
  const doc = {
    id: 'v' + crypto.randomBytes(6).toString('hex'),
    channel: user.channelId,
    ownerSub: sub,
    title: fields.title,
    desc: fields.desc,
    category: fields.category,
    duration: fields.duration,
    views: 0,
    likes: 0,
    createdAt: new Date(),
    mediaId: fields.mediaId,
    media: '/api/media/' + fields.mediaId,
    thumbId: fields.thumbId || '',
    thumb: fields.thumbId ? '/api/media/' + fields.thumbId : ''
  };
  await col('videos').insertOne(doc);
  return videoView(doc);
}

async function removeVideo(id, sub) {
  const v = await col('videos').findOne({ id });
  if (!v) throw new HttpError(404, 'Видео не найдено');
  if (v.ownerSub !== sub) throw new HttpError(403, 'Можно удалять только свои видео');
  await col('videos').deleteOne({ id });
  await Promise.all([col('comments').deleteMany({ videoId: id }), col('likes').deleteMany({ videoId: id })]);
  if (v.mediaId) await deleteMedia(v.mediaId);
  if (v.thumbId) await deleteMedia(v.thumbId);
}

async function bumpViews(videoId) {
  const r = await col('videos').findOneAndUpdate({ id: videoId }, { $inc: { views: 1 } }, { returnDocument: 'after' });
  const v = r && (r.value !== undefined ? r.value : r);
  return v ? { views: v.views, viewsText: viewsText(v.views) } : null;
}

/* ---------- комментарии ---------- */

function commentView(c, viewerSub, ownerSub) {
  return {
    id: String(c._id),
    author: c.authorName,
    avatar: initials(c.authorName),
    color: PALETTE[hash(c.channelId || c.sub) % PALETTE.length][0],
    ago: agoText(c.createdAt),
    text: c.text,
    channel: c.channelId || null,
    canDelete: !!viewerSub && (c.sub === viewerSub || ownerSub === viewerSub)
  };
}

async function listComments(videoId, viewerSub) {
  const v = await col('videos').findOne({ id: videoId });
  if (!v) throw new HttpError(404, 'Видео не найдено');
  const rows = await col('comments').find({ videoId }).sort({ createdAt: -1 }).limit(300).toArray();
  return rows.map((c) => commentView(c, viewerSub, v.ownerSub));
}

async function addComment(videoId, sub, text) {
  text = String(text || '').trim().slice(0, 1000);
  if (!text) throw new HttpError(400, 'Введите комментарий');
  const [v, user] = await Promise.all([col('videos').findOne({ id: videoId }), getUser(sub)]);
  if (!v) throw new HttpError(404, 'Видео не найдено');
  if (!user) throw new HttpError(401, 'Войдите в аккаунт');
  let authorName = user.name;
  if (user.channelId) {
    const ch = await col('channels').findOne({ _id: user.channelId });
    if (ch) authorName = ch.name;
  }
  const doc = { videoId, sub, channelId: user.channelId || null, authorName, text, createdAt: new Date() };
  await col('comments').insertOne(doc);
  return commentView(doc, sub, v.ownerSub);
}

async function deleteComment(id, sub) {
  let oid;
  try { oid = new ObjectId(id); } catch (e) { throw new HttpError(404, 'Комментарий не найден'); }
  const c = await col('comments').findOne({ _id: oid });
  if (!c) throw new HttpError(404, 'Комментарий не найден');
  const v = await col('videos').findOne({ id: c.videoId });
  if (c.sub !== sub && !(v && v.ownerSub === sub)) throw new HttpError(403, 'Нет прав на удаление');
  await col('comments').deleteOne({ _id: oid });
}

/* ---------- лайки и подписки ---------- */

async function setLike(videoId, sub, on) {
  const v = await col('videos').findOne({ id: videoId });
  if (!v) throw new HttpError(404, 'Видео не найдено');
  if (on) {
    try { await col('likes').insertOne({ videoId, sub, createdAt: new Date() }); } catch (e) { if (e.code !== 11000) throw e; }
  } else {
    await col('likes').deleteOne({ videoId, sub });
  }
  const likes = await col('likes').countDocuments({ videoId });
  await col('videos').updateOne({ id: videoId }, { $set: { likes } });
  return { likes, liked: !!on };
}

async function setSubscription(sub, channelId, on) {
  const ch = await col('channels').findOne({ _id: channelId });
  if (!ch) throw new HttpError(404, 'Канал не найден');
  if (ch.ownerSub === sub) throw new HttpError(400, 'Нельзя подписаться на свой канал');
  if (on) {
    try { await col('subs').insertOne({ sub, channelId, createdAt: new Date() }); } catch (e) { if (e.code !== 11000) throw e; }
  } else {
    await col('subs').deleteOne({ sub, channelId });
  }
  const subsCount = await col('subs').countDocuments({ channelId });
  await col('channels').updateOne({ _id: channelId }, { $set: { subsCount } });
  return { subsNum: subsCount, subs: compactNum(subsCount), subscribed: !!on };
}

module.exports = {
  HttpError, connect, close, connected,
  upsertUser, getUser, getMe, createChannel, updateChannel, getChannelView,
  getBootstrap, addVideo, removeVideo, bumpViews,
  saveMedia, deleteMedia, statMedia, readMedia,
  listComments, addComment, deleteComment, setLike, setSubscription
};
