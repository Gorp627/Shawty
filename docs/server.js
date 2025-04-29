// server/server.js (Handle Hits, Correct CORS - Full File v4 REGEN)
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
    // Define bounds for random spawning slightly inside potential map edges
    // These should roughly match the playable area derived from client's MAP_BOUNDS if used
    SPAWN_AREA_X_MAX: 45.0, // Example: If client map bounds are 100x100
    SPAWN_AREA_Z_MAX: 45.0, // Example: Spawn within +/- 45 units
    SPAWN_Y: 20.0, // Y position to spawn players at (client physics handles dropping to ground)
};

// --- Socket.IO Server Setup ---
const allowedOrigins = [
    "https://gorp54.github.io", // Your specific GitHub Pages URL
    "http://localhost:8080",    // For local testing via http-server or similar
    "http://127.0.0.1:8080",   // Another common local testing address
    // Add codespace preview URL pattern if needed (use cautiously, better to configure specific URL)
    // Example: /https:\/\/.*\.preview\.app\.github\.dev/ - Needs careful regex handling if used
];
const io = new Server(server, {
    cors: {
        origin: function (origin, callback) {
             // Allow requests with no origin (e.g., mobile apps, curl, direct file open sometimes - use carefully)
             // Or if origin is in the allowed list
             if (!origin || allowedOrigins.includes(origin)) {
                 callback(null, true);
             }
             // // Uncomment for Regex matching (e.g. Codespaces) - Requires careful testing
             // else if (origin && allowedOrigins.some(pattern => typeof pattern === 'object' && pattern instanceof RegExp && pattern.test(origin))) {
             //      callback(null, true);
             // }
             else {
                 const msg = `CORS policy denial for Origin: ${origin}`;
                 console.warn(msg);
                 callback(new Error(msg), false);
             }
        },
        methods: ["GET", "POST"]
    },
    transports: ['websocket', 'polling'] // Allow polling as fallback if websocket fails
});

const PORT = process.env.PORT || 3000; // Use Render's port or default to 3000

// --- Game State ---
let players = {}; // Stores Player instances, keyed by socket.id
let respawnTimeouts = {}; // Stores setTimeout IDs for respawns, keyed by socket.id

// --- Utility ---
function randomFloat(min, max) { return Math.random() * (max - min) + min; }

// --- Player Class (Server Side) ---
class Player {
    constructor(id, name = 'Player', phrase = '...') { // Default phrase
        this.id = id;
        // Sanitize name and phrase strictly
        this.name = String(name || 'Player').replace(/[^a-zA-Z0-9_\- ]/g, '').substring(0, 16).trim() || 'Player';
        this.phrase = String(phrase || '...').replace(/[<>]/g, '').substring(0, 20).trim() || '...'; // Remove HTML tags
        this.respawn(); // Set initial state (position, health)
        this.lastUpdateTime = Date.now();
        this.needsUpdate = true; // Flag to include in next broadcast
        console.log(`[Server] New Player created: ${this.name} (ID: ${this.id})`);
    }

    // Update player state from client data
    updatePosition(data) {
        if (this.health <= 0) return false; // Don't update dead players' positions

        // Basic validation for received data structure and types
        if (data == null || typeof data.x !== 'number' || typeof data.y !== 'number' || typeof data.z !== 'number' || typeof data.rotationY !== 'number' ||
            !isFinite(data.x) || !isFinite(data.y) || !isFinite(data.z) || !isFinite(data.rotationY)) {
            console.warn(`[Server] Invalid position data received from ${this.id}:`, data);
            return false;
        }

        // Calculate change thresholds
        const movedSq = (data.x - this.x) ** 2 + (data.y - this.y) ** 2 + (data.z - this.z) ** 2;
        const rotated = Math.abs(data.rotationY - this.rotationY) > 0.01; // Rotation threshold (radians)
        const positionThreshold = CONFIG.PLAYER_MOVE_THRESHOLD_SQ; // Use constant from config

        const changed = movedSq > positionThreshold || rotated;

        if (changed) {
            this.x = data.x;
            this.y = data.y; // Trust client's Y position (derived from physics)
            this.z = data.z;
            this.rotationY = data.rotationY;
            this.lastUpdateTime = Date.now();
            this.needsUpdate = true; // Mark for broadcast
            // console.log(`[Server] Updated ${this.name}: pos ~(${this.x.toFixed(1)}, ${this.y.toFixed(1)}, ${this.z.toFixed(1)}), rotY ~${this.rotationY.toFixed(2)}`); // DEBUG
        }
        return changed; // Return true if state was updated
    }

