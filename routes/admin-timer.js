const express = require('express');
const { getDB } = require('../config/database');
const router = express.Router();

// Get timer settings
router.get('/settings', async (req, res) => {
    try {
        const db = getDB();
        let setting = await db.get('SELECT * FROM settings WHERE id = 1');
        
        if (!setting) {
            await db.run('INSERT INTO settings (id, timer_seconds, min_players) VALUES (1, 45, 2)');
            setting = { timer_seconds: 45, min_players: 2 };
        }
        
        res.json({ timerSeconds: setting.timer_seconds, minPlayers: setting.min_players });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Update timer settings
router.put('/settings', async (req, res) => {
    try {
        const { timerSeconds, minPlayers } = req.body;
        const db = getDB();
        
        await db.run(`UPDATE settings SET timer_seconds = ?, min_players = ? WHERE id = 1`, 
            [timerSeconds, minPlayers]);
        
        res.json({ message: 'Settings updated', timerSeconds, minPlayers });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;