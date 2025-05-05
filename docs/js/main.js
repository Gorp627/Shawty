// docs/js/main.js
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.module.js'; // Using jsdelivr URL
import * as Scene from './scene.js';
import * as Network from './network.js';
import * as PlayerController from './playerController.js';
import * as UI from './ui.js';

let renderer, camera, scene;
let localPlayerId = null;
let gameStarted = false;
let players = {}; // Store data for all players { id: data }
let activeSceneEffects = []; // Effects like explosions needing animation
const clock = new THREE.Clock(); // Moved clock here for animate loop

const SERVER_URL = 'https://gametest-psxl.onrender.com'; // Your Render server URL

function init() {
    console.log("Initializing UI..."); // Log start
    UI.showLoadingScreen();
    const canvas = document.getElementById('gameCanvas');
    if (!canvas) {
        console.error("Failed to find canvas element!");
        return;
    }
    console.log("Initializing Scene..."); // Log before scene init
    // Pass onAssetsLoaded callback to initScene
    const sceneData = Scene.initScene(canvas, onAssetsLoaded);
     if (!sceneData) { // Add check if scene init failed
         console.error("Scene initialization failed!");
         // Optional: Display error to user in the UI
         document.body.innerHTML = `<div style="color: red; padding: 20px;">Scene Initialization Error!<br>Check console for details.</div>`;
         return;
    }
    renderer = sceneData.renderer;
    camera = sceneData.camera;
    scene = sceneData.scene;
    console.log("Scene initialized."); // Log after scene init
    // Asset loading is async, wait for the callback 'onAssetsLoaded'
}

function onAssetsLoaded() {
    console.log("Assets loaded callback triggered, showing menu."); // Log callback entry
    UI.updateLoadingProgress(1); // Ensure progress shows 100%
    UI.showMenuScreen();
    // Setup play button listener
    UI.onPlayButtonClick(() => {
        const playerName = UI.getPlayerName();
        console.log("Play button clicked, joining game as:", playerName);
        startGame(playerName);
    });
    console.log("Menu setup complete."); // Log menu setup end
}

