const express = require('express');
const bcrypt = require('bcrypt');
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

// Update user profile
router.put('/update', verifyToken, async (req, res) => {
  try {
    const { username, email, password } = req.body;
    const userId = req.userId;
    const db = getDB();
    
    let updateQuery = 'UPDATE users SET username = $1, email = $2';
    const params = [username, email];
    
    if (password) {
      const hashedPassword = await bcrypt.hash(password, 10);
      updateQuery += ', password_hash = $3';
      params.push(hashedPassword);
    }
    
    updateQuery += ' WHERE id = $' + (params.length + 1);
    params.push(userId);
    
    await db.query(updateQuery, params);
    
    res.json({ message: 'Profile updated successfully' });
    
  } catch (error) {
    console.error('Update error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get user profile
router.get('/profile', verifyToken, async (req, res) => {
  try {
    const userId = req.userId;
    const db = getDB();
    
    const result = await db.query(
      'SELECT id, username, email, total_score, games_played, games_won, role, created_at FROM users WHERE id = $1',
      [userId]
    );
    
    const user = result.rows[0];
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // Get wallet balance
    const walletResult = await db.query('SELECT balance FROM wallet WHERE user_id = $1', [userId]);
    user.balance = walletResult.rows[0]?.balance || 0;
    
    res.json(user);
    
  } catch (error) {
    console.error('Profile error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;