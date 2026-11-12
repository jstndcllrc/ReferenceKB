# ReferenceKB - YourCompany Knowledge Base

A secure, production-ready knowledge base application for annotation guidance with full-text search, real-time chat, notepad, knowledge submission workflow, and admin dashboard.

## 🎯 Purpose

Built for annotation teams to manage and search categorization guidance, submit knowledge for review, collaborate via chat, and maintain accuracy through structured review tools.

## ✨ Features

### Core Functionality
- **Full-Text Search** - FTS5-powered search with BM25 ranking across imported knowledge and manual entries
- **Knowledge Submission** - Structured forms with category hierarchy (8 levels), image uploads, QA audit tracking
- **Review Workflow** - Admin dashboard for approving/denying submissions with reviewer notes
- **Real-Time Chat** - Team room, direct messages, group chats, file/image attachments
- **Private Notepad** - Auto-saving personal notes per user
- **Accuracy Review** - OCR-assisted screenshot analysis against knowledge base
- **Feedback System** - User feedback with context (search query, OCR text, verdict)

### Security (14/14 Vulnerabilities Fixed)
- Session-based auth with HttpOnly cookies, CSRF protection (timing-safe)
- Scrypt password hashing, rate limiting (token bucket per user/endpoint)
- Strict CSP (no unsafe-inline/eval, nonce-based inline scripts)
- Magic number file validation (PNG/JPEG/WebP only)
- SQL injection prevention (parameterized queries, tokenization)
- Security headers: X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy

### Technical
- **Node.js 20+** with experimental `node:sqlite` (WAL mode, 20+ indexes)
- **Local Tesseract.js v5.1.1** OCR (no external API)
- **Shared module** for category hierarchy (eliminates duplication)
- **Zero external CDN dependencies** - all assets served locally

## 🏗 Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Browser       │────▶│  Node.js Server  │────▶│  SQLite (WAL)   │
│  (SPA + WASM)   │     │  (Express-like)  │     │  node-data.db   │
└─────────────────┘     └──────────────────┘     └─────────────────┘
                              │      │
                              ▼      ▼
                        ┌──────────────────┐
                        │  SQLite (Read)   │
                        │  kb-search.db    │  ← FTS5 Full-Text Search
                        └──────────────────┘
```

### Database Schema
- `users` - Accounts, roles, permissions, sessions
- `knowledge_proposals` - Pending submissions with images
- `manual_entries` - Approved searchable knowledge
- `chunks_fts` / `chunks_fts_data` - FTS5 search index
- `chat_messages`, `chat_groups`, `chat_attachments` - Real-time chat
- `notepads` - Private user notes
- `category_rules`, `reference_images`, `accuracy_tests` - Accuracy tools
- `notifications`, `feedback` - System notifications & user feedback

## 🚀 Quick Start

### Prerequisites
- Node.js 20+
- npm

### Local Development
```bash
# Clone
git clone https://github.com/jstndcllrc/ReferenceKB.git
cd ReferenceKB

# Install
npm install

# Run (development)
npm run dev

# Or production mode
npm start
```

### Default Accounts (First Run)
On first start, two accounts are created with random passwords:
- `admin` - Root/Developer (must change password)
- `yourcompanycx` - Regular User (must change password)

Check console output for passwords. For testing, reset to known values:
```bash
node -e "
const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const { passwordHash } = require('./src/security');
const db = new DatabaseSync(path.join('./knowledge-base', 'node-data.sqlite'));
db.prepare('UPDATE users SET password_hash=?, must_change_password=0 WHERE username=?').run(passwordHash('AdminTest123!'), 'admin');
db.prepare('UPDATE users SET password_hash=?, must_change_password=0 WHERE username=?').run(passwordHash('YourCompanyTest123!'), 'yourcompanycx');
console.log('Passwords reset');
"
```

Then login: `admin` / `AdminTest123!` or `yourcompanycx` / `YourCompanyTest123!`

## 🌐 Deployment

### Railway (Recommended - Free Tier + Persistent Volume)
1. Push to GitHub
2. [railway.app](https://railway.app) → New Project → Deploy from GitHub
3. Add Environment Variables:
   ```env
   NODE_ENV=production
   PRODUCTION=true
   COOKIE_SECURE=true
   ROOT_RESET_SECRET=<64-char-random>
   HOST=0.0.0.0
   PORT=3000
   TRUST_PROXY=true
   SHOW_LOGIN_USERS=false
   KB_DIR=/data
   ```
4. Settings → Volumes → Add: `knowledge-base` → Mount `/data` → 1 GB
5. Deploy

### Render
1. [render.com](https://render.com) → New Web Service
2. Connect repo, Build: `npm install`, Start: `npm start`
3. Add Environment Variables (same as above)
4. Settings → Disks → Add: `knowledge-base` → Mount `/var/www/yourcompany-kb/knowledge-base` → 1 GB
5. Deploy (requires Starter plan for persistent disk)

### Fly.io
```bash
flyctl launch
flyctl volumes create knowledge_base --size 1
flyctl secrets set NODE_ENV=production PRODUCTION=true COOKIE_SECURE=true ROOT_RESET_SECRET=... KB_DIR=/data
flyctl deploy
```

### Docker
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
```bash
docker build -t referencekb .
docker run -d -p 3000:3000 -v referencekb-data:/app/knowledge-base -e PRODUCTION=true -e COOKIE_SECURE=true -e ROOT_RESET_SECRET=... referencekb
```

## ⚙️ Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `HOST` | `127.0.0.1` | Bind address |
| `PORT` | `3000` | Port |
| `NODE_ENV` | `development` | `production` enables hardening |
| `PRODUCTION` | `false` | Strict CSP, secure cookies, error sanitization |
| `COOKIE_SECURE` | `false` | Secure cookies (requires HTTPS) |
| `TRUST_PROXY` | `false` | Trust X-Forwarded-* headers |
| `ROOT_RESET_SECRET` | *required in prod* | Root password recovery key |
| `SHOW_LOGIN_USERS` | `true` (dev) | Show username dropdown on login |
| `KB_DIR` | `./knowledge-base` | Database directory |
| `OLLAMA_URL` | `http://localhost:11434` | Local vision AI (optional) |
| `OLLAMA_VISION_MODEL` | `llava` | Model name (optional) |

