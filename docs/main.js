// docs/main.js

// --- Configuration ---
const SERVER_URL = 'https://gametest-psxl.onrender.com';
const MAP_PATH = 'assets/maps/map.glb';
const SOUND_PATH_GUNSHOT = 'assets/maps/gunshot.wav'; // User path
const PLAYER_MODEL_PATH = 'assets/maps/Shawty1.glb'; // User path
const GUN_MODEL_PATH = 'assets/maps/gun2.glb'; // User path

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
const GUN_POS_OFFSET = new THREE.Vector3(0.4, -0.35, -0.7); // ADJUST
const GUN_SCALE = 0.1; // ADJUST
const RECOIL_AMOUNT = new THREE.Vector3(0, 0.015, 0.06); // ADJUST
const RECOIL_RECOVER_SPEED = 20; // ADJUST

// --- Global Variables ---
let gameState = 'loading';
let assetsReady = false; // Will be true when Map & Player Model are loaded/failed
let mapLoadState = 'loading';
let playerModelLoadState = 'loading';
let gunModelLoadState = 'loading'; // Still track gun separately
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
let gunModel = null;
let gunViewModel = null;
let velocityY = 0;
let isOnGround = false;
let loadingScreen, homeScreen, gameUI, playerCountSpan, playerNameInput, playerPhraseInput, joinButton, homeScreenError, infoDiv, healthBarFill, healthText, killMessageDiv;
let killMessageTimeout = null;
let gunshotSound;
let frameCount = 0;
let currentRecoilOffset = new THREE.Vector3(0, 0, 0);

// ========================================================
// FUNCTION DEFINITIONS
// ========================================================

// --- Input Handling ---
function onKeyDown(event) { keys[event.code] = true; if (event.code === 'Space') { event.preventDefault(); if (isOnGround && gameState === 'playing') { velocityY = JUMP_FORCE; isOnGround = false; } } }
function onKeyUp(event) { keys[event.code] = false; }
function onMouseDown(event) { if (gameState === 'playing' && !controls?.isLocked) { controls?.lock(); } else if (gameState === 'playing' && controls?.isLocked && event.button === 0) { shoot(); } }

// --- UI State Management ---
function setGameState(newState, options = {}) {
    console.log(`Setting game state to: ${newState}`, options); const previousState = gameState;
    loadingScreen = loadingScreen || document.getElementById('loadingScreen'); homeScreen = homeScreen || document.getElementById('homeScreen'); gameUI = gameUI || document.getElementById('gameUI'); const canvas = document.getElementById('gameCanvas');
    if (gameState === newState && !(newState === 'loading' && options.error)) return; gameState = newState;
    playerCountSpan = playerCountSpan || document.getElementById('playerCount'); joinButton = joinButton || document.getElementById('joinButton');
    if(loadingScreen){loadingScreen.style.display='none';loadingScreen.classList.remove('assets','error');const p=loadingScreen.querySelector('p');if(p)p.style.color='';}
    if(homeScreen){homeScreen.style.display='none';homeScreen.classList.remove('visible');}
    if(gameUI){gameUI.style.display='none';gameUI.classList.remove('visible');}
    if(canvas)canvas.style.display='none';
    switch(newState){
        case'loading':if(loadingScreen){loadingScreen.style.display='flex';const p=loadingScreen.querySelector('p');if(p)p.innerHTML=options.message||'Loading...';if(options.assets)loadingScreen.classList.add('assets');if(options.error&&p){p.style.color='#e74c3c';loadingScreen.classList.add('error');}}break;
        case'homescreen':if(homeScreen){homeScreen.style.display='flex';requestAnimationFrame(()=>{homeScreen.classList.add('visible');});if(playerCountSpan)playerCountSpan.textContent=options.playerCount??playerCountSpan.textContent??'?';if(controls?.isLocked)controls.unlock();const obj=scene?.getObjectByName("PlayerControls");if(obj)scene.remove(obj);removeGunViewModel();if(joinButton){joinButton.disabled=false;joinButton.textContent="Join Game";}}break;
        case'joining':if(joinButton){joinButton.disabled=true;joinButton.textContent="Joining...";}if(options.waitingForAssets)setGameState('loading',{message:"Loading Assets...",assets:true});break;
        case'playing':const cElem=document.getElementById('gameCanvas');if(gameUI){gameUI.style.display='block';requestAnimationFrame(()=>{gameUI.classList.add('visible');});}else console.error("! gameUI");if(cElem){cElem.style.display='block';}else console.error("! gameCanvas");if(scene&&controls){if(!scene.getObjectByName("PlayerControls")){controls.getObject().name="PlayerControls";scene.add(controls.getObject());}attachGunViewModel();setTimeout(function(){if(gameState==='playing'&&!controls.isLocked)controls.lock();},100);}else console.error("! Scene/Controls missing!");onWindowResize();break;
    } console.log(`Switched state from ${previousState} to ${gameState}`);
}


