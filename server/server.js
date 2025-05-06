// /server/server.js
const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: ["https://gametest-psxl.onrender.com", "http://localhost:8080", "http://localhost:3000"], // Allow Render, common local dev ports
        methods: ["GET", "POST"]
    }
});

const PORT = process.env.PORT || 3000;

// Serve static files from the 'docs' directory
const clientPath = path.join(__dirname, '../docs');
console.log(`Serving static files from: ${clientPath}`);
app.use(express.static(clientPath));

// --- Game State ---
let players = {}; // Store richer player data: { id: { id, name, character, x, y, z, rotationY, score, etc. } }

// Define initial spawn points (Example - replace with actual coordinates later)
const spawnPoints = [
    { x: 0, y: 2, z: 0 },
    { x: 5, y: 2, z: 5 },
    { x: -5, y: 2, z: -5 },
    { x: 5, y: 2, z: -5 },
    { x: -5, y: 2, z: 5 },
];
let nextSpawnPointIndex = 0;

// Function to get the next spawn point
function getSpawnPoint() {
    // Basic cycle spawn for now
    const spawnPoint = spawnPoints[nextSpawnPointIndex];
    nextSpawnPointIndex = (nextSpawnPointIndex + 1) % spawnPoints.length;
    // Add a small random offset to prevent exact stacking at spawn
    spawnPoint.x += (Math.random() - 0.5) * 0.5;
    spawnPoint.z += (Math.random() - 0.5) * 0.5;
    return spawnPoint;
}

// --- Socket.IO Connection Handling ---
io.on('connection', (socket) => {
    console.log(`User connecting: ${socket.id}`);

    // 1. Tell the connecting client their ID immediately
    socket.emit('yourId', socket.id);

    // --- Player Join Request ---
    socket.on('playerJoinRequest', (data) => {
        // Basic validation/sanitization
        const name = data.name ? data.name.trim().slice(0, 16) : `Player_${socket.id.substring(0, 4)}`; // Max 16 chars, default name
        const character = data.character || 'Shawty1'; // Default character if none provided

        console.log(`Player join request: ${socket.id}, Name: ${name}, Character: ${character}`);

        // Check if player already exists (e.g., reconnect attempt, page refresh)
        if (players[socket.id]) {
            console.warn(`Player ${socket.id} (${name}) trying to join again? Updating info.`);
            // Just update name/character, keep existing score/position? Or respawn? For now, update.
            players[socket.id].name = name;
            players[socket.id].character = character;
            // Optional: Send an update about the name change?
        } else {
             // Determine spawn point for new player
             const spawnPoint = getSpawnPoint();

            // 2. Store NEW player data ON THE SERVER
            players[socket.id] = {
                id: socket.id,
                name: name,
                character: character,
                x: spawnPoint.x,
                y: spawnPoint.y,
                z: spawnPoint.z,
                rotationY: Math.random() * Math.PI * 2, // Random initial facing direction
                score: 0,
                // Add velocity, health, physics body etc. later
            };
        }

        const joinedPlayerData = players[socket.id]; // Get the data we just created/updated

        console.log("Current players:", Object.keys(players).length, players);

        // 3. Send Initialization Data back to the JOINING Player
        // This includes their own complete data AND data of all *other* players
        const otherPlayersData = {};
        for (const id in players) {
            if (id !== socket.id) {
                otherPlayersData[id] = players[id];
            }
        }

        socket.emit('initializeGame', {
            playerData: joinedPlayerData,       // Send the joining player their own confirmed data
            currentPlayers: otherPlayersData    // Send data of players already in the game
        });

        // 4. Broadcast to ALL OTHER sockets that a new player has joined
        // Send the complete data of the new player so others can display them
        socket.broadcast.emit('playerJoined', joinedPlayerData);

         // --- Join Log (Server Console & In-Game Chat) ---
         const joinMessage = `${joinedPlayerData.name} joined the game.`;
         console.log(joinMessage);
         // Broadcast as a system message to chat (implement chat message emit below)
         io.emit('chatMessage', 'server', 'System', joinMessage); // Send to all clients including sender

    });

    // --- Chat Message Handling ---
    socket.on('chatMessage', (message) => {
        const sender = players[socket.id];
        if (!sender) {
            console.warn(`Chat message from unknown socket ID: ${socket.id}`);
            return; // Ignore messages from sockets not fully joined
        }
        // Basic validation/sanitization
        const cleanMessage = message ? message.toString().trim().slice(0, 100) : ''; // Max 100 chars
        if (!cleanMessage) {
            return; // Ignore empty messages
        }

        console.log(`Chat from ${sender.name}: ${cleanMessage}`);
        // Broadcast the message to ALL connected clients, including the sender
        io.emit('chatMessage', sender.id, sender.name, cleanMessage);
    });


    // --- Handle Disconnections ---
    socket.on('disconnect', (reason) => {
        console.log(`User disconnected: ${socket.id}. Reason: ${reason}`);
        const disconnectedPlayer = players[socket.id]; // Get player data before deleting

        if (disconnectedPlayer) {
            const playerName = disconnectedPlayer.name || 'Someone';
            delete players[socket.id]; // Remove player from server state
            console.log("Current players:", Object.keys(players).length, players);

            // --- Leave Log ---
            const leaveMessage = `${playerName} left the game.`;
            console.log(leaveMessage);
            // Broadcast to everyone else that the player has left
            io.emit('playerLeft', socket.id, playerName); // Send ID and name for client removal
            // Send leave message to chat
            io.emit('chatMessage', 'server', 'System', leaveMessage);

        } else {
            // This might happen if someone connects but closes tab before sending playerJoinRequest
            console.log(`Socket ${socket.id} disconnected but wasn't fully registered in 'players'. No leave message sent.`);
        }
    });

    // --- Placeholder for future game logic ---
    // socket.on('playerMovement', (movementData) => { /* Handle movement physics/broadcast */ });
    // socket.on('playerShoot', (shootData) => { /* Handle shooting logic */ });
    // socket.on('playerUpdate', (updateData) => { /* More generic update */ });

});

// --- Start the Server ---
server.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
    console.log(`Frontend should be available at http://localhost:${PORT} (if testing locally) or your Render URL`);
});

// --- Basic Game Loop (Example - will be more physics-driven later) ---
// We might need a loop for server-side physics updates or periodic state sync
// setInterval(() => {
//     // Example: Apply gravity, check collisions (using Cannon-es on server)
//     // ... physics world step ...

//     // Collect updated positions/rotations
//     const gameState = {};
//     for (const id in players) {
//         // Get updated state from physics body associated with player[id]
//         // gameState[id] = { x: players[id].physicsBody.position.x, ... };
//     }

//     // Broadcast the relevant parts of the game state
//     // Needs optimization: send only changed data, use binary formats?
//     if (Object.keys(gameState).length > 0) {
//          io.emit('gameStateUpdate', gameState);
//     }
// }, 1000 / 60); // ~60 times per second for physics? Maybe less for network updates.
