// server/server.js - Random Server X/Z Spawn, Client Verifies Height
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
    // Define bounds for random spawning slightly inside potential map edges
    SPAWN_AREA_X_MAX: 45.0, // Adjust based on client MAP_BOUNDS_X
    SPAWN_AREA_Z_MAX: 45.0, // Adjust based on client MAP_BOUNDS_Z
};
const io = new Server(server, { cors: { origin: ["https://gorp627.github.io", "http://localhost:8080"], methods: ["GET", "POST"] } });
const PORT = process.env.PORT || 3000;

// --- REMOVED SPAWN_POINTS Array ---

// --- Game State ---
let players = {}; let respawnTimeouts = {};

// --- Utility ---
function randomFloat(min, max) { return Math.random() * (max - min) + min; }
// randomInt no longer needed

// --- Player Class (Server Side) ---
class Player {
    constructor(id, name = 'Player', phrase = 'blasted') { this.id = id; this.name = name; this.phrase = phrase; this.respawn(); this.lastUpdateTime = Date.now(); this.needsUpdate = true; console.log(`New Player: ${this.name}`); }
    updatePosition(data) { if(this.health<=0)return!1;if(data==null||isNaN(data.x)||isNaN(data.y)||isNaN(data.z)||isNaN(data.rotationY))return!1;const mSq=(data.x-this.x)**2+(data.y-this.y)**2+(data.z-this.z)**2;const rCh=Math.abs(data.rotationY-this.rotationY)>0.01;const ch=mSq>(CONFIG.PLAYER_MOVE_THRESHOLD_SQ||1e-4)||rCh;if(ch){this.x=data.x;this.y=data.y;this.z=data.z;this.rotationY=data.rotationY;this.lastUpdateTime=Date.now();this.needsUpdate=!0;}return ch;}
    takeDamage(amount, killerInfo={id:null, name:'?', phrase:'elim'}) { if(this.health<=0)return!1;this.health=Math.max(0,this.health-amount);console.log(`${this.name} HP:${this.health}(<-${killerInfo.name||'?'})`);this.needsUpdate=!0;const died=this.health<=0;if(died){console.log(`${this.name} K.O.`);io.emit('playerDied',{targetId:this.id,killerId:killerInfo.id,killerName:killerInfo.name,killerPhrase:killerInfo.phrase});scheduleRespawn(this.id);}else{io.emit('healthUpdate',{id:this.id,health:this.health});}return died;}

    respawn() {
        this.health = CONFIG.PLAYER_DEFAULT_HEALTH;
        // <<< Generate random X/Z within bounds >>>
        const xMax = CONFIG.SPAWN_AREA_X_MAX || 45.0;
        const zMax = CONFIG.SPAWN_AREA_Z_MAX || 45.0;
        this.x = randomFloat(-xMax, xMax);
        this.y = 0; // Client determines actual spawn height
        this.z = randomFloat(-zMax, zMax);
        this.rotationY = randomFloat(0, Math.PI * 2);
        // <<< END CHANGE >>>
        this.needsUpdate = true;
        console.log(`${this.name} respawned -> sending server coords: ~${this.x.toFixed(1)},${this.y.toFixed(1)},${this.z.toFixed(1)}`);
    }

    getNetworkData() { return {id:this.id,x:this.x,y:this.y,z:this.z,r:this.rotationY,h:this.health};}
    getFullData() { return {id:this.id,x:this.x,y:this.y,z:this.z,rotationY:this.rotationY,health:this.health,name:this.name,phrase:this.phrase};}
}

// --- Respawn Scheduling ---
function scheduleRespawn(pId) { if(respawnTimeouts[pId])clearTimeout(respawnTimeouts[pId]); respawnTimeouts[pId]=setTimeout(()=>{const p=players[pId];if(p){p.respawn();io.emit('playerRespawned',p.getFullData());} delete respawnTimeouts[pId];},CONFIG.PLAYER_RESPAWN_DELAY||3500); }
function broadcastPlayerCount() { const c=Object.keys(players).length;io.emit('playerCountUpdate',c);}

// --- Socket.IO Handling ---
io.on('connection', function(socket) { console.log(`Tentative Connect: ${socket.id}`); socket.emit('playerCountUpdate',Object.keys(players).length); socket.emit("ping",{m:`Ack ${socket.id}`}); socket.on('setPlayerDetails',function(d){if(Object.keys(players).length>=CONFIG.MAX_PLAYERS){socket.emit('serverFull');socket.disconnect(true);return;}if(players[socket.id])return;const n=d?.name?String(d.name).substring(0,16).trim():'Player';const p=d?.phrase?String(d.phrase).substring(0,20).trim():'...';const fN=n===''? 'Player':n;const fP=p===''? '...':p;console.log(`Joined: ${fN} (${socket.id})`);players[socket.id]=new Player(socket.id,fN,fP);let allPData={};for(const id in players)allPData[id]=players[id].getFullData();console.log(`-> Emit init ${socket.id}`);socket.emit('initialize',{id:socket.id,players:allPData});socket.broadcast.emit('playerJoined',players[socket.id].getFullData());broadcastPlayerCount();}); socket.on('playerUpdate',function(d){const p=players[socket.id];if(p)p.updatePosition(d);}); socket.on('fellIntoVoid', function() { const p = players[socket.id]; if (p && p.health > 0) { console.log(`${p.name} reported void fall.`); p.takeDamage(9999, {id: null, name: "The Void", phrase: "consumed"}); }}); socket.on('disconnect',function(r){const p=players[socket.id];if(p){console.log(`Disconnect: ${p.name}`);delete players[socket.id];if(respawnTimeouts[socket.id]){clearTimeout(respawnTimeouts[socket.id]);delete respawnTimeouts[socket.id];}io.emit('playerLeft',socket.id);broadcastPlayerCount();}else{console.log(`Unjoined ${socket.id} disconnected`);}}); });

// --- Game Loop (Server Side) ---
let lastBroadcastTime = 0; function serverGameLoop() { let stateUpdate={players:{}};let uGen=false; for(const id in players){if(players[id].needsUpdate){stateUpdate.players[id]=players[id].getNetworkData();players[id].needsUpdate=false;uGen=true;}} if(uGen){io.emit('gameStateUpdate',stateUpdate);lastBroadcastTime=Date.now();} } const gameLoopIntervalId=setInterval(serverGameLoop,CONFIG.SERVER_BROADCAST_INTERVAL||66);
// --- HTTP Server ---
app.get('/', function(req, res) { const p = path.join(__dirname, '..', 'docs', 'index.html'); res.sendFile(p, function(err) { if (err) { console.error("Err sending index:", err); res.status(500).send('Server Error'); } }); }); app.use(express.static(path.join(__dirname, '..', 'docs')));
// --- Start Server ---
server.listen(PORT,function(){console.log(`Server listening *:${PORT}`);});
// --- Graceful Shutdown ---
process.on('SIGTERM',()=>{console.log('SIGTERM: Close');clearInterval(gameLoopIntervalId);io.close(()=>{});server.close(()=>{process.exit(0);});});
