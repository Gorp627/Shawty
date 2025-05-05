// docs/js/main.js
import * as THREE from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.module.js';
import * as Scene from './scene.js';
import * as Network from './network.js';
import * as PlayerController from './playerController.js';
import * as UI from './ui.js';

let renderer, camera, scene;
let localPlayerId = null;
let gameStarted = false;
let players = {}; // Store data for all players { id: data }
let activeSceneEffects = []; // Effects like explosions

const SERVER_URL = 'https://gametest-psxl.onrender.com'; // Your Render server URL

function init() {
    UI.showLoadingScreen();

    // 1. Initialize Scene
    const canvas = document.getElementById('gameCanvas');
    const sceneData = Scene.initScene(canvas, onAssetsLoaded); // Pass callback
    renderer = sceneData.renderer;
    camera = sceneData.camera;
    scene = sceneData.scene;

    // Asset loading is handled by scene.js, wait for callback 'onAssetsLoaded'
}

function onAssetsLoaded() {
    console.log("Assets loaded, showing menu.");
    UI.updateLoadingProgress(1); // Ensure progress shows 100%
    UI.showMenuScreen();

    // Setup play button listener
    UI.onPlayButtonClick(() => {
        const playerName = UI.getPlayerName();
        console.log("Play button clicked, joining game as:", playerName);
        startGame(playerName);
    });
}

function startGame(playerName) {
    UI.showGameScreen(); // Switch UI to game view

    // 2. Connect to Network
    Network.connectToServer(SERVER_URL, playerName, {
        onConnect: () => {
            console.log("Network connected successfully.");
            // Waiting for assignId before initializing player controller
        },
        onDisconnect: () => {
            console.log("Network disconnected.");
            alert("Disconnected from server!");
            gameStarted = false;
            // Show menu or error screen
            UI.showMenuScreen();
            // Clean up players?
            Object.keys(players).forEach(id => Scene.removePlayer(id));
            players = {};
            localPlayerId = null;
        },
        onAssignId: (id) => {
            console.log("Received player ID:", id);
            localPlayerId = id;
            // 3. Initialize Player Controller *after* getting ID
            PlayerController.initPlayerController(camera, renderer.domElement, localPlayerId);
            gameStarted = true;
            // Start the game loop
            animate();
        },
        onStateUpdate: (state, isPartialUpdate) => {
            // Handle full state or partial updates (like single player move)
            // console.log("Received state update:", state);
             if (!isPartialUpdate) {
                 // Full state update (e.g., on join)
                 // Remove players that are no longer in the state
                 Object.keys(players).forEach(existingId => {
                     if (!state[existingId] && existingId !== localPlayerId) {
                         Scene.removePlayer(existingId);
                         delete players[existingId];
                     }
                 });
             }

            // Add or update players based on received state
            for (const id in state) {
                if (id === localPlayerId) {
                    // Maybe sync server position if needed (handle prediction errors)
                    // For now, client is mostly authoritative over its own position
                    continue;
                }

                if (!players[id]) { // New player joined
                    console.log("Adding new player from state:", id);
                    players[id] = state[id]; // Store initial data
                    Scene.addPlayer(state[id]);
                } else { // Update existing player
                     players[id] = { ...players[id], ...state[id] }; // Merge updates
                    Scene.updatePlayerPosition(id, state[id].position, state[id].rotation);
                     // Update health or other visual cues if needed
                     // const mesh = Scene.getPlayerMesh(id);
                     // if (mesh && state[id].health !== undefined) { /* Update health bar? */ }
                }
            }
        },
        onPlayerJoined: (playerData) => {
            console.log("Handling player joined event:", playerData.id);
            if (playerData.id === localPlayerId) return; // Ignore self join event
             if (!players[playerData.id]) {
                players[playerData.id] = playerData;
                Scene.addPlayer(playerData);
             } else {
                // Player might already exist from initial state, update data just in case
                 players[playerData.id] = { ...players[playerData.id], ...playerData };
                 Scene.updatePlayerPosition(playerData.id, playerData.position, playerData.rotation);
             }
        },
        onPlayerLeft: (playerId) => {
             console.log("Handling player left event:", playerId);
            if (playerId === localPlayerId) return; // Should not happen if disconnect handles it
            if (players[playerId]) {
                Scene.removePlayer(playerId);
                delete players[playerId];
            }
        },
        onPlayerShot: (data) => {
            // Play sound effect at shooter's position
            const shooter = players[data.shooterId] || (data.shooterId === localPlayerId ? PlayerController.getPlayerState() : null);
            if (shooter) {
                 // Get gun position for sound origin (needs refinement)
                 const mesh = Scene.getPlayerMesh(data.shooterId);
                 let soundPos = shooter.position; // Default to player pos
                 if(mesh && mesh.userData.gun) {
                    // Get world position of the gun
                     soundPos = mesh.userData.gun.getWorldPosition(new THREE.Vector3());
                 } else if (data.shooterId === localPlayerId) {
                     // Local player shot, position sound near camera/gun model
                     const camDir = new THREE.Vector3();
                     camera.getWorldDirection(camDir);
                     soundPos = camera.position.clone().add(camDir.multiplyScalar(0.5)); // Approx gun position
                 }
                 Scene.playGunshotSound(soundPos);
            }

             // TODO: Add visual effect (muzzle flash, tracer)
        },
         onPlayerDied: (data) => {
            console.log("Main handling playerDied:", data);
             const { deadPlayerId, position, affectedPlayers } = data;

             // Trigger explosion/shockwave visual at death position
             const effects = Scene.createDeathExplosion(new THREE.Vector3(position.x, position.y, position.z));
             activeSceneEffects.push(...effects); // Add effects to update list

             // Apply knockback to local player if affected
             const localAffected = affectedPlayers.find(p => p.id === localPlayerId);
             if (localAffected) {
                 PlayerController.applyKnockback(localAffected.knockback);
             }

             // Handle visual changes for the dead player model (if not local player)
             if (deadPlayerId !== localPlayerId && players[deadPlayerId]) {
                 // Make player model disappear? Turn grey? Play death animation?
                 // For now, just remove the mesh after a short delay maybe?
                 // Or server handles respawn visibility via state updates.
                 console.log(`Player ${players[deadPlayerId].name} died visually.`);
                 // Scene.removePlayer(deadPlayerId); // Remove immediately? Or wait for respawn state?
                 // Let's keep the mesh until respawn for now, maybe make it transparent/disabled
                 const mesh = Scene.getPlayerMesh(deadPlayerId);
                 if (mesh) {
                    mesh.visible = false; // Hide mesh on death
                 }

             }
        },
         onRespawn: (data) => {
            // Handle local player respawn
             if (localPlayerId) { // Ensure controller is initialized
                 PlayerController.handleRespawn(data);
             }
        },
         onPlayerRespawned: (data) => { // Handle other players respawning
             if (data.id !== localPlayerId && players[data.id]) {
                 console.log(`Player ${players[data.id].name} respawned visually.`);
                 players[data.id].position = data.position;
                 players[data.id].health = data.health; // Update health state
                 const mesh = Scene.getPlayerMesh(data.id);
                 if (mesh) {
                     mesh.position.set(data.position.x, data.position.y, data.position.z);
                     mesh.visible = true; // Make visible again
                 } else {
                     // Player mesh didn't exist? Add them back.
                     Scene.addPlayer(players[data.id]);
                 }
                 // Update health bar if applicable
             }
         },
          onApplyPropulsion: (data) => {
            // This is received if the server explicitly tells the client to apply propulsion
            // Might be redundant if client predicts it, see playerController.js
            PlayerController.handleServerPropulsion(data);
        },


    });
}


