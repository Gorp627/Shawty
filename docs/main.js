// docs/main.js

// --- Configuration ---
const SERVER_URL = 'https://gametest-psxl.onrender.com'; // USER PROVIDED SERVER URL
const MAP_PATH = 'assets/maps/map.glb'; // USER PROVIDED MAP PATH
const SOUND_PATH_GUNSHOT = 'assets/maps/gunshot.wav'; // USER PROVIDED SOUND PATH (in maps folder?)
const PLAYER_MODEL_PATH = 'assets/maps/Shawty1.glb'; // USER PROVIDED MODEL PATH (in maps folder?)

const PLAYER_HEIGHT = 1.8;
const PLAYER_RADIUS = 0.4;
const MOVEMENT_SPEED = 5.0;
const MOVEMENT_SPEED_SPRINTING = 8.0;
const BULLET_SPEED = 50;
const GRAVITY = 19.62;
const JUMP_FORCE = 8.0;
const VOID_Y_LEVEL = -30;
const PLAYER_COLLISION_RADIUS = PLAYER_RADIUS;
const KILL_MESSAGE_DURATION = 4000; // ms

// --- Global Variables ---
// Game State
let gameState = 'loading'; // 'loading', 'homescreen', 'joining', 'playing'
let assetsReady = false; // Flag for map and player model loaded status
let mapLoadState = 'loading'; // 'loading', 'loaded', 'error'
let playerModelLoadState = 'loading'; // 'loading', 'loaded', 'error'
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
let playerModel = null; // Store the template player model

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

    // Set Initial UI State (Simple Loading)
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

    // Controls (Initialize but don't add to scene yet)
    controls = new THREE.PointerLockControls(camera, document.body);
    controls.addEventListener('lock', () => console.log('Pointer Locked'));
    controls.addEventListener('unlock', () => {
        console.log('Pointer Unlocked');
        // If playing, revert to homescreen
        if (gameState === 'playing') {
            setGameState('homescreen', { playerCount: playerCountSpan.textContent }); // Pass current count
        }
    });

    // Start Loading Assets & Connecting
    loadSound();
    loadPlayerModel();
    loadMap(MAP_PATH); // Start map load
    setupSocketIO(); // Start connection

    // Add Event Listeners
    joinButton.addEventListener('click', attemptJoinGame);
    window.addEventListener('resize', onWindowResize, false);
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    document.addEventListener('mousedown', onMouseDown);

    // Start the animation loop (renders whatever screen is active)
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
    playerModelLoadState = 'loading';
    console.log(`Loading player model from: ${PLAYER_MODEL_PATH}`);
    loader.load(PLAYER_MODEL_PATH, (gltf) => {
        console.log("Player model loaded successfully!");
        playerModel = gltf.scene;
        playerModel.traverse((child) => { if (child.isMesh) { child.castShadow = true; } });
        playerModelLoadState = 'loaded';
        checkAssetsReady();
    }, undefined, (error) => {
        console.error("FATAL: Error loading player model:", error);
        playerModelLoadState = 'error';
        checkAssetsReady();
    });
}

function loadMap(mapPath) {
    mapLoadState = 'loading';
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
                    child.userData.isCollidable = true;
                }
            });
            scene.add(mapMesh);
            mapLoadState = 'loaded';
            checkAssetsReady();
        },
        (xhr) => { /* Progress */ },
        (error) => {
            console.error('FATAL: Error loading map:', error);
            mapLoadState = 'error';
            checkAssetsReady();
        }
    );
}

// Check if critical assets are ready (loaded or failed)
function checkAssetsReady() {
    console.log(`checkAssetsReady: Map=${mapLoadState}, Model=${playerModelLoadState}`);
    if ((mapLoadState === 'loaded' || mapLoadState === 'error') &&
        (playerModelLoadState === 'loaded' || playerModelLoadState === 'error'))
    {
        if (mapLoadState === 'error' || playerModelLoadState === 'error') {
            assetsReady = false; // Mark as not ready if critical asset failed
            console.error("Critical asset loading failed.");
            // Update loading screen permanently
             setGameState('loading', { message: "FATAL: Asset Load Error!<br>Check Console (F12)." , error: true});
        } else {
            assetsReady = true;
            console.log("Assets ready.");
            // If we were waiting in the 'joining' state, proceed
            if (gameState === 'joining') {
                console.log("Assets finished loading while joining, sending details to server.");
                sendJoinDetails();
            }
            // If socket is connected, we might already be on homescreen
            // No automatic state change here anymore, homescreen shown on socket connect
        }
    } else {
        assetsReady = false; // Not ready yet
    }
}

