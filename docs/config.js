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
const GUN_POS_OFFSET = new THREE.Vector3(0.4, -0.35, -0.7); // ADJUST
const GUN_SCALE = 0.1; // ADJUST
const RECOIL_AMOUNT = new THREE.Vector3(0, 0.015, 0.06); // ADJUST
const RECOIL_RECOVER_SPEED = 20; // ADJUST

// --- Global Variables ---
// Game State
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

// Three.js Core (Declare here)
let scene, camera, renderer, controls, clock;
let mapMesh = null;
let playerModel = null;
let gunModel = null;
let gunViewModel = null;

// *** INITIALIZE LOADERS GLOBALLY HERE ***
console.log("config.js: Initializing Loaders...");
let loader = new THREE.GLTFLoader();
let dracoLoader = new THREE.DRACOLoader();
// Configure Draco Loader immediately
dracoLoader.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/libs/draco/');
dracoLoader.setDecoderConfig({ type: 'js' });
loader.setDRACOLoader(dracoLoader); // Associate them
console.log("config.js: Loaders Initialized.");
// ***************************************

// Physics
let velocityY = 0;
let isOnGround = false;

// UI Elements
let loadingScreen, homeScreen, gameUI, playerCountSpan, playerNameInput, playerPhraseInput, joinButton, homeScreenError, infoDiv, healthBarFill, healthText, killMessageDiv;
let killMessageTimeout = null;

// Sound
let gunshotSound;
let currentRecoilOffset = new THREE.Vector3(0, 0, 0);

console.log("config.js loaded and executed");
