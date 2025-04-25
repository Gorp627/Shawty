// docs/main.js

// --- Configuration ---
const SERVER_URL = 'https://gametest-psxl.onrender.com';
const MAP_PATH = 'assets/maps/map.glb';
const SOUND_PATH_GUNSHOT = 'assets/maps/gunshot.wav'; // User specified path
const PLAYER_MODEL_PATH = 'assets/maps/Shawty1.glb'; // User specified path
const GUN_MODEL_PATH = 'assets/maps/gun2.glb'; // User specified path

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
let gunModelLoadState = 'loading';
let socket;
let localPlayerId = null;
let localPlayerName = 'Anonymous';
let localPlayerPhrase = '...';
let players = {};
let bullets = [];
let keys = {};
// Ensure 'loader' is declared here
let scene, camera, renderer, controls, clock, loader, dracoLoader;
let mapMesh = null;
let playerModel = null;
let gunModel = null;
let gunViewModel = null;
let velocityY = 0;
let isOnGround = false;
let loadingScreen, homeScreen, gameUI, playerCountSpan, playerNameInput, playerPhraseInput, joinButton, homeScreenError, infoDiv, healthBarFill, healthText, killMessageDiv;
let killMessageTimeout = null;
let gunshotSound;
let frameCount = 0;
let currentRecoilOffset = new THREE.Vector3(0, 0, 0);

// ========================================================
// FUNCTION DEFINITIONS (Define ALL before init)
// ========================================================

// --- Input Handling ---
function onKeyDown(event) { /* ... Same as previous ... */ }
function onKeyUp(event) { /* ... Same as previous ... */ }
function onMouseDown(event) { /* ... Same as previous ... */ }

// --- UI State Management ---
function setGameState(newState, options = {}) { /* ... Same as previous ... */ }

// --- Asset Loading ---
function loadSound() { /* ... Same as previous ... */ }

function loadPlayerModel() {
    // Requires 'loader' to be initialized
    if (!loader) { console.error("loadPlayerModel called before loader was initialized!"); return; } // Safety check
    playerModelLoadState = 'loading';
    console.log(`Loading player model from: ${PLAYER_MODEL_PATH}`);
    loader.load(PLAYER_MODEL_PATH, (gltf) => { /* ... success ... */ checkAssetsReady(); }, undefined, (error) => { /* ... error ... */ playerModelLoadState = 'error'; checkAssetsReady(); });
}

function loadGunModel() {
    // Requires 'loader' to be initialized
    if (!loader) { console.error("loadGunModel called before loader was initialized!"); return; } // Safety check
    gunModelLoadState = 'loading';
    console.log(`Loading gun model from: ${GUN_MODEL_PATH}`);
    // >>> This is where the error likely happened - ensure 'loader' is valid <<<
    loader.load(GUN_MODEL_PATH, (gltf) => {
        console.log("Gun model loaded successfully!"); gunModel = gltf.scene;
        gunModel.traverse((child) => { if (child.isMesh) { child.castShadow = false; child.receiveShadow = false;} });
        gunModelLoadState = 'loaded'; checkAssetsReady();
    }, undefined, (error) => {
        console.error("!!! FATAL: Error loading gun model:", error); gunModelLoadState = 'error'; checkAssetsReady();
    });
}

function loadMap(mapPath) {
    // Requires 'loader' to be initialized
    if (!loader) { console.error("loadMap called before loader was initialized!"); return; } // Safety check
    mapLoadState = 'loading';
    console.log(`Loading map from: ${mapPath}`);
    loader.load( mapPath, (gltf) => { /* ... success ... */ mapLoadState = 'loaded'; checkAssetsReady(); }, (xhr) => { /* Progress */ }, (error) => { /* ... error ... */ mapLoadState = 'error'; checkAssetsReady(); });
}

function checkAssetsReady() { /* ... Same as previous ... */ }

// --- Network & Joining ---
function setupSocketIO() { /* ... Same as previous ... */ }
function attemptJoinGame() { /* ... Same as previous ... */ }
function sendJoinDetails() { /* ... Same as previous ... */ }

// --- Player Management & Model Loading ---
function addPlayer(playerData) { /* ... Same as previous (verify desiredScale) ... */ }
function addPlayerFallbackMesh(playerData) { /* ... Same as previous ... */ }
function removePlayerMesh(playerId) { /* ... Same as previous ... */ }
function updateRemotePlayerPosition(playerData) { /* ... Same as previous ... */ }

// --- Game Logic Update Loop ---
function updatePlayer(deltaTime) { /* ... Same as previous ... */ }

// --- View Model Update (Recoil) ---
function updateViewModel(deltaTime) { /* ... Same as previous ... */ }
function attachGunViewModel() { /* ... Same as previous ... */ }
function removeGunViewModel() { /* ... Same as previous ... */ }

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
function animate() { /* ... Same as previous ... */ }

// --- Utility Functions ---
function onWindowResize() { /* ... Same as previous ... */ }


// ========================================================
// INITIALIZATION FUNCTION DEFINITION
// ========================================================
function init() {
    console.log("Initializing Shawty...");
    // Get UI Elements & ADD NULL CHECKS
    // ... (Same null checks for all elements as in previous response) ...
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

    // Set Initial UI State
    setGameState('loading');

    // Basic Three.js Scene Setup
    try {
        scene = new THREE.Scene();
        scene.background = new THREE.Color(0x87ceeb);
        scene.fog = new THREE.Fog(0x87ceeb, 0, 150);
        camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.shadowMap.enabled = true;
        clock = new THREE.Clock();

        // **** CRITICAL INITIALIZATION ****
        console.log("Initializing THREE.GLTFLoader...");
        loader = new THREE.GLTFLoader(); // <<< MUST HAPPEN HERE
        console.log("Initializing THREE.DRACOLoader...");
        dracoLoader = new THREE.DRACOLoader(); // <<< MUST HAPPEN HERE
        // **** END CRITICAL ****

        dracoLoader.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/libs/draco/');
        dracoLoader.setDecoderConfig({ type: 'js' });
        loader.setDRACOLoader(dracoLoader); // Okay to call this after both are initialized
        console.log("Three.js core initialized (including loaders).");

    } catch (e) {
        console.error("CRITICAL ERROR during Three.js initialization:", e);
        setGameState('loading', {message: "FATAL: Graphics Init Error!<br/>Check Console.", error: true});
        return; // Stop execution
    }


    // Lighting
    try { /* ... Same ... */ } catch(e) { /* ... error handling ... */ return; }

    // Controls
    try { /* ... Same ... */ } catch (e) { /* ... error handling ... */ return; }

    // Start Loading Assets & Connecting
    console.log("Starting asset loading and socket connection...");
    // These calls are now safe because 'loader' was initialized above
    loadSound();
    loadPlayerModel();
    loadGunModel();
    loadMap(MAP_PATH);
    setupSocketIO();

    // Add Event Listeners
    console.log("Adding event listeners...");
    joinButton?.addEventListener('click', attemptJoinGame);
    window.addEventListener('resize', onWindowResize);
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    document.addEventListener('mousedown', onMouseDown);
    console.log("Event listeners added.");

    // Start animation loop
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
