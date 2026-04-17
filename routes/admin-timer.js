const express = require('express');
const { getDB } = require('../config/database');

const router = express.Router();

// Get timer settings
router.get('/settings', async (req, res) => {
    try {
        const db = getDB();
        const result = await db.query('SELECT * FROM settings WHERE id = 1');
        
        let setting = result.rows[0];
        
        if (!setting) {
            await db.query('INSERT INTO settings (id, timer_seconds, min_players) VALUES (1, 45, 2)');
            setting = { timer_seconds: 45, min_players: 2 };
        }
        
        res.json({ timerSeconds: setting.timer_seconds, minPlayers: setting.min_players });
    } catch (error) {
        console.error('Error getting timer settings:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Update timer settings
router.put('/settings', async (req, res) => {
    try {
        const { timerSeconds, minPlayers } = req.body;
        const db = getDB();
        
        await db.query(`UPDATE settings SET timer_seconds = $1, min_players = $2 WHERE id = 1`, 
            [timerSeconds, minPlayers]);
        
        res.json({ message: 'Settings updated', timerSeconds, minPlayers });
    } catch (error) {
        console.error('Error updating timer settings:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;