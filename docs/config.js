// docs/config.js

const CONFIG = {
    SERVER_URL: 'https://gametest-psxl.onrender.com',
    MAP_PATH: 'assets/maps/map.glb',
    SOUND_PATH_GUNSHOT: 'assets/maps/gunshot.wav', // Check path
    PLAYER_MODEL_PATH: 'assets/maps/Shawty1.glb',   // Check path
    GUN_MODEL_PATH: 'assets/maps/gun2.glb',        // Check path
    HEALTH_PACK_MODEL_PATH: 'assets/models/health_pack.glb', // ADD path to your health pack model

    PLAYER_HEIGHT: 1.8,
    PLAYER_RADIUS: 0.4,
    MOVEMENT_SPEED: 6.0, // Slightly faster base
    MOVEMENT_SPEED_SPRINTING: 9.5, // Faster sprint
    DASH_FORCE: 18.0, // Dash speed boost
    DASH_DURATION: 0.15, // seconds
    DASH_COOLDOWN: 1.0, // seconds
    BULLET_SPEED: 70,
    BULLET_DAMAGE: 15,
    BULLET_LIFETIME: 2500, //ms
    GRAVITY: 25.0, // Slightly higher gravity
    JUMP_FORCE: 9.0,
    VOID_Y_LEVEL: -40,
    PLAYER_COLLISION_RADIUS: 0.4,
    KILL_MESSAGE_DURATION: 4000, // ms

    // -- VIEW MODEL & RECOIL (ADJUST THESE) --
    GUN_SCALE: 0.45, // Scale of gun relative to camera view
    GUN_POS_OFFSET: new THREE.Vector3(0.35, -0.3, -0.6), // Right, Down, Forward from camera
    MUZZLE_LOCAL_OFFSET: new THREE.Vector3(0, 0.08, -0.9),// Offset from GUN's origin for bullet/flash (x,y,z<-forward)
    RECOIL_AMOUNT: new THREE.Vector3(0, 0.02, 0.1), // Slight random kick (Y upwards, Z backwards push)
    RECOIL_SIDE_AMOUNT: 0.015, // How much it kicks side-to-side (X)
    RECOIL_RECOVER_SPEED: 18, // Speed multiplier for lerp back to normal
    MUZZLE_FLASH_DURATION: 50, // ms
    MUZZLE_FLASH_SCALE: 0.15,

    // -- Health Pack --
    HEALTH_PACK_VALUE: 25,
    HEALTH_PACK_RADIUS: 0.5,
    HEALTH_PACK_SPAWN_INTERVAL: 15000, // ms (15 seconds)
    MAX_HEALTH_PACKS: 5,

    // Network/Update rates
    CLIENT_UPDATE_INTERVAL: 1000 / 20, // Send updates ~20 times/sec
    SERVER_BROADCAST_INTERVAL: 1000 / 15 // Send world state ~15 times/sec
};

// Freeze the config object to prevent accidental modification
Object.freeze(CONFIG);

console.log("config.js loaded");
