const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const root = path.resolve(__dirname, '..');
const importDir = path.join(root, 'imports');
const kbDir = path.join(root, 'knowledge-base');
const target = path.join(kbDir, 'kb-search.sqlite');
const temporary = path.join(kbDir, `kb-import-${Date.now()}.sqlite`);
const db = new DatabaseSync(temporary);
db.exec(`PRAGMA journal_mode=MEMORY;
CREATE TABLE documents(id TEXT PRIMARY KEY,title TEXT NOT NULL,source_url TEXT NOT NULL,updated_at TEXT,imported_at TEXT NOT NULL);
CREATE TABLE chunks(id INTEGER PRIMARY KEY AUTOINCREMENT,document_id TEXT NOT NULL,section_id TEXT,content TEXT NOT NULL);
CREATE VIRTUAL TABLE chunks_fts USING fts5(title,content,document_id UNINDEXED,source_url UNINDEXED,tokenize='unicode61 remove_diacritics 2');`);

function documents(exported) {
  if (exported?.format === 'pg-note-export-v1') return [{ documentId:String(exported.documentId||''), sourceUrl:String(exported.sourceUrl||''), data:exported.data||{} }];
  return Array.isArray(exported?.documents) ? exported.documents : [];
}
function clean(value) {
  return (typeof value === 'string' ? value : '').replace(/(?<=\p{L})(?=\p{N})|(?<=\p{N})(?=\p{L})/gu,' ').replace(/[\t ]+/g,' ').replace(/(?:\r?\n){3,}/g,'\n\n').replace(/^[\s*]+|[\s*]+$/g,'');
}
function chunks(document) {
  let content; try { content=JSON.parse(String(document.content||'')); } catch { return []; }
  const a=content?.aText||{},texts=Array.isArray(a.texts)?a.texts:[],rows=Array.isArray(a.rows)?a.rows:[],columns=Array.isArray(a.columns)?a.columns:[];
  const bySection={}; for(const entry of texts){const id=String(entry?.sectionId||''),text=clean(entry?.text);if(id&&text)bySection[id]=text;}
  const columnIds=[...new Set(columns.flatMap(group=>Array.isArray(group?.columnList)?group.columnList:[]).map(String).filter(id=>/^c[a-z0-9]+$/i.test(id)))];
  const output=[],used=new Set();
  for(const group of rows){const rowIds=(Array.isArray(group?.rowList)?group.rowList:[]).filter(v=>typeof v==='string');if(!rowIds.length||!columnIds.length)continue;const headers={};for(const col of columnIds)headers[col]=bySection[`x${rowIds[0]}${col}`]||'';for(const row of rowIds.slice(1)){const parts=[];for(const col of columnIds){const id=`x${row}${col}`,value=bySection[id]||'';if(!value)continue;used.add(id);const label=clean(headers[col]);parts.push(label?`${label}: ${value}`:value)}if(parts.length)output.push({sectionId:row,content:parts.join('\n')});}}
  for(const [sectionId,text] of Object.entries(bySection))if(!used.has(sectionId))output.push({sectionId,content:text});return output;
}

const insertDocument=db.prepare('INSERT INTO documents(id,title,source_url,updated_at,imported_at) VALUES(?,?,?,?,CURRENT_TIMESTAMP)');
const insertChunk=db.prepare('INSERT INTO chunks(document_id,section_id,content) VALUES(?,?,?)');
const insertFts=db.prepare('INSERT INTO chunks_fts(title,content,document_id,source_url) VALUES(?,?,?,?)');
const deleteDocument=db.prepare('DELETE FROM documents WHERE id=?');
const deleteChunks=db.prepare('DELETE FROM chunks WHERE document_id=?');
const deleteFts=db.prepare('DELETE FROM chunks_fts WHERE document_id=?');
let documentCount=0,chunkCount=0;
db.exec('BEGIN');
try {
  for(const name of fs.readdirSync(importDir).filter(name=>/^pg-note.*\.json$/i.test(name))){let exported;try{exported=JSON.parse(fs.readFileSync(path.join(importDir,name),'utf8'));}catch{console.warn(`Skipping invalid JSON: ${name}`);continue;}for(const record of documents(exported)){const data=record?.data||{},doc=data?.document||{},id=String(doc.documentId||record.documentId||'');if(!id)continue;const title=clean(doc.name)||'Untitled note',source=String(record.sourceUrl||`https://pg-note.intragw.com/doc/${id}`),items=chunks(doc);deleteFts.run(id);deleteChunks.run(id);deleteDocument.run(id);insertDocument.run(id,title,source,String(doc.lastUpdatedTime||''));for(const item of items){insertChunk.run(id,item.sectionId,item.content);insertFts.run(title,item.content,id,source);chunkCount++;}documentCount++;}}
  db.exec('COMMIT');
} catch(error) { try{db.exec('ROLLBACK')}catch{} db.close(); throw error; }
const integrity=db.prepare('PRAGMA integrity_check').get().integrity_check;db.close();if(integrity!=='ok')throw new Error(`Integrity check failed: ${integrity}`);
fs.copyFileSync(temporary,target);try{fs.unlinkSync(temporary)}catch{}
console.log(`Imported ${documentCount} document(s) and ${chunkCount} searchable chunk(s).`);
