// docs/main.js

// --- Configuration ---
const SERVER_URL = 'https://gametest-psxl.onrender.com';
const MAP_PATH = 'assets/maps/map.glb';
const SOUND_PATH_GUNSHOT = 'assets/maps/gunshot.wav'; // User specified path
const PLAYER_MODEL_PATH = 'assets/maps/Shawty1.glb'; // User specified path
const GUN_MODEL_PATH = 'assets/maps/gun2.glb'; // <<<=== UPDATED GUN PATH

const PLAYER_HEIGHT = 1.8;
const PLAYER_RADIUS = 0.4;
const MOVEMENT_SPEED = 5.0;
const MOVEMENT_SPEED_SPRINTING = 8.0;
const BULLET_SPEED = 50;
const GRAVITY = 19.62;
const JUMP_FORCE = 8.0;
const VOID_Y_LEVEL = -30;
const PLAYER_COLLISION_RADIUS = PLAYER_RADIUS;
const KILL_MESSAGE_DURATION = 4000;
const BULLET_LIFETIME = 3000;
// Gun View Model Config
const GUN_POS_OFFSET = new THREE.Vector3(0.3, -0.3, -0.6); // ADJUST THIS
const GUN_SCALE = 0.1; // ADJUST THIS
// Recoil Config
const RECOIL_AMOUNT = new THREE.Vector3(0, 0.02, 0.08); // ADJUST THIS
const RECOIL_RECOVER_SPEED = 15; // ADJUST THIS

// --- Global Variables ---
let gameState = 'loading';
let assetsReady = false;
let mapLoadState = 'loading';
let playerModelLoadState = 'loading';
let gunModelLoadState = 'loading'; // Gun model state
let socket;
let localPlayerId = null;
let localPlayerName = 'Anonymous';
let localPlayerPhrase = '...';
let players = {};
let bullets = [];
let keys = {};
let scene, camera, renderer, controls, clock, loader, dracoLoader;
let mapMesh = null;
let playerModel = null;
let gunModel = null; // Template gun model
let gunViewModel = null; // Instance attached to camera
let velocityY = 0;
let isOnGround = false;
let loadingScreen, homeScreen, gameUI, playerCountSpan, playerNameInput, playerPhraseInput, joinButton, homeScreenError, infoDiv, healthBarFill, healthText, killMessageDiv;
let killMessageTimeout = null;
let gunshotSound;
let frameCount = 0;
let currentRecoilOffset = new THREE.Vector3(0, 0, 0);

// ========================================================
// FUNCTION DEFINITIONS
// ========================================================

// --- Input Handling ---
function onKeyDown(event) {
    keys[event.code] = true;
    if (event.code === 'Space') {
        event.preventDefault();
        if (isOnGround && gameState === 'playing') { velocityY = JUMP_FORCE; isOnGround = false; }
    }
}
function onKeyUp(event) { keys[event.code] = false; }
function onMouseDown(event) {
    if (gameState === 'playing' && !controls?.isLocked) { controls?.lock(); }
    else if (gameState === 'playing' && controls?.isLocked && event.button === 0) { shoot(); }
}

