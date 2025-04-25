// docs/main.js

// --- Configuration ---
const SERVER_URL = 'https://gametest-psxl.onrender.com'; // USER PROVIDED SERVER URL
const MAP_PATH = 'assets/maps/map.glb'; // USER PROVIDED MAP PATH
const SOUND_PATH_GUNSHOT = 'assets/maps/gunshot.wav'; // USER PROVIDED SOUND PATH
const PLAYER_MODEL_PATH = 'assets/maps/Shawty1.glb'; // Assumed player model path

const PLAYER_HEIGHT = 1.8; // Logical height (e.g., eye level or center mass)
const PLAYER_RADIUS = 0.4; // For collision and geometry
const MOVEMENT_SPEED = 5.0;
const MOVEMENT_SPEED_SPRINTING = 8.0;
const BULLET_SPEED = 50;
const GRAVITY = 19.62; // meters per second squared
const JUMP_FORCE = 8.0; // Initial upward velocity
const VOID_Y_LEVEL = -30; // Y level below which player dies
const PLAYER_COLLISION_RADIUS = PLAYER_RADIUS;
const KILL_MESSAGE_DURATION = 4000; // milliseconds

// --- Global Variables ---
// Game State
let gameState = 'loading'; // 'loading', 'homescreen', 'playing'
let socket;
let localPlayerId = null;
let localPlayerName = 'Anonymous';
let localPlayerPhrase = '...';
let players = {}; // Stores data for all players { id: { mesh, x, y, z, rotationY, health, name, phrase, targetPosition, targetRotationY } }
let bullets = []; // Stores active bullets { id, mesh, velocity, ownerId, spawnTime }
let keys = {}; // Tracks currently pressed keys { KeyW: true, ShiftLeft: false, ... }

// Three.js Core
let scene, camera, renderer, controls, clock, loader, dracoLoader;
let mapMesh = null;
let playerModel = null; // Store the loaded player model geometry/material for cloning

// Physics (local player only)
let velocityY = 0;
let isOnGround = false;

// UI Elements
let loadingScreen, homeScreen, gameUI, playerCountSpan, playerNameInput, playerPhraseInput, joinButton, homeScreenError, infoDiv, healthBarFill, healthText, killMessageDiv;
let killMessageTimeout = null;

// Sound
let gunshotSound;

// --- Initialization ---
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
    console.log("Setting initial state to loading.");
    showLoadingScreen();

    // Basic Three.js Scene Setup
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87ceeb); // Sky blue
    scene.fog = new THREE.Fog(0x87ceeb, 0, 150); // Distance fog
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('gameCanvas'), antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true; // Enable shadows
    clock = new THREE.Clock();
    loader = new THREE.GLTFLoader();
    dracoLoader = new THREE.DRACOLoader();
    // Configure Draco Loader Path (must be done before loading potentially compressed models)
    dracoLoader.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/libs/draco/');
    dracoLoader.setDecoderConfig({ type: 'js' });
    loader.setDRACOLoader(dracoLoader);


    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6); // Soft ambient light
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.9); // Brighter directional light
    directionalLight.position.set(10, 15, 10); // Position the light source
    directionalLight.castShadow = true; // Allow this light to cast shadows
    directionalLight.shadow.mapSize.width = 1024; // Shadow quality
    directionalLight.shadow.mapSize.height = 1024;
    scene.add(directionalLight);

    // Controls (Initialize but don't add to scene yet)
    controls = new THREE.PointerLockControls(camera, document.body);
    controls.addEventListener('lock', () => console.log('Pointer Locked'));
    controls.addEventListener('unlock', () => {
        console.log('Pointer Unlocked');
        // If playing, going back to homescreen on unlock might be desired
        if (gameState === 'playing') {
            // Let's try going back home
             showHomeScreen(playerCountSpan.textContent);
        }
    });

    // Load Essential Assets (Sound, Player Model) - Map loads separately
    loadSound();
    loadPlayerModel(); // Start loading the player model early

    // Add Join Button Listener
    joinButton.addEventListener('click', attemptJoinGame);

    // Add Resize Listener
    window.addEventListener('resize', onWindowResize, false);

    // Connect to Socket Server
    setupSocketIO();

    // Start the animation loop
    animate();
}

