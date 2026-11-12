const crypto = require('node:crypto');

const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const LOGIN_BLOCK_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_LOGIN_ATTEMPTS = 5;

function createAuth({ db, cookieSecure = false, trustProxy = false, json }) {
  const loginAttempts = new Map();
  const hashToken = token => crypto.createHash('sha256').update(token).digest('hex');
  const sessionCookie = (token, maxAge = 86400) => `kb_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${cookieSecure ? '; Secure' : ''}`;

  function cookies(req) {
    return Object.fromEntries((req.headers.cookie || '').split(';').map(value => value.trim().split(/=(.*)/s)).filter(value => value[0]).map(([key, value]) => [key, decodeURIComponent(value || '')]));
  }

  function session(req, res) {
    const now = Date.now();
    db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(now);
    let token = cookies(req).kb_session;
    let row = token ? db.prepare('SELECT * FROM sessions WHERE id_hash=?').get(hashToken(token)) : null;
    if (!row) {
      // Create new session (persist even for anonymous users so CSRF works on login)
      token = crypto.randomBytes(32).toString('base64url');
      const csrf = crypto.randomBytes(24).toString('hex');
      db.prepare('INSERT INTO sessions(id_hash,user_id,csrf,expires_at,last_seen) VALUES(?,?,?,?,?)')
        .run(hashToken(token), null, csrf, now + SESSION_TTL_MS, now);
      row = { id_hash: hashToken(token), user_id: null, csrf, expires_at: now + SESSION_TTL_MS, last_seen: now };
      res.setHeader('Set-Cookie', sessionCookie(token));
    } else {
      // Update last_seen and expires for all sessions
      db.prepare('UPDATE sessions SET expires_at=?,last_seen=? WHERE id_hash=?').run(now + SESSION_TTL_MS, now, row.id_hash);
    }
    row.token = token;
    return row;
  }

  function currentUser(req, res) {
    const sess = session(req, res);
    if (!sess.user_id) return { sess, user: null };
    const user = db.prepare('SELECT id,username,display_name,role,is_root,chat_name_mode,can_chat,can_submit_knowledge,can_use_notepad,must_change_password FROM users WHERE id=? AND active=1').get(sess.user_id);
    if (!user) db.prepare('UPDATE sessions SET user_id=NULL WHERE id_hash=?').run(sess.id_hash);
    return { sess, user: user || null };
  }

  function requireUser(req, res, admin = false) {
    const state = currentUser(req, res);
    if (!state.user) { json(res, 401, { error: 'Sign in required.' }); return null; }
    if (admin && state.user.role !== 'admin') { json(res, 403, { error: 'Administrator access required.' }); return null; }
    return state;
  }

  function checkCsrf(req, res, state, body) {
    const token = req.headers['x-csrf-token'] || body.csrf;
    if (!token) {
      json(res, 419, { error: 'Invalid or expired form token.' });
      return false;
    }
    const csrfBuf = Buffer.from(state.sess.csrf);
    const tokenBuf = Buffer.from(String(token));
    // Use equal-length buffers for timing-safe comparison to prevent timing attacks
    const valid = tokenBuf.length === csrfBuf.length && crypto.timingSafeEqual(tokenBuf, csrfBuf);
    if (!valid) json(res, 419, { error: 'Invalid or expired form token.' });
    return Boolean(valid);
  }

  function loginAttemptKey(req, username) {
    const address = trustProxy ? String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress : req.socket.remoteAddress;
    return `${address}|${String(username).toLowerCase()}`;
  }

  function loginBlocked(key) {
    const now = Date.now(), item = loginAttempts.get(key);
    if (!item || item.reset <= now) { loginAttempts.delete(key); return false; }
    return item.count >= MAX_LOGIN_ATTEMPTS;
  }

  function recordLoginFailure(key) {
    const now = Date.now(), item = loginAttempts.get(key);
    loginAttempts.set(key, !item || item.reset <= now ? { count: 1, reset: now + LOGIN_BLOCK_WINDOW_MS } : { count: item.count + 1, reset: item.reset });
  }

  function clearLoginFailures(key) {
    loginAttempts.delete(key);
  }

  function establishSession(res, oldSession, userId, req) {
    const token = crypto.randomBytes(32).toString('base64url'), now = Date.now();
    db.exec('BEGIN');
    try {
      // Check for other sessions inside the transaction to prevent race condition
      const hadOtherSessions = Boolean(db.prepare('SELECT 1 FROM sessions WHERE user_id=? AND id_hash<>? LIMIT 1').get(userId, oldSession.id_hash));
      db.prepare('DELETE FROM sessions WHERE user_id=? AND id_hash<>?').run(userId, oldSession.id_hash);
      db.prepare('DELETE FROM sessions WHERE id_hash=?').run(oldSession.id_hash);
      db.prepare('INSERT INTO sessions(id_hash,user_id,csrf,expires_at,last_seen) VALUES(?,?,?,?,?)').run(hashToken(token), userId, crypto.randomBytes(24).toString('hex'), now + SESSION_TTL_MS, now);
      db.exec('COMMIT');

      // Clear login failures for this user after successful authentication
      if (req) {
        const key = loginAttemptKey(req, '');
        // We need the username to clear the correct key - get it from DB
        const user = db.prepare('SELECT username FROM users WHERE id=?').get(userId);
        if (user) {
          clearLoginFailures(loginAttemptKey(req, user.username));
        }
      }
    } catch (error) {
      try { db.exec('ROLLBACK'); } catch {}
      throw error;
    }
    res.setHeader('Set-Cookie', sessionCookie(token));
    return { replacedExistingSession: false }; // hadOtherSessions checked inside transaction now
  }

  function destroySession(res, state) {
    db.prepare('DELETE FROM sessions WHERE id_hash=?').run(state.sess.id_hash);
    res.setHeader('Set-Cookie', sessionCookie('', 0));
  }

  return { checkCsrf, clearLoginFailures, currentUser, destroySession, establishSession, loginAttemptKey, loginBlocked, recordLoginFailure, requireUser };
}

module.exports = { createAuth };
