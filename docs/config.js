// docs/config.js (Ensure Global Flags Declared ONCE Here - v3)

const CONFIG = {
    SERVER_URL: 'https://gametest-psxl.onrender.com', // Ensure this points to your Render server URL
    MAP_PATH: 'assets/maps/map.glb', // MAKE SURE THIS PATH IS CORRECT
    PLAYER_MODEL_PATH: 'assets/maps/Shawty1.glb',
    GUN_MODEL_PATH: 'assets/maps/gun2.glb',
    GUN_SHOT_SOUND_PATH: 'assets/maps/gunshot.wav',

    PLAYER_HEIGHT: 1.8,
    PLAYER_RADIUS: 0.4,
    PLAYER_MASS: 70,
    CAMERA_Y_OFFSET: 0.6, // Camera height relative to player BODY CENTER (Adjust eye level)
    MOVEMENT_SPEED: 7.0,
    MOVEMENT_SPEED_SPRINTING: 10.5,
    DASH_IMPULSE_MAGNITUDE: 450,
    DASH_COOLDOWN: 0.8,
    DASH_DURATION: 0.15,

    // --- Physics Config (Rapier) ---
    GRAVITY: -25.0, // Heavy gravity
    JUMP_IMPULSE: 300,
    VOID_Y_LEVEL: -100,
    MAP_BOUNDS_X: 100.0,
    MAP_BOUNDS_Z: 100.0,
    GROUND_CHECK_DISTANCE: 0.25,
    // --- End Physics ---

    // --- Shooting ---
    SHOOT_COOLDOWN: 150, // ms between shots
    BULLET_DAMAGE: 25,
    BULLET_RANGE: 300, // Max distance bullets travel
    ROCKET_JUMP_FORCE: 350, // Upward impulse for rocket jump
    ROCKET_JUMP_ANGLE_THRESHOLD: -0.7, // Dot product threshold for looking down (-1 is straight down)
    // --- End Shooting ---

    // --- Effects ---
    DEATH_EXPLOSION_FORCE: 600.0, // Impulse magnitude for shockwave
    DEATH_EXPLOSION_RADIUS: 15.0, // Range of shockwave
    // --- End Effects ---

    KILL_MESSAGE_DURATION: 3500,

    CLIENT_UPDATE_INTERVAL: 1000 / 20, // ~50ms
    SERVER_BROADCAST_INTERVAL: 1000 / 15, // ~66ms (Used by server.js)
    PLAYER_DEFAULT_HEALTH: 100,
    PLAYER_MOVE_THRESHOLD_SQ: 0.0001 // Min distance squared to trigger network update
};

// --- Global Game Variables / Objects ---
// Declare variables that will be assigned objects/values by other scripts
let players = {};
let keys = {};
let localPlayerId = null;
let localPlayerName = 'Anonymous';
let localPlayerPhrase = '...';
let lastDashTime = 0;
let lastShootTime = 0;

let scene, camera, renderer, controls, clock, loader, dracoLoader;
var RAPIER = window.RAPIER || null; // Use var or let, check window first
var rapierWorld = null;
var rapierEventQueue = null;
let loadingScreen, homeScreen, gameUI, playerCountSpan, playerNameInput, playerPhraseInput, joinButton, homeScreenError, infoDiv, healthBarFill, healthText, killMessageDiv;
let killMessageTimeout = null;
let mapMesh = null; // Reference to the visual map Object3D
let gunMesh = null; // Reference to the local player's gun model
let gunSoundBuffer = null; // Loaded gunshot sound
let listener; // THREE.AudioListener

// --- Global State Flags ---
// Declare state flags ONCE here using 'let'
let assetsAreReady = false;
let networkIsInitialized = false; // <<< DECLARED HERE
let physicsIsReady = false;
let initializationData = null; // Data from server

console.log("config.js loaded (Declares Globals)");
