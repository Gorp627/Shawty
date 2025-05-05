// docs/js/main.js
import * as THREE from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.module.js'; // Using CDN URL
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
    UI.showLoadingScreen();
    const canvas = document.getElementById('gameCanvas');
    // Pass onAssetsLoaded callback to initScene
    const sceneData = Scene.initScene(canvas, onAssetsLoaded);
    renderer = sceneData.renderer;
    camera = sceneData.camera;
    scene = sceneData.scene;
    // Asset loading is async, wait for the callback
}

function onAssetsLoaded() {
    console.log("Assets loaded, showing menu.");
    UI.updateLoadingProgress(1);
    UI.showMenuScreen();
    UI.onPlayButtonClick(() => {
        const playerName = UI.getPlayerName();
        console.log("Play button clicked, joining game as:", playerName);
        startGame(playerName);
    });
}

function startGame(playerName) {
    UI.showGameScreen();

    Network.connectToServer(SERVER_URL, playerName, {
        onConnect: () => console.log("Network connected successfully."),
        onDisconnect: () => {
            console.log("Network disconnected.");
            alert("Disconnected from server!");
            gameStarted = false;
            UI.showMenuScreen();
            Object.keys(players).forEach(id => Scene.removePlayer(id));
            players = {};
            localPlayerId = null;
            // Maybe stop animation loop here? cancelAnimationFrame?
        },
        onAssignId: (id) => {
            console.log("Received player ID:", id);
            localPlayerId = id;
            // Init controller AFTER getting ID and AFTER assets are loaded (implicitly true by now)
            PlayerController.initPlayerController(camera, renderer.domElement, localPlayerId);
            gameStarted = true;
            animate(); // Start the game loop
        },
        onStateUpdate: (state, isPartialUpdate) => {
            if (!gameStarted && !isPartialUpdate) { // Avoid processing before game start unless it's the initial state
                 console.log("Received initial state:", state);
            } else if (!gameStarted && isPartialUpdate){
                console.warn("Received partial update before game started, ignoring.");
                return;
            }

             if (!isPartialUpdate) {
                 Object.keys(players).forEach(existingId => {
                     if (!state[existingId] && existingId !== localPlayerId) {
                         Scene.removePlayer(existingId);
                         delete players[existingId];
                     }
                 });
             }

            for (const id in state) {
                if (id === localPlayerId) continue; // Ignore updates for self for now

                if (!players[id]) { // New player
                    console.log("Adding new player from state:", id);
                    players[id] = state[id];
                    Scene.addPlayer(state[id]);
                } else { // Update existing
                     players[id] = { ...players[id], ...state[id] }; // Merge new data
                    Scene.updatePlayerPosition(id, state[id].position, state[id].rotation);
                    // TODO: Update other state if needed (health bars etc.)
                }
            }
        },
        onPlayerJoined: (playerData) => {
            if (playerData.id === localPlayerId || !gameStarted) return;
             console.log("Handling player joined event:", playerData.id);
             if (!players[playerData.id]) {
                players[playerData.id] = playerData;
                Scene.addPlayer(playerData);
             } else {
                 players[playerData.id] = { ...players[playerData.id], ...playerData };
                 Scene.updatePlayerPosition(playerData.id, playerData.position, playerData.rotation);
             }
        },
        onPlayerLeft: (playerId) => {
            if (playerId === localPlayerId || !gameStarted) return;
             console.log("Handling player left event:", playerId);
            if (players[playerId]) {
                Scene.removePlayer(playerId);
                delete players[playerId];
            }
        },
        onPlayerShot: (data) => {
            if (!gameStarted) return;
            const shooterId = data.shooterId;
            const shooterData = players[shooterId] || (shooterId === localPlayerId ? PlayerController.getPlayerState() : null);
            if (shooterData) {
                 const mesh = Scene.getPlayerMesh(shooterId);
                 let soundPos = shooterData.position; // Default to player pos
                 if(mesh && mesh.userData.gun) {
                     soundPos = mesh.userData.gun.getWorldPosition(new THREE.Vector3());
                 } else if (shooterId === localPlayerId) {
                     const camDir = new THREE.Vector3();
                     camera.getWorldDirection(camDir);
                     soundPos = camera.position.clone().add(camDir.multiplyScalar(0.5));
                 }
                 Scene.playGunshotSound(soundPos);
                 // TODO: Add muzzle flash/tracer
            }
        },
         onPlayerDied: (data) => {
            if (!gameStarted) return;
            console.log("Main handling playerDied:", data);
             const { deadPlayerId, position, affectedPlayers } = data;

             // Visual/Audio effect for death
             const effects = Scene.createDeathExplosion(new THREE.Vector3(position.x, position.y, position.z));
             activeSceneEffects.push(...effects);

             // Apply knockback if local player is affected
             const localAffected = affectedPlayers.find(p => p.id === localPlayerId);
             if (localAffected) {
                 PlayerController.applyKnockback(localAffected.knockback);
             }

             // Hide remote player mesh (will reappear on respawn)
             if (deadPlayerId !== localPlayerId && players[deadPlayerId]) {
                 const mesh = Scene.getPlayerMesh(deadPlayerId);
                 if (mesh) mesh.visible = false;
                 // We don't delete from `players` here, just hide visually
                 console.log(`Player ${players[deadPlayerId].name} died visually.`);
             }
             // Local player death is handled in playerController via handleDeath()
        },
         onRespawn: (data) => { // For local player respawn
            if (!gameStarted) return;
            if (localPlayerId && typeof PlayerController.handleRespawn === 'function') {
                PlayerController.handleRespawn(data);
            }
        },
         onPlayerRespawned: (data) => { // For remote players respawning
             if (!gameStarted || data.id === localPlayerId) return;
             if (players[data.id]) {
                 console.log(`Player ${players[data.id].name} respawned visually.`);
                 players[data.id].position = data.position;
                 players[data.id].health = data.health;
                 const mesh = Scene.getPlayerMesh(data.id);
                 if (mesh) {
                     mesh.position.set(data.position.x, data.position.y, data.position.z);
                     mesh.visible = true; // Make visible again
                 } else {
                     // Player mesh might have been removed somehow, re-add
                     Scene.addPlayer(players[data.id]);
                 }
             }
         },
          onApplyPropulsion: (data) => {
            if (!gameStarted) return;
            PlayerController.handleServerPropulsion(data); // Pass to controller
        },
    });
}

