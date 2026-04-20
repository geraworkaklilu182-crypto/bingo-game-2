const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { getDB } = require('../config/database');

const router = express.Router();

// Helper function to handle both SQLite and PostgreSQL
const executeQuery = async (db, query, params = []) => {
    // Check if db has 'query' method (PostgreSQL) or 'get/run/all' (SQLite wrapper)
    if (typeof db.query === 'function') {
        // PostgreSQL mode
        const result = await db.query(query, params);
        return result;
    } else {
        // SQLite mode (using wrapper)
        return await db.query(query, params);
    }
};

// Register
router.post('/register', async (req, res) => {
    try {
        const { username, email, password } = req.body;
        
        if (!username || !email || !password) {
            return res.status(400).json({ message: 'All fields are required' });
        }
        
        const db = getDB();
        
        // Check if user exists
        let existingUser;
        if (typeof db.get === 'function') {
            // SQLite mode
            existingUser = await db.get('SELECT * FROM users WHERE username = ? OR email = ?', [username, email]);
        } else {
            // PostgreSQL mode
            const result = await db.query('SELECT * FROM users WHERE username = $1 OR email = $2', [username, email]);
            existingUser = result.rows[0];
        }
        
        if (existingUser) {
            return res.status(400).json({ message: 'Username or email already exists' });
        }
        
        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);
        
        // Create user
        let userId;
        if (typeof db.run === 'function') {
            // SQLite mode
            const result = await db.run('INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)', [username, email, hashedPassword]);
            userId = result.lastID;
        } else {
            // PostgreSQL mode
            const result = await db.query('INSERT INTO users (username, email, password_hash) VALUES ($1, $2, $3) RETURNING id', [username, email, hashedPassword]);
            userId = result.rows[0].id;
        }
        
        // Create token
        const token = jwt.sign(
            { id: userId, username, role: 'user' },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );
        
        res.status(201).json({
            message: 'User created successfully',
            token,
            user: { id: userId, username, email, role: 'user' }
        });
        
    } catch (error) {
        console.error('Register error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Login
router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        if (!username || !password) {
            return res.status(400).json({ message: 'Username and password required' });
        }
        
        const db = getDB();
        
        // Find user
        let user;
        if (typeof db.get === 'function') {
            // SQLite mode
            user = await db.get('SELECT * FROM users WHERE username = ? OR email = ?', [username, username]);
        } else {
            // PostgreSQL mode
            const result = await db.query('SELECT * FROM users WHERE username = $1 OR email = $1', [username]);
            user = result.rows[0];
        }
        
        if (!user) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }
        
        // Check password
        const validPassword = await bcrypt.compare(password, user.password_hash);
        
        if (!validPassword) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }
        
        // Create token
        const token = jwt.sign(
            { id: user.id, username: user.username, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );
        
        res.json({
            message: 'Login successful',
            token,
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                total_score: user.total_score,
                games_played: user.games_played,
                games_won: user.games_won,
                role: user.role
            }
        });
        
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Get current user
router.get('/me', async (req, res) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        
        if (!token) {
            return res.status(401).json({ message: 'No token provided' });
        }
        
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const db = getDB();
        
        let user;
        if (typeof db.get === 'function') {
            // SQLite mode
            user = await db.get('SELECT id, username, email, total_score, games_played, games_won, role, created_at FROM users WHERE id = ?', [decoded.id]);
        } else {
            // PostgreSQL mode
            const result = await db.query('SELECT id, username, email, total_score, games_played, games_won, role, created_at FROM users WHERE id = $1', [decoded.id]);
            user = result.rows[0];
        }
        
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }
        
        res.json(user);
        
    } catch (error) {
        console.error('Auth error:', error);
        res.status(401).json({ message: 'Invalid token' });
    }
});

module.exports = router;