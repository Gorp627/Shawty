const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*", // Allow all origins for simplicity, restrict in production
        methods: ["GET", "POST"]
    }
});

const PORT = process.env.PORT || 3000;

let players = {};
let chatMessages = [];
const MAX_CHAT_MESSAGES = 50;

const GAME_SETTINGS = {
    ROUND_DURATION: 5 * 60 * 1000, // 5 minutes in milliseconds
    VOID_Y_THRESHOLD: -50, // Y-coordinate for falling out of map
    MAPS: [
        { name: "city rooftops", assetPath: "assets/maps/the first map!.glb", spawnPoints: [
            { x: -0.10692, y: 89.1166 + 1.5, z: 128.919 }, // Increased Y for spawn safety
            { x: 25.3129,  y: 85.7254 + 1.5, z: 8.80901 },
            { x: 50.2203,  y: 39.8632 + 1.5, z: 203.312 },
        ]}
        // Add more maps here
    ],
    CHARACTERS: [
        { name: "Shawty", modelPath: "assets/maps/Shawty1.glb" }
        // Add more characters here
    ]
};

let currentMap = GAME_SETTINGS.MAPS[0];
let roundTimer = GAME_SETTINGS.ROUND_DURATION;
let roundIntervalId = null;
let gameActive = false;

function getRandomSpawnPoint() {
    const spawnPoints = currentMap.spawnPoints;
    return spawnPoints[Math.floor(Math.random() * spawnPoints.length)];
}

function resetPlayerStats(player) {
    player.kills = 0;
    player.deaths = 0;
    player.health = 100;
    const spawnPoint = getRandomSpawnPoint();
    player.position = spawnPoint;
    player.rotation = { x: 0, y: 0, z: 0, w: 1 }; // Quaternion
    player.velocity = { x: 0, y: 0, z: 0 };
}

function startRound() {
    console.log("Starting new round on map:", currentMap.name);
    gameActive = true;
    roundTimer = GAME_SETTINGS.ROUND_DURATION;

    Object.values(players).forEach(player => {
        resetPlayerStats(player);
        io.to(player.id).emit('playerRespawn', {
            playerId: player.id,
            position: player.position,
            health: player.health
        });
    });
    
    io.emit('roundStart', { mapName: currentMap.name, duration: GAME_SETTINGS.ROUND_DURATION, players: players });
    io.emit('systemMessage', `Round started on ${currentMap.name}! ${GAME_SETTINGS.ROUND_DURATION / 60000} minutes.`);

    if (roundIntervalId) clearInterval(roundIntervalId);
    roundIntervalId = setInterval(() => {
        roundTimer -= 1000;
        io.emit('timerUpdate', roundTimer);
        if (roundTimer <= 0) {
            endRound();
        }
    }, 1000);
}

function endRound() {
    console.log("Round ended.");
    gameActive = false;
    if (roundIntervalId) clearInterval(roundIntervalId);
    roundIntervalId = null;

    const leaderboard = Object.values(players)
        .map(p => ({ name: p.name, kills: p.kills, deaths: p.deaths }))
        .sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);

    io.emit('roundEnd', { leaderboard });
    io.emit('systemMessage', `Round over! Winner: ${leaderboard.length > 0 ? leaderboard[0].name : 'N/A'}`);

    // For now, restart round on same map after a delay
    setTimeout(() => {
        if (Object.keys(players).length > 0) {
             startRound(); // Implement map voting later
        } else {
            console.log("No players online, waiting for players to start a new round.");
        }
    }, 10000); // 10 second delay before next round / map vote
}


