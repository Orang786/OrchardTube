// Слой данных: MongoDB (+GridFS для видео). Никаких демо-данных: всё создают пользователи.
const crypto = require('crypto');
const { MongoClient, GridFSBucket, ObjectId } = require('mongodb');

let client = null;
let db = null;
let bucket = null;

const col = (name) => db.collection(name);
const PUBLIC = { $or: [{ visibility: 'public' }, { visibility: { $exists: false } }] };
const connected = () => !!db;

/* ---------- роли ---------- */
// owner (создатель сайта, задаётся в OWNER_EMAILS) > admin > moderator > user
const RANK = { user: 0, moderator: 1, admin: 2, owner: 3 };
const OWNER_EMAILS = String(process.env.OWNER_EMAILS || process.env.OWNER_EMAIL || '')
  .split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);
const isOwnerEmail = (email) => OWNER_EMAILS.includes(String(email || '').toLowerCase());
const roleOf = (u) => (!u ? 'user' : isOwnerEmail(u.email) ? 'owner' : (RANK[u.role] !== undefined ? u.role : 'user'));
const rankOf = (u) => RANK[roleOf(u)];

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
    col('videos').createIndex({ mediaId: 1 }),
    col('videos').createIndex({ thumbId: 1 }),
    col('viewsDaily').createIndex({ channelId: 1, day: 1 }),
    col('viewsDaily').createIndex({ videoId: 1, day: 1 }, { unique: true }),
    col('audit').createIndex({ at: -1 }),
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
    description: ch.description || '',
    avatarUrl: ch.avatarId ? '/api/media/' + ch.avatarId : '',
    bannerUrl: ch.bannerId ? '/api/media/' + ch.bannerId : '',
    links: Array.isArray(ch.links) ? ch.links : [],
    joinedAt: ch.createdAt
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
    thumb: v.thumb || '',
    visibility: v.visibility || 'public',
    at: v.createdAt
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
  let user = await col('users').findOne({ _id: p.sub });
  const invite = await col('invites').findOne({ _id: String(p.email).toLowerCase() });
  if (invite) {
    await col('users').updateOne({ _id: p.sub }, { $set: { role: invite.role } });
    await col('invites').deleteOne({ _id: invite._id });
    await audit({ name: invite.by || 'система' }, 'role.invite_applied', p.email, { role: invite.role });
    user = await col('users').findOne({ _id: p.sub });
  }
  return user;
}

const getUser = (sub) => col('users').findOne({ _id: sub });