    // Apply damage and handle death
    takeDamage(amount, killerInfo = { id: null, name: 'Unknown', phrase: 'eliminated' }) {
        if (this.health <= 0) return false; // Already dead

        // Validate damage amount
        const damageAmount = Math.max(0, Number(amount) || 0); // Ensure positive number

        this.health = Math.max(0, this.health - damageAmount);
        console.log(`[Server] ${this.name} took ${damageAmount} damage from ${killerInfo.name || '?'}. Health: ${this.health}`);
        this.needsUpdate = true; // Health changed, mark for broadcast

        const died = this.health <= 0;
        if (died) {
            console.log(`[Server] ${this.name} was eliminated by ${killerInfo.name || 'The Void'}.`);
            // Broadcast death event to all clients
            io.emit('playerDied', {
                targetId: this.id,
                killerId: killerInfo.id, // Can be null for void death
                killerName: killerInfo.name,
                killerPhrase: killerInfo.phrase || 'eliminated' // Use phrase from killer
            });
            scheduleRespawn(this.id); // Schedule respawn timer
        } else {
            // Broadcast health update only if not dead (death event handles 0 health)
            io.emit('healthUpdate', { id: this.id, health: this.health });
        }
        return died; // Return true if player died
    }

    // Reset player state for respawn
    respawn() {
        this.health = CONFIG.PLAYER_DEFAULT_HEALTH;

        // Generate random X/Z spawn coordinates within defined area
        const xMax = CONFIG.SPAWN_AREA_X_MAX;
        const zMax = CONFIG.SPAWN_AREA_Z_MAX;
        this.x = randomFloat(-xMax, xMax);
        // SET INITIAL SPAWN HEIGHT - Client physics will handle ground placement.
        this.y = CONFIG.SPAWN_Y; // Use constant from config
        this.z = randomFloat(-zMax, zMax);
        this.rotationY = randomFloat(0, Math.PI * 2); // Random initial facing direction

        this.needsUpdate = true; // Mark for broadcast
        console.log(`[Server] ${this.name} respawn state set. Server coords sent: ~(${this.x.toFixed(1)}, ${this.y.toFixed(1)}, ${this.z.toFixed(1)})`);
        // Note: The actual spawn position client-side depends on client physics finding valid ground near these coords.
    }

    // Data structure for periodic game state updates (minimal)
    getNetworkData() {
        return {
            // id: this.id, // ID is the key in the update object
            x: this.x,
            y: this.y,
            z: this.z,
            r: this.rotationY, // Use 'r' for brevity (rotationY)
            h: this.health      // Use 'h' for brevity (health)
        };
    }

    // Data structure for initial join/respawn events (full info)
    getFullData() {
        return {
            id: this.id,
            x: this.x,
            y: this.y,
            z: this.z,
            rotationY: this.rotationY, // Full name for clarity
            health: this.health,
            name: this.name,
            phrase: this.phrase
        };
    }
}

// --- Respawn Scheduling ---
function scheduleRespawn(playerId) {
    if (respawnTimeouts[playerId]) {
        clearTimeout(respawnTimeouts[playerId]); // Clear existing timer if any
    }
    console.log(`[Server] Scheduling respawn for ${playerId} in ${CONFIG.PLAYER_RESPAWN_DELAY}ms`);
    respawnTimeouts[playerId] = setTimeout(() => {
        const player = players[playerId];
        if (player) {
            player.respawn(); // Reset player state
            // Broadcast respawn event with full data
            io.emit('playerRespawned', player.getFullData());
            console.log(`[Server] Player ${playerId} respawn processed.`);
        } else {
            console.warn(`[Server] Player ${playerId} not found during scheduled respawn.`);
        }
        delete respawnTimeouts[playerId]; // Remove timeout entry
    }, CONFIG.PLAYER_RESPAWN_DELAY); // Use constant from config
}

// --- Broadcast Player Count ---
function broadcastPlayerCount() {
    const count = Object.keys(players).length;
    io.emit('playerCountUpdate', count); // Send current count to all clients
}

