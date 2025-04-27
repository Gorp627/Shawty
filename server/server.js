// server/server.js - Added predefined spawn points
const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');

const app = express();
const server = http.createServer(app);

// --- Configuration ---
const CONFIG = {
    PLAYER_DEFAULT_HEALTH: 100,
    PLAYER_RESPAWN_DELAY: 3500,
    SERVER_BROADCAST_INTERVAL: 1000 / 15,
    PLAYER_MOVE_THRESHOLD_SQ: 0.0001,
    MAX_PLAYERS: 20,
    // VOID_Y_LEVEL: -40 // Server doesn't check void anymore, client reports
};
const io = new Server(server, { cors: { origin: ["https://gorp627.github.io", "http://localhost:8080"], methods: ["GET", "POST"] } });
const PORT = process.env.PORT || 3000;

// --- <<< ADDED SPAWN POINTS >>> ---
// Define known safe spawn locations {x, y, z} where y is the ground level.
// ADJUST THESE COORDINATES BASED ON YOUR "the first map!.glb" GEOMETRY!
const SPAWN_POINTS = [
    { x: 0,   y: 0, z: 0 },    // Center
    { x: 10,  y: 0, z: 10 },   // Example corner 1
    { x: -10, y: 0, z: 10 },   // Example corner 2
    { x: 10,  y: 0, z: -10 },  // Example corner 3
    { x: -10, y: 0, z: -10 },  // Example corner 4
    // Add more safe points from your map here
    // e.g., { x: 5, y: 2.5, z: -8 } // If there's a platform at y=2.5
];
// --- <<< END SPAWN POINTS >>> ---


// --- Game State ---
let players = {}; let respawnTimeouts = {};

// --- Utility ---
function randomFloat(min, max) { return Math.random() * (max - min) + min; }
function randomInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; } // Added for spawn point index

// --- Player Class (Server Side) ---
class Player {
    constructor(id, name = 'Player', phrase = 'blasted') {
        this.id = id; this.name = name; this.phrase = phrase;
        this.respawn(); // Initial spawn
        this.lastUpdateTime = Date.now(); this.needsUpdate = true;
        console.log(`New Player: ${this.name} (${this.id})`);
    }

    updatePosition(data) {
        if (this.health <= 0) return false; // Don't update dead players' positions
        // Basic validation
        if (data == null || isNaN(data.x) || isNaN(data.y) || isNaN(data.z) || isNaN(data.rotationY)) {
             console.warn(`Invalid position data received for player ${this.id}`, data);
             return false;
        }

        const mSq = (data.x - this.x) ** 2 + (data.y - this.y) ** 2 + (data.z - this.z) ** 2;
        const rChanged = Math.abs(data.rotationY - this.rotationY) > 0.01; // Use a reasonable threshold
        const changed = mSq > (CONFIG.PLAYER_MOVE_THRESHOLD_SQ || 0.0001) || rChanged;

        if (changed) {
            this.x = data.x; this.y = data.y; this.z = data.z; this.rotationY = data.rotationY;
            this.lastUpdateTime = Date.now();
            this.needsUpdate = true; // Mark for broadcast
        }
        return changed;
    }

    takeDamage(amount, killerInfo = {id: null, name: 'Unknown', phrase: 'eliminated'}) {
        if(this.health <= 0) return false; // Already dead
        this.health = Math.max(0, this.health - amount); // Prevent negative health
        console.log(`${this.name} HP:${this.health} (Attacker: ${killerInfo.name || killerInfo.id || 'Unknown'})`);
        this.needsUpdate = true; // Health changed, needs broadcast
        const died = this.health <= 0;
        if (died) {
            console.log(`${this.name} K.O. by ${killerInfo.name || killerInfo.id || 'Environment'}`);
            // Emit death event with killer details
            io.emit('playerDied', {
                 targetId: this.id,
                 killerId: killerInfo.id,
                 killerName: killerInfo.name,
                 killerPhrase: killerInfo.phrase
            });
            scheduleRespawn(this.id); // Schedule respawn AFTER emitting death
        } else {
             // Just broadcast health update if not dead
             io.emit('healthUpdate', { id: this.id, health: this.health });
        }
        return died;
    }

    respawn() {
        this.health = CONFIG.PLAYER_DEFAULT_HEALTH;
        // <<< CHANGED: Pick random spawn point >>>
        if (SPAWN_POINTS && SPAWN_POINTS.length > 0) {
            const spawnIndex = randomInt(0, SPAWN_POINTS.length - 1);
            const spawnPoint = SPAWN_POINTS[spawnIndex];
            this.x = spawnPoint.x + randomFloat(-0.5, 0.5); // Add slight random offset
            this.y = spawnPoint.y; // Use predefined ground Y for accuracy
            this.z = spawnPoint.z + randomFloat(-0.5, 0.5); // Add slight random offset
        } else {
            // Fallback if SPAWN_POINTS is empty or missing
            console.warn("SPAWN_POINTS array is empty! Defaulting to random spawn near origin.");
            this.x = randomFloat(-5, 5); this.y = 0; this.z = randomFloat(-5, 5);
        }
        this.rotationY = randomFloat(0, Math.PI * 2); // Random facing direction
        // <<< END CHANGE >>>
        this.needsUpdate = true; // Mark for update broadcast
        console.log(`${this.name} respawned at server coords: ~${this.x.toFixed(1)},${this.y.toFixed(1)},${this.z.toFixed(1)}`);
    }