// --- UI State Management ---
function setGameState(newState, options = {}) {
    console.log(`Setting game state to: ${newState}`, options);
    const previousState = gameState;
    loadingScreen = loadingScreen || document.getElementById('loadingScreen');
    homeScreen = homeScreen || document.getElementById('homeScreen');
    gameUI = gameUI || document.getElementById('gameUI');
    const canvas = document.getElementById('gameCanvas');
    if (gameState === newState && !(newState === 'loading' && options.error)) { return; }
    gameState = newState;
    if(loadingScreen) { loadingScreen.style.display = 'none'; loadingScreen.classList.remove('assets', 'error'); const p = loadingScreen.querySelector('p'); if(p) p.style.color = ''; }
    if(homeScreen) { homeScreen.style.display = 'none'; homeScreen.classList.remove('visible'); }
    if(gameUI) { gameUI.style.display = 'none'; gameUI.classList.remove('visible'); }
    if(canvas) canvas.style.display = 'none';
    switch (newState) {
        case 'loading': if(loadingScreen) { /* ... same handling ... */ } break;
        case 'homescreen':
             if(homeScreen) {
                homeScreen.style.display = 'flex'; requestAnimationFrame(() => { homeScreen.classList.add('visible'); });
                playerCountSpan = playerCountSpan || document.getElementById('playerCount'); if(playerCountSpan) playerCountSpan.textContent = options.playerCount ?? playerCountSpan.textContent ?? '?';
                if (controls?.isLocked) { console.log("Unlocking controls for homescreen state."); controls.unlock(); }
                const playerControlsObject = scene?.getObjectByName("PlayerControls"); if (playerControlsObject) { console.log("Removing player controls for homescreen."); scene.remove(playerControlsObject); }
                removeGunViewModel(); // <<<=== REMOVE GUN VIEW MODEL WHEN GOING HOME ===>>>
                joinButton = joinButton || document.getElementById('joinButton'); if(joinButton) { joinButton.disabled = false; joinButton.textContent = "Join Game"; }
            } break;
        case 'joining': /* ... same handling ... */ break;
        case 'playing':
            console.log(">>> Setting state to PLAYING"); const canvasElem = document.getElementById('gameCanvas');
            if(gameUI) { gameUI.style.display = 'block'; requestAnimationFrame(() => { gameUI.classList.add('visible'); }); console.log(">>> Game UI display set."); } else { console.error("! gameUI"); }
            if(canvasElem) { canvasElem.style.display = 'block'; console.log(">>> Canvas display set."); } else { console.error("! gameCanvas"); }
            if (scene && controls) {
                if (!scene.getObjectByName("PlayerControls")) { console.log(">>> Adding player controls object."); controls.getObject().name = "PlayerControls"; scene.add(controls.getObject()); }
                else { console.log(">>> Player controls object already present."); }
                attachGunViewModel(); // <<<=== ATTACH GUN VIEW MODEL HERE ===>>>
                console.log(">>> Pos Check - Cam:", camera?.position.toArray(), "Ctrl:", controls?.getObject()?.position.toArray());
                console.log(">>> Attempting controls.lock()..."); setTimeout(() => { if(gameState === 'playing' && !controls.isLocked) controls.lock(); }, 100);
            } else { console.error("! Scene or Controls missing for playing state!");}
            onWindowResize(); console.log(">>> Game state PLAYING complete.");
            break;
    }
    console.log(`Switched state from ${previousState} to ${gameState}`);
}


// --- Asset Loading ---
function loadSound() { /* ... Same ... */ }
function loadPlayerModel() { /* ... Same ... */ }
function loadGunModel() { // Loads the GUN model
    gunModelLoadState = 'loading'; console.log(`Loading gun model from: ${GUN_MODEL_PATH}`);
    loader.load(GUN_MODEL_PATH, (gltf) => {
        console.log("Gun model loaded successfully!"); gunModel = gltf.scene;
        gunModel.traverse((child) => { if (child.isMesh) { child.castShadow = false; child.receiveShadow = false;} });
        gunModelLoadState = 'loaded'; checkAssetsReady();
    }, undefined, (error) => {
        console.error("!!! FATAL: Error loading gun model:", error); gunModelLoadState = 'error'; checkAssetsReady();
    });
}
function loadMap(mapPath) { /* ... Same ... */ }
function checkAssetsReady() { // Now checks gun model too
    console.log(`checkAssetsReady: Map=${mapLoadState}, PlayerModel=${playerModelLoadState}, GunModel=${gunModelLoadState}`);
    const mapReady = mapLoadState === 'loaded' || mapLoadState === 'error';
    const playerModelReady = playerModelLoadState === 'loaded' || playerModelLoadState === 'error';
    const gunModelReady = gunModelLoadState === 'loaded' || gunModelLoadState === 'error';

    if (mapReady && playerModelReady && gunModelReady) {
        if (mapLoadState === 'error' || playerModelLoadState === 'error' || gunModelLoadState === 'error') {
            assetsReady = false; console.error("Critical asset load failed."); setGameState('loading', { message: "FATAL: Asset Load Error!<br/>Check Console.", error: true });
        } else {
            assetsReady = true; console.log("Assets ready.");
            if (socket?.connected && gameState === 'loading') { console.log("Showing homescreen (Assets+Socket ready)."); setGameState('homescreen', { playerCount: playerCountSpan?.textContent ?? '?' }); }
            else if (gameState === 'joining') { console.log("Assets ready while joining."); sendJoinDetails(); }
        }
    } else { assetsReady = false; }
}

