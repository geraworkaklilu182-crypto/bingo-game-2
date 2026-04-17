const express = require('express');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { getDB } = require('../config/database');

const router = express.Router();

// Ensure uploads directory exists
const uploadDir = path.join(__dirname, '../public/uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        cb(null, 'screenshot-' + uniqueSuffix + ext);
    }
});

const fileFilter = (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
        return cb(null, true);
    } else {
        cb(new Error('Only image files are allowed'));
    }
};

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
    fileFilter: fileFilter
});

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

// Get TeleBirr number (for users to send money to)
router.get('/telebirr-number', (req, res) => {
    res.json({ 
        number: '09XXXXXXXX', // REPLACE WITH YOUR ACTUAL TELEBIRR NUMBER
        name: 'DIL BINGO',
        instructions: 'Send the exact amount to this TeleBirr number, then take a screenshot of the confirmation.'
    });
});

// Submit deposit request
router.post('/deposit-request', verifyToken, upload.single('screenshot'), async (req, res) => {
    try {
        console.log('Deposit request received');
        const { amount, telebirr_number } = req.body;
        const userId = req.userId;
        
        console.log('User ID:', userId);
        console.log('Amount:', amount);
        console.log('TeleBirr:', telebirr_number);
        console.log('File:', req.file);
        
        // Validation
        if (!amount || amount < 10) {
            return res.status(400).json({ message: 'Minimum deposit is 10 birr' });
        }
        
        if (amount > 10000) {
            return res.status(400).json({ message: 'Maximum deposit is 10,000 birr' });
        }
        
        if (!telebirr_number || telebirr_number.length < 10) {
            return res.status(400).json({ message: 'Valid TeleBirr number required' });
        }
        
        if (!req.file) {
            return res.status(400).json({ message: 'Screenshot of payment required' });
        }
        
        const db = getDB();
        
        // Generate unique transaction ID
        const transactionId = 'DEP_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8);
        
        const screenshotUrl = '/uploads/' + req.file.filename;
        
        const result = await db.query(
            `INSERT INTO deposit_requests (user_id, amount, telebirr_number, screenshot_url, status, transaction_id)
             VALUES ($1, $2, $3, $4, 'pending', $5) RETURNING id`,
            [userId, amount, telebirr_number, screenshotUrl, transactionId]
        );
        
        console.log('Deposit request saved, ID:', result.rows[0].id);
        
        res.json({
            success: true,
            message: 'Deposit request submitted! Admin will review and approve within 24 hours.',
            requestId: result.rows[0].id
        });
        
    } catch (error) {
        console.error('Deposit request error:', error);
        res.status(500).json({ message: 'Server error: ' + error.message });
    }
});

// Submit withdrawal request
router.post('/withdrawal-request', verifyToken, async (req, res) => {
    try {
        const { amount, telebirr_number } = req.body;
        const userId = req.userId;
        const db = getDB();
        
        // Check minimum withdrawal
        if (!amount || amount < 50) {
            return res.status(400).json({ message: 'Minimum withdrawal is 50 birr' });
        }
        
        if (amount > 50000) {
            return res.status(400).json({ message: 'Maximum withdrawal is 50,000 birr' });
        }
        
        if (!telebirr_number || telebirr_number.length < 10) {
            return res.status(400).json({ message: 'Valid TeleBirr number required' });
        }
        
        // Check user balance
        const walletResult = await db.query('SELECT balance FROM wallet WHERE user_id = $1', [userId]);
        
        if (!walletResult.rows[0] || walletResult.rows[0].balance < amount) {
            return res.status(400).json({ message: 'Insufficient balance' });
        }
        
        // Generate unique transaction ID
        const transactionId = 'WIT_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8);
        
        const result = await db.query(
            `INSERT INTO withdrawal_requests (user_id, amount, telebirr_number, status, transaction_id)
             VALUES ($1, $2, $3, 'pending', $4) RETURNING id`,
            [userId, amount, telebirr_number, transactionId]
        );
        
        res.json({
            success: true,
            message: 'Withdrawal request submitted! Admin will process within 24 hours.',
            requestId: result.rows[0].id
        });
        
    } catch (error) {
        console.error('Withdrawal request error:', error);
        res.status(500).json({ message: 'Server error: ' + error.message });
    }
});

