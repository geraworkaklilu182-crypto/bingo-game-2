const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const db = new sqlite3.Database(path.join(__dirname, 'database.sqlite'));

// Create deposit_requests table
db.run(`CREATE TABLE IF NOT EXISTS deposit_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    amount INTEGER,
    telebirr_number TEXT,
    screenshot_url TEXT,
    status TEXT DEFAULT 'pending',
    admin_notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    approved_at DATETIME,
    transaction_id TEXT UNIQUE
)`, (err) => {
    if (err) {
        console.error('Error creating deposit_requests:', err.message);
    } else {
        console.log('✅ deposit_requests table ready');
    }
});

// Create withdrawal_requests table
db.run(`CREATE TABLE IF NOT EXISTS withdrawal_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    amount INTEGER,
    telebirr_number TEXT,
    status TEXT DEFAULT 'pending',
    admin_notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME,
    transaction_id TEXT UNIQUE
)`, (err) => {
    if (err) {
        console.error('Error creating withdrawal_requests:', err.message);
    } else {
        console.log('✅ withdrawal_requests table ready');
    }
});

// Show all tables
setTimeout(() => {
    db.all("SELECT name FROM sqlite_master WHERE type='table'", (err, rows) => {
        console.log('\n📋 All tables in database:');
        rows.forEach(row => {
            console.log('  -', row.name);
        });
        db.close();
    });
}, 500);