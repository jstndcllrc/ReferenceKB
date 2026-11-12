const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const root = path.resolve(__dirname, '..');
const dataDir = path.join(root, 'knowledge-base');
const backupDir = path.join(root, 'backups');
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
fs.mkdirSync(backupDir, { recursive: true });

const appTarget = path.join(backupDir, `node-data-${stamp}.sqlite`);
const db = new DatabaseSync(path.join(dataDir, 'node-data.sqlite'));
db.exec(`VACUUM INTO '${appTarget.replaceAll("'", "''")}'`);
db.close();
fs.copyFileSync(path.join(dataDir, 'kb-search.sqlite'), path.join(backupDir, `kb-search-${stamp}.sqlite`));
console.log(`Backup created in ${backupDir}`);
