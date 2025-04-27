// docs/config.js (Manual Physics Reverted)

const CONFIG = {
    SERVER_URL: 'https://gametest-psxl.onrender.com',
    MAP_PATH: 'assets/maps/the first map!.glb', // Using new map
    PLAYER_MODEL_PATH: 'assets/maps/Shawty1.glb',

    PLAYER_HEIGHT: 1.8,
    PLAYER_RADIUS: 0.4,
    CAMERA_Y_OFFSET: 1.6, // Camera height relative to FEET (Y=0) in manual physics
    MOVEMENT_SPEED: 7.0,
    MOVEMENT_SPEED_SPRINTING: 10.5,
    DASH_FORCE: 25.0,
    DASH_DURATION: 0.15,
    DASH_COOLDOWN: 0.8,

    // --- Physics Config (Manual) ---
    GRAVITY: 25.0,
    JUMP_FORCE: 9.0,
    VOID_Y_LEVEL: -50,      // <<< LOWERED >>>
    MAP_BOUNDS_X: 50.0,     // ADJUST these based on "the first map!" size
    MAP_BOUNDS_Z: 50.0,     // ADJUST these based on "the first map!" size
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

let loadingScreen, homeScreen, gameUI, playerCountSpan, playerNameInput, playerPhraseInput, joinButton, homeScreenError, infoDiv, healthBarFill, healthText, killMessageDiv;
let killMessageTimeout = null;
let mapMesh = null;

// --- Manual Physics State ---
let velocityY = 0;
let isOnGround = false;
let raycaster = new THREE.Raycaster();

console.log("config.js loaded (Reverted to Manual Physics, Lower Void)");
