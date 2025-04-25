// server/server.js - Step 2 Build
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
let players = {}; // { socket.id: { id, x, y, z, rotationY, health, name, phrase } } // Includes name, phrase

// Function to broadcast player count
function broadcastPlayerCount() {
    const count = Object.keys(players).length; io.emit('playerCountUpdate', count);
    // console.log("Player count updated:", count); // Reduce noise
}

// --- Socket.IO Connection Handling ---
io.on('connection', function(socket) { // Using function() syntax
    console.log(`User tentative connection: ${socket.id}`);
    socket.emit('playerCountUpdate', Object.keys(players).length); // Send initial count

    // Listen for player setting their details (ADDED BACK)
    socket.on('setPlayerDetails', function(details) { // Using function() syntax
        const name = details.name ? String(details.name).substring(0, 16).trim() : 'Anonymous';
        const phrase = details.phrase ? String(details.phrase).substring(0, 20).trim() : '...';
        const finalName = name === '' ? 'Anonymous' : name;
        const finalPhrase = phrase === '' ? '...' : phrase;
        if (players[socket.id]) { console.log(`Player ${socket.id} resent details.`); players[socket.id].name=finalName; players[socket.id].phrase=finalPhrase; return; } // Update if already exists?

        console.log(`Player ${socket.id} fully joined as "${finalName}"`);
        players[socket.id] = { // Create player state HERE
            id: socket.id, x: Math.random()*10-5, y: 0, z: Math.random()*10-5, rotationY: 0,
            health: 100, name: finalName, phrase: finalPhrase // Store name/phrase
        };
        socket.emit('initialize', { id: socket.id, players: players }); // Init this player
        socket.broadcast.emit('playerJoined', players[socket.id]); // Tell others
        broadcastPlayerCount(); // Update count
    });

    // --- Event Handlers ---
    socket.on('playerUpdate', function(playerData) { const p = players[socket.id]; if (p) { p.x=playerData.x;p.y=playerData.y;p.z=playerData.z;p.rotationY=playerData.rotationY; socket.broadcast.emit('playerMoved', p); } });
    socket.on('shoot', function(bulletData) { if (!players[socket.id]) return; io.emit('shotFired', { shooterId: socket.id, position: bulletData.position, direction: bulletData.direction, bulletId: socket.id+"_"+Date.now() }); });
    socket.on('hit', function(data) { // ADD BACK name/phrase to death event
        const { targetId, damage } = data; const shooterId = socket.id;
        const targetP = players[targetId]; const shooterP = players[shooterId];
        if (targetP && targetP.health > 0 && shooterP) {
            targetP.health -= damage;
            if (targetP.health <= 0) { targetP.health = 0; console.log(`${targetP.name} defeated by ${shooterP.name}`); io.emit('playerDied', { targetId: targetId, killerId: shooterId, killerName: shooterP.name, killerPhrase: shooterP.phrase }); scheduleRespawn(targetId); } // Send name/phrase
            else { io.emit('healthUpdate', { id: targetId, health: targetP.health }); }
        }
    });
    socket.on('fellIntoVoid', function() { // Send null killer details
        const p = players[socket.id]; if (p && p.health > 0) { p.health = 0; console.log(`${p.name} fell`); io.emit('playerDied', { targetId: socket.id, killerId: null, killerName: null, killerPhrase: null }); scheduleRespawn(socket.id); }
    });
    socket.on('disconnect', function() { // Handles players who joined or not
        const p = players[socket.id]; if (p) { console.log(`User ${p.name} disconnected.`); delete players[socket.id]; io.emit('playerLeft', socket.id); broadcastPlayerCount(); }
        else { console.log(`User ${socket.id} (unjoined) disconnected.`); }
    });
});

// --- Helper Function for Respawns ---
function scheduleRespawn(playerId) { setTimeout(function() { const p = players[playerId]; if (p) { p.health = 100; p.x = Math.random() * 10 - 5; p.y = 0; p.z = Math.random() * 10 - 5; p.rotationY = 0; console.log(`${p.name} respawned.`); io.emit('playerRespawned', p); } }, RESPAWN_DELAY); } // Send full player data including name/phrase
// --- Basic HTTP Server ---
app.get('/', function(req, res) { const p = path.join(__dirname, 'index.html'); res.sendFile(p, function(err) { if (err) res.status(200).send('Shawty Server Running.'); }); });
// --- Start Server ---
server.listen(PORT, function() { console.log(`Shawty Server listening on *:${PORT}`); });