// --- Asset Loading ---
function loadSound() {
     try {
        gunshotSound = new Audio(SOUND_PATH_GUNSHOT);
        gunshotSound.volume = 0.4;
        gunshotSound.preload = 'auto';
        gunshotSound.load();
        console.log("Gunshot sound object created.");
    } catch(e) {
        console.error("Could not create Audio object for gunshot:", e);
        gunshotSound = null;
    }
}

function loadPlayerModel() {
    console.log(`Loading player model from: ${PLAYER_MODEL_PATH}`);
    loader.load(PLAYER_MODEL_PATH, (gltf) => {
        console.log("Player model loaded successfully!");
        playerModel = gltf.scene; // Store the loaded scene (which contains the mesh)
        // Optional: Pre-process the model (e.g., enable shadows)
        playerModel.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true;
            }
        });
        checkAssetsReady(); // Check if we can proceed after loading
    }, undefined, (error) => {
        console.error("FATAL: Error loading player model:", error);
        playerModel = 'error'; // Indicate error state
        checkAssetsReady(); // Still check, might use fallback
    });
}

function loadMap(mapPath) {
    console.log(`Loading map from: ${mapPath}`);
    loader.load(
        mapPath,
        (gltf) => {
            console.log("Map loaded successfully!");
            mapMesh = gltf.scene;
            mapMesh.traverse((child) => {
                if (child.isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                    child.userData.isCollidable = true; // Flag for potential collisions
                }
            });
            scene.add(mapMesh);
            checkAssetsReady(); // Check if we can proceed after loading
        },
        (xhr) => { /* Progress */ },
        (error) => {
            console.error('FATAL: Error loading map:', error);
            mapMesh = 'error'; // Indicate error state
            checkAssetsReady(); // Still check, will show error on screen
        }
    );
}

// Check if critical assets are loaded (or failed) to move past loading screen
function checkAssetsReady() {
    if ((playerModel || playerModel === 'error') && (mapMesh || mapMesh === 'error')) {
        console.log("Essential assets loaded (or failed).");
        if (playerModel === 'error' || mapMesh === 'error') {
             loadingScreen.innerHTML = `<p style="color: #e74c3c;">FATAL: Failed to load critical assets!<br>Check Console (F12).</p>`;
             // Stay on loading screen indefinitely
        } else if (socket && socket.connected) {
            // If socket is already connected, show homescreen
            showHomeScreen(playerCountSpan.textContent);
        } else {
            // Otherwise, socket connection will trigger homescreen via playerCountUpdate
             console.log("Assets ready, waiting for socket connection to show homescreen.");
        }
    }
}


// --- UI State Management ---
function showLoadingScreen() {
    console.log("Showing Loading Screen");
    gameState = 'loading';
    loadingScreen.style.display = 'flex';
    homeScreen.style.display = 'none';
    gameUI.style.display = 'none';
    document.getElementById('gameCanvas').style.display = 'none';
}

function showHomeScreen(playerCount = 0) {
     // Don't show home if assets failed
     if (playerModel === 'error' || mapMesh === 'error') {
          console.log("Cannot show homescreen due to asset load failure.");
          return;
     }
    console.log("Showing Home Screen. Player Count:", playerCount);
    gameState = 'homescreen';
    loadingScreen.style.display = 'none';
    homeScreen.style.display = 'flex';
    gameUI.style.display = 'none';
    document.getElementById('gameCanvas').style.display = 'none';
    playerCountSpan.textContent = playerCount;
    if (controls.isLocked) {
        console.log("Unlocking controls for homescreen.");
        controls.unlock();
    }
    // Remove controls object from scene if it exists
    const playerControlsObject = scene.getObjectByName("PlayerControls");
    if (playerControlsObject) {
         console.log("Removing player controls from scene for homescreen.");
         scene.remove(playerControlsObject);
    }
    // Reset join button state
    joinButton.disabled = false;
    joinButton.textContent = "Join Game";
}

