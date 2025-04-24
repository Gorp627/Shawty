// server/server.js
const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path'); // Needed for serving the optional index.html

const app = express();
const server = http.createServer(app);

// --- Configuration ---
const io = new Server(server, {
    cors: {
        // Allow connections only from your GitHub Pages domain and potentially localhost for testing
        // Replace 'gorp627.github.io' with your actual GitHub username if different
        origin: ["https://gorp627.github.io", "http://localhost:8080"], // Example: Allow deployed site and common local test port
        // origin: "*", // Use this for initial testing if origin issues persist, but less secure
        methods: ["GET", "POST"]
    }
});

const PORT = process.env.PORT || 3000; // Use port from environment (Render) or 3000

// --- Game State ---
let players = {}; // { socket.id: { id, x, y, z, rotationY, health } }
const RESPAWN_DELAY = 3000; // milliseconds (3 seconds)

// --- Socket.IO Connection Handling ---
io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    // 1. Create Player Object on Connect
    players[socket.id] = {
        id: socket.id,
        x: Math.random() * 10 - 5, // Random position X
        y: 0, // Start at logical Y=0 (feet on ground)
        z: Math.random() * 10 - 5, // Random position Z
        rotationY: 0,
        health: 100
    };

    // 2. Initialize New Player
    // Send the new player their ID and the current state of all players
    socket.emit('initialize', { id: socket.id, players: players });

    // 3. Notify Others of New Player
    // Send the new player's data to all other connected clients
    socket.broadcast.emit('playerJoined', players[socket.id]);

    // 4. Handle Player Updates (Movement/Rotation)
    socket.on('playerUpdate', (playerData) => {
        const player = players[socket.id];
        if (player) {
            // Update server state with data received from client
            player.x = playerData.x;
            player.y = playerData.y; // Store logical Y (feet level)
            player.z = playerData.z;
            player.rotationY = playerData.rotationY;
            // Broadcast the updated data (containing logical Y) to other players
            socket.broadcast.emit('playerMoved', player);
        }
    });

    // 5. Handle Shooting
    socket.on('shoot', (bulletData) => {
        // Basic validation could happen here (e.g., rate limiting)
        console.log(`Player ${socket.id} fired a shot.`);
        // Relay shot info to all clients (including shooter for consistency if needed)
        io.emit('shotFired', {
            shooterId: socket.id,
            position: bulletData.position,
            direction: bulletData.direction,
            bulletId: socket.id + "_" + Date.now() // Simple unique-ish bullet ID
        });
    });

    // 6. Handle Hit Reports (Client-Authoritative - Insecure!)
    socket.on('hit', (data) => {
        const { targetId, damage } = data;
        const shooterId = socket.id;

        const targetPlayer = players[targetId];
        // Check if target exists and hasn't already been processed as dead in this tick
        if (targetPlayer && targetPlayer.health > 0) {
            targetPlayer.health -= damage;
            console.log(`Player ${targetId} hit by ${shooterId}. Health: ${targetPlayer.health}`);

            if (targetPlayer.health <= 0) {
                console.log(`Player ${targetId} defeated by ${shooterId}`);
                targetPlayer.health = 0; // Ensure health doesn't go negative
                io.emit('playerDied', { targetId: targetId, killerId: shooterId });
                // Schedule respawn
                scheduleRespawn(targetId);
            } else {
                // Broadcast just the health update
                io.emit('healthUpdate', { id: targetId, health: targetPlayer.health });
            }
        }
    });

    // 7. Handle Falling Into Void
    socket.on('fellIntoVoid', () => {
        const player = players[socket.id];
        if (player && player.health > 0) { // Check if player exists and isn't already dead
            console.log(`Player ${socket.id} fell into the void.`);
            player.health = 0; // Mark as dead
            io.emit('playerDied', { targetId: socket.id, killerId: null }); // No killer
            // Schedule respawn
            scheduleRespawn(socket.id);
        }
    });

    // 8. Handle Disconnections
    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        if (players[socket.id]) {
            delete players[socket.id];
            // Broadcast that the player left
            io.emit('playerLeft', socket.id);
        }
    });
});

// --- Helper Function for Respawns ---
function scheduleRespawn(playerId) {
    // Use setTimeout to delay the respawn action
    setTimeout(() => {
        const player = players[playerId];
        // Check if the player still exists (they might disconnect before respawning)
        if (player) {
            player.health = 100;
            player.x = Math.random() * 10 - 5;
            player.y = 0; // Respawn at logical Y=0
            player.z = Math.random() * 10 - 5;
            player.rotationY = 0;
            console.log(`Player ${playerId} respawned.`);
            // Notify everyone about the respawn (sends the updated player data)
            io.emit('playerRespawned', player);
        } else {
            console.log(`Player ${playerId} disconnected before respawn could occur.`);
        }
    }, RESPAWN_DELAY); // Use the defined delay
}


// --- Basic HTTP Server for Status Check ---
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'), (err) => {
        if (err) {
            res.send('Server is running. Connect via WebSocket.');
        }
    });
});

// --- Start Server ---
server.listen(PORT, () => {
    console.log(`Server listening on *:${PORT}`);
    console.log(`Allowing connections from specified origins.`);
});