    getNetworkData() { // Lean data for frequent updates
        return {id:this.id,x:this.x,y:this.y,z:this.z,r:this.rotationY,h:this.health};
    }
    getFullData() { // Full data for init/join/respawn
        return {id:this.id,x:this.x,y:this.y,z:this.z,rotationY:this.rotationY,health:this.health,name:this.name,phrase:this.phrase};
    }
}

// --- Respawn Scheduling ---
function scheduleRespawn(pId) {
     if(respawnTimeouts[pId]) clearTimeout(respawnTimeouts[pId]); // Clear existing timeout if any
     respawnTimeouts[pId] = setTimeout(() => {
         const p = players[pId];
         if (p) {
             p.respawn(); // Reset player state and position
             io.emit('playerRespawned', p.getFullData()); // Notify clients
         }
         delete respawnTimeouts[pId]; // Remove timeout entry
     }, CONFIG.PLAYER_RESPAWN_DELAY || 3500);
 }

// --- Broadcast Player Count ---
function broadcastPlayerCount() {
     const c = Object.keys(players).length;
     io.emit('playerCountUpdate', c);
 }

// --- Socket.IO Handling ---
io.on('connection', function(socket) {
    console.log(`Tentative Connect: ${socket.id}`);
    socket.emit('playerCountUpdate',Object.keys(players).length); // Send current count
    socket.emit("ping",{m:`Ack ${socket.id}`}); // Acknowledge connection attempt

    socket.on('setPlayerDetails',function(d){
        if(Object.keys(players).length >= CONFIG.MAX_PLAYERS){ socket.emit('serverFull'); socket.disconnect(true); return; } // Check max players
        if(players[socket.id]) return; // Prevent re-joining if already in game

        // Sanitize input
        const n = d?.name ? String(d.name).substring(0, 16).trim() : 'Player';
        const p = d?.phrase ? String(d.phrase).substring(0, 20).trim() : '...';
        const fN = n === '' ? 'Player' : n; const fP = p === '' ? '...' : p;

        console.log(`Player Joined: ${fN} (${socket.id})`);
        players[socket.id] = new Player(socket.id, fN, fP); // Create new Player instance

        let allPData = {};
        for(const id in players) allPData[id] = players[id].getFullData(); // Gather data for all players

        console.log(`-> Emit 'initialize' to ${socket.id}`);
        socket.emit('initialize', { id: socket.id, players: allPData }); // Send init data to new player

        // Notify existing players about the new player (don't send to the new player themselves)
        socket.broadcast.emit('playerJoined', players[socket.id].getFullData());
        broadcastPlayerCount(); // Update count for everyone
    });

    socket.on('playerUpdate',function(d){ const p=players[socket.id]; if(p) p.updatePosition(d); }); // Update player state from client data

    // --- Re-added listener for client-reported void death ---
    socket.on('fellIntoVoid', function() {
        const p = players[socket.id];
        if (p && p.health > 0) { // Check if player exists and is actually alive
            console.log(`${p.name} reported falling into void.`);
            p.takeDamage(9999, {id: null, name: "The Void", phrase: "consumed"}); // Deal massive damage, trigger death logic
            // scheduleRespawn(socket.id); // takeDamage now schedules respawn on death
        }
    });
    // --- End added listener ---

    socket.on('disconnect',function(r){
        const p = players[socket.id];
        if(p){ console.log(`Player Disconnected: ${p.name}`); delete players[socket.id]; if(respawnTimeouts[socket.id]){ clearTimeout(respawnTimeouts[socket.id]); delete respawnTimeouts[socket.id]; } io.emit('playerLeft', socket.id); broadcastPlayerCount(); } // Handle leaving player
        else{ console.log(`Unidentified socket ${socket.id} disconnected`); }
    });
});

// --- Game Loop (Server Side) ---
let lastBroadcastTime = 0;
function serverGameLoop() {
     let stateUpdate = { players: {} };
     let updateGenerated = false;
     for (const id in players) {
         if (players[id].needsUpdate) { // Check if player data changed
             stateUpdate.players[id] = players[id].getNetworkData(); // Get lean data
             players[id].needsUpdate = false; // Reset flag
             updateGenerated = true;
         }
     }
     if (updateGenerated) { // Only broadcast if there are changes
         io.emit('gameStateUpdate', stateUpdate);
         lastBroadcastTime = Date.now();
     }
 }
const gameLoopIntervalId = setInterval(serverGameLoop, CONFIG.SERVER_BROADCAST_INTERVAL || 66); // Use config interval or default

// --- HTTP Server ---
app.get('/', function(req, res) {
    const p = path.join(__dirname, '..', 'docs', 'index.html');
    res.sendFile(p, function(err) { if (err) { console.error("Err sending index:", err); res.status(500).send('Server Error'); } });
});
app.use(express.static(path.join(__dirname, '..', 'docs'))); // Serve static files from docs

// --- Start Server ---
server.listen(PORT,function(){console.log(`Server listening *:${PORT}`);});

// --- Graceful Shutdown ---
process.on('SIGTERM',()=>{console.log('SIGTERM: Close server'); clearInterval(gameLoopIntervalId); io.close(()=>{console.log('Socket.IO closed.');}); server.close(()=>{console.log('HTTP closed.'); process.exit(0);}); });
