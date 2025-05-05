// server/game.js
const Player = require('./player');

const SPAWN_POINTS = [
    { x: -0.10692, y: 89.1166 + 1.5, z: 128.919 }, // Added slight Y offset for spawning above ground
    { x: 25.3129,  y: 85.7254 + 1.5, z: 8.80901 },
    { x: 50.2203,  y: 39.8632 + 1.5, z: 203.312 },
];
let spawnIndex = 0;

class Game {
    constructor() {
        this.players = {}; // Store players by socket.id
    }

    addPlayer(socketId, name) {
        const spawnPoint = SPAWN_POINTS[spawnIndex % SPAWN_POINTS.length];
        spawnIndex++;
        const player = new Player(socketId, name);
        player.position = { ...spawnPoint }; // Assign a spawn point
        this.players[socketId] = player;
        console.log(`Player ${player.name} (${socketId}) joined. Spawned at`, spawnPoint);
        return player;
    }

    removePlayer(socketId) {
        if (this.players[socketId]) {
            console.log(`Player ${this.players[socketId].name} (${socketId}) left.`);
            delete this.players[socketId];
        }
    }

    getPlayer(socketId) {
        return this.players[socketId];
    }

    // Update player state received from client
    updatePlayerState(socketId, data) {
        const player = this.players[socketId];
        if (player) {
            // Basic anti-cheat: Clamp position changes or velocity if needed
            player.position = data.position;
            player.rotation = data.rotation;
            // player.velocity = data.velocity; // If client sends velocity
            // player.isGrounded = data.isGrounded; // If client sends ground state
        }
    }

    // Handle player shooting
    handleShoot(shooterId) {
        const shooter = this.players[shooterId];
        if (!shooter || shooter.health <= 0) return null; // Can't shoot if dead

        console.log(`Player ${shooter.name} shot.`);
        // TODO: Implement server-side hit detection (raycasting)
        // For now, just return the shooter's ID for broadcasting
        return { shooterId: shooterId };
    }

    // Handle player death and trigger shockwave logic
    handleDeath(playerId, deathPosition) {
        const deadPlayer = this.players[playerId];
        if (!deadPlayer) return null;

        console.log(`Player ${deadPlayer.name} died.`);
        // Don't remove player immediately, just mark as dead or handle respawn timer
        // deadPlayer.health = 0; // Mark as dead

        const shockwaveRadius = 20; // Example radius
        const shockwaveForce = 30;  // Example force magnitude
        const affectedPlayers = [];

        for (const otherId in this.players) {
            if (otherId === playerId) continue; // Don't affect self
            const otherPlayer = this.players[otherId];
            if (otherPlayer.health <= 0) continue; // Don't affect other dead players

            const dx = otherPlayer.position.x - deathPosition.x;
            const dy = otherPlayer.position.y - deathPosition.y;
            const dz = otherPlayer.position.z - deathPosition.z;
            const distance = Math.sqrt(dx*dx + dy*dy + dz*dz);

            if (distance < shockwaveRadius && distance > 0.1) { // Check if within radius
                const knockbackDir = { x: dx / distance, y: dy / distance, z: dz / distance };
                // Simple knockback application - client needs to handle this smoothly
                 affectedPlayers.push({
                    id: otherId,
                    knockback: {
                        x: knockbackDir.x * shockwaveForce,
                        y: knockbackDir.y * shockwaveForce * 0.5 + 5, // Add some upward force
                        z: knockbackDir.z * shockwaveForce
                    }
                });
                console.log(`Player ${otherPlayer.name} affected by shockwave`);
            }
        }

        return { deadPlayerId: playerId, position: deathPosition, affectedPlayers };
    }

     // Get a random spawn point for respawning
    getSpawnPoint() {
        return SPAWN_POINTS[Math.floor(Math.random() * SPAWN_POINTS.length)];
    }


    // Get state needed for new players or regular updates
    getGameState() {
        // Send only necessary data to clients
        const simplePlayers = {};
        for (const id in this.players) {
            const p = this.players[id];
            simplePlayers[id] = {
                id: p.id,
                name: p.name,
                model: p.model,
                position: p.position,
                rotation: p.rotation,
                health: p.health // Send health
                // Don't send velocity unless needed client-side for prediction
            };
        }
        return simplePlayers;
    }
}

module.exports = Game;
