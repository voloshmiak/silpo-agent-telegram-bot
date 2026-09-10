import { Database } from "bun:sqlite";

const db = new Database("bot_session.sqlite", { create: true });

// Создаем таблицу для связи telegram_id и jwt токена
db.run(`
  CREATE TABLE IF NOT EXISTS users (
    telegram_id INTEGER PRIMARY KEY,
    jwt_token TEXT NOT NULL,
    user_id TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )
`);

export interface DbUser {
    telegram_id: number;
    jwt_token: string;
    user_id: string;
}

export function saveUser(telegramId: number, jwtToken: string, userId: string): void {
    const stmt = db.prepare(`
    INSERT INTO users (telegram_id, jwt_token, user_id)
    VALUES (?, ?, ?)
    ON CONFLICT(telegram_id) DO UPDATE SET jwt_token = excluded.jwt_token
  `);
    stmt.run(telegramId, jwtToken, userId);
}

export function getUser(telegramId: number): DbUser | null {
    const stmt = db.prepare<DbUser, [number]>(`
    SELECT telegram_id, jwt_token, user_id FROM users WHERE telegram_id = ?
  `);
    return stmt.get(telegramId) || null;
}