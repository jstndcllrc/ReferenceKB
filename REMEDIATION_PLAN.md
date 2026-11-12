# Fusion Annotation Guide - Security Remediation Plan

## Overview
This document outlines the security vulnerabilities identified in the Fusion Annotation Guide application and the remediation steps applied. All changes were made to the codebase in `C:\Users\jstndcllr\Desktop\Virtual Assistant\Projects\Fusion Annotation Guide\`.

---

## Summary of Changes

| # | Vulnerability | Severity | Status | Files Modified |
|---|--------------|----------|--------|----------------|
| 1 | Hardcoded default passwords | Critical | ✅ Fixed | `src/migrations.js` |
| 2 | Login attempts memory leak | High | ✅ Fixed | `src/auth.js` |
| 3 | Session creation on every request | Medium | ✅ Fixed | `src/auth.js` |
| 4 | SQL injection in dynamic queries | High | ✅ Fixed | `server.js` |
| 5 | Race condition in session creation | Medium | ⚠️ Partially Fixed | `src/auth.js` |
| 6 | Missing rate limiting on API endpoints | High | ✅ Fixed | `server.js` |
| 7 | CSRF timing attack vulnerability | Medium | ✅ Fixed | `src/auth.js` |
| 8 | Duplicate frontend code (syncKnowledgeHierarchy) | Low | ✅ Fixed | `public/shared/knowledge-hierarchy.js`, `node-app.html`, `node-dashboard.html` |
| 9 | Production error message leakage | Medium | ✅ Fixed | `server.js` |
| 10 | Missing file signature validation | High | ✅ Fixed | `src/security.js`, `server.js` |
| 11 | Missing database indexes | Medium | ✅ Fixed | `src/migrations.js` |
| 12 | Magic numbers throughout codebase | Low | ✅ Fixed | `server.js`, `src/auth.js` |
| 13 | Weak Content Security Policy | Medium | ✅ Fixed | `server.js`, `node-app.html` |
| 14 | External CDN dependency (Tesseract.js) | Medium | ✅ Fixed | `public/tesseract/`, `node-app.html`, `server.js` |

---

## Detailed Remediation

### 1. Hardcoded Default Passwords (Critical)
**File:** `src/migrations.js`

**Problem:** The bootstrap process created default accounts with hardcoded passwords:
- `admin` / `Admin123!@#`
- `fusioncx` / `FusionCX2024!`

**Fix:** Implemented `generateSecurePassword()` function that creates cryptographically secure random passwords (20 characters). Passwords are displayed once on first run and users must change them on first login.

```javascript
function generateSecurePassword(length = 16) {
  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
  let password = '';
  const randomBytes = crypto.randomBytes(length);
  for (let i = 0; i < length; i++) {
    password += charset[randomBytes[i] % charset.length];
  }
  return password;
}
```

**Verification:** First run now shows randomly generated passwords that cannot be guessed.

---

### 2. Login Attempts Memory Leak (High)
**File:** `src/auth.js`

**Problem:** The `loginAttempts` Map was never cleaned up, causing unbounded memory growth over time.

**Fix:** Added automatic cleanup in `recordLoginFailure()`:
- Removes expired entries on every login attempt
- Enforces maximum size limit (10,000 entries) with LRU eviction
- Uses `Date.now()` for expiration checks

```javascript
function recordLoginFailure(key) {
  const now = Date.now();
  // Clean expired entries
  for (const [k, v] of loginAttempts) {
    if (v.reset <= now) loginAttempts.delete(k);
  }
  // Enforce max size
  if (loginAttempts.size > 10000) {
    const oldest = loginAttempts.keys().next().value;
    if (oldest) loginAttempts.delete(oldest);
  }
  // ... rest of function
}
```

---

### 3. Anonymous Session Creation on Every Request (Medium)
**File:** `src/auth.js`

**Problem:** `establishSession()` was called for every request (including unauthenticated), creating unnecessary database rows.

**Fix:** Modified `currentUser()` to only create sessions for authenticated users:

```javascript
// Before: establishSession() called unconditionally
// After: only called when user is authenticated
const { checkCsrf, clearLoginFailures, currentUser, destroySession, establishSession, ... } = createAuth({...});

// In route handlers: use requireUser() which only creates session for valid users
```

---

### 4. SQL Injection in Dynamic Queries (High)
**File:** `server.js`

**Problem:** The `tokens()`, `manualSearch()`, `kbSearch()`, and `exactSearch()` functions used string interpolation in SQL queries.

**Fix:** 
- `tokens()`: Uses regex to extract only alphanumeric Unicode characters
- All search functions: Use parameterized queries with `?` placeholders
- FTS5 queries: Properly escape double quotes for FTS5 syntax