// --- Asset Loading ---
function loadSound() { /* ... Same ... */ }

function loadPlayerModel() {
    playerModelLoadState = 'loading'; console.log(`-> Starting P Model: ${PLAYER_MODEL_PATH}`); if (!loader) { console.error("! Loader missing"); playerModelLoadState = 'error'; checkAssetsReady(); return; }
    loader.load(PLAYER_MODEL_PATH, function(gltf){ console.log(">>> P Model OK!"); playerModel=gltf.scene;playerModel.traverse(function(c){if(c.isMesh)c.castShadow=true;}); playerModelLoadState='loaded'; checkAssetsReady(); }, undefined, function(err){ console.error("!!! P Model ERR:",err); playerModelLoadState='error'; checkAssetsReady(); });
}
function loadGunModel() {
    gunModelLoadState = 'loading'; console.log(`-> Starting G Model: ${GUN_MODEL_PATH}`); if (!loader) { console.error("! Loader missing"); gunModelLoadState = 'error'; checkAssetsReady(); return; }
    loader.load(GUN_MODEL_PATH, function(gltf){ console.log(">>> G Model OK!"); gunModel=gltf.scene;gunModel.traverse(function(c){if(c.isMesh){c.castShadow=false;c.receiveShadow=false;}}); gunModelLoadState='loaded'; checkAssetsReady(); }, undefined, function(err){ console.error("!!! G Model ERR:",err); gunModelLoadState='error'; checkAssetsReady(); });
}
function loadMap(mapPath) {
    mapLoadState = 'loading'; console.log(`-> Starting Map: ${mapPath}`); if (!loader) { console.error("! Loader missing"); mapLoadState = 'error'; checkAssetsReady(); return; }
    loader.load(mapPath, function(gltf){ console.log(">>> Map OK!"); mapMesh=gltf.scene;mapMesh.traverse(function(c){if(c.isMesh){c.castShadow=true;c.receiveShadow=true;c.userData.isCollidable=true;}}); scene.add(mapMesh); mapLoadState='loaded'; checkAssetsReady(); }, undefined, function(err){ console.error(`!!! Map ERR (${mapPath}):`,err); mapLoadState='error'; checkAssetsReady(); });
}

function checkAssetsReady() { // Check only Map and Player Model for readiness to play
    console.log(`CheckR: Map=${mapLoadState}, PModel=${playerModelLoadState}`); // Removed GunModel check here
    const mapR = mapLoadState === 'loaded' || mapLoadState === 'error';
    const pModelR = playerModelLoadState === 'loaded' || playerModelLoadState === 'error';

    if (mapR && pModelR) { // Check if Map and Player Model are done (success or fail)
        if (mapLoadState === 'error' || playerModelLoadState === 'error') {
            assetsReady = false; // Mark as not ready for gameplay
            console.error("Critical asset (Map or Player Model) loading failed.");
            // Ensure error is shown, even if socket connected and tried to show homescreen
            if (gameState !== 'loading' || !document.getElementById('loadingScreen').classList.contains('error')) {
                setGameState('loading', { message: "FATAL: Asset Error!<br/>Check Console.", error: true });
            }
        } else {
            assetsReady = true; // Ready to potentially join game
            console.log("Map & Player Model assets ready.");
            // If we were in the 'joining' state waiting for assets, proceed
            if (gameState === 'joining') {
                 console.log("Assets ready while joining - proceeding.");
                 sendJoinDetails();
            }
            // Note: Homescreen transition is now handled by socket 'connect'
        }
    } else {
        assetsReady = false; // Still waiting for Map or Player Model
    }
    // Check Gun model separately - don't block progress for it initially
    if (gunModelLoadState === 'loaded' || gunModelLoadState === 'error') {
        if (gunModelLoadState === 'error') {
            console.warn("Gun model failed to load, will proceed without it.");
            // We could potentially disable shooting or show a message later
        } else {
             console.log("Gun model ready.");
             // If already playing, maybe attach it now? (Handled by setGameState('playing'))
        }
    }
}

