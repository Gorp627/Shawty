// docs/config.js

const CONFIG = {
    SERVER_URL: 'https://gametest-psxl.onrender.com',
    MAP_PATH: 'assets/maps/map.glb',
    SOUND_PATH_GUNSHOT: 'assets/maps/gunshot.wav',
    PLAYER_MODEL_PATH: 'assets/maps/Shawty1.glb',
    GUN_MODEL_PATH: 'assets/maps/gun2.glb',

    PLAYER_HEIGHT: 1.8, PLAYER_RADIUS: 0.4,
    MOVEMENT_SPEED: 6.0, MOVEMENT_SPEED_SPRINTING: 9.5,
    DASH_FORCE: 25.0, DASH_DURATION: 0.15, DASH_COOLDOWN: 0.8,
    BULLET_SPEED: 75, BULLET_DAMAGE: 18, BULLET_LIFETIME: 2500,
    GRAVITY: 25.0, JUMP_FORCE: 8.5, VOID_Y_LEVEL: -40,
    PLAYER_COLLISION_RADIUS: 0.4, KILL_MESSAGE_DURATION: 3500,

    GUN_SCALE: 0.5, // ADJUST
    GUN_POS_OFFSET: new THREE.Vector3(0.35, -0.35, -0.6), // ADJUST
    MUZZLE_LOCAL_OFFSET: new THREE.Vector3(0, 0.05, -1.0), // ADJUST - Local offset FROM GUN ORIGIN (x, y(up), z(forward))
    RECOIL_AMOUNT: new THREE.Vector3(0.01, 0.025, 0.1), // ADJUST - Add slight X kick, more Y/Z
    RECOIL_SIDE_AMOUNT: 0.02, // ADJUST - How much it kicks side-to-side (X) - Currently unused, recoil amount handles X
    RECOIL_RECOVER_SPEED: 22, // ADJUST - Higher is faster
    MUZZLE_FLASH_DURATION: 60, MUZZLE_FLASH_SCALE: 0.2,
    BULLET_IMPACT_DURATION: 300, BULLET_IMPACT_PARTICLES: 5,

    CLIENT_UPDATE_INTERVAL: 1000 / 20,
    SERVER_BROADCAST_INTERVAL: 1000 / 15
};
// Object.freeze(CONFIG); // Freeze after debugging is done

// Global Game Variables - Declared here, assigned elsewhere
let players = {}; let bullets = []; let keys = {};
let localPlayerId = null; let localPlayerName = 'Anonymous'; let localPlayerPhrase = '...';
let lastDashTime = 0;

// Three.js essentials needed globally - Declared here, INITIALIZED in game.js
let scene, camera, renderer, controls, clock, loader, dracoLoader;

// UI Element Refs - Declared here, assigned in UIManager.initialize
let loadingScreen, homeScreen, gameUI, playerCountSpan, playerNameInput, playerPhraseInput, joinButton, homeScreenError, infoDiv, healthBarFill, healthText, killMessageDiv;
let killMessageTimeout = null;

// Asset Refs - Declared here, assigned by LoadManager
let mapMesh = null, playerModel = null, gunModel = null, gunViewModel = null, gunshotSound;

// Physics State
let velocityY = 0; let isOnGround = false;

// Recoil State
let currentRecoilOffset = new THREE.Vector3(0, 0, 0);

console.log("config.js loaded and executed"); // Confirm this script runs
