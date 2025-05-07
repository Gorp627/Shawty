const WebSocket = require('ws');
const CANNON = require('cannon-es');
const { v4: uuidv4 } = require('uuid');

const PORT = process.env.PORT || 3000;
const wss = new WebSocket.Server({ port: PORT });

const TICK_RATE = 30; // Updates per second
const ROUND_DURATION = 5 * 60 * 1000; // 5 minutes
const VOID_Y_THRESHOLD = -100; // Y-coordinate for falling out
const PLAYER_HEALTH_MAX = 100;
const PLAYER_MOVE_SPEED = 5;
const PLAYER_JUMP_IMPULSE = 700; // Adjusted impulse
const PLAYER_DASH_IMPULSE = 1200;
const PLAYER_DASH_COOLDOWN = 2000; // ms
const GUN_PROPEL_FORCE = 4000;
const SHOT_COOLDOWN = 300; //ms between shots
const SHOT_DAMAGE = 34; // 3 shots to kill
const DEATH_SHOCKWAVE_RADIUS = 15;
const DEATH_SHOCKWAVE_FORCE = 7000; // Stronger impulse

const spawnPoints = [
    { x: -0.10692, y: 89.1166 + 1.5, z: 128.919 },
    { x: 25.3129,  y: 85.7254 + 1.5, z: 8.80901 },
    { x: 50.2203,  y: 39.8632 + 1.5, z: 203.312 },
];

let players = {}; // { id: { ws, name, character, health, kills, deaths, physicsBody, input, lastShotTime, lastDashTime, isDead, position, rotation } }
let gameTimeLeft = ROUND_DURATION;
let roundInProgress = false;
let killLog = []; // { killer, victim, method, timestamp }
let roundTimerInterval = null;

// Server-side Physics World
const world = new CANNON.World();
world.gravity.set(0, -25, 0); // Adjusted gravity
world.broadphase = new CANNON.SAPBroadphase(world); // Better performance
world.solver.iterations = 10;

// Material for players (low friction, some restitution)
const playerMaterial = new CANNON.Material("playerMaterial");
playerMaterial.friction = 0.1;
playerMaterial.restitution = 0.1;

// Add a basic ground plane for physics. In a real game, this would be complex map geometry.
// This plane is mostly for server-side sanity for players falling.
// Client will handle detailed map collision visually.
const groundShape = new CANNON.Plane();
const groundBody = new CANNON.Body({ mass: 0, material: new CANNON.Material({friction: 0.3, restitution: 0.1}) });
groundBody.addShape(groundShape);
groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
groundBody.position.set(0, 0, 0); // Adjust Y if your map's "floor" is elsewhere
world.addBody(groundBody);


console.log(`Shawty Server starting on port ${PORT}...`);
if (process.env.RENDER_EXTERNAL_URL) {
    console.log(`Server will be accessible at wss://${process.env.RENDER_EXTERNAL_URL.replace(/^https?:\/\//, '')}`);
}


wss.on('connection', (ws) => {
    const playerId = uuidv4();
    console.log(`Player ${playerId.substring(0,8)} connected.`);

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);

            if (!players[playerId] && data.type !== 'join') {
                 console.warn(`Player ${playerId.substring(0,8)} sent message before join: ${data.type}`);
                 return; // Ignore messages until player has joined
            }

            switch (data.type) {
                case 'join':
                    handlePlayerJoin(ws, playerId, data);
                    break;
                case 'input':
                    if (players[playerId] && !players[playerId].isDead) {
                        players[playerId].input = data.state;
                        players[playerId].rotation = data.rotation; // Client sends camera quaternion
                    }
                    break;
                case 'shoot':
                    if (players[playerId] && !players[playerId].isDead) {
                        handlePlayerShoot(playerId, data.aimDir, data.gunPropel);
                    }
                    break;
                case 'chat':
                    if (players[playerId]) {
                        broadcastChatMessage(players[playerId].name, data.message);
                    }
                    break;
                default:
                    console.log(`Unknown message type from ${playerId.substring(0,8)}: ${data.type}`);
            }
        } catch (error) {
            console.error(`Failed to handle message from ${playerId.substring(0,8)}:`, error, message.toString());
        }
    });

    ws.on('close', () => {
        handlePlayerLeave(playerId);
    });

    ws.on('error', (error) => {
        console.error(`WebSocket error for player ${playerId ? playerId.substring(0,8) : 'Unknown'}:`, error);
        handlePlayerLeave(playerId); // Assume disconnect on error
    });

    // Send acknowledgment (client can wait for this before sending join)
    ws.send(JSON.stringify({ type: 'connectionAck', message: 'Connected to Shawty server!' }));
});

