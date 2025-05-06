// server/Game.js
import * as CANNON from 'cannon-es';
import { PlayerServer } from './PlayerServer.js';
// import { loadMapPhysics } from './mapLoader.js'; // You'll need to create this

const TICK_RATE = 60; // Game ticks per second
const ROUND_DURATION = 5 * 60 * 1000; // 5 minutes in milliseconds
const VOID_Y_THRESHOLD = -50; // Y-coordinate for falling out of map

export class Game {
    constructor(io) {
        this.io = io;
        this.players = new Map();
        this.spawnPoints = [
            { x: -0.10692, y: 89.1166 + 1.5, z: 128.919 },
            { x: 25.3129, y: 85.7254 + 1.5, z: 8.80901 },
            { x: 50.2203, y: 39.8632 + 1.5, z: 203.312 },
        ];
        this.currentSpawnIndex = 0;

        this.mapData = { name: "city rooftops", assetPath: "docs/assets/maps/the first map!.glb" }; // Current map

        this.roundTimer = ROUND_DURATION;
        this.isRoundOver = false;
        this.gameLoopInterval = null;

        // Physics World
        this.world = new CANNON.World();
        this.world.gravity.set(0, -19.62, 0); // Stronger gravity
        this.world.broadphase = new CANNON.SAPBroadphase(this.world); // More performant broadphase
        // this.world.solver.iterations = 10; // Default is 10, can adjust for performance/accuracy

        this.mapPhysicsBody = null; // Will hold the map's static physics body
        this.initializeMapPhysics(); // Simplified for now
    }