function showGameScreen() {
    console.log("Showing Game Screen");
    gameState = 'playing';
    loadingScreen.style.display = 'none';
    homeScreen.style.display = 'none';
    gameUI.style.display = 'flex';
    document.getElementById('gameCanvas').style.display = 'block';

    // Add controls object to the scene
    if (!scene.getObjectByName("PlayerControls")) {
        console.log("Adding player controls to scene.");
        controls.getObject().name = "PlayerControls";
        scene.add(controls.getObject());
    } else {
         console.log("Player controls object already in scene.");
    }

    console.log("Attempting to lock pointer...");
    controls.lock(); // Needs user interaction on canvas if blocked

    onWindowResize(); // Ensure canvas size
    console.log("Game screen setup complete.");
}

// --- Network & Joining ---
function setupSocketIO() {
    console.log(`Attempting to connect to server: ${SERVER_URL}`);
    socket = io(SERVER_URL, { transports: ['websocket'], autoConnect: true });

    socket.on('connect', () => {
        console.log('Socket connected! ID:', socket.id);
        // Connection is ready, now we wait for assets via checkAssetsReady
    });

    socket.on('disconnect', (reason) => {
        console.warn('Disconnected from server! Reason:', reason);
        showHomeScreen(0); // Go back to homescreen
        infoDiv.textContent = 'Disconnected';
        for (const id in players) { removePlayerMesh(id); }
        players = {}; bullets = []; // Clear state
    });

     socket.on('connect_error', (err) => {
        console.error('Connection Error:', err.message);
        // Update UI
        loadingScreen.innerHTML = `<p style="color: #e74c3c;">Connection Failed!<br>Server might be offline.</p>`;
        showLoadingScreen(); // Show loading screen with error
        homeScreenError.textContent = 'Cannot connect to server.';
        playerModel = 'error'; // Mark as error state
        mapMesh = 'error';
    });

    socket.on('playerCountUpdate', (count) => {
        console.log("Player count update:", count);
        playerCountSpan.textContent = count;
        // If assets are ready and we are connected, show homescreen
        if ((playerModel && playerModel !== 'error') && (mapMesh && mapMesh !== 'error') && socket.connected && gameState !== 'playing') {
            showHomeScreen(count);
        }
    });

    socket.on('initialize', (data) => {
        console.log('Initialize received from server. Setting up local player...');
        localPlayerId = data.id;

        // Clear previous game state thoroughly
        for (const id in players) { removePlayerMesh(id); }
        players = {}; bullets = [];

        // Process player data from server
        for (const id in data.players) {
            const playerData = data.players[id];
            if (id === localPlayerId) {
                console.log("Setting local player initial position:", playerData.x, playerData.y + PLAYER_HEIGHT, playerData.z);
                controls.getObject().position.set(playerData.x, playerData.y + PLAYER_HEIGHT, playerData.z);
                velocityY = 0;
                isOnGround = true;
                players[id] = { ...playerData, name: localPlayerName, phrase: localPlayerPhrase, mesh: null };
                updateHealthBar(playerData.health);
                infoDiv.textContent = `Playing as ${localPlayerName}`;
            } else {
                addPlayer(playerData); // Add remote players
            }
        }
        console.log("Game initialized with players:", players);
        showGameScreen(); // Transition to game screen
    });

    // --- Standard Event Handlers ---
    socket.on('playerJoined', (playerData) => { handlePlayerJoined(playerData); });
    socket.on('playerLeft', (playerId) => { handlePlayerLeft(playerId); });
    socket.on('playerMoved', (playerData) => { updateRemotePlayerPosition(playerData); });
    socket.on('shotFired', (bulletData) => { spawnBullet(bulletData); });
    socket.on('healthUpdate', (data) => { handleHealthUpdate(data); });
    socket.on('playerDied', (data) => { handlePlayerDied(data); });
    socket.on('playerRespawned', (playerData) => { handlePlayerRespawned(playerData); });
}

