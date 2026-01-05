const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3');

const DEFAULT_ROLE = 'user';

function createAuthStore({ dbPath, log }) {
    if (!dbPath) {
        throw new Error('Auth DB path is required');
    }

    const resolvedPath = path.resolve(dbPath);
    fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });

    const db = new sqlite3.Database(resolvedPath);

    function run(sql, params = []) {
        return new Promise((resolve, reject) => {
            db.run(sql, params, function onRun(error) {
                if (error) {
                    reject(error);
                    return;
                }

                resolve({ lastID: this.lastID, changes: this.changes });
            });
        });
    }

    function get(sql, params = []) {
        return new Promise((resolve, reject) => {
            db.get(sql, params, (error, row) => {
                if (error) {
                    reject(error);
                    return;
                }

                resolve(row);
            });
        });
    }

    function nowIso() {
        return new Date().toISOString();
    }

    async function init() {
        await run('PRAGMA journal_mode = WAL');
        await run('PRAGMA foreign_keys = ON');

        await run(`
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                role TEXT NOT NULL DEFAULT '${DEFAULT_ROLE}',
                is_active INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                last_login_at TEXT
            )
        `);

        await run('CREATE INDEX IF NOT EXISTS idx_users_email ON users (email)');

        if (log && log.info) {
            log.info(`Auth DB ready at ${resolvedPath}`);
        }
    }

    async function getUserByEmail(email) {
        return await get(
            'SELECT id, email, password_hash, role, is_active, created_at, updated_at, last_login_at FROM users WHERE email = ?',
            [email]
        );
    }

    async function getUserById(id) {
        return await get(
            'SELECT id, email, role, is_active, created_at, updated_at, last_login_at FROM users WHERE id = ?',
            [id]
        );
    }

    async function createUser({ email, passwordHash, role = DEFAULT_ROLE }) {
        const timestamp = nowIso();
        const result = await run(
            `INSERT INTO users (email, password_hash, role, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?)`,
            [email, passwordHash, role, timestamp, timestamp]
        );

        return result.lastID;
    }

    async function updateLastLogin(userId) {
        const timestamp = nowIso();
        await run(
            'UPDATE users SET last_login_at = ?, updated_at = ? WHERE id = ?',
            [timestamp, timestamp, userId]
        );
    }

    async function ensureUser({ email, passwordHash, role = DEFAULT_ROLE }) {
        const existing = await getUserByEmail(email);
        if (existing) {
            return { created: false, userId: existing.id };
        }

        const userId = await createUser({ email, passwordHash, role });
        return { created: true, userId };
    }

    function close() {
        db.close();
    }

    return {
        init,
        getUserByEmail,
        getUserById,
        createUser,
        updateLastLogin,
        ensureUser,
        close
    };
}

module.exports = {
    createAuthStore
};
