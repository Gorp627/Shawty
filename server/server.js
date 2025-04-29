// server/server.js (v7 - Truly Complete with Safe Spawn Points)
const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');

const app = express();
const server = http.createServer(app);

// --- Configuration ---
const CONFIG = {
    PLAYER_DEFAULT_HEALTH: 100,
    PLAYER_RESPAWN_DELAY: 3500, // milliseconds
    SERVER_BROADCAST_INTERVAL: 1000 / 15, // Target ~15 updates per second
    PLAYER_MOVE_THRESHOLD_SQ: 0.0001, // Minimum squared distance moved to trigger update
    MAX_PLAYERS: 20,
    // SPAWN_AREA_X_MAX / Z_MAX are no longer needed if using SAFE_SPAWN_POINTS
    INITIAL_SPAWN_Y_OFFSET: 5.0, // How far ABOVE the safe spawn point Y to actually spawn
};

// *******************************************
// *** Define Safe Spawn Points Array      ***
// *******************************************
// IMPORTANT: Replace these coordinates with actual safe locations
// determined from your map geometry (where the collider exists).
// The Y value should be the actual ground level. INITIAL_SPAWN_Y_OFFSET will be added.
const SAFE_SPAWN_POINTS = [
    { x: 0,   y: 0, z: 0 },    // Example: Center (assuming ground is at Y=0)
    { x: 10,  y: 0, z: 15 },   // Example: Point 1
    { x: -8,  y: 1, z: -12 },  // Example: Point 2 (ground might be at Y=1 here)
    { x: 20,  y: 0, z: -5 },   // Example: Point 3
    // Add more known safe spawn locations on your map collider
];
if (SAFE_SPAWN_POINTS.length === 0) {
    console.warn("[Server Config] SAFE_SPAWN_POINTS array is empty! Spawning will default to 0,0,0.");
    SAFE_SPAWN_POINTS.push({ x: 0, y: 0, z: 0 }); // Add a default fallback
}


// --- Socket.IO Server Setup ---
const allowedOrigins = [
    "https://gorp54.github.io", // Your GitHub Pages URL
    "http://localhost:8080",    // Keep for local testing if needed
];
const io = new Server(server, {
    cors: {
        origin: function (origin, callback) {
             if (!origin || allowedOrigins.indexOf(origin) !== -1) {
                 return callback(null, true); // Allow
             } else {
                 const msg = `CORS policy denial for Origin: ${origin}`;
                 console.warn(msg);
                 return callback(new Error(msg), false); // Deny
             }
        },
        methods: ["GET", "POST"]
    },
    transports: ['websocket', 'polling']
});
const PORT = process.env.PORT || 3000;

// --- Game State ---
let players = {};
let respawnTimeouts = {};

