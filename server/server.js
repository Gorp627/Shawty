// server/server.js
const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');
const Game = require('./game');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*", // Allow connections from anywhere (adjust for production)
        methods: ["GET", "POST"]
    }
});

const PORT = process.env.PORT || 3000; // Use Render's port or 3000 locally
const game = new Game();

// Serve static files from the 'docs' directory
// This assumes your Render service is set up to serve static files from 'docs'
// or you point your web service root to 'docs'
app.use(express.static(path.join(__dirname, '../docs')));

// Serve index.html for the root path
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../docs/index.html'));
});


io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    // Handle player joining
    socket.on('joinGame', (data) => {
        const playerName = data.name || `Shawty_${socket.id.substring(0, 4)}`;
        const player = game.addPlayer(socket.id, playerName);

        // Send the new player their ID and the current game state
        socket.emit('assignId', socket.id);
        socket.emit('currentState', game.getGameState());

        // Notify other players about the new player
        socket.broadcast.emit('playerJoined', game.getPlayer(socket.id)); // Send new player's full initial data
    });

    // Handle player state updates
    socket.on('playerUpdate', (data) => {
        // Basic validation could happen here
        game.updatePlayerState(socket.id, data);
        // Broadcast the updated state of this player to others
        // Optimization: Send updates less frequently or only if changed significantly
        socket.broadcast.emit('playerMoved', { id: socket.id, position: data.position, rotation: data.rotation });
    });

    // Handle shooting
    socket.on('shoot', (data) => { // data might include direction if needed for server-side hit detection
        const result = game.handleShoot(socket.id);
        if (result) {
            // Broadcast to all clients that a shot occurred
            io.emit('playerShot', { shooterId: result.shooterId /*, optional hit data */ });
             // Handle propulsion shot (E key pressed)
            if (data.propulsion) {
                 const player = game.getPlayer(socket.id);
                 if (player) {
                     // Send a specific event for propulsion
                     socket.emit('applyPropulsion', { direction: data.direction }); // Client calculates opposite locally
                 }
            }

            // TODO: Server-side hit detection would go here
            // If hit detected: game.handleHit(shooterId, targetId);
            // io.emit('playerHit', { targetId: '...', damage: '...' });
        }
    });

     // Handle player falling off map / dying
    socket.on('playerDied', (data) => {
        const deathInfo = game.handleDeath(socket.id, data.position);
        if (deathInfo) {
            // Broadcast death and shockwave info
            io.emit('playerDied', deathInfo);

            // Handle respawn after a delay
            setTimeout(() => {
                const player = game.getPlayer(socket.id);
                if (player) { // Check if player still connected
                    const spawnPoint = game.getSpawnPoint();
                    player.respawn(spawnPoint);
                    // Notify the player they have respawned
                    socket.emit('respawn', { position: spawnPoint });
                    // Notify others the player has respawned (optional, or handled via state update)
                    io.emit('playerRespawned', { id: socket.id, position: spawnPoint, health: player.health });
                }
            }, 3000); // 3 second respawn delay
        }
    });


    // Handle disconnection
    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        game.removePlayer(socket.id);
        // Notify other players
        io.emit('playerLeft', socket.id);
    });
});

// Update loop for server-side logic (e.g., physics, game rules)
// Simple example: broadcast state periodically (can be inefficient)
// setInterval(() => {
//     io.emit('updateState', game.getGameState());
// }, 1000 / 20); // Send updates 20 times per second

server.listen(PORT, () => {
    console.log(`Server listening on *:${PORT}`);
});
