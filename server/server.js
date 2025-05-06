// server/server.js
import express from 'express';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { Game } from './Game.js';

const PORT = process.env.PORT || 3000; // Render will set PORT env variable
const app = express();
const server = http.createServer(app);
const io = new SocketIOServer(server, {
    cors: {
        origin: "*", // Allow all origins for simplicity (restrict in production)
        methods: ["GET", "POST"]
    }
});

// Simple health check endpoint for Render
app.get('/', (req, res) => {
    res.send('Shawty Game Server is running!');
});

const game = new Game(io);
game.startGameLoop(); // Start the game logic

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);
    game.updateOnlinePlayerCount(); // Initial count for new connection

    socket.on('joinGame', ({ name, character }) => {
        console.log(`Player ${name} (ID: ${socket.id}) joining with character ${character}`);
        const player = game.addPlayer(socket, name, character);
        // Player is added, gameJoined event is sent from Game class
    });

    socket.on('playerInput', (inputData) => {
        game.handlePlayerInput(socket.id, inputData);
    });

    socket.on('shoot', (shootData) => {
        game.handleShoot(socket.id, shootData);
    });

    socket.on('chatMessage', (message) => {
        const player = game.players.get(socket.id);
        if (player) {
            // Prevent very long messages
            const sanitizedMessage = message.text.substring(0, 100);
            io.emit('chatMessage', { senderId: socket.id, senderName: player.name, text: sanitizedMessage });
        }
    });
    
    socket.on('requestRespawn', () => { // If client explicitly requests respawn
        const player = game.players.get(socket.id);
        if (player && player.health <=0) {
            game.respawnPlayer(player);
        }
    });


    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        game.removePlayer(socket.id);
    });
});

server.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
    console.log(`Make sure your client connects to this server. If running locally and client on GitHub pages, it might be wss://your-render-app-name.onrender.com`);
});
