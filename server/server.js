const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const path = require('path');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Enable CORS for all routes
app.use(cors());

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Game state
const gameState = {
  players: {},
  bullets: {},
  currentRound: {
    startTime: Date.now(),
    endTime: Date.now() + 5 * 60 * 1000, // 5 minutes
    scores: {}
  },
  maps: ['city rooftops'],
  currentMap: 'city rooftops',
  mapVotes: {}
};

// Game constants
const ROUND_DURATION = 5 * 60 * 1000; // 5 minutes in milliseconds

// Helper functions
function getRandomSpawnPoint() {
  const spawnPoints = [
    { x: -0.10692, y: 89.1166 + 0.5, z: 128.919 },
    { x: 25.3129, y: 85.7254 + 0.5, z: 8.80901 },
    { x: 50.2203, y: 39.8632 + 0.5, z: 203.312 }
  ];
  return spawnPoints[Math.floor(Math.random() * spawnPoints.length)];
}

function startNewRound() {
  // Calculate winner of previous round
  let winner = null;
  let highestScore = -1;
  
  for (const [playerId, score] of Object.entries(gameState.currentRound.scores)) {
    if (score > highestScore && gameState.players[playerId]) {
      highestScore = score;
      winner = gameState.players[playerId].name;
    }
  }
  
  // Determine the next map based on votes
  let nextMap = gameState.currentMap;
  let mapVoteCounts = {};
  
  for (const map of gameState.maps) {
    mapVoteCounts[map] = 0;
  }
  
  for (const [, mapVote] of Object.entries(gameState.mapVotes)) {
    if (mapVoteCounts[mapVote] !== undefined) {
      mapVoteCounts[mapVote]++;
    }
  }
  
  let highestVoteCount = -1;
  for (const [map, voteCount] of Object.entries(mapVoteCounts)) {
    if (voteCount > highestVoteCount) {
      highestVoteCount = voteCount;
      nextMap = map;
    }
  }
  
  // Reset round state
  gameState.currentRound = {
    startTime: Date.now(),
    endTime: Date.now() + ROUND_DURATION,
    scores: {}
  };
  
  gameState.currentMap = nextMap;
  gameState.mapVotes = {};
  gameState.bullets = {};
  
  // Respawn all players
  for (const playerId in gameState.players) {
    const spawnPoint = getRandomSpawnPoint();
    gameState.players[playerId].position = { ...spawnPoint };
    gameState.players[playerId].health = 100;
    gameState.players[playerId].isAlive = true;
    gameState.currentRound.scores[playerId] = 0;
  }
  
  // Broadcast round end and new round
  io.emit('roundEnd', { 
    winner: winner ? `${winner} wins with ${highestScore} kills!` : 'No winner this round',
    nextMap: nextMap,
    countdown: 3
  });
  
  setTimeout(() => {
    io.emit('newRound', { 
      map: nextMap,
      startTime: gameState.currentRound.startTime,
      endTime: gameState.currentRound.endTime
    });
  }, 3000);
}

// Check if round should end
function checkRoundEnd() {
  if (Date.now() >= gameState.currentRound.endTime) {
    startNewRound();
  }
}

// Set interval to check round end
setInterval(checkRoundEnd, 1000);

