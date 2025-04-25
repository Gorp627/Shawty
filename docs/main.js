// docs/main.js

// --- Configuration ---
const SERVER_URL = 'https://gametest-psxl.onrender.com';
const MAP_PATH = 'assets/maps/map.glb';
const SOUND_PATH_GUNSHOT = 'assets/maps/gunshot.wav'; // User specified path
const PLAYER_MODEL_PATH = 'assets/maps/Shawty1.glb'; // User specified path

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
const BULLET_LIFETIME = 3000; // ms for bullet to exist

// --- Global Variables ---
let gameState = 'loading';
let assetsReady = false;
let mapLoadState = 'loading';
let playerModelLoadState = 'loading';
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
let velocityY = 0;
let isOnGround = false;
let loadingScreen, homeScreen, gameUI, playerCountSpan, playerNameInput, playerPhraseInput, joinButton, homeScreenError, infoDiv, healthBarFill, healthText, killMessageDiv;
let killMessageTimeout = null;
let gunshotSound;

// ========================================================
// FUNCTION DEFINITIONS
// ========================================================

// --- Input Handling ---
function onKeyDown(event) {
    keys[event.code] = true;
    if (event.code === 'Space') {
        event.preventDefault();
        if (isOnGround && gameState === 'playing') {
            velocityY = JUMP_FORCE;
            isOnGround = false;
        }
    }
    // We handle Escape via the 'unlock' event listener on controls
}

function onKeyUp(event) {
    keys[event.code] = false;
}

function onMouseDown(event) {
    console.log(`Mouse down event. State: ${gameState}, Locked: ${controls?.isLocked}, Button: ${event.button}`);
    if (gameState === 'playing' && controls?.isLocked && event.button === 0) {
        shoot();
    }
}

// --- UI State Management ---
function setGameState(newState, options = {}) {
    console.log(`Setting game state to: ${newState}`, options);
    const previousState = gameState;

    loadingScreen = loadingScreen || document.getElementById('loadingScreen');
    homeScreen = homeScreen || document.getElementById('homeScreen');
    gameUI = gameUI || document.getElementById('gameUI');
    const canvas = document.getElementById('gameCanvas');

    if (gameState === newState && !(newState === 'loading' && options.error)) {
        return;
    }
    gameState = newState;

    if(loadingScreen) { loadingScreen.style.display = 'none'; loadingScreen.classList.remove('assets', 'error'); const p = loadingScreen.querySelector('p'); if(p) p.style.color = ''; }
    if(homeScreen) { homeScreen.style.display = 'none'; homeScreen.classList.remove('visible'); }
    if(gameUI) { gameUI.style.display = 'none'; gameUI.classList.remove('visible'); }
    if(canvas) canvas.style.display = 'none';

    switch (newState) {
        case 'loading':
            if(loadingScreen) {
                loadingScreen.style.display = 'flex';
                const p = loadingScreen.querySelector('p');
                if (p) p.innerHTML = options.message || 'Loading...';
                if (options.assets) loadingScreen.classList.add('assets');
                if (options.error && p) {
                     p.style.color = '#e74c3c';
                     loadingScreen.classList.add('error');
                }
            }
            break;
        case 'homescreen':
             if(homeScreen) {
                homeScreen.style.display = 'flex';
                requestAnimationFrame(() => { homeScreen.classList.add('visible'); });
                playerCountSpan = playerCountSpan || document.getElementById('playerCount');
                if(playerCountSpan) playerCountSpan.textContent = options.playerCount ?? playerCountSpan.textContent ?? '?';
                // Ensure pointer is unlocked when showing homescreen
                if (controls?.isLocked) {
                     console.log("Unlocking controls for homescreen state.");
                     controls.unlock(); // This might trigger the unlock listener, but that's ok now
                }
                const playerControlsObject = scene?.getObjectByName("PlayerControls");
                if (playerControlsObject) {
                     console.log("Removing player controls from scene for homescreen.");
                     scene.remove(playerControlsObject);
                }
                joinButton = joinButton || document.getElementById('joinButton');
                if(joinButton) {
                    // *** Ensure Join button is re-enabled ***
                    joinButton.disabled = false;
                    joinButton.textContent = "Join Game";
                    console.log("Join button re-enabled for homescreen.");
                }
            }
            break;
        case 'joining':
             joinButton = joinButton || document.getElementById('joinButton');
             if(joinButton) {
                joinButton.disabled = true;
                joinButton.textContent = "Joining...";
             }
             if(options.waitingForAssets) {
                 setGameState('loading', { message: "Loading Assets...", assets: true });
             }
            break;
        case 'playing':
            console.log(">>> Setting state to PLAYING");
            const canvasElem = document.getElementById('gameCanvas');

            if(gameUI) {
                gameUI.style.display = 'block';
                requestAnimationFrame(() => { gameUI.classList.add('visible'); });
                console.log(">>> Game UI display set to block, visibility triggered.");
            } else { console.error(">>> gameUI element not found!"); }

            if(canvasElem) {
                 canvasElem.style.display = 'block';
                 console.log(">>> Canvas display set to block.");
            } else { console.error(">>> gameCanvas element not found!"); }

            if (scene && controls) {
                if (!scene.getObjectByName("PlayerControls")) {
                    console.log(">>> Adding player controls object to scene.");
                    controls.getObject().name = "PlayerControls";
                    scene.add(controls.getObject());
                } else { console.log(">>> Player controls object already in scene."); }
                 console.log(">>> Position Check - Camera:", camera?.position.toArray());
                 console.log(">>> Position Check - Controls Object:", controls?.getObject()?.position.toArray());

                console.log(">>> Attempting controls.lock()...");
                 // Slight delay might help ensure focus is ready for lock
                 setTimeout(() => { if(gameState === 'playing' && !controls.isLocked) controls.lock(); }, 100);
            } else { console.error(">>> Scene or Controls not ready when setting state to playing!");}

            onWindowResize();
            console.log(">>> Game state set to PLAYING complete.");
            break;
    }
     console.log(`Switched state from ${previousState} to ${gameState}`);
}


