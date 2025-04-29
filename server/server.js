// server.js
import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import path from 'path'; // Import path module

const PORT = process.env.PORT || 3000; // Use Render's port or 3000 for local dev

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*", // Allow connections from anywhere (adjust for security in production)
        methods: ["GET", "POST"]
    }
});

// --- Game State ---
let players = {}; // Store player data { socketId: { position, rotation, id, ... } }

const spawnPoints = [
    { x: -5.21592, y: 39.8632, z: 55.1608 },
    { x: 0,        y: 90,      z: 128 },
    { x: 50,       y: 40,      z: 203 },
    { x: -66,      y: 44,      z: 97 },
    { x: 25,       y: 86,      z: 9 },
    { x: -87,      y: 27,      z: 43 },
];

function getRandomSpawnPoint() {
    return spawnPoints[Math.floor(Math.random() * spawnPoints.length)];
}

// --- Socket.IO Logic ---
io.on('connection', (socket) => {
    console.log(`Player connected: ${socket.id}`);

    // --- Player Initialization ---
    const initialSpawn = getRandomSpawnPoint();
    players[socket.id] = {
        id: socket.id,
        position: initialSpawn,
        rotation: { x: 0, y: 0, z: 0 }, // Initial rotation
        health: 100, // Example health
        // Add other necessary states: velocity, animation state etc. if needed server-side
    };

    // Send the new player their ID and initial state
    socket.emit('initialize', { id: socket.id, initialState: players[socket.id], allPlayers: players });

    // Send the new player's info to all *other* connected players
    socket.broadcast.emit('playerJoined', players[socket.id]);

    // --- Player Updates ---
    socket.on('playerUpdate', (data) => {
        if (players[socket.id]) {
            players[socket.id].position = data.position;
            players[socket.id].rotation = data.rotation;
            // TODO: Add server-side validation if needed

            // Broadcast update to other players
            socket.broadcast.emit('playerMoved', { id: socket.id, position: data.position, rotation: data.rotation });
        }
    });

    // --- Shooting ---
    socket.on('shoot', (data) => {
        // data might include: direction, origin
        console.log(`Player ${socket.id} shot`);
        // Broadcast the shot event to others (for effects like tracers, sound)
        socket.broadcast.emit('playerShot', { shooterId: socket.id, origin: data.origin, direction: data.direction });
        // Server-side hit detection would go here if authoritative
    });

     // --- Player Actions (Jump, Dash) ---
     socket.on('action', (actionData) => {
        // actionData = { type: 'jump' | 'dash' | 'rocketJump' }
        if (players[socket.id]) {
            console.log(`Player ${socket.id} performed action: ${actionData.type}`);
             // Broadcast action to others for potential animation/effect syncing
            socket.broadcast.emit('playerAction', { id: socket.id, type: actionData.type });
        }
    });

    // --- Hit Detection (Client-Authoritative - Simple Approach) ---
    // A client reports that it hit another player
    socket.on('playerHit', (data) => {
        // data = { targetId: string, damage: number }
        const targetPlayer = players[data.targetId];
        const shooterPlayer = players[socket.id];

        if (targetPlayer && shooterPlayer && targetPlayer.health > 0) {
            console.log(`Player ${socket.id} hit ${data.targetId} for ${data.damage} damage.`);
            targetPlayer.health -= data.damage;

            if (targetPlayer.health <= 0) {
                console.log(`Player ${data.targetId} died.`);
                targetPlayer.health = 0; // Ensure health doesn't go negative

                // Notify all clients about the death
                const deathPosition = targetPlayer.position; // Position where explosion should occur
                io.emit('playerDied', { victimId: data.targetId, killerId: socket.id, position: deathPosition });

                // Schedule respawn
                setTimeout(() => {
                    if (players[data.targetId]) { // Check if player hasn't disconnected
                        const respawnPoint = getRandomSpawnPoint();
                        players[data.targetId].position = respawnPoint;
                        players[data.targetId].health = 100; // Reset health
                        console.log(`Player ${data.targetId} respawned.`);
                        io.emit('playerRespawned', { id: data.targetId, position: respawnPoint });
                    }
                }, 3000); // 3 second respawn delay
            } else {
                 // Notify clients about the hit (optional, e.g., for hit markers)
                 io.to(data.targetId).emit('wasHit', { damage: data.damage, shooterId: socket.id }); // Notify victim
                 io.to(socket.id).emit('confirmedHit', { targetId: data.targetId }); // Notify shooter
            }
        }
    });

    // --- Player Disconnect ---
    socket.on('disconnect', () => {
        console.log(`Player disconnected: ${socket.id}`);
        const disconnectPosition = players[socket.id]?.position; // Get position before deleting
        delete players[socket.id];
        // Notify other players
        socket.broadcast.emit('playerLeft', {id: socket.id, position: disconnectPosition}); // Send position if needed for effects
    });
});

// --- Basic HTTP Route (Optional - Good for checking if server is up) ---
// app.get('/', (req, res) => {
//     res.send('Game Server is Running!');
// });
// If you *were* serving files from Node (not GH Pages), you'd use express.static here:
// const __dirname = path.dirname(new URL(import.meta.url).pathname); // For ES modules
// app.use(express.static(path.join(__dirname, 'docs')));


// --- Start Server ---
server.listen(PORT, () => {
    console.log(`Server listening on *:${PORT}`);
});
