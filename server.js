const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const { initDB, getDB } = require('./config/database');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Redirect root to login page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// Start server function
const startServer = async () => {
  try {
    // Wait for database to initialize
    await initDB();
    
    // Test route
    app.get('/api/test', (req, res) => {
      res.json({ message: 'Bingo API is running!' });
    });
    
    // Import routes

    app.use('/api/auth', require('./routes/auth'));
    app.use('/api/game', require('./routes/game'));
    app.use('/api/user', require('./routes/user'));
    app.use('/api/admin', require('./routes/admin'));
    app.use('/api/wallet', require('./routes/wallet'));
    
    // Start server
    app.listen(PORT, () => {
      console.log(`🚀 Server running at http://localhost:${PORT}`);
      console.log(`📁 Static files served from /public`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
  }
};

// Start everything
startServer();