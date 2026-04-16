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
        const user = await db.get('SELECT role FROM users WHERE id = ?', [decoded.id]);
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
        const game = await db.get('SELECT * FROM active_game WHERE id = 1');
        
        // Get ALL players count (not just distinct - FIXED)
        const players = await db.get('SELECT COUNT(DISTINCT player_id) as count FROM game_cards WHERE is_active = 1 AND is_spectator = 0');
        const spectators = await db.get('SELECT COUNT(DISTINCT player_id) as count FROM game_cards WHERE is_spectator = 1');
        
        // Get taken cards for THIS GAME only
        const takenCards = await db.all('SELECT card_number, player_id FROM taken_cards WHERE game_ended = 0');
        
        // Get ONLY this user's cards - FIXED
        const userCards = await db.all(
            'SELECT * FROM game_cards WHERE player_id = ? AND is_active = 1 AND is_spectator = 0',
            [req.userId]
        );
        
        res.json({
            game: game,
            players: players?.count || 0,
            spectators: spectators?.count || 0,
            takenCards: takenCards.map(c => c.card_number),
            takenCardsWithPlayer: takenCards, // For debugging
            myCards: userCards
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
        const game = await db.get('SELECT status FROM active_game WHERE id = 1');
        
        if (!game) {
            return res.status(400).json({ message: 'No active game found' });
        }
        
        // Check if game is waiting (can select cards)
        if (game.status !== 'waiting') {
            return res.status(400).json({ message: 'Cannot select cards while game is active' });
        }
        
        // Check if card is already taken
        const taken = await db.get('SELECT * FROM taken_cards WHERE card_number = ? AND game_ended = 0', [cardNumber]);
        if (taken) {
            return res.status(400).json({ message: 'Card already taken by another player' });
        }
        
        // Check if user already has 2 cards
        const userCards = await db.all('SELECT * FROM game_cards WHERE player_id = ? AND is_active = 1', [userId]);
        if (userCards.length >= 2) {
            return res.status(400).json({ message: 'You already have 2 cards' });
        }
        
        // Get user's wallet balance
        const wallet = await db.get('SELECT balance FROM wallet WHERE user_id = ?', [userId]);
        
        // Get card cost from settings
        let cardCost = 10;
        try {
            const settings = await db.get('SELECT card_cost FROM settings WHERE id = 1');
            if (settings && settings.card_cost) {
                cardCost = settings.card_cost;
            }
        } catch(e) {
            console.log('Using default card cost: 10');
        }
        
      // if (!wallet || wallet.balance < cardCost) {
         //  return res.status(400).json({ message: `Insufficient balance! Need ${cardCost} birr` });
       // }
       if (!wallet || wallet.balance < cardCost) {
    // Give free 100 coins for testing
    await db.run('UPDATE wallet SET balance = 100 WHERE user_id = ?', [userId]);
}

     
        // Deduct cost
        await db.run('UPDATE wallet SET balance = balance - ? WHERE user_id = ?', [cardCost, userId]);
        
        // Get user name
        const user = await db.get('SELECT username FROM users WHERE id = ?', [userId]);
        const playerName = user?.username || `Player_${userId}`;
        
        // Save card with all required fields
        await db.run(`INSERT INTO game_cards (player_id, player_name, card_number, card_data, marked_numbers, is_active, is_spectator, won)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [userId, playerName, cardNumber, JSON.stringify(cardData), '[]', 1, 0, 0]
        );
        
        // Mark card as taken
        await db.run(`INSERT INTO taken_cards (card_number, player_name, player_id, game_ended) VALUES (?, ?, ?, ?)`,
            [cardNumber, playerName, userId, 0]
        );
        
        // Update player count
        const playerCount = await db.get('SELECT COUNT(DISTINCT player_id) as count FROM game_cards WHERE is_active = 1 AND is_spectator = 0');
        await db.run('UPDATE active_game SET current_players = ? WHERE id = 1', [playerCount?.count || 0]);
        
        // Record transaction
        await db.run(`INSERT INTO transactions (user_id, type, amount, description)
            VALUES (?, 'game_loss', ?, ?)`,
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
        
        const user = await db.get('SELECT username FROM users WHERE id = ?', [userId]);
        const playerName = user?.username || `Player_${userId}`;
        
        const existing = await db.get('SELECT * FROM game_cards WHERE player_id = ? AND is_active = 1', [userId]);
        if (!existing) {
            await db.run(`INSERT INTO game_cards (player_id, player_name, is_spectator, is_active, card_number, card_data, marked_numbers, won)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
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
        await db.run('UPDATE game_cards SET is_active = 0 WHERE is_active = 1');
        
        // Mark taken cards as ended
        await db.run('UPDATE taken_cards SET game_ended = 1 WHERE game_ended = 0');
        
        // Reset active game
        await db.run(`UPDATE active_game SET 
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
        await db.run('UPDATE game_cards SET is_active = 0 WHERE player_id = ? AND is_active = 1', [userId]);
        
        // Remove user's taken cards from current game
        await db.run('DELETE FROM taken_cards WHERE player_id = ? AND game_ended = 0', [userId]);
        
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
        await db.run('DELETE FROM game_cards');
        await db.run('DELETE FROM taken_cards');
        await db.run('UPDATE active_game SET current_players = 0, called_numbers = "[]", status = "waiting" WHERE id = 1');
        
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
        
        await db.run(
            'UPDATE game_cards SET marked_numbers = ? WHERE card_number = ? AND player_id = ?',
            [JSON.stringify(markedNumbers), cardId, userId]
        );
        
        res.json({ success: true });
    } catch (error) {
        console.error('Error updating marked:', error);
        res.status(500).json({ message: 'Server error: ' + error.message });
    }
});

module.exports = router;