const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const path = require('path');
require('dotenv').config();

let db;

const initDB = async () => {
  try {
    db = await open({
      filename: path.join(__dirname, '..', 'database.sqlite'),
      driver: sqlite3.Database
    });
    
    // Create tables
    await db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        total_score INTEGER DEFAULT 0,
        games_played INTEGER DEFAULT 0,
        games_won INTEGER DEFAULT 0,
        role TEXT DEFAULT 'user',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE TABLE IF NOT EXISTS games (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER REFERENCES users(id),
        card_numbers TEXT NOT NULL,
        marked_numbers TEXT DEFAULT '[]',
        score INTEGER DEFAULT 0,
        won INTEGER DEFAULT 0,
        completed_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    // Add this table creation inside initDB after the games table
await db.exec(`
  CREATE TABLE IF NOT EXISTS wallet (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER UNIQUE REFERENCES users(id),
    balance INTEGER DEFAULT 10,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  
  CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id),
    type TEXT CHECK(type IN ('deposit', 'withdraw', 'game_win', 'game_loss', 'commission')),
    amount INTEGER NOT NULL,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Also create wallet for existing users
await db.exec(`
  INSERT OR IGNORE INTO wallet (user_id, balance)
  SELECT id, 10 FROM users;
`);
    
    console.log('✅ SQLite database ready');
    return db;
  } catch (error) {
    console.error('❌ Database error:', error);
  }
};

// Get database instance
const getDB = () => {
  if (!db) {
    throw new Error('Database not initialized. Call initDB() first.');
  }
  return db;
};

module.exports = { initDB, getDB };