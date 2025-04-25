// docs/config.js

// --- Configuration ---
const SERVER_URL = 'https://gametest-psxl.onrender.com';
const MAP_PATH = 'assets/maps/map.glb';
const SOUND_PATH_GUNSHOT = 'assets/maps/gunshot.wav';
const PLAYER_MODEL_PATH = 'assets/maps/Shawty1.glb';
const GUN_MODEL_PATH = 'assets/maps/gun2.glb';

const PLAYER_HEIGHT = 1.8;
const PLAYER_RADIUS = 0.4;
// ... (Other constants: speeds, gravity, etc.) ...
const MOVEMENT_SPEED = 5.0;
const MOVEMENT_SPEED_SPRINTING = 8.0;
const BULLET_SPEED = 60;
const GRAVITY = 19.62;
const JUMP_FORCE = 8.0;
const VOID_Y_LEVEL = -30;
const PLAYER_COLLISION_RADIUS = PLAYER_RADIUS;
const KILL_MESSAGE_DURATION = 4000;
const BULLET_LIFETIME = 3000;
const GUN_POS_OFFSET = new THREE.Vector3(0.4, -0.35, -0.7);
const GUN_SCALE = 1.0; // Keep large for testing
const RECOIL_AMOUNT = new THREE.Vector3(0, 0.015, 0.06);
const RECOIL_RECOVER_SPEED = 20;


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
// *** Declare loaders, but DO NOT initialize here ***
let scene, camera, renderer, controls, clock, loader, dracoLoader;
// *************************************************
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

// --- REMOVED Loader Initialization Block ---

console.log("config.js loaded and executed");