// --- Network & Joining ---
function setupSocketIO() { /* ... Same ... */ }
function attemptJoinGame() { /* ... Same ... */ }
function sendJoinDetails() { /* ... Same ... */ }


// --- Player Management & Model Loading ---
function addPlayer(playerData) {
    // ... (Same core logic, including the scaling section - ADJUST desiredScale!) ...
     console.log(`Adding player ${playerData.id} (${playerData.name})`); if (players[playerData.id] || playerData.id === localPlayerId) return;
     players[playerData.id] = { ...playerData, mesh: null, targetPosition: null, targetRotationY: null };
     if (playerModel && playerModel !== 'error') {
        try {
            const modelInstance = playerModel.clone();
            const desiredScale = 0.8; // <<<=== ADJUST THIS SCALE
            modelInstance.scale.set(desiredScale, desiredScale, desiredScale);
            modelInstance.traverse((child) => { if (child.isMesh) { child.castShadow = true; } });
            const visualY = playerData.y; modelInstance.position.set(playerData.x, visualY, playerData.z); modelInstance.rotation.y = playerData.rotationY;
            scene.add(modelInstance); players[playerData.id].mesh = modelInstance;
            players[playerData.id].targetPosition = modelInstance.position.clone(); players[playerData.id].targetRotationY = modelInstance.rotation.y;
        } catch (e) { console.error(`Error adding model for ${playerData.id}:`, e); addPlayerFallbackMesh(playerData); }
     } else { console.warn(`Player model fail/pending, using fallback for ${playerData.id}`); addPlayerFallbackMesh(playerData); }
}
function addPlayerFallbackMesh(playerData) { /* ... Same ... */ }
function removePlayerMesh(playerId) { /* ... Same ... */ }
function updateRemotePlayerPosition(playerData) { /* ... Same ... */ }

// --- Game Logic Update Loop ---
function updatePlayer(deltaTime) {
    if (gameState !== 'playing' || !controls?.isLocked || !localPlayerId || !players[localPlayerId]) return;
    const playerObject = controls.getObject(); const playerState = players[localPlayerId];
    if (!playerState || playerState.health <= 0) return;

    const currentSpeed = keys['ShiftLeft'] ? MOVEMENT_SPEED_SPRINTING : MOVEMENT_SPEED; const speed = currentSpeed * deltaTime;
    const previousPosition = playerObject.position.clone();

    // Apply Gravity & Vertical Movement
    velocityY -= GRAVITY * deltaTime; playerObject.position.y += velocityY * deltaTime;

    // Apply Horizontal Movement using controls
    if (keys['KeyW']) { controls.moveForward(speed); } if (keys['KeyS']) { controls.moveForward(-speed); }
    if (keys['KeyA']) { controls.moveRight(-speed); } if (keys['KeyD']) { controls.moveRight(speed); }

    // Player Collision Check & Revert
    const currentPosition = playerObject.position;
    for (const id in players) { /* ... Same collision check/revert ... */ }

    // Ground Check & Correction
    let groundY = 0; // TODO: Replace with map raycasting
    if (playerObject.position.y < groundY + PLAYER_HEIGHT) { playerObject.position.y = groundY + PLAYER_HEIGHT; if (velocityY < 0) velocityY = 0; isOnGround = true; }
    else { isOnGround = false; }

    // Void Check
    if (playerObject.position.y < VOID_Y_LEVEL && playerState.health > 0) { /* ... Same void handling ... */ }

    // Update View Model (Gun Recoil/Position)
    updateViewModel(deltaTime); // <<<=== CALL VIEW MODEL UPDATE

    // Send Updates To Server
    const logicalPosition = playerObject.position.clone(); logicalPosition.y -= PLAYER_HEIGHT;
    const lastSentState = players[localPlayerId];
    const positionChanged = logicalPosition.distanceToSquared(new THREE.Vector3(lastSentState?.x??0, lastSentState?.y??0, lastSentState?.z??0)) > 0.001;
    const cameraRotation = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ'); const currentRotationY = cameraRotation.y;
    const rotationChanged = Math.abs(currentRotationY - (lastSentState?.rotationY ?? 0)) > 0.01;
    if (positionChanged || rotationChanged) { /* ... Same update sending ... */ }
}

