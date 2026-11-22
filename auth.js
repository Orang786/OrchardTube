// Сессии (подписанная httpOnly-cookie) и проверка Google ID-токена.
const crypto = require('crypto');
const { OAuth2Client } = require('google-auth-library');

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const COOKIE = 'ot_session';
const MAX_AGE_MS = 30 * 24 * 3600 * 1000;

let SECRET = process.env.SESSION_SECRET || '';
if (!SECRET) {
  if (process.env.NODE_ENV === 'production') throw new Error('SESSION_SECRET не задан');
  SECRET = crypto.randomBytes(32).toString('hex');
  console.warn('[auth] SESSION_SECRET не задан — сессии сбросятся при перезапуске (только для разработки)');
}

const b64 = (buf) => Buffer.from(buf).toString('base64url');
const sign = (data) => crypto.createHmac('sha256', SECRET).update(data).digest('base64url');

function makeToken(sub) {
  const body = b64(JSON.stringify({ sub, exp: Date.now() + MAX_AGE_MS }));
  return body + '.' + sign(body);
}

function readToken(token) {
  if (!token || typeof token !== 'string') return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const want = Buffer.from(sign(body));
  const got = Buffer.from(sig);
  if (want.length !== got.length || !crypto.timingSafeEqual(want, got)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString());
    return p && p.sub && p.exp > Date.now() ? p.sub : null;
  } catch (e) { return null; }
}

function parseCookies(header) {
  const out = {};
  String(header || '').split(';').forEach((part) => {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  });
  return out;
}

const isSecure = (req) => req.secure || req.headers['x-forwarded-proto'] === 'https';

function setSession(req, res, sub) {
  res.setHeader('Set-Cookie', `${COOKIE}=${encodeURIComponent(makeToken(sub))}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${MAX_AGE_MS / 1000}${isSecure(req) ? '; Secure' : ''}`);
}

function clearSession(req, res) {
  res.setHeader('Set-Cookie', `${COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${isSecure(req) ? '; Secure' : ''}`);
}

// Кладёт req.sub, если есть валидная сессия
function sessionMiddleware(req, res, next) {
  req.sub = readToken(parseCookies(req.headers.cookie)[COOKIE]);
  next();
}

function requireAuth(req, res, next) {
  if (!req.sub) return res.status(401).json({ error: 'auth', message: 'Войдите в аккаунт Google' });
  next();
}

const googleClient = GOOGLE_CLIENT_ID ? new OAuth2Client(GOOGLE_CLIENT_ID) : null;

async function verifyGoogle(credential) {
  if (!googleClient) throw Object.assign(new Error('Вход через Google не настроен на сервере'), { status: 503 });
  let ticket;
  try {
    ticket = await googleClient.verifyIdToken({ idToken: String(credential || ''), audience: GOOGLE_CLIENT_ID });
  } catch (e) {
    throw Object.assign(new Error('Не удалось подтвердить вход через Google'), { status: 401 });
  }
  const p = ticket.getPayload();
  if (!p || !p.sub || !p.email || !p.email_verified) {
    throw Object.assign(new Error('Почта Google не подтверждена'), { status: 401 });
  }
  return { sub: p.sub, email: p.email, name: p.name, picture: p.picture };
}

module.exports = { GOOGLE_CLIENT_ID, sessionMiddleware, requireAuth, setSession, clearSession, verifyGoogle };
