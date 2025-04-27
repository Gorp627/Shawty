// docs/config.js

const CONFIG = {
    SERVER_URL: 'https://gametest-psxl.onrender.com',
    MAP_PATH: 'assets/maps/map.glb',
    PLAYER_MODEL_PATH: 'assets/maps/Shawty1.glb',

    PLAYER_HEIGHT: 1.8,     // Total logical height of player collision/model
    PLAYER_RADIUS: 0.4,     // Player collision shape radius
    PLAYER_MASS: 70,        // Player mass in kg (for physics)
    CAMERA_Y_OFFSET: 1.6,   // Height of camera viewpoint FROM CENTER of physics body
    MOVEMENT_SPEED: 6.0,    // Target velocity for walking
    MOVEMENT_SPEED_SPRINTING: 9.5, // Target velocity for sprinting
    DASH_FORCE_MAGNITUDE: 1200, // Instantaneous force impulse magnitude for dashing (adjust force, not velocity)
    DASH_COOLDOWN: 0.8,

    // --- Physics Config ---
    GRAVITY: -25.0,         // Acceleration due to gravity (negative Y) - applied by physics engine
    JUMP_VELOCITY: 8.5,     // Initial upward velocity on jump - applied to physics body
    PHYSICS_TIMESTEP: 1 / 60, // Physics simulation step frequency (60 Hz)
    VOID_Y_LEVEL: -40,      // Y level below which player instantly dies (checked on physics body)
    MAP_BOUNDS_X: 50.0,     // Max distance from center X (checked on physics body)
    MAP_BOUNDS_Z: 50.0,     // Max distance from center Z (checked on physics body)
    // --- End Physics ---

    KILL_MESSAGE_DURATION: 3500,

    CLIENT_UPDATE_INTERVAL: 1000 / 20, // For input smoothing maybe, not direct updates
    SERVER_BROADCAST_INTERVAL: 1000 / 15,
    PLAYER_DEFAULT_HEALTH: 100,
    PLAYER_MOVE_THRESHOLD_SQ: 0.0001 // Used for sending network updates
};
Object.freeze(CONFIG); // Good practice: prevent accidental modification

// --- Global Game Variables ---
let players = {}; let keys = {};
let localPlayerId = null; let localPlayerName = 'Anonymous'; let localPlayerPhrase = '...'; let lastDashTime = 0;
let scene, camera, renderer, controls, clock, loader, dracoLoader;
let world = null; // Cannon-es physics world instance
let loadingScreen, homeScreen, gameUI, playerCountSpan, playerNameInput, playerPhraseInput, joinButton, homeScreenError, infoDiv, healthBarFill, healthText, killMessageDiv;
let killMessageTimeout = null;
let mapMesh = null; // Still used for visualizing map, maybe debug physics later

// --- Added Player Physics State ---
let isPlayerGrounded = false; // Flag set by collision events

console.log("config.js loaded and executed (Physics Engine Setup)");
