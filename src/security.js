const crypto = require('node:crypto');
const path = require('node:path');

// File signature (magic number) validation
const FILE_SIGNATURES = {
  'image/png': [[0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]], // PNG
  'image/jpeg': [[0xFF, 0xD8, 0xFF]], // JPEG
  'image/webp': [[0x52, 0x49, 0x46, 0x46]], // WebP (RIFF header)
};

function validateFileSignature(buffer, mimeType) {
  const signatures = FILE_SIGNATURES[mimeType];
  if (!signatures) return false;

  for (const sig of signatures) {
    let match = true;
    for (let i = 0; i < sig.length; i++) {
      if (buffer[i] !== sig[i]) {
        match = false;
        break;
      }
    }
    if (match) return true;
  }
  return false;
}

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

function attachmentAllowed(name, mime, buffer) {
  // Check file extension
  const blocked = /\.(?:html?|svg|js|mjs|exe|com|bat|cmd|ps1|php|sh)$/i;
  if (blocked.test(name)) return false;

  // Check MIME type
  if (/(?:text\/html|image\/svg\+xml|javascript|x-msdownload)/i.test(mime)) return false;

  // Validate file signature (magic number) if buffer is provided
  if (buffer && buffer.length > 0) {
    // For WebP, also check the specific WebP signature after RIFF header
    if (mime === 'image/webp' && buffer.length >= 12) {
      // WebP: RIFF....WEBP
      if (buffer[8] !== 0x57 || buffer[9] !== 0x45 || buffer[10] !== 0x42 || buffer[11] !== 0x50) {
        return false;
      }
      return true;
    }

    // Validate other image types using signature
    if (!validateFileSignature(buffer, mime)) {
      return false;
    }
  }

  return true;
}

module.exports = { passwordMatches, passwordHash, secretMatches, safeFilename, attachmentAllowed, validateFileSignature };
