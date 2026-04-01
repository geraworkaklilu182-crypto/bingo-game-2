const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./database.sqlite');

// Make 'gera' an admin
db.run(`UPDATE users SET role = 'admin' WHERE username = 'gera'`, function(err) {
    if (err) {
        console.error('Error:', err.message);
    } else {
        console.log(`✅ ${this.changes} user(s) updated to admin!`);
    }
    
    // Show all users to verify
    db.all('SELECT id, username, role FROM users', (err, rows) => {
        if (err) {
            console.error('Error:', err.message);
        } else {
            console.log('\n📊 Current users:');
            console.table(rows);
        }
        db.close();
    });
});