// --- Asset Loading ---
function loadSound() { /* ... Same as previous ... */ }
function loadPlayerModel() { /* ... Same as previous ... */ }
function loadMap(mapPath) { /* ... Same as previous ... */ }
function checkAssetsReady() { /* ... Same as previous ... */ }

// --- Network & Joining ---
function setupSocketIO() { /* ... Same as previous ... */ }
function attemptJoinGame() { /* ... Same as previous ... */ }
function sendJoinDetails() { /* ... Same as previous ... */ }


// --- Player Management & Model Loading ---
function addPlayer(playerData) {
    console.log(`Adding player ${playerData.id} (${playerData.name})`);
    if (players[playerData.id] || playerData.id === localPlayerId) return;

    players[playerData.id] = { ...playerData, mesh: null, targetPosition: null, targetRotationY: null };

    if (playerModel && playerModel !== 'error') {
        try {
            const modelInstance = playerModel.clone();
            console.log(`Cloned model for player ${playerData.id}`);

            // <<< --- ADJUST SCALING SIGNIFICANTLY --- >>>
            // Start very small and increase if needed
            const desiredScale = 0.08; // Try much smaller values like 0.1, 0.08, 0.05 etc.
            modelInstance.scale.set(desiredScale, desiredScale, desiredScale);
            console.log(`Scaled model instance to ${desiredScale}`);
            // <<< ---------------------------------- >>>

            modelInstance.traverse((child) => { if (child.isMesh) { child.castShadow = true; } });

            const visualY = playerData.y; // Assume model origin at feet
            modelInstance.position.set(playerData.x, visualY, playerData.z);
            modelInstance.rotation.y = playerData.rotationY;
            scene.add(modelInstance);
            players[playerData.id].mesh = modelInstance;
            players[playerData.id].targetPosition = modelInstance.position.clone();
            players[playerData.id].targetRotationY = modelInstance.rotation.y;
        } catch (e) {
            console.error(`Error cloning/adding model for ${playerData.id}:`, e);
            addPlayerFallbackMesh(playerData);
        }
    } else {
        console.warn(`Player model not ready/failed, using fallback for ${playerData.id}`);
        addPlayerFallbackMesh(playerData);
    }
}

function addPlayerFallbackMesh(playerData) { /* ... Same ... */ }
function removePlayerMesh(playerId) { /* ... Same ... */ }
function updateRemotePlayerPosition(playerData) { /* ... Same ... */ }