    initializeMapPhysics() {
        // TODO: This is a placeholder. You need to load the GLB, extract geometry,
        // and create a CANNON.Trimesh. This is complex.
        // For now, let's add a large ground plane for basic testing.
        const groundShape = new CANNON.Plane();
        const groundBody = new CANNON.Body({ mass: 0 }); // mass 0 makes it static
        groundBody.addShape(groundShape);
        groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0); // Rotate to be horizontal
        groundBody.position.set(0, 0, 0); // Adjust Y if your map isn't at Y=0
        this.world.addBody(groundBody);
        this.mapPhysicsBody = groundBody;
        console.log("Basic ground plane added to physics world.");
        // loadMapPhysics(this.mapData.assetPath, this.world).then(body => {
        //     this.mapPhysicsBody = body;
        //     console.log("Map physics loaded.");
        // }).catch(err => console.error("Failed to load map physics:", err));
    }


    getSpawnPoint() {
        const spawnPoint = this.spawnPoints[this.currentSpawnIndex];
        this.currentSpawnIndex = (this.currentSpawnIndex + 1) % this.spawnPoints.length;
        return spawnPoint;
    }

    addPlayer(socket, name, character) {
        const spawnPosition = this.getSpawnPoint();
        const player = new PlayerServer(socket.id, name, character, spawnPosition);
        this.world.addBody(player.body);
        this.players.set(socket.id, player);

        socket.emit('gameJoined', {
            playerId: player.id,
            initialState: player.getState(),
            mapInfo: this.mapData,
            spawnPoints: this.spawnPoints, // Send all spawn points
            allPlayers: Array.from(this.players.values()).map(p => p.getState())
        });

        socket.broadcast.emit('playerJoined', player.getState());
        this.io.emit('chatMessage', { system: true, message: `${name} joined the game.` });
        this.updateOnlinePlayerCount();

        return player;
    }

    removePlayer(socketId) {
        const player = this.players.get(socketId);
        if (player) {
            this.world.removeBody(player.body);
            this.players.delete(socketId);
            this.io.emit('playerLeft', socketId);
            this.io.emit('chatMessage', { system: true, message: `${player.name} left the game.` });
            this.updateOnlinePlayerCount();
        }
    }

    handlePlayerInput(socketId, inputData) {
        const player = this.players.get(socketId);
        if (player) {
            player.input = { ...player.input, ...inputData.keys };
            player.rotation = inputData.rotation; // Update player's view rotation
        }
    }
    
    handleShoot(socketId, { direction, position, isPropelShot }) {
        const shooter = this.players.get(socketId);
        if (!shooter || Date.now() - shooter.lastShootTime < 300) return; // Cooldown
        shooter.lastShootTime = Date.now();

        this.io.emit('playerShot', { shooterId: socketId, position, direction, isPropelShot }); // Visuals + sound on client

        // Server-side Raycast for Hit Detection
        const rayFrom = new CANNON.Vec3(position.x, position.y, position.z);
        const rayTo = new CANNON.Vec3(
            position.x + direction.x * 1000, // Long ray
            position.y + direction.y * 1000,
            position.z + direction.z * 1000
        );

        const result = new CANNON.RaycastResult();
        // Important: Filter out the shooter's own body from raycast
        const options = {
            collisionFilterMask: -1, // Collide with everything
            skipBackfaces: true,
             // collisionFilterGroup: 1, // Assuming players are in group 1
        };
        
        // Make sure the shooter's body is temporarily not part of the raycast target
        const originalCollisionGroup = shooter.body.collisionFilterGroup;
        const originalCollisionMask = shooter.body.collisionFilterMask;
        shooter.body.collisionFilterGroup = 0; // Put shooter in a group that doesn't collide with the ray
        shooter.body.collisionFilterMask = 0;


        this.world.raycastClosest(rayFrom, rayTo, options, result);

        // Restore shooter's collision properties
        shooter.body.collisionFilterGroup = originalCollisionGroup;
        shooter.body.collisionFilterMask = originalCollisionMask;


        if (result.hasHit) {
            const hitBody = result.body;
            const hitPlayer = Array.from(this.players.values()).find(p => p.body.id === hitBody.id);

            if (hitPlayer && hitPlayer.id !== shooter.id) {
                const died = hitPlayer.takeDamage(25, this.world, this); // 25 damage per shot
                this.io.emit('playerHit', { 
                    targetId: hitPlayer.id, 
                    newHealth: hitPlayer.health,
                    hitPosition: {x: result.hitPointWorld.x, y: result.hitPointWorld.y, z: result.hitPointWorld.z }
                });

                if (died) {
                    shooter.kills++;
                    hitPlayer.deaths++;
                    this.handlePlayerDeath(hitPlayer, shooter);
                }
            }
        }

        // Gun Propulsion (E key)
        if (isPropelShot) {
            const propulsionForce = 40; // Adjust as needed
            const impulse = new CANNON.Vec3(-direction.x, -direction.y, -direction.z).scale(propulsionForce);
            shooter.body.applyImpulse(impulse, shooter.body.position);
        }
    }

    handlePlayerDeath(deadPlayer, killer) {
        this.io.emit('playerDied', {
            playerId: deadPlayer.id,
            killerId: killer ? killer.id : null,
            killerName: killer ? killer.name : "the void",
            position: deadPlayer.body.position, // For explosion effect
        });
        this.io.emit('chatMessage', { system: true, message: `${deadPlayer.name} was killed by ${killer ? killer.name : "falling into the void"}.` });

        // Shockwave effect
        const shockwaveRadius = 15;
        const shockwaveForce = 100;
        this.players.forEach(p => {
            if (p.id !== deadPlayer.id) {
                const distanceVec = p.body.position.vsub(deadPlayer.body.position);
                const distance = distanceVec.length();
                if (distance < shockwaveRadius && distance > 0.1) {
                    const pushDirection = distanceVec.unit();
                    const impulseMagnitude = shockwaveForce * (1 - (distance / shockwaveRadius)); // Force decreases with distance
                    p.body.applyImpulse(pushDirection.scale(impulseMagnitude), p.body.position);
                }
            }
        });
        
        // Respawn logic
        setTimeout(() => {
            this.respawnPlayer(deadPlayer);
        }, 3000); // 3 second respawn delay
    }

    respawnPlayer(player) {
        if (!this.players.has(player.id)) return; // Player might have disconnected

        player.health = 100;
        const spawnPosition = this.getSpawnPoint();
        player.body.position.set(spawnPosition.x, spawnPosition.y, spawnPosition.z);
        player.body.velocity.set(0, 0, 0);
        player.body.angularVelocity.set(0, 0, 0);
        player.body.quaternion.set(0,0,0,1); // Reset rotation
        player.rotation = { y:0, x:0 };


        this.io.to(player.id).emit('respawn', player.getState());
        this.io.emit('playerUpdate', player.getState()); // Notify others of respawn
    }


    updateOnlinePlayerCount() {
        this.io.emit('onlinePlayerCount', this.players.size);
    }

    startGameLoop() {
        if (this.gameLoopInterval) clearInterval(this.gameLoopInterval);

        let lastTime = Date.now();
        this.gameLoopInterval = setInterval(() => {
            const currentTime = Date.now();
            const deltaTime = (currentTime - lastTime) / 1000; // Delta time in seconds
            lastTime = currentTime;

            this.update(deltaTime);

            if (!this.isRoundOver) {
                this.roundTimer -= (1000 / TICK_RATE);
                if (this.roundTimer <= 0) {
                    this.endRound();
                }
            }
        }, 1000 / TICK_RATE);
        console.log("Game loop started.");
    }

    update(deltaTime) {
        // 1. Process Inputs & Update Player Physics States
        this.players.forEach(player => {
            player.applyInput(this.world);
            player.update(this.world); // For checks like isGrounded

            // Fall out of map check
            if (player.body.position.y < VOID_Y_THRESHOLD && player.health > 0) {
                player.takeDamage(1000, this.world, this); // Instakill
                this.handlePlayerDeath(player, null); // null killer for void death
            }
        });

        // 2. Step Physics World
        this.world.step(1 / TICK_RATE, deltaTime, 3); // Fixed timestep, deltaTime, maxSubSteps

        // 3. Collect Game State
        const playerStates = [];
        this.players.forEach(player => {
            playerStates.push(player.getState());
        });

        // 4. Broadcast Game State
        this.io.emit('gameStateUpdate', {
            players: playerStates,
            roundTime: Math.max(0, Math.floor(this.roundTimer / 1000)),
        });

        // Leaderboard data (can be sent less frequently or on request)
        // For now, send with game state, but consider a separate message for 'L' key press
        const leaderboard = Array.from(this.players.values())
            .map(p => ({ id: p.id, name: p.name, kills: p.kills, deaths: p.deaths }))
            .sort((a, b) => b.kills - a.kills || a.deaths - b.deaths); // Sort by kills, then by fewer deaths
        this.io.emit('leaderboardUpdate', leaderboard);
    }


    endRound() {
        this.isRoundOver = true;
        // Determine winner
        let winner = null;
        let maxKills = -1;
        Array.from(this.players.values()).forEach(p => {
            if (p.kills > maxKills) {
                maxKills = p.kills;
                winner = p;
            } else if (p.kills === maxKills && winner && p.deaths < winner.deaths) {
                winner = p; // Tie-breaker: fewer deaths
            }
        });

        this.io.emit('roundOver', {
            winner: winner ? winner.getState() : null,
            leaderboard: Array.from(this.players.values()).map(p => ({ name: p.name, kills: p.kills, deaths: p.deaths }))
        });
        this.io.emit('chatMessage', { system: true, message: `Round over! ${winner ? winner.name + ' wins!' : 'It\'s a draw!'}` });

        // Reset for next round (simplified - map voting would go here)
        setTimeout(() => {
            this.startNewRound();
        }, 10000); // 10 second delay before new round
    }

    startNewRound() {
        this.roundTimer = ROUND_DURATION;
        this.isRoundOver = false;
        this.players.forEach(player => {
            player.kills = 0;
            player.deaths = 0;
            this.respawnPlayer(player); // Reset positions and health
        });
        this.io.emit('newRoundStarting', { mapInfo: this.mapData }); // Inform clients
        this.io.emit('chatMessage', { system: true, message: `New round starting on ${this.mapData.name}!` });

    }

    stopGameLoop() {
        if (this.gameLoopInterval) {
            clearInterval(this.gameLoopInterval);
            this.gameLoopInterval = null;
        }
    }
}
