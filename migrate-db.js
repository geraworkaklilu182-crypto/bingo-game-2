const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const path = require('path');

async function migrate() {
    const db = await open({
        filename: path.join(__dirname, 'database.sqlite'),
        driver: sqlite3.Database
    });
    
    // Create active_game table
    await db.exec(`
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
    
    // Insert default active game if not exists
    await db.run(`INSERT OR IGNORE INTO active_game (id, status) VALUES (1, 'waiting')`);
    
    console.log('✅ Database migration complete!');
    await db.close();
}

migrate().catch(console.error);