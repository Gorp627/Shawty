// server/server.js
const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');

const app = express();
const server = http.createServer(app);

// --- Configuration ---
const io = new Server(server, {
    cors: {
        origin: ["https://gorp627.github.io", "http://localhost:8080"],
        methods: ["GET", "POST"]
    }
});

const PORT = process.env.PORT || 3000;
const RESPAWN_DELAY = 4000;

// --- Game State ---
let players = {}; // { socket.id: { id, x, y, z, rotationY, health, name, phrase } }

// Function to broadcast player count
function broadcastPlayerCount() { /* ... Same ... */ }

// --- Socket.IO Connection Handling ---
io.on('connection', function(socket) {
    console.log(`User tentative connection: ${socket.id}`);
    socket.emit('playerCountUpdate', Object.keys(players).length);

    // Listen for player setting their details
    socket.on('setPlayerDetails', function(details) { /* ... Same as Response #49 ... */ });

    // --- Event Handlers ---
    socket.on('playerUpdate', function(playerData) { /* ... Same ... */ });
    socket.on('shoot', function(bulletData) { /* ... Same ... */ });

    socket.on('hit', function(data) { // <<< ADDED LOGGING
        console.log(">>> Received 'hit' event:", data); // Log received data
        const { targetId, damage } = data;
        const shooterId = socket.id;
        const targetPlayer = players[targetId];
        const shooterPlayer = players[shooterId];

        if (targetPlayer && targetPlayer.health > 0 && shooterPlayer) {
            const oldHealth = targetPlayer.health; // Store old health
            targetPlayer.health -= damage;
            console.log(`Player ${targetPlayer.name} (${targetId}) health ${oldHealth} -> ${targetPlayer.health} (Hit by ${shooterPlayer.name} (${shooterId}))`); // Detailed log

            if (targetPlayer.health <= 0) {
                targetPlayer.health = 0;
                console.log(`--- Emitting 'playerDied' for ${targetId}`);
                io.emit('playerDied', {
                    targetId: targetId, killerId: shooterId,
                    killerName: shooterPlayer.name, killerPhrase: shooterPlayer.phrase
                 });
                scheduleRespawn(targetId);
            } else {
                console.log(`--- Emitting 'healthUpdate' for ${targetId}`);
                io.emit('healthUpdate', { id: targetId, health: targetPlayer.health });
            }
        } else {
             console.warn(`Hit ignored: TargetExists=${!!targetPlayer}, TargetAlive=${targetPlayer?.health > 0}, ShooterExists=${!!shooterPlayer}`);
        }
    });

    socket.on('fellIntoVoid', function() { /* ... Same ... */ });
    socket.on('disconnect', function() { /* ... Same ... */ });
});

// --- Helper Function for Respawns ---
function scheduleRespawn(playerId) { /* ... Same ... */ }
// --- Basic HTTP Server ---
app.get('/', function(req, res) { /* ... Same ... */ });
// --- Start Server ---
server.listen(PORT, function() { console.log(`Shawty Server listening on *:${PORT}`); /* ... logging origin ... */ });
