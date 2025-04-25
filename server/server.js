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
        origin: ["https://gorp627.github.io", "http://localhost:8080"], // USER'S GitHub Pages URL + localhost
        // origin: "*", // Less secure, use for debugging origin issues
        methods: ["GET", "POST"]
    }
});

const PORT = process.env.PORT || 3000;
const RESPAWN_DELAY = 4000; // milliseconds

// --- Game State ---
let players = {}; // { socket.id: { id, x, y, z, rotationY, health, name, phrase } }

// Function to broadcast player count
function broadcastPlayerCount() {
    const count = Object.keys(players).length;
    io.emit('playerCountUpdate', count); // Send to all connections
    console.log("Player count updated:", count);
}

// --- Socket.IO Connection Handling ---
io.on('connection', (socket) => {
    console.log(`User tentative connection: ${socket.id}`);

    // Send initial player count
    socket.emit('playerCountUpdate', Object.keys(players).length);

    // Listen for player setting their details
    socket.on('setPlayerDetails', (details) => {
        // Validate and sanitize input
        const name = details.name ? String(details.name).substring(0, 16).trim() : 'Anonymous';
        const phrase = details.phrase ? String(details.phrase).substring(0, 20).trim() : '...';
        const finalName = name === '' ? 'Anonymous' : name;
        const finalPhrase = phrase === '' ? '...' : phrase;

        if (players[socket.id]) {
            console.log(`Player ${socket.id} (${players[socket.id].name}) tried to set details again.`);
            // Optionally update details if needed
            players[socket.id].name = finalName;
            players[socket.id].phrase = finalPhrase;
            // Consider broadcasting an update if name/phrase changes are allowed mid-game
            return;
        }

        console.log(`Player ${socket.id} fully joined as "${finalName}" with phrase "${finalPhrase}"`);

        // Create player object in state
        players[socket.id] = {
            id: socket.id,
            x: Math.random() * 15 - 7.5, // Slightly larger spawn area X
            y: 0,                       // Logical Y (feet on ground)
            z: Math.random() * 15 - 7.5, // Slightly larger spawn area Z
            rotationY: 0,
            health: 100,
            name: finalName,
            phrase: finalPhrase
        };

        // Initialize the new player (sends all current player data)
        socket.emit('initialize', { id: socket.id, players: players });

        // Notify other players about the new player (including name/phrase)
        socket.broadcast.emit('playerJoined', players[socket.id]);

        // Broadcast updated player count to everyone
        broadcastPlayerCount();
    });


    // --- Standard Event Handlers ---
    socket.on('playerUpdate', (playerData) => {
        const player = players[socket.id];
        if (player) {
            player.x = playerData.x;
            player.y = playerData.y; // Store logical Y from client
            player.z = playerData.z;
            player.rotationY = playerData.rotationY;
            // Broadcast including name/phrase for potential UI updates elsewhere
            socket.broadcast.emit('playerMoved', player);
        }
    });

    socket.on('shoot', (bulletData) => {
        if (!players[socket.id]) return; // Ignore if player hasn't set details
        // console.log(`Player ${players[socket.id].name} (${socket.id}) fired.`); // Reduce log noise
        io.emit('shotFired', {
            shooterId: socket.id,
            position: bulletData.position,
            direction: bulletData.direction,
            bulletId: socket.id + "_" + Date.now()
        });
    });

    socket.on('hit', (data) => {
        const { targetId, damage } = data;
        const shooterId = socket.id;
        const targetPlayer = players[targetId];
        const shooterPlayer = players[shooterId]; // Get shooter for name/phrase

        // Validate players and target health
        if (targetPlayer && targetPlayer.health > 0 && shooterPlayer) {
            targetPlayer.health -= damage;
            console.log(`Player ${targetPlayer.name} hit by ${shooterPlayer.name}. Health: ${targetPlayer.health}`);

            if (targetPlayer.health <= 0) {
                targetPlayer.health = 0; // Clamp
                console.log(`Player ${targetPlayer.name} defeated by ${shooterPlayer.name}`);
                // Send killer details with the death event
                io.emit('playerDied', {
                    targetId: targetId,
                    killerId: shooterId,
                    killerName: shooterPlayer.name,
                    killerPhrase: shooterPlayer.phrase
                 });
                scheduleRespawn(targetId);
            } else {
                // Send only health update if not dead
                io.emit('healthUpdate', { id: targetId, health: targetPlayer.health });
            }
        }
    });

    socket.on('fellIntoVoid', () => {
        const player = players[socket.id];
        if (player && player.health > 0) {
            console.log(`Player ${player.name} (${socket.id}) fell into the void.`);
            player.health = 0;
            // Send death event with no killer details
            io.emit('playerDied', {
                targetId: socket.id,
                killerId: null,
                killerName: null,
                killerPhrase: null
            });
            scheduleRespawn(socket.id);
        }
    });

    socket.on('disconnect', () => {
        const player = players[socket.id];
        if (player) {
            // If player was fully joined (in players object)
            console.log(`User ${player.name} (${socket.id}) disconnected.`);
            delete players[socket.id]; // Remove from state
            io.emit('playerLeft', socket.id); // Notify others
            broadcastPlayerCount(); // Update count
        } else {
            // If player disconnected before setting details
            console.log(`User ${socket.id} (unjoined) disconnected.`);
            // No need to update count or notify others
        }
    });
});

// --- Helper Function for Respawns ---
function scheduleRespawn(playerId) {
    setTimeout(() => {
        const player = players[playerId];
        if (player) { // Check if player still exists (didn't disconnect during delay)
            player.health = 100;
            player.x = Math.random() * 15 - 7.5; // Respawn in spawn area
            player.y = 0; // Logical Y
            player.z = Math.random() * 15 - 7.5;
            player.rotationY = 0;
            console.log(`Player ${player.name} (${playerId}) respawned.`);
            // Send full player data on respawn, including name/phrase
            io.emit('playerRespawned', player);
        }
    }, RESPAWN_DELAY);
}

// --- Basic HTTP Server for Root Path ---
// Serve an optional status page or info file
app.get('/', (req, res) => {
    const indexPath = path.join(__dirname, 'index.html'); // Optional file in server dir
    res.sendFile(indexPath, (err) => {
        if (err) {
            // If index.html doesn't exist in server dir, send simple text
            res.status(200).send('Shawty Server is Running. Connect via WebSocket.');
        }
    });
});

// --- Start Server ---
server.listen(PORT, () => {
    console.log(`Shawty Server listening on *:${PORT}`);
    // Ensure correct origin is logged if using specific origins
    if (Array.isArray(io.opts.cors.origin)) {
        console.log(`Allowed origins: ${io.opts.cors.origin.join(', ')}`);
    } else {
        console.log(`Allowed origins: ${io.opts.cors.origin}`);
    }
});
