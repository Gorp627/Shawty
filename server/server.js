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
let players = {}; // { socket.id: { id, x, y, z, rotationY, health, name, phrase } } // Includes name, phrase

// Function to broadcast player count
function broadcastPlayerCount() {
    const count = Object.keys(players).length;
    io.emit('playerCountUpdate', count); // Send to all connections
    // console.log("Player count updated:", count); // Reduce noise
}

// --- Helper Function for Respawns ---
function scheduleRespawn(playerId) {
    setTimeout(function() {
        const player = players[playerId];
        if (player) { // Check if player still exists (didn't disconnect during delay)
            player.health = 100;
            player.x = Math.random() * 10 - 5; // Respawn in spawn area
            player.y = 0; // Logical Y
            player.z = Math.random() * 10 - 5;
            player.rotationY = 0;
            console.log(`${player.name} (${playerId}) respawned.`);
            // Notify everyone about the respawn (sends the updated player data)
            io.emit('playerRespawned', player); // Send full player data including name/phrase
        } else {
             console.log(`Player ${playerId} disconnected before respawn could occur.`);
        }
    }, RESPAWN_DELAY); // Use the defined delay
}


// --- Socket.IO Connection Handling ---
io.on('connection', function(socket) { // Using function() syntax
    console.log(`User tentative connection: ${socket.id}`);
    socket.emit('playerCountUpdate', Object.keys(players).length); // Send initial count

    // Listen for player setting their details
    socket.on('setPlayerDetails', function(details) { // Using function() syntax
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
            return; // Don't re-initialize if they already exist
        }

        console.log(`Player ${socket.id} fully joined as "${finalName}"`);

        // Create player object in state
        players[socket.id] = {
            id: socket.id,
            x: Math.random()*10-5, // Random position X
            y: 0,                  // Logical Y (feet on ground)
            z: Math.random()*10-5, // Random position Z
            rotationY: 0,
            health: 100,
            name: finalName,       // Store name
            phrase: finalPhrase    // Store phrase
        };

        // *** ADD LOG BEFORE EMIT ***
        console.log(`--- Emitting 'initialize' back to socket ${socket.id}`);
        // **************************
        socket.emit('initialize', { id: socket.id, players: players }); // Init this player (sends all player data)

        // Notify *other* players about the new player
        socket.broadcast.emit('playerJoined', players[socket.id]); // Send *this* player's data to others

        // Broadcast updated player count to everyone
        broadcastPlayerCount();
    });


    // --- Standard Event Handlers ---
    socket.on('playerUpdate', function(playerData) {
        const p = players[socket.id];
        if (p) {
            p.x=playerData.x; p.y=playerData.y; p.z=playerData.z; p.rotationY=playerData.rotationY;
            socket.broadcast.emit('playerMoved', p);
        }
    });

    socket.on('shoot', function(bulletData) {
        if (!players[socket.id]) return; // Ignore if player hasn't fully joined
        io.emit('shotFired', {
            shooterId: socket.id, position: bulletData.position,
            direction: bulletData.direction, bulletId: socket.id+"_"+Date.now()
        });
    });

    socket.on('hit', function(data) { // With Damage Logs
        console.log(">>> Received 'hit' event:", data);
        const { targetId, damage } = data; const shooterId = socket.id;
        const targetP = players[targetId]; const shooterP = players[shooterId];
        if (targetP && targetP.health > 0 && shooterP) {
            const oldHealth = targetP.health; targetP.health -= damage;
            console.log(`Player ${targetP.name}(${targetId}) HP ${oldHealth} -> ${targetP.health} (Hit by ${shooterP.name}(${shooterId}))`);
            if (targetP.health <= 0) {
                targetP.health = 0; console.log(`${targetP.name} defeated by ${shooterP.name}`);
                console.log(`--- Emitting 'playerDied' for ${targetId}`);
                io.emit('playerDied', { targetId: targetId, killerId: shooterId, killerName: shooterP.name, killerPhrase: shooterP.phrase });
                scheduleRespawn(targetId);
            } else {
                console.log(`--- Emitting 'healthUpdate' for ${targetId}`);
                io.emit('healthUpdate', { id: targetId, health: targetP.health });
            }
        } else {
            console.warn(`Hit ignored: TargetExists=${!!targetP}, TargetAlive=${targetP?.health > 0}, ShooterExists=${!!shooterP}`);
        }
    });

    socket.on('fellIntoVoid', function() { // Send null killer details
        const p = players[socket.id];
        if (p && p.health > 0) {
            console.log(`${p.name} fell`); p.health = 0;
            io.emit('playerDied', { targetId: socket.id, killerId: null, killerName: null, killerPhrase: null });
            scheduleRespawn(socket.id);
        }
    });

    socket.on('disconnect', function() { // Handles players who joined or not
        const p = players[socket.id];
        if (p) { console.log(`User ${p.name} disconnected.`); delete players[socket.id]; io.emit('playerLeft', socket.id); broadcastPlayerCount(); }
        else { console.log(`User ${socket.id} (unjoined) disconnected.`); }
    });
});

// --- Basic HTTP Server ---
app.get('/', function(req, res) {
    const p = path.join(__dirname, 'index.html'); // Optional status page in server dir
    res.sendFile(p, function(err) {
        if (err) res.status(200).send('Shawty Server Running.');
    });
});
// --- Start Server ---
server.listen(PORT, function() {
    console.log(`Shawty Server listening on *:${PORT}`);
    if (Array.isArray(io.opts.cors.origin)) console.log(`Allowed origins: ${io.opts.cors.origin.join(', ')}`);
    else console.log(`Allowed origins: ${io.opts.cors.origin}`);
});