```javascript
function tokens(query) {
  return [...new Set((String(query).toLowerCase().match(/[\p{L}\p{N}]+/gu) || []).filter(v => v.length > 1 && v.length <= 100))];
}

function kbSearch(query, limit = 20) {
  const parts = tokens(query);
  if (!parts.length) return [];
  const match = parts.map(t => `"${t.replaceAll('"', '""')}"*`).join(' OR ');
  return kbDb.prepare("SELECT ... FROM chunks_fts WHERE chunks_fts MATCH ? ORDER BY score LIMIT ?").all(match, limit);
}
```

---

### 5. Race Condition in Session Creation (Medium) ⚠️ Partially Fixed
**File:** `src/auth.js`

**Problem:** Check-then-act pattern in session creation could allow multiple sessions.

**Fix Attempted:** Moved session existence check inside the transaction:
```javascript
db.exec('BEGIN');
try {
  const existing = db.prepare('SELECT id_hash FROM sessions WHERE user_id=?').get(userId);
  if (existing) { /* handle existing session */ }
  // ... create new session
  db.exec('COMMIT');
} catch { db.exec('ROLLBACK'); }
```

**Status:** Partially fixed - the check is now inside the transaction, but a unique constraint on `user_id` in the sessions table would provide stronger protection.

---

### 6. Rate Limiting on API Endpoints (High)
**File:** `server.js`

**Problem:** No rate limiting on any API endpoints, allowing abuse.

**Fix:** Implemented token bucket rate limiting per user per endpoint:

```javascript
const rateLimitBuckets = new Map();
const RATE_LIMITS = {
  '/api/chat/messages': { POST: 30 },
  '/api/feedback': { POST: 10 },
  '/api/knowledge/proposals': { POST: 5 },
  '/api/search': { GET: 60 },
  '/api/review': { POST: 20 },
  '/api/notepad': { POST: 30 },
  '/api/profile': { POST: 10 },
  '/api/notifications': { POST: 30 },
  '/api/chat/read': { POST: 60 },
  '/api/chat/groups': { POST: 10 },
  '/api/chat/delete': { POST: 30 },
  '/api/ollama/vision': { POST: 10 },
  '/api/admin/': { POST: 50 },
};

function checkRateLimit(userId, path, method) { ... }
```

**Applied to:** 15+ endpoints including all write operations and search.

---

### 7. CSRF Timing Attack (Medium)
**File:** `src/auth.js`

**Problem:** CSRF token comparison used `===` instead of constant-time comparison.

**Fix:** Used `crypto.timingSafeEqual()`:

```javascript
function checkCsrf(req, res, state, body) {
  const token = String(body.csrf || '');
  const expected = state.sess.csrf;
  if (!crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected))) {
    send(res, 403, ...);
    return false;
  }
  return true;
}
```

---

### 8. Duplicate Frontend Code (Low)
**Files:** `public/shared/knowledge-hierarchy.js`, `node-app.html`, `node-dashboard.html`

**Problem:** `syncKnowledgeHierarchy()` and `KNOWLEDGE_LEVELS` duplicated in `app.js` and `dashboard.js`.

**Fix:** Created shared module:
- `public/shared/knowledge-hierarchy.js` - exports `KNOWLEDGE_LEVELS`, `syncKnowledgeHierarchy()`, `parseKnowledgeFromText()`, `buildKnowledgeTitle()`
- Both HTML templates now include: `<script src="/assets/shared/knowledge-hierarchy.js"></script>`

---

### 9. Production Error Message Leakage (Medium)
**File:** `server.js`

**Problem:** Stack traces and internal errors leaked to clients in production.

**Fix:** Added `PRODUCTION` flag to config, sanitized error responses:

```javascript
} catch(error){
  console.error(error);
  const duplicate = String(error.message).includes('UNIQUE');
  const status = error.status || (duplicate ? 409 : 500);
  let message;
  if (duplicate) {
    message = 'That value already exists.';
  } else if (status >= 500) {
    message = PRODUCTION ? 'The request could not be completed.' : 'Internal server error.';
  } else {
    message = error.message || 'Request failed.';
  }
  json(res, status, { error: message });
}
```

---

### 10. File Signature Validation (High)
**Files:** `src/security.js`, `server.js`

**Problem:** File uploads only checked MIME type and extension, not actual file content.

**Fix:** Added magic number validation:

```javascript
// src/security.js
const FILE_SIGNATURES = {
  'image/png': [[0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]],
  'image/jpeg': [[0xFF, 0xD8, 0xFF]],
  'image/webp': [[0x52, 0x49, 0x46, 0x46]],
};

function validateFileSignature(buffer, mimeType) { ... }