// --- View Model Update (Recoil) ---
function updateViewModel(deltaTime) {
    if (!gunViewModel || !camera) return;

    // Lerp recoil back to zero
    currentRecoilOffset.lerp(new THREE.Vector3(0, 0, 0), deltaTime * RECOIL_RECOVER_SPEED);

    // Final position = base offset + recoil offset
    const finalGunPos = GUN_POS_OFFSET.clone().add(currentRecoilOffset);
    gunViewModel.position.copy(finalGunPos); // Set position relative to camera parent

    // Make gun follow camera rotation
    gunViewModel.rotation.copy(camera.rotation); // Simple copy (may need adjustments based on model export)
    // Optional: Add Y rotation if gun needs initial correction
    // gunViewModel.rotation.y += Math.PI; // Example: Rotate 180 degrees if facing backward
}

// Attach/Remove View Model
function attachGunViewModel() {
     if (!gunModel || gunModel === 'error' || !camera) { console.error("! Gun template/camera not ready for view model."); return; }
     if (gunViewModel) return; // Already attached
     gunViewModel = gunModel.clone();
     gunViewModel.scale.set(GUN_SCALE, GUN_SCALE, GUN_SCALE); // Set scale
     gunViewModel.position.copy(GUN_POS_OFFSET); // Set initial position
     // gunViewModel.rotation.set(x, y, z); // Set initial rotation if needed
     camera.add(gunViewModel); // CHILD OF CAMERA
     console.log("Gun view model attached to camera.");
}
function removeGunViewModel() {
     if (gunViewModel && camera) {
          camera.remove(gunViewModel); // Remove from camera parent
          gunViewModel = null;
          console.log("Gun view model removed.");
     }
}


// --- Shoot, Bullet, Interpolation, UI, Event Handlers ---
function shoot() {
    console.log("Attempting to shoot...");
    if (gameState !== 'playing' || !socket || !localPlayerId || !controls?.isLocked || !players[localPlayerId] || players[localPlayerId].health <= 0) {
         console.log(`Shoot conditions not met...`); return;
    }

    currentRecoilOffset.copy(RECOIL_AMOUNT); // Trigger recoil

    if (gunshotSound) { /* ... play sound ... */ }

    const bulletPosition = new THREE.Vector3();
    const bulletDirection = new THREE.Vector3();
    if (!camera) { console.error("! Camera missing!"); return; }

    // Spawn bullet near gun muzzle visually, aim from camera center
    if (gunViewModel) {
         // Approximate muzzle position (might need adjusting based on gun model)
         const muzzleOffset = new THREE.Vector3(0, -0.05, -0.5); // Offset from GUN's origin (Forward Z is negative)
         muzzleOffset.applyQuaternion(camera.quaternion); // Rotate offset by camera rotation
         bulletPosition.copy(camera.position).add(muzzleOffset); // Start near muzzle
         console.log("Bullet origin from gunViewModel estimate.");
    } else {
         camera.getWorldPosition(bulletPosition); // Fallback to camera center
          console.log("Bullet origin from camera (gunViewModel missing).");
    }
    // ALWAYS use camera direction for aim
    camera.getWorldDirection(bulletDirection);

    console.log("Emitting 'shoot' event.");
    socket.emit('shoot', {
        position: { x: bulletPosition.x, y: bulletPosition.y, z: bulletPosition.z },
        direction: { x: bulletDirection.x, y: bulletDirection.y, z: bulletDirection.z }
    });
    console.log("Shoot emitted.");
}

