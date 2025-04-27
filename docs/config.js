// docs/config.js

const CONFIG = {
    SERVER_URL: 'https://gametest-psxl.onrender.com',
    MAP_PATH: 'assets/maps/map.glb',
    PLAYER_MODEL_PATH: 'assets/maps/Shawty1.glb',

    PLAYER_HEIGHT: 1.8,     // Logical height
    PLAYER_RADIUS: 0.4,     // Collision capsule/sphere radius
    PLAYER_MASS: 70,        // Physics mass
    CAMERA_Y_OFFSET: 1.6,   // Camera height relative to player BODY CENTER
    MOVEMENT_SPEED: 7.0,    // Speed for velocity calculation
    MOVEMENT_SPEED_SPRINTING: 10.5,
    DASH_IMPULSE_MAGNITUDE: 450, // Impulse magnitude for dash
    DASH_COOLDOWN: 0.8,

    // --- Physics Config (Rapier) ---
    GRAVITY: -25.0,         // Applied by Rapier world
    JUMP_IMPULSE: 250,      // Upward IMPULSE force for jump
    // PHYSICS_TIMESTEP handled internally or in game.js animate
    VOID_Y_LEVEL: -40,      // Y level for void check
    MAP_BOUNDS_X: 50.0,     // X bounds check
    MAP_BOUNDS_Z: 50.0,     // Z bounds check
    // --- End Physics ---

    KILL_MESSAGE_DURATION: 3500,

    CLIENT_UPDATE_INTERVAL: 1000 / 20, // Not used currently
    SERVER_BROADCAST_INTERVAL: 1000 / 15,
    PLAYER_DEFAULT_HEALTH: 100,
    PLAYER_MOVE_THRESHOLD_SQ: 0.0001 // For network updates
};
// Object.freeze(CONFIG); // Comment out for easy testing

// --- Global Game Variables ---
let players = {}; let keys = {};
let localPlayerId = null; let localPlayerName = 'Anonymous'; let localPlayerPhrase = '...'; let lastDashTime = 0;
let scene, camera, renderer, controls, clock, loader, dracoLoader;
var RAPIER = window.RAPIER || null; // Set by rapier_init.js
var rapierWorld = null;             // Physics World instance
var rapierEventQueue = null;        // For collision events

let loadingScreen, homeScreen, gameUI, playerCountSpan, playerNameInput, playerPhraseInput, joinButton, homeScreenError, infoDiv, healthBarFill, healthText, killMessageDiv;
let killMessageTimeout = null;
let mapMesh = null;                 // Visual map mesh

console.log("config.js loaded (Using Rapier, Impulse Jump/Dash)");
