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
        },
        onDisconnect: (reason) => {
            console.log("Network.onDisconnect callback triggered. Reason:", reason);
            gameStarted = false; // Stop game loop via flag
            Object.keys(players).forEach(id => Scene.removePlayer(id));
            players = {};
            activeSceneEffects.forEach(effect => effect.userData?.dispose());
            activeSceneEffects = [];
            localPlayerId = null;
            UI.showMenuScreen(); // Go back to menu
            alert("Disconnected from server: " + reason);
        },
        onAssignId: (id) => {
            console.log("Network.onAssignId callback triggered. ID:", id);
            localPlayerId = id;
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
                return;
            }
            if (!isPartialUpdate) {
                Object.keys(players).forEach(existingId => {
                    if (!state[existingId] && existingId !== localPlayerId) {
                        console.log(`Removing player ${existingId} based on full state update.`);
                        Scene.removePlayer(existingId);
                        delete players[existingId];
                    }
                });
            }
            for (const id in state) {
                if (id === localPlayerId) continue;
                if (!players[id]) {
                    console.log("Network.onStateUpdate: Adding new player from state:", id);
                    players[id] = state[id];
                    Scene.addPlayer(state[id]);
                } else {
                    players[id] = { ...players[id], ...state[id] };
                    Scene.updatePlayerPosition(id, state[id].position, state[id].rotation);
                }
            }
        },
        onPlayerJoined: (playerData) => {
            if (playerData.id === localPlayerId || !gameStarted) return;
            console.log("Network.onPlayerJoined callback triggered:", playerData.id);
            if (!players[playerData.id]) {
                players[playerData.id] = playerData;
                Scene.addPlayer(playerData);
            } else {
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
            const shooterData = players[shooterId] || (shooterId === localPlayerId ? PlayerController.getPlayerState() : null);
            if (shooterData?.position) {
                const mesh = Scene.getPlayerMesh(shooterId);
                let soundPos = shooterData.position;
                if(mesh && mesh.userData.gun) {
                    soundPos = mesh.userData.gun.getWorldPosition(new THREE.Vector3());
                } else if (shooterId === localPlayerId && camera) {
                    const camDir = new THREE.Vector3();
                    camera.getWorldDirection(camDir);
                    soundPos = camera.position.clone().add(camDir.multiplyScalar(0.5));
                }
                Scene.playGunshotSound(soundPos);
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
            const effects = Scene.createDeathExplosion(new THREE.Vector3(position.x, position.y, position.z));
            activeSceneEffects.push(...effects);
            const localAffected = affectedPlayers.find(p => p.id === localPlayerId);
            if (localAffected?.knockback) {
                console.log("Applying knockback to local player");
                PlayerController.applyKnockback(localAffected.knockback);
            }
            if (deadPlayerId !== localPlayerId && players[deadPlayerId]) {
                const mesh = Scene.getPlayerMesh(deadPlayerId);
                if (mesh) mesh.visible = false;
                console.log(`Player ${players[deadPlayerId].name} died visually (hidden).`);
            }
        },
        onRespawn: (data) => {
            if (!gameStarted || !localPlayerId) return;
            console.log("Network.onRespawn callback triggered for local player.");
            if (typeof PlayerController.handleRespawn === 'function') {
                PlayerController.handleRespawn(data);
            }
        },
        onPlayerRespawned: (data) => {
            if (!gameStarted || data.id === localPlayerId) return;
            console.log("Network.onPlayerRespawned callback triggered for remote player:", data.id);
            if (players[data.id]) {
                players[data.id].position = data.position;
                players[data.id].health = data.health;
                const mesh = Scene.getPlayerMesh(data.id);
                if (mesh) {
                    mesh.position.set(data.position.x, data.position.y, data.position.z);
                    mesh.visible = true;
                    console.log(`Player ${players[data.id].name} respawned visually (visible).`);
                } else {
                    console.log(`Player ${data.id} mesh not found on respawn, re-adding.`);
                    Scene.addPlayer(players[data.id]);
                }
            } else {
                console.warn(`Received respawn for unknown player ${data.id}`);
            }
        },
        onApplyPropulsion: (data) => {
            if (!gameStarted) return;
            console.log("Network.onApplyPropulsion callback triggered.");
            if (typeof PlayerController.handleServerPropulsion === 'function') {
                PlayerController.handleServerPropulsion(data);
            }
        },
    });
    console.log("Network connection initiated.");
}

let animationFrameId = null;

function animate() {
    if (!gameStarted) {
        if (animationFrameId) { cancelAnimationFrame(animationFrameId); animationFrameId = null; }
        return;
    }
    animationFrameId = requestAnimationFrame(animate);
    const deltaTime = clock.getDelta();
    const cappedDelta = Math.min(deltaTime, 0.05);
    if (localPlayerId && PlayerController) { PlayerController.updatePlayer(cappedDelta); }
    activeSceneEffects = activeSceneEffects.filter(effect => Scene.updateEffect(effect, cappedDelta));
    for (const id in players) {
        if (id !== localPlayerId) {
            const mesh = Scene.getPlayerMesh(id);
            const serverState = players[id];
            if (mesh && serverState?.position && serverState?.rotation) {
                mesh.position.lerp(new THREE.Vector3(serverState.position.x, serverState.position.y, serverState.position.z), 0.2);
                const targetQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, serverState.rotation.y, 0, 'YXZ'));
                mesh.quaternion.slerp(targetQuat, 0.2);
            }
        }
    }
    if(renderer && scene && camera) {
        try { renderer.render(scene, camera); }
        catch (renderError) { console.error("!!! Error during rendering:", renderError); gameStarted = false; alert("A rendering error occurred. Please reload."); }
    }
}

try { init(); }
catch (initError) { console.error("!!! Error during Initialization (init function):", initError); document.body.innerHTML = `<div style="color: red; padding: 20px;">Initialization Error: ${initError.message}<br>Check console (F12) for technical details.</div>`; }