// --- Utility ---
function randomInt(min, max) { // Helper to pick random index
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

// --- Player Class (Server Side) ---
class Player {
    constructor(id, name = 'Player', phrase = '...') {
        this.id = id;
        this.name = String(name).substring(0, 16).trim() || 'Player';
        this.phrase = String(phrase).substring(0, 20).trim() || '...';
        this.respawn();
        this.lastUpdateTime = Date.now();
        this.needsUpdate = true;
        console.log(`[Server] New Player: ${this.name} (ID: ${this.id})`);
    }

    updatePosition(data) {
        if (this.health <= 0) return false;
        if (data == null || isNaN(data.x) || isNaN(data.y) || isNaN(data.z) || isNaN(data.rotationY)) {
            console.warn(`[Server] Invalid pos data from ${this.id} (${this.name}):`, data);
            return false;
        }
        const movedSq = (data.x - this.x) ** 2 + (data.y - this.y) ** 2 + (data.z - this.z) ** 2;
        let rotationDiff = data.rotationY - this.rotationY;
        rotationDiff = Math.atan2(Math.sin(rotationDiff), Math.cos(rotationDiff));
        const rotated = Math.abs(rotationDiff) > 0.01;
        const positionThreshold = CONFIG.PLAYER_MOVE_THRESHOLD_SQ || 1e-4;
        const changed = movedSq > positionThreshold || rotated;
        if (changed) {
            this.x = data.x; this.y = data.y; this.z = data.z;
            this.rotationY = data.rotationY;
            this.lastUpdateTime = Date.now();
            this.needsUpdate = true;
        }
        return changed;
    }

    takeDamage(amount, killerInfo = { id: null, name: 'Unknown', phrase: 'eliminated' }) {
        if (this.health <= 0) return false;
        this.health = Math.max(0, this.health - amount);
        console.log(`[Server] ${this.name} took ${amount} dmg from ${killerInfo.name || '?'}. HP: ${this.health}`);
        this.needsUpdate = true;
        const died = this.health <= 0;
        if (died) {
            console.log(`[Server] ${this.name} eliminated by ${killerInfo.name || 'The Void'}.`);
            io.emit('playerDied', {
                targetId: this.id, targetName: this.name,
                killerId: killerInfo.id, killerName: killerInfo.name,
                killerPhrase: killerInfo.phrase || 'eliminated'
            });
            scheduleRespawn(this.id);
        } else {
             io.emit('healthUpdate', { id: this.id, health: this.health });
        }
        return died;
    }

    // --- MODIFIED RESPAWN ---
    respawn() {
        this.health = CONFIG.PLAYER_DEFAULT_HEALTH;
        const spawnIndex = randomInt(0, SAFE_SPAWN_POINTS.length - 1);
        const spawnPoint = SAFE_SPAWN_POINTS[spawnIndex];

        this.x = spawnPoint.x;
        // Spawn slightly ABOVE the defined safe Y ground level
        this.y = spawnPoint.y + (CONFIG.INITIAL_SPAWN_Y_OFFSET || 5.0);
        this.z = spawnPoint.z;
        this.rotationY = Math.random() * Math.PI * 2; // Random facing direction

        this.needsUpdate = true;
        console.log(`[Server] ${this.name} respawn state set. Picked spawn ${spawnIndex}: (${spawnPoint.x}, ${spawnPoint.y}, ${spawnPoint.z}). Sent Y: ${this.y.toFixed(1)}`);
    }
    // --- END MODIFIED RESPAWN ---

    getNetworkData() {
        return {
            x: parseFloat(this.x.toFixed(3)), y: parseFloat(this.y.toFixed(3)),
            z: parseFloat(this.z.toFixed(3)), r: parseFloat(this.rotationY.toFixed(3)),
            h: this.health
        };
    }
    getFullData() {
        return {
            id: this.id, x: this.x, y: this.y, z: this.z,
            rotationY: this.rotationY, health: this.health,
            name: this.name, phrase: this.phrase
        };
    }
}

function getAllPlayersFullData() {
    let allPlayersData = {};
    for (const id in players) {
        allPlayersData[id] = players[id].getFullData();
    }
    return allPlayersData;
}

function scheduleRespawn(playerId) {
    if (respawnTimeouts[playerId]) {
        clearTimeout(respawnTimeouts[playerId]);
    }
    console.log(`Scheduling respawn ${playerId} in ${CONFIG.PLAYER_RESPAWN_DELAY}ms`);
    respawnTimeouts[playerId] = setTimeout(() => {
        const player = players[playerId];
        if (player) {
            player.respawn();
            io.emit('playerRespawned', player.getFullData());
            console.log(`Player ${player.name} (${playerId}) respawn processed.`);
        } else {
            console.warn(`Player ${playerId} not found for respawn.`);
        }
        delete respawnTimeouts[playerId];
    }, CONFIG.PLAYER_RESPAWN_DELAY || 3500);
}

function broadcastPlayerCount() {
    const count = Object.keys(players).length;
    io.emit('playerCountUpdate', count);
}

// --- Socket.IO Connection Handling ---
io.on('connection', (socket) => {
    console.log(`Client tentative: ${socket.id}`);
    socket.emit('playerCountUpdate', Object.keys(players).length);

    socket.on('setPlayerDetails', (data) => {
        if (Object.keys(players).length >= CONFIG.MAX_PLAYERS) {
            console.warn(`Join denied: Server full. ID: ${socket.id}`);
            socket.emit('serverFull');
            socket.disconnect(true);
            return;
        }
        if (players[socket.id]) {
            console.warn(`Player ${socket.id} details update.`);
             players[socket.id].name = String(data?.name).substring(0, 16).trim() || players[socket.id].name;
             players[socket.id].phrase = String(data?.phrase).substring(0, 20).trim() || players[socket.id].phrase;
             socket.emit('initialize', { id: socket.id, players: getAllPlayersFullData() });
            return;
        }
        const name = data?.name;
        const phrase = data?.phrase;
        players[socket.id] = new Player(socket.id, name, phrase);
        const newPlayer = players[socket.id];
        let allPlayersData = getAllPlayersFullData();
        console.log(`Sending 'initialize' to ${newPlayer.name} (${socket.id})`);
        socket.emit('initialize', { id: socket.id, players: allPlayersData });
        socket.broadcast.emit('playerJoined', newPlayer.getFullData());
        broadcastPlayerCount();
    });

    socket.on('playerUpdate', (data) => {
        const player = players[socket.id];
        if (player) {
            player.updatePosition(data);
        }
    });

     socket.on('fellIntoVoid', () => {
         const player = players[socket.id];
         if (player && player.health > 0) {
             console.log(`${player.name} fell into void.`);
             player.takeDamage(9999, { id: null, name: "The Void", phrase: "consumed" });
         }
     });

     socket.on('playerShot', () => {
          const shooter = players[socket.id];
          if(!shooter || shooter.health <= 0) return;
          console.log(`RX 'playerShot' from ${shooter.name} - Target processing TBD.`);
     });

    socket.on('disconnect', (reason) => {
        const player = players[socket.id];
        if (player) {
            console.log(`Player disconnected: ${player.name} (${socket.id}). R: ${reason}`);
            if (respawnTimeouts[socket.id]) {
                clearTimeout(respawnTimeouts[socket.id]);
                delete respawnTimeouts[socket.id];
                console.log(`Cleared respawn ${socket.id}`);
            }
            delete players[socket.id];
            io.emit('playerLeft', socket.id);
            broadcastPlayerCount();
        } else {
            console.log(`Unid client disconnected: ${socket.id}. R: ${reason}`);
        }
    });

    socket.on('clientPing', (data) => {
        socket.emit('serverPong', data);
    });
}); // End io.on('connection')

// --- Game Loop (Server Side Broadcast) ---
let lastBroadcastTime = 0;
function serverGameLoop() {
    const now = Date.now();
    let stateUpdate = { players: {} };
    let updateGenerated = false;
    for (const id in players) {
        if (players[id].needsUpdate && players[id].health > 0) {
            stateUpdate.players[id] = players[id].getNetworkData();
            players[id].needsUpdate = false;
            updateGenerated = true;
        } else if (players[id].needsUpdate) {
            players[id].needsUpdate = false;
        }
    }
    if (updateGenerated) {
        io.emit('gameStateUpdate', stateUpdate);
        lastBroadcastTime = now;
    }
}
const gameLoopIntervalMs = CONFIG.SERVER_BROADCAST_INTERVAL || 66;
const gameLoopIntervalId = setInterval(serverGameLoop, gameLoopIntervalMs);
console.log(`[Server] Loop interval: ${gameLoopIntervalMs}ms`);

// --- HTTP Server Setup ---
app.get('/', (req, res) => {
    const indexPath = path.join(__dirname, '..', 'docs', 'index.html');
    res.sendFile(indexPath, (err) => {
        if (err) {
            console.error("Err send index:", err);
            if (!res.headersSent) {
                res.status(err.status || 500).send('Error.');
            }
        }
    });
});
const staticPath = path.join(__dirname, '..', 'docs');
app.use(express.static(staticPath));
console.log(`[Server] Static path: ${staticPath}`);

// --- Start Server Listening ---
server.listen(PORT, () => {
    console.log(`[Server] Listening on *:${PORT}`);
    console.log(`[Server] Origins: ${allowedOrigins.join(', ')}`);
});

// --- Graceful Shutdown Handling ---
function gracefulShutdown(signal) {
    console.log(`Received ${signal}. Shutting down...`);
    clearInterval(gameLoopIntervalId);
    console.log('Loop stopped.');
    Object.values(respawnTimeouts).forEach(clearTimeout);
    console.log('Respawn timers cleared.');
    io.close(() => {
        console.log('Socket.IO closed.');
        server.close(() => {
            console.log('HTTP closed.');
            process.exit(0);
        });
    });
    setTimeout(() => {
        console.error('Timeout. Forcing exit.');
        process.exit(1);
    }, 5000);
}
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
console.log("[Server] Script loaded.");
