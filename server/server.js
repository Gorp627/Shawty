// server/server.js (Corrected CORS Origin - Full File v4 - Added Names to Death Msg)
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
    // Define bounds for random spawning slightly inside potential map edges
    // These should roughly match the playable area derived from client's MAP_BOUNDS
    SPAWN_AREA_X_MAX: 45.0, // Example: If client map bounds are 100x100
    SPAWN_AREA_Z_MAX: 45.0, // Example: Spawn within +/- 45 units
    // Define an initial spawn height. Client physics (raycast down) should find the ground.
    INITIAL_SPAWN_Y: 30.0, // Start players relatively high up
};

// --- Socket.IO Server Setup ---
// Configure CORS for allowed origins (Github Pages, localhost for testing)
const allowedOrigins = [
    "https://gorp54.github.io", // Your GitHub Pages URL
    "http://localhost:8080",    // Keep for local testing if needed
    // Add any other origins if needed (e.g., specific preview URLs)
];
const io = new Server(server, {
    cors: {
        origin: function (origin, callback) {
             // Allow requests with no origin (like mobile apps or curl requests) or from allowed list
             if (!origin || allowedOrigins.indexOf(origin) !== -1) {
                 return callback(null, true); // Allow
             } else {
                 const msg = `CORS policy denial for Origin: ${origin}`;
                 console.warn(msg); // Log CORS denial reason
                 return callback(new Error(msg), false); // Deny
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
        this.name = String(name).substring(0, 16).trim() || 'Player'; // Sanitize name
        this.phrase = String(phrase).substring(0, 20).trim() || '...'; // Sanitize phrase
        this.respawn(); // Set initial state (position, health)
        this.lastUpdateTime = Date.now();
        this.needsUpdate = true; // Flag to include in next broadcast
        console.log(`[Server] New Player created: ${this.name} (ID: ${this.id})`);
    }

    // Update player state from client data
    updatePosition(data) {
        if (this.health <= 0) return false; // Don't update dead players' positions
        // Basic validation
        if (data == null || isNaN(data.x) || isNaN(data.y) || isNaN(data.z) || isNaN(data.rotationY)) {
            console.warn(`[Server] Invalid position data received from ${this.id} (${this.name}):`, data);
            return false;
        }

        // Optional: Add basic server-side validation/anti-cheat here
        // e.g., check distance moved since last update, check if position is within reasonable bounds
        const maxDistSq = 100; // Max distance squared allowed per update interval (adjust based on speed/interval)
        const timeDiff = (Date.now() - this.lastUpdateTime) / 1000.0; // Time since last update in seconds
        const distSq = (data.x - this.x) ** 2 + (data.y - this.y) ** 2 + (data.z - this.z) ** 2;
        // if(distSq / (timeDiff * timeDiff || 0.001) > maxDistSq * maxDistSq) { // Check speed squared
        //      console.warn(`[Server AntiCheat?] Player ${this.name} moved too fast: ${Math.sqrt(distSq).toFixed(2)} units in ${timeDiff.toFixed(3)}s`);
             // maybe ignore update or rubber-band player?
        // }


        // Calculate change thresholds
        const movedSq = (data.x - this.x) ** 2 + (data.y - this.y) ** 2 + (data.z - this.z) ** 2;
        // Calculate shortest angle difference for rotation
        let rotationDiff = data.rotationY - this.rotationY;
        rotationDiff = Math.atan2(Math.sin(rotationDiff), Math.cos(rotationDiff)); // Normalize to [-PI, PI]
        const rotated = Math.abs(rotationDiff) > 0.01; // Rotation threshold (radians)

        const positionThreshold = CONFIG.PLAYER_MOVE_THRESHOLD_SQ || 1e-4;
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

        this.health = Math.max(0, this.health - amount);
        console.log(`[Server] ${this.name} took ${amount} damage from ${killerInfo.name || '?'}. Health: ${this.health}`);
        this.needsUpdate = true; // Health changed, mark for broadcast

        const died = this.health <= 0;
        if (died) {
            console.log(`[Server] ${this.name} was eliminated by ${killerInfo.name || 'The Void'}.`);
            // Broadcast death event to all clients
            io.emit('playerDied', {
                targetId: this.id,
                targetName: this.name, // Include target name for better UI messages
                killerId: killerInfo.id,
                killerName: killerInfo.name,
                killerPhrase: killerInfo.phrase || 'eliminated' // Use killer's phrase or default
            });
            scheduleRespawn(this.id); // Schedule respawn timer
        } else {
            // Broadcast health update only if not dead (death event handles 0 health)
            // Send to specific player? Or broadcast? Broadcasting is simpler for now.
             io.emit('healthUpdate', { id: this.id, health: this.health });
        }
        return died; // Return true if player died
    }

    // Reset player state for respawn
    respawn() {
        this.health = CONFIG.PLAYER_DEFAULT_HEALTH;

        // Generate random X/Z spawn coordinates within defined area
        const xMax = CONFIG.SPAWN_AREA_X_MAX || 45.0;
        const zMax = CONFIG.SPAWN_AREA_Z_MAX || 45.0;
        this.x = randomFloat(-xMax, xMax);
        this.y = CONFIG.INITIAL_SPAWN_Y || 30.0; // SET INITIAL SPAWN HEIGHT HIGH
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
            x: parseFloat(this.x.toFixed(3)), // Reduce precision for network
            y: parseFloat(this.y.toFixed(3)),
            z: parseFloat(this.z.toFixed(3)),
            r: parseFloat(this.rotationY.toFixed(3)), // Use 'r' for brevity
            h: this.health      // Use 'h' for brevity
        };
    }

    // Data structure for initial join/respawn events (full info)
    getFullData() {
        return {
            id: this.id,
            x: this.x,
            y: this.y, // Send initial high Y
            z: this.z,
            rotationY: this.rotationY, // Full name for clarity
            health: this.health,
            name: this.name,
            phrase: this.phrase
        };
    }
}

// Helper to get all players' full data
function getAllPlayersFullData() {
    let allPlayersData = {};
    for (const id in players) {
        allPlayersData[id] = players[id].getFullData();
    }
    return allPlayersData;
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
            player.respawn(); // Reset player state (sets new pos/health)
            // Broadcast respawn event with full data (includes new position)
            io.emit('playerRespawned', player.getFullData());
            console.log(`[Server] Player ${player.name} (${playerId}) respawn processed.`);
        } else {
            console.warn(`[Server] Player ${playerId} not found during scheduled respawn.`);
        }
        delete respawnTimeouts[playerId]; // Remove timeout entry
    }, CONFIG.PLAYER_RESPAWN_DELAY || 3500);
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
             // Maybe just update details instead of erroring? Allow name/phrase change?
             const oldName = players[socket.id].name;
             const oldPhrase = players[socket.id].phrase;
             players[socket.id].name = String(data?.name).substring(0, 16).trim() || players[socket.id].name;
             players[socket.id].phrase = String(data?.phrase).substring(0, 20).trim() || players[socket.id].phrase;
             console.log(`[Server] Updated details for ${players[socket.id].name} (was ${oldName}). Phrase: ${players[socket.id].phrase} (was ${oldPhrase})`);
             // Re-initialize the player with potentially new details?
             socket.emit('initialize', { id: socket.id, players: getAllPlayersFullData() });
             // Notify others of the update? Maybe not necessary unless name changes significantly
            return;
        }

        // Create new player instance
        const name = data?.name; // Already sanitized in Player constructor
        const phrase = data?.phrase;
        players[socket.id] = new Player(socket.id, name, phrase);
        const newPlayer = players[socket.id];

        // Prepare data for all existing players (including the new one)
        let allPlayersData = getAllPlayersFullData();

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
        } else {
             // console.warn(`[Server] Received playerUpdate from unknown socket ID: ${socket.id}`);
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

     // --- Placeholder for Shooting ---
     socket.on('playerShot', (/* targetId */) => {
          const shooter = players[socket.id];
          if(!shooter || shooter.health <= 0) return; // Ignore shots from dead or non-existent players

          // TODO: Implement shooting logic
          // 1. Validate shot (cooldown, ammo, line of sight?)
          // 2. Determine hit target (raycast from shooter's position/direction)
          //    - This ideally requires server-side physics or at least position checks.
          //    - For simplicity now, we might trust client hit report or skip server validation.
          // 3. If target is hit (e.g., targetId provided by client - UNSAFE)
          // const targetPlayer = players[targetId];
          // if(targetPlayer) {
          //      const damage = 25; // Example damage
          //      targetPlayer.takeDamage(damage, { id: shooter.id, name: shooter.name, phrase: shooter.phrase });
          // }
          console.log(`[Server] Received 'playerShot' from ${shooter.name} (ID: ${socket.id}) - Target processing TBD.`);
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
        // Only include alive players who need updating in the broadcast
        if (players[id].needsUpdate && players[id].health > 0) {
            stateUpdate.players[id] = players[id].getNetworkData();
            players[id].needsUpdate = false; // Reset flag after adding to update
            updateGenerated = true;
        } else if (players[id].needsUpdate) {
             // Reset flag even if dead, so they don't perpetually need update
             players[id].needsUpdate = false;
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
const gameLoopIntervalMs = CONFIG.SERVER_BROADCAST_INTERVAL || 66; // Default ~15fps
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
                 res.status(err.status || 500).send('Error loading game page.');
            }
        }
    });
});

// Serve static files (CSS, JS, assets) from the 'docs' directory
const staticPath = path.join(__dirname, '..', 'docs');
app.use(express.static(staticPath, {
    // Optional: Set headers for specific file types if needed
    // setHeaders: function (res, filePath, stat) {
    //   if (path.extname(filePath) === '.glb') {
    //     res.set('Content-Encoding', 'gzip'); // If you are pre-gzipping assets
    //   }
    // }
}));
console.log(`[Server] Serving static files from: ${staticPath}`);

// --- Start Server Listening ---
server.listen(PORT, () => {
    console.log(`[Server] HTTP and Socket.IO server listening on *:${PORT}`);
    console.log(`[Server] Allowed Origins: ${allowedOrigins.join(', ')}`);
});

// --- Graceful Shutdown Handling ---
function gracefulShutdown(signal) {
    console.log(`[Server] Received ${signal}. Shutting down gracefully...`);
    clearInterval(gameLoopIntervalId); // Stop game loop
    console.log('[Server] Game loop stopped.');

    // Clear all pending respawn timeouts
    Object.values(respawnTimeouts).forEach(clearTimeout);
    console.log('[Server] Cleared pending respawn timeouts.');

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
