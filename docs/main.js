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
const BULLET_LIFETIME = 3000;

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
}

function onKeyUp(event) {
    keys[event.code] = false;
}

function onMouseDown(event) {
    // If not playing or pointer isn't locked, attempt to lock pointer on click
    if (gameState === 'playing' && !controls?.isLocked) {
        controls?.lock();
    }
    // Shoot only if playing, locked, and left mouse
    else if (gameState === 'playing' && controls?.isLocked && event.button === 0) {
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
                // *** Explicitly unlock controls if they exist and are locked ***
                if (controls?.isLocked) {
                    console.log("Unlocking controls explicitly for homescreen state.");
                    controls.unlock(); // This should NOT trigger the state change now
                }
                // *** -------------------------------------------------------- ***
                const playerControlsObject = scene?.getObjectByName("PlayerControls");
                if (playerControlsObject) {
                    console.log("Removing player controls from scene for homescreen.");
                    scene.remove(playerControlsObject);
                }
                joinButton = joinButton || document.getElementById('joinButton');
                if(joinButton) {
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
                 // Use timeout to help ensure browser is ready for lock after state change/render
                 setTimeout(() => {
                      if(gameState === 'playing' && !controls.isLocked) {
                          console.log(">>> Executing delayed controls.lock()");
                          controls.lock();
                      }
                 }, 100); // 100ms delay
            } else { console.error(">>> Scene or Controls not ready when setting state to playing!");}

            onWindowResize();
            console.log(">>> Game state set to PLAYING complete.");
            break;
    }
     console.log(`Switched state from ${previousState} to ${gameState}`);
}


// --- Asset Loading ---
function loadSound() { /* ... Same ... */ }
function loadPlayerModel() { /* ... Same ... */ }
function loadMap(mapPath) { /* ... Same ... */ }
function checkAssetsReady() { /* ... Same ... */ }

// --- Network & Joining ---
function setupSocketIO() { /* ... Same ... */ }
function attemptJoinGame() { /* ... Same ... */ }
function sendJoinDetails() { /* ... Same ... */ }

// --- Player Management & Model Loading ---
function addPlayer(playerData) { /* ... Same (remember to adjust desiredScale if needed) ... */ }
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


// ========================================================
// INITIALIZATION FUNCTION DEFINITION
// ========================================================
function init() {
    console.log("Initializing Shawty...");
    // Get UI Elements & ADD NULL CHECKS
    loadingScreen = document.getElementById('loadingScreen'); if (!loadingScreen) { console.error("CRITICAL ERROR: Cannot find element with ID 'loadingScreen'"); return; }
    homeScreen = document.getElementById('homeScreen'); if (!homeScreen) { console.error("CRITICAL ERROR: Cannot find element with ID 'homeScreen'"); return; }
    gameUI = document.getElementById('gameUI'); if (!gameUI) { console.error("CRITICAL ERROR: Cannot find element with ID 'gameUI'"); return; }
    playerCountSpan = document.getElementById('playerCount'); if (!playerCountSpan) { console.error("CRITICAL ERROR: Cannot find element with ID 'playerCount'"); return; }
    playerNameInput = document.getElementById('playerNameInput'); if (!playerNameInput) { console.error("CRITICAL ERROR: Cannot find element with ID 'playerNameInput'"); return; }
    playerPhraseInput = document.getElementById('playerPhraseInput'); if (!playerPhraseInput) { console.error("CRITICAL ERROR: Cannot find element with ID 'playerPhraseInput'"); return; }
    joinButton = document.getElementById('joinButton'); if (!joinButton) { console.error("CRITICAL ERROR: Cannot find element with ID 'joinButton'"); return; }
    homeScreenError = document.getElementById('homeScreenError'); if (!homeScreenError) { console.error("CRITICAL ERROR: Cannot find element with ID 'homeScreenError'"); return; }
    infoDiv = document.getElementById('info'); if (!infoDiv) { console.error("CRITICAL ERROR: Cannot find element with ID 'info'"); return; }
    healthBarFill = document.getElementById('healthBarFill'); if (!healthBarFill) { console.error("CRITICAL ERROR: Cannot find element with ID 'healthBarFill'"); return; }
    healthText = document.getElementById('healthText'); if (!healthText) { console.error("CRITICAL ERROR: Cannot find element with ID 'healthText'"); return; }
    killMessageDiv = document.getElementById('killMessage'); if (!killMessageDiv) { console.error("CRITICAL ERROR: Cannot find element with ID 'killMessage'"); return; }
    const canvas = document.getElementById('gameCanvas'); if (!canvas) { console.error("CRITICAL ERROR: Cannot find element with ID 'gameCanvas'"); return; }
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
        loader = new THREE.GLTFLoader();
        dracoLoader = new THREE.DRACOLoader();
        dracoLoader.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/libs/draco/');
        dracoLoader.setDecoderConfig({ type: 'js' });
        loader.setDRACOLoader(dracoLoader);
        console.log("Three.js core initialized.");
    } catch (e) { /* ... error handling ... */ return; }

    // Lighting
    try { /* ... Same ... */ } catch(e) { /* ... error handling ... */ return; }

    // Controls
    try {
        controls = new THREE.PointerLockControls(camera, document.body);
        controls.addEventListener('lock', () => console.log('Pointer Locked'));
        // --- REVISED UNLOCK LISTENER ---
        controls.addEventListener('unlock', () => {
            console.log('Pointer Unlocked (Escape pressed or focus lost)');
            // DO NOT automatically change state here. Player must click to re-lock.
            // You could show a pause overlay here if desired.
        });
        // -----------------------------
        console.log("PointerLockControls initialized.");
    } catch (e) { /* ... error handling ... */ return; }

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
