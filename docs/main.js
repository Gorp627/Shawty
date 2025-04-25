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
let playerModel = null;

// Physics
let velocityY = 0;
let isOnGround = false;

// UI Elements
let loadingScreen, homeScreen, gameUI, playerCountSpan, playerNameInput, playerPhraseInput, joinButton, homeScreenError, infoDiv, healthBarFill, healthText, killMessageDiv;
let killMessageTimeout = null;

// Sound
let gunshotSound;


// ========================================================
// DEFINE ALL FUNCTIONS BEFORE CALLING THEM IN INIT
// ========================================================

// --- Input Handling ---
function onKeyDown(event) {
    keys[event.code] = true;
    if (event.code === 'Space' && isOnGround && gameState === 'playing') { // Only jump when playing
        velocityY = JUMP_FORCE;
        isOnGround = false;
    }
}

function onKeyUp(event) {
    keys[event.code] = false;
}

function onMouseDown(event) {
    if (gameState === 'playing' && controls.isLocked && event.button === 0) {
        shoot();
    }
}

// --- UI State Management ---
function setGameState(newState, options = {}) {
    console.log(`Setting game state to: ${newState}`, options);
    const previousState = gameState;
    gameState = newState;

    // Ensure elements are defined before manipulating style
    loadingScreen = loadingScreen || document.getElementById('loadingScreen');
    homeScreen = homeScreen || document.getElementById('homeScreen');
    gameUI = gameUI || document.getElementById('gameUI');
    const canvas = document.getElementById('gameCanvas');

    // Hide all screens initially
    if(loadingScreen) loadingScreen.style.display = 'none'; loadingScreen.classList.remove('assets', 'error'); loadingScreen.querySelector('p').style.color = ''; // Reset error color
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
                if (options.error) loadingScreen.querySelector('p').style.color = '#e74c3c';
            }
            break;
        case 'homescreen':
             if(homeScreen) {
                homeScreen.style.display = 'flex';
                homeScreen.classList.add('visible');
                playerCountSpan = playerCountSpan || document.getElementById('playerCount'); // Ensure exists
                if(playerCountSpan) playerCountSpan.textContent = options.playerCount ?? playerCountSpan.textContent; // Use ?? for nullish coalescing
                if (controls && controls.isLocked) controls.unlock();
                const playerControlsObject = scene?.getObjectByName("PlayerControls"); // Use optional chaining
                if (playerControlsObject) scene.remove(playerControlsObject);
                joinButton = joinButton || document.getElementById('joinButton'); // Ensure exists
                if(joinButton) {
                    joinButton.disabled = false;
                    joinButton.textContent = "Join Game";
                }
            }
            break;
        case 'joining':
             if(options.waitingForAssets) {
                 setGameState('loading', { message: "Loading Assets...", assets: true });
             } else {
                 joinButton = joinButton || document.getElementById('joinButton');
                 if(joinButton) {
                     joinButton.disabled = true;
                     joinButton.textContent = "Joining...";
                 }
                 // If homescreen isn't visible, show a joining message on loading screen
                 if (homeScreen && homeScreen.style.display === 'none') {
                     setGameState('loading', { message: "Joining..." });
                 }
             }
            break;
        case 'playing':
            if(gameUI) {
                gameUI.style.display = 'block';
                gameUI.classList.add('visible');
            }
             if(canvas) canvas.style.display = 'block';
            if (scene && controls && !scene.getObjectByName("PlayerControls")) { // Ensure scene exists
                controls.getObject().name = "PlayerControls";
                scene.add(controls.getObject());
            }
            if(controls) controls.lock(); // Attempt lock
            onWindowResize(); // Resize now that canvas is visible
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
function addPlayer(playerData) { /* ... Same as previous ... */ }
function addPlayerFallbackMesh(playerData) { /* ... Same as previous ... */ }
function removePlayerMesh(playerId) { /* ... Same as previous ... */ }
function updateRemotePlayerPosition(playerData) { /* ... Same as previous ... */ }

// --- Game Logic Update Loop ---
function updatePlayer(deltaTime) { /* ... Same as previous ... */ }

// --- Shoot, Bullet, Interpolation, UI, Event Handlers ---
function shoot() { /* ... Same as previous ... */ }
function spawnBullet(bulletData) { /* ... Same as previous ... */ }
function updateBullets(deltaTime) { /* ... Same as previous ... */ }
function updateOtherPlayers(deltaTime) { /* ... Same as previous ... */ }
function updateHealthBar(health) { /* ... Same as previous ... */ }
function showKillMessage(message) { /* ... Same as previous ... */ }
function handlePlayerJoined(playerData) { /* ... Same as previous ... */ }
function handlePlayerLeft(playerId) { /* ... Same as previous ... */ }
function handleHealthUpdate(data) { /* ... Same as previous ... */ }
function handlePlayerDied(data) { /* ... Same as previous ... */ }
function handlePlayerRespawned(playerData) { /* ... Same as previous ... */ }

// --- Animation Loop ---
function animate() {
    requestAnimationFrame(animate);
    const deltaTime = clock ? clock.getDelta() : 0.016; // Use clock if available

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
function onWindowResize() {
    if (camera) {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
    }
    if (renderer) {
        renderer.setSize(window.innerWidth, window.innerHeight);
    }
}


// ========================================================
// INITIALIZATION FUNCTION (runs after definitions)
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
    setGameState('loading'); // NOW safe to call

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
            setGameState('homescreen', { playerCount: playerCountSpan.textContent });
        }
    });

    // Start Loading Assets & Connecting
    loadSound();
    loadPlayerModel();
    loadMap(MAP_PATH);
    setupSocketIO(); // NOW safe to call as it uses showHomeScreen

    // Add Event Listeners (NOW safe to call as handlers are defined)
    joinButton.addEventListener('click', attemptJoinGame);
    window.addEventListener('resize', onWindowResize); // No definition needed, standard practice
    document.addEventListener('keydown', onKeyDown); // Handler now defined
    document.addEventListener('keyup', onKeyUp);     // Handler now defined
    document.addEventListener('mousedown', onMouseDown); // Handler now defined

    // Start the animation loop
    animate();
}


// --- Start ---
// Use DOMContentLoaded to ensure elements exist before `init` runs
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init(); // DOMContentLoaded has already fired
}