io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);
    socket.emit('availableCharacters', GAME_SETTINGS.CHARACTERS.map(c => c.name));
    socket.emit('currentMap', currentMap); // Send current map info
    socket.emit('chatHistory', chatMessages); // Send recent chat history
    
    if (Object.keys(players).length > 0 && !gameActive) { // If game was inactive and new player joins
        console.log("Player joined, starting game if conditions met.");
        // Delay slightly to allow player to load
        setTimeout(() => {
            if (!gameActive && Object.keys(players).length > 0) startRound();
        }, 2000);
    }


    socket.on('joinGame', (data) => {
        const spawnPoint = getRandomSpawnPoint();
        players[socket.id] = {
            id: socket.id,
            name: data.name || 'Player ' + socket.id.substring(0,4),
            character: data.character || GAME_SETTINGS.CHARACTERS[0].name,
            modelPath: GAME_SETTINGS.CHARACTERS.find(c => c.name === (data.character || GAME_SETTINGS.CHARACTERS[0].name))?.modelPath || GAME_SETTINGS.CHARACTERS[0].modelPath,
            position: spawnPoint,
            rotation: { x: 0, y: 0, z: 0, w: 1 }, // Assuming quaternion
            velocity: { x: 0, y: 0, z: 0 },
            health: 100,
            kills: 0,
            deaths: 0,
            isDashing: false,
            isShooting: false
        };
        console.log(`${players[socket.id].name} joined as ${players[socket.id].character}.`);

        socket.emit('gameJoined', {
            playerId: socket.id,
            initialPlayers: players,
            spawnPoint: spawnPoint,
            currentMap: currentMap,
            gameSettings: { VOID_Y_THRESHOLD: GAME_SETTINGS.VOID_Y_THRESHOLD }
        });
        
        socket.broadcast.emit('playerJoined', players[socket.id]);
        io.emit('playerCount', Object.keys(players).length);
        io.emit('systemMessage', `${players[socket.id].name} joined the game.`);

        // Start round if not already active and there's at least one player
        if (!gameActive && Object.keys(players).length > 0) {
            startRound();
        } else if (gameActive) {
            // If game is active, send current round state to new player
            socket.emit('roundStart', { mapName: currentMap.name, duration: roundTimer, players: players });
             // Send individual respawn for the new player to place them correctly
            socket.emit('playerRespawn', {
                playerId: socket.id,
                position: players[socket.id].position,
                health: players[socket.id].health
            });
        }
    });

    socket.on('playerUpdate', (data) => {
        if (players[socket.id]) {
            players[socket.id].position = data.position;
            players[socket.id].rotation = data.rotation;
            players[socket.id].velocity = data.velocity; // For other clients' prediction/interpolation
            players[socket.id].isDashing = data.isDashing;
            players[socket.id].isShooting = data.isShooting; // For animation sync

            // Broadcast update to other players
            socket.broadcast.emit('playerMoved', {
                id: socket.id,
                position: data.position,
                rotation: data.rotation,
                velocity: data.velocity,
                isDashing: data.isDashing,
                isShooting: data.isShooting
            });

            // Check for falling out of map
            if (data.position.y < GAME_SETTINGS.VOID_Y_THRESHOLD && players[socket.id].health > 0) {
                console.log(`${players[socket.id].name} fell out of the map.`);
                handlePlayerDeath(socket.id, null, "fell into the void"); // No killer
            }
        }
    });

    socket.on('shoot', (data) => { // data: { direction: {x,y,z}, E_pressed: boolean }
        if (players[socket.id] && gameActive && players[socket.id].health > 0) {
            // Server-side hit detection (simple raycast or trust client for now)
            // For simplicity, we'll let clients determine hits and report them via 'playerHit'
            // But server broadcasts the shot for effects
            console.log(`${players[socket.id].name} shot. E_Pressed: ${data.E_pressed}`);
            socket.broadcast.emit('shotFired', {
                shooterId: socket.id,
                origin: players[socket.id].position, // Approx. gun position from player
                direction: data.direction,
                E_pressed: data.E_pressed // For gun propulsion effect on shooter
            });

            // If E was pressed, server tells shooter client to apply recoil
            if (data.E_pressed) {
                socket.emit('applyGunRecoil', { direction: data.direction });
            }
        }
    });
    
    socket.on('playerHit', (data) => { // data: { victimId: string, damage: number }
        if (!gameActive || !players[socket.id] || !players[data.victimId]) return;
        if (players[socket.id].health <= 0 || players[data.victimId].health <= 0) return; // Attacker or victim already dead

        // Basic validation: prevent self-damage from this event for now, or add team logic
        if (data.victimId === socket.id) return;

        players[data.victimId].health -= data.damage;
        console.log(`${players[socket.id].name} hit ${players[data.victimId].name}. ${players[data.victimId].name} health: ${players[data.victimId].health}`);

        if (players[data.victimId].health <= 0) {
            players[data.victimId].health = 0; // Cap health at 0
            handlePlayerDeath(data.victimId, socket.id, `${players[socket.id].name} killed ${players[data.victimId].name}`);
        } else {
            io.emit('playerDamaged', { victimId: data.victimId, attackerId: socket.id, health: players[data.victimId].health });
        }
    });

    function handlePlayerDeath(victimId, killerId, reason) {
        if (!players[victimId] || players[victimId].health > 0 && reason !== "fell into the void") { // Allow void death even if health > 0
             // This check might be too strict if health was just reduced to 0.
             // If reason is "fell into the void", health might not be 0 yet.
        }
        if (players[victimId] && players[victimId].health <= 0 || reason === "fell into the void") { // Check if already processed or truly dead
            // If health is already 0 from a previous hit, don't process again unless it's a new type of death like void.
            // This logic needs careful review to avoid double processing or missed deaths.
            // For now, assume this is the first processing of this death event.
        }


        const victim = players[victimId];
        if (!victim) return;
        
        // Ensure health is 0 if not already (e.g. for void death)
        victim.health = 0;
        victim.deaths++;

        let killerName = "Environment";
        if (killerId && players[killerId]) {
            players[killerId].kills++;
            killerName = players[killerId].name;
        }
        
        const deathMessage = killerId ? `${players[killerId].name} eliminated ${victim.name}.` : `${victim.name} ${reason || 'was eliminated.'}`;
        console.log(deathMessage);
        io.emit('systemMessage', deathMessage);

        io.emit('playerDied', {
            victimId: victimId,
            killerId: killerId,
            deathPosition: victim.position, // For shockwave origin
            victimName: victim.name,
            killerName: killerName,
            updatedScores: { // Send updated scores for immediate leaderboard update
                [victimId]: { kills: victim.kills, deaths: victim.deaths },
                ...(killerId && players[killerId] && { [killerId]: { kills: players[killerId].kills, deaths: players[killerId].deaths } })
            }
        });
        
        // Respawn logic
        setTimeout(() => {
            if (players[victimId]) { // Check if player hasn't disconnected
                resetPlayerStats(players[victimId]);
                io.to(victimId).emit('playerRespawn', {
                    playerId: victimId,
                    position: players[victimId].position,
                    health: players[victimId].health
                });
                // Also notify other players about the respawned player's new state
                io.emit('playerJoined', players[victimId]); // Re-use playerJoined or create a specific respawn update
                console.log(`${victim.name} respawned.`);
            }
        }, 3000); // 3 second respawn delay
    }

    socket.on('chatMessage', (msg) => {
        if (players[socket.id]) {
            const messageData = {
                name: players[socket.id].name,
                text: msg.substring(0, 100) // Limit message length
            };
            chatMessages.push(messageData);
            if (chatMessages.length > MAX_CHAT_MESSAGES) {
                chatMessages.shift();
            }
            io.emit('newChatMessage', messageData);
        }
    });
    
    socket.on('playerDash', (data) => { // data can include dash direction if needed
        if (players[socket.id]) {
            // Server can validate dash (e.g., cooldown)
            // For now, just relay for effects or state sync
            socket.broadcast.emit('playerDashed', { id: socket.id });
        }
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        if (players[socket.id]) {
            io.emit('systemMessage', `${players[socket.id].name} left the game.`);
            delete players[socket.id];
            io.emit('playerLeft', socket.id);
            io.emit('playerCount', Object.keys(players).length);

            if (Object.keys(players).length === 0 && gameActive) {
                console.log("All players left. Ending round.");
                endRound(); // Or pause game, clear timer etc.
                gameActive = false;
                if(roundIntervalId) clearInterval(roundIntervalId);
                roundIntervalId = null;
            }
        }
    });
});

server.listen(PORT, () => {
    console.log(`Shawty game server listening on *:${PORT}`);
    console.log(`Make sure your client connects to this server address, e.g., ws://localhost:${PORT} or your Render URL.`);
});
