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
const GUN_POS_OFFSET = new THREE.Vector3(0.4, -0.35, -0.7); // Right, Down, Forward
const GUN_SCALE = 0.45; // Adjust as needed
// *** DEFINE MUZZLE OFFSET HERE ***
const MUZZLE_LOCAL_OFFSET = new THREE.Vector3(0, 0.05, -0.8); // Local offset FROM GUN ORIGIN (x, y(up), z(forward)) - ADJUST
// --- Recoil Config - ADJUST THESE ---
const RECOIL_AMOUNT = new THREE.Vector3(0, 0.015, 0.06); // Y(Up), Z(Back)
const RECOIL_RECOVER_SPEED = 20;

// --- Global Variables ---
// ... (gameState, assetsReady, etc. - SAME as before) ...
let gameState = 'loading', assetsReady = false, mapLoadState = 'loading', playerModelLoadState = 'loading', gunModelLoadState = 'loading';
let socket, localPlayerId = null, localPlayerName = 'Anonymous', localPlayerPhrase = '...';
let players = {}, bullets = [], keys = {};
let scene, camera, renderer, controls, clock, loader, dracoLoader;
let mapMesh = null, playerModel = null, gunModel = null, gunViewModel = null;
let velocityY = 0, isOnGround = false;
let loadingScreen, homeScreen, gameUI, playerCountSpan, playerNameInput, playerPhraseInput, joinButton, homeScreenError, infoDiv, healthBarFill, healthText, killMessageDiv;
let killMessageTimeout = null, gunshotSound;
let frameCount = 0, currentRecoilOffset = new THREE.Vector3(0, 0, 0);


// --- Loader Initialization --- //
console.log("config.js: Initializing Loaders...");
try { loader = new THREE.GLTFLoader(); dracoLoader = new THREE.DRACOLoader(); dracoLoader.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/libs/draco/'); dracoLoader.setDecoderConfig({ type: 'js' }); loader.setDRACOLoader(dracoLoader); console.log("config.js: Loaders Initialized."); }
catch(e) { console.error("CRITICAL ERROR Initializing Loaders:", e); loader = null; }
console.log("config.js loaded and executed");