function startGame(playerName) {
    console.log("Showing game screen..."); // Log before UI change
    UI.showGameScreen();
    console.log("Connecting to network..."); // Log before network connect

    Network.connectToServer(SERVER_URL, playerName, {
        onConnect: () => {
             console.log("Network.onConnect callback triggered.");
             // Optional: Indicate connection success in UI?
        },
        onDisconnect: (reason) => {
            console.log("Network.onDisconnect callback triggered. Reason:", reason);
            gameStarted = false; // Stop game loop via flag
            // Clean up players and scene objects thoroughly
            Object.keys(players).forEach(id => Scene.removePlayer(id));
            players = {};
            activeSceneEffects.forEach(effect => effect.userData?.dispose()); // Dispose active effects
            activeSceneEffects = [];
            localPlayerId = null;
            // Reset UI
            UI.showMenuScreen(); // Go back to menu
            alert("Disconnected from server: " + reason); // Inform user
        },
        onAssignId: (id) => {
            console.log("Network.onAssignId callback triggered. ID:", id);
            localPlayerId = id;
            // Init controller AFTER getting ID and AFTER assets are loaded
             console.log("Initializing PlayerController...");
            PlayerController.initPlayerController(camera, renderer.domElement, localPlayerId);
             console.log("PlayerController initialized.");
            gameStarted = true; // Set flag to allow animation loop
            console.log("Starting animation loop...");
            animate(); // Start the game loop
        },
        onStateUpdate: (state, isPartialUpdate) => {
            if (!gameStarted && !isPartialUpdate) {
                 console.log("Network.onStateUpdate: Received initial state:", Object.keys(state).length, "players");
            } else if (!gameStarted && isPartialUpdate){
                // Avoid processing stray updates before ready
                // console.warn("Network.onStateUpdate: Received partial update before game started, ignoring.");
                return;
            }

             if (!isPartialUpdate) {
                 // Full state - remove players no longer present
                 Object.keys(players).forEach(existingId => {
                     if (!state[existingId] && existingId !== localPlayerId) {
                         console.log(`Removing player ${existingId} based on full state update.`);
                         Scene.removePlayer(existingId);
                         delete players[existingId];
                     }
                 });
             }

            // Add or update players based on received state
            for (const id in state) {
                if (id === localPlayerId) continue; // Ignore updates for self for now

                if (!players[id]) { // New player from state
                    console.log("Network.onStateUpdate: Adding new player from state:", id);
                    players[id] = state[id];
                    Scene.addPlayer(state[id]);
                } else { // Update existing player from state
                     players[id] = { ...players[id], ...state[id] }; // Merge new data
                    Scene.updatePlayerPosition(id, state[id].position, state[id].rotation);
                }
            }
        },
        onPlayerJoined: (playerData) => {
            if (playerData.id === localPlayerId || !gameStarted) return; // Ignore self or if game stopped
             console.log("Network.onPlayerJoined callback triggered:", playerData.id);
             if (!players[playerData.id]) {
                players[playerData.id] = playerData;
                Scene.addPlayer(playerData);
             } else {
                 // Player might already exist from initial state, update data
                 console.log(`Network.onPlayerJoined: Player ${playerData.id} already exists, updating.`);
                 players[playerData.id] = { ...players[playerData.id], ...playerData };
                 Scene.updatePlayerPosition(playerData.id, playerData.position, playerData.rotation);
             }
        },
        onPlayerLeft: (playerId) => {
            if (playerId === localPlayerId || !gameStarted) return;
             console.log("Network.onPlayerLeft callback triggered:", playerId);
            if (players[playerId]) {
                Scene.removePlayer(playerId);
                delete players[playerId];
            }
        },
        onPlayerShot: (data) => {
            if (!gameStarted) return;
            const shooterId = data.shooterId;
            // Get shooter data safely, check position exists
            const shooterData = players[shooterId] || (shooterId === localPlayerId ? PlayerController.getPlayerState() : null);
            if (shooterData?.position) {
                 const mesh = Scene.getPlayerMesh(shooterId);
                 let soundPos = shooterData.position; // Default to player origin
                 // Try to get gun's world position if available
                 if(mesh && mesh.userData.gun) {
                    // Use THREE namespace directly as it's imported as '*'
                    soundPos = mesh.userData.gun.getWorldPosition(new THREE.Vector3());
                 } else if (shooterId === localPlayerId && camera) { // Local player shot, approximate from camera
                     const camDir = new THREE.Vector3();
                     camera.getWorldDirection(camDir);
                     soundPos = camera.position.clone().add(camDir.multiplyScalar(0.5));
                 }
                 Scene.playGunshotSound(soundPos);
                 // TODO: Add muzzle flash/tracer visual effect
            } else {
                console.warn(`Shooter data or position not found for shot event: ${shooterId}`);
            }
        },
         onPlayerDied: (data) => {
            if (!gameStarted) return;
            console.log("Network.onPlayerDied callback triggered:", data);
            if(!data || !data.position || !data.deadPlayerId || !data.affectedPlayers) {
                console.error("Received incomplete playerDied data:", data);
                return;
            }
             const { deadPlayerId, position, affectedPlayers } = data;

             // Visual/Audio effect for death at the specified position
             const effects = Scene.createDeathExplosion(new THREE.Vector3(position.x, position.y, position.z));
             activeSceneEffects.push(...effects); // Add effects to update list

             // Apply knockback if local player is affected
             const localAffected = affectedPlayers.find(p => p.id === localPlayerId);
             if (localAffected?.knockback) { // Check knockback exists
                console.log("Applying knockback to local player");
                 PlayerController.applyKnockback(localAffected.knockback);
             }

             // Hide remote player mesh (will reappear on respawn)
             if (deadPlayerId !== localPlayerId && players[deadPlayerId]) {
                 const mesh = Scene.getPlayerMesh(deadPlayerId);
                 if (mesh) {
                     mesh.visible = false; // Hide mesh
                     console.log(`Player ${players[deadPlayerId].name} died visually (hidden).`);
                 }
             }
             // Local player death handling (UI, controls) happens in playerController.js via takeDamage/handleDeath
        },
         onRespawn: (data) => { // For local player respawn
            if (!gameStarted || !localPlayerId) return;
            console.log("Network.onRespawn callback triggered for local player.");
            if (typeof PlayerController.handleRespawn === 'function') {
                PlayerController.handleRespawn(data);
            }
        },
         onPlayerRespawned: (data) => { // For remote players respawning
             if (!gameStarted || data.id === localPlayerId) return;
             console.log("Network.onPlayerRespawned callback triggered for remote player:", data.id);
             if (players[data.id]) { // Check if player exists in our client list
                 players[data.id].position = data.position;
                 players[data.id].health = data.health; // Update state
                 const mesh = Scene.getPlayerMesh(data.id);
                 if (mesh) {
                     mesh.position.set(data.position.x, data.position.y, data.position.z);
                     mesh.visible = true; // Make visible again
                     console.log(`Player ${players[data.id].name} respawned visually (visible).`);
                 } else {
                     // Player mesh might have been removed, re-add
                    console.log(`Player ${data.id} mesh not found on respawn, re-adding.`);
                    Scene.addPlayer(players[data.id]);
                 }
             } else {
                 console.warn(`Received respawn for unknown player ${data.id}`);
                 // Optionally add the player if state allows and is desired
                 // players[data.id] = data; // Store state
                 // Scene.addPlayer(data); // Add mesh
             }
         },
          onApplyPropulsion: (data) => {
            if (!gameStarted) return;
            console.log("Network.onApplyPropulsion callback triggered.");
            // Pass event data to player controller to handle
            if (typeof PlayerController.handleServerPropulsion === 'function') {
                 PlayerController.handleServerPropulsion(data);
            }
        },
    });
    console.log("Network connection initiated.");
}