// --- UI State Management ---
function setGameState(newState, options = {}) {
    console.log(`Setting game state to: ${newState}`, options);
    const previousState = gameState;
    gameState = newState;

    // Hide all screens initially
    loadingScreen.style.display = 'none';
    loadingScreen.classList.remove('assets'); // Reset loading style
    homeScreen.style.display = 'none';
    homeScreen.classList.remove('visible');
    gameUI.style.display = 'none';
    gameUI.classList.remove('visible');
    document.getElementById('gameCanvas').style.display = 'none';

    // Show the target screen
    switch (newState) {
        case 'loading':
            loadingScreen.style.display = 'flex';
            loadingScreen.querySelector('p').innerHTML = options.message || 'Loading...';
            if (options.assets) loadingScreen.classList.add('assets');
             if (options.error) loadingScreen.querySelector('p').style.color = '#e74c3c';
            break;
        case 'homescreen':
            homeScreen.style.display = 'flex';
            homeScreen.classList.add('visible'); // Trigger fade-in
            playerCountSpan.textContent = options.playerCount || playerCountSpan.textContent; // Update count
            if (controls.isLocked) controls.unlock();
            const playerControlsObject = scene.getObjectByName("PlayerControls");
            if (playerControlsObject) scene.remove(playerControlsObject);
            joinButton.disabled = false;
            joinButton.textContent = "Join Game";
            break;
        case 'joining': // Intermediate state while waiting for assets or server response
            if (options.waitingForAssets) {
                setGameState('loading', { message: "Loading Assets...", assets: true });
            } else {
                // Can optionally show a different "Joining..." message on homescreen
                // For simplicity, we might just disable the button
                 joinButton.disabled = true;
                 joinButton.textContent = "Joining...";
                 if (homeScreen.style.display === 'none') { // If we switched to loading, show it
                     setGameState('loading', { message: "Joining..." });
                 }
            }
            break;
        case 'playing':
            gameUI.style.display = 'block'; // Use block for game UI container
            gameUI.classList.add('visible'); // Trigger fade-in
            document.getElementById('gameCanvas').style.display = 'block';
            if (!scene.getObjectByName("PlayerControls")) {
                controls.getObject().name = "PlayerControls";
                scene.add(controls.getObject());
            }
            controls.lock();
            onWindowResize();
            break;
    }
     console.log(`Switched state from ${previousState} to ${gameState}`);
}


