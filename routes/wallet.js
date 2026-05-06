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
    let result = await db.query(
      'SELECT balance FROM wallet WHERE user_id = $1',
      [req.userId]
    );

     // Create wallet if doesn't exist
    if (!result.rows[0]) {
      await db.query(
        'INSERT INTO wallet (user_id, balance) VALUES ($1, 10)',
        [req.userId]
      );
      result = await db.query(
        'SELECT balance FROM wallet WHERE user_id = $1',
        [req.userId]
      );
    }
    
    res.json({ balance: result.rows[0]?.balance || 0 });
  } catch (error) {
    console.error('Error getting balance:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Deposit money
/*router.post('/deposit', verifyToken, async (req, res) => {
  try {
    const { amount } = req.body;
    const db = getDB();
    
    if (!amount || amount <= 0) {
      return res.status(400).json({ message: 'Invalid amount' });
    }
    
    if (amount < 10 || amount > 200) {
      return res.status(400).json({ message: 'Amount must be between 10 and 200' });
    }

    // Check if wallet exists, if not create it
    const walletCheck = await db.query(
      'SELECT balance FROM wallet WHERE user_id = $1',
      [req.userId]
    );
    
    if (!walletCheck.rows[0]) {
      // Create wallet for user with initial 10 coins
      await db.query(
        'INSERT INTO wallet (user_id, balance) VALUES ($1, $10)',
        [req.userId]
      );
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
      //balance: result.rows[0].balance 
      balance: result.rows[0]?.balance || 0
    });
    
  } catch (error) {
    console.error('Deposit error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});*/

// Request deposit (requires admin approval)
/*router.post('/deposit', verifyToken, async (req, res) => {
  try {
    const { amount, referenceNumber, paymentMethod } = req.body;
    const db = getDB();
    
    if (!amount || amount <= 0) {
      return res.status(400).json({ message: 'Invalid amount' });
    }
    
    if (amount < 10 || amount > 10000) {
      return res.status(400).json({ message: 'Amount must be between 10 and 10000' });
    }
    
    if (!referenceNumber) {
      return res.status(400).json({ message: 'Transaction reference number is required' });
    }
    
    // Create pending deposit request (admin will approve)
    const result = await db.query(
      `INSERT INTO pending_deposits (user_id, amount, reference_number, payment_method, status) 
       VALUES ($1, $2, $3, $4, 'pending') RETURNING id`,
      [req.userId, amount, referenceNumber, paymentMethod || 'telebirr']
    );
    
    res.json({ 
      success: true, 
      message: 'Deposit request submitted. Admin will review and approve within 24 hours.',
      requestId: result.rows[0].id
    });
    
  } catch (error) {
    console.error('Deposit request error:', error);
    res.status(500).json({ message: 'Server error: ' + error.message });
  }
});*/



// Request deposit (requires admin approval)
router.post('/deposit', verifyToken, async (req, res) => {
  try {
    const { amount, referenceNumber, telebirrNumber, screenshotUrl } = req.body;
    const db = getDB();
    
    if (!amount || amount <= 0) {
      return res.status(400).json({ message: 'Invalid amount' });
    }
    
    if (amount < 10 || amount > 10000) {
      return res.status(400).json({ message: 'Amount must be between 10 and 10000' });
    }
    
    if (!referenceNumber) {
      return res.status(400).json({ message: 'Transaction reference number is required' });
    }
    
    if (!telebirrNumber) {
      return res.status(400).json({ message: 'Telebirr number is required' });
    }
    
    // Create pending deposit request
    const result = await db.query(
      `INSERT INTO pending_deposits (user_id, amount, reference_number, telebirr_number, screenshot_url, status) 
       VALUES ($1, $2, $3, $4, $5, 'pending') RETURNING id`,
      [req.userId, amount, referenceNumber, telebirrNumber, screenshotUrl || null]
    );
    
    res.json({ 
      success: true, 
      message: 'Deposit request submitted. Admin will review and approve.',
      requestId: result.rows[0].id
    });
    
  } catch (error) {
    console.error('Deposit request error:', error);
    res.status(500).json({ message: 'Server error: ' + error.message });
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