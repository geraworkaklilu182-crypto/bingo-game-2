const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./database.sqlite');

db.run(`INSERT OR REPLACE INTO active_game (id, status, current_players, max_players, timer_seconds, time_left, called_numbers) 
        VALUES (1, 'waiting', 0, 100, 45, 45, '[]')`, function(err) {
    if (err) {
        console.error('Error:', err.message);
    } else {
        console.log('✅ Active game created');
    }
    db.close();
});