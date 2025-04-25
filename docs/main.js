// docs/main.js

// --- Configuration ---
const SERVER_URL = 'https://gametest-psxl.onrender.com';
const MAP_PATH = 'assets/maps/map.glb';
const SOUND_PATH_GUNSHOT = 'assets/maps/gunshot.wav'; // Note: Sound in maps folder?
const PLAYER_MODEL_PATH = 'assets/maps/Shawty1.glb'; // Note: Model in maps folder?

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

// --- Global Variables ---
// Game State
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

// Three.js Core
let scene, camera, renderer, controls, clock, loader, dracoLoader;
let mapMesh = null;
let playerModel = null; // Template model

// Physics
let velocityY = 0;
let isOnGround = false;

// UI Elements (Declare vars, get references in init)
let loadingScreen, homeScreen, gameUI, playerCountSpan, playerNameInput, playerPhraseInput, joinButton, homeScreenError, infoDiv, healthBarFill, healthText, killMessageDiv;
let killMessageTimeout = null;

// Sound
let gunshotSound;

// ========================================================
// FUNCTION DEFINITIONS (Define ALL before init)
// ========================================================

// --- Input Handling ---
function onKeyDown(event) {
    keys[event.code] = true;
    // Prevent page scroll on space when canvas/body has focus (though PointerLock should mostly handle this)
    if (event.code === 'Space') {
        event.preventDefault(); // Explicitly prevent default space action
        if (isOnGround && gameState === 'playing') {
            velocityY = JUMP_FORCE;
            isOnGround = false;
        }
    }
}

function onKeyUp(event) {
    keys[event.code] = false;
}

function onMouseDown(event) {
    // Shoot only if playing, locked, and left mouse
    if (gameState === 'playing' && controls?.isLocked && event.button === 0) {
        shoot();
    }
}

