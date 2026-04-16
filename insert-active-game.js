const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./database.sqlite');

db.run(`INSERT OR IGNORE INTO active_game (id, status) VALUES (1, 'waiting')`, function(err) {
    if (err) {
        console.error('Error:', err.message);
    } else {
        console.log('✅ Active game row inserted');
    }
    db.close();
});