// docs/js/main.js - MODIFIED FOR DEBUGGING (Imports Commented Out)

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.module.js'; // Keep THREE import
// import * as Scene from './scene.js'; // <-- Commented out
// import * as Network from './network.js'; // <-- Commented out
// import * as PlayerController from './playerController.js'; // <-- Commented out
// import * as UI from './ui.js'; // <-- Commented out

let renderer, camera, scene; // Keep declarations, but they might not be assigned
let localPlayerId = null;
let gameStarted = false;
let players = {}; // Store data for all players { id: data }
let activeSceneEffects = []; // Effects like explosions needing animation
const clock = new THREE.Clock(); // Keep clock, it's used directly

const SERVER_URL = 'https://gametest-psxl.onrender.com'; // Your Render server URL

function init() {
    console.log("DEBUG: init() called.");
    console.log("Initializing UI (Simplified)...");
    // UI.showLoadingScreen(); // Commented out

    // Try to get canvas, but don't rely on it heavily for this test
    const canvas = document.getElementById('gameCanvas');
    if (!canvas) {
        console.error("Failed to find canvas element!");
        // Don't return immediately, let the test continue
    } else {
        console.log("Canvas element found.");
    }

    console.log("Initializing Scene (Simplified)...");
    // Pass onAssetsLoaded callback to initScene - SKIPPED
    // const sceneData = Scene.initScene(canvas, onAssetsLoaded); // Commented out
    // if (!sceneData) { // Add check if scene init failed
    //     console.error("Scene initialization failed!");
    //      document.body.innerHTML = `<div style="color: red; padding: 20px;">Scene Initialization Error!<br>Check console for details.</div>`;
    //     return;
    // }
    // renderer = sceneData.renderer; // Commented out
    // camera = sceneData.camera; // Commented out
    // scene = sceneData.scene; // Commented out
    console.log("Scene initialization skipped for debugging.");

    // Asset loading is async, wait for the callback 'onAssetsLoaded'
    // Manually call onAssetsLoaded for this debugging step
    console.log("DEBUG: Manually calling onAssetsLoaded...");
    onAssetsLoaded();
}

function onAssetsLoaded() {
    console.log("DEBUG: onAssetsLoaded() called.");
    console.log("Assets loaded callback triggered (Simplified), showing menu.");
    // UI.updateLoadingProgress(1); // Commented out
    // UI.showMenuScreen(); // Commented out
    console.log("UI calls skipped.");

    // Setup play button listener - Keep listener to test startGame trigger
    const playButton = document.getElementById('playButton');
    if(playButton) {
        playButton.addEventListener('click', () => {
             const playerName = "DEBUG_PLAYER"; // Use dummy name
             console.log("DEBUG: Play button clicked, attempting to start game as:", playerName);
             startGame(playerName);
        });
        console.log("DEBUG: Play button listener added.");
    } else {
        console.error("DEBUG: Play button not found.");
    }

    console.log("Menu setup complete (Simplified).");
}

function startGame(playerName) {
    console.log("DEBUG: startGame() called with name:", playerName);
    console.log("Showing game screen (Simplified)...");
    // UI.showGameScreen(); // Commented out
    console.log("UI showGameScreen skipped.");

    console.log("Connecting to network (Simplified)...");
    // Network.connectToServer(SERVER_URL, playerName, { // Commented out entire block
    //     onConnect: () => {
    //         console.log("Network.onConnect callback triggered.");
    //     },
    //     onDisconnect: (reason) => {
    //         console.log("Network.onDisconnect callback triggered. Reason:", reason);
    //         gameStarted = false;
    //         // ... (rest of disconnect logic) ...
    //         // UI.showMenuScreen();
    //         alert("Disconnected from server: " + reason);
    //     },
    //     onAssignId: (id) => {
    //         console.log("Network.onAssignId callback triggered. ID:", id);
    //         localPlayerId = id;
    //         console.log("Initializing PlayerController (Simplified)...");
    //         // PlayerController.initPlayerController(camera, renderer.domElement, localPlayerId); // Commented out
    //         console.log("PlayerController initialization skipped.");
    //         gameStarted = true;
    //         console.log("Starting animation loop (Simplified)...");
    //         animate();
    //     },
    //     onStateUpdate: (state, isPartialUpdate) => {
    //         console.log("DEBUG: onStateUpdate received (logic skipped).");
    //     },
    //     onPlayerJoined: (playerData) => {
    //         console.log("DEBUG: onPlayerJoined received (logic skipped).");
    //     },
    //     onPlayerLeft: (playerId) => {
    //         console.log("DEBUG: onPlayerLeft received (logic skipped).");
    //     },
    //     onPlayerShot: (data) => {
    //          console.log("DEBUG: onPlayerShot received (logic skipped).");
    //     },
    //     onPlayerDied: (data) => {
    //          console.log("DEBUG: onPlayerDied received (logic skipped).");
    //     },
    //     onRespawn: (data) => {
    //          console.log("DEBUG: onRespawn received (logic skipped).");
    //     },
    //     onPlayerRespawned: (data) => {
    //          console.log("DEBUG: onPlayerRespawned received (logic skipped).");
    //     },
    //     onApplyPropulsion: (data) => {
    //          console.log("DEBUG: onApplyPropulsion received (logic skipped).");
    //     },
    // }); // End of commented out Network.connectToServer block
    console.log("Network connection skipped.");

    // Manually start animation loop for debugging, even without network ID
    gameStarted = true;
    console.log("DEBUG: Manually starting animation loop...");
    animate();
}

let animationFrameId = null;

function animate() {
    // console.log("DEBUG: animate() loop running."); // This would be very spammy
    if (!gameStarted) {
        if (animationFrameId) { cancelAnimationFrame(animationFrameId); animationFrameId = null; }
        return;
    }
    animationFrameId = requestAnimationFrame(animate);
    const deltaTime = clock.getDelta();
    const cappedDelta = Math.min(deltaTime, 0.05);

    // if (localPlayerId && PlayerController) { PlayerController.updatePlayer(cappedDelta); } // Commented out
    // activeSceneEffects = activeSceneEffects.filter(effect => Scene.updateEffect(effect, cappedDelta)); // Commented out

    // Player interpolation loop - Commented out
    // for (const id in players) {
    //     if (id !== localPlayerId) {
    //         // const mesh = Scene.getPlayerMesh(id); // Commented out
    //         const serverState = players[id];
    //         // if (mesh && serverState?.position && serverState?.rotation) { // Commented out
    //             // mesh.position.lerp(...) // Commented out
    //             // mesh.quaternion.slerp(...) // Commented out
    //         // }
    //     }
    // }

    // Rendering - Commented out as renderer, scene, camera are not initialized here
    // if(renderer && scene && camera) {
    //     try { renderer.render(scene, camera); }
    //     catch (renderError) { console.error("!!! Error during rendering:", renderError); gameStarted = false; alert("A rendering error occurred. Please reload."); }
    // }

    // Minimal work in loop for testing:
     if (performance.now() % 1000 < 20) { // Log roughly once per second
          console.log("DEBUG: Animation loop tick.");
     }
}

// --- Initial Entry Point ---
try {
    console.log("DEBUG: Starting initialization...");
    init();
    console.log("DEBUG: init() finished.");
}
catch (initError) {
    console.error("!!! Error during Initialization (init function):", initError);
    document.body.innerHTML = `<div style="color: red; padding: 20px;">Initialization Error: ${initError.message}<br>Check console (F12) for technical details.</div>`;
}
