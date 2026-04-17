const express = require('express');
const jwt = require('jsonwebtoken');
const { getDB } = require('../config/database');

const router = express.Router();

// Middleware to verify token
const verifyToken = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'No token provided' });
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.userId = decoded.id;
        next();
    } catch (error) {
        return res.status(401).json({ message: 'Invalid token' });
    }
};

// Admin middleware
const verifyAdmin = async (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'No token provided' });
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const db = getDB();
        const result = await db.query('SELECT role FROM users WHERE id = $1', [decoded.id]);
        const user = result.rows[0];
        if (!user || user.role !== 'admin') {
            return res.status(403).json({ message: 'Admin access required' });
        }
        req.userId = decoded.id;
        next();
    } catch (error) {
        return res.status(401).json({ message: 'Invalid token' });
    }
};

// Get current game state
router.get('/state', verifyToken, async (req, res) => {
    try {
        const db = getDB();
        const gameResult = await db.query('SELECT * FROM active_game WHERE id = 1');
        const game = gameResult.rows[0];
        
        // Get ALL players count
        const playersResult = await db.query('SELECT COUNT(DISTINCT player_id) as count FROM game_cards WHERE is_active = 1 AND is_spectator = 0');
        const spectatorsResult = await db.query('SELECT COUNT(DISTINCT player_id) as count FROM game_cards WHERE is_spectator = 1');
        
        // Get taken cards for THIS GAME only
        const takenCardsResult = await db.query('SELECT card_number, player_id FROM taken_cards WHERE game_ended = 0');
        
        // Get ONLY this user's cards
        const userCardsResult = await db.query(
            'SELECT * FROM game_cards WHERE player_id = $1 AND is_active = 1 AND is_spectator = 0',
            [req.userId]
        );
        
        res.json({
            game: game,
            players: parseInt(playersResult.rows[0]?.count) || 0,
            spectators: parseInt(spectatorsResult.rows[0]?.count) || 0,
            takenCards: takenCardsResult.rows.map(c => c.card_number),
            takenCardsWithPlayer: takenCardsResult.rows,
            myCards: userCardsResult.rows
        });
    } catch (error) {
        console.error('Error getting game state:', error);
        res.status(500).json({ message: 'Server error: ' + error.message });
    }
});

// Select a card
router.post('/select-card', verifyToken, async (req, res) => {
    try {
        const { cardNumber, cardData } = req.body;
        const userId = req.userId;
        const db = getDB();
        
        console.log('Select card request:', { cardNumber, userId });
        
        // Get current game status
        const gameResult = await db.query('SELECT status FROM active_game WHERE id = 1');
        const game = gameResult.rows[0];
        
        if (!game) {
            return res.status(400).json({ message: 'No active game found' });
        }
        
        // Check if game is waiting (can select cards)
        if (game.status !== 'waiting') {
            return res.status(400).json({ message: 'Cannot select cards while game is active' });
        }
        
        // Check if card is already taken
        const takenResult = await db.query('SELECT * FROM taken_cards WHERE card_number = $1 AND game_ended = 0', [cardNumber]);
        if (takenResult.rows.length > 0) {
            return res.status(400).json({ message: 'Card already taken by another player' });
        }
        
        // Check if user already has 2 cards
        const userCardsResult = await db.query('SELECT * FROM game_cards WHERE player_id = $1 AND is_active = 1', [userId]);
        if (userCardsResult.rows.length >= 2) {
            return res.status(400).json({ message: 'You already have 2 cards' });
        }
        
        // Get user's wallet balance
        const walletResult = await db.query('SELECT balance FROM wallet WHERE user_id = $1', [userId]);
        
        // Get card cost from settings
        let cardCost = 10;
        try {
            const settingsResult = await db.query('SELECT card_cost FROM settings WHERE id = 1');
            if (settingsResult.rows[0] && settingsResult.rows[0].card_cost) {
                cardCost = settingsResult.rows[0].card_cost;
            }
        } catch(e) {
            console.log('Using default card cost: 10');
        }
        
        if (!walletResult.rows[0] || walletResult.rows[0].balance < cardCost) {
            // Give free 100 coins for testing
            await db.query('UPDATE wallet SET balance = 100 WHERE user_id = $1', [userId]);
        }
        
        // Deduct cost
        await db.query('UPDATE wallet SET balance = balance - $1 WHERE user_id = $2', [cardCost, userId]);
        
        // Get user name
        const userResult = await db.query('SELECT username FROM users WHERE id = $1', [userId]);
        const playerName = userResult.rows[0]?.username || `Player_${userId}`;
        
        // Save card with all required fields
        await db.query(`INSERT INTO game_cards (player_id, player_name, card_number, card_data, marked_numbers, is_active, is_spectator, won)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [userId, playerName, cardNumber, JSON.stringify(cardData), '[]', 1, 0, 0]
        );
        
        // Mark card as taken
        await db.query(`INSERT INTO taken_cards (card_number, player_name, player_id, game_ended) VALUES ($1, $2, $3, $4)`,
            [cardNumber, playerName, userId, 0]
        );
        
        // Update player count
        const playerCountResult = await db.query('SELECT COUNT(DISTINCT player_id) as count FROM game_cards WHERE is_active = 1 AND is_spectator = 0');
        await db.query('UPDATE active_game SET current_players = $1 WHERE id = 1', [parseInt(playerCountResult.rows[0]?.count) || 0]);
        
        // Record transaction
        await db.query(`INSERT INTO transactions (user_id, type, amount, description)
            VALUES ($1, 'game_loss', $2, $3)`,
            [userId, cardCost, `Bought card #${cardNumber}`]
        );
        
        res.json({ success: true, message: 'Card selected!' });
        
    } catch (error) {
        console.error('Error selecting card:', error);
        res.status(500).json({ message: 'Server error: ' + error.message });
    }
});