// --- Network & Joining ---
function setupSocketIO() {
    console.log(`Attempting to connect to server: ${SERVER_URL}`);
    socket = io(SERVER_URL, { transports: ['websocket'], autoConnect: true });

    socket.on('connect', () => {
        console.log('Socket connected! ID:', socket.id);
        // Connection is ready. If assets are also ready, show homescreen.
        // Otherwise, checkAssetsReady will handle it when assets finish.
        if (assetsReady && gameState === 'loading') { // Only switch if still on initial loading
            showHomeScreen(playerCountSpan.textContent); // Use potentially updated count
        } else if (!assetsReady && gameState === 'loading') {
            console.log("Socket connected, waiting for assets before showing homescreen.");
             // Update loading text?
             loadingScreen.querySelector('p').innerHTML = "Loading Assets...";
             loadingScreen.classList.add('assets');
        }
    });

    socket.on('disconnect', (reason) => {
        console.warn('Disconnected from server! Reason:', reason);
        setGameState('homescreen', {playerCount: 0}); // Revert to homescreen
        infoDiv.textContent = 'Disconnected';
        for (const id in players) { removePlayerMesh(id); }
        players = {}; bullets = [];
    });

    socket.on('connect_error', (err) => {
        console.error('Connection Error:', err.message);
        setGameState('loading', { message: "Connection Failed!<br>Server offline?", error: true});
        assetsReady = false; // Mark as not ready
        mapLoadState = 'error';
        playerModelLoadState = 'error';
    });

    socket.on('playerCountUpdate', (count) => {
        console.log("Player count update:", count);
        playerCountSpan.textContent = count;
        // If assets are ready and we are connected, ensure homescreen is shown
        if (assetsReady && socket.connected && gameState === 'loading') {
             showHomeScreen(count);
        }
    });

    socket.on('initialize', (data) => {
        console.log('Initialize received from server. Setting up local player...');
        localPlayerId = data.id;
        for (const id in players) { removePlayerMesh(id); } // Clear old meshes
        players = {}; bullets = []; // Clear state

        for (const id in data.players) {
            const playerData = data.players[id];
            if (id === localPlayerId) {
                players[id] = { ...playerData, name: localPlayerName, phrase: localPlayerPhrase, mesh: null };
                // Set position AFTER creating player entry
                controls.getObject().position.set(playerData.x, playerData.y + PLAYER_HEIGHT, playerData.z);
                velocityY = 0; isOnGround = true;
                updateHealthBar(playerData.health);
                infoDiv.textContent = `Playing as ${localPlayerName}`;
            } else {
                addPlayer(playerData);
            }
        }
        console.log("Game initialized with players:", players);
        setGameState('playing'); // Transition to game screen
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
    if (!localPlayerName) { homeScreenError.textContent = 'Please enter a name.'; return; }
    if (localPlayerPhrase.length > 20) { homeScreenError.textContent = 'Catchphrase too long (max 20 chars).'; return; }
    homeScreenError.textContent = '';

    console.log(`Attempting to join as "${localPlayerName}"`);
    setGameState('joining', { waitingForAssets: !assetsReady }); // Enter joining state

    if (assetsReady) {
        sendJoinDetails(); // Assets ready, send details now
    } else {
        console.log("Waiting for assets to load before sending join details...");
        // checkAssetsReady() will call sendJoinDetails() when assets are ready
    }
}

function sendJoinDetails() {
    if (socket && socket.connected && gameState === 'joining') { // Ensure still in joining state
        console.log("Sending player details to server.");
        socket.emit('setPlayerDetails', { name: localPlayerName, phrase: localPlayerPhrase });
        // Server will respond with 'initialize' which triggers setGameState('playing')
    } else if (gameState !== 'joining') {
         console.warn("Attempted to send join details but no longer in 'joining' state.");
         setGameState('homescreen', {playerCount: playerCountSpan.textContent}); // Go back home
    } else {
        console.error("Cannot send join details: Socket not connected.");
        homeScreenError.textContent = 'Connection issue. Cannot join.';
        setGameState('homescreen', {playerCount: playerCountSpan.textContent}); // Go back home
    }
}


// --- Player Management & Model Loading ---
function addPlayer(playerData) {
    console.log(`Adding player ${playerData.id} (${playerData.name})`);
    if (players[playerData.id] || playerData.id === localPlayerId) return;

    players[playerData.id] = { ...playerData, mesh: null, targetPosition: null, targetRotationY: null };

    if (playerModel && playerModel !== 'error') {
        const modelInstance = playerModel.clone();
        console.log(`Cloned model for player ${playerData.id}`);
        const visualY = playerData.y; // Assume model origin at feet (logical Y)
        modelInstance.position.set(playerData.x, visualY, playerData.z);
        modelInstance.rotation.y = playerData.rotationY;
        scene.add(modelInstance);
        players[playerData.id].mesh = modelInstance;
        players[playerData.id].targetPosition = modelInstance.position.clone();
        players[playerData.id].targetRotationY = modelInstance.rotation.y;
    } else {
        console.warn(`Player model not ready/failed, using fallback for ${playerData.id}`);
        addPlayerFallbackMesh(playerData);
    }
}

function addPlayerFallbackMesh(playerData) { /* ... Same as previous ... */ }
function removePlayerMesh(playerId) { /* ... Same as previous ... */ }
function updateRemotePlayerPosition(playerData) { /* ... Same as previous ... */ }

// --- Game Logic Update Loop ---
function updatePlayer(deltaTime) {
    // Guard clauses at the start
    if (gameState !== 'playing' || !controls.isLocked || !localPlayerId || !players[localPlayerId]) return;
    const playerObject = controls.getObject();
    const playerState = players[localPlayerId];
    if (!playerState || playerState.health <= 0) return; // Check if playerState exists

    // --- Speed ---
    const currentSpeed = keys['ShiftLeft'] ? MOVEMENT_SPEED_SPRINTING : MOVEMENT_SPEED;
    const speed = currentSpeed * deltaTime;

    // --- Input Direction ---
    const moveDirection = new THREE.Vector3();
    if (keys['KeyW']) { moveDirection.z = -1; }
    if (keys['KeyS']) { moveDirection.z = 1; }
    if (keys['KeyA']) { moveDirection.x = -1; }
    if (keys['KeyD']) { moveDirection.x = 1; }
    const isMovingHorizontal = moveDirection.x !== 0 || moveDirection.z !== 0;

    // Store position before applying movement for potential collision reversion
    const previousPosition = playerObject.position.clone();

    // --- Apply Gravity ---
    velocityY -= GRAVITY * deltaTime;
    playerObject.position.y += velocityY * deltaTime; // Apply vertical move first

    // --- Apply Horizontal Movement ---
    if (isMovingHorizontal) {
        controls.moveForward(moveDirection.z * speed); // Apply relative forward/backward
        controls.moveRight(moveDirection.x * speed);   // Apply relative strafe
    }

    // --- Collision Detection ---
    const currentPosition = playerObject.position; // Position after movement attempt
    let collisionReverted = false; // Flag to track if we reverted position

    // Player-Player Collision Check (XZ plane)
    for (const id in players) {
        if (id !== localPlayerId && players[id].mesh && players[id].mesh.visible) {
            const otherPlayerMesh = players[id].mesh;
            const distanceXZ = new THREE.Vector2(currentPosition.x - otherPlayerMesh.position.x, currentPosition.z - otherPlayerMesh.position.z).length();
            if (distanceXZ < PLAYER_COLLISION_RADIUS * 2) {
                console.log("Player collision - reverting horizontal move");
                // Revert horizontal position, keep vertical change
                playerObject.position.x = previousPosition.x;
                playerObject.position.z = previousPosition.z;
                collisionReverted = true; // Mark that we stopped horizontal movement
                break;
            }
        }
    }

    // --- Ground Check & Correction ---
    // TODO: Replace with accurate map raycasting
    let groundY = 0; // Default ground level
    if (playerObject.position.y - PLAYER_HEIGHT < groundY) {
        playerObject.position.y = groundY + PLAYER_HEIGHT;
        velocityY = 0;
        isOnGround = true;
    } else {
        isOnGround = false;
    }

    // --- Void Check ---
    if (playerObject.position.y < VOID_Y_LEVEL && playerState.health > 0) {
        console.log("Player fell into void");
        socket.emit('fellIntoVoid');
        playerState.health = 0; // Update local immediately
        updateHealthBar(0);
        showKillMessage("You fell into the void.");
    }

    // --- Send Updates ---
    const logicalPosition = playerObject.position.clone();
    logicalPosition.y -= PLAYER_HEIGHT;

    // Check against last known *server* state if possible, or local predicted state
    const lastSentState = players[localPlayerId]; // Using our local player state cache
    const positionChanged = logicalPosition.distanceToSquared(new THREE.Vector3(lastSentState.x || 0, lastSentState.y || 0, lastSentState.z || 0)) > 0.001;
    const cameraRotation = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ');
    const currentRotationY = cameraRotation.y;
    const rotationChanged = Math.abs(currentRotationY - (lastSentState.rotationY || 0)) > 0.01;

    if (positionChanged || rotationChanged) {
        // Update local cache of sent state
        lastSentState.x = logicalPosition.x;
        lastSentState.y = logicalPosition.y;
        lastSentState.z = logicalPosition.z;
        lastSentState.rotationY = currentRotationY;
        // Send logical position to server
        socket.emit('playerUpdate', { x: logicalPosition.x, y: logicalPosition.y, z: logicalPosition.z, rotationY: currentRotationY });
    }
}


// --- Shoot, Bullet, Interpolation, UI, Event Handlers ---
function shoot() { /* ... Same as previous full code ... */ }
function spawnBullet(bulletData) { /* ... Same as previous full code ... */ }
function updateBullets(deltaTime) { /* ... Same as previous full code ... */ }
function updateOtherPlayers(deltaTime) { /* ... Same as previous full code ... */ }
function updateHealthBar(health) { /* ... Same as previous full code ... */ }
function showKillMessage(message) { /* ... Same as previous full code ... */ }
function handlePlayerJoined(playerData) { /* ... Same as previous full code ... */ }
function handlePlayerLeft(playerId) { /* ... Same as previous full code ... */ }
function handleHealthUpdate(data) { /* ... Same as previous full code ... */ }
function handlePlayerDied(data) { /* ... Same as previous full code ... */ }
function handlePlayerRespawned(playerData) { /* ... Same as previous full code ... */ }


// --- Animation Loop ---
function animate() {
    requestAnimationFrame(animate);
    const deltaTime = clock.getDelta();

    // Update game logic only when playing
    if (gameState === 'playing') {
        if (players[localPlayerId]) { // Ensure local player exists
             updatePlayer(deltaTime);
        }
        updateBullets(deltaTime);
        updateOtherPlayers(deltaTime);
    }

    // Always render
    if (renderer && scene && camera) {
        try {
            renderer.render(scene, camera);
        } catch (e) { console.error("Render error:", e); }
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
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