function handlePlayerJoin(ws, playerId, data) {
    if (players[playerId]) {
        console.warn(`Player ${playerId.substring(0,8)} tried to join again.`);
        return;
    }
    const spawnPoint = spawnPoints[Math.floor(Math.random() * spawnPoints.length)];

    const playerShape = new CANNON.Capsule(0.5, 0.5, 10); // Radius 0.5, height 1 (total height = 2*radius + height_cylinder = 1+1=2)
                                                       // Cannon-es Capsule: radius, height (of cylinder part), numSegments
    const playerBody = new CANNON.Body({
        mass: 70,
        position: new CANNON.Vec3(spawnPoint.x, spawnPoint.y, spawnPoint.z),
        fixedRotation: true, // Prevents player from tipping over
        material: playerMaterial,
        linearDamping: 0.7, // More damping for control
        angularDamping: 0.5
    });
    // Align capsule upright
    const q = new CANNON.Quaternion();
    q.setFromAxisAngle(new CANNON.Vec3(1,0,0), Math.PI/2);
    playerBody.addShape(playerShape, new CANNON.Vec3(), q); // Add shape with rotation
    world.addBody(playerBody);


    players[playerId] = {
        id: playerId,
        ws: ws,
        name: data.name || `Player${Math.floor(Math.random()*1000)}`,
        character: data.character || 'Shawty',
        health: PLAYER_HEALTH_MAX,
        kills: 0,
        deaths: 0,
        physicsBody: playerBody,
        input: { forward: 0, backward: 0, left: 0, right: 0, jump: false, dash: false },
        rotation: { x: 0, y: 0, z: 0, w: 1 }, // Store as quaternion
        lastShotTime: 0,
        lastDashTime: 0,
        isDead: false,
        // Store logical position separately for reconciliation or if physics body is removed
        position: { x: spawnPoint.x, y: spawnPoint.y, z: spawnPoint.z }
    };

    console.log(`${players[playerId].name} (${playerId.substring(0,8)}) joined.`);
    broadcastEventLog(`${players[playerId].name} joined the game.`);
    broadcastPlayerCount();

    ws.send(JSON.stringify({
        type: 'gameState',
        yourId: playerId,
        players: getPublicPlayersData(),
        timeLeft: gameTimeLeft,
        roundInProgress: roundInProgress,
        killLog: killLog,
        spawnPoints: spawnPoints // Send spawn points for client-side effects or debugging
    }));

    broadcastToAllExcept(playerId, {
        type: 'playerJoined',
        player: getPublicPlayerData(playerId)
    });

    if (!roundInProgress && Object.keys(players).length >= 1) { // Min players to start
        startRound();
    }
}

function handlePlayerLeave(playerId) {
    if (players[playerId]) {
        const playerName = players[playerId].name;
        console.log(`${playerName} (${playerId.substring(0,8)}) disconnected.`);
        broadcastEventLog(`${playerName} left the game.`);
        if (players[playerId].physicsBody) {
            world.removeBody(players[playerId].physicsBody);
        }
        delete players[playerId];
        broadcastPlayerCount();
        broadcastToAll({ type: 'playerLeft', id: playerId });

        if (Object.keys(players).length === 0 && roundInProgress) {
            console.log("All players left, ending round.");
            endRound(true); // Force end if no players
        }
    }
}