// --- Socket.IO Connection Handling ---
io.on('connection', (socket) => {
    console.log(`[Server] Client tentatively connected: ${socket.id}`);

    // Send initial player count
    socket.emit('playerCountUpdate', Object.keys(players).length);

    // --- Handle Player Details ---
    socket.on('setPlayerDetails', (data) => {
        // Check player limit
        if (Object.keys(players).length >= CONFIG.MAX_PLAYERS) {
            console.warn(`[Server] Player join denied: Server full (Max: ${CONFIG.MAX_PLAYERS}). ID: ${socket.id}`);
            socket.emit('serverFull');
            socket.disconnect(true); // Force disconnect
            return;
        }
        // Prevent double joining
        if (players[socket.id]) {
            console.warn(`[Server] Player ${socket.id} tried to set details again.`);
            return;
        }

        // Create new player instance (constructor handles sanitization)
        players[socket.id] = new Player(socket.id, data?.name, data?.phrase);
        const newPlayer = players[socket.id];

        // Prepare data for all existing players
        let allPlayersData = {};
        for (const id in players) {
            // Ensure player object exists before getting data (safety check)
            if(players[id]) {
                allPlayersData[id] = players[id].getFullData();
            }
        }

        // Send 'initialize' event to the new player
        console.log(`[Server] Sending 'initialize' to ${newPlayer.name} (ID: ${socket.id})`);
        socket.emit('initialize', {
            id: socket.id,          // The new player's own ID
            players: allPlayersData // Full state of all players (including the new one)
        });

        // Send 'playerJoined' event to all OTHER players
        socket.broadcast.emit('playerJoined', newPlayer.getFullData());

        // Update player count for everyone
        broadcastPlayerCount();
    });

    // --- Handle Player Movement Updates ---
    socket.on('playerUpdate', (data) => {
        const player = players[socket.id];
        if (player) {
            player.updatePosition(data);
            // Update is broadcast periodically by the game loop if needsUpdate is true
        }
    });

     // --- Handle Player Falling Out ---
     socket.on('fellIntoVoid', () => {
         const player = players[socket.id];
         if (player && player.health > 0) { // Only process if alive
             console.log(`[Server] ${player.name} reported falling into the void.`);
             // Apply massive damage to kill them, attribute to "The Void"
             player.takeDamage(9999, { id: null, name: "The Void", phrase: "consumed" });
         }
     });

     // --- Handle Player Hit ---
     socket.on('playerHit', (data) => {
          // data = { targetId: string, damage: number }
          const shooter = players[socket.id]; // The player who sent the hit event
          const target = data?.targetId ? players[data.targetId] : null; // Get target player object safely

          // Validate: Shooter exists, Target exists, Shooter is alive, Target is alive
          if (shooter && target && shooter.health > 0 && target.health > 0) {
              // Validate damage value
              const damage = Math.max(0, Number(data.damage) || 0);
              if (damage > 0) {
                   console.log(`[Server] Received playerHit: Shooter=${shooter.name}(${shooter.id}), Target=${target.name}(${target.id}), Damage=${damage}`);
                   // Apply damage using the shooter's info (name/phrase)
                   target.takeDamage(damage, { id: shooter.id, name: shooter.name, phrase: shooter.phrase });
              } else {
                   console.warn(`[Server] Ignored playerHit with zero or invalid damage:`, data);
              }
          } else {
               // Log if hit is invalid (e.g., target already dead, shooter dead, target not found)
               // console.warn(`[Server] Invalid playerHit received:`, data, `Shooter valid/alive: ${!!shooter && shooter.health > 0}, Target valid/alive: ${!!target && target.health > 0}`);
          }
     });


    // --- Handle Disconnection ---
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
            // Remove player from state
            delete players[socket.id];
            // Broadcast player left event
            io.emit('playerLeft', socket.id);
            // Update player count
            broadcastPlayerCount();
        } else {
            // This can happen if a client connects but never sends 'setPlayerDetails'
            console.log(`[Server] Unidentified client disconnected: ${socket.id}. Reason: ${reason}`);
        }
    });

    // --- Optional: Add latency check / ping ---
    socket.on('clientPing', (data) => {
        socket.emit('serverPong', data); // Echo back timestamp or data
    });

}); // End io.on('connection')

// --- Game Loop (Server Side Broadcast) ---
let lastBroadcastTime = 0;
function serverGameLoop() {
    const now = Date.now();
    let stateUpdate = { players: {} }; // Object to hold updates for players who moved/changed
    let updateGenerated = false;

    for (const id in players) {
        // Ensure player object exists before accessing properties
        const player = players[id];
        if (player && player.needsUpdate) {
            stateUpdate.players[id] = player.getNetworkData();
            player.needsUpdate = false; // Reset flag after adding to update
            updateGenerated = true;
        }
    }

    // Broadcast the state update only if there were changes
    if (updateGenerated) {
        io.emit('gameStateUpdate', stateUpdate);
        lastBroadcastTime = now;
        // console.log("[Server] Broadcasted gameStateUpdate with changes."); // DEBUG
    }

    // Optional: Add logic for server-side events, AI, etc. here
}
// Start the server game loop
const gameLoopIntervalMs = CONFIG.SERVER_BROADCAST_INTERVAL; // Use constant from config
const gameLoopIntervalId = setInterval(serverGameLoop, gameLoopIntervalMs);
console.log(`[Server] Game loop started with interval: ${gameLoopIntervalMs}ms`);

// --- HTTP Server Setup ---
// Serve the main HTML file from the 'docs' directory relative to server.js location
app.get('/', (req, res) => {
    // Construct the path relative to the current file's directory (__dirname)
    // Go up one level ('..') then into 'docs'
    const indexPath = path.join(__dirname, '..', 'docs', 'index.html');
    res.sendFile(indexPath, (err) => {
        if (err) {
            console.error("[Server] Error sending index.html:", err);
            if (!res.headersSent) { // Check if headers were already sent
                 res.status(500).send('Error loading game page.');
            }
        }
    });
});

// Serve static files (CSS, JS, assets) from the 'docs' directory
const staticPath = path.join(__dirname, '..', 'docs');
app.use(express.static(staticPath));
console.log(`[Server] Serving static files from: ${staticPath}`);

// --- Start Server Listening ---
server.listen(PORT, () => {
    console.log(`[Server] HTTP and Socket.IO server listening on *:${PORT}`);
});

// --- Graceful Shutdown Handling ---
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

process.on('SIGTERM', () => gracefulShutdown('SIGTERM')); // Signal from Render/Docker/etc.
process.on('SIGINT', () => gracefulShutdown('SIGINT'));   // Signal from Ctrl+C

console.log("[Server] server.js script fully loaded and running."); // Confirmation log
