// Слой данных: MongoDB, если задан MONGODB_URI; иначе — демо-данные из js/data.js
const path = require('path');
const demo = require(path.join(__dirname, 'js', 'data.js'));

let client = null;
let db = null;
let bucket = null;

const connected = () => !!db;

async function connect() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.log('[db] MONGODB_URI не задан — работаем на демо-данных из js/data.js');
    return false;
  }
  const { MongoClient } = require('mongodb');
  client = new MongoClient(uri, { serverSelectionTimeoutMS: 8000 });
  await client.connect();
  db = client.db(process.env.MONGODB_DB || 'orchardtube');
  const { GridFSBucket } = require('mongodb');
  bucket = new GridFSBucket(db, { bucketName: 'media' });
  console.log('[db] подключено к MongoDB');
  return true;
}

async function close() {
  if (client) await client.close();
}

/* ---------- вспомогательное ---------- */

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

function viewsText(n) {
  return `${Number(n).toLocaleString('ru-RU')} ${plural(n, 'просмотр', 'просмотра', 'просмотров')}`;
}

// Загруженные пользователем видео хранятся с createdAt; «ago» и «viewsText» считаем на лету
function decorate(v) {
  if (v.createdAt) {
    v.ago = agoText(v.createdAt);
    v.viewsText = viewsText(v.views || 0);
  }
  return v;
}

/* ---------- чтение ---------- */

async function getBootstrap() {
  if (!db) return { source: 'demo', ...demo };
  const [channels, videos, shorts, comments] = await Promise.all([
    db.collection('channels').find({}).toArray(),
    db.collection('videos').find({}).sort({ order: 1 }).toArray(),
    db.collection('shorts').find({}).sort({ order: 1 }).toArray(),
    db.collection('comments').find({}).sort({ order: 1 }).toArray()
  ]);
  if (!videos.length) return { source: 'demo', ...demo };
  const chMap = {};
  for (const c of channels) { chMap[c._id] = c; delete c._id; }
  const strip = (arr) => arr.map(({ _id, order, ...rest }) => rest);
  // свежие загрузки пользователей — в начало ленты
  const sorted = videos.slice().sort((a, b) => {
    const ua = a.createdAt ? 1 : 0, ub = b.createdAt ? 1 : 0;
    if (ua !== ub) return ub - ua;
    return ua ? new Date(b.createdAt) - new Date(a.createdAt) : (a.order || 0) - (b.order || 0);
  });
  return {
    source: 'mongodb',
    CHANNELS: chMap,
    VIDEOS: strip(sorted).map(decorate),
    SHORTS: strip(shorts),
    COMMENTS: strip(comments)
  };
}

/* ---------- комментарии ---------- */

async function addComment(videoId, comment) {
  if (!db) {
    // без БД комментарии живут только на клиенте (localStorage)
    return { ok: false, reason: 'no-db' };
  }
  const { order = 0 } = await db.collection('comments').findOne({}, { sort: { order: -1 } }) || {};
  const doc = { ...comment, videoId, order: order + 1 };
  await db.collection('comments').insertOne(doc);
  delete doc._id;
  return { ok: true, comment: doc };
}

/* ---------- лайки / подписки (счётчики) ---------- */

async function bumpLikes(videoId, delta) {
  if (!db) return { ok: false, reason: 'no-db' };
  await db.collection('videos').updateOne({ id: videoId }, { $inc: { likes: delta } });
  const v = await db.collection('videos').findOne({ id: videoId });
  return { ok: true, likes: v ? v.likes : null };
}

async function bumpSubs(channelId, delta) {
  if (!db) return { ok: false, reason: 'no-db' };
  await db.collection('channels').updateOne({ _id: channelId }, { $inc: { subsNum: delta } });
  return { ok: true };
}

/* ---------- загруженные видео и медиафайлы (GridFS) ---------- */

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
  const { ObjectId } = require('mongodb');
  try { await bucket.delete(new ObjectId(id)); } catch (e) { /* уже удалён */ }
}

async function statMedia(id) {
  const { ObjectId } = require('mongodb');
  let oid;
  try { oid = new ObjectId(id); } catch (e) { return null; }
  const f = await db.collection('media.files').findOne({ _id: oid });
  return f ? { oid, length: f.length, contentType: (f.metadata && f.metadata.contentType) || 'application/octet-stream' } : null;
}

function readMedia(oid, range) {
  return bucket.openDownloadStream(oid, range ? { start: range.start, end: range.end + 1 } : undefined);
}

async function addVideo(doc) {
  const { order = 0 } = await db.collection('videos').findOne({}, { sort: { order: -1 } }) || {};
  const full = { ...doc, createdAt: new Date(), order: order + 1 };
  await db.collection('videos').insertOne(full);
  const { _id, order: _o, ...rest } = full;
  return decorate(rest);
}

async function removeUserVideo(id) {
  const v = await db.collection('videos').findOne({ id });
  if (!v || !v.createdAt) return { ok: false, status: 404 };
  await db.collection('videos').deleteOne({ id });
  await db.collection('comments').deleteMany({ videoId: id });
  if (v.mediaId) await deleteMedia(v.mediaId);
  if (v.thumbId) await deleteMedia(v.thumbId);
  return { ok: true };
}

async function bumpViews(videoId) {
  if (!db) return { ok: false, reason: 'no-db' };
  await db.collection('videos').updateOne({ id: videoId }, { $inc: { views: 1 } });
  const v = await db.collection('videos').findOne({ id: videoId });
  return { ok: true, views: v ? v.views : null };
}

/* ---------- сид ---------- */

async function seed() {
  if (!db) throw new Error('MONGODB_URI не задан — сид некуда грузить');
  for (const name of ['channels', 'videos', 'shorts', 'comments']) {
    await db.collection(name).deleteMany({});
  }
  const channels = Object.entries(demo.CHANNELS).map(([id, c]) => ({ _id: id, ...c }));
  const videos = demo.VIDEOS.map((v, i) => ({ ...v, order: i }));
  const shorts = demo.SHORTS.map((s, i) => ({ ...s, order: i }));
  const comments = demo.COMMENTS.map((c, i) => ({ ...c, videoId: 'setup-2026', order: i }));
  await db.collection('channels').insertMany(channels);
  await db.collection('videos').insertMany(videos);
  await db.collection('shorts').insertMany(shorts);
  await db.collection('comments').insertMany(comments);
  return { channels: channels.length, videos: videos.length, shorts: shorts.length, comments: comments.length };
}

module.exports = {
  connect, close, connected, getBootstrap, addComment, bumpLikes, bumpSubs, bumpViews, seed,
  saveMedia, deleteMedia, statMedia, readMedia, addVideo, removeUserVideo
};
