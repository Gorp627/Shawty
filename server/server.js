const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const PORT = process.env.PORT || 3000;

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*", // IMPORTANT: For production, restrict this to your GitHub Pages URL
        methods: ["GET", "POST"]
    }
});

let players = {}; // Stores player data { socket.id: { ...playerInfo } }
let playerScores = {}; // { socket.id: score }

const spawnPoints = [
    { x: -0.10692, y: 89.1166 + 1.5, z: 128.919 }, // Adjusted Y for player height
    { x: 25.3129,  y: 85.7254 + 1.5, z: 8.80901 },
    { x: 50.2203,  y: 39.8632 + 1.5, z: 203.312 },
];
const FALL_DEATH_Y = -20; // Y-coordinate threshold for falling death
const ROUND_DURATION = 5 * 60 * 1000; // 5 minutes
let roundTimer = ROUND_DURATION;
let roundIntervalId = null;
let gameActive = false;

function getRandomSpawnPoint() {
    return spawnPoints[Math.floor(Math.random() * spawnPoints.length)];
}

function broadcastPlayerCount() {
    io.emit('playerCount', Object.keys(players).length);
}

function getLeaderboardData() {
    return Object.entries(players).map(([id, player]) => ({
        id: id,
        name: player.name,
        score: playerScores[id] || 0
    })).sort((a, b) => b.score - a.score);
}

function broadcastLeaderboard() {
    io.emit('leaderboardUpdate', getLeaderboardData());
}

function startNewRound() {
    console.log("Starting new round...");
    gameActive = true;
    roundTimer = ROUND_DURATION;
    Object.keys(playerScores).forEach(id => playerScores[id] = 0); // Reset scores
    
    io.emit('roundStart', { duration: ROUND_DURATION, scores: playerScores });
    broadcastLeaderboard();

    if (roundIntervalId) clearInterval(roundIntervalId);
    roundIntervalId = setInterval(() => {
        if (!gameActive) {
            clearInterval(roundIntervalId);
            return;
        }
        roundTimer -= 1000;
        io.emit('roundTimerUpdate', roundTimer);

        if (roundTimer <= 0) {
            clearInterval(roundIntervalId);
            roundIntervalId = null;
            gameActive = false;
            io.emit('roundOver', getLeaderboardData());
            console.log("Round Over!");
            // TODO: Implement map voting system here
            // For now, automatically start a new round after a delay
            io.emit('systemMessage', "Round over! New round starting in 15 seconds...");
            setTimeout(startNewRound, 15000); 
        }
    }, 1000);
}


