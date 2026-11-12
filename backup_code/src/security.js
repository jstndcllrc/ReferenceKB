const crypto = require('node:crypto');
const path = require('node:path');

function passwordMatches(password, stored) {
  const [salt, hex] = stored.split(':');
  const actual = crypto.scryptSync(password, salt, 64);
  return crypto.timingSafeEqual(actual, Buffer.from(hex, 'hex'));
}

function passwordHash(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  return `${salt}:${crypto.scryptSync(password, salt, 64).toString('hex')}`;
}

function secretMatches(value, expected) {
  const actual = Buffer.from(String(value || ''));
  const wanted = Buffer.from(String(expected));
  return actual.length === wanted.length && crypto.timingSafeEqual(actual, wanted);
}

function safeFilename(name) {
  return path.basename(String(name || 'file')).replace(/[\x00-\x1f<>:"/\\|?*]+/g, '_').slice(0, 180) || 'file';
}

function attachmentAllowed(name, mime) {
  const blocked = /\.(?:html?|svg|js|mjs|exe|com|bat|cmd|ps1|php|sh)$/i;
  return !blocked.test(name) && !/(?:text\/html|image\/svg\+xml|javascript|x-msdownload)/i.test(mime);
}

module.exports = { passwordMatches, passwordHash, secretMatches, safeFilename, attachmentAllowed };