// Join as spectator
router.post('/join-spectator', verifyToken, async (req, res) => {
    try {
        const userId = req.userId;
        const db = getDB();
        
        const userResult = await db.query('SELECT username FROM users WHERE id = $1', [userId]);
        const playerName = userResult.rows[0]?.username || `Player_${userId}`;
        
        const existingResult = await db.query('SELECT * FROM game_cards WHERE player_id = $1 AND is_active = 1', [userId]);
        if (existingResult.rows.length === 0) {
            await db.query(`INSERT INTO game_cards (player_id, player_name, is_spectator, is_active, card_number, card_data, marked_numbers, won)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                [userId, playerName, 1, 1, 0, '[]', '[]', 0]
            );
        }
        
        res.json({ success: true, message: 'Joined as spectator' });
    } catch (error) {
        console.error('Error joining as spectator:', error);
        res.status(500).json({ message: 'Server error: ' + error.message });
    }
});

// Reset game for next round (admin only)
router.post('/reset-game', async (req, res) => {
    try {
        const db = getDB();
        
        // Mark old cards as inactive
        await db.query('UPDATE game_cards SET is_active = 0 WHERE is_active = 1');
        
        // Mark taken cards as ended
        await db.query('UPDATE taken_cards SET game_ended = 1 WHERE game_ended = 0');
        
        // Reset active game
        await db.query(`UPDATE active_game SET 
            status = 'waiting',
            current_players = 0,
            called_numbers = '[]',
            winner = NULL,
            winner_id = NULL,
            time_left = timer_seconds,
            started_at = NULL,
            ended_at = NULL,
            updated_at = CURRENT_TIMESTAMP
            WHERE id = 1`);
        
        res.json({ success: true, message: 'Game reset for next round' });
    } catch (error) {
        console.error('Error resetting game:', error);
        res.status(500).json({ message: 'Server error: ' + error.message });
    }
});

// Clear user's cards (for new game)
router.post('/clear-cards', verifyToken, async (req, res) => {
    try {
        const userId = req.userId;
        const db = getDB();
        
        console.log('Clearing cards for user:', userId);
        
        // Mark user's old cards as inactive
        await db.query('UPDATE game_cards SET is_active = 0 WHERE player_id = $1 AND is_active = 1', [userId]);
        
        // Remove user's taken cards from current game
        await db.query('DELETE FROM taken_cards WHERE player_id = $1 AND game_ended = 0', [userId]);
        
        res.json({ success: true, message: 'Cards cleared' });
    } catch (error) {
        console.error('Error clearing cards:', error);
        res.status(500).json({ message: 'Server error: ' + error.message });
    }
});

// Clear ALL cards for new game (admin only)
router.post('/admin/clear-all-cards', verifyAdmin, async (req, res) => {
    try {
        const db = getDB();
        
        // Clear all game cards
        await db.query('DELETE FROM game_cards');
        await db.query('DELETE FROM taken_cards');
        await db.query('UPDATE active_game SET current_players = 0, called_numbers = $1, status = $2 WHERE id = 1', ['[]', 'waiting']);
        
        res.json({ success: true, message: 'All cards cleared for new game' });
    } catch (error) {
        console.error('Error clearing cards:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Update marked numbers for a card
router.post('/update-marked', verifyToken, async (req, res) => {
    try {
        const { cardId, markedNumbers } = req.body;
        const userId = req.userId;
        const db = getDB();
        
        console.log('Updating marked numbers:', { cardId, markedNumbers, userId });
        
        await db.query(
            'UPDATE game_cards SET marked_numbers = $1 WHERE card_number = $2 AND player_id = $3',
            [JSON.stringify(markedNumbers), cardId, userId]
        );
        
        res.json({ success: true });
    } catch (error) {
        console.error('Error updating marked:', error);
        res.status(500).json({ message: 'Server error: ' + error.message });
    }
});

module.exports = router;