async function statsFor(ids) {
  const rows = await col('videos').aggregate([
    { $match: { channel: { $in: ids }, ...PUBLIC } },
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

const VISIBILITIES = ['public', 'unlisted', 'private'];
const dayKey = (d) => d.toISOString().slice(0, 10);
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

function cleanLinks(links) {
  if (!Array.isArray(links)) throw new HttpError(400, 'Некорректный список ссылок');
  const out = [];
  for (const l of links.slice(0, 5)) {
    const title = String(l && l.title || '').trim().slice(0, 30);
    let url = String(l && l.url || '').trim();
    if (!title && !url) continue;
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
    let u;
    try { u = new URL(url); } catch (e) { throw new HttpError(400, 'Некорректная ссылка: ' + url.slice(0, 60)); }
    if (!/^https?:$/.test(u.protocol) || !u.hostname.includes('.')) throw new HttpError(400, 'Некорректная ссылка: ' + url.slice(0, 60));
    if (url.length > 200) throw new HttpError(400, 'Ссылка слишком длинная');
    out.push({ title: title || u.hostname.replace(/^www\./, ''), url: u.href });
  }
  return out;
}

// kind: 'avatar' | 'banner'; mediaId '' — убрать картинку
async function setChannelImage(sub, kind, mediaId) {
  const user = await getUser(sub);
  if (!user || !user.channelId) { if (mediaId) await deleteMedia(mediaId); throw new HttpError(404, 'Канал не найден'); }
  const field = kind === 'avatar' ? 'avatarId' : 'bannerId';
  const ch = await col('channels').findOne({ _id: user.channelId });
  if (ch && ch[field]) await deleteMedia(ch[field]);
  await col('channels').updateOne({ _id: user.channelId }, mediaId ? { $set: { [field]: mediaId } } : { $unset: { [field]: '' } });
  return getChannelView(user.channelId);
}

async function updateChannel(sub, { name, description, links }) {
  const user = await getUser(sub);
  if (!user || !user.channelId) throw new HttpError(404, 'Канал не найден');
  const set = {};
  if (name !== undefined) {
    name = String(name).trim();
    if (name.length < 2 || name.length > 50) throw new HttpError(400, 'Название канала — от 2 до 50 символов');
    set.name = name;
  }
  if (description !== undefined) set.description = String(description).trim().slice(0, 1000);
  if (links !== undefined) set.links = cleanLinks(links);
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
    sub: user._id,
    role: roleOf(user),
    banned: user.banned ? { reason: user.banned.reason || '' } : null,
    channel,
    likes: likes.map((l) => l.videoId),
    subs: subs.map((s) => s.channelId)
  };
}

/* ---------- чтение ленты ---------- */

async function getBootstrap() {
  const banned = (await col('users').find({ banned: { $exists: true } }).project({ _id: 1 }).toArray()).map((u) => u._id);
  const videos = await col('videos').find({ ...PUBLIC, ownerSub: { $nin: banned } }).sort({ createdAt: -1 }).limit(300).toArray();
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
    visibility: VISIBILITIES.includes(fields.visibility) ? fields.visibility : 'public',
    createdAt: new Date(),
    mediaId: fields.mediaId,
    media: '/api/media/' + fields.mediaId,
    thumbId: fields.thumbId || '',
    thumb: fields.thumbId ? '/api/media/' + fields.thumbId : ''
  };
  await col('videos').insertOne(doc);
  return videoView(doc);
}

async function removeVideo(id, sub, force = false) {
  const v = await col('videos').findOne({ id });
  if (!v) throw new HttpError(404, 'Видео не найдено');
  if (!force && v.ownerSub !== sub) throw new HttpError(403, 'Можно удалять только свои видео');
  await col('videos').deleteOne({ id });
  await Promise.all([col('comments').deleteMany({ videoId: id }), col('likes').deleteMany({ videoId: id }), col('viewsDaily').deleteMany({ videoId: id })]);
  if (v.mediaId) await deleteMedia(v.mediaId);
  if (v.thumbId) await deleteMedia(v.thumbId);
  return v;
}

async function bumpViews(videoId) {
  const r = await col('videos').findOneAndUpdate({ id: videoId, visibility: { $ne: 'private' } }, { $inc: { views: 1 } }, { returnDocument: 'after' });
  const v = r && (r.value !== undefined ? r.value : r);
  if (v) {
    await col('viewsDaily').updateOne({ videoId, day: dayKey(new Date()) }, { $inc: { n: 1 }, $setOnInsert: { channelId: v.channel } }, { upsert: true });
  }
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
  if (!v || (v.visibility === 'private' && v.ownerSub !== sub && rankOf(user) < 1)) throw new HttpError(404, 'Видео не найдено');
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

async function deleteComment(id, sub, force = false) {
  let oid;
  try { oid = new ObjectId(id); } catch (e) { throw new HttpError(404, 'Комментарий не найден'); }
  const c = await col('comments').findOne({ _id: oid });
  if (!c) throw new HttpError(404, 'Комментарий не найден');
  const v = await col('videos').findOne({ id: c.videoId });
  if (!force && c.sub !== sub && !(v && v.ownerSub === sub)) throw new HttpError(403, 'Нет прав на удаление');
  await col('comments').deleteOne({ _id: oid });
  return c;
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


/* ---------- журнал действий ---------- */

async function audit(actor, action, target, details) {
  try {
    await col('audit').insertOne({
      at: new Date(), actorName: actor && (actor.name || actor.email) || '—', actorEmail: actor && actor.email || '',
      action, target: String(target || ''), details: details || {}
    });
  } catch (e) { /* журнал не должен ломать действие */ }
}

const escapeRe = (x) => String(x).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/* ---------- одно видео и редактирование автором ---------- */

// Видео доступно: открытое/по ссылке — всем; ограниченное — автору и персоналу
async function getVideoFor(id, viewer) {
  const v = await col('videos').findOne({ id });
  if (!v) return null;
  if (v.visibility === 'private' && !(viewer && (v.ownerSub === viewer._id || rankOf(viewer) >= 1))) return null;
  const owner = await getUser(v.ownerSub);
  if (owner && owner.banned && !(viewer && rankOf(viewer) >= 1)) return null;
  return { video: videoView(v), channel: await getChannelView(v.channel) };
}

async function updateVideo(id, sub, { title, desc, category, visibility }) {
  const v = await col('videos').findOne({ id });
  if (!v || v.ownerSub !== sub) throw new HttpError(404, 'Видео не найдено');
  const set = {};
  if (title !== undefined) {
    title = String(title).trim();
    if (!title || title.length > 120) throw new HttpError(400, 'Название — от 1 до 120 символов');
    set.title = title;
  }
  if (desc !== undefined) set.desc = String(desc).slice(0, 5000);
  if (category !== undefined) set.category = String(category).slice(0, 40);
  if (visibility !== undefined) {
    if (!VISIBILITIES.includes(visibility)) throw new HttpError(400, 'Недопустимый доступ');
    set.visibility = visibility;
  }
  if (Object.keys(set).length) await col('videos').updateOne({ id }, { $set: set });
  return videoView({ ...v, ...set });
}

async function setThumbnail(id, sub, thumbId) {
  const v = await col('videos').findOne({ id });
  if (!v || v.ownerSub !== sub) { await deleteMedia(thumbId); throw new HttpError(404, 'Видео не найдено'); }
  if (v.thumbId) await deleteMedia(v.thumbId);
  await col('videos').updateOne({ id }, { $set: { thumbId, thumb: '/api/media/' + thumbId } });
  return videoView({ ...v, thumbId, thumb: '/api/media/' + thumbId });
}

// Для проверки доступа к файлу: к какому видео относится медиа
async function videoOfMedia(mediaId) {
  return col('videos').findOne({ $or: [{ mediaId }, { thumbId: mediaId }] }, { projection: { visibility: 1, ownerSub: 1 } });
}

/* ---------- Студия автора ---------- */

function lastDays(n) {
  const out = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) out.push(dayKey(new Date(now.getTime() - i * 86400000)));
  return out;
}

async function commentsCountMap(videoIds) {
  const rows = await col('comments').aggregate([{ $match: { videoId: { $in: videoIds } } }, { $group: { _id: '$videoId', n: { $sum: 1 } } }]).toArray();
  const m = {};
  rows.forEach((r) => { m[r._id] = r.n; });
  return m;
}

const studioVideo = (v, cc) => ({ ...videoView(v), commentsCount: cc[v.id] || 0 });

async function studioVideos(sub) {
  const list = await col('videos').find({ ownerSub: sub }).sort({ createdAt: -1 }).limit(500).toArray();
  const cc = await commentsCountMap(list.map((v) => v.id));
  return list.map((v) => studioVideo(v, cc));
}

async function studioComments(sub) {
  const vids = await col('videos').find({ ownerSub: sub }).project({ id: 1, title: 1 }).toArray();
  const titles = {};
  vids.forEach((v) => { titles[v.id] = v.title; });
  const rows = await col('comments').find({ videoId: { $in: vids.map((v) => v.id) } }).sort({ createdAt: -1 }).limit(200).toArray();
  return rows.map((c) => ({ ...commentView(c, sub, sub), videoId: c.videoId, videoTitle: titles[c.videoId] || '' }));
}

async function studioAnalytics(sub, days) {
  days = [7, 28, 90, 365].includes(days) ? days : 28;
  const user = await getUser(sub);
  if (!user || !user.channelId) throw new HttpError(404, 'Канал не найден');
  const channelId = user.channelId;
  const keys = lastDays(days);
  const since = new Date(Date.now() - days * 86400000);
  const [viewsRows, subRows, vids] = await Promise.all([
    col('viewsDaily').find({ channelId, day: { $gte: keys[0] } }).toArray(),
    col('subs').find({ channelId, createdAt: { $gte: since } }).project({ createdAt: 1 }).toArray(),
    col('videos').find({ ownerSub: sub }).toArray()
  ]);
  const vMap = {}, sMap = {}, perVideo = {};
  viewsRows.forEach((r) => { vMap[r.day] = (vMap[r.day] || 0) + r.n; perVideo[r.videoId] = (perVideo[r.videoId] || 0) + r.n; });
  subRows.forEach((r) => { const d = dayKey(r.createdAt); sMap[d] = (sMap[d] || 0) + 1; });
  const series = keys.map((d) => ({ day: d, views: vMap[d] || 0, subs: sMap[d] || 0 }));
  const cc = await commentsCountMap(vids.map((v) => v.id));
  const likesPeriod = await col('likes').countDocuments({ videoId: { $in: vids.map((v) => v.id) }, createdAt: { $gte: since } });
  return {
    days,
    series,
    totals: {
      views: series.reduce((a, x) => a + x.views, 0),
      subs: series.reduce((a, x) => a + x.subs, 0),
      likes: likesPeriod,
      allViews: vids.reduce((a, v) => a + (v.views || 0), 0)
    },
    videos: vids
      .map((v) => ({ id: v.id, title: v.title, thumb: v.thumb || '', views: perVideo[v.id] || 0, total: v.views || 0, likes: v.likes || 0, comments: cc[v.id] || 0 }))
      .sort((a, b) => b.views - a.views || b.total - a.total)
  };
}

async function studioOverview(sub) {
  const user = await getUser(sub);
  if (!user || !user.channelId) throw new HttpError(404, 'Канал не найден');
  const [channel, videos, comments, analytics] = await Promise.all([
    getChannelView(user.channelId), studioVideos(sub), studioComments(sub), studioAnalytics(sub, 28)
  ]);
  return {
    channel,
    latest: videos[0] || null,
    totals: {
      videos: videos.length,
      views: videos.reduce((a, v) => a + v.views, 0),
      likes: videos.reduce((a, v) => a + v.likes, 0),
      comments: videos.reduce((a, v) => a + v.commentsCount, 0)
    },
    period: { days: 28, views: analytics.totals.views, subs: analytics.totals.subs, series: analytics.series },
    top: analytics.videos.slice(0, 5),
    comments: comments.slice(0, 5)
  };
}

/* ---------- админ-панель ---------- */

async function adminOverview() {
  const [users, channels, videos, comments, banned, staff, viewsAgg] = await Promise.all([
    col('users').countDocuments(), col('channels').countDocuments(), col('videos').countDocuments(), col('comments').countDocuments(),
    col('users').countDocuments({ banned: { $exists: true } }),
    col('users').countDocuments({ role: { $in: ['moderator', 'admin'] } }),
    col('videos').aggregate([{ $group: { _id: null, n: { $sum: '$views' } } }]).toArray()
  ]);
  const week = lastDays(7);
  const since = new Date(Date.now() - 7 * 86400000);
  const [newUsers, newVideos] = await Promise.all([
    col('users').countDocuments({ createdAt: { $gte: since } }), col('videos').countDocuments({ createdAt: { $gte: since } })
  ]);
  return { users, channels, videos, comments, banned, staff, views: viewsAgg[0] ? viewsAgg[0].n : 0, newUsers, newVideos, since: week[0] };
}

const adminUserView = (u, ch) => ({
  sub: u._id, name: u.name, email: u.email, picture: u.picture || '',
  role: roleOf(u), isOwner: isOwnerEmail(u.email),
  channelId: u.channelId || null, channelName: ch ? ch.name : '',
  createdAt: u.createdAt, lastLoginAt: u.lastLoginAt,
  banned: u.banned ? { reason: u.banned.reason || '', at: u.banned.at, by: u.banned.by || '' } : null
});

async function adminUsers(q, role) {
  const filter = {};
  if (q) {
    const re = new RegExp(escapeRe(q), 'i');
    filter.$or = [{ name: re }, { email: re }, { channelId: re }];
  }
  if (role === 'staff') filter.role = { $in: ['moderator', 'admin'] };
  else if (role === 'banned') filter.banned = { $exists: true };
  const users = await col('users').find(filter).sort({ createdAt: -1 }).limit(100).toArray();
  const chans = await col('channels').find({ _id: { $in: users.map((u) => u.channelId).filter(Boolean) } }).toArray();
  const cm = {};
  chans.forEach((c) => { cm[c._id] = c; });
  let list = users.map((u) => adminUserView(u, cm[u.channelId]));
  if (role === 'staff') list = list.concat(OWNER_EMAILS.length ? [] : []);
  return list;
}

async function adminInvites() {
  return (await col('invites').find({}).sort({ at: -1 }).toArray()).map((i) => ({ email: i._id, role: i.role, by: i.by, at: i.at }));
}

function assertCanAssign(actor, target, role) {
  if (!['user', 'moderator', 'admin'].includes(role)) throw new HttpError(400, 'Недопустимая роль');
  const ar = rankOf(actor);
  if (ar < RANK.admin) throw new HttpError(403, 'Выдавать роли могут только администраторы и владелец');
  if (target && isOwnerEmail(target.email)) throw new HttpError(403, 'Роль владельца изменить нельзя');
  if (target && actor._id === target._id) throw new HttpError(403, 'Нельзя менять собственную роль');
  if (target && !(ar > rankOf(target))) throw new HttpError(403, 'Нельзя менять роль пользователя с таким же или более высоким уровнем');
  if (!(ar > RANK[role])) throw new HttpError(403, 'Нельзя выдать роль не ниже своей');
}

async function adminSetRole(actor, targetSub, role) {
  const target = await getUser(targetSub);
  if (!target) throw new HttpError(404, 'Пользователь не найден');
  assertCanAssign(actor, target, role);
  await col('users').updateOne({ _id: targetSub }, { $set: { role } });
  await audit(actor, 'role.set', target.email, { from: roleOf(target), to: role });
  return adminUserView({ ...target, role }, null);
}

// Выдать роль по адресу Gmail: если человек уже входил — сразу, иначе при первом входе
async function adminGrantByEmail(actor, email, role) {
  email = String(email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, 'Введите корректный адрес почты');
  const target = await col('users').findOne({ email });
  assertCanAssign(actor, target, role);
  if (target) {
    await col('users').updateOne({ _id: target._id }, { $set: { role } });
    await audit(actor, 'role.set', email, { from: roleOf(target), to: role });
    return { applied: true };
  }
  if (role === 'user') throw new HttpError(400, 'Этот пользователь ещё не входил на сайт');
  await col('invites').updateOne({ _id: email }, { $set: { role, by: actor.name || actor.email, at: new Date() } }, { upsert: true });
  await audit(actor, 'role.invite', email, { role });
  return { applied: false };
}

async function adminCancelInvite(actor, email) {
  if (rankOf(actor) < RANK.admin) throw new HttpError(403, 'Недостаточно прав');
  await col('invites').deleteOne({ _id: String(email).toLowerCase() });
  await audit(actor, 'role.invite_cancel', email, {});
}

async function adminBan(actor, targetSub, banned, reason) {
  if (rankOf(actor) < RANK.moderator) throw new HttpError(403, 'Недостаточно прав');
  const target = await getUser(targetSub);
  if (!target) throw new HttpError(404, 'Пользователь не найден');
  if (actor._id === target._id) throw new HttpError(403, 'Нельзя заблокировать себя');
  if (!(rankOf(actor) > rankOf(target))) throw new HttpError(403, 'Нельзя заблокировать пользователя с таким же или более высоким уровнем');
  if (banned) {
    await col('users').updateOne({ _id: targetSub }, { $set: { banned: { at: new Date(), by: actor.name || actor.email, reason: String(reason || '').slice(0, 300) } } });
    await audit(actor, 'user.ban', target.email, { reason: String(reason || '').slice(0, 300) });
  } else {
    await col('users').updateOne({ _id: targetSub }, { $unset: { banned: '' } });
    await audit(actor, 'user.unban', target.email, {});
  }
}

async function adminVideos(q) {
  const filter = q ? { title: new RegExp(escapeRe(q), 'i') } : {};
  const list = await col('videos').find(filter).sort({ createdAt: -1 }).limit(100).toArray();
  const owners = await col('users').find({ _id: { $in: list.map((v) => v.ownerSub) } }).project({ name: 1, email: 1, banned: 1 }).toArray();
  const om = {};
  owners.forEach((o) => { om[o._id] = o; });
  return list.map((v) => ({
    ...videoView(v), ownerName: om[v.ownerSub] ? om[v.ownerSub].name : '', ownerEmail: om[v.ownerSub] ? om[v.ownerSub].email : '',
    ownerSub: v.ownerSub, ownerBanned: !!(om[v.ownerSub] && om[v.ownerSub].banned)
  }));
}

async function adminModerateDeleteVideo(actor, id) {
  const v = await removeVideo(id, actor._id, true);
  await audit(actor, 'video.delete', id, { title: v.title, channel: v.channel });
}

async function adminComments() {
  const rows = await col('comments').find({}).sort({ createdAt: -1 }).limit(100).toArray();
  const vids = await col('videos').find({ id: { $in: rows.map((c) => c.videoId) } }).project({ id: 1, title: 1 }).toArray();
  const t = {};
  vids.forEach((v) => { t[v.id] = v.title; });
  return rows.map((c) => ({ id: String(c._id), author: c.authorName, text: c.text, ago: agoText(c.createdAt), videoId: c.videoId, videoTitle: t[c.videoId] || '', sub: c.sub }));
}

async function adminModerateDeleteComment(actor, id) {
  const c = await deleteComment(id, actor._id, true);
  await audit(actor, 'comment.delete', id, { author: c.authorName, text: String(c.text).slice(0, 120) });
}

async function adminAudit() {
  return (await col('audit').find({}).sort({ at: -1 }).limit(150).toArray()).map((a) => ({
    at: a.at, actor: a.actorName, action: a.action, target: a.target, details: a.details
  }));
}

module.exports = {
  RANK, roleOf, rankOf, isOwnerEmail, audit,
  setChannelImage, getVideoFor, updateVideo, setThumbnail, videoOfMedia,
  studioVideos, studioComments, studioAnalytics, studioOverview,
  adminOverview, adminUsers, adminInvites, adminSetRole, adminGrantByEmail, adminCancelInvite, adminBan,
  adminVideos, adminModerateDeleteVideo, adminComments, adminModerateDeleteComment, adminAudit,

  HttpError, connect, close, connected,
  upsertUser, getUser, getMe, createChannel, updateChannel, getChannelView,
  getBootstrap, addVideo, removeVideo, bumpViews,
  saveMedia, deleteMedia, statMedia, readMedia,
  listComments, addComment, deleteComment, setLike, setSubscription
};