// --- Game Logic Update Loop ---
function updatePlayer(deltaTime) {
    if (gameState !== 'playing' || !controls?.isLocked || !localPlayerId || !players[localPlayerId]) return;
    const playerObject = controls.getObject();
    const playerState = players[localPlayerId];
    if (!playerState || playerState.health <= 0) return;

    const currentSpeed = keys['ShiftLeft'] ? MOVEMENT_SPEED_SPRINTING : MOVEMENT_SPEED;
    const speed = currentSpeed * deltaTime;

    // --- Input Direction ---
    // Store intended movement direction based on keys
    const moveDirection = new THREE.Vector3();
    if (keys['KeyW']) { moveDirection.z = -1; } // Intend Forward
    if (keys['KeyS']) { moveDirection.z = 1; }  // Intend Backward
    if (keys['KeyA']) { moveDirection.x = -1; } // Intend Strafe Left
    if (keys['KeyD']) { moveDirection.x = 1; }  // Intend Strafe Right
    const isMovingHorizontal = moveDirection.x !== 0 || moveDirection.z !== 0;

    const previousPosition = playerObject.position.clone(); // Store position before movement

    // Apply Gravity first
    velocityY -= GRAVITY * deltaTime;
    playerObject.position.y += velocityY * deltaTime;

    // --- Apply Horizontal Movement ---
    // Use controls.moveForward/Right. Positive distance moves forward/right relative to camera.
    if (isMovingHorizontal) {
        // moveDirection.z is -1 for W (forward), +1 for S (backward)
        // moveDirection.x is -1 for A (left), +1 for D (right)
        // We need to apply speed based on this intention.
        // moveForward positive distance = forward, negative = backward
        // moveRight positive distance = right, negative = left
        controls.moveForward(-moveDirection.z * speed); // Correct: W (-1 * -speed = +speed), S (+1 * -speed = -speed)
        controls.moveRight(moveDirection.x * speed);    // Correct: D (+1 * speed = +speed), A (-1 * speed = -speed)
        // Log the intended directions based on keys
        // console.log(`Intent: Z=${moveDirection.z}, X=${moveDirection.x}`);
    }

    // Collision Detection (Player-Player) - Check position *after* controls have moved it
    const currentPosition = playerObject.position;
    let collisionReverted = false;
    for (const id in players) {
        if (id !== localPlayerId && players[id].mesh && players[id].mesh.visible) {
            const otherPlayerMesh = players[id].mesh;
            const distanceXZ = new THREE.Vector2(currentPosition.x - otherPlayerMesh.position.x, currentPosition.z - otherPlayerMesh.position.z).length();
            if (distanceXZ < PLAYER_COLLISION_RADIUS * 2) {
                console.log("Player collision - reverting horizontal move");
                playerObject.position.x = previousPosition.x;
                playerObject.position.z = previousPosition.z;
                playerObject.position.y = currentPosition.y; // Keep the Y after gravity
                collisionReverted = true;
                break;
            }
        }
    }

    // Ground Check & Correction
    // TODO: Replace with map raycasting
    let groundY = 0;
    if (playerObject.position.y < groundY + PLAYER_HEIGHT) {
        playerObject.position.y = groundY + PLAYER_HEIGHT;
        if (velocityY < 0) velocityY = 0;
        isOnGround = true;
    } else {
        isOnGround = false;
    }

    // Void Check
    if (playerObject.position.y < VOID_Y_LEVEL && playerState.health > 0) {
        console.log("Player fell into void");
        socket.emit('fellIntoVoid');
        playerState.health = 0;
        updateHealthBar(0);
        showKillMessage("You fell into the void.");
    }

    // Send Updates
    const logicalPosition = playerObject.position.clone();
    logicalPosition.y -= PLAYER_HEIGHT;

    const lastSentState = players[localPlayerId];
    const positionChanged = logicalPosition.distanceToSquared(new THREE.Vector3(lastSentState?.x ?? 0, lastSentState?.y ?? 0, lastSentState?.z ?? 0)) > 0.001;
    const cameraRotation = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ');
    const currentRotationY = cameraRotation.y;
    const rotationChanged = Math.abs(currentRotationY - (lastSentState?.rotationY ?? 0)) > 0.01;

    if (positionChanged || rotationChanged) {
        if (lastSentState) {
            lastSentState.x = logicalPosition.x; lastSentState.y = logicalPosition.y; lastSentState.z = logicalPosition.z;
            lastSentState.rotationY = currentRotationY;
        }
        socket.emit('playerUpdate', { x: logicalPosition.x, y: logicalPosition.y, z: logicalPosition.z, rotationY: currentRotationY });
    }
}


