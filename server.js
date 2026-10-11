const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');

const PORT = Number(process.env.PORT) || 8000;
const ROOT = path.resolve(__dirname);
const DATA_DIR = path.resolve(ROOT, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const LIBRARIES_FILE = path.join(DATA_DIR, 'libraries.json');
const MAX_AI_BODY_BYTES = 16 * 1024;
const AI_RATE_LIMIT = 20;
const AI_RATE_WINDOW_MS = 60 * 1000;
const aiRequestsByIp = new Map();
const lyricWordSyncRequests = new Map();
const PUBLIC_ROOT_FILES = new Set(['index.html', 'manifest.json', 'sw.js', 'favicon.svg', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png']);
const PUBLIC_DIRECTORIES = new Set(['css', 'js']);
const AUDIO_OUTPUT_PROBE = path.join(ROOT, 'scripts', 'windows-audio-output.ps1');
let windowsAudioStatusCache = { expiresAt: 0, value: null };
let windowsAudioStatusRequest = null;

const getWindowsAudioOutputStatus = () => {
  if (process.platform !== 'win32') return Promise.resolve({ available: false, isBluetooth: false });
  if (windowsAudioStatusCache.expiresAt > Date.now()) return Promise.resolve(windowsAudioStatusCache.value);
  if (windowsAudioStatusRequest) return windowsAudioStatusRequest;

  windowsAudioStatusRequest = new Promise((resolve) => {
    execFile('powershell.exe', [
      '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', AUDIO_OUTPUT_PROBE
    ], { windowsHide: true, timeout: 8000, maxBuffer: 16 * 1024 }, (error, stdout) => {
      let status = { available: false, isBluetooth: false };
      if (!error) {
        try {
          const parsed = JSON.parse(stdout.trim());
          status = {
            available: parsed.available === true,
            isBluetooth: parsed.available === true && parsed.isBluetooth === true
          };
        } catch (_) {}
      }
      windowsAudioStatusCache = { value: status, expiresAt: Date.now() + 5000 };
      resolve(status);
    });
  }).finally(() => {
    windowsAudioStatusRequest = null;
  });
  return windowsAudioStatusRequest;
};

// Load .env automatically if present
const loadDotEnv = () => {
  const envPath = path.resolve(ROOT, '.env');
  if (!fs.existsSync(envPath)) return;
  try {
    const raw = fs.readFileSync(envPath, 'utf8');
    raw.split(/\r?\n/).forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;
      const idx = trimmed.indexOf('=');
      if (idx > 0) {
        const key = trimmed.slice(0, idx).trim();
        let val = trimmed.slice(idx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        if (process.env[key] === undefined || process.env[key] === '') {
          process.env[key] = val;
        }
      }
    });
  } catch (err) {
    console.warn('[Env] Failed to read .env:', err.message);
  }
};
loadDotEnv();

const getSupabaseUrl = () => process.env.SUPABASE_URL || '';
const getSupabaseAnonKey = () => process.env.SUPABASE_ANON_KEY || '';
const isSupabaseConfigured = () => Boolean(getSupabaseUrl() && getSupabaseAnonKey());
const isFirebaseAuthConfigured = () => Boolean(process.env.FIREBASE_PROJECT_ID);
const isAccountAuthConfigured = () => isSupabaseConfigured() || isFirebaseAuthConfigured();
const isAiAuthRequired = () => process.env.AI_REQUIRE_AUTH === 'true' || process.env.NODE_ENV === 'production' || isAccountAuthConfigured();
const AUTH_ACCESS_COOKIE = 'aurafy_access_token';
const AUTH_REFRESH_COOKIE = 'aurafy_refresh_token';

// Local Auth & Library persistence
const loadJsonData = (filepath, fallback) => {
  try {
    if (fs.existsSync(filepath)) {
      const content = fs.readFileSync(filepath, 'utf8');
      return JSON.parse(content);
    }
  } catch (err) {
    console.warn('[Storage] Load error for', filepath, err.message);
  }
  return fallback;
};

const saveJsonData = (filepath, data) => {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(filepath, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.warn('[Storage] Save error for', filepath, err.message);
  }
};

let localUsers = loadJsonData(USERS_FILE, []);
let localLibraries = loadJsonData(LIBRARIES_FILE, {});
const localSessions = new Map(); // token -> { userId, expiresAt }

const hashPassword = (password, salt) => {
  return crypto.createHash('sha256').update(password + ':' + salt).digest('hex');
};

const findLocalUserByEmail = (email) => {
  const norm = String(email || '').trim().toLowerCase();
  return localUsers.find(u => (u.email || '').toLowerCase() === norm);
};

const findLocalUserById = (id) => {
  return localUsers.find(u => u.id === id);
};

const createLocalSession = (userId) => {
  const token = 'aurafy_' + crypto.randomBytes(24).toString('hex');
  const expiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000;
  localSessions.set(token, { userId, expiresAt });
  return token;
};

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg',
  '.woff2': 'font/woff2'
};

const sendJson = (res, status, value) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(value));
};