function attemptJoinGame() {
    localPlayerName = playerNameInput.value.trim() || 'Anonymous';
    localPlayerPhrase = playerPhraseInput.value.trim() || '...';

    if (!localPlayerName) {
        homeScreenError.textContent = 'Please enter a name.'; return;
    }
    if (localPlayerPhrase.length > 20) {
        homeScreenError.textContent = 'Catchphrase too long (max 20 chars).'; return;
    }
    homeScreenError.textContent = '';

    console.log(`Attempting to join as "${localPlayerName}"`);
    if (socket && socket.connected) {
        socket.emit('setPlayerDetails', { name: localPlayerName, phrase: localPlayerPhrase });
        infoDiv.textContent = "Joining...";
        joinButton.disabled = true;
        joinButton.textContent = "Joining...";
    } else {
        homeScreenError.textContent = 'Not connected to server. Please wait or refresh.';
        joinButton.disabled = false;
        joinButton.textContent = "Join Game";
    }
}

// --- Player Management & Model Loading ---
function addPlayer(playerData) {
    console.log(`Adding player ${playerData.id} (${playerData.name})`);
    if (players[playerData.id] || playerData.id === localPlayerId) return;

    // Store player data immediately
    players[playerData.id] = {
        ...playerData,
        mesh: null, // Model will be added async
        targetPosition: null,
        targetRotationY: null
    };

    // Clone the preloaded model if available
    if (playerModel && playerModel !== 'error') {
        const modelInstance = playerModel.clone(); // Clone the loaded model scene
        console.log(`Cloned model for player ${playerData.id}`);

        // Position the cloned model (assuming origin at feet)
        const visualY = playerData.y; // Use logical Y from server
        modelInstance.position.set(playerData.x, visualY, playerData.z);
        modelInstance.rotation.y = playerData.rotationY;

        scene.add(modelInstance);
        players[playerData.id].mesh = modelInstance; // Assign the instance

        // Set initial target position for interpolation
        players[playerData.id].targetPosition = modelInstance.position.clone();
        players[playerData.id].targetRotationY = modelInstance.rotation.y;
    } else {
        // If preloaded model isn't ready or failed, use fallback
        console.warn(`Player model not ready or failed, using fallback for ${playerData.id}`);
        addPlayerFallbackMesh(playerData);
    }
}

function addPlayerFallbackMesh(playerData) {
     if (!players[playerData.id] || players[playerData.id].mesh) return;
     console.warn(`Using fallback mesh for player ${playerData.id}`);
     const geometry = new THREE.CylinderGeometry(PLAYER_RADIUS, PLAYER_RADIUS, PLAYER_HEIGHT, 8);
     const material = new THREE.MeshStandardMaterial({ color: 0xff00ff }); // Magenta fallback
     const mesh = new THREE.Mesh(geometry, material);
     mesh.castShadow = true;
     const visualY = playerData.y + (PLAYER_HEIGHT / 2); // Cylinder origin is center
     mesh.position.set(playerData.x, visualY, playerData.z);
     mesh.rotation.y = playerData.rotationY;
     scene.add(mesh);
     players[playerData.id].mesh = mesh;
     players[playerData.id].targetPosition = mesh.position.clone();
     players[playerData.id].targetRotationY = mesh.rotation.y;
}

function removePlayerMesh(playerId) {
    if (players[playerId] && players[playerId].mesh) {
        scene.remove(players[playerId].mesh);
        // Properly dispose of geometry/material if needed, especially for non-cloned fallbacks
        if (players[playerId].mesh.geometry) players[playerId].mesh.geometry.dispose();
        if (players[playerId].mesh.material) players[playerId].mesh.material.dispose();
        console.log(`Removed mesh for player ${playerId}`);
    }
}