// --- Network & Joining ---
function setupSocketIO() {
    console.log(`Connect: ${SERVER_URL}`); socket=io(SERVER_URL,{transports:['websocket'],autoConnect:true});
    socket.on('connect', function(){
        console.log('Socket connected! ID:',socket.id);
        // *** SHOW HOMESCREEN ON CONNECT (if not error state) ***
        if (mapLoadState !== 'error' && playerModelLoadState !== 'error') {
             console.log("Socket connected, showing homescreen (assets loading in background).");
             // Request initial player count
             setGameState('homescreen', { playerCount: '?' }); // Show '?' initially
        } else {
             console.log("Socket connected, but assets failed. Staying on error screen.");
        }
    });
    socket.on('disconnect', function(reason){ console.warn('Disconnected:',reason); setGameState('homescreen',{playerCount:0}); infoDiv.textContent='Disconnected'; for(const id in players)removePlayerMesh(id); players={}; bullets=[]; });
    socket.on('connect_error', function(err){ console.error('Connect Err:',err.message); mapLoadState='error'; playerModelLoadState='error'; gunModelLoadState = 'error'; assetsReady=false; setGameState('loading',{message:`Connect Fail!<br/>${err.message}`,error:true}); });
    socket.on('playerCountUpdate', function(count){ playerCountSpan=playerCountSpan||document.getElementById('playerCount'); if(playerCountSpan)playerCountSpan.textContent=count; /* No state change here now */});
    socket.on('initialize', function(data){ handleInitialize(data); });
    socket.on('playerJoined', function(d){handlePlayerJoined(d);}); socket.on('playerLeft', function(id){handlePlayerLeft(id);}); socket.on('playerMoved', function(d){updateRemotePlayerPosition(d);}); socket.on('shotFired', function(d){spawnBullet(d);}); socket.on('healthUpdate', function(d){handleHealthUpdate(d);}); socket.on('playerDied', function(d){handlePlayerDied(d);}); socket.on('playerRespawned', function(d){handlePlayerRespawned(d);});
}

function handleInitialize(data) { /* ... Same as previous ... */ }

function attemptJoinGame() {
    localPlayerName = playerNameInput.value.trim() || 'Anonymous'; localPlayerPhrase = playerPhraseInput.value.trim() || '...'; if(!localPlayerName){homeScreenError.textContent='Enter name';return;} if(localPlayerPhrase.length>20){homeScreenError.textContent='Phrase too long';return;} homeScreenError.textContent='';
    console.log(`Attempting Join: "${localPlayerName}"`);
    // *** Check assets here before sending details ***
    if (assetsReady) { // assetsReady means Map & Player Model are loaded OK
        setGameState('joining', { waitingForAssets: false }); // Assets are ready
        sendJoinDetails();
    } else if (mapLoadState === 'error' || playerModelLoadState === 'error') {
        homeScreenError.textContent = 'Cannot join: Critical assets failed to load.';
    } else {
        console.log("Assets not ready yet, showing loading screen...");
        setGameState('joining', { waitingForAssets: true }); // Show loading while assets finish
        // checkAssetsReady() will call sendJoinDetails() when they are ready
    }
}
function sendJoinDetails() { /* ... Same as previous ... */ }

