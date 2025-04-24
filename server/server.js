// server/server.js
const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path'); // Needed for serving the optional index.html

const app = express();
const server = http.createServer(app);

// --- Configuration ---
// Configure Socket.IO to allow connections from any origin.
// **SECURITY WARNING:** For a real production game, you MUST restrict the 'origin'
// to your specific GitHub Pages URL (e.g., "https://your-username.github.io")
// instead of "*" to prevent unauthorized connections.
const io = new Server(server, {
    cors: {
        origin: "*", // Allows connections from anywhere (like GitHub Pages) - BE CAREFUL!
        methods: ["GET", "POST"]
    }
});

// Use the port suggested by the hosting environment (like Render)
// or default to 3000 if running locally (though you mentioned no terminal).
const PORT = process.env.PORT || 3000;

// --- Game State ---
// This object will hold the data for all connected players.
// The key is the unique socket ID of the player.
let players = {};
// Example structure for a player:
// players[socket.id] = {
//   id: socket.id,
//   x: 0, y: 1, z: 0, // Position
//   rotationY: 0,    // Facing direction (Y-axis rotation)
//   health: 100
//   // Add other properties like score, current animation, etc. later
// };

// --- Socket.IO Connection Handling ---
// This function runs every time a new user connects to the server via WebSocket.
io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    // 1. Create a new player object when someone connects
    players[socket.id] = {
        id: socket.id,
        // Assign random starting position (adjust range as needed for your map)
        x: Math.random() * 10 - 5,
        y: 1, // Start slightly above ground (assuming ground is at y=0)
        z: Math.random() * 10 - 5,
        rotationY: 0, // Initial rotation
        health: 100
    };

    // 2. Send Initialization Data to the Newly Connected Player
    // - Send them their own unique ID.
    // - Send them the current state of all other players already in the game.
    socket.emit('initialize', { id: socket.id, players: players });

    // 3. Notify All Other Existing Players about the New Player
    //    Use socket.broadcast.emit to send to everyone *except* the new player.
    socket.broadcast.emit('playerJoined', players[socket.id]);

    // 4. Listen for Player Updates (Movement, Rotation)
    socket.on('playerUpdate', (playerData) => {
        // Update the player's data on the server
        const player = players[socket.id];
        if (player) {
            player.x = playerData.x;
            player.y = playerData.y; // You might only need X and Z if player stays on ground
            player.z = playerData.z;
            player.rotationY = playerData.rotationY;

            // Broadcast the updated data to all *other* players
            socket.broadcast.emit('playerMoved', player);
        }
    });

    // 5. Listen for 'shoot' events
    socket.on('shoot', (bulletData) => {
        // In this simple version, we just relay the shot info to all clients.
        // A more secure approach involves server-side validation and hit detection.
        console.log(`Player ${socket.id} fired a shot.`);
        io.emit('shotFired', { // Send to ALL clients, including the shooter
            shooterId: socket.id,
            position: bulletData.position,
            direction: bulletData.direction,
            bulletId: socket.id + "_" + Date.now() // Simple unique-ish ID
        });
    });

    // 6. Listen for 'hit' events (INSECURE - Relies on client reporting)
    //    A client tells the server "I hit player X". This is easily faked!
    socket.on('hit', (data) => {
        const { targetId, damage } = data;
        const shooterId = socket.id; // The player reporting the hit is the shooter

        const targetPlayer = players[targetId];
        if (targetPlayer) {
            targetPlayer.health -= damage;
            console.log(`Player ${targetId} hit by ${shooterId}. Health: ${targetPlayer.health}`);

            // Check if the player is defeated
            if (targetPlayer.health <= 0) {
                console.log(`Player ${targetId} defeated by ${shooterId}`);
                // Notify everyone about the death
                io.emit('playerDied', { targetId: targetId, killerId: shooterId });

                // Simple Respawn Logic: Reset health and position
                targetPlayer.health = 100;
                targetPlayer.x = Math.random() * 10 - 5;
                targetPlayer.y = 1;
                targetPlayer.z = Math.random() * 10 - 5;

                // Notify everyone about the respawn (including the new position/health)
                // Send the full player data so clients can reset them
                io.emit('playerRespawned', targetPlayer);

            } else {
                // Just broadcast the health update if not dead
                io.emit('healthUpdate', { id: targetId, health: targetPlayer.health });
            }
        }
    });

    // 7. Handle Disconnections
    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        // Remove the player from our players object
        if (players[socket.id]) {
            delete players[socket.id];
            // Notify all remaining players that this player has left
            io.emit('playerLeft', socket.id);
        }
    });
});

// --- Basic HTTP Server (Optional, but good practice) ---
// This serves a simple message if someone visits the server URL directly.
// It uses the 'path' module require()d at the top.
app.get('/', (req, res) => {
    // Try to send the index.html file located in the same directory (server/)
    res.sendFile(path.join(__dirname, 'index.html'), (err) => {
        if (err) {
            // If index.html doesn't exist or fails, send a plain text message
            res.send('Server is running. Connect via WebSocket.');
            console.log("Couldn't send index.html:", err.message);
        }
    });
});

// --- Start Server ---
server.listen(PORT, () => {
    console.log(`Server listening on *:${PORT}`);
    console.log(`Ensure your client connects to the correct URL (likely https://<your-render-app-name>.onrender.com)`);
});