function spawnBullet(bulletData) { /* ... Same as previous ... */ }
function updateBullets(deltaTime) { /* ... Same as previous (ensure damage logic uses socket.emit) ... */ }
function updateOtherPlayers(deltaTime) { /* ... Same ... */ }
function updateHealthBar(health) { /* ... Same ... */ }
function showKillMessage(message) { /* ... Same ... */ }
function handlePlayerJoined(playerData) { /* ... Same ... */ }
function handlePlayerLeft(playerId) { /* ... Same ... */ }
function handleHealthUpdate(data) { /* ... Same ... */ }
function handlePlayerDied(data) { /* ... Same ... */ }
function handlePlayerRespawned(playerData) { /* ... Same ... */ }

// --- Animation Loop ---
function animate() { /* ... Same ... */ }

// --- Utility Functions ---
function onWindowResize() { /* ... Same ... */ }


// ========================================================
// INITIALIZATION FUNCTION DEFINITION
// ========================================================
function init() {
    console.log("Initializing Shawty...");
    // --- Get UI Elements & ADD NULL CHECKS ---
    loadingScreen = document.getElementById('loadingScreen'); if (!loadingScreen) { console.error("! 'loadingScreen'"); return; }
    homeScreen = document.getElementById('homeScreen'); if (!homeScreen) { console.error("! 'homeScreen'"); return; }
    gameUI = document.getElementById('gameUI'); if (!gameUI) { console.error("! 'gameUI'"); return; }
    playerCountSpan = document.getElementById('playerCount'); if (!playerCountSpan) { console.error("! 'playerCount'"); return; }
    playerNameInput = document.getElementById('playerNameInput'); if (!playerNameInput) { console.error("! 'playerNameInput'"); return; }
    playerPhraseInput = document.getElementById('playerPhraseInput'); if (!playerPhraseInput) { console.error("! 'playerPhraseInput'"); return; }
    joinButton = document.getElementById('joinButton'); if (!joinButton) { console.error("! 'joinButton'"); return; }
    homeScreenError = document.getElementById('homeScreenError'); if (!homeScreenError) { console.error("! 'homeScreenError'"); return; }
    infoDiv = document.getElementById('info'); if (!infoDiv) { console.error("! 'info'"); return; }
    healthBarFill = document.getElementById('healthBarFill'); if (!healthBarFill) { console.error("! 'healthBarFill'"); return; }
    healthText = document.getElementById('healthText'); if (!healthText) { console.error("! 'healthText'"); return; }
    killMessageDiv = document.getElementById('killMessage'); if (!killMessageDiv) { console.error("! 'killMessage'"); return; }
    const canvas = document.getElementById('gameCanvas'); if (!canvas) { console.error("! 'gameCanvas'"); return; }
    console.log("All required UI elements found.");
    // -----------------------------------------

    setGameState('loading');

    // --- Basic Three.js Setup ---
    try { /* ... Same ... */ } catch (e) { /* ... error handling ... */ return; }

    // --- Lighting ---
    try { /* ... Same ... */ } catch(e) { /* ... error handling ... */ return; }

    // --- Controls ---
    try {
        controls = new THREE.PointerLockControls(camera, document.body);
        controls.addEventListener('lock', () => console.log('Pointer Locked'));
        // Revised unlock listener - DOES NOT CHANGE STATE
        controls.addEventListener('unlock', () => {
            console.log('Pointer Unlocked (Escape pressed or focus lost)');
        });
        console.log("PointerLockControls initialized.");
    } catch (e) { /* ... error handling ... */ return; }

    // --- Start Loading Assets & Connecting ---
    console.log("Starting asset loading and socket connection...");
    loadSound();
    loadPlayerModel();
    loadGunModel(); // Load the gun model
    loadMap(MAP_PATH);
    setupSocketIO();

    // --- Add Event Listeners ---
    console.log("Adding event listeners...");
    joinButton?.addEventListener('click', attemptJoinGame);
    window.addEventListener('resize', onWindowResize);
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    document.addEventListener('mousedown', onMouseDown);
    console.log("Event listeners added.");

    // --- Start animation loop ---
    console.log("Starting animation loop.");
    animate();
}


// ========================================================
// --- START THE APPLICATION (Call init) ---
// ========================================================
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
