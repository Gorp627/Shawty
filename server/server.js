// --- START OF FULL server.js FILE ---
// server/server.js (Add Custom Spawns - Full File v5)
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
    SERVER_BROADCAST_INTERVAL: 1000 / 15, // Target ~15 updates per second (~66ms)
    PLAYER_MOVE_THRESHOLD_SQ: 0.0001, // Minimum squared distance moved to trigger update in broadcast
    MAX_PLAYERS: 20,
    // SPAWN_Y: 2.0, // Y level defined in spawn points now
};

// ***** DEFINE SPAWN POINTS HERE *****
// Add as many {x, y, z} points as you want within your map's playable area
// Make sure the 'y' value is slightly above the ground at that x,z coordinate in your map.
const SPAWN_POINTS = [
    { x: 0, y: 5, z: 0 },    // Example: Center
    { x: 10, y: 5, z: 15 },   // Example: Corner 1
    { x: -15, y: 5, z: -10 }, // Example: Corner 2
    { x: 20, y: 5, z: -20 }, // Example: Corner 3
    // Add more points based on your map layout!
];
if (SPAWN_POINTS.length === 0) {
    console.error("!!! FATAL ERROR: No spawn points defined in SPAWN_POINTS array in server.js!");
    process.exit(1); // Exit if no spawns are defined
}
// *********************************