// Socket connection handler
io.on('connection', (socket) => {
  console.log('New client connected:', socket.id);
  
  // Join game
  socket.on('joinGame', (data) => {
    console.log(`Player ${data.name} (${socket.id}) joined the game`);
    
    const spawnPoint = getRandomSpawnPoint();
    
    // Add player to game state
    gameState.players[socket.id] = {
      id: socket.id,
      name: data.name,
      character: data.character || 'Shawty',
      position: { ...spawnPoint },
      rotation: { x: 0, y: 0, z: 0 },
      velocity: { x: 0, y: 0, z: 0 },
      health: 100,
      isAlive: true,
      lastShot: 0
    };
    
    // Add player to current round scores
    gameState.currentRound.scores[socket.id] = 0;
    
    // Send current game state to joining player
    socket.emit('gameState', {
      players: gameState.players,
      bullets: gameState.bullets,
      currentRound: gameState.currentRound,
      maps: gameState.maps,
      currentMap: gameState.currentMap,
      playerId: socket.id
    });
    
    // Broadcast join message to all players
    io.emit('playerJoined', {
      id: socket.id,
      name: data.name,
      character: data.character || 'Shawty',
      position: gameState.players[socket.id].position,
      rotation: gameState.players[socket.id].rotation,
      message: `${data.name} joined the game`
    });
  });
  
  // Player movement update
  socket.on('playerUpdate', (data) => {
    if (gameState.players[socket.id]) {
      gameState.players[socket.id].position = data.position || gameState.players[socket.id].position;
      gameState.players[socket.id].rotation = data.rotation || gameState.players[socket.id].rotation;
      gameState.players[socket.id].velocity = data.velocity || gameState.players[socket.id].velocity;
      
      // Broadcast updated position to other players
      socket.broadcast.emit('playerMoved', {
        id: socket.id,
        position: gameState.players[socket.id].position,
        rotation: gameState.players[socket.id].rotation,
        velocity: gameState.players[socket.id].velocity
      });
    }
  });
  
  // Player shoots
  socket.on('playerShoot', (data) => {
    if (!gameState.players[socket.id] || !gameState.players[socket.id].isAlive) return;
    
    const now = Date.now();
    const cooldown = 250; // 250ms cooldown between shots
    
    if (now - gameState.players[socket.id].lastShot < cooldown) return;
    
    gameState.players[socket.id].lastShot = now;
    
    const bulletId = `bullet_${socket.id}_${now}`;
    
    // Add bullet to game state
    gameState.bullets[bulletId] = {
      id: bulletId,
      ownerId: socket.id,
      position: { ...data.position },
      direction: { ...data.direction },
      speed: 1.5,
      createdAt: now,
      lifespan: 3000 // Bullet lives for 3 seconds
    };
    
    // If recoil jump (E key pressed), apply force to player
    if (data.recoilJump) {
      const recoilForce = 10;
      gameState.players[socket.id].velocity.x -= data.direction.x * recoilForce;
      gameState.players[socket.id].velocity.y += 5; // Extra upward boost
      gameState.players[socket.id].velocity.z -= data.direction.z * recoilForce;
    }
    
    // Broadcast bullet creation to all players
    io.emit('bulletCreated', {
      bullet: gameState.bullets[bulletId],
      playerName: gameState.players[socket.id].name
    });
  });
  
  // Player hit by bullet
  socket.on('playerHit', (data) => {
    const { playerId, bulletId, damage } = data;
    const bullet = gameState.bullets[bulletId];
    
    if (!bullet || !gameState.players[playerId] || !gameState.players[playerId].isAlive) return;
    
    const shooterId = bullet.ownerId;
    
    // Remove bullet
    delete gameState.bullets[bulletId];
    
    // Apply damage
    gameState.players[playerId].health -= damage;
    
    // Check if player died
    if (gameState.players[playerId].health <= 0) {
      gameState.players[playerId].isAlive = false;
      
      // Update score for the shooter
      if (gameState.players[shooterId] && gameState.currentRound.scores[shooterId] !== undefined) {
        gameState.currentRound.scores[shooterId]++;
      }
      
      // Broadcast death to all players
      io.emit('playerDied', {
        victimId: playerId,
        victimName: gameState.players[playerId].name,
        killerId: shooterId,
        killerName: gameState.players[shooterId] ? gameState.players[shooterId].name : 'Unknown',
        position: gameState.players[playerId].position
      });
      
      // Respawn player after 3 seconds
      setTimeout(() => {
        if (gameState.players[playerId]) {
          const spawnPoint = getRandomSpawnPoint();
          gameState.players[playerId].position = { ...spawnPoint };
          gameState.players[playerId].health = 100;
          gameState.players[playerId].isAlive = true;
          
          // Notify about respawn
          io.emit('playerRespawned', {
            id: playerId,
            name: gameState.players[playerId].name,
            position: spawnPoint
          });
        }
      }, 3000);
    } else {
      // Just notify about damage
      socket.emit('healthUpdate', {
        health: gameState.players[playerId].health
      });
    }
  });
  
  // Chat message
  socket.on('chatMessage', (data) => {
    if (gameState.players[socket.id]) {
      // Broadcast message to all players
      io.emit('chatMessage', {
        playerId: socket.id,
        playerName: gameState.players[socket.id].name,
        message: data.message
      });
    }
  });
  
  // Map vote
  socket.on('mapVote', (data) => {
    if (gameState.players[socket.id] && gameState.maps.includes(data.map)) {
      gameState.mapVotes[socket.id] = data.map;
      
      // Broadcast vote to all players
      io.emit('playerVoted', {
        playerName: gameState.players[socket.id].name,
        map: data.map
      });
    }
  });
  
  // Disconnect handler
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
    
    if (gameState.players[socket.id]) {
      const playerName = gameState.players[socket.id].name;
      
      // Remove player from game state
      delete gameState.players[socket.id];
      delete gameState.currentRound.scores[socket.id];
      delete gameState.mapVotes[socket.id];
      
      // Broadcast disconnect message
      io.emit('playerLeft', {
        id: socket.id,
        name: playerName,
        message: `${playerName} left the game`
      });
    }
  });
});

// Bullet management (update positions, check collisions, remove expired bullets)
function updateBullets() {
  const now = Date.now();
  const bulletsToRemove = [];
  
  // Update bullet positions and check for expired bullets
  for (const bulletId in gameState.bullets) {
    const bullet = gameState.bullets[bulletId];
    
    // Update bullet position
    bullet.position.x += bullet.direction.x * bullet.speed;
    bullet.position.y += bullet.direction.y * bullet.speed;
    bullet.position.z += bullet.direction.z * bullet.speed;
    
    // Check if bullet has expired
    if (now - bullet.createdAt > bullet.lifespan) {
      bulletsToRemove.push(bulletId);
    }
  }
  
  // Remove expired bullets
  for (const bulletId of bulletsToRemove) {
    delete gameState.bullets[bulletId];
  }
  
  if (bulletsToRemove.length > 0) {
    io.emit('bulletsRemoved', bulletsToRemove);
  }
}

// Update bullets at regular intervals
setInterval(updateBullets, 16); // ~60 updates per second

// Send game state updates to all players
function broadcastGameState() {
  io.emit('gameStateUpdate', {
    players: gameState.players,
    currentRound: {
      timeRemaining: Math.max(0, gameState.currentRound.endTime - Date.now()),
      scores: gameState.currentRound.scores
    }
  });
}

// Broadcast game state updates at regular intervals
setInterval(broadcastGameState, 1000); // Send updates every second

// Define routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start the server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