// Game Loop
function animate() {
    if (!gameStarted) return; // Stop loop if disconnected

    const animationFrameId = requestAnimationFrame(animate); // Store ID for potential cancellation

    const deltaTime = clock.getDelta();

    // Update local player FIRST
    if (localPlayerId) {
        PlayerController.updatePlayer(deltaTime);
    }

    // Update scene effects
    activeSceneEffects = activeSceneEffects.filter(effect => Scene.updateEffect(effect, deltaTime));

    // Interpolate other players (optional but smoother)
     for (const id in players) {
         if (id !== localPlayerId) {
             const mesh = Scene.getPlayerMesh(id);
             const serverState = players[id];
             if (mesh && serverState?.position && serverState?.rotation) {
                  // Position interpolation
                  mesh.position.lerp(new THREE.Vector3(serverState.position.x, serverState.position.y, serverState.position.z), 0.2); // Adjust lerp factor (0.1 to 0.3 typical)

                  // Rotation interpolation (using quaternions is better)
                  const targetQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, serverState.rotation.y, 0, 'YXZ')); // Only Y rotation
                  mesh.quaternion.slerp(targetQuat, 0.2);
             }
         }
     }

    // Render
    if(renderer && scene && camera) {
        renderer.render(scene, camera);
    }
}

// --- Start Initialization ---
init();
