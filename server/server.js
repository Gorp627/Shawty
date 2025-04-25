// server/server.js
const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');

const app = express();
const server = http.createServer(app);

// --- Configuration ---
const io = new Server(server, {
    cors: { origin: ["https://gorp627.github.io", "http://localhost:8080"], methods: ["GET", "POST"] }
});
const PORT = process.env.PORT || 3000;
const RESPAWN_DELAY = 4000;

// --- Game State ---
let players = {};

// --- Helper Functions ---
function broadcastPlayerCount() { /* ... Same ... */ }
function scheduleRespawn(playerId) { /* ... Same ... */ }


// --- Socket.IO Connection Handling ---
io.on('connection', function(socket) {
    console.log(`User tentative connection: ${socket.id}`);
    socket.emit('playerCountUpdate', Object.keys(players).length);
    socket.emit("ping", { message: `Server says hi to ${socket.id}!` }); // Keep ping

    socket.on('setPlayerDetails', function(details) { /* ... Same join logic ... */ });
    socket.on('playerUpdate', function(playerData) { /* ... Same ... */ });
    socket.on('shoot', function(bulletData) { /* ... Same ... */ });
    socket.on('hit', function(data) { /* ... Same (with logs) ... */ });
    socket.on('fellIntoVoid', function() { /* ... Same ... */ });

    // --- REFINED DISCONNECT HANDLER ---
    socket.on('disconnect', function(reason) {
        console.log(`Disconnect event for ${socket.id}. Reason: ${reason}`);
        const player = players[socket.id]; // Find player data using the socket ID
        if (player) {
            // If player data exists, they fully joined
            console.log(`Player ${player.name} (${socket.id}) disconnected.`);
            delete players[socket.id]; // Remove from state
            io.emit('playerLeft', socket.id); // Notify others
            broadcastPlayerCount(); // Update count
        } else {
            // If no player data, they likely disconnected before sending details
            console.log(`User ${socket.id} (never fully joined) disconnected.`);
            // No need to broadcast playerLeft or update count
        }
    });
    // -----------------------------------
});

// --- Basic HTTP Server ---
app.get('/', function(req, res) { /* ... Same ... */ });
// --- Start Server ---
server.listen(PORT, function() { /* ... Same ... */ });
