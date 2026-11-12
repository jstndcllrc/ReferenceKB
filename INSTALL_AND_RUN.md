# Fusion Annotation Guide - Installation, Running & Deployment Guide

## Project Overview
A secure knowledge base application for annotation guidance with search, chat, notepad, knowledge submission, and admin dashboard features.

## Prerequisites
- **Node.js** v20+ (required for `node:sqlite` experimental module)
- **npm** (comes with Node.js)
- **Git** (for version control)

---

## Installation Commands

### 1. Clone the Repository
```bash
git clone <your-repo-url>
cd "Fusion Annotation Guide"
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Create Environment Configuration
Create a `.env` file in the project root:

```env
# Server Configuration
HOST=127.0.0.1
PORT=3000
NODE_ENV=development

# Security
PRODUCTION=false
TRUST_PROXY=false
COOKIE_SECURE=false
SHOW_LOGIN_USERS=true

# Root password recovery (generate a secure random string for production)
ROOT_RESET_SECRET=your-secure-random-secret-at-least-20-chars

# Optional: Local Vision AI (Ollama)
OLLAMA_URL=http://localhost:11434
OLLAMA_VISION_MODEL=llava

# Paths
ROOT=.
KB_DIR=./knowledge-base
```

**Important**: For production, generate a secure `ROOT_RESET_SECRET`:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## Running the Application

### Development Mode (with auto-reload)
```bash
npm run dev
```

### Production Mode
```bash
npm start
```

### Direct Node (if npm scripts don't work)
```bash
node server.js
```

### Expected Output
```
(node:xxx) ExperimentalWarning: SQLite is an experimental feature and might change at any time
Knowledge base running at http://127.0.0.1:3000

╔═══════════════════════════════════════════════════════════════════╗
║  FIRST RUN - DEFAULT ACCOUNTS CREATED WITH RANDOM PASSWORDS      ║
╠═══════════════════════════════════════════════════════════════════╣
║  Username: admin                                                  ║
║  Password: <randomly-generated-20-char-password>                  ║
║  Role: Root / Developer (must change password on first login)    ║
╠═══════════════════════════════════════════════════════════════════╣
║  Username: fusioncx                                               ║
║  Password: <randomly-generated-20-char-password>                  ║
║  Role: User (must change password on first login)                ║
╚═══════════════════════════════════════════════════════════════════╝

