const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const { getDB } = require('../config/database');

const router = express.Router();

// Ensure uploads directory exists
const uploadDir = path.join(__dirname, '../public/uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Configure multer
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        cb(null, 'image-' + uniqueSuffix + ext);
    }
});

const upload = multer({ storage: storage });

// Admin middleware
const verifyAdmin = async (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'No token provided' });
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const db = getDB();
        const user = await db.query('SELECT role FROM users WHERE id = $1', [decoded.id]);
        const userRow = user.rows[0];
        if (!userRow || userRow.role !== 'admin') {
            return res.status(403).json({ message: 'Admin access required' });
        }
        req.userId = decoded.id;
        next();
    } catch (error) {
        return res.status(401).json({ message: 'Invalid token' });
    }
};

// Upload hero image (admin only)
router.post('/hero', verifyAdmin, upload.single('image'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: 'No file uploaded' });
        }
        
        const imageUrl = `/uploads/${req.file.filename}`;
        
        // Save to database
        const db = getDB();
        await db.query(`INSERT INTO settings (id, hero_image) VALUES (1, $1) 
                        ON CONFLICT (id) DO UPDATE SET hero_image = $1`, [imageUrl]);
        
        res.json({ success: true, imageUrl: imageUrl });
    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Upload game image (admin only)
router.post('/game/:gameId', verifyAdmin, upload.single('image'), async (req, res) => {
    try {
        const gameId = req.params.gameId;
        if (!req.file) {
            return res.status(400).json({ message: 'No file uploaded' });
        }
        
        const imageUrl = `/uploads/${req.file.filename}`;
        
        // Save to database
        const db = getDB();
        await db.query(`INSERT INTO settings (id, game_image_${gameId}) VALUES (1, $1) 
                        ON CONFLICT (id) DO UPDATE SET game_image_${gameId} = $1`, [imageUrl]);
        
        res.json({ success: true, imageUrl: imageUrl });
    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Get all images (for users to see)
router.get('/all', async (req, res) => {
    try {
        const db = getDB();
        const result = await db.query(`SELECT hero_image, game_image_1, game_image_2, game_image_3 FROM settings WHERE id = 1`);
        const settings = result.rows[0] || {};
        res.json({
            heroImage: settings.hero_image || null,
            gameImages: {
                1: settings.game_image_1 || null,
                2: settings.game_image_2 || null,
                3: settings.game_image_3 || null
            }
        });
    } catch (error) {
        console.error('Error getting images:', error);
        res.json({ heroImage: null, gameImages: {} });
    }
});

module.exports = router;