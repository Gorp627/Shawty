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
let players = {}; // { socket.id: { id, x, y, z, rotationY, health, name, phrase } }

// --- Helper Functions ---
function broadcastPlayerCount() {
    try { const count = Object.keys(players).length; io.emit('playerCountUpdate', count); }
    catch(e) { console.error("!!! Error in broadcastPlayerCount:", e); }
}
function scheduleRespawn(playerId) { /* ... Same ... */ }


// --- Socket.IO Connection Handling ---
io.on('connection', function(socket) {
    console.log(`User tentative connection: ${socket.id}`);
    socket.emit('playerCountUpdate', Object.keys(players).length);

    // *** ADDED PING ON CONNECT ***
    console.log(`Sending initial ping to ${socket.id}`);
    socket.emit("ping", { message: `Server says hi to ${socket.id}!` });
    // *****************************

    socket.on('setPlayerDetails', function(details) {
        const name = details.name ? String(details.name).substring(0, 16).trim() : 'Anonymous'; const phrase = details.phrase ? String(details.phrase).substring(0, 20).trim() : '...'; const finalName = name === '' ? 'Anonymous' : name; const finalPhrase = phrase === '' ? '...' : phrase;
        if (players[socket.id]) { return; }

        console.log(`Player ${socket.id} fully joined as "${finalName}"`);
        try {
            players[socket.id] = { id: socket.id, x: Math.random()*10-5, y: 0, z: Math.random()*10-5, rotationY: 0, health: 100, name: finalName, phrase: finalPhrase };
            console.log(`--- Player object created for ${socket.id}`);

            const minimalInitData = { id: socket.id, players: { [socket.id]: players[socket.id] } }; // Send only self initially
            console.log(`--- Emitting 'initialize' back to socket ${socket.id} (Minimal Data)`);
            socket.emit('initialize', minimalInitData );

            console.log(`--- Broadcasting 'playerJoined' for ${socket.id}`);
            socket.broadcast.emit('playerJoined', players[socket.id]);

            console.log(`--- Calling broadcastPlayerCount after join`);
            broadcastPlayerCount();
            console.log(`--- setPlayerDetails handler finished for ${socket.id}`);

        } catch (e) { console.error(`!!! CRITICAL ERROR in setPlayerDetails for ${socket.id} after join log:`, e); }
    });

    // --- Other Handlers ---
    socket.on('playerUpdate', function(playerData) { /* ... Same ... */ });
    socket.on('shoot', function(bulletData) { /* ... Same ... */ });
    socket.on('hit', function(data) { /* ... Same (with logs) ... */ });
    socket.on('fellIntoVoid', function() { /* ... Same ... */ });
    socket.on('disconnect', function() { /* ... Same ... */ });
});

// --- Basic HTTP Server ---
app.get('/', function(req, res) { /* ... Same ... */ });
// --- Start Server ---
server.listen(PORT, function() { console.log(`Shawty Server listening on *:${PORT}`); /* ... origin log ... */ });
