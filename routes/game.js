const express = require('express');
const jwt = require('jsonwebtoken');
const { getDB } = require('../config/database');

const router = express.Router();

// Middleware to verify token
const verifyToken = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ message: 'No token provided' });
  }
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = decoded.id;
    next();
  } catch (error) {
    return res.status(401).json({ message: 'Invalid token' });
  }
};

// Save game result
router.post('/save', verifyToken, async (req, res) => {
  try {
    const { card_numbers, marked_numbers, score, won } = req.body;
    const userId = req.userId;
    const db = getDB();
    
    // 1. CHECK BALANCE FIRST
    const walletResult = await db.query('SELECT balance FROM wallet WHERE user_id = $1', [userId]);
    const wallet = walletResult.rows[0];
    
    if (!wallet || wallet.balance < 10) {
      return res.status(400).json({ 
        message: 'Insufficient balance! You need at least 10 coins to play.',
        balance: wallet?.balance || 0
      });
    }
    
    // 2. DEDUCT GAME COST (10 coins)
    await db.query('UPDATE wallet SET balance = balance - 10, updated_at = CURRENT_TIMESTAMP WHERE user_id = $1', [userId]);
    
    // 3. Record game cost transaction
    await db.query(
      `INSERT INTO transactions (user_id, type, amount, description) 
       VALUES ($1, 'game_loss', 10, 'Paid 10 coins to play Bingo')`,
      [userId]
    );
    
    // 4. SAVE THE GAME FIRST
    const result = await db.query(
      `INSERT INTO games (user_id, card_numbers, marked_numbers, score, won, completed_at) 
       VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP) RETURNING id`,
      [userId, JSON.stringify(card_numbers), JSON.stringify(marked_numbers), score, won ? 1 : 0]
    );
    
    const gameId = result.rows[0].id;
    
    let finalMessage = 'Game saved!';
    let newBalance = wallet.balance - 10;
    
    // 5. IF USER WON, ADD WINNINGS WITH COMMISSION
    if (won) {
      const winAmount = score;
      const commission = Math.floor(winAmount * 0.2);
      const playerWinAmount = winAmount - commission;
      
      // Update player balance with winnings
      await db.query(
        'UPDATE wallet SET balance = balance + $1, updated_at = CURRENT_TIMESTAMP WHERE user_id = $2',
        [playerWinAmount, userId]
      );
      
      // Record player win transaction
      await db.query(
        `INSERT INTO transactions (user_id, type, amount, description) 
         VALUES ($1, 'game_win', $2, $3)`,
        [userId, playerWinAmount, `Won ${playerWinAmount} coins from Bingo! (20% commission taken)`]
      );
      
      // Record commission for admin
      const adminResult = await db.query('SELECT id FROM users WHERE role = $1 LIMIT 1', ['admin']);
      if (adminResult.rows.length > 0) {
        const adminId = adminResult.rows[0].id;
        
        await db.query(
          `INSERT INTO transactions (user_id, type, amount, description) 
           VALUES ($1, 'commission', $2, $3)`,
          [adminId, commission, `Commission from game #${gameId}`]
        );
        
        // Update admin wallet
        await db.query(
          'UPDATE wallet SET balance = balance + $1, updated_at = CURRENT_TIMESTAMP WHERE user_id = $2',
          [commission, adminId]
        );
      }
      
      // Update user stats for win
      await db.query(
        `UPDATE users SET games_played = games_played + 1, games_won = games_won + 1, total_score = total_score + $1 
         WHERE id = $2`,
        [score, userId]
      );
      
      finalMessage = `🎉 BINGO! You won ${playerWinAmount} coins! (${commission} coins commission taken)`;
      
      // Get new balance after win
      const updatedWalletResult = await db.query('SELECT balance FROM wallet WHERE user_id = $1', [userId]);
      newBalance = updatedWalletResult.rows[0].balance;
      
    } else {
      // Update user stats for loss
      await db.query(
        `UPDATE users SET games_played = games_played + 1 WHERE id = $1`,
        [userId]
      );
      
      finalMessage = '😢 Game lost! Better luck next time! -10 coins';
      
      // Get new balance after loss
      const updatedWalletResult = await db.query('SELECT balance FROM wallet WHERE user_id = $1', [userId]);
      newBalance = updatedWalletResult.rows[0].balance;
    }
    
    res.json({ 
      message: finalMessage,
      balance: newBalance,
      won: won
    });
    
  } catch (error) {
    console.error('Save game error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get user game history
router.get('/history', verifyToken, async (req, res) => {
  try {
    const userId = req.userId;
    const db = getDB();
    
    const result = await db.query(
      `SELECT id, card_numbers, marked_numbers, score, won, completed_at, created_at 
       FROM games 
       WHERE user_id = $1 
       ORDER BY created_at DESC 
       LIMIT 20`,
      [userId]
    );
    
    res.json(result.rows);
    
  } catch (error) {
    console.error('Get history error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;