function attachmentAllowed(name, mime, buffer) {
  // ... existing checks ...
  if (buffer && buffer.length > 0) {
    if (mime === 'image/webp' && buffer.length >= 12) {
      if (buffer[8] !== 0x57 || buffer[9] !== 0x45 || buffer[10] !== 0x42 || buffer[11] !== 0x50) return false;
      return true;
    }
    if (!validateFileSignature(buffer, mime)) return false;
  }
  return true;
}
```

**Applied to:** Knowledge proposals, chat attachments, reference images, admin uploads.

---

### 11. Database Indexes (Medium)
**File:** `src/migrations.js` (migration v8)

**Problem:** Missing indexes on frequently queried columns.

**Fix:** Added 20+ indexes:

```javascript
const indexes = [
  'CREATE INDEX IF NOT EXISTS chat_messages_recipient_idx ON chat_messages(recipient_id)',
  'CREATE INDEX IF NOT EXISTS chat_messages_group_idx ON chat_messages(group_id)',
  'CREATE INDEX IF NOT EXISTS chat_messages_user_created_idx ON chat_messages(user_id, created_at)',
  'CREATE INDEX IF NOT EXISTS chat_messages_attachment_idx ON chat_messages(attachment_id)',
  'CREATE INDEX IF NOT EXISTS knowledge_proposals_user_idx ON knowledge_proposals(user_id)',
  'CREATE INDEX IF NOT EXISTS knowledge_proposals_status_idx ON knowledge_proposals(status)',
  'CREATE INDEX IF NOT EXISTS knowledge_proposals_created_idx ON knowledge_proposals(created_at)',
  'CREATE INDEX IF NOT EXISTS notifications_user_read_idx ON notifications(user_id, read_at)',
  'CREATE INDEX IF NOT EXISTS notifications_created_idx ON notifications(created_at)',
  'CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id)',
  'CREATE INDEX IF NOT EXISTS sessions_expires_idx ON sessions(expires_at)',
  'CREATE INDEX IF NOT EXISTS sessions_last_seen_idx ON sessions(last_seen)',
  'CREATE INDEX IF NOT EXISTS feedback_user_idx ON feedback(user_id)',
  'CREATE INDEX IF NOT EXISTS feedback_created_idx ON feedback(created_at)',
  'CREATE INDEX IF NOT EXISTS manual_entries_created_by_idx ON manual_entries(created_by)',
  'CREATE INDEX IF NOT EXISTS manual_entries_updated_idx ON manual_entries(updated_at)',
  'CREATE INDEX IF NOT EXISTS reference_images_category_idx ON reference_images(category_name, category_id)',
  'CREATE INDEX IF NOT EXISTS category_rules_name_idx ON category_rules(category_name)',
  'CREATE INDEX IF NOT EXISTS category_rules_id_idx ON category_rules(category_id)',
  'CREATE INDEX IF NOT EXISTS accuracy_runs_test_idx ON accuracy_runs(test_id)',
];
```

---

### 12. Magic Numbers Replaced with Named Constants (Low)
**Files:** `server.js`, `src/auth.js`

**Problem:** Hardcoded numeric values throughout the codebase.

**Fix:** Replaced with named constants:

```javascript
// server.js
const MAX_REQUEST_SIZE = 25000;
const MAX_CHAT_ATTACHMENT_SIZE = 5 * 1024 * 1024;
const MAX_KNOWLEDGE_IMAGE_SIZE = 5 * 1024 * 1024;
const MAX_VISION_IMAGE_SIZE = 5 * 1024 * 1024;
const MAX_NOTEPAD_SIZE = 50000;
const MAX_PROPOSAL_BODY_SIZE = 70 * 1024 * 1024;
const MAX_ADMIN_BODY_SIZE = 8 * 1024 * 1024;
const MAX_SEARCH_RESULTS = 20;
const MAX_LIVE_RESULTS = 8;
const MAX_CHAT_MESSAGES = 200;
const MAX_NOTIFICATIONS = 100;
const MAX_PROPOSAL_IMAGES = 10;
const MAX_KNOWLEDGE_IMAGES = 10;
const TOKEN_MIN_LENGTH = 2;
const TOKEN_MAX_LENGTH = 100;
const DEFAULT_RATE_LIMIT = 100;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const ONLINE_THRESHOLD_MS = 300000;
const PAGE_SIZE_DEFAULT = 20;
const PAGE_SIZE_MAX = 50;
const PAGE_SIZE_MIN = 5;
const HSTS_MAX_AGE = 31536000;
const CACHE_MAX_AGE = 3600;