IMPORTANT: Save these passwords now. They will not be shown again.
Users must change their password on first login.
```

---

## Default Test Credentials (After First Run)
> **Note**: These are the randomly generated passwords from the first run. Save them!

If you need to reset to known passwords for testing:
```bash
node -e "
const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const { passwordHash } = require('./src/security');
const config = require('./src/config');
const db = new DatabaseSync(path.join(config.KB_DIR, 'node-data.sqlite'));
db.prepare('UPDATE users SET password_hash=?, must_change_password=0 WHERE username=?').run(passwordHash('AdminTest123!'), 'admin');
db.prepare('UPDATE users SET password_hash=?, must_change_password=0 WHERE username=?').run(passwordHash('FusionTest123!'), 'fusioncx');
console.log('Passwords reset to known values');
"
```

Then login with:
- **Admin**: `admin` / `AdminTest123!`
- **User**: `fusioncx` / `FusionTest123!`

---

## Feature Verification Checklist

All the following features have been tested and confirmed working:

### ✅ Authentication & Security
- [x] Login page loads with CSRF token
- [x] Session-based authentication with HttpOnly cookies
- [x] CSRF protection on all state-changing operations
- [x] Timing-safe CSRF comparison (prevents timing attacks)
- [x] Rate limiting per user per endpoint
- [x] Secure password hashing (scrypt)
- [x] Content Security Policy (strict, no unsafe-inline/eval)
- [x] Security headers: X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy
- [x] Login attempt tracking with automatic cleanup (no memory leak)
- [x] Password change on first login (must_change_password flag)

### ✅ Core Features
- [x] **Search**: Full-text search with FTS5, parameterized queries (SQL injection protected)
- [x] **Chat**: Team room, direct messages, group chats, file attachments
- [x] **Notepad**: Private notes with auto-save
- [x] **Knowledge Submission**: Structured form with category hierarchy, image uploads
- [x] **Profile Management**: Full name, display name, contact info, chat name mode
- [x] **Notifications**: Unread count, mark as read
- [x] **Accuracy Review**: OCR text analysis against knowledge base
- [x] **Feedback**: User feedback submission with context

### ✅ Admin Dashboard
- [x] User management (create, update, delete, password reset)
- [x] Knowledge proposal review (approve/deny with notes)
- [x] Knowledge editor (manage published entries)
- [x] Feedback review
- [x] Accuracy tools (category rules, gold tests, reference images)
- [x] Statistics overview

### ✅ Static Assets
- [x] CSS: app.css, dashboard.css, login.css
- [x] JavaScript: app.js, dashboard.js
- [x] Shared module: knowledge-hierarchy.js
- [x] Local Tesseract.js OCR: tesseract.min.js + source map
- [x] All served with proper CSP headers

---

## Project Structure
```
Fusion Annotation Guide/
├── server.js              # Main HTTP server
├── package.json           # Dependencies & scripts
├── .env                   # Environment config (create this)
├── fusion.png             # Logo
├── node-app.html          # Main app template
├── node-dashboard.html    # Admin dashboard template
├── node-login.html        # Login template
├── node-change-password.html
├── src/
│   ├── config.js          # Configuration
│   ├── auth.js            # Authentication & sessions
│   ├── security.js        # Password hashing, file validation
│   └── migrations.js      # Database schema & indexes
├── public/
│   ├── app.css            # Main styles
│   ├── app.js             # Main client logic
│   ├── dashboard.css      # Dashboard styles
│   ├── dashboard.js       # Dashboard client logic
│   ├── login.css          # Login styles
│   ├── shared/
│   │   └── knowledge-hierarchy.js  # Shared category logic
│   └── tesseract/
│       ├── tesseract.min.js        # Local OCR library
│       └── tesseract.min.js.map    # Source map
└── knowledge-base/        # SQLite databases (auto-created)
    ├── node-data.sqlite   # App data
    └── kb-search.sqlite   # Search index (read-only)
```

---

## GitHub / Portfolio Deployment

### Option 1: GitHub Pages (Static Only - Not Suitable)
> ❌ This app requires a Node.js backend with SQLite. GitHub Pages only hosts static files.

### Option 2: Render.com (Recommended - Free Tier)
1. Push code to GitHub
2. Create account at render.com
3. New → Web Service → Connect GitHub repo
4. Configure:
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Environment Variables**: Add all from `.env` (set `PRODUCTION=true`, `COOKIE_SECURE=true`, generate `ROOT_RESET_SECRET`)
5. Add persistent disk for `knowledge-base` folder (1GB free)
6. Deploy

### Option 3: Railway.app (Free Tier)
1. Connect GitHub repo
2. Add environment variables
3. Deploy automatically

### Option 4: Fly.io (Free Tier)
```bash
flyctl launch
flyctl secrets set PRODUCTION=true COOKIE_SECURE=true ROOT_RESET_SECRET=...
flyctl volumes create knowledge_base --size 1
flyctl deploy
```

### Option 5: VPS (DigitalOcean, Linode, Hetzner)
1. Provision Ubuntu 22.04+ server
2. Install Node.js 20+: `curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt-get install -y nodejs`
3. Clone repo, `npm install`
4. Create systemd service:
```ini
# /etc/systemd/system/fusion-kb.service
[Unit]
Description=Fusion Knowledge Base
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/var/www/fusion-kb
ExecStart=/usr/bin/node server.js
Restart=on-failure
Environment=NODE_ENV=production
Environment=PRODUCTION=true
Environment=COOKIE_SECURE=true
Environment=ROOT_RESET_SECRET=your-secret
Environment=HOST=0.0.0.0
Environment=PORT=3000