function updateRemotePlayerPosition(playerData) {
     if (playerData.id !== localPlayerId && players[playerData.id]) {
            const player = players[playerData.id];
            // Adjust visual Y based on whether it's a fallback cylinder or the model
            let visualY;
            if (player.mesh && player.mesh.geometry instanceof THREE.CylinderGeometry) {
                visualY = playerData.y + (PLAYER_HEIGHT / 2); // Cylinder center
            } else {
                visualY = playerData.y; // Assume model origin at feet (matches logical Y)
            }
            player.targetPosition = new THREE.Vector3(playerData.x, visualY, playerData.z);
            player.targetRotationY = playerData.rotationY;
            // Update internal logical data
            player.x = playerData.x;
            player.y = playerData.y;
            player.z = playerData.z;
            player.rotationY = playerData.rotationY;
            // Update name/phrase if they change dynamically later
            player.name = playerData.name;
            player.phrase = playerData.phrase;
        }
}

// --- Game Logic Update Loop ---
function updatePlayer(deltaTime) {
    if (gameState !== 'playing' || !controls.isLocked || !localPlayerId || !players[localPlayerId]) return;

    const playerObject = controls.getObject(); // This is the camera rig
    const playerState = players[localPlayerId];

    if (playerState.health <= 0) return;

    // --- Speed ---
    const currentSpeed = keys['ShiftLeft'] ? MOVEMENT_SPEED_SPRINTING : MOVEMENT_SPEED;
    const speed = currentSpeed * deltaTime;

    // --- Input Direction ---
    const moveDirection = new THREE.Vector3();
    if (keys['KeyW']) { moveDirection.z = -1; } // Forward
    if (keys['KeyS']) { moveDirection.z = 1; }  // Backward
    if (keys['KeyA']) { moveDirection.x = -1; } // Left Strafe
    if (keys['KeyD']) { moveDirection.x = 1; }  // Right Strafe
    const isMoving = moveDirection.lengthSq() > 0;

    // --- Calculate Displacement ---
    const displacement = new THREE.Vector3();
    velocityY -= GRAVITY * deltaTime; // Apply gravity
    displacement.y = velocityY * deltaTime;

    // Apply horizontal movement relative to camera direction
    if (isMoving) {
        // Use PointerLockControls' built-in methods for simplicity and correctness
        controls.moveForward(moveDirection.z * speed); // Handles forward/backward relative to look direction
        controls.moveRight(moveDirection.x * speed);   // Handles left/right strafe relative to look direction

        // We need to update the displacement vector based on how much controls.move* actually moved the player
        // This is tricky because controls modifies playerObject.position directly.
        // Let's calculate horizontal displacement AFTER controls move it.
        // Get position *before* vertical movement is applied
        const horizontalPos = playerObject.position.clone();
        horizontalPos.y = playerState.y + PLAYER_HEIGHT; // Keep logical horizontal pos

        // Re-apply only vertical displacement calculated earlier
         playerObject.position.y += displacement.y;

         // Now calculate actual horizontal displacement for collision checks
         const actualHorizontalDisplacement = playerObject.position.clone().sub(horizontalPos);
         actualHorizontalDisplacement.y = 0; // Ignore Y component

         // We'll use the playerObject's new position for checks below
         displacement.copy(actualHorizontalDisplacement); // Update displacement for collision checks
         displacement.y = velocityY * deltaTime; // Keep calculated vertical displacement


    } else {
         // If not moving horizontally, just apply vertical displacement
         playerObject.position.y += displacement.y;
    }


    // --- Collision Detection ---
    // Potential position AFTER movement attempt
    const potentialPosition = playerObject.position.clone(); // Use position after controls moved it + gravity

    let blockedByPlayer = false;
    for (const id in players) {
        if (id !== localPlayerId && players[id].mesh && players[id].mesh.visible) {
            const otherPlayerMesh = players[id].mesh;
            const distanceXZ = new THREE.Vector2(potentialPosition.x - otherPlayerMesh.position.x, potentialPosition.z - otherPlayerMesh.position.z).length();
            if (distanceXZ < PLAYER_COLLISION_RADIUS * 2) {
                blockedByPlayer = true; break;
            }
        }
    }

     // --- Correction if Blocked ---
     // This is basic, just prevents moving into the other player. Doesn't slide.
     if(blockedByPlayer) {
         // Revert the horizontal movement caused by controls.move*
         // This assumes displacement correctly captured that move. This part is complex.
         // A simpler approach might be needed, e.g., storing position before controls.move*
         // For now, let's just log and accept slight overlap might happen briefly.
         console.log("Collision detected, movement might be restricted.");
         // A proper fix involves calculating penetration depth and pushing back.
     }


    // --- Ground Check & Correction ---
    // TODO: Replace with map raycasting
    let groundY = 0; // Fallback ground level
    // Check feet position against ground
    if (playerObject.position.y - PLAYER_HEIGHT < groundY) {
         playerObject.position.y = groundY + PLAYER_HEIGHT; // Snap feet to ground
         velocityY = 0;
         isOnGround = true;
    } else {
         isOnGround = false;
    }

    // --- Void Check ---
    if (playerObject.position.y < VOID_Y_LEVEL) {
        if (playerState.health > 0) {
            console.log("Player fell into void");
            socket.emit('fellIntoVoid');
            playerState.health = 0;
            updateHealthBar(0);
            showKillMessage("You fell into the void.");
        }
    }

    // --- Send Updates ---
    const logicalPosition = playerObject.position.clone();
    logicalPosition.y -= PLAYER_HEIGHT; // Feet position

    const positionChanged = logicalPosition.distanceToSquared(new THREE.Vector3(playerState.x || 0, playerState.y || 0, playerState.z || 0)) > 0.001;
    const cameraRotation = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ');
    const currentRotationY = cameraRotation.y;
    const rotationChanged = Math.abs(currentRotationY - (playerState.rotationY || 0)) > 0.01;

    if (positionChanged || rotationChanged) {
        playerState.x = logicalPosition.x;
        playerState.y = logicalPosition.y;
        playerState.z = logicalPosition.z;
        playerState.rotationY = currentRotationY;
        socket.emit('playerUpdate', { x: playerState.x, y: playerState.y, z: playerState.z, rotationY: currentRotationY });
    }
}

