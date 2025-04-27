// docs/config.js (Config for Rapier)

const CONFIG = {
    SERVER_URL: 'https://gametest-psxl.onrender.com',
    MAP_PATH: 'assets/maps/the first map!.glb',
    PLAYER_MODEL_PATH: 'assets/maps/Shawty1.glb',

    PLAYER_HEIGHT: 1.8,
    PLAYER_RADIUS: 0.4,
    PLAYER_MASS: 70,
    CAMERA_Y_OFFSET: 0.7,   // Camera height relative to player BODY CENTER (Capsule center)
    MOVEMENT_FORCE: 1500,  // Force applied for WASD movement (adjust as needed)
    MAX_MOVE_VELOCITY: 8.0, // Max speed cap for regular movement
    SPRINT_FACTOR: 1.5,     // Multiplier for movement force/max speed when sprinting
    DASH_IMPULSE_MAGNITUDE: 450, // Impulse for dashing
    DASH_COOLDOWN: 0.8,

    // --- Physics Config (Rapier) ---
    GRAVITY: -25.0,
    JUMP_IMPULSE: 300,      // Upward IMPULSE force for jump
    VOID_Y_LEVEL: -100,
    MAP_BOUNDS_X: 100.0,
    MAP_BOUNDS_Z: 100.0,
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
// Globals set by rapier_init.js and Game.initializePhysics
var RAPIER = window.RAPIER || null;
var rapierWorld = null;
var rapierEventQueue = null;

let loadingScreen, homeScreen, gameUI, playerCountSpan, playerNameInput, playerPhraseInput, joinButton, homeScreenError, infoDiv, healthBarFill, healthText, killMessageDiv;
let killMessageTimeout = null;
let mapMesh = null; // Visual map mesh

console.log("config.js loaded (For Rapier Engine)");