function getPublicPlayersData() {
    const publicData = {};
    for (const id in players) {
        publicData[id] = getPublicPlayerData(id);
    }
    return publicData;
}

function getPublicPlayerData(id) {
    const p = players[id];
    if (!p) return null;
    return {
        id: p.id,
        name: p.name,
        character: p.character,
        position: p.physicsBody ? { x: p.physicsBody.position.x, y: p.physicsBody.position.y, z: p.physicsBody.position.z } : p.position,
        rotation: p.rotation, // Send quaternion
        health: p.health,
        kills: p.kills,
        deaths: p.deaths,
        isDead: p.isDead
    };
}

function broadcastToAll(message) {
    const stringifiedMessage = JSON.stringify(message);
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(stringifiedMessage);
        }
    });
}

function broadcastToAllExcept(senderId, message) {
    const stringifiedMessage = JSON.stringify(message);
    for (const id in players) {
        if (id !== senderId && players[id].ws.readyState === WebSocket.OPEN) {
            players[id].ws.send(stringifiedMessage);
        }
    }
}

function broadcastPlayerCount() {
    broadcastToAll({ type: 'playerCount', count: Object.keys(players).length });
}

function broadcastEventLog(message) {
    const logEntry = { message, timestamp: Date.now() };
    // killLog might be better for specific game events, eventLog for general server messages
    broadcastToAll({ type: 'eventLog', entry: logEntry });
    console.log("Event: ", message);
}

function broadcastChatMessage(senderName, message) {
    broadcastToAll({ type: 'chat', sender: senderName, message: message, timestamp: Date.now() });
}


function gameLoop() {
    const now = Date.now();
    // const delta = (now - lastTickTime) / 1000.0; // Time in seconds (not used with fixed timestep)
    // lastTickTime = now;

    // Update physics world
    world.step(1 / TICK_RATE); // Fixed timestep

    for (const id in players) {
        const player = players[id];
        if (!player.physicsBody || player.isDead) continue;

        // Update logical position from physics body
        player.position.x = player.physicsBody.position.x;
        player.position.y = player.physicsBody.position.y;
        player.position.z = player.physicsBody.position.z;

        // Process Inputs
        const input = player.input;
        const body = player.physicsBody;

        const FWD = new CANNON.Vec3(); // Forward vector based on player's rotation
        const RIGHT = new CANNON.Vec3(); // Right vector

        // Convert player's view quaternion to forward and right vectors (horizontal only)
        const playerQuaternion = new CANNON.Quaternion(player.rotation.x, player.rotation.y, player.rotation.z, player.rotation.w);
        const euler = new CANNON.Vec3();
        playerQuaternion.toEuler(euler, 'YXZ'); // Get yaw from YXZ order

        // Horizontal forward vector (ignoring pitch for movement direction)
        FWD.set(Math.sin(euler.y), 0, Math.cos(euler.y)).negate(); // Three.js forward is -Z
        RIGHT.set(FWD.z, 0, -FWD.x); // Perpendicular

        let impulse = new CANNON.Vec3(0,0,0);
        const forceScale = 2000; // Applied as force, not impulse, for continuous movement

        if (input.forward) impulse.vadd(FWD.scale(forceScale), impulse);
        if (input.backward) impulse.vsub(FWD.scale(forceScale), impulse);
        if (input.left) impulse.vsub(RIGHT.scale(forceScale), impulse);
        if (input.right) impulse.vadd(RIGHT.scale(forceScale), impulse);
        
        // Apply movement forces
        // Check if grounded before applying horizontal forces for more control (optional)
        body.applyForce(new CANNON.Vec3(impulse.x, 0, impulse.z), body.position);

        // Jump
        if (input.jump && isPlayerGrounded(body)) {
            body.velocity.y = 0; // Reset vertical velocity before jump for consistent height
            body.applyImpulse(new CANNON.Vec3(0, PLAYER_JUMP_IMPULSE, 0), body.position);
            input.jump = false; // Consume jump input
        }

        // Dash
        if (input.dash && (now - player.lastDashTime > PLAYER_DASH_COOLDOWN)) {
            player.lastDashTime = now;
            let dashDirection = new CANNON.Vec3(FWD.x, 0, FWD.z); // Default to forward
            if (input.forward) dashDirection.copy(FWD);
            else if (input.backward) dashDirection.copy(FWD.negate());
            else if (input.left) dashDirection.copy(RIGHT.negate());
            else if (input.right) dashDirection.copy(RIGHT);
            // else if no movement key, dash in looking direction (horizontal)

            dashDirection.normalize(); // Ensure consistent dash magnitude
            body.applyImpulse(dashDirection.scale(PLAYER_DASH_IMPULSE), body.position);
            input.dash = false; // Consume dash input
        }


        // Fall damage / void out
        if (body.position.y < VOID_Y_THRESHOLD && !player.isDead) {
            console.log(`${player.name} fell out of the world.`);
            const deathData = {
                victimId: id,
                attackerId: null, // No attacker
                position: {x: body.position.x, y: body.position.y, z: body.position.z},
                method: "Fell"
            };
            handlePlayerDeath(deathData);
        }
    }

    // Broadcast state
    const gameState = {
        type: 'gameStateUpdate',
        players: getPublicPlayersData(),
        timeLeft: gameTimeLeft,
    };
    broadcastToAll(gameState);
}

