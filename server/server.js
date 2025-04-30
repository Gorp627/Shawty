// --- START OF FULL server.js FILE ---
// server/server.js (Add Custom Spawns - Manual Raycasting Client v1)
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
    PLAYER_MOVE_THRESHOLD_SQ: 0.001, // Minimum squared distance moved to trigger update in broadcast (Match client config)
    MAX_PLAYERS: 20,
    // SPAWN_Y: 2.0, // Y level defined in spawn points now
};

// ***** DEFINE SPAWN POINTS HERE *****
// Add as many {x, y, z} points as you want within your map's playable area
// Make sure the 'y' value is the desired FEET level spawn height at that x,z coordinate.
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
    // Add any other origins you need to allow (e.g., Render preview URLs if applicable)
];
const io = new Server(server, {
    cors: {
        origin: function (origin, callback) {
             // Allow requests with no origin (like mobile apps or curl requests) OR allowed origins
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
    transports: ['websocket', 'polling'] // Allow both transports
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
        // Clean name received from client
        this.name = String(name || 'Player').slice(0, 16).replace(/[^\w\s\-]/g, '').trim() || 'Player';
        // Clean phrase (still used for kill messages)
        this.phrase = String(phrase || '...').replace(/[<>]/g, '').substring(0, 20).trim() || '...';
        this.respawn(); // Set initial spawn state
        this.lastUpdateTime = Date.now();
        this.needsUpdate = true; // Flag to include in next broadcast
        console.log(`[Server] New Player created: ${this.name} (ID: ${this.id})`);
    }

    // Update player state based on data received from client
    updatePosition(data) {
        if (this.health <= 0) return false; // Don't update dead players
        // Basic validation
        if (data == null || typeof data.x !== 'number' || typeof data.y !== 'number' || typeof data.z !== 'number' || typeof data.rotationY !== 'number' ||
            !isFinite(data.x) || !isFinite(data.y) || !isFinite(data.z) || !isFinite(data.rotationY)) {
            console.warn(`[Server] Invalid position data received from ${this.id}:`, data);
            return false;
        }
        // Check how much the player moved/rotated since last server update
        const movedSq = (data.x - this.x) ** 2 + (data.y - this.y) ** 2 + (data.z - this.z) ** 2;
        const rotated = Math.abs(data.rotationY - this.rotationY) > 0.02; // Rotation threshold (radians)
        const positionThresholdSq = CONFIG.PLAYER_MOVE_THRESHOLD_SQ;

        const changed = movedSq > positionThresholdSq || rotated;
        if (changed) {
            this.x = data.x;
            this.y = data.y;
            this.z = data.z;
            this.rotationY = data.rotationY;
            this.lastUpdateTime = Date.now();
            this.needsUpdate = true; // Mark for broadcast
        }
        return changed;
    }

    // Process damage taken by the player
    takeDamage(amount, killerInfo = { id: null, name: 'Unknown', phrase: 'eliminated' }) {
        if (this.health <= 0) return false; // Already dead
        const damageAmount = Math.max(0, Number(amount) || 0);
        this.health = Math.max(0, this.health - damageAmount);
        console.log(`[Server] ${this.name} took ${damageAmount} damage from ${killerInfo.name || '?'}. Health: ${this.health}`);
        this.needsUpdate = true; // Health changed, needs update

        const died = this.health <= 0;
        if (died) {
            console.log(`[Server] ${this.name} was eliminated by ${killerInfo.name || 'The Void'}.`);
            // Broadcast death event to all clients
            io.emit('playerDied', {
                targetId: this.id,
                killerId: killerInfo.id, // Can be null (e.g., void)
                killerName: killerInfo.name,
                killerPhrase: killerInfo.phrase || 'eliminated' // Use killer's phrase if available
            });
            scheduleRespawn(this.id); // Start respawn timer
        } else {
            // Broadcast health update only if not dead (death broadcast handles 0 health implicitly)
            io.emit('healthUpdate', { id: this.id, health: this.health });
        }
        return died;
    }

    // Reset player state for respawn
    respawn() {
        this.health = CONFIG.PLAYER_DEFAULT_HEALTH;

        // ***** USE CUSTOM SPAWN POINTS *****
        // Cycle through spawn points or pick randomly
        // const spawnIndex = Math.floor(Math.random() * SPAWN_POINTS.length); // Random
        const spawnIndex = nextSpawnIndex % SPAWN_POINTS.length; // Cycle
        nextSpawnIndex++; // Increment for next player

        if (SPAWN_POINTS.length === 0) {
             console.error("!!! No spawn points defined! Defaulting to 0,5,0");
             this.x = 0; this.y = 5; this.z = 0;
        } else {
            const spawnPoint = SPAWN_POINTS[spawnIndex];
            this.x = spawnPoint.x;
            this.y = spawnPoint.y; // Use Y (FEET level) from spawn point definition
            this.z = spawnPoint.z;
        }
        this.rotationY = Math.random() * Math.PI * 2; // Random rotation
        // ************************************

        this.needsUpdate = true; // Ensure respawn state is broadcast
        console.log(`[Server] ${this.name} respawn state set. Spawn Point Index: ${spawnIndex}, Server coords sent: ~(${this.x.toFixed(1)}, ${this.y.toFixed(1)}, ${this.z.toFixed(1)})`);
    }

    // Data sent frequently in gameStateUpdate
    getNetworkData() { return { x: this.x, y: this.y, z: this.z, r: this.rotationY, h: this.health }; }
    // Data sent less frequently (join, respawn)
    getFullData() { return { id: this.id, x: this.x, y: this.y, z: this.z, rotationY: this.rotationY, health: this.health, name: this.name, phrase: this.phrase }; }
}

// --- Respawn Scheduling ---
function scheduleRespawn(playerId) {
    if (respawnTimeouts[playerId]) { clearTimeout(respawnTimeouts[playerId]); } // Clear existing timer if any
    console.log(`[Server] Scheduling respawn for ${playerId} in ${CONFIG.PLAYER_RESPAWN_DELAY}ms`);
    respawnTimeouts[playerId] = setTimeout(() => {
        const player = players[playerId];
        if (player) {
            player.respawn(); // Reset player state
            // Broadcast the full respawn data to everyone
            io.emit('playerRespawned', player.getFullData());
            console.log(`[Server] Player ${playerId} respawn processed.`);
        } else { console.warn(`[Server] Player ${playerId} not found during scheduled respawn.`); }
        delete respawnTimeouts[playerId]; // Remove timer entry
    }, CONFIG.PLAYER_RESPAWN_DELAY);
}

// --- Broadcast Player Count ---
function broadcastPlayerCount() { io.emit('playerCountUpdate', Object.keys(players).length); }

// --- Socket.IO Connection Handling ---
io.on('connection', (socket) => {
    console.log(`[Server] Client tentatively connected: ${socket.id}`);
    // Send current player count immediately to connecting client
    socket.emit('playerCountUpdate', Object.keys(players).length);

    // Handler for when client sends their details after connecting
    socket.on('setPlayerDetails', (data) => {
        // Check if server is full
        if (Object.keys(players).length >= CONFIG.MAX_PLAYERS) {
            console.warn(`[Server] Player join denied: Server full. ID: ${socket.id}`);
            socket.emit('serverFull');
            socket.disconnect(true); // Force disconnect
            return;
        }
        // Prevent player from setting details multiple times
        if (players[socket.id]) {
            console.warn(`[Server] Player ${socket.id} tried to set details again.`);
            return;
        }

        // Create the new player object
        players[socket.id] = new Player(socket.id, data?.name, data?.phrase);
        const newPlayer = players[socket.id];

        // Prepare data for all players currently in the game
        let allPlayersData = {};
        for (const id in players) {
             if(players[id]) { allPlayersData[id] = players[id].getFullData(); }
        }

        // Send initialization data ONLY to the newly connected player
        console.log(`[Server] Sending 'initialize' to ${newPlayer.name} (ID: ${socket.id})`);
        socket.emit('initialize', { id: socket.id, players: allPlayersData });

        // Notify all OTHER players that a new player joined
        socket.broadcast.emit('playerJoined', newPlayer.getFullData());

        // Update player count for everyone
        broadcastPlayerCount();
    });

    // Handler for receiving player movement/rotation updates
    socket.on('playerUpdate', (data) => {
        if (players[socket.id]) { players[socket.id].updatePosition(data); }
    });

    // Handler for when player falls into the void (client-side detection)
    socket.on('fellIntoVoid', () => {
        const player = players[socket.id];
        if (player && player.health > 0) {
            console.log(`[Server] ${player.name} reported falling into the void.`);
            player.takeDamage(9999, { id: null, name: "The Void", phrase: "consumed" }); // Insta-kill
        }
    });

    // Handler for when a player hits another player
    socket.on('playerHit', (data) => {
          const shooter = players[socket.id];
          const target = data?.targetId ? players[data.targetId] : null;
          // Ensure both shooter and target exist and are alive
          if (shooter && target && shooter.health > 0 && target.health > 0) {
              const damage = Math.max(0, Number(data.damage) || 0); // Validate damage
              if (damage > 0) {
                  // console.log(`[Server] Received playerHit: Shooter=${shooter.name}(${shooter.id}), Target=${target.name}(${target.id}), Damage=${damage}`);
                  target.takeDamage(damage, { id: shooter.id, name: shooter.name, phrase: shooter.phrase });
              } else {
                  console.warn(`[Server] Ignored playerHit with zero/invalid damage from ${shooter.id}:`, data);
              }
          }
     });

     // Handler for client disconnection
    socket.on('disconnect', (reason) => {
        const player = players[socket.id];
        if (player) {
            console.log(`[Server] Player disconnected: ${player.name} (ID: ${socket.id}). Reason: ${reason}`);
            // Clear any pending respawn timer for this player
            if (respawnTimeouts[socket.id]) {
                clearTimeout(respawnTimeouts[socket.id]);
                delete respawnTimeouts[socket.id];
                console.log(`[Server] Cleared pending respawn for disconnected player ${socket.id}`);
            }
            delete players[socket.id]; // Remove player from state
            io.emit('playerLeft', socket.id); // Notify clients
            broadcastPlayerCount(); // Update player count
        } else {
            // This might happen if a client disconnects before sending details
            console.log(`[Server] Unidentified client disconnected: ${socket.id}. Reason: ${reason}`);
        }
    });

    // Optional: Simple ping/pong for latency check (client needs corresponding emit)
    // socket.on('clientPing', (data) => { socket.emit('serverPong', data); });
});

// --- Game Loop (Server Side Broadcast) ---
function serverGameLoop() {
    let stateUpdate = { players: {} }; // Object to hold updates for players that moved/changed
    let updateGenerated = false;
    // Iterate through all connected players
    for (const id in players) {
        const player = players[id];
        // If player needs update (moved, took damage, respawned), add their data
        if (player && player.needsUpdate) {
            stateUpdate.players[id] = player.getNetworkData(); // Get concise network data
            player.needsUpdate = false; // Reset flag until next change
            updateGenerated = true;
        }
    }
    // Only broadcast if there were actual updates
    if (updateGenerated) {
        io.emit('gameStateUpdate', stateUpdate);
    }
}
// Start the broadcast loop
const gameLoopIntervalId = setInterval(serverGameLoop, CONFIG.SERVER_BROADCAST_INTERVAL);
console.log(`[Server] Game loop started with interval: ${CONFIG.SERVER_BROADCAST_INTERVAL}ms`);

// --- HTTP Server Setup ---
// Serve the main index.html file
app.get('/', (req, res) => {
    const indexPath = path.join(__dirname, '..', 'docs', 'index.html');
    res.sendFile(indexPath, (err) => {
        if (err) {
            console.error("[Server] Error sending index.html:", err);
            if (!res.headersSent) {
                res.status(err.status || 500).send('Error loading game page.');
            }
        }
    });
});
// Serve static files (CSS, JS, assets) from the 'docs' directory
const staticPath = path.join(__dirname, '..', 'docs');
app.use(express.static(staticPath));
console.log(`[Server] Serving static files from: ${staticPath}`);

// Start the server
server.listen(PORT, () => {
    console.log(`[Server] HTTP and Socket.IO server listening on *:${PORT}`);
});

// --- Graceful Shutdown ---
function gracefulShutdown(signal) {
    console.log(`[Server] Received ${signal}. Shutting down gracefully...`);
    clearInterval(gameLoopIntervalId); // Stop game loop
    console.log('[Server] Game loop stopped.');

    // Close all active socket connections
    io.close(() => {
        console.log('[Server] Socket.IO connections closed.');
        // Close the HTTP server
        server.close(() => {
            console.log('[Server] HTTP server closed.');
            process.exit(0); // Exit process cleanly
        });
    });

    // Force shutdown after a timeout if graceful shutdown hangs
    setTimeout(() => {
        console.error('[Server] Graceful shutdown timed out. Forcing exit.');
        process.exit(1);
    }, 5000); // 5 second timeout
}
// Listen for termination signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM')); // Standard termination signal
process.on('SIGINT', () => gracefulShutdown('SIGINT')); // Ctrl+C

console.log("[Server] server.js script fully loaded and running.");
// --- END OF FULL server.js FILE ---
