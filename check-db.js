// check-db.js
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const path = require('path');

async function checkDatabase() {
    try {
        const db = await open({
            filename: path.join(__dirname, 'database.sqlite'),
            driver: sqlite3.Database
        });
        
        console.log('✅ Database connected!\n');
        
        // Check all tables
        const tables = await db.all(`
            SELECT name FROM sqlite_master 
            WHERE type='table' 
            ORDER BY name;
        `);
        
        console.log('📋 TABLES IN DATABASE:');
        console.log(tables.map(t => `   - ${t.name}`).join('\n'));
        console.log('');
        
        // Check users
        const users = await db.all('SELECT id, username, email, role FROM users;');
        
        console.log('👥 USERS:');
        if (users.length === 0) {
            console.log('   ❌ No users found! You need to register.');
        } else {
            users.forEach(u => {
                console.log(`   - ID: ${u.id}, Username: ${u.username}, Email: ${u.email}, Role: ${u.role}`);
            });
        }
        console.log('');
        
        // Count total users
        const userCount = await db.get('SELECT COUNT(*) as count FROM users');
        console.log(`📊 Total users: ${userCount.count}`);
        
        await db.close();
        
    } catch (error) {
        console.error('❌ Error:', error.message);
        console.log('\n💡 Try running: npm run dev first to create the database');
    }
}

checkDatabase();