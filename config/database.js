const { Pool } = require('pg');
require('dotenv').config();

let pool = null;

const initDB = async () => {
  try {
    // Use DATABASE_URL from environment (Render provides this) or local connection
    const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/bingo_game';
    
   pool = new Pool({
  connectionString: connectionString,
  ssl: false
});
    
    // Create tables
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        total_score INTEGER DEFAULT 0,
        games_played INTEGER DEFAULT 0,
        games_won INTEGER DEFAULT 0,
        role TEXT DEFAULT 'user',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE TABLE IF NOT EXISTS games (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        card_numbers TEXT NOT NULL,
        marked_numbers TEXT DEFAULT '[]',
        score INTEGER DEFAULT 0,
        won INTEGER DEFAULT 0,
        completed_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE TABLE IF NOT EXISTS wallet (
        id SERIAL PRIMARY KEY,
        user_id INTEGER UNIQUE REFERENCES users(id),
        balance INTEGER DEFAULT 10,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE TABLE IF NOT EXISTS transactions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        type TEXT,
        amount INTEGER NOT NULL,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE TABLE IF NOT EXISTS game_sessions (
        id SERIAL PRIMARY KEY,
        session_id TEXT UNIQUE,
        status TEXT DEFAULT 'waiting',
        timer_seconds INTEGER DEFAULT 45,
        started_at TIMESTAMP,
        ended_at TIMESTAMP,
        winner TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE TABLE IF NOT EXISTS session_cards (
        id SERIAL PRIMARY KEY,
        session_id TEXT NOT NULL,
        card_number INTEGER NOT NULL,
        player_name TEXT NOT NULL,
        player_id INTEGER,
        taken_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(session_id, card_number)
      );
      
      CREATE TABLE IF NOT EXISTS settings (
        id SERIAL PRIMARY KEY,
        timer_seconds INTEGER DEFAULT 45,
        min_players INTEGER DEFAULT 2,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE TABLE IF NOT EXISTS deposit_requests (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        amount INTEGER NOT NULL,
        telebirr_number TEXT NOT NULL,
        screenshot_url TEXT,
        status TEXT DEFAULT 'pending',
        admin_notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        approved_at TIMESTAMP,
        transaction_id TEXT UNIQUE
      );
      
      CREATE TABLE IF NOT EXISTS withdrawal_requests (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        amount INTEGER NOT NULL,
        telebirr_number TEXT NOT NULL,
        status TEXT DEFAULT 'pending',
        admin_notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        completed_at TIMESTAMP,
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
        started_at TIMESTAMP,
        ended_at TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE TABLE IF NOT EXISTS game_cards (
        id SERIAL PRIMARY KEY,
        player_id INTEGER,
        player_name TEXT NOT NULL,
        card_number INTEGER NOT NULL,
        card_data TEXT NOT NULL,
        marked_numbers TEXT DEFAULT '[]',
        is_active INTEGER DEFAULT 1,
        is_spectator INTEGER DEFAULT 0,
        won INTEGER DEFAULT 0,
        selected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(player_id, card_number)
      );
      
      CREATE TABLE IF NOT EXISTS taken_cards (
        id SERIAL PRIMARY KEY,
        card_number INTEGER NOT NULL,
        player_name TEXT NOT NULL,
        player_id INTEGER,
        taken_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        game_ended INTEGER DEFAULT 0
      );
    `);
    
    // Insert default settings if not exists
    await pool.query(`INSERT INTO settings (id, timer_seconds, min_players) VALUES (1, 45, 2) ON CONFLICT (id) DO NOTHING`);
    
    // Insert default active game
    await pool.query(`INSERT INTO active_game (id, status) VALUES (1, 'waiting') ON CONFLICT (id) DO NOTHING`);
    
    // Create wallet for existing users who don't have one
    await pool.query(`INSERT INTO wallet (user_id, balance) SELECT id, 10 FROM users ON CONFLICT (user_id) DO NOTHING`);
    
    console.log('✅ PostgreSQL database ready');
    return pool;
  } catch (error) {
    console.error('❌ Database error:', error);
    throw error;
  }
};

const getDB = () => {
  if (!pool) {
    throw new Error('Database not initialized. Call initDB() first.');
  }
  return pool;
};

module.exports = { initDB, getDB };