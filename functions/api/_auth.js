// Cloudflare Pages Function Auth Helper - D1 & WebCrypto
const CORS_HEADERS = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With'
};

export const reply = (obj, status = 200, extraHeaders = {}) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: {
      ...CORS_HEADERS,
      'Content-Type': 'application/json; charset=utf-8',
      ...extraHeaders
    }
  });

function base64UrlEncodeBytes(uint8Array) {
  let bin = '';
  for (let i = 0; i < uint8Array.length; i++) {
    bin += String.fromCharCode(uint8Array[i]);
  }
  return btoa(bin).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function base64UrlEncodeStr(str) {
  const enc = new TextEncoder();
  return base64UrlEncodeBytes(enc.encode(str));
}

function base64UrlDecodeBytes(str) {
  let s = str.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const bin = atob(s);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    bytes[i] = bin.charCodeAt(i);
  }
  return bytes;
}

function base64UrlDecodeStr(str) {
  const dec = new TextDecoder();
  return dec.decode(base64UrlDecodeBytes(str));
}

export function randomHex(bytesCount = 16) {
  const bytes = new Uint8Array(bytesCount);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

export async function hashPassword(password, salt) {
  const enc = new TextEncoder();
  const data = enc.encode(`${salt}:${password}`);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer), b => b.toString(16).padStart(2, '0')).join('');
}

export async function verifyPassword(password, storedHash, salt) {
  const calculatedHash = await hashPassword(password, salt);
  return calculatedHash === storedHash;
}

export async function getJwtSecret(db) {
  await db.prepare('CREATE TABLE IF NOT EXISTS app_secrets (key TEXT PRIMARY KEY, value TEXT NOT NULL)').run();
  const row = await db.prepare('SELECT value FROM app_secrets WHERE key = "jwt_secret"').first();
  if (!row) {
    const newSecret = randomHex(32);
    await db.prepare('INSERT INTO app_secrets (key, value) VALUES ("jwt_secret", ?)').bind(newSecret).run();
    return newSecret;
  }
  return row.value;
}

export async function signJwt(payload, secretStr) {
  const enc = new TextEncoder();
  const header = { alg: 'HS256', typ: 'JWT' };
  const h64 = base64UrlEncodeStr(JSON.stringify(header));
  const p64 = base64UrlEncodeStr(JSON.stringify(payload));
  const msg = `${h64}.${p64}`;
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secretStr),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sigBuf = await crypto.subtle.sign('HMAC', key, enc.encode(msg));
  const s64 = base64UrlEncodeBytes(new Uint8Array(sigBuf));
  return `${msg}.${s64}`;
}

export async function verifyJwt(token, secretStr) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [h64, p64, s64] = parts;
  const enc = new TextEncoder();
  const msg = `${h64}.${p64}`;
  try {
    const key = await crypto.subtle.importKey(
      'raw',
      enc.encode(secretStr),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );
    const sigBytes = base64UrlDecodeBytes(s64);
    const valid = await crypto.subtle.verify('HMAC', key, sigBytes, enc.encode(msg));
    if (!valid) return null;
    const payload = JSON.parse(base64UrlDecodeStr(p64));
    if (payload.exp && (Date.now() / 1000) > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

export async function ensureUsersTable(db) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS app_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      salt TEXT NOT NULL,
      full_name TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin', 'approver', 'requester')),
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `).run();

  const adminUser = await db.prepare('SELECT id FROM app_users WHERE LOWER(username) = "admin"').first();
  if (!adminUser) {
    const salt = randomHex(16);
    const hash = await hashPassword('140792', salt);
    const now = new Date().toISOString();
    await db.prepare(`
      INSERT INTO app_users (username, password_hash, salt, full_name, role, is_active, created_at, updated_at)
      VALUES ('admin', ?, ?, 'Quản trị hệ thống', 'admin', 1, ?, ?)
    `).bind(hash, salt, now, now).run();
  }
}

export async function authenticateRequest(request, db) {
  let token = null;
  const authHeader = request.headers.get('Authorization') || request.headers.get('authorization');
  if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
    token = authHeader.slice(7).trim();
  }
  if (!token) {
    const cookieHeader = request.headers.get('Cookie') || request.headers.get('cookie') || '';
    const match = cookieHeader.match(/pka_session=([^;]+)/);
    if (match) token = decodeURIComponent(match[1].trim());
  }
  if (!token) {
    const customHeader = request.headers.get('X-Auth-Token');
    if (customHeader) token = customHeader.trim();
  }

  if (!token) return null;

  try {
    const secret = await getJwtSecret(db);
    const payload = await verifyJwt(token, secret);
    if (!payload || !payload.sub) return null;

    const user = await db.prepare(
      'SELECT id, username, full_name, role, is_active FROM app_users WHERE username = ?'
    ).bind(payload.sub).first();

    if (!user || user.is_active !== 1) return null;
    return user;
  } catch {
    return null;
  }
}