let animationFrameId = null; // To potentially cancel the loop

// Game Loop
function animate() {
    // Check gameStarted flag at the beginning of each frame
    if (!gameStarted) {
        console.log("Game not started, stopping animation loop.");
        if (animationFrameId) {
            cancelAnimationFrame(animationFrameId); // Stop requesting new frames
            animationFrameId = null;
        }
        return; // Exit the function
    }

    // Request the next frame before doing work for this frame
    animationFrameId = requestAnimationFrame(animate);

    const deltaTime = clock.getDelta(); // Time since last frame
    const cappedDelta = Math.min(deltaTime, 0.05); // Clamp delta to prevent large jumps on lag

    // Update local player FIRST (movement, physics, camera)
    if (localPlayerId && PlayerController) {
        PlayerController.updatePlayer(cappedDelta);
    }

    // Update scene effects (particles, shockwaves, etc.)
    // Filter out effects that are no longer active (updateEffect returns false)
    activeSceneEffects = activeSceneEffects.filter(effect => Scene.updateEffect(effect, cappedDelta));

    // Interpolate other players' positions/rotations for smoothness
     for (const id in players) {
         if (id !== localPlayerId) { // Don't interpolate local player
             const mesh = Scene.getPlayerMesh(id);
             const serverState = players[id];
             // Check if mesh and necessary state exist
             if (mesh && serverState?.position && serverState?.rotation) {
                  // Interpolate position (adjust lerp factor 0.0-1.0 for smoothness vs responsiveness)
                  mesh.position.lerp(new THREE.Vector3(serverState.position.x, serverState.position.y, serverState.position.z), 0.2);

                  // Interpolate rotation using quaternions (slerp) for better results than Euler angles
                  // We only care about Y rotation from server for basic FPS look
                  const targetQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, serverState.rotation.y, 0, 'YXZ'));
                  mesh.quaternion.slerp(targetQuat, 0.2);
             }
         }
     }

    // Render the scene
    if(renderer && scene && camera) { // Ensure all three components are ready
        try {
            renderer.render(scene, camera);
        } catch (renderError) {
            console.error("!!! Error during rendering:", renderError);
            gameStarted = false; // Stop the game on critical render error
             // Optionally display a more user-friendly error message
             alert("A rendering error occurred. Please reload the page.");
        }
    } else {
        // Avoid spamming console if components aren't ready yet (e.g., during init)
        // console.warn("Render skipped: renderer, scene, or camera not ready.");
    }
}

// --- Start Initialization ---
// Wrap the initial call in a try...catch to handle errors during setup
try {
    init();
} catch (initError) {
    console.error("!!! Error during Initialization (init function):", initError);
    // Display error to user in the HTML body
    document.body.innerHTML = `<div style="color: red; padding: 20px;">Initialization Error: ${initError.message}<br>Check console (F12) for technical details.</div>`;
}