io.on('connection', (socket) => {
    console.log('User connected:', socket.id);
    broadcastPlayerCount();
    socket.emit('currentRoundTime', roundTimer); // Send current time to new joiner

    socket.on('joinGame', (data) => {
        const spawnPoint = getRandomSpawnPoint();
        players[socket.id] = {
            id: socket.id,
            name: data.name.substring(0, 15) || `Player${Math.floor(Math.random()*1000)}`,
            character: data.character || 'Shawty',
            position: spawnPoint,
            rotation: { x: 0, y: 0, z: 0, w: 1 }, // Quaternion for rotation
            velocity: { x: 0, y: 0, z: 0 }, // For physics based movement
            health: 100
        };
        playerScores[socket.id] = 0;

        socket.emit('gameJoined', {
            id: socket.id,
            players: players,
            spawnPoint: spawnPoint,
            initialScores: getLeaderboardData(),
            currentRoundTime: roundTimer,
            mapName: "city rooftops" // Current map
        });

        socket.broadcast.emit('playerJoined', { playerInfo: players[socket.id], score: 0 });
        io.emit('systemMessage', `${players[socket.id].name} joined the game.`);
        broadcastLeaderboard();
        broadcastPlayerCount();

        if (Object.keys(players).length > 0 && !gameActive && !roundIntervalId) {
             // If game is not active and no timer is running, start a new round
            io.emit('systemMessage', "First player joined! Starting round...");
            startNewRound();
        } else if (!gameActive && roundIntervalId) {
            // Game is in between rounds, tell player to wait
            socket.emit('systemMessage', "Round is currently over. New round starting soon.");
        }
    });

    socket.on('playerUpdate', (data) => {
        if (players[socket.id]) {
            players[socket.id].position = data.position;
            players[socket.id].rotation = data.rotation; // Expecting quaternion
            players[socket.id].velocity = data.velocity;

            if (data.position.y < FALL_DEATH_Y) {
                handlePlayerDeath(socket.id, "fell out of the world");
            } else {
                socket.broadcast.emit('playerMoved', players[socket.id]);
            }
        }
    });

    socket.on('shoot', (data) => { // data = { direction: {x,y,z}, ePressed: boolean }
        if (!players[socket.id] || !gameActive) return;

        // console.log(`${players[socket.id].name} shot. E pressed: ${data.ePressed}`);
        // Server-side raycasting for hit detection
        // This is a simplified version. A real implementation would use a physics engine or more complex math.
        const shooter = players[socket.id];
        let hitPlayerId = null;

        // Raycast logic (simplified)
        // In a real game, you'd use a 3D vector library and proper ray-object intersection tests.
        // This example just checks distance and general direction.
        for (const id in players) {
            if (id === socket.id) continue; // Don't shoot self
            const target = players[id];
            
            // Simple distance check
            const distance = Math.sqrt(
                Math.pow(shooter.position.x - target.position.x, 2) +
                Math.pow(shooter.position.y - target.position.y, 2) + // Consider player height
                Math.pow(shooter.position.z - target.position.z, 2)
            );

            if (distance < 200) { // Max shot range (adjust as needed)
                // Very basic "is target in front?" check - needs refinement with actual vectors
                // For now, assume a hit if client reports it (see 'clientHitReport' event)
                // This is where server authoritative hit detection would go.
            }
        }
        // For now, we rely on client to report hits, which is not secure.
        // socket.broadcast.emit('playerShotEffect', { shooterId: socket.id, position: shooter.position, direction: data.direction });


        if (data.ePressed) {
            // TODO: Implement server-side physics for gun propulsion.
            // This would apply an impulse to the shooter in the opposite direction of data.direction.
            // For now, we can just tell the client to simulate it.
            console.log(`Player ${socket.id} used propulsion shot.`);
            io.to(socket.id).emit('applyGunPropulsion', { direction: data.direction });
        }
    });
    
    socket.on('clientHitReport', (targetId) => {
        if (!players[socket.id] || !players[targetId] || !gameActive || socket.id === targetId) return;

        // Basic validation: are players alive, in game, etc.
        // More advanced: check weapon range, line of sight (server-side raycast here is best)
        console.log(`${players[socket.id].name} reported hit on ${players[targetId].name}`);
        handlePlayerDeath(targetId, players[socket.id].name, socket.id); // killerId
    });


    socket.on('chatMessage', (msgContent) => {
        if (players[socket.id] && msgContent.trim() !== "") {
            io.emit('chatMessage', { name: players[socket.id].name, message: msgContent.substring(0,100) });
        }
    });
    
    socket.on('playerDash', (data) => {
        if (players[socket.id]) {
            // Server could validate dash cooldowns or energy here
            socket.broadcast.emit('playerDashed', { id: socket.id, direction: data.direction });
        }
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        if (players[socket.id]) {
            io.emit('systemMessage', `${players[socket.id].name} left the game.`);
            socket.broadcast.emit('playerLeft', socket.id);
            delete players[socket.id];
            delete playerScores[socket.id];
        }
        broadcastLeaderboard();
        broadcastPlayerCount();

        if (Object.keys(players).length === 0 && gameActive) {
            console.log("All players left. Stopping round.");
            clearInterval(roundIntervalId);
            roundIntervalId = null;
            gameActive = false;
            // Reset timer for when new players join
            roundTimer = ROUND_DURATION;
        }
    });

    function handlePlayerDeath(deadPlayerId, reasonOrKillerName, killerId = null) {
        if (!players[deadPlayerId] || !gameActive) return; // Player already dead or game not active

        const deadPlayerName = players[deadPlayerId].name;
        const deadPlayerPosition = { ...players[deadPlayerId].position }; // Copy position before respawn

        let deathMessage;

        if (killerId && players[killerId] && killerId !== deadPlayerId) {
            playerScores[killerId] = (playerScores[killerId] || 0) + 1;
            deathMessage = `${players[killerId].name} eliminated ${deadPlayerName}`;
        } else if (killerId === deadPlayerId) { // Self-kill
             playerScores[killerId] = (playerScores[killerId] || 0) -1; // Penalty for self-kill
            deathMessage = `${deadPlayerName} played themselves.`;
        } else { // Environmental death or generic
            deathMessage = `${deadPlayerName} ${reasonOrKillerName}.`;
        }

        io.emit('deathLog', deathMessage);
        
        // Death explosion shockwave
        // TODO: Implement server-side physics to apply force to nearby players
        io.emit('playerDiedEffect', { 
            playerId: deadPlayerId, 
            position: deadPlayerPosition,
            shockwave: true // Signal to client to make a shockwave visual
        });

        const spawnPoint = getRandomSpawnPoint();
        players[deadPlayerId].position = spawnPoint;
        players[deadPlayerId].health = 100; // Reset health
        players[deadPlayerId].rotation = { x: 0, y: 0, z: 0, w: 1}; // Reset rotation
        
        io.to(deadPlayerId).emit('respawn', { spawnPoint: spawnPoint });
        // Notify all players of the respawned player's new state
        socket.broadcast.emit('playerRespawned', players[deadPlayerId]);
        
        broadcastLeaderboard();
        console.log(deathMessage);
    }
});

server.listen(PORT, () => {
    console.log(`Shawty Server listening on port ${PORT}`);
    console.log(`Connect client to: ${process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`}`);
    console.log(`User-provided Render server for client: https://gametest-psxl.onrender.com`);
});