const getClientIp = (req) => (req.socket.remoteAddress || 'unknown').replace(/^::ffff:/, '');

const takeAiRateLimit = (ip) => {
  const now = Date.now();
  if (aiRequestsByIp.size > 1000) {
    for (const [key, timestamps] of aiRequestsByIp.entries()) {
      if (!timestamps.length || now - timestamps[timestamps.length - 1] >= AI_RATE_WINDOW_MS) aiRequestsByIp.delete(key);
    }
  }
  const recent = (aiRequestsByIp.get(ip) || []).filter((timestamp) => now - timestamp < AI_RATE_WINDOW_MS);
  if (recent.length >= AI_RATE_LIMIT) {
    aiRequestsByIp.set(ip, recent);
    return false;
  }
  recent.push(now);
  aiRequestsByIp.set(ip, recent);
  return true;
};

const takeLyricsWordSyncLimit = (key) => {
  const now = Date.now();
  const windowMs = 60 * 60 * 1000;
  if (lyricWordSyncRequests.size > 1000) {
    for (const [entryKey, timestamps] of lyricWordSyncRequests.entries()) {
      if (!timestamps.length || now - timestamps[timestamps.length - 1] >= windowMs) lyricWordSyncRequests.delete(entryKey);
    }
  }
  const recent = (lyricWordSyncRequests.get(key) || []).filter(timestamp => now - timestamp < windowMs);
  if (recent.length >= 4) {
    lyricWordSyncRequests.set(key, recent);
    return false;
  }
  recent.push(now);
  lyricWordSyncRequests.set(key, recent);
  return true;
};

const readJsonBody = (req, maxBytes) => new Promise((resolve, reject) => {
  let size = 0;
  const chunks = [];
  let tooLarge = false;
  req.on('data', (chunk) => {
    if (tooLarge) return;
    size += chunk.length;
    if (size > maxBytes) {
      tooLarge = true;
      chunks.length = 0;
      return;
    }
    chunks.push(chunk);
  });
  req.on('end', () => {
    if (tooLarge) return reject(Object.assign(new Error('Request body is too large.'), { statusCode: 413 }));
    if (size === 0) return reject(Object.assign(new Error('A JSON request body is required.'), { statusCode: 400 }));
    try {
      resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
    } catch (_) {
      reject(Object.assign(new Error('Invalid JSON request body.'), { statusCode: 400 }));
    }
  });
  req.on('error', reject);
});

const parseCookies = (req) => (req.headers.cookie || '').split(';').reduce((cookies, item) => {
  const separator = item.indexOf('=');
  if (separator < 0) return cookies;
  const key = item.slice(0, separator).trim();
  try { cookies[key] = decodeURIComponent(item.slice(separator + 1).trim()); } catch (_) {}
  return cookies;
}, {});

const secureCookieFlag = () => process.env.NODE_ENV === 'production' || process.env.RENDER === 'true' || process.env.RENDER_SERVICE_ID ? '; Secure' : '';

const setAuthCookies = (res, session) => {
  const secure = secureCookieFlag();
  res.setHeader('Set-Cookie', [
    `${AUTH_ACCESS_COOKIE}=${encodeURIComponent(session.access_token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.max(60, Number(session.expires_in) || 3600)}${secure}`,
    `${AUTH_REFRESH_COOKIE}=${encodeURIComponent(session.refresh_token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000${secure}`
  ]);
};

const clearAuthCookies = (res) => {
  const secure = secureCookieFlag();
  res.setHeader('Set-Cookie', [
    `${AUTH_ACCESS_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`,
    `${AUTH_REFRESH_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`
  ]);
};