// --- Player Management & Model Loading ---
function addPlayer(playerData) { /* ... Same as previous (ensure desiredScale=0.3 or adjusted) ... */ }
function addPlayerFallbackMesh(playerData) { /* ... Same ... */ }
function removePlayerMesh(playerId) { /* ... Same ... */ }
function updateRemotePlayerPosition(playerData) { /* ... Same ... */ }

// --- Game Logic Update Loop ---
function updatePlayer(deltaTime) { /* ... Same ... */ }

// --- View Model Update (Recoil) ---
function updateViewModel(deltaTime) { /* ... Same ... */ }
function attachGunViewModel() { /* ... Same ... */ }
function removeGunViewModel() { /* ... Same ... */ }

// --- Shoot, Bullet, Interpolation, UI, Event Handlers ---
function shoot() { /* ... Same ... */ }
function spawnBullet(d) { /* ... Same ... */ }
function updateBullets(dT) { /* ... Same ... */ }
function updateOtherPlayers(dT) { /* ... Same ... */ }
function updateHealthBar(h) { /* ... Same ... */ }
function showKillMessage(m) { /* ... Same ... */ }
function handlePlayerJoined(pD) { /* ... Same ... */ }
function handlePlayerLeft(pId) { /* ... Same ... */ }
function handleHealthUpdate(d) { /* ... Same ... */ }
function handlePlayerDied(data) { /* ... Same ... */ }
function handlePlayerRespawned(pD) { /* ... Same ... */ }

// --- Animation Loop ---
function animate() { /* ... Same ... */ }

// --- Utility Functions ---
function onWindowResize() { /* ... Same ... */ }

// ========================================================
// INITIALIZATION FUNCTION DEFINITION
// ========================================================
function init() {
    console.log("Initializing Shawty...");
    // Get UI Elements & Null Checks
    loadingScreen=document.getElementById('loadingScreen'); if(!loadingScreen)return; homeScreen=document.getElementById('homeScreen'); if(!homeScreen)return; gameUI=document.getElementById('gameUI'); if(!gameUI)return; playerCountSpan=document.getElementById('playerCount'); if(!playerCountSpan)return; playerNameInput=document.getElementById('playerNameInput'); if(!playerNameInput)return; playerPhraseInput=document.getElementById('playerPhraseInput'); if(!playerPhraseInput)return; joinButton=document.getElementById('joinButton'); if(!joinButton)return; homeScreenError=document.getElementById('homeScreenError'); if(!homeScreenError)return; infoDiv=document.getElementById('info'); if(!infoDiv)return; healthBarFill=document.getElementById('healthBarFill'); if(!healthBarFill)return; healthText=document.getElementById('healthText'); if(!healthText)return; killMessageDiv=document.getElementById('killMessage'); if(!killMessageDiv)return; const canvas=document.getElementById('gameCanvas'); if(!canvas)return; console.log("UI elements found.");

    setGameState('loading'); // Start loading

    // Setup Three.js Core
    try { /* ... Same ... */ } catch (e) { /* ... error handling ... */ return; }

    // Lighting
    try { /* ... Same ... */ } catch(e){ /* ... error handling ... */ return; }

    // Controls
    try { /* ... Same (with revised unlock listener) ... */ } catch (e) { /* ... error handling ... */ return; }

    // Start Loading Assets & Connecting
    console.log("Starting asset loads & socket...");
    loadSound(); loadPlayerModel(); loadGunModel(); loadMap(MAP_PATH); setupSocketIO();

    // Add Event Listeners
    console.log("Adding listeners...");
    joinButton?.addEventListener('click',attemptJoinGame); window.addEventListener('resize',onWindowResize); document.addEventListener('keydown',onKeyDown); document.addEventListener('keyup',onKeyUp); document.addEventListener('mousedown',onMouseDown);
    console.log("Listeners added.");

    // Start animation loop
    console.log("Starting animate loop.");
    animate();
}

// ========================================================
// --- START THE APPLICATION (Call init) ---
// ========================================================
if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', init); } else { init(); }
