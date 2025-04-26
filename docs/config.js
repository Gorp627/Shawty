// docs/config.js

const CONFIG = {
    SERVER_URL: 'https://gametest-psxl.onrender.com',
    MAP_PATH: 'assets/maps/map.glb',
    SOUND_PATH_GUNSHOT: 'assets/maps/gunshot.wav',
    PLAYER_MODEL_PATH: 'assets/maps/Shawty1.glb',
    GUN_MODEL_PATH: 'assets/maps/gun2.glb',
    // HEALTH_PACK_MODEL_PATH: 'assets/models/health_pack.glb',

    PLAYER_HEIGHT: 1.8,
    PLAYER_RADIUS: 0.4,
    MOVEMENT_SPEED: 6.0,
    MOVEMENT_SPEED_SPRINTING: 9.5,
    DASH_FORCE: 25.0, // Increased dash power
    DASH_DURATION: 0.15,
    DASH_COOLDOWN: 0.8, // Faster cooldown
    BULLET_SPEED: 75, // Faster bullets
    BULLET_DAMAGE: 18, // Slightly more damage
    BULLET_LIFETIME: 2000, // Shorter lifetime
    GRAVITY: 25.0,
    JUMP_FORCE: 8.5, // Slightly higher jump
    VOID_Y_LEVEL: -40,
    PLAYER_COLLISION_RADIUS: 0.4,
    KILL_MESSAGE_DURATION: 3500,

    // VIEW MODEL / RECOIL (ADJUST THESE)
    GUN_SCALE: 0.5, // Start bigger, maybe reduce later
    GUN_POS_OFFSET: new THREE.Vector3(0.35, -0.35, -0.6),
    MUZZLE_LOCAL_OFFSET: new THREE.Vector3(0, 0.05, -1.0), // Forward along gun barrel
    RECOIL_AMOUNT: new THREE.Vector3(0.01, 0.025, 0.1), // Add slight X kick, more Y/Z
    RECOIL_SIDE_AMOUNT: 0.02,
    RECOIL_RECOVER_SPEED: 22,
    MUZZLE_FLASH_DURATION: 60,
    MUZZLE_FLASH_SCALE: 0.2,
    BULLET_IMPACT_DURATION: 300,
    BULLET_IMPACT_PARTICLES: 5,

    // Health Pack (REMOVED FROM THIS VERSION)
    // HEALTH_PACK_VALUE: 25, ...

    // Network/Update rates
    CLIENT_UPDATE_INTERVAL: 1000 / 20, // Send ~20 times/sec
    SERVER_BROADCAST_INTERVAL: 1000 / 15 // Receive ~15 times/sec
};
Object.freeze(CONFIG);

// --- Global Game Variables (Needed by multiple modules) ---
// These might move into a central 'Game' class/object later
let players = {}; // { id: ClientPlayer instance }
let bullets = []; // [ Bullet instances ]
// let healthPacks = {}; // { id: HealthPack instance } REMOVED
let localPlayerId = null;
let localPlayerName = 'Anonymous';
let localPlayerPhrase = '...';
let keys = {}; // Input state
let lastDashTime = 0; // For dash cooldown

// Three.js essentials needed globally
let scene, camera, renderer, controls, clock, loader, dracoLoader;

console.log("config.js loaded");
