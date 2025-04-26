// server/server.js - Refactored with Player Class (No Guns/Hits, Server Void Check)
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
    VOID_Y_LEVEL: -40 // Y level below which players are considered fallen
};
const io = new Server(server, { cors: { origin: ["https://gorp627.github.io", "http://localhost:8080"], methods: ["GET", "POST"] } });
const PORT = process.env.PORT || 3000;

// --- Game State ---
let players = {}; let respawnTimeouts = {};

// --- Utility ---
function randomFloat(min, max) { return Math.random() * (max - min) + min; }

// --- Player Class (Server Side) ---
class Player {
    constructor(id, name = 'Player', phrase = 'blasted') { this.id = id; this.name = name; this.phrase = phrase; this.respawn(); this.lastUpdateTime = Date.now(); this.needsUpdate = true; console.log(`New Player: ${this.name} (${this.id})`); }

    updatePosition(data) {
        if (this.health <= 0) return false; // Don't update dead players' positions
        if (isNaN(data.x) || isNaN(data.y) || isNaN(data.z) || isNaN(data.rotationY)) return false;

        const mSq = (data.x - this.x) ** 2 + (data.y - this.y) ** 2 + (data.z - this.z) ** 2;
        const rChanged = Math.abs(data.rotationY - this.rotationY) > 0.01;
        const changed = mSq > CONFIG.PLAYER_MOVE_THRESHOLD_SQ || rChanged;

        if (changed) {
            this.x = data.x; this.y = data.y; this.z = data.z; this.rotationY = data.rotationY;
            this.lastUpdateTime = Date.now(); this.needsUpdate = true;

            // Check for void AFTER updating position
            if (this.y < CONFIG.VOID_Y_LEVEL) {
                 this.handleVoidFall();
                 return true; // Position changed, but player died
            }
        }
        return changed;
    }

    takeDamage(amount, killerInfo = {id: null, name: 'Unknown', phrase: 'eliminated'}) { // killerInfo obj expected
        if(this.health <= 0) return false; // Already dead
        this.health = Math.max(0, this.health - amount);
        console.log(`${this.name} HP:${this.health} (Attacker: ${killerInfo.name || killerInfo.id || 'Unknown'})`);
        this.needsUpdate = true; // Health changed, needs broadcast
        const died = this.health <= 0;
        if (died) {
            console.log(`${this.name} K.O. by ${killerInfo.name || killerInfo.id}`);
            // Emit death event with killer details
            io.emit('playerDied', { targetId: this.id, killerId: killerInfo.id, killerName: killerInfo.name, killerPhrase: killerInfo.phrase });
            scheduleRespawn(this.id);
        } else {
             // Just broadcast health update if not dead
             io.emit('healthUpdate', { id: this.id, health: this.health });
        }
        return died;
    }

    handleVoidFall() {
        if (this.health <= 0) return; // Already dead or handling
        console.log(`${this.name} fell into the void.`);
        this.health = 0;
        this.needsUpdate = true; // Ensure health=0 is sent
        // Emit death event - killerId is null for environment/void death
        io.emit('playerDied', { targetId: this.id, killerId: null, killerName: null, killerPhrase: null });
        scheduleRespawn(this.id);
    }

    respawn() {
        this.health = CONFIG.PLAYER_DEFAULT_HEALTH;
        this.x = randomFloat(-10, 10);
        this.y = 0; // <<< CHANGED FROM 5 to 0 (Spawn feet at ground level)
        this.z = randomFloat(-10, 10);
        this.rotationY = 0;
        this.needsUpdate = true;
        console.log(`${this.name} respawned at y=${this.y}.`);
    }
    getNetworkData() { return {id:this.id,x:this.x,y:this.y,z:this.z,r:this.rotationY,h:this.health};} // Lean data for frequent updates
    getFullData() { return {id:this.id,x:this.x,y:this.y,z:this.z,rotationY:this.rotationY,health:this.health,name:this.name,phrase:this.phrase};} // Full data for init/join/respawn
}

