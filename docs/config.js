// docs/config.js

// --- Configuration ---
const SERVER_URL = 'https://gametest-psxl.onrender.com';
const MAP_PATH = 'assets/maps/map.glb';
const SOUND_PATH_GUNSHOT = 'assets/maps/gunshot.wav';
const PLAYER_MODEL_PATH = 'assets/maps/Shawty1.glb';
const GUN_MODEL_PATH = 'assets/maps/gun2.glb'; // <<< Gun path

const PLAYER_HEIGHT = 1.8;
const PLAYER_RADIUS = 0.4;
const MOVEMENT_SPEED = 5.0;
const MOVEMENT_SPEED_SPRINTING = 8.0;
const BULLET_SPEED = 60;
const GRAVITY = 19.62;
const JUMP_FORCE = 8.0;
const VOID_Y_LEVEL = -30;
const PLAYER_COLLISION_RADIUS = PLAYER_RADIUS;
const KILL_MESSAGE_DURATION = 4000;
const BULLET_LIFETIME = 3000;
// --- ADDED Gun/Recoil Config ---
const GUN_POS_OFFSET = new THREE.Vector3(0.4, -0.35, -0.7); // Right, Down, Forward - ADJUST
const GUN_SCALE = 0.35; // Initial Scale - ADJUST
const RECOIL_AMOUNT = new THREE.Vector3(0, 0.015, 0.06); // Y(Up), Z(Back) - ADJUST
const RECOIL_RECOVER_SPEED = 20; // Higher is faster - ADJUST
// -------------------------------

// --- Global Variables ---
let gameState = 'loading';
let assetsReady = false;
let mapLoadState = 'loading';
let playerModelLoadState = 'loading';
let gunModelLoadState = 'loading'; // <<< Added gun model state
let socket;
let localPlayerId = null;
let localPlayerName = 'Anonymous';
let localPlayerPhrase = '...';
let players = {};
let bullets = [];
let keys = {};
let scene, camera, renderer, controls, clock, loader, dracoLoader;
let mapMesh = null;
let playerModel = null;
let gunModel = null; // <<< Added gun model template
let gunViewModel = null; // <<< Added gun instance
let velocityY = 0;
let isOnGround = false;
let loadingScreen, homeScreen, gameUI, playerCountSpan, playerNameInput, playerPhraseInput, joinButton, homeScreenError, infoDiv, healthBarFill, healthText, killMessageDiv;
let killMessageTimeout = null;
let gunshotSound;
let currentRecoilOffset = new THREE.Vector3(0, 0, 0); // <<< Added recoil state

console.log("config.js loaded");
