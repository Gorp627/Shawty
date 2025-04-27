// docs/config.js

const CONFIG = {
    SERVER_URL: 'https://gametest-psxl.onrender.com',
    MAP_PATH: 'assets/maps/map.glb',
    PLAYER_MODEL_PATH: 'assets/maps/Shawty1.glb',

    PLAYER_HEIGHT: 1.8,
    PLAYER_RADIUS: 0.4,
    PLAYER_MASS: 70,
    CAMERA_Y_OFFSET: 1.6,
    MOVEMENT_SPEED: 6.0,
    MOVEMENT_SPEED_SPRINTING: 9.5,
    DASH_FORCE_MAGNITUDE: 1200,
    DASH_COOLDOWN: 0.8,

    // --- Physics Config ---
    GRAVITY: -25.0,
    JUMP_VELOCITY: 8.5,
    PHYSICS_TIMESTEP: 1 / 60,
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
Object.freeze(CONFIG);

// --- Global Game Variables ---
let players = {}; let keys = {};
let localPlayerId = null; let localPlayerName = 'Anonymous'; let localPlayerPhrase = '...'; let lastDashTime = 0;
let scene, camera, renderer, controls, clock, loader, dracoLoader;
let world = null;
let loadingScreen, homeScreen, gameUI, playerCountSpan, playerNameInput, playerPhraseInput, joinButton, homeScreenError, infoDiv, healthBarFill, healthText, killMessageDiv;
let killMessageTimeout = null;
let mapMesh = null;

// --- Added Player Physics State ---
let isPlayerGrounded = false; // Flag set by collision events

console.log("config.js loaded and executed (Physics Engine Setup)");