function isPlayerGrounded(playerBody) {
    // Raycast downwards to check for ground
    const start = playerBody.position.clone();
    const end = playerBody.position.clone();
    end.y -= 1.1; // Ray length, should be slightly more than half player height + small buffer
                  // Capsule height is 2, so check from center down by radius (0.5) + a bit (0.6) = 1.1
    
    const ray = new CANNON.Ray(start, end);
    const result = new CANNON.RaycastResult();
    // Filter out the player's own body
    // Note: ray.intersectWorld doesn't have a direct filter option like this.
    // Instead, check result.body !== playerBody.
    // Or, use collisionGroup and collisionMask if you set them up.
    const options = {
        // collisionFilterMask:  ... // set up collision groups if needed
        skipBackfaces: true
    };
    ray.intersectWorld(world, options, result);

    return result.hasHit && result.body !== playerBody;
}


function handlePlayerShoot(playerId, aimDirVec, gunPropel) {
    const player = players[playerId];
    if (!player || player.isDead) return;

    const now = Date.now();
    if (now - player.lastShotTime < SHOT_COOLDOWN) return; // Fire rate
    player.lastShotTime = now;

    const aimDirection = new CANNON.Vec3(aimDirVec.x, aimDirVec.y, aimDirVec.z).unit();

    // Raycast from player's camera position (approximated)
    const eyeHeight = 1.5; // Approximate eye height above player body's center for capsule
    const rayFrom = new CANNON.Vec3(
        player.physicsBody.position.x,
        player.physicsBody.position.y + eyeHeight,
        player.physicsBody.position.z
    );
     // To make shots originate from gun, might need to offset 'rayFrom' based on gun model position relative to player
    const rayTo = new CANNON.Vec3(
        rayFrom.x + aimDirection.x * 500, // Max range 500 units
        rayFrom.y + aimDirection.y * 500,
        rayFrom.z + aimDirection.z * 500
    );

    const result = new CANNON.RaycastResult();
    const ray = new CANNON.Ray(rayFrom, rayTo);
    // To prevent shooting self, could add player.physicsBody to a list of bodies to ignore
    // or check `result.body !== player.physicsBody`
    ray.intersectWorld(world, { skipBackfaces: true }, result);

    let hitPlayerId = null;
    let hitPoint = null;

    if (result.hasHit) {
        hitPoint = { x: result.hitPointWorld.x, y: result.hitPointWorld.y, z: result.hitPointWorld.z };
        for (const id in players) {
            if (players[id].physicsBody === result.body && id !== playerId && !players[id].isDead) {
                hitPlayerId = id;
                console.log(`${player.name} hit ${players[id].name}`);
                takeDamage(id, playerId, SHOT_DAMAGE, "Gun");
                break;
            }
        }
    }

    broadcastToAll({
        type: 'playerShot',
        shooterId: playerId,
        aimDir: aimDirection, // For client-side muzzle flash direction
        hit: result.hasHit,
        hitPoint: hitPoint,
        hitPlayerId: hitPlayerId
    });

    if (gunPropel) {
        const propulsionImpulse = new CANNON.Vec3(
            -aimDirection.x * GUN_PROPEL_FORCE,
            -aimDirection.y * GUN_PROPEL_FORCE * 0.5 + 100, // Less vertical recoil, some upward push
            -aimDirection.z * GUN_PROPEL_FORCE
        );
        player.physicsBody.applyImpulse(propulsionImpulse, player.physicsBody.position);
    }
}

