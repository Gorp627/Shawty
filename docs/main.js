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
function onKeyDown(event) { /* ... Same as previous ... */ }
function onKeyUp(event) { /* ... Same as previous ... */ }
function onMouseDown(event) { /* ... Same as previous ... */ }

// --- UI State Management ---
function setGameState(newState, options = {}) { /* ... Same as previous ... */ }

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
function animate() { /* ... Same as previous ... */ }

// --- Utility Functions ---
function onWindowResize() { /* ... Same as previous ... */ }


// ========================================================
// INITIALIZATION FUNCTION DEFINITION
// ========================================================
function init() {
    console.log("Initializing Shawty...");

    // *** Get UI Elements & ADD NULL CHECKS ***
    loadingScreen = document.getElementById('loadingScreen');
    if (!loadingScreen) { console.error("CRITICAL ERROR: Cannot find element with ID 'loadingScreen'"); return; } // Stop if missing

    homeScreen = document.getElementById('homeScreen');
     if (!homeScreen) { console.error("CRITICAL ERROR: Cannot find element with ID 'homeScreen'"); return; }

    gameUI = document.getElementById('gameUI');
     if (!gameUI) { console.error("CRITICAL ERROR: Cannot find element with ID 'gameUI'"); return; }

    playerCountSpan = document.getElementById('playerCount');
     if (!playerCountSpan) { console.error("CRITICAL ERROR: Cannot find element with ID 'playerCount'"); return; }

    playerNameInput = document.getElementById('playerNameInput');
     if (!playerNameInput) { console.error("CRITICAL ERROR: Cannot find element with ID 'playerNameInput'"); return; }

    playerPhraseInput = document.getElementById('playerPhraseInput');
     if (!playerPhraseInput) { console.error("CRITICAL ERROR: Cannot find element with ID 'playerPhraseInput'"); return; }

    joinButton = document.getElementById('joinButton');
     if (!joinButton) { console.error("CRITICAL ERROR: Cannot find element with ID 'joinButton'"); return; }

    homeScreenError = document.getElementById('homeScreenError');
     if (!homeScreenError) { console.error("CRITICAL ERROR: Cannot find element with ID 'homeScreenError'"); return; }

    infoDiv = document.getElementById('info');
     if (!infoDiv) { console.error("CRITICAL ERROR: Cannot find element with ID 'info'"); return; }

    healthBarFill = document.getElementById('healthBarFill');
     if (!healthBarFill) { console.error("CRITICAL ERROR: Cannot find element with ID 'healthBarFill'"); return; }

    healthText = document.getElementById('healthText');
     if (!healthText) { console.error("CRITICAL ERROR: Cannot find element with ID 'healthText'"); return; }

    killMessageDiv = document.getElementById('killMessage');
     if (!killMessageDiv) { console.error("CRITICAL ERROR: Cannot find element with ID 'killMessage'"); return; }

    const canvas = document.getElementById('gameCanvas'); // Get canvas here too
     if (!canvas) { console.error("CRITICAL ERROR: Cannot find element with ID 'gameCanvas'"); return; }
     console.log("All required UI elements found."); // Log success if all found

    // Set Initial UI State (Should now be safe)
    setGameState('loading');

    // Basic Three.js Scene Setup
    try { // Add try-catch around potential Three.js init errors
        scene = new THREE.Scene();
        scene.background = new THREE.Color(0x87ceeb);
        scene.fog = new THREE.Fog(0x87ceeb, 0, 150);
        camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true }); // Use canvas ref
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.shadowMap.enabled = true;
        clock = new THREE.Clock();
        loader = new THREE.GLTFLoader();
        dracoLoader = new THREE.DRACOLoader();
        dracoLoader.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/libs/draco/');
        dracoLoader.setDecoderConfig({ type: 'js' });
        loader.setDRACOLoader(dracoLoader);
        console.log("Three.js core initialized.");
    } catch (e) {
        console.error("CRITICAL ERROR during Three.js initialization:", e);
        setGameState('loading', {message: "FATAL: Graphics Init Error!<br/>Check Console.", error: true});
        return; // Stop execution
    }


    // Lighting
    try {
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        scene.add(ambientLight);
        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.9);
        directionalLight.position.set(10, 15, 10);
        directionalLight.castShadow = true;
        directionalLight.shadow.mapSize.width = 1024;
        directionalLight.shadow.mapSize.height = 1024;
        scene.add(directionalLight);
        console.log("Lighting added.");
    } catch(e) {
        console.error("Error adding lighting:", e);
         setGameState('loading', {message: "FATAL: Graphics Init Error (Light)!<br/>Check Console.", error: true});
        return;
    }


    // Controls
    try {
        controls = new THREE.PointerLockControls(camera, document.body);
        controls.addEventListener('lock', () => console.log('Pointer Locked'));
        controls.addEventListener('unlock', () => {
            console.log('Pointer Unlocked');
            if (gameState === 'playing') {
                 setGameState('homescreen', { playerCount: playerCountSpan?.textContent ?? '?' });
            }
        });
        console.log("PointerLockControls initialized.");
    } catch (e) {
         console.error("CRITICAL ERROR initializing PointerLockControls:", e);
         setGameState('loading', {message: "FATAL: Controls Init Error!<br/>Check Console.", error: true});
        return;
    }


    // Start Loading Assets & Connecting
    console.log("Starting asset loading and socket connection...");
    loadSound();
    loadPlayerModel();
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
