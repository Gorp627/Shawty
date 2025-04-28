// docs/config.js (Config for Rapier - Remove raycaster)

const CONFIG = {
    SERVER_URL: 'https://gametest-psxl.onrender.com',
    MAP_PATH: 'assets/maps/the first map!.glb',
    PLAYER_MODEL_PATH: 'assets/maps/Shawty1.glb',

    PLAYER_HEIGHT: 1.8,
    PLAYER_RADIUS: 0.4,
    PLAYER_MASS: 70,
    CAMERA_Y_OFFSET: 1.6,   // Camera height relative to player BODY CENTER
    MOVEMENT_FORCE: 1500,
    MAX_MOVE_VELOCITY: 8.0,
    SPRINT_FACTOR: 1.5,
    DASH_IMPULSE_MAGNITUDE: 450,
    DASH_COOLDOWN: 0.8,

    // --- Physics Config (Rapier) ---
    GRAVITY: -25.0,
    JUMP_IMPULSE: 300,
    VOID_Y_LEVEL: -100,
    MAP_BOUNDS_X: 100.0,
    MAP_BOUNDS_Z: 100.0,
    GROUND_CHECK_DISTANCE: 0.25, // How far below the capsule center to check for ground
    // --- End Physics ---

    KILL_MESSAGE_DURATION: 3500,

    CLIENT_UPDATE_INTERVAL: 1000 / 20,
    SERVER_BROADCAST_INTERVAL: 1000 / 15,
    PLAYER_DEFAULT_HEALTH: 100,
    PLAYER_MOVE_THRESHOLD_SQ: 0.0001
};
// Object.freeze(CONFIG);

// --- Global Game Variables ---
let players = {}; let keys = {};
let localPlayerId = null; let localPlayerName = 'Anonymous'; let localPlayerPhrase = '...'; let lastDashTime = 0;
let scene, camera, renderer, controls, clock, loader, dracoLoader;
var RAPIER = window.RAPIER || null;
var rapierWorld = null;
var rapierEventQueue = null;

let loadingScreen, homeScreen, gameUI, playerCountSpan, playerNameInput, playerPhraseInput, joinButton, homeScreenError, infoDiv, healthBarFill, healthText, killMessageDiv;
let killMessageTimeout = null;
let mapMesh = null; // Visual map mesh

// --- Removed Manual Physics/Raycaster State ---
// let velocityY = 0;
// let isOnGround = false;
// let raycaster = new THREE.Raycaster(); // <<< REMOVED AGAIN <<<

console.log("config.js loaded (Rapier - Removed raycaster AGAIN)");
