// docs/config.js

const CONFIG = {
    SERVER_URL: 'https://gametest-psxl.onrender.com',
    MAP_PATH: 'assets/maps/map.glb',
    PLAYER_MODEL_PATH: 'assets/maps/Shawty1.glb',

    PLAYER_HEIGHT: 1.8, // Total logical height of player collision/model
    PLAYER_RADIUS: 0.4, // Unified radius name
    CAMERA_Y_OFFSET: 1.9, // Height of camera viewpoint from player feet (Y=0)
    MOVEMENT_SPEED: 6.0, MOVEMENT_SPEED_SPRINTING: 9.5,
    DASH_FORCE: 25.0, DASH_DURATION: 0.15, DASH_COOLDOWN: 0.8,

    // --- Physics Re-added ---
    GRAVITY: 25.0,          // Acceleration due to gravity
    JUMP_FORCE: 9.0,        // Initial upward velocity on jump
    VOID_Y_LEVEL: -40,      // Y level below which player instantly dies
    MAP_BOUNDS_X: 50.0,     // Max distance from center X before falling into void (adjust based on map size)
    MAP_BOUNDS_Z: 50.0,     // Max distance from center Z before falling into void (adjust based on map size)
    // --- End Physics ---

    KILL_MESSAGE_DURATION: 3500,

    CLIENT_UPDATE_INTERVAL: 1000 / 20,
    SERVER_BROADCAST_INTERVAL: 1000 / 15,
    PLAYER_DEFAULT_HEALTH: 100,
    PLAYER_MOVE_THRESHOLD_SQ: 0.0001
};
Object.freeze(CONFIG); // Good practice: prevent accidental modification

// --- Global Game Variables ---
let players = {}; let keys = {};
let localPlayerId = null; let localPlayerName = 'Anonymous'; let localPlayerPhrase = '...'; let lastDashTime = 0;
let scene, camera, renderer, controls, clock, loader, dracoLoader;
let loadingScreen, homeScreen, gameUI, playerCountSpan, playerNameInput, playerPhraseInput, joinButton, homeScreenError, infoDiv, healthBarFill, healthText, killMessageDiv;
let killMessageTimeout = null;
let mapMesh = null; // Assigned by loadManager

// --- Physics State Variables ---
let velocityY = 0;      // Current vertical velocity
let isOnGround = false; // Is the player currently touching the ground?
let raycaster = new THREE.Raycaster(); // Raycaster for ground check

console.log("config.js loaded and executed (Physics Re-enabled)");
