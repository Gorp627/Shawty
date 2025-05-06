// /server/server.js
const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: ["https://gametest-psxl.onrender.com", "http://localhost:8080", "http://localhost:3000"], // Added localhost:3000 if serving client locally
        methods: ["GET", "POST"]
    }
});

const PORT = process.env.PORT || 3000;

const clientPath = path.join(__dirname, '../docs');
console.log(`Serving static files from: ${clientPath}`);
app.use(express.static(clientPath));

// --- Game State ---
let players = {}; // Store richer player data: { id: { id, name, character, position, rotation, score, etc. } }
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
    const spawnPoint = spawnPoints[nextSpawnPointIndex];
    nextSpawnPointIndex = (nextSpawnPointIndex + 1) % spawnPoints.length; // Cycle through spawn points
    return spawnPoint;
}


// Handle new connections
io.on('connection', (socket) => {
    console.log(`User connecting: ${socket.id}`);

    // Don't add to players object immediately. Wait for join request.

    // 1. Tell the connecting client their ID
    socket.emit('yourId', socket.id);

    // --- Player Join Request ---
    socket.on('playerJoinRequest', (data) => {
        // Basic validation
        const name = data.name ? data.name.trim().slice(0, 16) : `Player_${socket.id.substring(0, 4)}`; // Max 16 chars, default name
        const character = data.character || 'Shawty1'; // Default character

        console.log(`Player join request: ${socket.id}, Name: ${name}, Character: ${character}`);

        // Check if player already exists (e.g., reconnect attempt - basic handling for now)
        if (players[socket.id]) {
            console.warn(`Player ${socket.id} trying to join again? Updating info.`);
            // Update existing data? Or force disconnect old? For now, just update.
            players[socket.id].name = name;
            players[socket.id].character = character;
        } else {
             // Determine spawn point
             const spawnPoint = getSpawnPoint();

            // 2. Store player data ON THE SERVER
            players[socket.id] = {
                id: socket.id,
                name: name,
                character: character,
                x: spawnPoint.x, // Add position
                y: spawnPoint.y,
                z: spawnPoint.z,
                rotationY: 0,   // Add rotation (example)
                score: 0,       // Add score
                // Add velocity, health, etc. later
            };
        }

        const newPlayerData = players[socket.id];
        console.log("Current players:", players);

        // 3. Send Initialization Data to the NEW Player
        // This includes their own data AND data of all *other* fully joined players
        const otherPlayers = { ...players };
        delete otherPlayers[socket.id]; // Don't send the new player their own data in this list

        socket.emit('initializeGame', {
            playerData: newPlayerData,    // Send the new player their own complete data
            currentPlayers: otherPlayers // Send data of players already in the game
        });

        // 4. Broadcast to ALL OTHER players that a new player has joined
        socket.broadcast.emit('playerJoined', newPlayerData); // Send the complete data of the new player

         // --- Join Log (Server Console) ---
         console.log(`${newPlayerData.name} (ID: ${socket.id}) joined the game.`);
         // We'll send chat messages from the server later for global logs

    });


    // Handle disconnections
    socket.on('disconnect', (reason) => {
        console.log(`User disconnected: ${socket.id}. Reason: ${reason}`);
        const disconnectedPlayer = players[socket.id]; // Get data before deleting

        if (disconnectedPlayer) {
            delete players[socket.id];
            console.log("Current players:", players);
            // --- Leave Log ---
            // Tell everyone else that a player has left
            io.emit('playerLeft', socket.id, disconnectedPlayer.name || 'Someone'); // Send ID and name
             console.log(`${disconnectedPlayer.name || 'Someone'} (ID: ${socket.id}) left the game.`);
        } else {
            console.log(`Player ${socket.id} disconnected but wasn't fully registered in 'players'.`);
        }
    });

    // --- Placeholder for future game logic ---
    // socket.on('playerMovement', (movementData) => { /* Handle movement */ });
    // socket.on('playerShoot', () => { /* Handle shooting */ });
    // socket.on('chatMessage', (msg) => { /* Handle chat */ });

});

// Start the server
server.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});

// Basic Game Loop (Example - will be refined for physics later)
// We might send updates less frequently or based on changes
// setInterval(() => {
//     // Send game state updates (e.g., positions of all players)
//     // This needs optimization - only send necessary data
//     io.emit('gameState', players);
// }, 1000 / 30); // Example: 30 times per second
