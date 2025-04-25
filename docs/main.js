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

// --- Initialization ---
function init() {
    console.log("Initializing Shawty...");
    // Get UI Elements (ensure DOM is ready)
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
    setGameState('loading'); // Initial call

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
            setGameState('homescreen', { playerCount: playerCountSpan?.textContent ?? '?' }); // Use optional chaining & nullish coalescing
        }
    });

    // Start Loading Assets & Connecting
    loadSound();
    loadPlayerModel();
    loadMap(MAP_PATH);
    setupSocketIO();

    // Add Event Listeners
    joinButton?.addEventListener('click', attemptJoinGame); // Optional chaining
    window.addEventListener('resize', onWindowResize, false);
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    document.addEventListener('mousedown', onMouseDown);

    // Start animation loop
    animate();
}

// --- Asset Loading ---
function loadSound() { /* ... Same ... */ }

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
        // *** MORE DETAILED ERROR LOGGING HERE ***
        console.error("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
        console.error("!!! FATAL: Error loading player model:", error);
        console.error("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
        if (error instanceof ErrorEvent) { // Often network errors provide this
            console.error("Network/ErrorEvent details:", error.message);
        } else if (error instanceof ProgressEvent) {
             console.error("ProgressEvent indicates likely network failure (e.g., 404). Check Network tab!");
        }
        playerModelLoadState = 'error';
        checkAssetsReady(); // Important to call checkAssetsReady even on error
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
             // *** MORE DETAILED ERROR LOGGING HERE ***
            console.error("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
            console.error(`!!! FATAL: Error loading map (${mapPath}):`, error);
            console.error("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
             if (error instanceof ErrorEvent) {
                console.error("Network/ErrorEvent details:", error.message);
            } else if (error instanceof ProgressEvent) {
                console.error("ProgressEvent indicates likely network failure (e.g., 404). Check Network tab!");
            }
            mapLoadState = 'error';
            checkAssetsReady(); // Important to call checkAssetsReady even on error
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
            // Make the error message very clear on the loading screen
            setGameState('loading', { message: "FATAL: Asset Load Error!<br/>Check Console (F12).", error: true });
        } else {
            assetsReady = true;
            console.log("Assets ready.");
            // Assets are ready, if socket is also connected, proceed to homescreen.
            // If socket is not yet connected, the 'connect' handler will call this again.
            if (socket && socket.connected && gameState === 'loading') {
                console.log("Assets ready and socket connected. Showing homescreen.");
                setGameState('homescreen', { playerCount: playerCountSpan?.textContent ?? '?' });
            } else if (gameState === 'joining') {
                // If we were waiting for assets after clicking Join
                 console.log("Assets finished loading while joining, sending details to server.");
                 sendJoinDetails();
            }
        }
    } else {
        assetsReady = false;
    }
}


// --- UI State Management ---
function setGameState(newState, options = {}) {
    console.log(`Setting game state to: ${newState}`, options);
    const previousState = gameState;

    // Ensure UI elements are available
    loadingScreen = loadingScreen || document.getElementById('loadingScreen');
    homeScreen = homeScreen || document.getElementById('homeScreen');
    gameUI = gameUI || document.getElementById('gameUI');
    const canvas = document.getElementById('gameCanvas');

    // Don't change state if already in the target state (prevents infinite loops)
    // Exception: allow reloading 'loading' state if error occurs
    if (gameState === newState && newState !== 'loading') {
        console.warn(`Already in state: ${newState}. Ignoring redundant call.`);
        return;
    }
    gameState = newState;


    // Hide all screens initially
    if(loadingScreen) loadingScreen.style.display = 'none'; loadingScreen.classList.remove('assets', 'error'); loadingScreen.querySelector('p').style.color = '';
    if(homeScreen) homeScreen.style.display = 'none'; homeScreen.classList.remove('visible');
    if(gameUI) gameUI.style.display = 'none'; gameUI.classList.remove('visible');
    if(canvas) canvas.style.display = 'none';

    // Show the target screen
    switch (newState) {
        case 'loading':
            if(loadingScreen) {
                loadingScreen.style.display = 'flex';
                loadingScreen.querySelector('p').innerHTML = options.message || 'Loading...';
                if (options.assets) loadingScreen.classList.add('assets');
                if (options.error) {
                     loadingScreen.querySelector('p').style.color = '#e74c3c'; // Make error text red
                     loadingScreen.classList.add('error'); // Add error class if needed for more styling
                }
            }
            break;
        case 'homescreen':
             if(homeScreen) {
                homeScreen.style.display = 'flex';
                homeScreen.classList.add('visible'); // Fade in
                playerCountSpan = playerCountSpan || document.getElementById('playerCount');
                if(playerCountSpan) playerCountSpan.textContent = options.playerCount ?? playerCountSpan.textContent;
                if (controls && controls.isLocked) controls.unlock();
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
             // This state primarily manages button state and potentially shows loading screen
             joinButton = joinButton || document.getElementById('joinButton');
             if(joinButton) {
                joinButton.disabled = true;
                joinButton.textContent = "Joining...";
             }
             if(options.waitingForAssets) {
                 // Re-use 'loading' state visually while waiting for assets
                 setGameState('loading', { message: "Loading Assets...", assets: true });
             }
             // Otherwise, stay visually on homescreen but with button disabled
            break;
        case 'playing':
            if(gameUI) {
                gameUI.style.display = 'block'; // Make UI container visible
                requestAnimationFrame(() => { // Ensure display:block is applied before adding class
                    gameUI.classList.add('visible'); // Fade in
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


// --- Network & Joining ---
function setupSocketIO() {
    console.log(`Attempting to connect to server: ${SERVER_URL}`);
    socket = io(SERVER_URL, { transports: ['websocket'], autoConnect: true });

    socket.on('connect', () => {
        console.log('Socket connected! ID:', socket.id);
        // Socket is ready, check if assets are also ready to show homescreen
        checkAssetsReady(); // This will transition to homescreen if assets are already loaded
    });

    socket.on('disconnect', (reason) => {
        console.warn('Disconnected from server! Reason:', reason);
        setGameState('homescreen', {playerCount: 0});
        infoDiv.textContent = 'Disconnected';
        for (const id in players) { removePlayerMesh(id); }
        players = {}; bullets = [];
    });

     socket.on('connect_error', (err) => {
        console.error('Connection Error:', err.message);
        // Explicitly set error state and show error message
        mapLoadState = 'error'; // Assume assets can't load if connection fails
        playerModelLoadState = 'error';
        assetsReady = false;
        setGameState('loading', { message: `Connection Failed!<br/>${err.message}`, error: true});
    });

    socket.on('playerCountUpdate', (count) => {
        console.log("Player count update:", count);
        playerCountSpan = playerCountSpan || document.getElementById('playerCount');
        if (playerCountSpan) playerCountSpan.textContent = count;
        // If assets are ready and we are connected, ensure homescreen is shown
        // (This handles cases where count arrives *after* assets are ready)
        if (assetsReady && socket.connected && gameState === 'loading') {
            setGameState('homescreen', { playerCount: count });
        }
    });

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
    if (socket && socket.connected && gameState === 'joining') {
        console.log("Sending player details to server.");
        socket.emit('setPlayerDetails', { name: localPlayerName, phrase: localPlayerPhrase });
        // Stay in 'joining' state visually (button disabled or loading screen shown)
        // Server 'initialize' response will trigger switch to 'playing'
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
function animate() { /* ... Same ... */ }

// --- Utility Functions ---
function onWindowResize() { /* ... Same ... */ }

// --- Start ---
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