// --- Shoot Logic ---
function shoot() {
    if (gameState !== 'playing' || !socket || !localPlayerId || !controls.isLocked || !players[localPlayerId] || players[localPlayerId].health <= 0) return;

    // Play sound
    if (gunshotSound) {
        try {
            const sound = gunshotSound.cloneNode();
            sound.volume = gunshotSound.volume;
            sound.play();
        } catch (e) { console.error("Error playing gunshot sound:", e); }
    } else { console.warn("Gunshot sound not available."); }

    // Get position/direction
    const bulletPosition = new THREE.Vector3();
    const bulletDirection = new THREE.Vector3();
    // Use camera for aim direction
    camera.getWorldPosition(bulletPosition);
    camera.getWorldDirection(bulletDirection);
    // Optional offset
    // bulletPosition.addScaledVector(bulletDirection, PLAYER_RADIUS * 1.1);

    // Send to server
    socket.emit('shoot', {
        position: { x: bulletPosition.x, y: bulletPosition.y, z: bulletPosition.z },
        direction: { x: bulletDirection.x, y: bulletDirection.y, z: bulletDirection.z }
    });
}

// --- Bullet Logic (Spawn, Update) ---
function spawnBullet(bulletData) {
    const geometry = new THREE.SphereGeometry(0.1, 8, 8);
    const material = new THREE.MeshBasicMaterial({ color: 0xffff00 });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(bulletData.position.x, bulletData.position.y, bulletData.position.z);
    const velocity = new THREE.Vector3(
        bulletData.direction.x, bulletData.direction.y, bulletData.direction.z
    ).normalize().multiplyScalar(BULLET_SPEED);

    bullets.push({
        id: bulletData.bulletId, mesh: mesh, velocity: velocity,
        ownerId: bulletData.shooterId, spawnTime: Date.now()
    });
    scene.add(mesh);
}

