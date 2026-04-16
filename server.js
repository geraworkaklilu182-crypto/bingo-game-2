const http = require('http');
const socketIo = require('socket.io');
const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const { initDB, getDB } = require('./config/database');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

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
    await initDB();
    
    app.get('/api/test', (req, res) => {
      res.json({ message: 'Bingo API is running!' });
    });
    
    app.use('/api/auth', require('./routes/auth'));
    app.use('/api/game', require('./routes/game'));
    app.use('/api/user', require('./routes/user'));
    app.use('/api/admin', require('./routes/admin'));
    app.use('/api/wallet', require('./routes/wallet'));
    app.use('/api/timer', require('./routes/admin-timer'));
    app.use('/api/payment', require('./routes/payment'));
    app.use('/api/game-session', require('./routes/game-session'));
    
    // Game rooms storage
    const gameRooms = new Map();
    const gameTimers = new Map();

    // Start game timer function
    function startGameTimer(gameId) {
        console.log(`[TIMER] startGameTimer called for game ${gameId}`);
        const room = gameRooms.get(gameId);
        if (!room) {
            console.log(`[TIMER] Room ${gameId} not found`);
            return;
        }
        if (room.gameActive) {
            console.log(`[TIMER] Game already active for ${gameId}`);
            return;
        }
        
        console.log(`[TIMER] Starting timer for ${gameId}, timeLeft: ${room.timeLeft}`);
        
        if (gameTimers.has(gameId)) {
            clearInterval(gameTimers.get(gameId));
        }
        
        room.status = 'countdown';
        
        const sendTimerUpdate = () => {
            const mins = Math.floor(room.timeLeft / 60);
            const secs = room.timeLeft % 60;
            io.to(gameId).emit('timer-update', {
                timeLeft: room.timeLeft,
                minutes: mins,
                seconds: secs,
                display: `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
            });
        };
        
        sendTimerUpdate();
        
        const interval = setInterval(() => {
            const currentRoom = gameRooms.get(gameId);
            if (!currentRoom) {
                clearInterval(interval);
                gameTimers.delete(gameId);
                return;
            }
            
            if (currentRoom.timeLeft <= 1) {
                clearInterval(interval);
                gameTimers.delete(gameId);
                
                if (currentRoom.players.length >= currentRoom.minPlayers) {
                    console.log(`[TIMER] Timer ended, starting game for ${gameId}`);
                    startGameNow(gameId);
                } else {
                    console.log(`[TIMER] Not enough players, resetting timer for ${gameId}`);
                    io.to(gameId).emit('waiting-for-players', {
                        message: `Waiting for ${currentRoom.minPlayers - currentRoom.players.length} more player(s)...`,
                        currentPlayers: currentRoom.players.length,
                        needed: currentRoom.minPlayers
                    });
                    currentRoom.timeLeft = currentRoom.timerSeconds;
                    startGameTimer(gameId);
                }
            } else {
                currentRoom.timeLeft--;
                const mins = Math.floor(currentRoom.timeLeft / 60);
                const secs = currentRoom.timeLeft % 60;
                io.to(gameId).emit('timer-update', {
                    timeLeft: currentRoom.timeLeft,
                    minutes: mins,
                    seconds: secs,
                    display: `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
                });
            }
        }, 1000);
        
        gameTimers.set(gameId, interval);
    }

    // Start game immediately
    function startGameNow(gameId) {
        console.log(`[GAME] startGameNow called for ${gameId}`);
        const room = gameRooms.get(gameId);
        if (!room) return;
        
        room.gameActive = true;
        room.status = 'active';
        
        io.to(gameId).emit('game-started', {
            message: 'Game has started! Good luck everyone!',
            players: room.players.map(p => ({ name: p.playerName }))
        });
    }

    io.on('connection', (socket) => {
        console.log('Player connected:', socket.id);
        
        socket.on('join-game', async (data) => {
            const { gameId, playerName, cards, userId } = data;
            console.log(`[JOIN] ${playerName} joining game ${gameId}`);
            
            if (!gameRooms.has(gameId)) {
                console.log(`[JOIN] Creating new room for ${gameId}`);
                gameRooms.set(gameId, {
                    players: [],
                    calledNumbers: [],
                    gameActive: false,
                    winner: null,
                    status: 'waiting',
                    minPlayers: 2,
                    timerSeconds: 45,
                    timeLeft: 45,
                    createdAt: Date.now()
                });
            }
            
            const room = gameRooms.get(gameId);
            
            const existingPlayer = room.players.find(p => p.socketId === socket.id);
            if (!existingPlayer) {
                room.players.push({
                    socketId: socket.id,
                    playerName: playerName,
                    userId: userId,
                    cards: cards,
                    hasWon: false
                });
                console.log(`[JOIN] Players in room: ${room.players.length}`);
            }
            
            socket.join(gameId);
            
            socket.emit('game-state', {
                calledNumbers: room.calledNumbers,
                players: room.players.map(p => ({ name: p.playerName, hasWon: p.hasWon })),
                gameActive: room.gameActive,
                status: room.status,
                timeLeft: room.timeLeft,
                minPlayers: room.minPlayers
            });
            
            io.to(gameId).emit('players-update', {
                players: room.players.map(p => ({ name: p.playerName, hasWon: p.hasWon, id: p.socketId })),
                count: room.players.length,
                minPlayers: room.minPlayers,
                canStart: room.players.length >= room.minPlayers
            });
            
            console.log(`[JOIN] Checking start condition: players=${room.players.length}, minPlayers=${room.minPlayers}, gameActive=${room.gameActive}, status=${room.status}`);
            
            if (room.players.length >= room.minPlayers && !room.gameActive && room.status !== 'active') {
                console.log(`[JOIN] Starting timer for ${gameId}`);
                startGameTimer(gameId);
            }
        });
        
        socket.on('call-number', (data) => {
            const { gameId, number, letter } = data;
            const room = gameRooms.get(gameId);
            if (!room || !room.gameActive) return;
            room.calledNumbers.push({ number, letter, timestamp: Date.now() });
            io.to(gameId).emit('number-called', {
                number: number,
                letter: letter,
                calledNumbers: room.calledNumbers
            });
        });
        
        socket.on('player-bingo', (data) => {
            const { gameId, playerName, cardId, pattern } = data;
            const room = gameRooms.get(gameId);
            if (!room || !room.gameActive || room.winner) return;
            room.winner = { playerName, cardId, pattern, timestamp: Date.now() };
            room.gameActive = false;
            room.status = 'ended';
            
            if (gameTimers.has(gameId)) {
                clearInterval(gameTimers.get(gameId));
                gameTimers.delete(gameId);
            }
            
            io.to(gameId).emit('game-winner', {
                winner: playerName,
                cardId: cardId,
                pattern: pattern
            });
        });
        
        socket.on('disconnect', () => {
            console.log('Player disconnected:', socket.id);
            for (let [gameId, room] of gameRooms) {
                const playerIndex = room.players.findIndex(p => p.socketId === socket.id);
                if (playerIndex !== -1) {
                    room.players.splice(playerIndex, 1);
                    io.to(gameId).emit('players-update', {
                        players: room.players.map(p => ({ name: p.playerName, hasWon: p.hasWon, id: p.socketId })),
                        count: room.players.length,
                        minPlayers: room.minPlayers,
                        canStart: room.players.length >= room.minPlayers
                    });
                    
                    if (room.players.length === 0) {
                        if (gameTimers.has(gameId)) {
                            clearInterval(gameTimers.get(gameId));
                            gameTimers.delete(gameId);
                        }
                        gameRooms.delete(gameId);
                    }
                    break;
                }
            }
        });
        
        // Admin controls
        socket.on('admin-force-start', (data) => {
            const { gameId } = data;
            const room = gameRooms.get(gameId);
            if (room && !room.gameActive) {
                if (gameTimers.has(gameId)) {
                    clearInterval(gameTimers.get(gameId));
                    gameTimers.delete(gameId);
                }
                startGameNow(gameId);
            }
        });
        
        socket.on('admin-pause-timer', (data) => {
            const { gameId } = data;
            const timer = gameTimers.get(gameId);
            if (timer) {
                clearInterval(timer);
                gameTimers.delete(gameId);
                io.to(gameId).emit('timer-paused', {});
            }
        });
        
        socket.on('admin-resume-timer', (data) => {
            const { gameId } = data;
            const room = gameRooms.get(gameId);
            if (room && !room.gameActive && room.players.length >= room.minPlayers) {
                startGameTimer(gameId);
            }
        });
        
        socket.on('admin-reset-timer', (data) => {
            const { gameId, seconds } = data;
            const room = gameRooms.get(gameId);
            if (room && !room.gameActive) {
                if (gameTimers.has(gameId)) {
                    clearInterval(gameTimers.get(gameId));
                    gameTimers.delete(gameId);
                }
                room.timeLeft = seconds || 45;
                room.timerSeconds = seconds || 45;
                if (room.players.length >= room.minPlayers) {
                    startGameTimer(gameId);
                }
            }
        });
        
        socket.on('admin-set-min-players', (data) => {
            const { gameId, minPlayers } = data;
            const room = gameRooms.get(gameId);
            if (room) {
                room.minPlayers = minPlayers;
                io.to(gameId).emit('min-players-update', { minPlayers: minPlayers });
                if (room.players.length >= minPlayers && !room.gameActive && room.status !== 'active') {
                    startGameTimer(gameId);
                }
            }
        });
    });

    server.listen(PORT, () => {
      console.log(`🚀 Server running at http://localhost:${PORT}`);
      console.log(`📁 Static files served from /public`);
      console.log(`📁 Socket.io enabled for real-time multiplayer`);
    });
    
  } catch (error) {
    console.error('Failed to start server:', error);
  }
};

startServer();