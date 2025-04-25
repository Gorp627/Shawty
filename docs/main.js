// docs/main.js

// --- Configuration ---
const SERVER_URL = 'https://gametest-psxl.onrender.com';
const MAP_PATH = 'assets/maps/map.glb';
const SOUND_PATH_GUNSHOT = 'assets/maps/gunshot.wav';
const PLAYER_MODEL_PATH = 'assets/maps/Shawty1.glb'; // Path to your player model

const PLAYER_HEIGHT = 1.8; // Logical height, center of model might differ
const PLAYER_RADIUS = 0.4;
const MOVEMENT_SPEED = 5.0;
const MOVEMENT_SPEED_SPRINTING = 8.0;
const BULLET_SPEED = 50;
const GRAVITY = 19.62;
const JUMP_FORCE = 8.0;
const VOID_Y_LEVEL = -20;
const PLAYER_COLLISION_RADIUS = PLAYER_RADIUS;
const KILL_MESSAGE_DURATION = 4000; // 4 seconds

// --- Global Variables ---
// Game State
let gameState = 'loading'; // 'loading', 'homescreen', 'playing'
let socket;
let localPlayerId = null;
let localPlayerName = 'Anonymous';
let localPlayerPhrase = '...';
let players = {};
let bullets = [];
let keys = {};

// Three.js Core
let scene, camera, renderer, controls, clock, loader, dracoLoader;
let mapMesh = null;
let playerMeshes = {}; // Store loaded models for players { id: model }

// Physics
let velocityY = 0;
let isOnGround = false;

// UI Elements
let loadingScreen, homeScreen, gameUI, playerCountSpan, playerNameInput, playerPhraseInput, joinButton, homeScreenError, infoDiv, healthBarFill, healthText, killMessageDiv;
let killMessageTimeout = null;

// Sound
let gunshotSound;

// --- Initialization ---
function init() {
    console.log("Initializing game...");
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
    showLoadingScreen();

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

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.9);
    directionalLight.position.set(10, 15, 10);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 1024;
    directionalLight.shadow.mapSize.height = 1024;
    scene.add(directionalLight);

    // Controls (Initialize but don't add to scene yet)
    controls = new THREE.PointerLockControls(camera, document.body);
    controls.addEventListener('lock', () => console.log('Pointer Locked'));
    controls.addEventListener('unlock', () => {
        // If we lose lock during gameplay, maybe show homescreen or pause menu?
        // For now, just log it. If player dies, handle state change there.
        console.log('Pointer Unlocked');
        if (gameState === 'playing') {
             // Could potentially pause or go back to a menu here
        }
    });


    // Load Sound
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

    // Load Map (starts loading immediately)
    loadMap(MAP_PATH);

    // Add Join Button Listener
    joinButton.addEventListener('click', attemptJoinGame);

    // Add Resize Listener
    window.addEventListener('resize', onWindowResize, false);

    // Start the animation loop (renders loading/homescreen/game)
    animate();

    // --- Connect to Socket Server ---
    // We connect early to get player count, but only join game on button click
    setupSocketIO();
}

// --- UI State Management ---
function showLoadingScreen() {
    loadingScreen.style.display = 'flex';
    homeScreen.style.display = 'none';
    gameUI.style.display = 'none';
    document.getElementById('gameCanvas').style.display = 'none'; // Hide canvas too
}

function showHomeScreen(playerCount = 0) {
    gameState = 'homescreen';
    loadingScreen.style.display = 'none';
    homeScreen.style.display = 'flex';
    gameUI.style.display = 'none';
    document.getElementById('gameCanvas').style.display = 'none';
    playerCountSpan.textContent = playerCount;
    if (controls.isLocked) {
        controls.unlock(); // Make sure pointer isn't locked on homescreen
    }
}