function updateBullets(deltaTime) {
    const bulletsToRemoveIndexes = [];
    for (let i = bullets.length - 1; i >= 0; i--) {
        const bullet = bullets[i];
        bullet.mesh.position.addScaledVector(bullet.velocity, deltaTime);
        let hitDetected = false;

        for (const playerId in players) {
            // Check against visible, remote players with a mesh
            if (playerId !== bullet.ownerId && players[playerId].mesh && players[playerId].mesh.visible) {
                const playerMesh = players[playerId].mesh;
                const distance = bullet.mesh.position.distanceTo(playerMesh.position);
                // Adjust collision threshold based on target mesh type?
                // Using player radius + bullet radius is a decent approximation
                const collisionThreshold = PLAYER_RADIUS + 0.1;
                if (distance < collisionThreshold) {
                    console.log(`Client hit: Bullet ${bullet.id} hit Player ${playerId}`);
                    hitDetected = true;
                    if (bullet.ownerId === localPlayerId) { // Only report hits for our own bullets
                        socket.emit('hit', { targetId: playerId, damage: 10 });
                    }
                    if (!bulletsToRemoveIndexes.includes(i)) bulletsToRemoveIndexes.push(i);
                    scene.remove(bullet.mesh); // Remove visual immediately
                    break;
                }
            }
        }
        if (hitDetected) continue;

        // TODO: Add map collision check for bullets

        const lifetime = 3000; // 3 seconds
        if (Date.now() - bullet.spawnTime > lifetime) {
            if (!bulletsToRemoveIndexes.includes(i)) bulletsToRemoveIndexes.push(i);
            scene.remove(bullet.mesh);
        }
    }

    // Remove marked bullets
    bulletsToRemoveIndexes.sort((a, b) => b - a);
    for (const index of bulletsToRemoveIndexes) {
        bullets.splice(index, 1);
    }
}

// --- Remote Player Interpolation ---
function updateOtherPlayers(deltaTime) {
    for (const id in players) {
        if (id !== localPlayerId && players[id].mesh) {
            const player = players[id];
            const mesh = player.mesh;
            if (player.targetPosition && player.targetRotationY !== undefined) {
                mesh.position.lerp(player.targetPosition, deltaTime * 12); // Slightly faster interpolation?
                let angleDiff = player.targetRotationY - mesh.rotation.y;
                while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
                while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
                mesh.rotation.y += angleDiff * deltaTime * 12;
            }
        }
    }
}

// --- UI Update Functions ---
function updateHealthBar(health) {
    const healthPercentage = Math.max(0, Math.min(100, health));
    if (healthBarFill && healthText) {
        const fillWidth = `${healthPercentage}%`;
        const backgroundPosition = `${100 - healthPercentage}% 0%`;
        healthBarFill.style.width = fillWidth;
        healthBarFill.style.backgroundPosition = backgroundPosition;
        healthText.textContent = `${Math.round(healthPercentage)}%`;
    }
}

function showKillMessage(message) {
    if (killMessageTimeout) clearTimeout(killMessageTimeout);
    if (killMessageDiv) { // Check if element exists
        killMessageDiv.textContent = message;
        killMessageDiv.classList.add('visible');
        killMessageTimeout = setTimeout(() => {
            killMessageDiv.classList.remove('visible');
        }, KILL_MESSAGE_DURATION);
    }
}

// --- Server Event Handlers ---
function handlePlayerJoined(playerData) {
     console.log('>>> Received playerJoined event:', playerData);
     if (playerData.id !== localPlayerId && !players[playerData.id]) {
         addPlayer(playerData); // Add the new player
     }
}

function handlePlayerLeft(playerId) {
     console.log('Player left:', playerId);
     removePlayerMesh(playerId); // Remove the mesh
     delete players[playerId]; // Delete the player data
}

