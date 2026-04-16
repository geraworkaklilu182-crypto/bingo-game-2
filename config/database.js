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
      
      CREATE TABLE IF NOT EXISTS game_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT UNIQUE,
        status TEXT DEFAULT 'waiting',
        timer_seconds INTEGER DEFAULT 45,
        started_at DATETIME,
        ended_at DATETIME,
        winner TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE TABLE IF NOT EXISTS session_cards (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        card_number INTEGER NOT NULL,
        player_name TEXT NOT NULL,
        player_id INTEGER,
        taken_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(session_id, card_number)
      );
      
      CREATE TABLE IF NOT EXISTS settings (
        id INTEGER PRIMARY KEY,
        timer_seconds INTEGER DEFAULT 45,
        min_players INTEGER DEFAULT 2,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      

CREATE TABLE IF NOT EXISTS deposit_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id),
    amount INTEGER NOT NULL,
    telebirr_number TEXT NOT NULL,
    screenshot_url TEXT,
    status TEXT DEFAULT 'pending',
    admin_notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    approved_at DATETIME,
    transaction_id TEXT UNIQUE
); 


CREATE TABLE IF NOT EXISTS withdrawal_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id),
    amount INTEGER NOT NULL,
    telebirr_number TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    admin_notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME,
    transaction_id TEXT UNIQUE
);


CREATE TABLE IF NOT EXISTS active_game (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    status TEXT DEFAULT 'waiting',
    current_players INTEGER DEFAULT 0,
    max_players INTEGER DEFAULT 100,
    timer_seconds INTEGER DEFAULT 45,
    time_left INTEGER DEFAULT 45,
    called_numbers TEXT DEFAULT '[]',
    winner TEXT,
    winner_id INTEGER,
    started_at DATETIME,
    ended_at DATETIME,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS game_cards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    player_id INTEGER,
    player_name TEXT NOT NULL,
    card_number INTEGER NOT NULL,
    card_data TEXT NOT NULL,
    marked_numbers TEXT DEFAULT '[]',
    is_active INTEGER DEFAULT 1,
    is_spectator INTEGER DEFAULT 0,
    won INTEGER DEFAULT 0,
    selected_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(player_id, card_number)
);

CREATE TABLE IF NOT EXISTS taken_cards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    card_number INTEGER NOT NULL,
    player_name TEXT NOT NULL,
    player_id INTEGER,
    taken_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    game_ended INTEGER DEFAULT 0
);
    `);
    
    // Insert default settings if not exists
    await db.run(`INSERT OR IGNORE INTO settings (id, timer_seconds, min_players) VALUES (1, 45, 2)`);
    
    // Create wallet for existing users who don't have one
    await db.run(`INSERT OR IGNORE INTO wallet (user_id, balance) SELECT id, 10 FROM users`);
    
    console.log('✅ SQLite database ready with all tables');
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