// --- UI State Management ---
function setGameState(newState, options = {}) {
    console.log(`Setting game state to: ${newState}`, options);
    const previousState = gameState;

    // Ensure UI elements refs are available (might be called before init fully assigns them initially)
    loadingScreen = loadingScreen || document.getElementById('loadingScreen');
    homeScreen = homeScreen || document.getElementById('homeScreen');
    gameUI = gameUI || document.getElementById('gameUI');
    const canvas = document.getElementById('gameCanvas');

    // Prevent redundant state changes unless it's an error update for loading screen
    if (gameState === newState && !(newState === 'loading' && options.error)) {
        console.warn(`Already in state: ${newState}. Ignoring redundant call.`);
        return;
    }
    gameState = newState;

    // Hide all sections first
    if(loadingScreen) { loadingScreen.style.display = 'none'; loadingScreen.classList.remove('assets', 'error'); loadingScreen.querySelector('p').style.color = ''; }
    if(homeScreen) { homeScreen.style.display = 'none'; homeScreen.classList.remove('visible'); }
    if(gameUI) { gameUI.style.display = 'none'; gameUI.classList.remove('visible'); }
    if(canvas) canvas.style.display = 'none';

    // Show the target section
    switch (newState) {
        case 'loading':
            if(loadingScreen) {
                loadingScreen.style.display = 'flex';
                loadingScreen.querySelector('p').innerHTML = options.message || 'Loading...';
                if (options.assets) loadingScreen.classList.add('assets');
                if (options.error) {
                     loadingScreen.querySelector('p').style.color = '#e74c3c'; // Red error text
                     loadingScreen.classList.add('error');
                }
            }
            break;
        case 'homescreen':
             if(homeScreen) {
                homeScreen.style.display = 'flex';
                requestAnimationFrame(() => { // Ensure display is set before adding class for transition
                     homeScreen.classList.add('visible');
                });
                playerCountSpan = playerCountSpan || document.getElementById('playerCount');
                if(playerCountSpan) playerCountSpan.textContent = options.playerCount ?? playerCountSpan.textContent;
                if (controls?.isLocked) controls.unlock(); // Use optional chaining
                const playerControlsObject = scene?.getObjectByName("PlayerControls");
                if (playerControlsObject) scene.remove(playerControlsObject);
                joinButton = joinButton || document.getElementById('joinButton');
                if(joinButton) {
                    joinButton.disabled = false;
                    joinButton.textContent = "Join Game";
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
                 // Show loading screen while waiting for assets
                 setGameState('loading', { message: "Loading Assets...", assets: true });
             }
             // If not waiting for assets, stay visually on homescreen (button disabled)
            break;
        case 'playing':
            if(gameUI) {
                gameUI.style.display = 'block';
                requestAnimationFrame(() => { // Ensure display before transition class
                     gameUI.classList.add('visible');
                });
            }
             if(canvas) canvas.style.display = 'block';
            if (scene && controls && !scene.getObjectByName("PlayerControls")) {
                controls.getObject().name = "PlayerControls";
                scene.add(controls.getObject());
            }
            if(controls) controls.lock();
            onWindowResize();
            break;
    }
     console.log(`Switched state from ${previousState} to ${gameState}`);
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
        console.error("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
        console.error("!!! FATAL: Error loading player model:", error);
        console.error("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
        if (error instanceof ErrorEvent) console.error("Network/ErrorEvent details:", error.message);
        else if (error instanceof ProgressEvent) console.error("ProgressEvent indicates likely network failure (e.g., 404). Check Network tab!");
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
            console.error("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
            console.error(`!!! FATAL: Error loading map (${mapPath}):`, error);
            console.error("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
            if (error instanceof ErrorEvent) console.error("Network/ErrorEvent details:", error.message);
            else if (error instanceof ProgressEvent) console.error("ProgressEvent indicates likely network failure (e.g., 404). Check Network tab!");
            mapLoadState = 'error';
            checkAssetsReady();
        }
    );
}

function checkAssetsReady() {
    console.log(`checkAssetsReady: Map=${mapLoadState}, Model=${playerModelLoadState}`);
    if ((mapLoadState === 'loaded' || mapLoadState === 'error') &&
        (playerModelLoadState === 'loaded' || playerModelLoadState === 'error'))
    {
        if (mapLoadState === 'error' || playerModelLoadState === 'error') {
            assetsReady = false;
            console.error("Critical asset loading failed. Setting permanent error state.");
            setGameState('loading', { message: "FATAL: Asset Load Error!<br/>Check Console (F12).", error: true });
        } else {
            assetsReady = true;
            console.log("Assets ready.");
            // If socket connected and we are still in the initial loading state, switch to homescreen
            if (socket?.connected && gameState === 'loading') {
                console.log("Assets ready and socket connected. Showing homescreen.");
                setGameState('homescreen', { playerCount: playerCountSpan?.textContent ?? '?' });
            } else if (gameState === 'joining') {
                // If we were waiting for assets after clicking Join
                 console.log("Assets finished loading while joining, sending details to server.");
                 sendJoinDetails();
            }
        }
    } else {
        assetsReady = false; // Still waiting
    }
}

// --- Network & Joining ---
function setupSocketIO() {
    console.log(`Attempting to connect to server: ${SERVER_URL}`);
    socket = io(SERVER_URL, { transports: ['websocket'], autoConnect: true });

    socket.on('connect', () => {
        console.log('Socket connected! ID:', socket.id);
        // Socket is ready, check if assets are also ready to show homescreen
        checkAssetsReady();
    });

    socket.on('disconnect', (reason) => { /* ... Same ... */ });
    socket.on('connect_error', (err) => { /* ... Same ... */ });
    socket.on('playerCountUpdate', (count) => { /* ... Same ... */ });
    socket.on('initialize', (data) => { /* ... Same ... */ });
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
    setGameState('joining', { waitingForAssets: !assetsReady });

    if (assetsReady) {
        sendJoinDetails();
    } else {
        console.log("Waiting for assets to load before sending join details...");
        // checkAssetsReady() will call sendJoinDetails() when assets are ready
    }
}

function sendJoinDetails() {
    if (socket?.connected && gameState === 'joining') { // Check socket exists and connected
        console.log("Sending player details to server.");
        socket.emit('setPlayerDetails', { name: localPlayerName, phrase: localPlayerPhrase });
        // Stay visually in 'joining' state (loading screen or disabled button)
    } else if (gameState !== 'joining') {
         console.warn("Attempted to send join details but no longer in 'joining' state.");
         setGameState('homescreen', {playerCount: playerCountSpan?.textContent ?? '?'});
    } else {
        console.error("Cannot send join details: Socket not connected.");
        homeScreenError.textContent = 'Connection issue. Cannot join.';
        setGameState('homescreen', {playerCount: playerCountSpan?.textContent ?? '?'});
    }
}


// --- Player Management & Model Loading ---
function addPlayer(playerData) { /* ... Same ... */ }
function addPlayerFallbackMesh(playerData) { /* ... Same ... */ }
function removePlayerMesh(playerId) { /* ... Same ... */ }
function updateRemotePlayerPosition(playerData) { /* ... Same ... */ }

// --- Game Logic Update Loop ---
function updatePlayer(deltaTime) { /* ... Same ... */ }

// --- Shoot, Bullet, Interpolation, UI, Event Handlers ---
function shoot() { /* ... Same ... */ }
function spawnBullet(bulletData) { /* ... Same ... */ }
function updateBullets(deltaTime) { /* ... Same ... */ }
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
    // Use try-catch for clock delta to prevent potential errors? Generally safe.
    const deltaTime = clock ? clock.getDelta() : 0.016;

    // Update game logic only when playing
    if (gameState === 'playing') {
        if (players[localPlayerId]) {
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
function onWindowResize() { /* ... Same ... */ }

// --- Initialization Function ---
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
    setGameState('loading'); // Safe to call now

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
    controls.addEventListener('unlock', () => {
        console.log('Pointer Unlocked');
        if (gameState === 'playing') {
             setGameState('homescreen', { playerCount: playerCountSpan?.textContent ?? '?' });
        }
    });

    // Start Loading Assets & Connecting
    loadSound();
    loadPlayerModel();
    loadMap(MAP_PATH);
    setupSocketIO(); // Safe to call now

    // Add Event Listeners (Safe to call now)
    joinButton?.addEventListener('click', attemptJoinGame); // Use optional chaining just in case
    window.addEventListener('resize', onWindowResize);
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    document.addEventListener('mousedown', onMouseDown);

    // Start animation loop
    animate();
}


// --- Start ---
// Use DOMContentLoaded to ensure elements exist before `init` runs
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init(); // DOMContentLoaded has already fired
}