const requestJson = (url, options = {}) => new Promise((resolve, reject) => {
  const parsedUrl = new URL(url);
  const transport = parsedUrl.protocol === 'http:' ? http : https;
  const body = options.body === undefined || options.body === null
    ? ''
    : (typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
  const headers = { Accept: 'application/json', ...(options.headers || {}) };
  if (body) {
    headers['Content-Type'] = 'application/json';
    headers['Content-Length'] = Buffer.byteLength(body);
  }
  const upstream = transport.request(parsedUrl, {
    method: options.method || 'GET',
    headers,
    timeout: options.timeout || 12000
  }, (response) => {
    let raw = '';
    response.setEncoding('utf8');
    response.on('data', chunk => { raw += chunk; });
    response.on('end', () => {
      let data = null;
      try { data = raw ? JSON.parse(raw) : {}; } catch (_) { data = { message: 'Invalid response from account service.' }; }
      resolve({ status: response.statusCode || 502, data });
    });
  });
  upstream.on('timeout', () => upstream.destroy(new Error('Upstream request timed out.')));
  upstream.on('error', reject);
  if (body) upstream.write(body);
  upstream.end();
});

let firebaseSigningKeys = { keys: null, expiresAt: 0 };
let firebaseSigningKeysRequest = null;
const getFirebaseSigningKeys = () => {
  if (firebaseSigningKeys.keys && firebaseSigningKeys.expiresAt > Date.now()) {
    return Promise.resolve(firebaseSigningKeys.keys);
  }
  if (firebaseSigningKeysRequest) return firebaseSigningKeysRequest;

  const request = new Promise((resolve, reject) => {
    const upstream = https.get('https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com', { timeout: 10000 }, (response) => {
      let raw = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => {
        raw += chunk;
        if (raw.length > 256 * 1024) upstream.destroy(new Error('Firebase signing key response is too large.'));
      });
      response.on('end', () => {
        if (response.statusCode !== 200) return reject(Object.assign(new Error('Firebase signing keys are unavailable.'), { statusCode: 503 }));
        try {
          const keys = JSON.parse(raw);
          if (!keys || typeof keys !== 'object' || Array.isArray(keys)) throw new Error('Invalid signing key response.');
          const cacheControl = String(response.headers['cache-control'] || '');
          const maxAgeValue = (cacheControl.match(/max-age=(\d+)/i) || [])[1];
          const maxAge = maxAgeValue === undefined ? 3600 : Number(maxAgeValue);
          firebaseSigningKeys = { keys, expiresAt: Date.now() + Math.min(maxAge, 86400) * 1000 };
          resolve(keys);
        } catch (error) {
          reject(Object.assign(new Error('Firebase signing keys could not be read.'), { statusCode: 503 }));
        }
      });
    });
    upstream.on('timeout', () => upstream.destroy(new Error('Firebase signing key request timed out.')));
    upstream.on('error', (error) => reject(Object.assign(error, { statusCode: 503 })));
  });
  firebaseSigningKeysRequest = request.then(
    (keys) => { firebaseSigningKeysRequest = null; return keys; },
    (error) => { firebaseSigningKeysRequest = null; throw error; }
  );
  return firebaseSigningKeysRequest;
};

const decodeJwtSegment = (segment) => Buffer.from(segment.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');

const verifyFirebaseIdToken = async (idToken, projectId) => {
  if (typeof idToken !== 'string' || idToken.length > 12000) throw new Error('Invalid Firebase ID token.');
  const parts = idToken.split('.');
  if (parts.length !== 3) throw new Error('Invalid Firebase ID token.');

  let header;
  let claims;
  try {
    header = JSON.parse(decodeJwtSegment(parts[0]));
    claims = JSON.parse(decodeJwtSegment(parts[1]));
  } catch (_) {
    throw new Error('Invalid Firebase ID token.');
  }
  if (!header || header.alg !== 'RS256' || typeof header.kid !== 'string') throw new Error('Invalid Firebase ID token.');

  const keys = await getFirebaseSigningKeys();
  const certificate = keys[header.kid];
  if (!certificate) throw new Error('Invalid Firebase ID token signature.');
  let signature;
  try {
    signature = Buffer.from(parts[2].replace(/-/g, '+').replace(/_/g, '/'), 'base64');
  } catch (_) {
    throw new Error('Invalid Firebase ID token signature.');
  }
  const signedData = `${parts[0]}.${parts[1]}`;
  if (!crypto.verify('RSA-SHA256', Buffer.from(signedData), certificate, signature)) {
    throw new Error('Invalid Firebase ID token signature.');
  }

  const now = Math.floor(Date.now() / 1000);
  const uid = typeof claims.sub === 'string' ? claims.sub : '';
  const email = typeof claims.email === 'string' ? claims.email.trim().toLowerCase() : '';
  if (claims.aud !== projectId || claims.iss !== `https://securetoken.google.com/${projectId}` ||
      !uid || uid.length > 128 || !Number.isFinite(claims.exp) || claims.exp <= now ||
      !Number.isFinite(claims.iat) || claims.iat > now + 300 ||
      !claims.firebase || !Number.isFinite(claims.firebase.auth_time) || claims.firebase.auth_time > now + 300 ||
      !/^\S+@\S+\.\S+$/.test(email)) {
    throw new Error('Firebase ID token claims are invalid or expired.');
  }

  return { uid, email, displayName: claims.name, avatar: claims.picture, signInProvider: claims.firebase.sign_in_provider };
};

// Warm Firebase's public signing-key cache at startup so the first sign-in avoids a cold fetch.
if (process.env.FIREBASE_PROJECT_ID) {
  getFirebaseSigningKeys().catch((error) => {
    console.warn('[Firebase] Signing-key prefetch failed; it will retry on sign-in:', error.message);
  });
}

const supabaseAuthRequest = (endpoint, options = {}) => requestJson(`${getSupabaseUrl().replace(/\/$/, '')}/auth/v1/${endpoint}`, {
  ...options,
  headers: { apikey: getSupabaseAnonKey(), ...(options.headers || {}) }
});

const publicUser = (user) => {
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName || user.name || (user.user_metadata && (user.user_metadata.display_name || user.user_metadata.full_name)) || (user.email ? user.email.split('@')[0] : 'User'),
    avatar: user.avatar || user.picture || (user.user_metadata && (user.user_metadata.avatar_url || user.user_metadata.picture)) || '',
    provider: user.provider || 'email'
  };
};

