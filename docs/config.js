// docs/config.js

const CONFIG = {
    SERVER_URL: 'https://gametest-psxl.onrender.com',
    MAP_PATH: 'assets/maps/map.glb',
    PLAYER_MODEL_PATH: 'assets/maps/Shawty1.glb',

    PLAYER_HEIGHT: 1.8,     // Logical height
    PLAYER_RADIUS: 0.4,     // Collision capsule/sphere radius
    PLAYER_MASS: 70,        // Physics mass
    CAMERA_Y_OFFSET: 1.6,   // Camera height relative to player BODY CENTER
    MOVEMENT_SPEED: 7.0,    // Speed for velocity calculation (Increase slightly)
    MOVEMENT_SPEED_SPRINTING: 10.5,
    DASH_IMPULSE_MAGNITUDE: 450, // <<< CHANGED to Impulse again, adjust magnitude
    DASH_COOLDOWN: 0.8,

    // --- Physics Config (Rapier) ---
    GRAVITY: -25.0,
    JUMP_IMPULSE: 250,      // <<< CHANGED: Upward IMPULSE force for jump
    // PHYSICS_TIMESTEP no longer needed here
    VOID_Y_LEVEL: -40,
    MAP_BOUNDS_X: 50.0,
    MAP_BOUNDS_Z: 50.0,
    // --- End Physics ---

    KILL_MESSAGE_DURATION: 3500,

    CLIENT_UPDATE_INTERVAL: 1000 / 20,
    SERVER_BROADCAST_INTERVAL: 1000 / 15,
    PLAYER_DEFAULT_HEALTH: 100,
    PLAYER_MOVE_THRESHOLD_SQ: 0.0001
};
// Object.freeze(CONFIG); // Keep commented

// --- Global Game Variables ---
let players = {}; let keys = {};
let localPlayerId = null; let localPlayerName = 'Anonymous'; let localPlayerPhrase = '...'; let lastDashTime = 0;
let scene, camera, renderer, controls, clock, loader, dracoLoader;
var RAPIER = window.RAPIER || null; // Set by rapier_init.js
var rapierWorld = null;
var rapierEventQueue = null;

let loadingScreen, homeScreen, gameUI, playerCountSpan, playerNameInput, playerPhraseInput, joinButton, homeScreenError, infoDiv, healthBarFill, healthText, killMessageDiv;
let killMessageTimeout = null;
let mapMesh = null; // Visual map mesh

// --- Removed isPlayerGrounded ---

console.log("config.js loaded (Using Rapier, Impulse Jump/Dash)");