// src/auth.js
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const LOGIN_BLOCK_WINDOW_MS = 15 * 60 * 1000;
const MAX_LOGIN_ATTEMPTS = 5;
const MAX_SESSIONS_PER_USER = 5;
const CSRF_TOKEN_BYTES = 32;
```

---

### 13. Content Security Policy Strengthened (Medium)
**Files:** `server.js`, `node-app.html`

**Problem:** CSP allowed `'unsafe-inline'` and `'unsafe-eval'` and loaded Tesseract.js from CDN.

**Fix:** 
- Removed `'unsafe-inline'` from `script-src` and `style-src`
- Removed `'unsafe-eval'`
- Removed CDN domains from CSP
- Host Tesseract.js locally at `/assets/tesseract/tesseract.min.js`

**New CSP:**
```
default-src 'self';
script-src 'self';
style-src 'self';
img-src 'self' data: blob:;
connect-src 'self';
worker-src 'self' blob:;
child-src blob:;
object-src 'none';
base-uri 'self';
frame-ancestors 'none';
form-action 'self'
```

---

### 14. External CDN Dependency Removed (Medium)
**Files:** `public/tesseract/`, `node-app.html`, `server.js`

**Problem:** Tesseract.js loaded from `cdn.jsdelivr.net`, creating supply chain risk and CSP complications.

**Fix:**
1. Downloaded Tesseract.js v5.1.1 to `public/tesseract/tesseract.min.js`
2. Updated `node-app.html` to load from local path
3. Added `tesseract/tesseract.min.js` and `tesseract/tesseract.min.js.map` to allowed static assets in `server.js`

---

## Testing Checklist

- [x] Server starts without errors
- [x] Login page loads with proper CSP headers
- [x] Static assets (CSS, JS, Tesseract.js) served correctly
- [x] CSP headers present and correct (no `unsafe-inline`, no CDN)
- [x] Rate limiting enforced on API endpoints
- [x] File upload validates magic numbers
- [x] Search functions use parameterized queries
- [x] CSRF tokens use timing-safe comparison
- [x] First run generates secure random passwords
- [x] No duplicate frontend code
- [x] Database indexes created
- [x] Named constants used throughout

---

## Remaining Items

### Partially Fixed
1. **Race condition in session creation** - Consider adding UNIQUE constraint on `sessions.user_id` for stronger protection

### Recommended Future Improvements
1. Add nonce-based CSP for inline scripts (if any remain)
2. Implement session rotation/renewal
3. Add audit logging for admin actions
4. Consider Redis for distributed rate limiting (currently in-memory)
5. Add automated security scanning to CI/CD

---

## Backup

A complete backup of the original codebase was created at:
```
C:\Users\jstndcllr\Desktop\Virtual Assistant\Projects\Fusion Annotation Guide\backup_code\
```

---

## Files Modified Summary

### Core Application
- `server.js` - Main server, CSP, rate limiting, static assets, search functions
- `src/auth.js` - Authentication, session management, CSRF, login attempts
- `src/security.js` - Password hashing, file validation, magic numbers
- `src/migrations.js` - Database schema, secure password generation, indexes
- `src/config.js` - Configuration (referenced)

### Frontend
- `node-app.html` - Main app template, local Tesseract.js
- `node-dashboard.html` - Admin dashboard template
- `public/shared/knowledge-hierarchy.js` - Shared knowledge hierarchy module (NEW)
- `public/tesseract/tesseract.min.js` - Local Tesseract.js (NEW)
- `public/tesseract/tesseract.min.js.map` - Source map (NEW)

### Documentation
- `REMEDIATION_PLAN.md` - This document

---

## Deployment Notes

### Installation
```bash
cd /path/to/Fusion\ Annotation\ Guide
npm install
```

### Running
```bash
# Development
npm run dev

# Production
npm start
```

### Environment Variables
Create `.env` file with:
```
HOST=127.0.0.1
PORT=3000
PRODUCTION=false
TRUST_PROXY=false
COOKIE_SECURE=false
SHOW_LOGIN_USERS=true
ROOT_RESET_SECRET=your-secure-random-secret
OLLAMA_URL=http://localhost:11434
OLLAMA_VISION_MODEL=llava
ROOT=.
KB_DIR=./knowledge-base
```

---

## Verification Commands

```bash
# Test CSP headers
curl -I http://localhost:3000/login | grep -i content-security-policy

# Test rate limiting
for i in {1..35}; do curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3000/api/search -d "q=test" -H "Content-Type: application/json" -b "kb_session=..."; done

# Test file upload validation
# Try uploading a file with wrong magic number - should be rejected

# Test search SQL injection
curl "http://localhost:3000/api/search?q=test'%20OR%201=1--" -b "kb_session=..."
```

---

*Generated: November 12, 2026*
*Project: Fusion Annotation Guide*