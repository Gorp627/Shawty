// docs/config.js (Manual Raycasting v1)

const CONFIG = {
    SERVER_URL: 'https://gametest-psxl.onrender.com', // Ensure this points to your Render server URL
    MAP_PATH: 'assets/maps/the first map!.glb', // MAKE SURE THIS PATH IS CORRECT
    PLAYER_MODEL_PATH: 'assets/maps/Shawty1.glb',
    GUN_MODEL_PATH: 'assets/maps/gun2.glb',
    GUN_SHOT_SOUND_PATH: 'assets/maps/gunshot.wav',

    PLAYER_HEIGHT: 1.8,
    PLAYER_RADIUS: 0.4,
    CAMERA_Y_OFFSET: 0.6, // Camera height relative to player FEET
    MOVEMENT_SPEED: 7.0,
    MOVEMENT_SPEED_SPRINTING: 10.5,
    DASH_VELOCITY_MAGNITUDE: 15.0, // Adjusted value for direct velocity change
    DASH_COOLDOWN: 0.8,
    DASH_UP_FACTOR: 0.15, // How much upward boost on dash

    // --- Manual Physics Config ---
    GRAVITY_ACCELERATION: 28.0, // Acceleration due to gravity (positive value)
    JUMP_INITIAL_VELOCITY: 9.0, // Initial upward velocity on jump
    VOID_Y_LEVEL: -100,
    MAP_BOUNDS_X: 100.0,
    MAP_BOUNDS_Z: 100.0,
    GROUND_CHECK_DISTANCE: 0.25, // How far below feet to check for ground
    COLLISION_CHECK_DISTANCE: 0.6, // How far ahead/sideways to check for walls (slightly more than radius)
    PLAYER_STEP_HEIGHT: 0.3, // How high the player can step up obstacles automatically
    // --- End Manual Physics ---

    // --- Shooting ---
    SHOOT_COOLDOWN: 150, // ms between shots
    BULLET_DAMAGE: 25,
    BULLET_RANGE: 300, // Max distance bullets travel
    ROCKET_JUMP_VELOCITY: 12.0, // Upward velocity boost for rocket jump
    ROCKET_JUMP_ANGLE_THRESHOLD: -0.7, // Dot product threshold for looking down (-1 is straight down)
    // --- End Shooting ---

    // --- Effects ---
    DEATH_SHOCKWAVE_VELOCITY: 18.0, // Velocity magnitude for shockwave push
    DEATH_EXPLOSION_RADIUS: 15.0, // Range of shockwave
    // --- End Effects ---

    KILL_MESSAGE_DURATION: 3500,

    CLIENT_UPDATE_INTERVAL: 1000 / 20, // ~50ms
    SERVER_BROADCAST_INTERVAL: 1000 / 15, // ~66ms (Used by server.js)
    PLAYER_DEFAULT_HEALTH: 100,
    PLAYER_MOVE_THRESHOLD_SQ: 0.001 // Min distance squared to trigger network update (slightly larger might be ok)
};

// --- Global Game Variables / Objects ---
// Declare variables that will be assigned objects/values by other scripts
let players = {};
let localPlayerId = null;
let localPlayerName = 'Anonymous'; // Set during UI flow
// let localPlayerPhrase = '...'; // Removed
let lastDashTime = 0;
let lastShootTime = 0;

let scene, camera, renderer, controls, clock, loader, dracoLoader;

let loadingScreen, homeScreen, characterSelectScreen, gameUI; // UI Screens
let playerCountSpan, playerNameInput, nextButton, homeScreenError; // Home Screen elements
let previewCanvas, characterNameDisplay, confirmDeployButton, characterSelectError; // Char Select elements
let infoDiv, healthBarFill, healthText, killMessageDiv; // Game UI elements

let killMessageTimeout = null;
let mapMesh = null; // Reference to the visual map Object3D
let gunMesh = null; // Reference to the local player's gun model
let gunSoundBuffer = null; // Loaded gunshot sound
let listener; // THREE.AudioListener

// Add globals needed for manual physics
let playerVelocities = {}; // Map: playerId -> THREE.Vector3()
let playerIsGrounded = {}; // Map: playerId -> boolean

// --- Global State Flags ---
// Declare state flags ONCE here using 'let'
let assetsAreReady = false;
let networkIsInitialized = false;
// let physicsIsReady = false; // Removed - We check mapMesh directly now
let initializationData = null; // Data from server

console.log("config.js loaded (Manual Raycasting v1)");
