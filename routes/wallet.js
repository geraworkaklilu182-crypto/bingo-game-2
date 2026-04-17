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

// Get wallet balance
router.get('/balance', verifyToken, async (req, res) => {
  try {
    const db = getDB();
    const result = await db.query(
      'SELECT balance FROM wallet WHERE user_id = $1',
      [req.userId]
    );
    
    res.json({ balance: result.rows[0]?.balance || 0 });
  } catch (error) {
    console.error('Error getting balance:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Deposit money
router.post('/deposit', verifyToken, async (req, res) => {
  try {
    const { amount } = req.body;
    const db = getDB();
    
    if (!amount || amount <= 0) {
      return res.status(400).json({ message: 'Invalid amount' });
    }
    
    if (amount < 10 || amount > 200) {
      return res.status(400).json({ message: 'Amount must be between 10 and 200' });
    }
    
    // Update wallet
    await db.query(
      'UPDATE wallet SET balance = balance + $1, updated_at = CURRENT_TIMESTAMP WHERE user_id = $2',
      [amount, req.userId]
    );
    
    // Record transaction
    await db.query(
      `INSERT INTO transactions (user_id, type, amount, description) 
       VALUES ($1, 'deposit', $2, $3)`,
      [req.userId, amount, `Deposited ${amount} coins`]
    );
    
    // Get new balance
    const result = await db.query(
      'SELECT balance FROM wallet WHERE user_id = $1',
      [req.userId]
    );
    
    res.json({ 
      success: true, 
      message: `Successfully deposited ${amount} coins!`,
      balance: result.rows[0].balance 
    });
    
  } catch (error) {
    console.error('Deposit error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Withdraw money
router.post('/withdraw', verifyToken, async (req, res) => {
  try {
    const { amount } = req.body;
    const db = getDB();
    
    if (!amount || amount <= 0) {
      return res.status(400).json({ message: 'Invalid amount' });
    }
    
    // Check current balance
    const walletResult = await db.query(
      'SELECT balance FROM wallet WHERE user_id = $1',
      [req.userId]
    );
    
    if (!walletResult.rows[0] || walletResult.rows[0].balance < amount) {
      return res.status(400).json({ message: 'Insufficient balance' });
    }
    
    // Update wallet
    await db.query(
      'UPDATE wallet SET balance = balance - $1, updated_at = CURRENT_TIMESTAMP WHERE user_id = $2',
      [amount, req.userId]
    );
    
    // Record transaction
    await db.query(
      `INSERT INTO transactions (user_id, type, amount, description) 
       VALUES ($1, 'withdraw', $2, $3)`,
      [req.userId, amount, `Withdrew ${amount} coins`]
    );
    
    // Get new balance
    const newWalletResult = await db.query(
      'SELECT balance FROM wallet WHERE user_id = $1',
      [req.userId]
    );
    
    res.json({ 
      success: true, 
      message: `Successfully withdrew ${amount} coins!`,
      balance: newWalletResult.rows[0].balance 
    });
    
  } catch (error) {
    console.error('Withdraw error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get transaction history
router.get('/transactions', verifyToken, async (req, res) => {
  try {
    const db = getDB();
    const result = await db.query(
      `SELECT id, type, amount, description, created_at 
       FROM transactions 
       WHERE user_id = $1 
       ORDER BY created_at DESC 
       LIMIT 50`,
      [req.userId]
    );
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error getting transactions:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;