function showGameScreen() {
    gameState = 'playing';
    loadingScreen.style.display = 'none';
    homeScreen.style.display = 'none';
    gameUI.style.display = 'flex'; // Show in-game UI elements
    document.getElementById('gameCanvas').style.display = 'block'; // Show canvas
    // Add controls object to scene here, AFTER it's potentially been reset
    if (!scene.getObjectByName("PlayerControls")) { // Avoid adding multiple times
         controls.getObject().name = "PlayerControls";
         scene.add(controls.getObject());
    }
    // Attempt to lock pointer - requires user click if not already granted
    controls.lock();
    onWindowResize(); // Ensure canvas size is correct
}

// --- Network & Joining ---
function setupSocketIO() {
    console.log(`Attempting to connect to server: ${SERVER_URL}`);
    socket = io(SERVER_URL, { transports: ['websocket'], autoConnect: true }); // Connect immediately

    socket.on('connect', () => {
        console.log('Socket connected! ID:', socket.id);
        // Connected, show homescreen (or loading if map isn't ready?)
        // We wait for player count before showing homescreen fully.
    });

    socket.on('disconnect', (reason) => {
        console.warn('Disconnected from server! Reason:', reason);
        showHomeScreen(0); // Go back to homescreen on disconnect
        infoDiv.textContent = 'Disconnected';
        // Clear local game state
        for (const id in players) {
            removePlayerMesh(id);
        }
        players = {};
        bullets = []; // Clear bullets too
    });

    socket.on('connect_error', (err) => {
        console.error('Connection Error:', err.message);
        // Show error on loading/homescreen?
        loadingScreen.innerHTML = `<p>Connection Error!<br>Check server status.</p>`; // Show error on loading screen
        homeScreenError.textContent = 'Cannot connect to server.'; // Show error on homescreen too
    });

    // Listen for player count updates (sent by server)
    socket.on('playerCountUpdate', (count) => {
        console.log("Player count update:", count);
        playerCountSpan.textContent = count;
        // If we are connected and not yet playing, show homescreen
        if (socket.connected && gameState !== 'playing') {
             showHomeScreen(count);
        }
    });

    // Initialize game state AFTER server confirms details are set
    socket.on('initialize', (data) => {
        console.log('Initialize received');
        localPlayerId = data.id;
        console.log('My confirmed ID:', localPlayerId);

        // Clear potentially old player data/meshes
        for (const id in players) { removePlayerMesh(id); }
        players = {};
        playerMeshes = {};

        for (const id in data.players) {
            const playerData = data.players[id];
            if (id === localPlayerId) {
                // Set local player's initial state
                // Use logical Y from server, visual Y is calculated based on model/height
                controls.getObject().position.set(playerData.x, playerData.y + PLAYER_HEIGHT, playerData.z);
                velocityY = 0;
                isOnGround = true; // Assume start on ground
                players[id] = { ...playerData, name: localPlayerName, phrase: localPlayerPhrase, mesh: null }; // Store local data including name/phrase
                updateHealthBar(playerData.health);
                infoDiv.textContent = `Playing as ${localPlayerName}`; // Update info
            } else {
                addPlayer(playerData); // Add remote players
            }
        }
        console.log("Game initialized, player state:", players);
        // Now actually show the game screen
        showGameScreen();
    });

    // --- Standard Event Handlers ---
    socket.on('playerJoined', (playerData) => {
        console.log('>>> Received playerJoined event:', playerData);
        if (playerData.id !== localPlayerId && !players[playerData.id]) {
            addPlayer(playerData);
        }
    });
    socket.on('playerLeft', (playerId) => {
        console.log('Player left:', playerId);
        removePlayerMesh(playerId);
        delete players[playerId];
    });
    socket.on('playerMoved', (playerData) => { updateRemotePlayerPosition(playerData); });
    socket.on('shotFired', (bulletData) => { spawnBullet(bulletData); });
    socket.on('healthUpdate', (data) => { handleHealthUpdate(data); });
    socket.on('playerDied', (data) => { handlePlayerDied(data); });
    socket.on('playerRespawned', (playerData) => { handlePlayerRespawned(playerData); });
}

