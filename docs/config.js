// docs/config.js

// --- Configuration ---
const SERVER_URL = 'https://gametest-psxl.onrender.com';
const MAP_PATH = 'assets/maps/map.glb';
const SOUND_PATH_GUNSHOT = 'assets/maps/gunshot.wav';
const PLAYER_MODEL_PATH = 'assets/maps/Shawty1.glb';
const GUN_MODEL_PATH = 'assets/maps/gun2.glb';

const PLAYER_HEIGHT = 1.8;
const PLAYER_RADIUS = 0.4;
const MOVEMENT_SPEED = 5.0;
const MOVEMENT_SPEED_SPRINTING = 8.0;
const BULLET_SPEED = 60;
const GRAVITY = 19.62;
const JUMP_FORCE = 8.0;
const VOID_Y_LEVEL = -30;
const PLAYER_COLLISION_RADIUS = PLAYER_RADIUS;
const KILL_MESSAGE_DURATION = 4000;
const BULLET_LIFETIME = 3000;
// --- Gun View Model Config - ADJUST THESE ---
const GUN_POS_OFFSET = new THREE.Vector3(0.35, -0.3, -0.6); // Adjusted: Slightly more right, less down, less forward
const GUN_SCALE = 0.45; // <<< INCREASED SCALE AGAIN - Adjust further! Try 0.5, 0.6?
const MUZZLE_LOCAL_OFFSET = new THREE.Vector3(0, 0.1, -1.0); // Local offset FROM GUN ORIGIN (x, y, z<-forward) - **ADJUST THIS** based on your gun model's shape/origin
// --- Recoil Config - ADJUST THESE ---
const RECOIL_AMOUNT = new THREE.Vector3(0, 0.015, 0.06); // Y(Up), Z(Back)
const RECOIL_RECOVER_SPEED = 20; // Higher is faster

// --- Global Variables ---
// ... (Keep all other globals: gameState, assetsReady, socket, players, etc.) ...
let gameState = 'loading', assetsReady = false, mapLoadState = 'loading', playerModelLoadState = 'loading', gunModelLoadState = 'loading';
let socket, localPlayerId = null, localPlayerName = 'Anonymous', localPlayerPhrase = '...';
let players = {}, bullets = [], keys = {};
let scene, camera, renderer, controls, clock, loader, dracoLoader;
let mapMesh = null, playerModel = null, gunModel = null, gunViewModel = null;
let velocityY = 0, isOnGround = false;
let loadingScreen, homeScreen, gameUI, playerCountSpan, playerNameInput, playerPhraseInput, joinButton, homeScreenError, infoDiv, healthBarFill, healthText, killMessageDiv;
let killMessageTimeout = null, gunshotSound;
let frameCount = 0, currentRecoilOffset = new THREE.Vector3(0, 0, 0);


// --- Loader Initialization ---
console.log("config.js: Initializing Loaders...");
try { /* ... Same loader init ... */ } catch(e) { /* ... */ }
console.log("config.js loaded and executed");
