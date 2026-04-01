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
    const wallet = await db.get('SELECT balance FROM wallet WHERE user_id = ?', [userId]);
    
    if (!wallet || wallet.balance < 10) {
      return res.status(400).json({ 
        message: 'Insufficient balance! You need at least 10 coins to play.',
        balance: wallet?.balance || 0
      });
    }
    
    // 2. DEDUCT GAME COST (10 coins)
    await db.run('UPDATE wallet SET balance = balance - 10, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?', [userId]);
    
    // 3. Record game cost transaction
    await db.run(
      `INSERT INTO transactions (user_id, type, amount, description) 
       VALUES (?, 'game_loss', 10, 'Paid 10 coins to play Bingo')`,
      [userId]
    );
    
    // 4. SAVE THE GAME FIRST
    const result = await db.run(
      `INSERT INTO games (user_id, card_numbers, marked_numbers, score, won, completed_at) 
       VALUES (?, ?, ?, ?, ?, datetime('now'))`,
      [userId, JSON.stringify(card_numbers), JSON.stringify(marked_numbers), score, won ? 1 : 0]
    );
    
    let finalMessage = 'Game saved!';
    let newBalance = wallet.balance - 10; // Start with balance after game cost
    
    // 5. IF USER WON, ADD WINNINGS WITH COMMISSION
    if (won) {
      const winAmount = score;
      const commission = Math.floor(winAmount * 0.2);
      const playerWinAmount = winAmount - commission;
      
      // Update player balance with winnings
      await db.run(
        'UPDATE wallet SET balance = balance + ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?',
        [playerWinAmount, userId]
      );
      
      // Record player win transaction
      await db.run(
        `INSERT INTO transactions (user_id, type, amount, description) 
         VALUES (?, 'game_win', ?, ?)`,
        [userId, playerWinAmount, `Won ${playerWinAmount} coins from Bingo! (20% commission taken)`]
      );
      
      // Record commission for admin
      const admin = await db.get('SELECT id FROM users WHERE role = "admin" LIMIT 1');
      if (admin) {
        await db.run(
          `INSERT INTO transactions (user_id, type, amount, description) 
           VALUES (?, 'commission', ?, ?)`,
          [admin.id, commission, `Commission from game #${result.lastID}`]
        );
        
        // Update admin wallet
        await db.run(
          'UPDATE wallet SET balance = balance + ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?',
          [commission, admin.id]
        );
      }
      
      // Update user stats for win
      await db.run(
        `UPDATE users SET games_played = games_played + 1, games_won = games_won + 1, total_score = total_score + ? 
         WHERE id = ?`,
        [score, userId]
      );
      
      finalMessage = `🎉 BINGO! You won ${playerWinAmount} coins! (${commission} coins commission taken)`;
      
      // Get new balance after win
      const updatedWallet = await db.get('SELECT balance FROM wallet WHERE user_id = ?', [userId]);
      newBalance = updatedWallet.balance;
      
    } else {
      // Update user stats for loss
      await db.run(
        `UPDATE users SET games_played = games_played + 1 WHERE id = ?`,
        [userId]
      );
      
      finalMessage = '😢 Game lost! Better luck next time! -10 coins';
      
      // Get new balance after loss
      const updatedWallet = await db.get('SELECT balance FROM wallet WHERE user_id = ?', [userId]);
      newBalance = updatedWallet.balance;
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
    
    const games = await db.all(
      `SELECT id, card_numbers, marked_numbers, score, won, completed_at, created_at 
       FROM games 
       WHERE user_id = ? 
       ORDER BY created_at DESC 
       LIMIT 20`,
      [userId]
    );
    
    res.json(games);
    
  } catch (error) {
    console.error('Get history error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;