function attemptJoinGame() {
    localPlayerName = playerNameInput.value.trim() || 'Anonymous';
    localPlayerPhrase = playerPhraseInput.value.trim() || '...';

    if (!localPlayerName) { // Basic validation
        homeScreenError.textContent = 'Please enter a name.';
        return;
    }
     if (localPlayerPhrase.length > 20) { // Match maxlength
        homeScreenError.textContent = 'Catchphrase too long (max 20 chars).';
        return;
    }
    homeScreenError.textContent = ''; // Clear error

    console.log(`Attempting to join as "${localPlayerName}" with phrase "${localPlayerPhrase}"`);

    // Send details to server, server will then send 'initialize'
    if (socket && socket.connected) {
        socket.emit('setPlayerDetails', { name: localPlayerName, phrase: localPlayerPhrase });
        // Wait for 'initialize' event from server to actually transition state
        infoDiv.textContent = "Joining..."; // Give feedback
    } else {
        homeScreenError.textContent = 'Not connected to server. Please wait or refresh.';
    }
}


// --- Player Management & Model Loading ---
function addPlayer(playerData) {
    console.log(`Adding player ${playerData.id} (${playerData.name})`);
    if (players[playerData.id] || playerData.id === localPlayerId) return;

    // Store player data first
    players[playerData.id] = {
        ...playerData, // server data (id, x, y, z, rotY, health, name, phrase)
        mesh: null, // Placeholder for mesh/model
        targetPosition: null,
        targetRotationY: null
    };

    // Load the model asynchronously
    loader.load(PLAYER_MODEL_PATH, (gltf) => {
        // Check if player still exists (might have disconnected while loading)
        if (!players[playerData.id]) return;

        console.log(`Model loaded for player ${playerData.id}`);
        const model = gltf.scene;

        // --- Adjust model ---
        // Example: Scale if necessary
        // model.scale.set(0.5, 0.5, 0.5);

        // Enable shadows for all parts of the model
        model.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true;
                // child.receiveShadow = true; // Usually not needed for player models
            }
        });

        // Position the model - Assume model origin is at its feet
        // Use the logical Y from server data
        const visualY = playerData.y; // Adjust if model origin isn't at feet
        model.position.set(playerData.x, visualY, playerData.z);
        model.rotation.y = playerData.rotationY;

        scene.add(model);
        players[playerData.id].mesh = model; // Assign the loaded model
        playerMeshes[playerData.id] = model; // Keep track separately if needed

        // Set initial target position for interpolation
        players[playerData.id].targetPosition = model.position.clone();
        players[playerData.id].targetRotationY = model.rotation.y;

    }, undefined, (error) => {
        console.error(`Error loading player model for ${playerData.id}:`, error);
        // Fallback: Create a cylinder if model fails?
        addPlayerFallbackMesh(playerData); // Use fallback if load fails
    });
}

// Fallback if player model fails to load
function addPlayerFallbackMesh(playerData) {
     if (!players[playerData.id] || players[playerData.id].mesh) return; // Don't add if already has mesh or doesn't exist
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
    }
    delete playerMeshes[playerId];
}

function updateRemotePlayerPosition(playerData) {
     if (playerData.id !== localPlayerId && players[playerData.id]) {
            const player = players[playerData.id];
            // Adjust visual Y based on model origin (assuming feet for model, center for cylinder)
            let visualY;
            if (player.mesh && player.mesh.geometry instanceof THREE.CylinderGeometry) {
                visualY = playerData.y + (PLAYER_HEIGHT / 2); // Cylinder center height
            } else {
                visualY = playerData.y; // Assume model origin is at feet (logical Y)
            }
            player.targetPosition = new THREE.Vector3(playerData.x, visualY, playerData.z);
            player.targetRotationY = playerData.rotationY;
            // Update internal logical data
            player.x = playerData.x;
            player.y = playerData.y; // Store logical Y
            player.z = playerData.z;
            player.rotationY = playerData.rotationY;
        }
}

