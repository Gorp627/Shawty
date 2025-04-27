// docs/config.js

const CONFIG = {
    SERVER_URL: 'https://gametest-psxl.onrender.com',
    MAP_PATH: 'assets/maps/map.glb',
    PLAYER_MODEL_PATH: 'assets/maps/Shawty1.glb',

    PLAYER_HEIGHT: 1.8,     // Logical height for calculations
    PLAYER_RADIUS: 0.4,     // Radius for physics shape
    PLAYER_MASS: 70,        // Mass for dynamic bodies
    CAMERA_Y_OFFSET: 1.6,   // Camera height relative to player body center
    MOVEMENT_SPEED: 6.0,    // Target speed for movement force/velocity calc
    MOVEMENT_SPEED_SPRINTING: 9.5,
    // DASH_FORCE_MAGNITUDE: 1200, // Dash might need rework with Rapier controller/forces
    DASH_VELOCITY_BURST: 25, // Use velocity change for dash?
    DASH_COOLDOWN: 0.8,

    // --- Physics Config (Adjust for Rapier) ---
    GRAVITY: -25.0,         // Applied by Rapier world
    JUMP_IMPULSE: 300,     // Use an IMPULSE for jumping now
    // PHYSICS_TIMESTEP: 1 / 60, // Rapier manages its timestep internally often
    VOID_Y_LEVEL: -40,      // Y level for void check
    MAP_BOUNDS_X: 50.0,     // X bounds check
    MAP_BOUNDS_Z: 50.0,     // Z bounds check
    // --- End Physics ---

    KILL_MESSAGE_DURATION: 3500,

    CLIENT_UPDATE_INTERVAL: 1000 / 20,
    SERVER_BROADCAST_INTERVAL: 1000 / 15,
    PLAYER_DEFAULT_HEALTH: 100,
    PLAYER_MOVE_THRESHOLD_SQ: 0.0001
};
// Object.freeze(CONFIG); // Keep commented out during heavy refactor

// --- Global Game Variables ---
let players = {}; let keys = {};
let localPlayerId = null; let localPlayerName = 'Anonymous'; let localPlayerPhrase = '...'; let lastDashTime = 0;
let scene, camera, renderer, controls, clock, loader, dracoLoader;
// let world = null; // Removed Cannon world global
// Global RAPIER reference will be set by rapier_init.js
let RAPIER = null; // Declare RAPIER, will be assigned by init script
let rapierWorld = null; // Specific Rapier world instance

let loadingScreen, homeScreen, gameUI, playerCountSpan, playerNameInput, playerPhraseInput, joinButton, homeScreenError, infoDiv, healthBarFill, healthText, killMessageDiv;
let killMessageTimeout = null;
let mapMesh = null;

// --- REMOVED Grounded Flag (Use Rapier raycast/controller) ---
// let isPlayerGrounded = false;

console.log("config.js loaded (Preparing for Rapier Engine)");