// --- Socket.IO Server Setup ---
const allowedOrigins = [
    "https://gorp54.github.io", // Your specific GitHub Pages URL
    "http://localhost:8080",    // For local testing via http-server or similar
    "http://127.0.0.1:8080",   // Another common local testing address
];
const io = new Server(server, {
    cors: {
        origin: function (origin, callback) {
             if (!origin || allowedOrigins.includes(origin)) {
                 callback(null, true);
             } else {
                 const msg = `CORS policy denial for Origin: ${origin}`;
                 console.warn(msg);
                 callback(new Error(msg), false);
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
let nextSpawnIndex = 0; // Keep track for cycling through spawns

// --- Player Class (Server Side) ---
class Player {
    constructor(id, name = 'Player', phrase = '...') {
        this.id = id;
        this.name = String(name || 'Player').replace(/[^a-zA-Z0-9_\- ]/g, '').substring(0, 16).trim() || 'Player';
        this.phrase = String(phrase || '...').replace(/[<>]/g, '').substring(0, 20).trim() || '...';
        this.respawn();
        this.lastUpdateTime = Date.now();
        this.needsUpdate = true;
        console.log(`[Server] New Player created: ${this.name} (ID: ${this.id})`);
    }

    updatePosition(data) {
        if (this.health <= 0) return false;
        if (data == null || typeof data.x !== 'number' || typeof data.y !== 'number' || typeof data.z !== 'number' || typeof data.rotationY !== 'number' ||
            !isFinite(data.x) || !isFinite(data.y) || !isFinite(data.z) || !isFinite(data.rotationY)) {
            console.warn(`[Server] Invalid position data received from ${this.id}:`, data);
            return false;
        }
        const movedSq = (data.x - this.x) ** 2 + (data.y - this.y) ** 2 + (data.z - this.z) ** 2;
        const rotated = Math.abs(data.rotationY - this.rotationY) > 0.01;
        const positionThreshold = CONFIG.PLAYER_MOVE_THRESHOLD_SQ;
        const changed = movedSq > positionThreshold || rotated;
        if (changed) {
            this.x = data.x; this.y = data.y; this.z = data.z; this.rotationY = data.rotationY;
            this.lastUpdateTime = Date.now(); this.needsUpdate = true;
        }
        return changed;
    }

    takeDamage(amount, killerInfo = { id: null, name: 'Unknown', phrase: 'eliminated' }) {
        if (this.health <= 0) return false;
        const damageAmount = Math.max(0, Number(amount) || 0);
        this.health = Math.max(0, this.health - damageAmount);
        console.log(`[Server] ${this.name} took ${damageAmount} damage from ${killerInfo.name || '?'}. Health: ${this.health}`);
        this.needsUpdate = true;
        const died = this.health <= 0;
        if (died) {
            console.log(`[Server] ${this.name} was eliminated by ${killerInfo.name || 'The Void'}.`);
            io.emit('playerDied', {
                targetId: this.id, killerId: killerInfo.id,
                killerName: killerInfo.name, killerPhrase: killerInfo.phrase || 'eliminated'
            });
            scheduleRespawn(this.id);
        } else {
            io.emit('healthUpdate', { id: this.id, health: this.health });
        }
        return died;
    }

    respawn() {
        this.health = CONFIG.PLAYER_DEFAULT_HEALTH;

        // ***** USE CUSTOM SPAWN POINTS *****
        // Cycle through spawn points or pick randomly
        // const spawnIndex = Math.floor(Math.random() * SPAWN_POINTS.length); // Random
        const spawnIndex = nextSpawnIndex % SPAWN_POINTS.length; // Cycle
        nextSpawnIndex++; // Increment for next player

        const spawnPoint = SPAWN_POINTS[spawnIndex];

        this.x = spawnPoint.x;
        this.y = spawnPoint.y; // Use Y from spawn point definition
        this.z = spawnPoint.z;
        this.rotationY = Math.random() * Math.PI * 2; // Still random rotation
        // ************************************

        this.needsUpdate = true;
        console.log(`[Server] ${this.name} respawn state set. Spawn Point Index: ${spawnIndex}, Server coords sent: ~(${this.x.toFixed(1)}, ${this.y.toFixed(1)}, ${this.z.toFixed(1)})`);
    }

    getNetworkData() { return { x: this.x, y: this.y, z: this.z, r: this.rotationY, h: this.health }; }
    getFullData() { return { id: this.id, x: this.x, y: this.y, z: this.z, rotationY: this.rotationY, health: this.health, name: this.name, phrase: this.phrase }; }
}

// --- Respawn Scheduling ---
function scheduleRespawn(playerId) {
    if (respawnTimeouts[playerId]) { clearTimeout(respawnTimeouts[playerId]); }
    console.log(`[Server] Scheduling respawn for ${playerId} in ${CONFIG.PLAYER_RESPAWN_DELAY}ms`);
    respawnTimeouts[playerId] = setTimeout(() => {
        const player = players[playerId];
        if (player) {
            player.respawn();
            io.emit('playerRespawned', player.getFullData());
            console.log(`[Server] Player ${playerId} respawn processed.`);
        } else { console.warn(`[Server] Player ${playerId} not found during scheduled respawn.`); }
        delete respawnTimeouts[playerId];
    }, CONFIG.PLAYER_RESPAWN_DELAY);
}

// --- Broadcast Player Count ---
function broadcastPlayerCount() { io.emit('playerCountUpdate', Object.keys(players).length); }

// --- Socket.IO Connection Handling ---
io.on('connection', (socket) => {
    console.log(`[Server] Client tentatively connected: ${socket.id}`);
    socket.emit('playerCountUpdate', Object.keys(players).length);

    socket.on('setPlayerDetails', (data) => {
        if (Object.keys(players).length >= CONFIG.MAX_PLAYERS) {
            console.warn(`[Server] Player join denied: Server full. ID: ${socket.id}`);
            socket.emit('serverFull'); socket.disconnect(true); return;
        }
        if (players[socket.id]) { console.warn(`[Server] Player ${socket.id} tried to set details again.`); return; }

        players[socket.id] = new Player(socket.id, data?.name, data?.phrase);
        const newPlayer = players[socket.id];
        let allPlayersData = {};
        for (const id in players) { if(players[id]) { allPlayersData[id] = players[id].getFullData(); } }

        console.log(`[Server] Sending 'initialize' to ${newPlayer.name} (ID: ${socket.id})`);
        socket.emit('initialize', { id: socket.id, players: allPlayersData });
        socket.broadcast.emit('playerJoined', newPlayer.getFullData());
        broadcastPlayerCount();
    });

    socket.on('playerUpdate', (data) => { if (players[socket.id]) { players[socket.id].updatePosition(data); } });
    socket.on('fellIntoVoid', () => { if (players[socket.id] && players[socket.id].health > 0) { console.log(`[Server] ${players[socket.id].name} reported falling into the void.`); players[socket.id].takeDamage(9999, { id: null, name: "The Void", phrase: "consumed" }); } });
    socket.on('playerHit', (data) => {
          const shooter = players[socket.id]; const target = data?.targetId ? players[data.targetId] : null;
          if (shooter && target && shooter.health > 0 && target.health > 0) {
              const damage = Math.max(0, Number(data.damage) || 0);
              if (damage > 0) { console.log(`[Server] Received playerHit: Shooter=${shooter.name}(${shooter.id}), Target=${target.name}(${target.id}), Damage=${damage}`); target.takeDamage(damage, { id: shooter.id, name: shooter.name, phrase: shooter.phrase }); }
              else { console.warn(`[Server] Ignored playerHit with zero/invalid damage:`, data); }
          }
     });
    socket.on('disconnect', (reason) => {
        const player = players[socket.id];
        if (player) {
            console.log(`[Server] Player disconnected: ${player.name} (ID: ${socket.id}). Reason: ${reason}`);
            if (respawnTimeouts[socket.id]) { clearTimeout(respawnTimeouts[socket.id]); delete respawnTimeouts[socket.id]; console.log(`[Server] Cleared pending respawn for ${socket.id}`); }
            delete players[socket.id];
            io.emit('playerLeft', socket.id);
            broadcastPlayerCount();
        } else { console.log(`[Server] Unidentified client disconnected: ${socket.id}. Reason: ${reason}`); }
    });
    socket.on('clientPing', (data) => { socket.emit('serverPong', data); });
});

// --- Game Loop (Server Side Broadcast) ---
function serverGameLoop() {
    let stateUpdate = { players: {} }; let updateGenerated = false;
    for (const id in players) { const player = players[id]; if (player && player.needsUpdate) { stateUpdate.players[id] = player.getNetworkData(); player.needsUpdate = false; updateGenerated = true; } }
    if (updateGenerated) { io.emit('gameStateUpdate', stateUpdate); }
}
const gameLoopIntervalId = setInterval(serverGameLoop, CONFIG.SERVER_BROADCAST_INTERVAL);
console.log(`[Server] Game loop started with interval: ${CONFIG.SERVER_BROADCAST_INTERVAL}ms`);

// --- HTTP Server Setup ---
app.get('/', (req, res) => { const indexPath = path.join(__dirname, '..', 'docs', 'index.html'); res.sendFile(indexPath, (err) => { if (err) { console.error("[Server] Error sending index.html:", err); if (!res.headersSent) { res.status(500).send('Error loading game page.'); } } }); });
const staticPath = path.join(__dirname, '..', 'docs'); app.use(express.static(staticPath)); console.log(`[Server] Serving static files from: ${staticPath}`);
server.listen(PORT, () => { console.log(`[Server] HTTP and Socket.IO server listening on *:${PORT}`); });

// --- Graceful Shutdown ---
function gracefulShutdown(signal) {
    console.log(`[Server] Received ${signal}. Shutting down gracefully...`);
    clearInterval(gameLoopIntervalId); // Stop game loop
    console.log('[Server] Game loop stopped.');
    io.close(() => { // Close Socket.IO connections
        console.log('[Server] Socket.IO connections closed.');
        server.close(() => { // Close HTTP server
            console.log('[Server] HTTP server closed.');
            process.exit(0); // Exit process cleanly
        });
    });

    // Force shutdown after a timeout if graceful shutdown fails
    setTimeout(() => {
        console.error('[Server] Graceful shutdown timed out. Forcing exit.');
        process.exit(1);
    }, 5000); // 5 second timeout
}
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

console.log("[Server] server.js script fully loaded and running.");
// --- END OF FULL server.js FILE ---