// Get user's deposit requests
router.get('/my-deposits', verifyToken, async (req, res) => {
    try {
        const userId = req.userId;
        const db = getDB();
        
        const result = await db.query(
            `SELECT id, amount, status, screenshot_url, created_at, approved_at
             FROM deposit_requests
             WHERE user_id = $1
             ORDER BY created_at DESC`,
            [userId]
        );
        
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching deposits:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Get user's withdrawal requests
router.get('/my-withdrawals', verifyToken, async (req, res) => {
    try {
        const userId = req.userId;
        const db = getDB();
        
        const result = await db.query(
            `SELECT id, amount, status, created_at, completed_at
             FROM withdrawal_requests
             WHERE user_id = $1
             ORDER BY created_at DESC`,
            [userId]
        );
        
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching withdrawals:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// ============ ADMIN ROUTES ============

// Get all pending deposits
router.get('/admin/pending-deposits', verifyAdmin, async (req, res) => {
    try {
        const db = getDB();
        
        const result = await db.query(
            `SELECT d.*, u.username, u.email
             FROM deposit_requests d
             JOIN users u ON d.user_id = u.id
             WHERE d.status = 'pending'
             ORDER BY d.created_at ASC`
        );
        
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching pending deposits:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Get all pending withdrawals
router.get('/admin/pending-withdrawals', verifyAdmin, async (req, res) => {
    try {
        const db = getDB();
        
        const result = await db.query(
            `SELECT w.*, u.username, u.email
             FROM withdrawal_requests w
             JOIN users u ON w.user_id = u.id
             WHERE w.status = 'pending'
             ORDER BY w.created_at ASC`
        );
        
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching pending withdrawals:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Approve deposit
router.post('/admin/approve-deposit/:id', verifyAdmin, async (req, res) => {
    try {
        const depositId = req.params.id;
        const { admin_notes } = req.body;
        const db = getDB();
        
        // Get deposit request
        const depositResult = await db.query(
            'SELECT * FROM deposit_requests WHERE id = $1 AND status = $2',
            [depositId, 'pending']
        );
        
        const deposit = depositResult.rows[0];
        
        if (!deposit) {
            return res.status(404).json({ message: 'Deposit request not found or already processed' });
        }
        
        // Update deposit status
        await db.query(
            `UPDATE deposit_requests 
             SET status = 'approved', admin_notes = $1, approved_at = CURRENT_TIMESTAMP
             WHERE id = $2`,
            [admin_notes || 'Approved by admin', depositId]
        );
        
        // Add coins to user's wallet
        await db.query(
            'UPDATE wallet SET balance = balance + $1, updated_at = CURRENT_TIMESTAMP WHERE user_id = $2',
            [deposit.amount, deposit.user_id]
        );
        
        // Record transaction
        await db.query(
            `INSERT INTO transactions (user_id, type, amount, description)
             VALUES ($1, 'deposit', $2, $3)`,
            [deposit.user_id, deposit.amount, `Deposit approved - Request #${depositId}`]
        );
        
        res.json({ success: true, message: 'Deposit approved and coins added!' });
        
    } catch (error) {
        console.error('Error approving deposit:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Reject deposit
router.post('/admin/reject-deposit/:id', verifyAdmin, async (req, res) => {
    try {
        const depositId = req.params.id;
        const { admin_notes } = req.body;
        const db = getDB();
        
        await db.query(
            `UPDATE deposit_requests 
             SET status = 'rejected', admin_notes = $1
             WHERE id = $2`,
            [admin_notes || 'Rejected by admin', depositId]
        );
        
        res.json({ success: true, message: 'Deposit rejected' });
        
    } catch (error) {
        console.error('Error rejecting deposit:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Complete withdrawal
router.post('/admin/complete-withdrawal/:id', verifyAdmin, async (req, res) => {
    try {
        const withdrawalId = req.params.id;
        const { admin_notes } = req.body;
        const db = getDB();
        
        // Get withdrawal request
        const withdrawalResult = await db.query(
            'SELECT * FROM withdrawal_requests WHERE id = $1 AND status = $2',
            [withdrawalId, 'pending']
        );
        
        const withdrawal = withdrawalResult.rows[0];
        
        if (!withdrawal) {
            return res.status(404).json({ message: 'Withdrawal request not found or already processed' });
        }
        
        // Check user balance again
        const walletResult = await db.query('SELECT balance FROM wallet WHERE user_id = $1', [withdrawal.user_id]);
        
        if (!walletResult.rows[0] || walletResult.rows[0].balance < withdrawal.amount) {
            return res.status(400).json({ message: 'Insufficient balance' });
        }
        
        // Update withdrawal status
        await db.query(
            `UPDATE withdrawal_requests 
             SET status = 'completed', admin_notes = $1, completed_at = CURRENT_TIMESTAMP
             WHERE id = $2`,
            [admin_notes || 'Processed by admin', withdrawalId]
        );
        
        // Deduct coins from user's wallet
        await db.query(
            'UPDATE wallet SET balance = balance - $1, updated_at = CURRENT_TIMESTAMP WHERE user_id = $2',
            [withdrawal.amount, withdrawal.user_id]
        );
        
        // Record transaction
        await db.query(
            `INSERT INTO transactions (user_id, type, amount, description)
             VALUES ($1, 'withdraw', $2, $3)`,
            [withdrawal.user_id, withdrawal.amount, `Withdrawal processed - Request #${withdrawalId}`]
        );
        
        res.json({ success: true, message: 'Withdrawal completed!' });
        
    } catch (error) {
        console.error('Error completing withdrawal:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Reject withdrawal
router.post('/admin/reject-withdrawal/:id', verifyAdmin, async (req, res) => {
    try {
        const withdrawalId = req.params.id;
        const { admin_notes } = req.body;
        const db = getDB();
        
        await db.query(
            `UPDATE withdrawal_requests 
             SET status = 'rejected', admin_notes = $1
             WHERE id = $2`,
            [admin_notes || 'Rejected by admin', withdrawalId]
        );
        
        res.json({ success: true, message: 'Withdrawal rejected' });
        
    } catch (error) {
        console.error('Error rejecting withdrawal:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Get all deposit requests (admin)
router.get('/admin/all-deposits', verifyAdmin, async (req, res) => {
    try {
        const db = getDB();
        
        const result = await db.query(
            `SELECT d.*, u.username, u.email
             FROM deposit_requests d
             JOIN users u ON d.user_id = u.id
             ORDER BY d.created_at DESC
             LIMIT 100`
        );
        
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching deposits:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Get all withdrawal requests (admin)
router.get('/admin/all-withdrawals', verifyAdmin, async (req, res) => {
    try {
        const db = getDB();
        
        const result = await db.query(
            `SELECT w.*, u.username, u.email
             FROM withdrawal_requests w
             JOIN users u ON w.user_id = u.id
             ORDER BY w.created_at DESC
             LIMIT 100`
        );
        
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching withdrawals:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;