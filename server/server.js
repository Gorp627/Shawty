// /server/server.js
const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');

const app = express();
const server = http.createServer(app);
// Configure Socket.IO with CORS settings to allow connections from your Render frontend URL
// and potentially localhost for development.
const io = new Server(server, {
    cors: {
        origin: ["https://gametest-psxl.onrender.com", "http://localhost:8080"], // Allow your Render URL and localhost
        methods: ["GET", "POST"]
    }
});

// Define the port the server will listen on. Use the environment variable Render provides,
// or default to 3000 for local development.
const PORT = process.env.PORT || 3000;

// Serve static files from the 'docs' directory (where your client-side code lives)
// This makes it so accessing the server URL serves index.html
const clientPath = path.join(__dirname, '../docs');
console.log(`Serving static files from: ${clientPath}`);
app.use(express.static(clientPath));

// Basic connection tracking
let players = {}; // Store player data

// Handle new connections
io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

    // Store basic player info (we'll add more later)
    players[socket.id] = {
        id: socket.id,
        // Add position, rotation, character, name, etc. later
    };
    console.log("Current players:", Object.keys(players));


    // --- Join Log ---
    // Tell the new player their ID and the current list of players
    socket.emit('yourId', socket.id);
    socket.emit('currentPlayers', players); // Send existing players to the new player

    // Tell everyone else that a new player has joined (except the new player)
    socket.broadcast.emit('playerJoined', players[socket.id]); // Send only the new player's data


    // Handle disconnections
    socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.id}`);
        const disconnectedPlayer = players[socket.id]; // Get data before deleting
        delete players[socket.id];
        console.log("Current players:", Object.keys(players));
        // --- Leave Log ---
        // Tell everyone else that a player has left
        io.emit('playerLeft', socket.id, disconnectedPlayer?.name || 'Someone'); // Send ID and name if available
    });

    // --- Placeholder for future game logic ---
    // socket.on('playerMovement', (movementData) => { /* Handle movement */ });
    // socket.on('playerShoot', () => { /* Handle shooting */ });
    // socket.on('chatMessage', (msg) => { /* Handle chat */ });
    // socket.on('playerJoinRequest', (data) => { /* Handle name/character selection */ });

});

// Start the server
server.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});

// Basic Game Loop (Example - will be refined)
// setInterval(() => {
//     // Send game state updates to all clients
//     io.emit('gameState', { players /*, other game state */ });
// }, 1000 / 60); // ~60 times per second