function takeDamage(victimId, attackerId, damage, method) {
    const victim = players[victimId];
    if (!victim || victim.isDead) return;

    victim.health -= damage;
    broadcastToAll({ type: 'healthUpdate', playerId: victimId, health: victim.health });

    if (victim.health <= 0) {
        victim.health = 0;
        const deathData = {
            victimId: victimId,
            attackerId: attackerId,
            position: { x: victim.physicsBody.position.x, y: victim.physicsBody.position.y, z: victim.physicsBody.position.z },
            method: method
        };
        handlePlayerDeath(deathData);
    }
}

function handlePlayerDeath(deathData) {
    const { victimId, attackerId, position, method } = deathData;
    const victim = players[victimId];
    if (!victim || victim.isDead) return; // Already processed

    victim.isDead = true;
    victim.deaths++;

    let attackerName = "World";
    if (attackerId && players[attackerId]) {
        if (attackerId !== victimId) { // Not suicide
            players[attackerId].kills++;
        }
        attackerName = players[attackerId].name;
    } else if (method === "Gun" && !attackerId) { // Should not happen with guns, implies self-shot or error
        attackerName = "Misadventure";
    }


    const deathMessage = `${victim.name} was ${method === "Fell" ? "eliminated" : "killed"} by ${attackerName}${method !== "Fell" && method !== "Misadventure" ? " ("+method+")" : ""}.`;
    const killEntry = { killer: attackerName, victim: victim.name, method: method, timestamp: Date.now() };
    killLog.push(killEntry);
    if (killLog.length > 20) killLog.shift(); // Keep log manageable

    broadcastEventLog(deathMessage); // General event log
    broadcastToAll({
        type: 'playerDied',
        victimId: victimId,
        attackerId: attackerId,
        position: position, // Position of death for effects
        killLogEntry: killEntry // Send specific entry for detailed kill feed
    });

    // Death shockwave
    if (victim.physicsBody) { // Ensure body exists for position
        const deathPosition = victim.physicsBody.position;
        for (const id in players) {
            const otherPlayer = players[id];
            if (id === victimId || !otherPlayer.physicsBody || otherPlayer.isDead) continue;

            const distVec = otherPlayer.physicsBody.position.vsub(deathPosition);
            const distance = distVec.length();

            if (distance < DEATH_SHOCKWAVE_RADIUS && distance > 0.1) { // Min distance to avoid extreme forces
                const forceMagnitude = DEATH_SHOCKWAVE_FORCE * (1 - (distance / DEATH_SHOCKWAVE_RADIUS));
                const impulseDir = distVec.unit();
                otherPlayer.physicsBody.applyImpulse(
                    impulseDir.scale(forceMagnitude),
                    otherPlayer.physicsBody.position
                );
            }
        }
    }


    // Remove victim's physics body
    if (victim.physicsBody) {
        world.removeBody(victim.physicsBody);
        victim.physicsBody = null;
    }

    setTimeout(() => {
        if (players[victimId]) { // Check if player still connected
             respawnPlayer(victimId);
        }
    }, 3000); // 3s respawn delay
}


