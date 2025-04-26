// server/server.js - Refactored with Player Class (No Health Packs)
const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');

const app = express();
const server = http.createServer(app);

// --- Configuration ---
const CONFIG = { // Use similar config pattern on server
     PLAYER_DEFAULT_HEALTH: 100,
     PLAYER_RESPAWN_DELAY: 3500, // ms
     SERVER_BROADCAST_INTERVAL: 1000 / 15, // Target 15 updates per second
     PLAYER_MOVE_THRESHOLD_SQ: 0.01 * 0.01, // Only broadcast if moved more than 0.01 units squared
     MAX_PLAYERS: 20 // Example limit
};

const io = new Server(server, {
    cors: { origin: ["https://gorp627.github.io", "http://localhost:8080"], methods: ["GET", "POST"] }
});
const PORT = process.env.PORT || 3000;

// --- Game State ---
let players = {}; // { socket.id: Player instance }
let respawnTimeouts = {}; // Store respawn timeouts {playerId: timeoutId}

// --- Utility ---
function randomFloat(min, max) { return Math.random() * (max - min) + min; }

// --- Player Class (Server Side) ---
class Player {
    constructor(id, name = 'Player', phrase = 'blasted') { // Default values
        this.id = id; this.name = name; this.phrase = phrase;
        this.respawn();
        this.lastUpdateTime = Date.now();
        this.needsUpdate = true;
        console.log(`New Player: ${this.name} (${this.id})`);
    }
    updatePosition(data) { if(isNaN(data.x)||isNaN(data.y)||isNaN(data.z)||isNaN(data.rotationY))return false; const mSq=(data.x-this.x)**2+(data.y-this.y)**2+(data.z-this.z)**2; const r=Math.abs(data.rotationY-this.rotationY)>0.01; const c=mSq>CONFIG.PLAYER_MOVE_THRESHOLD_SQ||r; if(c){this.x=data.x;this.y=data.y;this.z=data.z;this.rotationY=data.rotationY;this.lastUpdateTime=Date.now();this.needsUpdate=true;} return c; }
    takeDamage(amount, shooter) { if(this.health<=0)return false; this.health=Math.max(0,this.health-amount); console.log(`${this.name} HP:${this.health}(<-${shooter.name})`); this.needsUpdate=true; const died=this.health<=0; if(died){console.log(`${this.name} K.O. by ${shooter.name}`);scheduleRespawn(this.id);} return died; }
    respawn() { this.health=CONFIG.PLAYER_DEFAULT_HEALTH;this.x=randomFloat(-10,10);this.y=0;this.z=randomFloat(-10,10);this.rotationY=0;this.needsUpdate=true;console.log(`${this.name} respawned.`); }
    getNetworkData() { return {id:this.id,x:this.x,y:this.y,z:this.z,r:this.rotationY,h:this.health};} // Lean data
    getFullData() { return {id:this.id,x:this.x,y:this.y,z:this.z,rotationY:this.rotationY,health:this.health,name:this.name,phrase:this.phrase};} // Full data
}

// --- Respawn Scheduling ---
function scheduleRespawn(pId) { if(respawnTimeouts[pId])clearTimeout(respawnTimeouts[pId]); respawnTimeouts[pId]=setTimeout(()=>{const p=players[pId];if(p){p.respawn();io.emit('playerRespawned',p.getFullData());} delete respawnTimeouts[pId];},CONFIG.PLAYER_RESPAWN_DELAY); }
// Function to broadcast player count
function broadcastPlayerCount() { const c=Object.keys(players).length;io.emit('playerCountUpdate',c);}

// --- Socket.IO Handling ---
io.on('connection', function(socket) {
    console.log(`Tentative Connect: ${socket.id}`); socket.emit('playerCountUpdate',Object.keys(players).length); socket.emit("ping",{m:`Ack ${socket.id}`});
    socket.on('setPlayerDetails',function(d){if(Object.keys(players).length>=CONFIG.MAX_PLAYERS){socket.emit('serverFull');socket.disconnect(true);return;}if(players[socket.id])return;const n=d.name?String(d.name).substring(0,16).trim():'Player';const p=d.phrase?String(d.phrase).substring(0,20).trim():'blasted';const fN=n===''? 'Player':n;const fP=p===''? 'blasted':p;console.log(`Joined: ${fN} (${socket.id})`);players[socket.id]=new Player(socket.id,fN,fP);let allPData={};for(const id in players)allPData[id]=players[id].getFullData();console.log(`-> Emit init ${socket.id}`);socket.emit('initialize',{id:socket.id,players:allPData});socket.broadcast.emit('playerJoined',players[socket.id].getFullData());broadcastPlayerCount();});
    socket.on('playerUpdate',function(d){const p=players[socket.id];if(p)p.updatePosition(d);});
    socket.on('shoot',function(d){const s=players[socket.id];if(!s||s.health<=0)return;socket.broadcast.emit('shotFired',{shooterId:socket.id,position:d.position,direction:d.direction,bulletId:socket.id+"_"+Date.now()});});
    socket.on('hit',function(d){const t=players[d.targetId],s=players[socket.id];if(t&&t.health>0&&s&&socket.id!==d.targetId){const died=t.takeDamage(d.damage||10,s);if(died){io.emit('playerDied',{targetId:d.targetId,killerId:s.id,killerName:s.name,killerPhrase:s.phrase});}else{io.emit('healthUpdate',{id:d.targetId,health:t.health});}}});
    socket.on('fellIntoVoid',function(){const p=players[socket.id];if(p&&p.health>0){p.health=0;console.log(`${p.name} fell`);io.emit('playerDied',{targetId:socket.id,killerId:null});scheduleRespawn(socket.id);}});
    socket.on('disconnect',function(r){const p=players[socket.id];if(p){console.log(`Disconnect: ${p.name}`);delete players[socket.id];if(respawnTimeouts[socket.id]){clearTimeout(respawnTimeouts[socket.id]);delete respawnTimeouts[socket.id];}io.emit('playerLeft',socket.id);broadcastPlayerCount();}else{console.log(`Unjoined ${socket.id} disconnected`);}});
});

// --- Game Loop (Server Side) ---
let lastBroadcastTime = 0; function serverGameLoop() { let stateUpdate={players:{}};let uGenerated=false; for(const id in players){if(players[id].needsUpdate){stateUpdate.players[id]=players[id].getNetworkData();players[id].needsUpdate=false;uGenerated=true;}} if(uGenerated){io.emit('gameStateUpdate',stateUpdate);lastBroadcastTime=Date.now();} } const gameLoopIntervalId=setInterval(serverGameLoop,CONFIG.SERVER_BROADCAST_INTERVAL);
// --- HTTP Server ---
app.get('/',function(req,res){const p=path.join(__dirname,'index.html');res.sendFile(p,function(err){if(err)res.status(200).send('Server OK');});});
// --- Start Server ---
server.listen(PORT,function(){console.log(`Server listening *:${PORT}`);});
// --- Graceful Shutdown ---
process.on('SIGTERM',()=>{console.log('SIGTERM: Close server');clearInterval(gameLoopIntervalId);io.close(()=>{});server.close(()=>{});});