// Game Loop
function animate() {
    if (!gameStarted) return; // Stop loop if disconnected or not started

    requestAnimationFrame(animate);

    const deltaTime = Math.min(0.05, clock.getDelta()); // Clamp delta to prevent large jumps

    // Update local player movement and camera
    PlayerController.updatePlayer(deltaTime);

    // Update scene effects (explosions, etc.)
    activeSceneEffects = activeSceneEffects.filter(effect => {
        return Scene.updateEffect(effect, deltaTime); // Update and filter out finished effects
    });


    // Lerp other player positions for smoothness (optional but recommended)
    // for (const id in players) {
    //     if (id !== localPlayerId) {
    //         const mesh = Scene.getPlayerMesh(id);
    //         const serverPos = players[id].position;
    //         if (mesh && serverPos) {
    //             mesh.position.lerp(new THREE.Vector3(serverPos.x, serverPos.y, serverPos.z), 0.15); // Adjust lerp factor
    //             // Lerp rotation too? Quaternion lerp (slerp) is better for rotations.
    //              const targetQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, serverPos.rotation.y, 0, 'YXZ')); // Only Y rotation usually
    //              mesh.quaternion.slerp(targetQuat, 0.15);
    //         }
    //     }
    // }

    // Render the scene
    renderer.render(scene, camera);
}

// --- Start Initialization ---
init();
