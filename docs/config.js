// docs/config.js

const CONFIG = {
    SERVER_URL: 'https://gametest-psxl.onrender.com',
    MAP_PATH: 'assets/maps/map.glb',
    SOUND_PATH_GUNSHOT: 'assets/maps/gunshot.wav', // KEEP: Still needed for sound
    PLAYER_MODEL_PATH: 'assets/maps/Shawty1.glb',
    // GUN_MODEL_PATH: 'assets/maps/gun2.glb', // REMOVED: No visual gun model for now

    PLAYER_HEIGHT: 1.8, PLAYER_RADIUS: 0.4,
    MOVEMENT_SPEED: 6.0, MOVEMENT_SPEED_SPRINTING: 9.5,
    DASH_FORCE: 25.0, DASH_DURATION: 0.15, DASH_COOLDOWN: 0.8,
    // --- BULLET DEBUG ---
    BULLET_SPEED: 5, // VERY SLOW for debugging visibility
    BULLET_DAMAGE: 18,
    BULLET_LIFETIME: 10000, // Long lifetime (ms)
    // --- END BULLET DEBUG ---
    GRAVITY: 25.0, JUMP_FORCE: 8.5, VOID_Y_LEVEL: -40,
    PLAYER_COLLISION_RADIUS: 0.4, KILL_MESSAGE_DURATION: 3500,

    // --- REMOVED GUN VISUALS ---
    // GUN_SCALE: 0.5,
    // GUN_POS_OFFSET: new THREE.Vector3(0.35, -0.35, -0.6),
    // MUZZLE_LOCAL_OFFSET: new THREE.Vector3(0, 0.05, -1.0),

    // --- KEEP Effects ---
    RECOIL_AMOUNT: new THREE.Vector3(0.01, 0.025, 0.05), // For camera kick
    RECOIL_RECOVER_SPEED: 22,
    MUZZLE_FLASH_DURATION: 50,
    BULLET_IMPACT_DURATION: 300,
    BULLET_IMPACT_PARTICLES: 5,

    CLIENT_UPDATE_INTERVAL: 1000 / 20, // How often client sends updates (ms)
    SERVER_BROADCAST_INTERVAL: 1000 / 15, // How often server sends updates (ms)

    // Server-side config mirrored here for reference or client-side defaults
    PLAYER_DEFAULT_HEALTH: 100,
    PLAYER_MOVE_THRESHOLD_SQ: 0.0001 // Minimum squared distance moved to trigger network update
};
// Object.freeze(CONFIG); // Freeze after debugging is done

// --- Global Game Variables ---
// These are declared here to indicate they are global, but assigned in other modules
let players = {}; // Populated by Network module, instances of ClientPlayer
let bullets = []; // Populated by gameLogic/Network, instances of Bullet
let keys = {}; // Managed by Input module

let localPlayerId = null; // Assigned by Network module on 'initialize'
let localPlayerName = 'Anonymous'; // Set before joining
let localPlayerPhrase = '...'; // Set before joining
let lastDashTime = 0; // Managed by Input module

// Three.js essentials needed globally
let scene, camera, renderer, controls, clock, loader, dracoLoader; // Assigned in game.js

// UI Element Refs - Declared here, assigned in UIManager.initialize
let loadingScreen, homeScreen, gameUI, playerCountSpan, playerNameInput, playerPhraseInput, joinButton, homeScreenError, infoDiv, healthBarFill, healthText, killMessageDiv;
let killMessageTimeout = null; // Managed by UIManager

// Physics State (primarily for local player)
let velocityY = 0; // Vertical velocity for jumping/gravity
let isOnGround = false; // Ground contact flag

// Recoil State (now affects camera)
let currentRecoilOffset = new THREE.Vector3(0, 0, 0);

console.log("config.js loaded and executed"); // Confirm this script runs