function handleHealthUpdate(data) {
    if (players[data.id]) {
        players[data.id].health = data.health;
        // console.log(`Player ${data.id} health updated to: ${data.health}`); // Reduce log noise
        if (data.id === localPlayerId) {
            updateHealthBar(data.health);
        }
    }
}

function handlePlayerDied(data) {
    console.log(`Player ${data.targetId} died. Killer: ${data.killerId || 'Environment'}`);
    if (players[data.targetId]) {
        players[data.targetId].health = 0;
        if (players[data.targetId].mesh) {
            players[data.targetId].mesh.visible = false;
        }
    }
    // Show kill message if WE died
    if (data.targetId === localPlayerId) {
        updateHealthBar(0);
        const killerName = data.killerName || 'the environment';
        const killerPhrase = data.killerPhrase || '...';
        let message = `You just got ${killerPhrase} by ${killerName}.`;
        if (!data.killerId) { // Specific message for environment death
            message = `You died.` // Customize as needed
        }
        showKillMessage(message);
        infoDiv.textContent = `YOU DIED | Waiting to respawn...`;
        // controls.unlock(); // Option to unlock mouse
    }
}

function handlePlayerRespawned(playerData) {
    console.log(`Player ${playerData.id} respawned`);
    if (!players[playerData.id] && playerData.id !== localPlayerId) {
        // Add player if they weren't known
        addPlayer(playerData);
    } else if (players[playerData.id] || playerData.id === localPlayerId) {
         // Update known player data
        const player = players[playerData.id] || players[localPlayerId]; // Use local player data if it's us
        player.health = playerData.health;
        player.x = playerData.x;
        player.y = playerData.y; // Logical Y
        player.z = playerData.z;
        player.rotationY = playerData.rotationY;
        player.name = playerData.name;
        player.phrase = playerData.phrase;

        if (playerData.id === localPlayerId) {
            // Reset local player
            controls.getObject().position.set(playerData.x, playerData.y + PLAYER_HEIGHT, playerData.z); // Use logical Y + height
            velocityY = 0;
            isOnGround = true;
            updateHealthBar(playerData.health);
            infoDiv.textContent = `Playing as ${localPlayerName}`; // Restore info
            showKillMessage(""); // Clear kill message
            killMessageDiv.classList.remove('visible');
            if(killMessageTimeout) clearTimeout(killMessageTimeout);
            // controls.lock(); // Attempt re-lock? Might require click.
        } else {
            // Reset remote player visuals
            if (player.mesh) {
                player.mesh.visible = true;
                // Adjust visual Y based on mesh type (model vs fallback)
                let visualY = player.mesh.geometry instanceof THREE.CylinderGeometry
                              ? playerData.y + (PLAYER_HEIGHT / 2) // Cylinder center
                              : playerData.y; // Assume model at feet
                player.mesh.position.set(playerData.x, visualY, playerData.z);
                player.targetPosition = new THREE.Vector3(playerData.x, visualY, playerData.z);
                player.targetRotationY = playerData.rotationY;
            }
        }
    }
}

// --- Animation Loop ---
function animate() {
    requestAnimationFrame(animate);
    const deltaTime = clock.getDelta(); // Use uncapped delta for smoother simulation? Or cap it: Math.min(0.05, clock.getDelta())

    // Update game logic only when playing
    if (gameState === 'playing') {
        if (players[localPlayerId]) { // Check local player exists
             updatePlayer(deltaTime);
        }
        updateBullets(deltaTime);
        updateOtherPlayers(deltaTime);
    }

    // Always render
    if (renderer && scene && camera) {
        try {
            renderer.render(scene, camera);
        } catch (e) {
            console.error("Render error:", e);
            // Potentially stop the loop or show an error state
        }
    }
}

// --- Utility Functions ---
function onWindowResize() {
    if (camera) {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
    }
    if (renderer) {
        renderer.setSize(window.innerWidth, window.innerHeight);
    }
}

// --- Start ---
// Use DOMContentLoaded to ensure elements exist before grabbing them
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
