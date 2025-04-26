// docs/config.js

const CONFIG = {
    SERVER_URL: 'https://gametest-psxl.onrender.com',
    MAP_PATH: 'assets/maps/map.glb',
    PLAYER_MODEL_PATH: 'assets/maps/Shawty1.glb',

    PLAYER_HEIGHT: 1.8, PLAYER_RADIUS: 0.4, // Unified radius name
    MOVEMENT_SPEED: 6.0, MOVEMENT_SPEED_SPRINTING: 9.5,
    DASH_FORCE: 25.0, DASH_DURATION: 0.15, DASH_COOLDOWN: 0.8,
    // GRAVITY: 25.0, JUMP_FORCE: 8.5, VOID_Y_LEVEL: -40, // REMOVED - Vertical Physics
    KILL_MESSAGE_DURATION: 3500,

    // --- Removed Shooting/Gun Configs ---

    CLIENT_UPDATE_INTERVAL: 1000 / 20,
    SERVER_BROADCAST_INTERVAL: 1000 / 15,
    PLAYER_DEFAULT_HEALTH: 100,
    PLAYER_MOVE_THRESHOLD_SQ: 0.0001
};
Object.freeze(CONFIG); // Good practice: prevent accidental modification

// --- Global Game Variables ---
let players = {}; let keys = {}; // bullets removed, physics state removed
let localPlayerId = null; let localPlayerName = 'Anonymous'; let localPlayerPhrase = '...'; let lastDashTime = 0;
let scene, camera, renderer, controls, clock, loader, dracoLoader;
let loadingScreen, homeScreen, gameUI, playerCountSpan, playerNameInput, playerPhraseInput, joinButton, homeScreenError, infoDiv, healthBarFill, healthText, killMessageDiv;
let killMessageTimeout = null;
let mapMesh = null; // Assigned by loadManager
// let velocityY = 0; let isOnGround = false; // REMOVED - Physics state no longer used client-side

console.log("config.js loaded and executed (Vertical Physics Removed)");
