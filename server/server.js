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
        origin: ["https://gorp627.github.io", "http://localhost:8080"], // Adjust origin if your GitHub username is different
        // origin: "*", // Less secure, use for debugging origin issues
        methods: ["GET", "POST"]
    }
});

const PORT = process.env.PORT || 3000;
const RESPAWN_DELAY = 4000; // 4 seconds

// --- Game State ---
let players = {}; // { socket.id: { id, x, y, z, rotationY, health, name, phrase } }

// Function to broadcast player count
function broadcastPlayerCount() {
    const count = Object.keys(players).length;
    io.emit('playerCountUpdate', count);
    console.log("Player count updated:", count);
}

// --- Socket.IO Connection Handling ---
io.on('connection', (socket) => {
    console.log('User tentative connection:', socket.id);

    // Don't create player object immediately. Wait for details.
    // Send initial player count right away
    socket.emit('playerCountUpdate', Object.keys(players).length);


    // Listen for player setting their details
    socket.on('setPlayerDetails', (details) => {
        // Basic validation/sanitization (important for security!)
        const name = details.name ? String(details.name).substring(0, 16) : 'Anonymous'; // Max 16 chars
        const phrase = details.phrase ? String(details.phrase).substring(0, 20) : '...'; // Max 20 chars

        // Prevent setting details if already joined fully
        if (players[socket.id]) {
            console.log(`Player ${socket.id} tried to set details again.`);
            // Optionally update details if needed, but might complicate state
             players[socket.id].name = name;
             players[socket.id].phrase = phrase;
             // Maybe re-broadcast playerJoined with updated details? For now, just update.
            return;
        }

        console.log(`Player ${socket.id} joined as "${name}" with phrase "${phrase}"`);

        // Now create the player object
        players[socket.id] = {
            id: socket.id,
            x: Math.random() * 10 - 5,
            y: 0, // Logical Y (feet)
            z: Math.random() * 10 - 5,
            rotationY: 0,
            health: 100,
            name: name,
            phrase: phrase
        };

        // Initialize *this* player (send them all current player data)
        socket.emit('initialize', { id: socket.id, players: players });

        // Notify *other* players about the new player (including name/phrase)
        socket.broadcast.emit('playerJoined', players[socket.id]);

        // Update player count for everyone
        broadcastPlayerCount();
    });


    // --- Standard Event Handlers ---

    socket.on('playerUpdate', (playerData) => {
        const player = players[socket.id];
        if (player) {
            player.x = playerData.x;
            player.y = playerData.y; // Assume client sends logical Y
            player.z = playerData.z;
            player.rotationY = playerData.rotationY;
            // Broadcast including potentially updated logical Y
            socket.broadcast.emit('playerMoved', player);
        }
    });

    socket.on('shoot', (bulletData) => {
        if (!players[socket.id]) return; // Ignore shots from non-existent players
        console.log(`Player ${players[socket.id].name} (${socket.id}) fired.`);
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
        const shooterPlayer = players[shooterId]; // Get shooter info

        // Validate players exist and target is alive
        if (targetPlayer && targetPlayer.health > 0 && shooterPlayer) {
            targetPlayer.health -= damage;
            console.log(`Player ${targetPlayer.name} hit by ${shooterPlayer.name}. Health: ${targetPlayer.health}`);

            if (targetPlayer.health <= 0) {
                targetPlayer.health = 0; // Clamp health
                console.log(`Player ${targetPlayer.name} defeated by ${shooterPlayer.name}`);
                // Include killer name/phrase in the event
                io.emit('playerDied', {
                    targetId: targetId,
                    killerId: shooterId,
                    killerName: shooterPlayer.name,
                    killerPhrase: shooterPlayer.phrase
                 });
                scheduleRespawn(targetId);
            } else {
                io.emit('healthUpdate', { id: targetId, health: targetPlayer.health });
            }
        }
    });

    socket.on('fellIntoVoid', () => {
        const player = players[socket.id];
        if (player && player.health > 0) {
            console.log(`Player ${player.name} (${socket.id}) fell into the void.`);
            player.health = 0;
            // Environment kill - no killer ID, name, or phrase
            io.emit('playerDied', {
                targetId: socket.id,
                killerId: null,
                killerName: null, // Or 'the environment'? Client handles null.
                killerPhrase: null
            });
            scheduleRespawn(socket.id);
        }
    });

    socket.on('disconnect', () => {
        const player = players[socket.id];
        if (player) {
            console.log(`User ${player.name} (${socket.id}) disconnected.`);
            delete players[socket.id];
            io.emit('playerLeft', socket.id);
            broadcastPlayerCount(); // Update count after player leaves
        } else {
            console.log(`User ${socket.id} (unjoined) disconnected.`);
        }
    });
});

// --- Helper Function for Respawns ---
function scheduleRespawn(playerId) {
    setTimeout(() => {
        const player = players[playerId];
        if (player) { // Check if player still exists
            player.health = 100;
            player.x = Math.random() * 10 - 5;
            player.y = 0; // Logical Y
            player.z = Math.random() * 10 - 5;
            player.rotationY = 0;
            console.log(`Player ${player.name} (${playerId}) respawned.`);
            // Send full player data on respawn
            io.emit('playerRespawned', player);
        }
    }, RESPAWN_DELAY);
}

// --- Basic HTTP Server ---
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'), (err) => {
        if (err) { res.send('Server is running.'); }
    });
});

// --- Start Server ---
server.listen(PORT, () => {
    console.log(`Shawty Server listening on *:${PORT}`);
    console.log(`Allowed origins: ${io.opts.cors.origin}`);
});
