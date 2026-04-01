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
    
    let updateQuery = 'UPDATE users SET username = ?, email = ?';
    const params = [username, email];
    
    if (password) {
      const hashedPassword = await bcrypt.hash(password, 10);
      updateQuery += ', password_hash = ?';
      params.push(hashedPassword);
    }
    
    updateQuery += ' WHERE id = ?';
    params.push(userId);
    
    await db.run(updateQuery, params);
    
    res.json({ message: 'Profile updated successfully' });
    
  } catch (error) {
    console.error('Update error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;