const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const PRODUCTION = process.env.NODE_ENV === 'production';
const config = {
  ROOT,
  KB_DIR: process.env.KB_DIR || path.join(ROOT, 'knowledge-base'),
  HOST: process.env.HOST || '127.0.0.1',
  PORT: Number(process.env.PORT || 3000),
  PRODUCTION,
  TRUST_PROXY: process.env.TRUST_PROXY === 'true',
  COOKIE_SECURE: PRODUCTION || process.env.COOKIE_SECURE === 'true',
  SHOW_LOGIN_USERS: process.env.SHOW_LOGIN_USERS === 'true' || !PRODUCTION,
  ROOT_RESET_SECRET: process.env.ROOT_RESET_SECRET || '',
  OLLAMA_URL: (process.env.OLLAMA_URL || 'http://127.0.0.1:11434').replace(/\/$/, ''),
  OLLAMA_VISION_MODEL: process.env.OLLAMA_VISION_MODEL || '',
};

if (PRODUCTION && config.ROOT_RESET_SECRET.length < 20) {
  throw new Error('ROOT_RESET_SECRET must be configured with at least 20 characters in production.');
}

module.exports = config;