function respawnPlayer(playerId) {
    const player = players[playerId];
    if (!player) return;

    const spawnPoint = spawnPoints[Math.floor(Math.random() * spawnPoints.length)];
    player.health = PLAYER_HEALTH_MAX;
    player.isDead = false;
    player.position = { x: spawnPoint.x, y: spawnPoint.y, z: spawnPoint.z }; // Reset logical position

    // Recreate physics body
    const playerShape = new CANNON.Capsule(0.5, 0.5, 10);
    const playerBody = new CANNON.Body({
        mass: 70,
        position: new CANNON.Vec3(spawnPoint.x, spawnPoint.y, spawnPoint.z),
        fixedRotation: true,
        material: playerMaterial,
        linearDamping: 0.7,
        angularDamping: 0.5
    });
    const q = new CANNON.Quaternion();
    q.setFromAxisAngle(new CANNON.Vec3(1,0,0), Math.PI/2);
    playerBody.addShape(playerShape, new CANNON.Vec3(), q);
    world.addBody(playerBody);
    player.physicsBody = playerBody;


    broadcastToAll({
        type: 'playerRespawn',
        playerId: playerId,
        position: player.position,
        rotation: player.rotation, // Send current rotation (might be looking somewhere)
        health: player.health
    });
    console.log(`${player.name} respawned.`);
}


function startRound() {
    if (roundInProgress) return;
    console.log("Starting new round!");
    roundInProgress = true;
    gameTimeLeft = ROUND_DURATION;
    killLog = []; // Reset kill log for the new round

    for (const id in players) {
        players[id].kills = 0;
        players[id].deaths = 0;
        if(players[id].isDead || !players[id].physicsBody) { // If dead or body missing
            respawnPlayer(id);
        } else { // If alive, just reset stats and ensure full health
            players[id].health = PLAYER_HEALTH_MAX;
            broadcastToAll({ type: 'healthUpdate', playerId: id, health: players[id].health });
        }
    }

    broadcastToAll({ type: 'roundStart', timeLeft: gameTimeLeft, killLog: killLog });
    broadcastEventLog("Round started!");

    if (roundTimerInterval) clearInterval(roundTimerInterval);
    roundTimerInterval = setInterval(() => {
        if (!roundInProgress) {
            clearInterval(roundTimerInterval);
            return;
        }
        gameTimeLeft -= 1000;
        if (gameTimeLeft <= 0) {
            gameTimeLeft = 0;
            clearInterval(roundTimerInterval);
            endRound();
        }
    }, 1000);
}

function endRound(forced = false) {
    if (!roundInProgress && !forced) return;
    console.log("Round ended!");
    roundInProgress = false;
    if (roundTimerInterval) clearInterval(roundTimerInterval);

    let winner = null;
    let maxKills = -1;
    const finalScores = getPublicPlayersData();

    for (const id in finalScores) {
        if (finalScores[id].kills > maxKills) {
            maxKills = finalScores[id].kills;
            winner = finalScores[id];
        } else if (finalScores[id].kills === maxKills && winner) {
            if (finalScores[id].deaths < winner.deaths) { // Tie-breaker: fewer deaths
                winner = finalScores[id];
            }
        }
    }

    const winnerName = winner ? winner.name : "No one";
    const roundEndMessage = `Round over! Winner: ${winnerName} with ${maxKills} kills.`;
    broadcastEventLog(roundEndMessage);
    broadcastToAll({ type: 'roundEnd', winnerName: winnerName, scores: finalScores });

    // TODO: Implement map voting here if desired

    setTimeout(() => {
        if (Object.keys(players).length > 0) {
            startRound(); // Start new round automatically for now
        } else {
            console.log("No players online. Waiting for players to start a new round.");
        }
    }, 10000); // 10-second delay before next round
}

// Start the server's main game loop
// let lastTickTime = Date.now(); // Not needed for fixed timestep gameLoop
setInterval(gameLoop, 1000 / TICK_RATE);

console.log("Shawty server logic initialized and game loop started.");