const getAuthContext = async (req, res) => {
  const cookies = parseCookies(req);
  let accessToken = cookies[AUTH_ACCESS_COOKIE];

  // Check local session
  if (accessToken && localSessions.has(accessToken)) {
    const sess = localSessions.get(accessToken);
    if (sess.expiresAt > Date.now()) {
      const user = findLocalUserById(sess.userId);
      if (user) return { configured: true, user, accessToken, isLocal: true };
    } else {
      localSessions.delete(accessToken);
    }
  }

  return { configured: true, user: null };
};

const allowSameOriginMutation = (req) => {
  const origin = req.headers.origin;
  if (!origin) return true;
  const allowed = new Set([
    `http://${req.headers.host}`,
    `https://${req.headers.host}`,
    'capacitor://localhost',
    'ionic://localhost',
    ...(process.env.APP_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean)
  ]);
  return allowed.has(origin);
};

const handleAuthRoute = async (req, res, pathname) => {
  if (!allowSameOriginMutation(req)) return sendJson(res, 403, { error: 'This request origin is not allowed.' });

  // ── Firebase Session (accept only a verified Firebase ID token) ──
  if (pathname === '/api/auth/firebase-session' && req.method === 'POST') {
    let input;
    try { input = await readJsonBody(req, 16 * 1024); }
    catch (error) { return sendJson(res, error.statusCode || 400, { error: error.message }); }

    const projectId = process.env.FIREBASE_PROJECT_ID || '';
    if (!projectId) return sendJson(res, 503, { error: 'Firebase Authentication is not configured on this server.' });
    if (typeof input.idToken !== 'string' || !input.idToken) return sendJson(res, 401, { error: 'A Firebase ID token is required.' });

    let identity;
    try {
      identity = await verifyFirebaseIdToken(input.idToken, projectId);
    } catch (error) {
      if (error.statusCode === 503) {
        console.warn('[Firebase] Could not retrieve ID token signing keys:', error.message);
        return sendJson(res, 503, { error: 'Firebase could not be reached to verify your sign-in. Please try again.' });
      }
      console.warn('[Firebase] Rejected an unverified ID token:', error.message);
      return sendJson(res, 401, { error: 'Firebase could not verify this sign-in. Please sign in again.' });
    }

    const { uid, email, displayName, avatar, signInProvider } = identity;
    const provider = signInProvider === 'google.com' ? 'google' : 'email';

    let user = findLocalUserById(uid) || findLocalUserByEmail(email);
    if (!user) {
      user = {
        id: uid,
        email,
        displayName: String(displayName || '').trim().slice(0, 80) || email.split('@')[0],
        avatar: String(avatar || '').trim().slice(0, 2048),
        provider,
        createdAt: new Date().toISOString()
      };
      localUsers.push(user);
      saveJsonData(USERS_FILE, localUsers);
    } else {
      user.email = email;
      if (displayName) user.displayName = String(displayName).trim().slice(0, 80);
      if (avatar) user.avatar = String(avatar).trim().slice(0, 2048);
      user.provider = provider;
      if (user.id !== uid) {
        const previousId = user.id;
        if (localLibraries[previousId] && !localLibraries[uid]) localLibraries[uid] = localLibraries[previousId];
        delete localLibraries[previousId];
        user.id = uid;
        saveJsonData(LIBRARIES_FILE, localLibraries);
      }
      saveJsonData(USERS_FILE, localUsers);
    }

    const token = createLocalSession(user.id);
    setAuthCookies(res, { access_token: token, refresh_token: token, expires_in: 30 * 24 * 3600 });
    return sendJson(res, 200, { user: publicUser(user), ok: true });
  }

  // ── Session ──────────────────────────────────────────────
  if (pathname === '/api/auth/session' && req.method === 'GET') {
    try {
      const auth = await getAuthContext(req, res);
      return sendJson(res, 200, { user: publicUser(auth.user) });
    } catch (_) {
      return sendJson(res, 200, { user: null });
    }
  }

  // ── Email / Password Sign In & Sign Up ────────────────────
  if ((pathname === '/api/auth/signup' || pathname === '/api/auth/signin') && req.method === 'POST') {
    let input;
    try { input = await readJsonBody(req, 8 * 1024); }
    catch (error) { return sendJson(res, error.statusCode || 400, { error: error.message }); }

    const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
    const password = typeof input.password === 'string' ? input.password : '';
    if (!/^\S+@\S+\.\S+$/.test(email) || email.length > 254) return sendJson(res, 400, { error: 'Enter a valid email address.' });
    if (password.length < 6 || password.length > 128) return sendJson(res, 400, { error: 'Password must be at least 6 characters.' });

    const isSignup = pathname.endsWith('/signup');

    // If Supabase is configured, try Supabase first
    if (isSupabaseConfigured()) {
      const endpoint = isSignup ? 'signup' : 'token?grant_type=password';
      const body = isSignup
        ? { email, password, data: { display_name: typeof input.displayName === 'string' ? input.displayName.trim().slice(0, 80) : '' } }
        : { email, password };
      try {
        const result = await supabaseAuthRequest(endpoint, { method: 'POST', body });
        if (result.status >= 200 && result.status < 300) {
          const session = result.data || {};
          if (session.access_token && session.refresh_token) {
            setAuthCookies(res, session);
            return sendJson(res, 200, { user: publicUser(session.user), needsEmailConfirmation: false });
          }
          return sendJson(res, 200, { user: publicUser(session.user), needsEmailConfirmation: isSignup });
        }
      } catch (err) {
        console.warn('[Auth] Supabase attempt failed, falling back to local store:', err.message);
      }
    }

    // Local Auth Handling (Always Works Out of the Box!)
    if (isSignup) {
      if (findLocalUserByEmail(email)) {
        return sendJson(res, 400, { error: 'An account with this email already exists. Please log in.' });
      }
      const salt = crypto.randomBytes(16).toString('hex');
      const newUser = {
        id: 'usr_' + Date.now().toString(36) + '_' + crypto.randomBytes(4).toString('hex'),
        email,
        passwordHash: hashPassword(password, salt),
        salt,
        displayName: (typeof input.displayName === 'string' ? input.displayName.trim() : '') || email.split('@')[0],
        avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(input.displayName || email)}&background=FF2A85&color=fff`,
        provider: 'email',
        createdAt: new Date().toISOString()
      };
      localUsers.push(newUser);
      saveJsonData(USERS_FILE, localUsers);
      const token = createLocalSession(newUser.id);
      setAuthCookies(res, { access_token: token, refresh_token: token, expires_in: 30 * 24 * 3600 });
      return sendJson(res, 200, { user: publicUser(newUser), needsEmailConfirmation: false });
    } else {
      const user = findLocalUserByEmail(email);
      if (!user) {
        return sendJson(res, 400, { error: 'No account found with this email. Please sign up.' });
      }
      if (user.passwordHash && user.salt) {
        if (hashPassword(password, user.salt) !== user.passwordHash) {
          return sendJson(res, 400, { error: 'Incorrect password. Please try again.' });
        }
      }
      const token = createLocalSession(user.id);
      setAuthCookies(res, { access_token: token, refresh_token: token, expires_in: 30 * 24 * 3600 });
      return sendJson(res, 200, { user: publicUser(user), needsEmailConfirmation: false });
    }
  }

  // ── Sign Out ─────────────────────────────────────────────
  if (pathname === '/api/auth/signout' && req.method === 'POST') {
    const cookies = parseCookies(req);
    const accessToken = cookies[AUTH_ACCESS_COOKIE];
    if (accessToken && localSessions.has(accessToken)) {
      localSessions.delete(accessToken);
    }
    clearAuthCookies(res);
    return sendJson(res, 200, { ok: true });
  }

  // ── Library Sync ─────────────────────────────────────────
  if (pathname === '/api/library' && (req.method === 'GET' || req.method === 'PUT')) {
    let auth;
    try { auth = await getAuthContext(req, res); }
    catch (_) { return sendJson(res, 503, { error: 'Account service is temporarily unavailable.' }); }
    if (!auth.user) return sendJson(res, 401, { error: 'Sign in to sync your library.' });

    // Local library handling
    if (auth.isLocal || !isSupabaseConfigured()) {
      if (req.method === 'GET') {
        const userLib = localLibraries[auth.user.id] || null;
        return sendJson(res, 200, { data: userLib });
      }
      let input;
      try { input = await readJsonBody(req, 1024 * 1024); }
      catch (error) { return sendJson(res, error.statusCode || 400, { error: error.message }); }
      if (!input.data || typeof input.data !== 'object') return sendJson(res, 400, { error: 'Library data must be an object.' });
      localLibraries[auth.user.id] = input.data;
      saveJsonData(LIBRARIES_FILE, localLibraries);
      return sendJson(res, 200, { ok: true });
    }

    // Supabase library handling
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || getSupabaseAnonKey();
    const base = `${getSupabaseUrl().replace(/\/$/, '')}/rest/v1/user_libraries`;
    const headers = { apikey: getSupabaseAnonKey(), Authorization: `Bearer ${serviceRoleKey}` };
    try {
      if (req.method === 'GET') {
        const result = await requestJson(`${base}?select=data&user_id=eq.${encodeURIComponent(auth.user.id)}&limit=1`, { headers });
        if (result.status >= 200 && result.status < 300) {
          const row = Array.isArray(result.data) ? result.data[0] : null;
          return sendJson(res, 200, { data: row && row.data && typeof row.data === 'object' ? row.data : null });
        }
        // Fallback to local
        return sendJson(res, 200, { data: localLibraries[auth.user.id] || null });
      }
      let input;
      try { input = await readJsonBody(req, 1024 * 1024); }
      catch (error) { return sendJson(res, error.statusCode || 400, { error: error.message }); }
      if (!input.data || typeof input.data !== 'object') return sendJson(res, 400, { error: 'Library data must be an object.' });
      const payload = JSON.stringify([{ user_id: auth.user.id, data: input.data, updated_at: new Date().toISOString() }]);
      await requestJson(`${base}?on_conflict=user_id`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload), Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: payload
      });
      localLibraries[auth.user.id] = input.data;
      saveJsonData(LIBRARIES_FILE, localLibraries);
      return sendJson(res, 200, { ok: true });
    } catch (_) {
      // Local fallback
      localLibraries[auth.user.id] = input ? input.data : null;
      saveJsonData(LIBRARIES_FILE, localLibraries);
      return sendJson(res, 200, { ok: true });
    }
  }

  return sendJson(res, 404, { error: 'Unknown account route.' });
};

const proxyGet = (res, pathname) => {
  const upstream = https.request({
    hostname: 'saavn-api.vercel.app',
    path: pathname,
    method: 'GET',
    headers: { 'User-Agent': 'AurafyMusic/1.0' },
    timeout: 15000
  }, (upstreamRes) => {
    const headers = { 'Content-Type': upstreamRes.headers['content-type'] || 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
    res.writeHead(upstreamRes.statusCode || 502, headers);
    upstreamRes.pipe(res);
  });
  upstream.on('timeout', () => upstream.destroy(new Error('Music search service timed out.')));
  upstream.on('error', () => {
    if (!res.headersSent) sendJson(res, 502, { error: 'Music search service is unavailable.' });
    else res.destroy();
  });
  upstream.end();
};

const proxyAi = async (req, res, ip) => {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed.' });
  if (!process.env.GROQ_API_KEY) return sendJson(res, 503, { error: 'AI is not configured on this server.' });
  let rateLimitKey = ip;
  const authRequired = isAiAuthRequired();
  if (authRequired && !isAccountAuthConfigured()) return sendJson(res, 503, { error: 'AI access requires Firebase Authentication or Supabase Auth to be configured on this server.' });
  if (authRequired) {
    let auth;
    try { auth = await getAuthContext(req, res); }
    catch (_) { return sendJson(res, 503, { error: 'Account service is temporarily unavailable.' }); }
    if (!auth.user) return sendJson(res, 401, { error: 'Sign in to use the AI assistant.' });
    rateLimitKey = auth.user.id;
  }
  if (!takeAiRateLimit(rateLimitKey)) return sendJson(res, 429, { error: 'AI request limit reached. Try again in a minute.' });

  let input;
  try {
    input = await readJsonBody(req, MAX_AI_BODY_BYTES);
  } catch (error) {
    if (!res.headersSent) sendJson(res, error.statusCode || 400, { error: error.message });
    return;
  }

  const messages = Array.isArray(input.messages) ? input.messages : [];
  const userText = messages.length === 1 && messages[0] && messages[0].role === 'user' && typeof messages[0].content === 'string'
    ? messages[0].content.trim()
    : '';
  if (!userText || userText.length > 3000) return sendJson(res, 400, { error: 'A user prompt of 1 to 3000 characters is required.' });

  const body = JSON.stringify({
    model: 'openai/gpt-oss-120b',
    messages: [{ role: 'user', content: userText }],
    temperature: 0.7,
    response_format: { type: 'json_object' }
  });

  const upstream = https.request({
    hostname: 'api.groq.com',
    path: '/openai/v1/chat/completions',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`
    },
    timeout: 30000
  }, (upstreamRes) => {
    res.writeHead(upstreamRes.statusCode || 502, {
      'Content-Type': upstreamRes.headers['content-type'] || 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    });
    upstreamRes.pipe(res);
  });
  upstream.on('timeout', () => upstream.destroy(new Error('AI service timed out.')));
  upstream.on('error', () => {
    if (!res.headersSent) sendJson(res, 502, { error: 'AI service is unavailable.' });
    else res.destroy();
  });
  upstream.end(body);
};