// --- Map Loading ---
function loadMap(mapPath) { /* ... Same as previous version with Draco setup ... */ }

// --- Game Logic Update Loop ---
function updatePlayer(deltaTime) {
    // Only run if playing
    if (gameState !== 'playing' || !controls.isLocked || !localPlayerId || !players[localPlayerId]) return;

    const playerObject = controls.getObject();
    const playerState = players[localPlayerId];

    if (playerState.health <= 0) return; // Don't update if dead

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
    if (isMoving) moveDirection.normalize();

    // --- Calculate Displacement ---
    const displacement = new THREE.Vector3();
    velocityY -= GRAVITY * deltaTime; // Apply gravity
    displacement.y = velocityY * deltaTime;

    // Apply movement relative to controls direction
    if (isMoving) {
        // Use controls methods directly for relative movement
        const tempVector = new THREE.Vector3(); // Temporary vector for calculations
        // Move Forward/Backward
        tempVector.set(0,0, moveDirection.z).applyQuaternion(playerObject.quaternion);
        displacement.addScaledVector(tempVector, speed);
        // Move Left/Right (Strafe)
        tempVector.set(moveDirection.x, 0, 0).applyQuaternion(playerObject.quaternion);
        displacement.addScaledVector(tempVector, speed);
    }

    // --- Collision Detection ---
    const potentialPosition = playerObject.position.clone().add(displacement);
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

    // --- Apply Movement ---
    if (!blockedByPlayer) {
        playerObject.position.add(displacement);
    } else {
        playerObject.position.y += displacement.y; // Only vertical if blocked
    }

    // --- Ground Check & Correction ---
    // TODO: Replace with map raycasting
    let groundY = 0; // Fallback ground level
    if (playerObject.position.y - PLAYER_HEIGHT < groundY) {
         playerObject.position.y = groundY + PLAYER_HEIGHT;
         velocityY = 0;
         isOnGround = true;
    } else {
         isOnGround = false;
    }

    // --- Void Check ---
    if (playerObject.position.y < VOID_Y_LEVEL) {
        if (playerState.health > 0) {
            socket.emit('fellIntoVoid');
            playerState.health = 0;
            updateHealthBar(0);
            showKillMessage("You fell into the void.");
        }
    }

    // --- Send Updates ---
    const logicalPosition = playerObject.position.clone();
    logicalPosition.y -= PLAYER_HEIGHT; // Feet position

    const positionChanged = logicalPosition.distanceToSquared(new THREE.Vector3(playerState.x, playerState.y, playerState.z)) > 0.001;
    const cameraRotation = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ');
    const currentRotationY = cameraRotation.y;
    const rotationChanged = Math.abs(currentRotationY - playerState.rotationY) > 0.01;

    if (positionChanged || rotationChanged) {
        playerState.x = logicalPosition.x;
        playerState.y = logicalPosition.y;
        playerState.z = logicalPosition.z;
        playerState.rotationY = currentRotationY;
        socket.emit('playerUpdate', { x: playerState.x, y: playerState.y, z: playerState.z, rotationY: currentRotationY });
    }
}


function shoot() {
     if (gameState !== 'playing' || !socket || !localPlayerId || !controls.isLocked || !players[localPlayerId] || players[localPlayerId].health <= 0) return;

    // Play sound locally
    if (gunshotSound) {
        try {
            const sound = gunshotSound.cloneNode();
            sound.volume = gunshotSound.volume;
            sound.play();
        } catch (e) { console.error("Error playing gunshot sound:", e); }
    } else { console.warn("Gunshot sound not available."); }

    // Get bullet origin/direction
    const bulletPosition = new THREE.Vector3();
    const bulletDirection = new THREE.Vector3();
    camera.getWorldPosition(bulletPosition); // Origin is camera
    camera.getWorldDirection(bulletDirection);
    // Offset start slightly (optional)
    // bulletPosition.addScaledVector(bulletDirection, PLAYER_RADIUS * 1.1);

    socket.emit('shoot', {
        position: { x: bulletPosition.x, y: bulletPosition.y, z: bulletPosition.z },
        direction: { x: bulletDirection.x, y: bulletDirection.y, z: bulletDirection.z }
    });
}