## 📁 Project Structure

```
ReferenceKB/
├── server.js                 # Main HTTP server
├── package.json              # Dependencies & scripts
├── .env                      # Environment config (create locally)
├── yourcompany.png                # Logo
├── node-app.html             # Main app template
├── node-dashboard.html       # Admin dashboard template
├── node-login.html           # Login template
├── node-change-password.html # Password change template
├── src/
│   ├── config.js             # Configuration loader
│   ├── auth.js               # Sessions, CSRF, login tracking
│   ├── security.js           # Scrypt, file validation, safe filenames
│   └── migrations.js         # Schema, indexes, secure password gen
├── public/
│   ├── app.css               # Main styles
│   ├── app.js                # Main client logic
│   ├── dashboard.css         # Dashboard styles
│   ├── dashboard.js          # Dashboard client logic
│   ├── login.css             # Login styles
│   ├── shared/
│   │   └── knowledge-hierarchy.js  # Category hierarchy (shared)
│   └── tesseract/
│       ├── tesseract.min.js        # Local OCR (WASM)
│       └── tesseract.min.js.map    # Source map
└── knowledge-base/           # SQLite databases (auto-created)
    ├── node-data.sqlite      # Application data
    └── kb-search.sqlite      # FTS5 search index (read-only)
```

## 🔐 Security Highlights

| Vulnerability | Status | Mitigation |
|---------------|--------|------------|
| Hardcoded passwords | ✅ | `generateSecurePassword()` with crypto.randomBytes |
| Login attempts memory leak | ✅ | LRU eviction (10k max) + auto-cleanup |
| Anonymous sessions | ✅ | Sessions only for authenticated users |
| SQL injection (search) | ✅ | Regex tokenization + parameterized FTS5 |
| Session race condition | ⚠️ Partial | Check inside transaction |
| Missing rate limiting | ✅ | Token bucket per user/endpoint (15+) |
| CSRF timing attack | ✅ | `crypto.timingSafeEqual` |
| Duplicate frontend code | ✅ | Shared `knowledge-hierarchy.js` module |
| Production error leakage | ✅ | `PRODUCTION` flag sanitizes responses |
| File upload validation | ✅ | Magic number checking (PNG/JPEG/WebP) |
| Missing DB indexes | ✅ | 20+ indexes in migration v8 |
| Magic numbers | ✅ | Named constants throughout |
| Weak CSP | ✅ | Strict CSP, nonce-based inline scripts |
| External CDN dependency | ✅ | Tesseract.js bundled locally |

## 🧪 Testing

```bash
# Health check
curl http://localhost:3000/healthz

# Test CSP headers
curl -I http://localhost:3000/login | grep -i content-security-policy

# Test login flow
CSRF=$(curl -s -c cookies.txt http://localhost:3000/login | grep -oP 'name="csrf" value="\K[^"]+')
curl -s -b cookies.txt -c cookies.txt -X POST http://localhost:3000/login \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=admin&password=AdminTest123!&csrf=$CSRF"
```

## 📝 License

Developed for YourCompany Knowledge Base.  
Tesseract.js v5.1.1 (Apache-2.0) bundled locally.  
SQLite (Public Domain) via Node.js experimental module.

---

**Built with security-first principles for production deployment.**