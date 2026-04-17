const express = require('express');
const jwt = require('jsonwebtoken');
const { getDB } = require('../config/database');

const router = express.Router();

// Admin middleware
const verifyAdmin = async (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ message: 'No token provided' });
  }
  
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

// ============ USER MANAGEMENT ============

// Get all users
router.get('/users', verifyAdmin, async (req, res) => {
  try {
    const db = getDB();
    const result = await db.query(
      'SELECT id, username, email, total_score, games_played, games_won, role, created_at FROM users ORDER BY id'
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update user role
router.put('/users/:id/role', verifyAdmin, async (req, res) => {
  try {
    const { role } = req.body;
    const userId = req.params.id;
    const db = getDB();
    
    if (!['user', 'admin', 'worker'].includes(role)) {
      return res.status(400).json({ message: 'Invalid role' });
    }
    
    await db.query('UPDATE users SET role = $1 WHERE id = $2', [role, userId]);
    res.json({ message: 'User role updated successfully' });
  } catch (error) {
    console.error('Error updating role:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Delete user
router.delete('/users/:id', verifyAdmin, async (req, res) => {
  try {
    const userId = req.params.id;
    const db = getDB();
    
    await db.query('DELETE FROM games WHERE user_id = $1', [userId]);
    await db.query('DELETE FROM users WHERE id = $1', [userId]);
    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ============ GAME MANAGEMENT ============

// Get all games
router.get('/games', verifyAdmin, async (req, res) => {
  try {
    const db = getDB();
    const result = await db.query(
      `SELECT g.*, u.username 
       FROM games g 
       JOIN users u ON g.user_id = u.id 
       ORDER BY g.created_at DESC 
       LIMIT 50`
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching games:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ============ WALLET & TRANSACTIONS ============

// Get wallet statistics
router.get('/wallet-stats', verifyAdmin, async (req, res) => {
  try {
    const db = getDB();
    
    // Get total commission
    const commissionResult = await db.query(
      'SELECT SUM(amount) as total FROM transactions WHERE type = $1',
      ['commission']
    );
    
    // Get total deposits
    const depositsResult = await db.query(
      'SELECT SUM(amount) as total FROM transactions WHERE type = $1',
      ['deposit']
    );
    
    // Get total withdrawals
    const withdrawalsResult = await db.query(
      'SELECT SUM(amount) as total FROM transactions WHERE type = $1',
      ['withdraw']
    );
    
    res.json({
      totalCommission: commissionResult.rows[0]?.total || 0,
      totalDeposits: depositsResult.rows[0]?.total || 0,
      totalWithdrawals: withdrawalsResult.rows[0]?.total || 0
    });
    
  } catch (error) {
    console.error('Error getting wallet stats:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get all transactions (for admin)
router.get('/transactions', verifyAdmin, async (req, res) => {
  try {
    const db = getDB();
    const result = await db.query(
      `SELECT t.*, u.username 
       FROM transactions t 
       JOIN users u ON t.user_id = u.id 
       ORDER BY t.created_at DESC 
       LIMIT 100`
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error getting transactions:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get user wallet balance (admin can view any user)
router.get('/user-wallet/:userId', verifyAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    const db = getDB();
    
    const walletResult = await db.query(
      'SELECT balance FROM wallet WHERE user_id = $1',
      [userId]
    );
    
    const transactionsResult = await db.query(
      `SELECT type, amount, description, created_at 
       FROM transactions 
       WHERE user_id = $1 
       ORDER BY created_at DESC 
       LIMIT 20`,
      [userId]
    );
    
    res.json({
      balance: walletResult.rows[0]?.balance || 0,
      transactions: transactionsResult.rows
    });
    
  } catch (error) {
    console.error('Error getting user wallet:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Admin can adjust user balance (add or remove coins)
router.post('/adjust-balance', verifyAdmin, async (req, res) => {
  try {
    const { userId, amount, reason } = req.body;
    const db = getDB();
    
    if (!userId || !amount || amount === 0) {
      return res.status(400).json({ message: 'Invalid request' });
    }
    
    // Update balance
    await db.query(
      'UPDATE wallet SET balance = balance + $1, updated_at = CURRENT_TIMESTAMP WHERE user_id = $2',
      [amount, userId]
    );
    
    // Record transaction
    const type = amount > 0 ? 'deposit' : 'withdraw';
    await db.query(
      `INSERT INTO transactions (user_id, type, amount, description) 
       VALUES ($1, $2, $3, $4)`,
      [userId, type, Math.abs(amount), `Admin adjustment: ${reason}`]
    );
    
    res.json({ 
      message: `Successfully ${amount > 0 ? 'added' : 'removed'} ${Math.abs(amount)} coins`,
      amount: amount
    });
    
  } catch (error) {
    console.error('Error adjusting balance:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ============ TIMER SETTINGS ============

// Get timer settings (anyone can view)
router.get('/timer-settings', async (req, res) => {
    try {
        const db = getDB();
        const result = await db.query('SELECT timer_seconds FROM settings WHERE id = 1');
        res.json({ timerSeconds: result.rows[0]?.timer_seconds || 45 });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Update timer settings (ADMIN ONLY)
router.put('/timer-settings', verifyAdmin, async (req, res) => {
    try {
        const { timerSeconds } = req.body;
        const db = getDB();
        await db.query('UPDATE settings SET timer_seconds = $1, updated_at = CURRENT_TIMESTAMP WHERE id = 1', [timerSeconds]);
        res.json({ message: 'Timer settings updated', timerSeconds });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

// ============ SESSION & CARD MANAGEMENT ============

// Get taken cards for current session (ADMIN ONLY)
router.get('/taken-cards/:sessionId', verifyAdmin, async (req, res) => {
    try {
        const { sessionId } = req.params;
        const db = getDB();
        const result = await db.query('SELECT card_number, player_name FROM session_cards WHERE session_id = $1', [sessionId]);
        res.json({ takenCards: result.rows.map(c => c.card_number) });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Take a card (ADMIN ONLY)
router.post('/take-card', verifyAdmin, async (req, res) => {
    try {
        const { sessionId, cardNumber, playerName } = req.body;
        const db = getDB();
        
        // Check if card is already taken
        const existingResult = await db.query('SELECT * FROM session_cards WHERE session_id = $1 AND card_number = $2', [sessionId, cardNumber]);
        if (existingResult.rows.length > 0) {
            return res.status(400).json({ message: 'Card already taken!' });
        }
        
        await db.query('INSERT INTO session_cards (session_id, card_number, player_name) VALUES ($1, $2, $3)', 
            [sessionId, cardNumber, playerName]);
        
        res.json({ success: true, message: 'Card taken successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Winner settings
router.get('/winner-settings', verifyAdmin, async (req, res) => {
    const db = getDB();
    const result = await db.query('SELECT single_winner, multiple_winners_threshold FROM settings WHERE id = 1');
    res.json(result.rows[0] || { single_winner: 1, multiple_winners_threshold: 50 });
});

router.put('/winner-settings', verifyAdmin, async (req, res) => {
    const { single_winner, multiple_winners_threshold } = req.body;
    const db = getDB();
    await db.query('UPDATE settings SET single_winner = $1, multiple_winners_threshold = $2 WHERE id = 1', 
        [single_winner, multiple_winners_threshold]);
    res.json({ success: true });
});

module.exports = router;