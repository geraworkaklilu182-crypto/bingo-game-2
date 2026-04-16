const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const path = require('path');

async function makeAdmin() {
    const db = await open({
        filename: path.join(__dirname, 'database.sqlite'),
        driver: sqlite3.Database
    });
    
    // Update user to admin (change 'adminuser' to YOUR username)
    const result = await db.run(
        "UPDATE users SET role = 'admin' WHERE username = 'gera'"
    );
    
    if (result.changes > 0) {
        console.log('✅ User is now an admin!');
    } else {
        console.log('❌ User not found. Make sure you registered first.');
    }
    
    // Show all users
    const users = await db.all('SELECT id, username, role FROM users');
    console.table(users);
    
    await db.close();
}

makeAdmin();