// --- Respawn Scheduling ---
function scheduleRespawn(pId) { if(respawnTimeouts[pId])clearTimeout(respawnTimeouts[pId]); respawnTimeouts[pId]=setTimeout(()=>{const p=players[pId];if(p){p.respawn();io.emit('playerRespawned',p.getFullData());} delete respawnTimeouts[pId];},CONFIG.PLAYER_RESPAWN_DELAY); }
function broadcastPlayerCount() { const c=Object.keys(players).length;io.emit('playerCountUpdate',c);}

// --- Socket.IO Handling ---
io.on('connection', function(socket) {
    console.log(`Tentative Connect: ${socket.id}`); socket.emit('playerCountUpdate',Object.keys(players).length); socket.emit("ping",{m:`Ack ${socket.id}`});
    socket.on('setPlayerDetails',function(d){if(Object.keys(players).length>=CONFIG.MAX_PLAYERS){socket.emit('serverFull');socket.disconnect(true);return;}if(players[socket.id])return;const n=d.name?String(d.name).substring(0,16).trim():'Player';const p=d.phrase?String(d.phrase).substring(0,20).trim():'...';const fN=n===''? 'Player':n;const fP=p===''? '...':p;console.log(`Joined: ${fN} (${socket.id})`);players[socket.id]=new Player(socket.id,fN,fP);let allPData={};for(const id in players)allPData[id]=players[id].getFullData();console.log(`-> Emit init ${socket.id}`);socket.emit('initialize',{id:socket.id,players:allPData});socket.broadcast.emit('playerJoined',players[socket.id].getFullData());broadcastPlayerCount();});
    socket.on('playerUpdate',function(d){const p=players[socket.id];if(p)p.updatePosition(d);});
    // socket.on('shoot', ... ); // REMOVED - No shooting
    // socket.on('hit', ... ); // REMOVED - No hitting
    // socket.on('fellIntoVoid', ...); // REMOVED - Server detects void now
    socket.on('disconnect',function(r){const p=players[socket.id];if(p){console.log(`Disconnect: ${p.name}`);delete players[socket.id];if(respawnTimeouts[socket.id]){clearTimeout(respawnTimeouts[socket.id]);delete respawnTimeouts[socket.id];}io.emit('playerLeft',socket.id);broadcastPlayerCount();}else{console.log(`Unjoined ${socket.id} disconnected`);}});
});

// --- Game Loop (Server Side) ---
let lastBroadcastTime = 0; function serverGameLoop() { let stateUpdate={players:{}};let uGen=false; for(const id in players){const player = players[id];if(player.needsUpdate){stateUpdate.players[id]=player.getNetworkData();player.needsUpdate=false;uGen=true;}} if(uGen){io.emit('gameStateUpdate',stateUpdate);lastBroadcastTime=Date.now();} } const gameLoopIntervalId=setInterval(serverGameLoop,CONFIG.SERVER_BROADCAST_INTERVAL);
// --- HTTP Server ---
// Serve index.html from the docs folder relative to server.js location
app.get('/', function(req, res) {
    const p = path.join(__dirname, '..', 'docs', 'index.html'); // Assumes server is in 'server/' and docs is '../docs/'
    res.sendFile(p, function(err) {
        if (err) {
            console.error("Error sending index.html:", err);
            res.status(500).send('Server Error or index.html not found');
        } else {
            // console.log("Sent index.html"); // Optional success log
        }
    });
});
// Serve static files (CSS, JS, assets) from docs folder
app.use(express.static(path.join(__dirname, '..', 'docs')));
// --- Start Server ---
server.listen(PORT,function(){console.log(`Server listening *:${PORT}`);});
// --- Graceful Shutdown ---
process.on('SIGTERM',()=>{console.log('SIGTERM: Close server');clearInterval(gameLoopIntervalId);io.close(()=>{console.log('Socket.IO closed.');});server.close(()=>{console.log('HTTP server closed.');process.exit(0);});});
