function addColumn(db, sql) {
  try { db.exec(sql); } catch (error) {
    if (!String(error.message).includes('duplicate column name')) throw error;
  }
}

const migrations = [
  {
    version: 1,
    run(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY AUTOINCREMENT,username TEXT UNIQUE NOT NULL COLLATE NOCASE,password_hash TEXT NOT NULL,role TEXT NOT NULL CHECK(role IN ('admin','user')),active INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
        CREATE TABLE IF NOT EXISTS sessions(id_hash TEXT PRIMARY KEY,user_id INTEGER,csrf TEXT NOT NULL,expires_at INTEGER NOT NULL,last_seen INTEGER NOT NULL DEFAULT 0,FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE);
        CREATE TABLE IF NOT EXISTS manual_entries(id INTEGER PRIMARY KEY AUTOINCREMENT,title TEXT NOT NULL,content TEXT NOT NULL,source_url TEXT NOT NULL DEFAULT '',qa_audit_result TEXT NOT NULL DEFAULT '',created_by TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
        CREATE TABLE IF NOT EXISTS feedback(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER,username TEXT,type TEXT NOT NULL,rating TEXT,message TEXT NOT NULL,expected TEXT,search_query TEXT,ocr_text TEXT,verdict TEXT,page_url TEXT,user_agent TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
        CREATE TABLE IF NOT EXISTS chat_attachments(id INTEGER PRIMARY KEY AUTOINCREMENT,filename TEXT NOT NULL,mime_type TEXT NOT NULL,size INTEGER NOT NULL,data BLOB NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
        CREATE TABLE IF NOT EXISTS chat_groups(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,created_by INTEGER NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(created_by) REFERENCES users(id) ON DELETE CASCADE);
        CREATE TABLE IF NOT EXISTS chat_group_members(group_id INTEGER NOT NULL,user_id INTEGER NOT NULL,added_by INTEGER NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(group_id,user_id),FOREIGN KEY(group_id) REFERENCES chat_groups(id) ON DELETE CASCADE,FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE);
        CREATE TABLE IF NOT EXISTS chat_messages(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL,recipient_id INTEGER,group_id INTEGER,message TEXT NOT NULL DEFAULT '',attachment_id INTEGER,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,FOREIGN KEY(recipient_id) REFERENCES users(id) ON DELETE CASCADE,FOREIGN KEY(group_id) REFERENCES chat_groups(id) ON DELETE CASCADE,FOREIGN KEY(attachment_id) REFERENCES chat_attachments(id) ON DELETE SET NULL);
        CREATE TABLE IF NOT EXISTS chat_reads(user_id INTEGER NOT NULL,conversation_key TEXT NOT NULL,last_message_id INTEGER NOT NULL DEFAULT 0,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(user_id,conversation_key),FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE);
        CREATE TABLE IF NOT EXISTS notepads(user_id INTEGER PRIMARY KEY,content TEXT NOT NULL DEFAULT '',updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE);
        CREATE TABLE IF NOT EXISTS knowledge_proposals(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL,username TEXT NOT NULL,title TEXT NOT NULL,content TEXT NOT NULL,source_url TEXT NOT NULL DEFAULT '',qa_audit_result TEXT NOT NULL DEFAULT '',status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','denied')),reviewed_by TEXT,reviewed_at TEXT,review_note TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE);
        CREATE TABLE IF NOT EXISTS category_rules(id INTEGER PRIMARY KEY AUTOINCREMENT,category_name TEXT NOT NULL,category_id TEXT NOT NULL DEFAULT '',inclusion_rules TEXT NOT NULL DEFAULT '',exclusion_rules TEXT NOT NULL DEFAULT '',created_by TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
        CREATE TABLE IF NOT EXISTS reference_images(id INTEGER PRIMARY KEY AUTOINCREMENT,category_name TEXT NOT NULL,category_id TEXT NOT NULL DEFAULT '',caption TEXT NOT NULL DEFAULT '',qa_audit_result TEXT NOT NULL DEFAULT '',filename TEXT NOT NULL,mime_type TEXT NOT NULL,image_data BLOB NOT NULL,approved_by TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
        CREATE TABLE IF NOT EXISTS accuracy_tests(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,input_text TEXT NOT NULL,expected_verdict TEXT NOT NULL,created_by TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
        CREATE TABLE IF NOT EXISTS accuracy_runs(id INTEGER PRIMARY KEY AUTOINCREMENT,test_id INTEGER NOT NULL,actual_verdict TEXT NOT NULL,passed INTEGER NOT NULL,run_by TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(test_id) REFERENCES accuracy_tests(id) ON DELETE CASCADE);
        CREATE TABLE IF NOT EXISTS notifications(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL,type TEXT NOT NULL,title TEXT NOT NULL,message TEXT NOT NULL,link TEXT NOT NULL DEFAULT '',read_at TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE);
      `);
    },
  },
  {
    version: 2,
    run(db) {
      const columns = [
        'ALTER TABLE users ADD COLUMN display_name TEXT',
        'ALTER TABLE users ADD COLUMN is_root INTEGER NOT NULL DEFAULT 0',
        "ALTER TABLE users ADD COLUMN chat_name_mode TEXT NOT NULL DEFAULT 'display'",
        'ALTER TABLE users ADD COLUMN can_chat INTEGER NOT NULL DEFAULT 1',
        'ALTER TABLE users ADD COLUMN can_submit_knowledge INTEGER NOT NULL DEFAULT 1',
        'ALTER TABLE users ADD COLUMN can_use_notepad INTEGER NOT NULL DEFAULT 1',
        'ALTER TABLE users ADD COLUMN full_name TEXT',
        'ALTER TABLE users ADD COLUMN yourcompany_id TEXT',
        'ALTER TABLE users ADD COLUMN outsourcing_id TEXT',
        'ALTER TABLE users ADD COLUMN team_leader TEXT',
        'ALTER TABLE users ADD COLUMN email TEXT',
        'ALTER TABLE users ADD COLUMN phone_number TEXT',
        'ALTER TABLE feedback ADD COLUMN promoted_entry_id INTEGER',
        'ALTER TABLE knowledge_proposals ADD COLUMN review_note TEXT',
        'ALTER TABLE sessions ADD COLUMN last_seen INTEGER NOT NULL DEFAULT 0',
        'ALTER TABLE chat_messages ADD COLUMN recipient_id INTEGER',
        'ALTER TABLE chat_messages ADD COLUMN group_id INTEGER',
      ];
      for (const sql of columns) addColumn(db, sql);
    },
  },
  {
    version: 3,
    run(db) {
      addColumn(db, 'ALTER TABLE users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0');
    },
  },
  {
    version: 4,
    run(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS knowledge_images(
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          proposal_id INTEGER,
          manual_entry_id INTEGER,
          filename TEXT NOT NULL,
          mime_type TEXT NOT NULL,
          size INTEGER NOT NULL,
          image_data BLOB NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY(proposal_id) REFERENCES knowledge_proposals(id) ON DELETE CASCADE,
          FOREIGN KEY(manual_entry_id) REFERENCES manual_entries(id) ON DELETE SET NULL,
          CHECK(proposal_id IS NOT NULL OR manual_entry_id IS NOT NULL)
        );
        CREATE INDEX IF NOT EXISTS knowledge_images_proposal_idx ON knowledge_images(proposal_id);
        CREATE INDEX IF NOT EXISTS knowledge_images_entry_idx ON knowledge_images(manual_entry_id);
      `);
    },
  },
  {
    version: 5,
    run(db) {
      addColumn(db, "ALTER TABLE manual_entries ADD COLUMN qa_audit_result TEXT NOT NULL DEFAULT ''");
      addColumn(db, "ALTER TABLE reference_images ADD COLUMN qa_audit_result TEXT NOT NULL DEFAULT ''");
    },
  },
  {
    version: 6,
    run(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS knowledge_images_new(
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          proposal_id INTEGER,
          manual_entry_id INTEGER,
          filename TEXT NOT NULL,
          mime_type TEXT NOT NULL,
          size INTEGER NOT NULL,
          image_data BLOB NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY(proposal_id) REFERENCES knowledge_proposals(id) ON DELETE CASCADE,
          FOREIGN KEY(manual_entry_id) REFERENCES manual_entries(id) ON DELETE SET NULL,
          CHECK(proposal_id IS NOT NULL OR manual_entry_id IS NOT NULL)
        );
        INSERT INTO knowledge_images_new(id,proposal_id,manual_entry_id,filename,mime_type,size,image_data,created_at)
        SELECT id,proposal_id,manual_entry_id,filename,mime_type,size,image_data,created_at FROM knowledge_images;
        DROP TABLE knowledge_images;
        ALTER TABLE knowledge_images_new RENAME TO knowledge_images;
        CREATE INDEX IF NOT EXISTS knowledge_images_proposal_idx ON knowledge_images(proposal_id);
        CREATE INDEX IF NOT EXISTS knowledge_images_entry_idx ON knowledge_images(manual_entry_id);
      `);
    },
  },
  {
    version: 7,
    run(db) {
      addColumn(db, "ALTER TABLE knowledge_proposals ADD COLUMN qa_audit_result TEXT NOT NULL DEFAULT ''");
    },
  },
  {
    version: 8,
    run(db) {
      // Performance indexes for common query patterns
      const indexes = [
        // chat_messages: by recipient for direct messages, by group for group chats, by user for history
        'CREATE INDEX IF NOT EXISTS chat_messages_recipient_idx ON chat_messages(recipient_id)',
        'CREATE INDEX IF NOT EXISTS chat_messages_group_idx ON chat_messages(group_id)',
        'CREATE INDEX IF NOT EXISTS chat_messages_user_created_idx ON chat_messages(user_id, created_at)',
        'CREATE INDEX IF NOT EXISTS chat_messages_attachment_idx ON chat_messages(attachment_id)',

        // knowledge_proposals: by user for proposal history, by status for admin review
        'CREATE INDEX IF NOT EXISTS knowledge_proposals_user_idx ON knowledge_proposals(user_id)',
        'CREATE INDEX IF NOT EXISTS knowledge_proposals_status_idx ON knowledge_proposals(status)',
        'CREATE INDEX IF NOT EXISTS knowledge_proposals_created_idx ON knowledge_proposals(created_at)',

        // notifications: by user and read status
        'CREATE INDEX IF NOT EXISTS notifications_user_read_idx ON notifications(user_id, read_at)',
        'CREATE INDEX IF NOT EXISTS notifications_created_idx ON notifications(created_at)',

        // sessions: by user for session management, by expires for cleanup, by last_seen for activity
        'CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id)',
        'CREATE INDEX IF NOT EXISTS sessions_expires_idx ON sessions(expires_at)',
        'CREATE INDEX IF NOT EXISTS sessions_last_seen_idx ON sessions(last_seen)',

        // feedback: by user for history, by created for admin
        'CREATE INDEX IF NOT EXISTS feedback_user_idx ON feedback(user_id)',
        'CREATE INDEX IF NOT EXISTS feedback_created_idx ON feedback(created_at)',

        // manual_entries: by created_by for audit, by updated_at for recent changes
        'CREATE INDEX IF NOT EXISTS manual_entries_created_by_idx ON manual_entries(created_by)',
        'CREATE INDEX IF NOT EXISTS manual_entries_updated_idx ON manual_entries(updated_at)',

        // reference_images: by category for lookup
        'CREATE INDEX IF NOT EXISTS reference_images_category_idx ON reference_images(category_name, category_id)',

        // category_rules: by category for lookup
        'CREATE INDEX IF NOT EXISTS category_rules_name_idx ON category_rules(category_name)',
        'CREATE INDEX IF NOT EXISTS category_rules_id_idx ON category_rules(category_id)',

        // accuracy_runs: by test for history
        'CREATE INDEX IF NOT EXISTS accuracy_runs_test_idx ON accuracy_runs(test_id)',
      ];
      for (const sql of indexes) {
        try { db.exec(sql); } catch (error) {
          if (!String(error.message).includes('already exists')) throw error;
        }
      }
    },
  },
  {
    version: 9,
    run(db) {
      // Rebrand: Rename fusion_id column to yourcompany_id
      // SQLite doesn't support RENAME COLUMN directly, so recreate table
      // Check if migration already applied (column already renamed)
      const cols = db.prepare("PRAGMA table_info(users)").all().map(c => c.name);
      const hasFusionId = cols.includes('fusion_id');
      const hasYourCompanyId = cols.includes('yourcompany_id');

      // If already migrated (has yourcompany_id, no fusion_id), skip
      if (hasYourCompanyId && !hasFusionId) {
        return;
      }

      // If neither column exists (fresh DB with v9), ensure yourcompany_id exists
      if (!hasFusionId && !hasYourCompanyId) {
        try { db.exec('ALTER TABLE users ADD COLUMN yourcompany_id TEXT'); } catch {}
        return;
      }

      // Otherwise, migrate from fusion_id to yourcompany_id
      db.exec(`
        CREATE TABLE IF NOT EXISTS users_new(
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          username TEXT UNIQUE NOT NULL COLLATE NOCASE,
          password_hash TEXT NOT NULL,
          role TEXT NOT NULL CHECK(role IN ('admin','user')),
          active INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          display_name TEXT,
          is_root INTEGER NOT NULL DEFAULT 0,
          chat_name_mode TEXT NOT NULL DEFAULT 'display',
          can_chat INTEGER NOT NULL DEFAULT 1,
          can_submit_knowledge INTEGER NOT NULL DEFAULT 1,
          can_use_notepad INTEGER NOT NULL DEFAULT 1,
          full_name TEXT,
          yourcompany_id TEXT,
          outsourcing_id TEXT,
          team_leader TEXT,
          email TEXT,
          phone_number TEXT,
          must_change_password INTEGER NOT NULL DEFAULT 0
        );
      `);
      // Copy data from old table
      const selectCols = hasFusionId ? cols.map(c => c === 'fusion_id' ? 'yourcompany_id' : c).join(',') : cols.join(',');
      const selectColsStr = cols.join(',');
      db.exec(`INSERT INTO users_new(${selectCols}) SELECT ${selectColsStr} FROM users`);
      db.exec('DROP TABLE users');
      db.exec('ALTER TABLE users_new RENAME TO users');
      // Recreate indexes
      db.exec('CREATE INDEX IF NOT EXISTS users_username_idx ON users(username)');
    },
  },
];

const crypto = require('node:crypto');

function generateSecurePassword(length = 16) {
  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
  let password = '';
  const randomBytes = crypto.randomBytes(length);
  for (let i = 0; i < length; i++) {
    password += charset[randomBytes[i] % charset.length];
  }
  return password;
}

function migrate(db) {
  db.exec('PRAGMA foreign_keys=ON; CREATE TABLE IF NOT EXISTS schema_migrations(version INTEGER PRIMARY KEY,applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);');
  const applied = db.prepare('SELECT 1 FROM schema_migrations WHERE version=?');
  const record = db.prepare('INSERT INTO schema_migrations(version) VALUES(?)');
  for (const migration of migrations) {
    if (applied.get(migration.version)) continue;
    db.exec('BEGIN');
    try { migration.run(db); record.run(migration.version); db.exec('COMMIT'); }
    catch (error) { try { db.exec('ROLLBACK'); } catch {} throw error; }
  }
  db.exec("UPDATE users SET display_name=CASE username WHEN 'admin' THEN 'Administrator' WHEN 'yourcompanycx' THEN 'YourCompany CX' ELSE username END WHERE display_name IS NULL OR display_name=''");
  if (!db.prepare("SELECT value FROM settings WHERE key='bootstrap_complete'").get()) {
    const { passwordHash } = require('./security');
    const adminPassword = generateSecurePassword(20);
    const userPassword = generateSecurePassword(20);
    const insert = db.prepare('INSERT OR IGNORE INTO users(username,password_hash,role,must_change_password,full_name,display_name) VALUES(?,?,?,?,?,?)');
    insert.run('admin', passwordHash(adminPassword), 'admin', 1, 'Administrator', 'Administrator');
    insert.run('yourcompanycx', passwordHash(userPassword), 'user', 1, 'YourCompany CX', 'YourCompany CX');
    db.prepare("INSERT INTO settings(key,value) VALUES('bootstrap_complete','1')").run();
    console.log('');
    console.log('╔═══════════════════════════════════════════════════════════════════╗');
    console.log('║  FIRST RUN - DEFAULT ACCOUNTS CREATED WITH RANDOM PASSWORDS      ║');
    console.log('╠═══════════════════════════════════════════════════════════════════╣');
    console.log('║  Username: admin                                                  ║');
    console.log(`║  Password: ${adminPassword.padEnd(56)} ║`);
    console.log('║  Role: Root / Developer (must change password on first login)    ║');
    console.log('╠═══════════════════════════════════════════════════════════════════╣');
    console.log('║  Username: yourcompanycx                                          ║');
    console.log(`║  Password: ${userPassword.padEnd(56)} ║`);
    console.log('║  Role: User (must change password on first login)                ║');
    console.log('╚═══════════════════════════════════════════════════════════════════╝');
    console.log('');
    console.log('IMPORTANT: Save these passwords now. They will not be shown again.');
    console.log('Users must change their password on first login.');
    console.log('');
  }
  db.exec("UPDATE users SET is_root=1,role='admin' WHERE id=(SELECT id FROM users WHERE username='admin' ORDER BY id LIMIT 1) AND NOT EXISTS(SELECT 1 FROM users WHERE is_root=1)");
}

module.exports = { migrate };