// --- Shoot, Bullet, Interpolation, UI, Event Handlers ---
function shoot() {
    console.log("Attempting to shoot...");
    if (gameState !== 'playing' || !socket || !localPlayerId || !controls?.isLocked || !players[localPlayerId] || players[localPlayerId].health <= 0) {
         console.log(`Shoot conditions not met: State=${gameState}, Socket=${!!socket}, ID=${localPlayerId}, Locked=${controls?.isLocked}, PlayerData=${!!players[localPlayerId]}, Health=${players[localPlayerId]?.health}`);
         return;
    }

    if (gunshotSound) {
        try {
            const sound = gunshotSound.cloneNode(); // Clone to allow overlap
            sound.volume = gunshotSound.volume;
            sound.play().catch(e => console.warn("Sound play failed:", e));
            console.log("Gunshot sound played (or attempted).");
        } catch (e) { console.error("Error playing gunshot sound:", e); }
    } else { console.warn("Gunshot sound not available."); }

    const bulletPosition = new THREE.Vector3();
    const bulletDirection = new THREE.Vector3();
    if (!camera) { console.error("Camera not found for shooting!"); return; }
    camera.getWorldPosition(bulletPosition);
    camera.getWorldDirection(bulletDirection);
    // bulletPosition.addScaledVector(bulletDirection, PLAYER_RADIUS * 1.1); // Optional offset

    console.log("Emitting 'shoot' event to server.");
    socket.emit('shoot', {
        position: { x: bulletPosition.x, y: bulletPosition.y, z: bulletPosition.z },
        direction: { x: bulletDirection.x, y: bulletDirection.y, z: bulletDirection.z }
    });
    console.log("Shoot event emitted.");
}

function spawnBullet(bulletData) {
    console.log(`Spawning bullet ${bulletData.bulletId} from ${bulletData.shooterId}`); // Add log
    const geometry = new THREE.SphereGeometry(0.1, 6, 6); // Slightly fewer segments for performance
    const material = new THREE.MeshBasicMaterial({ color: 0xffff00, wireframe: false }); // Ensure wireframe is off
    const mesh = new THREE.Mesh(geometry, material);
    // Set position immediately
    mesh.position.set(bulletData.position.x, bulletData.position.y, bulletData.position.z);
    console.log(`  Initial position: ${mesh.position.x.toFixed(2)}, ${mesh.position.y.toFixed(2)}, ${mesh.position.z.toFixed(2)}`);

    const velocity = new THREE.Vector3(
        bulletData.direction.x, bulletData.direction.y, bulletData.direction.z
    ).normalize().multiplyScalar(BULLET_SPEED);

    bullets.push({
        id: bulletData.bulletId, mesh: mesh, velocity: velocity,
        ownerId: bulletData.shooterId, spawnTime: Date.now()
    });
    scene.add(mesh); // *** Add to scene ***
    console.log(`  Bullet mesh added to scene.`);
}

function updateBullets(deltaTime) {
    const bulletsToRemoveIndexes = [];
    for (let i = bullets.length - 1; i >= 0; i--) {
        const bullet = bullets[i];
        if (!bullet || !bullet.mesh) continue; // Safety check

        // Move bullet
        const moveDelta = bullet.velocity.clone().multiplyScalar(deltaTime);
        bullet.mesh.position.add(moveDelta);
        // console.log(`Bullet ${bullet.id} pos: ${bullet.mesh.position.x.toFixed(2)}, ${bullet.mesh.position.y.toFixed(2)}, ${bullet.mesh.position.z.toFixed(2)}`); // Very noisy log

        // Client-Side Hit Detection
        let hitDetected = false;
        for (const playerId in players) {
            if (playerId !== bullet.ownerId && players[playerId].mesh && players[playerId].mesh.visible) {
                const playerMesh = players[playerId].mesh;
                const distance = bullet.mesh.position.distanceTo(playerMesh.position);
                const collisionThreshold = PLAYER_RADIUS + 0.1 + (players[playerId].mesh.scale?.x * PLAYER_RADIUS || PLAYER_RADIUS); // Adjust threshold based on scaled player radius
                if (distance < collisionThreshold) {
                    console.log(`Client hit: Bullet ${bullet.id} hit Player ${playerId}`);
                    hitDetected = true;
                    if (bullet.ownerId === localPlayerId) {
                        socket.emit('hit', { targetId: playerId, damage: 10 });
                    }
                    if (!bulletsToRemoveIndexes.includes(i)) bulletsToRemoveIndexes.push(i);
                    scene.remove(bullet.mesh); // Remove visual immediately
                    break;
                }
            }
        }
        if (hitDetected) continue;

        // TODO: Map collision check

        // Bullet lifetime check
        if (Date.now() - bullet.spawnTime > BULLET_LIFETIME) {
            // console.log(`Bullet ${bullet.id} expired.`); // Log expiration
            if (!bulletsToRemoveIndexes.includes(i)) bulletsToRemoveIndexes.push(i);
            scene.remove(bullet.mesh);
        }
    }

    // Remove bullets marked for deletion
    if (bulletsToRemoveIndexes.length > 0) {
         bulletsToRemoveIndexes.sort((a, b) => b - a);
         for (const index of bulletsToRemoveIndexes) {
             // Ensure bullet and mesh exist before trying to remove from array
             if (bullets[index]?.mesh) {
                 // scene.remove(bullets[index].mesh); // Already removed above
             } else {
                 console.warn(`Attempted to remove bullet at index ${index}, but mesh was already gone.`);
             }
             bullets.splice(index, 1);
         }
    }
}