[Install]
WantedBy=multi-user.target
```
5. `sudo systemctl enable --now fusion-kb`
6. Set up Nginx reverse proxy with SSL (Let's Encrypt)

### Option 6: Docker Deployment
Create `Dockerfile`:
```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
RUN mkdir -p knowledge-base
EXPOSE 3000
CMD ["node", "server.js"]
```

Build & run:
```bash
docker build -t fusion-kb .
docker run -d -p 3000:3000 \
  -v fusion-kb-data:/app/knowledge-base \
  -e PRODUCTION=true \
  -e COOKIE_SECURE=true \
  -e ROOT_RESET_SECRET=your-secret \
  fusion-kb
```

---

## Production Checklist

Before deploying to production:
- [ ] Set `NODE_ENV=production`
- [ ] Set `PRODUCTION=true`
- [ ] Set `COOKIE_SECURE=true`
- [ ] Generate strong `ROOT_RESET_SECRET` (32+ chars)
- [ ] Set up HTTPS (TLS/SSL certificates)
- [ ] Configure reverse proxy (Nginx/Caddy) for SSL termination
- [ ] Set `TRUST_PROXY=true` if behind proxy
- [ ] Configure backup strategy for `knowledge-base/` folder
- [ ] Set up monitoring/alerting
- [ ] Review rate limits for your traffic
- [ ] Configure `OLLAMA_URL` and `OLLAMA_VISION_MODEL` if using local vision AI

---

## Troubleshooting

### Server won't start
```bash
# Check Node version
node --version  # Must be 20+

# Check for port conflicts
lsof -i :3000

# Run with debug
node --trace-warnings server.js
```

### Database errors
```bash
# Reset database (WARNING: destroys all data)
rm -rf knowledge-base/
node server.js  # Will re-run migrations
```

### Assets not loading (404)
- Ensure `public/` folder exists with all files
- Check server.js asset allowlist includes your files
- Verify file permissions

### CSP errors in browser console
- All inline scripts/styles must be removed (already done)
- Local Tesseract.js must be served from `/assets/tesseract/`
- No external CDN resources allowed

---

## Testing Commands

```bash
# Test health endpoint
curl http://localhost:3000/healthz

# Test login page
curl -I http://localhost:3000/login

# Test CSP headers
curl -I http://localhost:3000/login | grep -i content-security-policy

# Test rate limiting
for i in {1..35}; do curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3000/api/search -d "q=test" -H "Content-Type: application/json" -b "kb_session=..."; done

# Test file upload validation (should reject)
# Try uploading a file with wrong magic number
```

---

## Security Features Implemented

| Vulnerability | Status | Fix |
|---|---|---|
| Hardcoded default passwords | ✅ Fixed | `generateSecurePassword()` with crypto.randomBytes |
| Login attempts memory leak | ✅ Fixed | Auto-cleanup + LRU eviction (10k max) |
| Anonymous session creation | ✅ Fixed | Only for authenticated users |
| SQL injection in search | ✅ Fixed | Regex tokenization + parameterized queries |
| Race condition in sessions | ⚠️ Partial | Check inside transaction, needs UNIQUE constraint |
| Missing rate limiting | ✅ Fixed | Token bucket per user/endpoint (15+ endpoints) |
| CSRF timing attack | ✅ Fixed | `crypto.timingSafeEqual` |
| Duplicate frontend code | ✅ Fixed | Shared `knowledge-hierarchy.js` module |
| Production error leakage | ✅ Fixed | `PRODUCTION` flag sanitizes responses |
| File signature validation | ✅ Fixed | Magic number checking (PNG/JPEG/WebP) |
| Missing database indexes | ✅ Fixed | 20+ indexes in migration v8 |
| Magic numbers | ✅ Fixed | Named constants throughout |
| Weak CSP | ✅ Fixed | Removed unsafe-inline/eval, CDN domains |
| External CDN dependency | ✅ Fixed | Tesseract.js hosted locally |

---

## License & Credits

Developed by JD1504 for Fusion Annotation Guide.
Tesseract.js v5.1.1 (Apache-2.0) bundled locally.
SQLite (Public Domain) via Node.js experimental module.

---

*Last updated: November 12, 2026*