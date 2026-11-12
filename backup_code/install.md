# Deployment Guide

This project is a Node.js application with SQLite databases. It is ready to upload as a zip bundle and run behind a normal HTTPS web server or reverse proxy.

## What you need

- Windows Server or Windows hosting with PowerShell access
- Node.js 24 or newer
- A public web server or reverse proxy
  - Apache 2.4+ is supported with the example config in `deploy\apache-vhost.conf.example`
  - Nginx or another reverse proxy also works if it forwards traffic to the Node app
- Permission to keep one long-running Node process online

Optional:

- Ollama, only if you want the advisory local vision feature

## What is in the upload package

Use `tests-upload.zip` for deployment. It contains:

- `server.js`
- `package.json`
- `src\`
- `public\`
- `deploy\`
- `scripts\`
- `knowledge-base\node-data.sqlite`
- `knowledge-base\kb-search.sqlite`
- HTML templates and static assets

## 1. Prepare the server

Install Node.js 24 or newer and confirm it:

```powershell
node -v
npm -v
```

Create a deployment folder, for example:

```powershell
New-Item -ItemType Directory -Path C:\apps\annotation-kb
```

Upload and extract `tests-upload.zip` into that folder.

## 2. Create the production environment file

From the extracted app folder:

```powershell
cd C:\apps\annotation-kb
Copy-Item deploy\production.env.example deploy\production.env
notepad deploy\production.env
```

Set at minimum:

```text
NODE_ENV=production
HOST=127.0.0.1
PORT=3000
TRUST_PROXY=true
COOKIE_SECURE=true
SHOW_LOGIN_USERS=false
ROOT_RESET_SECRET=replace-with-a-long-random-secret
```

`ROOT_RESET_SECRET` must be replaced with a new private value at least 20 characters long.

Leave these blank if you are not using Ollama:

```text
OLLAMA_URL=http://127.0.0.1:11434
OLLAMA_VISION_MODEL=
```

## 3. Start the application

Run:

```powershell
cd C:\apps\annotation-kb
npm run start:prod
```

The app should answer locally at:

```text
http://127.0.0.1:3000/healthz
```

Expected result:

```json
{"status":"ok"}
```

## 4. Put it behind HTTPS

Do not expose the Node process directly to the internet. Keep it on `127.0.0.1` and reverse-proxy public HTTPS traffic to it.

For Apache:

- Use `deploy\apache-vhost.conf.example` as your starting point
- Point the site domain to that vhost
- Enable SSL and proxy modules as needed

Required Apache capabilities:

- `mod_ssl`
- `mod_proxy`
- `mod_proxy_http`
- `mod_headers`
- `mod_rewrite`

The reverse proxy should forward requests to:

```text
http://127.0.0.1:3000
```

If you use another proxy, make sure it passes:

- `Host`
- `X-Forwarded-For`
- `X-Forwarded-Proto`

## 5. Keep Node running

This app needs one persistent Node process.

Good options on Windows:

- NSSM
- PM2 for Windows environments
- Task Scheduler with restart-on-failure logic
- A Windows service wrapper

At minimum, make sure the process restarts after reboot or crash.

## 6. Backups

Before and after important changes:

```powershell
npm run backup
```

Backups are written to `backups\`.

## 7. Updating the app

When you need to redeploy:

1. Create a fresh upload package from the workspace
2. Upload the new zip
3. Replace the app files on the server
4. Keep `deploy\production.env`
5. Keep or replace the SQLite files depending on whether you are deploying code only or code plus data
6. Restart the Node process

## Notes

- `npm install` is not required because this project currently uses only built-in Node modules.
- Apache and PHP are not required for app logic. Apache is only useful as a reverse proxy if you choose it.
- The project `.htaccess` is defensive and should not be treated as the main runtime path.
- Anyone who can reach the public URL can reach the login page.
- Never share `deploy\production.env`, recovery secrets, or raw database files.