function updateOtherPlayers(deltaTime) { /* ... Same ... */ }
function updateHealthBar(health) { /* ... Same ... */ }
function showKillMessage(message) { /* ... Same ... */ }
function handlePlayerJoined(playerData) { /* ... Same ... */ }
function handlePlayerLeft(playerId) { /* ... Same ... */ }
function handleHealthUpdate(data) { /* ... Same ... */ }
function handlePlayerDied(data) { /* ... Same ... */ }
function handlePlayerRespawned(playerData) { /* ... Same ... */ }

// --- Animation Loop ---
function animate() {
    requestAnimationFrame(animate);
    const deltaTime = clock ? clock.getDelta() : 0.016;

    if (gameState === 'playing') {
        if (players[localPlayerId]) {
             updatePlayer(deltaTime);
        }
        updateBullets(deltaTime);
        updateOtherPlayers(deltaTime);
    }

    if (renderer && scene && camera) {
        try {
            renderer.render(scene, camera);
        } catch (e) { console.error("Render error:", e); }
    }
}

// --- Utility Functions ---
function onWindowResize() { /* ... Same ... */ }


// ========================================================
// INITIALIZATION FUNCTION DEFINITION
// ========================================================
function init() {
    console.log("Initializing Shawty...");
    // Get UI Elements
    loadingScreen = document.getElementById('loadingScreen');
    homeScreen = document.getElementById('homeScreen');
    gameUI = document.getElementById('gameUI');
    playerCountSpan = document.getElementById('playerCount');
    playerNameInput = document.getElementById('playerNameInput');
    playerPhraseInput = document.getElementById('playerPhraseInput');
    joinButton = document.getElementById('joinButton');
    homeScreenError = document.getElementById('homeScreenError');
    infoDiv = document.getElementById('info');
    healthBarFill = document.getElementById('healthBarFill');
    healthText = document.getElementById('healthText');
    killMessageDiv = document.getElementById('killMessage');

    // Set Initial UI State
    setGameState('loading');

    // Basic Three.js Scene Setup
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87ceeb);
    scene.fog = new THREE.Fog(0x87ceeb, 0, 150);
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('gameCanvas'), antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    clock = new THREE.Clock();
    loader = new THREE.GLTFLoader();
    dracoLoader = new THREE.DRACOLoader();
    dracoLoader.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/libs/draco/');
    dracoLoader.setDecoderConfig({ type: 'js' });
    loader.setDRACOLoader(dracoLoader);

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.9);
    directionalLight.position.set(10, 15, 10);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 1024;
    directionalLight.shadow.mapSize.height = 1024;
    scene.add(directionalLight);

    // Controls
    controls = new THREE.PointerLockControls(camera, document.body);
    controls.addEventListener('lock', () => console.log('Pointer Locked'));
    // --- ADJUSTED UNLOCK LISTENER ---
    controls.addEventListener('unlock', () => {
        console.log('Pointer Unlocked (Escape pressed?)');
        // If playing, go back to the homescreen state cleanly
        if (gameState === 'playing') {
            console.log("Pointer unlocked during play, returning to homescreen.");
            setGameState('homescreen', { playerCount: playerCountSpan?.textContent ?? '?' });
        }
    });
    // --------------------------------

    // Start Loading Assets & Connecting
    loadSound();
    loadPlayerModel();
    loadMap(MAP_PATH);
    setupSocketIO();

    // Add Event Listeners
    joinButton?.addEventListener('click', attemptJoinGame);
    window.addEventListener('resize', onWindowResize);
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    document.addEventListener('mousedown', onMouseDown);

    // Start animation loop
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
