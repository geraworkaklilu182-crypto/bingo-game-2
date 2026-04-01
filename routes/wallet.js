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
    const wallet = await db.get(
      'SELECT balance FROM wallet WHERE user_id = ?',
      [req.userId]
    );
    
    res.json({ balance: wallet?.balance || 0 });
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
    await db.run(
      'UPDATE wallet SET balance = balance + ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?',
      [amount, req.userId]
    );
    
    // Record transaction
    await db.run(
      'INSERT INTO transactions (user_id, type, amount, description) VALUES (?, ?, ?, ?)',
      [req.userId, 'deposit', amount, `Deposited ${amount} coins`]
    );
    
    // Get new balance
    const wallet = await db.get(
      'SELECT balance FROM wallet WHERE user_id = ?',
      [req.userId]
    );
    
    res.json({ 
      success: true, 
      message: `Successfully deposited ${amount} coins!`,
      balance: wallet.balance 
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
    const wallet = await db.get(
      'SELECT balance FROM wallet WHERE user_id = ?',
      [req.userId]
    );
    
    if (!wallet || wallet.balance < amount) {
      return res.status(400).json({ message: 'Insufficient balance' });
    }
    
    // Update wallet
    await db.run(
      'UPDATE wallet SET balance = balance - ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?',
      [amount, req.userId]
    );
    
    // Record transaction
    await db.run(
      'INSERT INTO transactions (user_id, type, amount, description) VALUES (?, ?, ?, ?)',
      [req.userId, 'withdraw', amount, `Withdrew ${amount} coins`]
    );
    
    // Get new balance
    const newWallet = await db.get(
      'SELECT balance FROM wallet WHERE user_id = ?',
      [req.userId]
    );
    
    res.json({ 
      success: true, 
      message: `Successfully withdrew ${amount} coins!`,
      balance: newWallet.balance 
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
    const transactions = await db.all(
      `SELECT id, type, amount, description, created_at 
       FROM transactions 
       WHERE user_id = ? 
       ORDER BY created_at DESC 
       LIMIT 50`,
      [req.userId]
    );
    
    res.json(transactions);
  } catch (error) {
    console.error('Error getting transactions:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;