const proxyLyricsWordSync = async (req, res, ip) => {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed.' });
  if (!allowSameOriginMutation(req)) return sendJson(res, 403, { error: 'This request origin is not allowed.' });
  if (!process.env.GROQ_API_KEY) return sendJson(res, 503, { error: 'Word sync is not configured on this server.' });

  let rateLimitKey = ip;
  const authRequired = isAiAuthRequired();
  if (authRequired && !isAccountAuthConfigured()) return sendJson(res, 503, { error: 'AI access requires Firebase Authentication or Supabase Auth to be configured on this server.' });
  if (authRequired) {
    let auth;
    try { auth = await getAuthContext(req, res); }
    catch (_) { return sendJson(res, 503, { error: 'Account service is temporarily unavailable.' }); }
    if (!auth.user) return sendJson(res, 401, { error: 'Sign in before generating word timing.' });
    rateLimitKey = auth.user.id;
  }
  if (!takeLyricsWordSyncLimit(rateLimitKey)) {
    return sendJson(res, 429, { error: 'Word timing can be generated for up to four songs per hour. Please try again later.' });
  }

  let input;
  try { input = await readJsonBody(req, 12 * 1024); }
  catch (error) { return sendJson(res, error.statusCode || 400, { error: error.message }); }
  if (!input || typeof input !== 'object' || Array.isArray(input)) return sendJson(res, 400, { error: 'Track details are required.' });

  let audioUrl;
  try { audioUrl = new URL(String(input.audioUrl || '')); }
  catch (_) { return sendJson(res, 400, { error: 'This track does not have a usable audio stream.' }); }
  const audioHost = audioUrl.hostname.toLowerCase();
  const isSaavnCdn = audioHost === 'saavncdn.com' || audioHost.endsWith('.saavncdn.com') || audioHost === 'jiosaavn.com' || audioHost.endsWith('.jiosaavn.com');
  if (audioUrl.protocol !== 'https:' || audioUrl.username || audioUrl.password || audioUrl.port || !isSaavnCdn) {
    return sendJson(res, 400, { error: 'Word sync is currently supported for secure Saavn audio streams only.' });
  }

  const title = String(input.title || '').trim().slice(0, 160);
  const artist = String(input.artist || '').trim().slice(0, 220);
  const lyrics = String(input.lyrics || '').trim().slice(0, 6000);
  const duration = Number(input.duration) || 0;
  if (!title || !artist || !lyrics || duration < 1 || duration > 900) {
    return sendJson(res, 400, { error: 'A supported track with timed lyrics and a duration under 15 minutes is required.' });
  }

  const language = String(input.language || '').trim().toLowerCase();
  const supportedLanguages = new Set(['en', 'hi', 'pa', 'bn', 'ta', 'te', 'ur', 'mr', 'gu', 'kn', 'ml']);
  const prompt = `Transcribe sung vocals in the lyrics' original Latin spelling when possible. Song: ${title} by ${artist}. Known lyric excerpt for spelling: ${lyrics.slice(0, 320)}`;
  const body = JSON.stringify({
    model: 'whisper-large-v3-turbo',
    url: audioUrl.toString(),
    response_format: 'verbose_json',
    timestamp_granularities: ['word'],
    temperature: 0,
    prompt,
    ...(supportedLanguages.has(language) ? { language } : {})
  });

  const upstream = https.request({
    hostname: 'api.groq.com',
    path: '/openai/v1/audio/transcriptions',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`
    },
    timeout: 90000
  }, (upstreamRes) => {
    res.writeHead(upstreamRes.statusCode || 502, {
      'Content-Type': upstreamRes.headers['content-type'] || 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    });
    upstreamRes.pipe(res);
  });
  upstream.on('timeout', () => upstream.destroy(new Error('Word timing service timed out.')));
  upstream.on('error', () => {
    if (!res.headersSent) sendJson(res, 502, { error: 'Word timing service is unavailable. Try again later.' });
    else res.destroy();
  });
  upstream.end(body);
};

const server = http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), geolocation=()');

  let requestUrl;
  try {
    requestUrl = new URL(req.url, 'http://localhost');
  } catch (_) {
    return sendJson(res, 400, { error: 'Invalid request URL.' });
  }
  const pathname = requestUrl.pathname;
  const ip = getClientIp(req);

  if (pathname === '/healthz') {
    if (req.method !== 'GET' && req.method !== 'HEAD') return sendJson(res, 405, { error: 'Method not allowed.' });
    return sendJson(res, 200, { status: 'ok' });
  }

  if (pathname === '/api/audio-output') {
    if (req.method !== 'GET') return sendJson(res, 405, { error: 'Method not allowed.' });
    // This endpoint reads the host machine's audio route, so keep it local-only.
    if (ip !== '127.0.0.1' && ip !== '::1') return sendJson(res, 404, { error: 'Not found.' });
    res.setHeader('Cache-Control', 'no-store');
    return sendJson(res, 200, await getWindowsAudioOutputStatus());
  }

  if (pathname === '/api/config') {
    if (req.method !== 'GET') return sendJson(res, 405, { error: 'Method not allowed.' });
    return sendJson(res, 200, {
      hasGroqKey: Boolean(process.env.GROQ_API_KEY),
      hasAccounts: true,
      firebaseApiKey: process.env.FIREBASE_API_KEY || '',
      firebaseAuthDomain: process.env.FIREBASE_AUTH_DOMAIN || '',
      firebaseProjectId: process.env.FIREBASE_PROJECT_ID || '',
      isSupabaseDbConfigured: isSupabaseConfigured()
    });
  }

  if (pathname === '/api/config/supabase-db') {
    if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed.' });
    let input;
    try { input = await readJsonBody(req, 8 * 1024); }
    catch (err) { return sendJson(res, 400, { error: err.message }); }

    const url = (input.supabaseUrl || '').trim();
    const anonKey = (input.supabaseAnonKey || '').trim();
    if (!url || !anonKey) return sendJson(res, 400, { error: 'Both Supabase URL and Anon Key are required.' });

    process.env.SUPABASE_URL = url;
    process.env.SUPABASE_ANON_KEY = anonKey;

    try {
      const envPath = path.resolve(ROOT, '.env');
      let envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
      const setEnvVar = (name, val) => {
        if (envContent.includes(name + '=')) {
          envContent = envContent.replace(new RegExp(name + '=.*(?:\\r?\\n|$)'), `${name}=${val}\n`);
        } else {
          envContent += `\n${name}=${val}`;
        }
      };
      setEnvVar('SUPABASE_URL', url);
      setEnvVar('SUPABASE_ANON_KEY', anonKey);
      fs.writeFileSync(envPath, envContent.trim() + '\n', 'utf8');
    } catch (err) {
      console.warn('[Env] Could not save .env:', err.message);
    }

    return sendJson(res, 200, { ok: true, isSupabaseDbConfigured: true });
  }

  if (pathname.startsWith('/api/auth/') || pathname === '/api/library') {
    return handleAuthRoute(req, res, pathname);
  }

  if (pathname === '/api/groq/openai/v1/chat/completions') {
    return proxyAi(req, res, ip);
  }

  if (pathname === '/api/lyrics/word-sync') {
    return proxyLyricsWordSync(req, res, ip);
  }

  if (pathname.startsWith('/api/')) {
    if (req.method !== 'GET') return sendJson(res, 405, { error: 'Method not allowed.' });
    const musicPath = pathname.replace(/^\/api/, '');
    if (!/^\/(search|album|lyrics)\/[A-Za-z0-9%._~-]{1,500}$/.test(musicPath)) {
      return sendJson(res, 404, { error: 'Unknown music API route.' });
    }
    return proxyGet(res, musicPath);
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') return sendJson(res, 405, { error: 'Method not allowed.' });

  let decodedPath;
  try {
    decodedPath = decodeURIComponent(pathname);
  } catch (_) {
    return sendJson(res, 400, { error: 'Invalid file path.' });
  }
  const relativePath = decodedPath === '/' ? 'index.html' : decodedPath.replace(/^\/+/, '');
  const filePath = path.resolve(ROOT, relativePath);
  if (filePath !== ROOT && !filePath.startsWith(ROOT + path.sep)) return sendJson(res, 403, { error: 'Forbidden.' });
  const publicRelativePath = path.relative(ROOT, filePath);
  const publicSegments = publicRelativePath.split(path.sep);
  const isPublicRootFile = publicSegments.length === 1 && PUBLIC_ROOT_FILES.has(publicRelativePath);
  const isPublicAsset = publicSegments.length > 1 && PUBLIC_DIRECTORIES.has(publicSegments[0]);
  if (!isPublicRootFile && !isPublicAsset) return sendJson(res, 404, { error: 'File not found.' });

  fs.readFile(filePath, (error, content) => {
    if (error) return sendJson(res, error.code === 'ENOENT' ? 404 : 500, { error: error.code === 'ENOENT' ? 'File not found.' : 'Unable to read file.' });
    const ext = path.extname(filePath).toLowerCase();
    const isCode = ext === '.html' || ext === '.js' || ext === '.css' || ext === '.json';
    res.writeHead(200, {
      'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
      'Cache-Control': isCode ? 'no-cache, no-store, must-revalidate, max-age=0' : 'public, max-age=3600',
      'Pragma': isCode ? 'no-cache' : 'public',
      'Expires': isCode ? '0' : '3600'
    });
    res.end(req.method === 'HEAD' ? undefined : content);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server listening on 0.0.0.0:${PORT}`);
});