function spawnBullet(bulletData) { /* ... Same as previous ... */ }
function updateBullets(deltaTime) { /* ... Same as previous ... */ }
function updateOtherPlayers(deltaTime) { /* ... Same as previous ... */ }

// --- UI Update ---
function updateHealthBar(health) { /* ... Same as previous ... */ }

function showKillMessage(message) {
    if (killMessageTimeout) clearTimeout(killMessageTimeout); // Clear previous timeout
    killMessageDiv.textContent = message;
    killMessageDiv.classList.add('visible');
    // Hide after a delay
    killMessageTimeout = setTimeout(() => {
        killMessageDiv.classList.remove('visible');
    }, KILL_MESSAGE_DURATION);
}

// --- Event Handlers for Server Events ---
function handleHealthUpdate(data) {
     if (players[data.id]) {
        players[data.id].health = data.health;
        console.log(`Player ${data.id} health updated to: ${data.health}`);
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
                players[data.targetId].mesh.visible = false; // Hide mesh on death
            }
        }
        // Show kill message if WE died
        if (data.targetId === localPlayerId) {
            updateHealthBar(0);
            const killerName = data.killerName || 'the environment';
            const killerPhrase = data.killerPhrase || '...'; // Use default phrase if null/undefined
            let message = `You just got ${killerPhrase} by ${killerName}.`;
            if (!data.killerId) { // Specific message for environment death
                message = `You died.` // Or customize this
            }
            showKillMessage(message);
            infoDiv.textContent = `YOU DIED | Waiting to respawn...`;
            // controls.unlock(); // Unlock mouse?
        }
}

function handlePlayerRespawned(playerData) {
     console.log(`Player ${playerData.id} respawned`);
        if (!players[playerData.id] && playerData.id !== localPlayerId) {
            // Add player if they weren't known
            addPlayer(playerData);
        } else if (players[playerData.id] || playerData.id === localPlayerId) {
             // Update known player data
            const player = players[playerData.id] || playerState; // Use local playerState if it's us
            player.health = playerData.health;
            player.x = playerData.x;
            player.y = playerData.y;
            player.z = playerData.z;
            player.rotationY = playerData.rotationY;
            player.name = playerData.name; // Update name/phrase too
            player.phrase = playerData.phrase;


            if (playerData.id === localPlayerId) {
                // Reset local player
                controls.getObject().position.set(playerData.x, playerData.y + PLAYER_HEIGHT, playerData.z);
                velocityY = 0;
                isOnGround = true;
                updateHealthBar(playerData.health);
                infoDiv.textContent = `Playing as ${localPlayerName}`; // Restore info text
                showKillMessage(""); // Clear kill message immediately
                killMessageDiv.classList.remove('visible');
                if(killMessageTimeout) clearTimeout(killMessageTimeout);
                // Re-lock controls if needed (user might need to click again)
                // controls.lock();
            } else {
                // Reset remote player visuals
                if (player.mesh) {
                    player.mesh.visible = true;
                    // Adjust visual Y based on mesh type
                    let visualY = player.mesh.geometry instanceof THREE.CylinderGeometry
                                  ? playerData.y + (PLAYER_HEIGHT / 2)
                                  : playerData.y; // Assume model is at feet
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
    const deltaTime = Math.min(0.05, clock.getDelta()); // Capped delta time

    // Only update game logic if playing
    if (gameState === 'playing') {
        updatePlayer(deltaTime);
        updateBullets(deltaTime);
        updateOtherPlayers(deltaTime);
    }

    // Always render the scene
    if (renderer && scene && camera) {
        renderer.render(scene, camera);
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
init();
