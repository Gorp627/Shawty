// docs/main.js - Simplified: No Gun, Draco Disabled Test

// --- Configuration ---
const SERVER_URL = 'https://gametest-psxl.onrender.com';
const MAP_PATH = 'assets/maps/map.glb';
const SOUND_PATH_GUNSHOT = 'assets/maps/gunshot.wav';
const PLAYER_MODEL_PATH = 'assets/maps/Shawty1.glb';
// REMOVED const GUN_MODEL_PATH = 'assets/maps/gun2.glb';

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
// REMOVED Gun/Recoil Config

// --- Global Variables ---
let gameState = 'loading';
let assetsReady = false;
let mapLoadState = 'loading';
let playerModelLoadState = 'loading';
// REMOVED let gunModelLoadState = 'loading';
let socket;
let localPlayerId = null;
let localPlayerName = 'Anonymous';
let localPlayerPhrase = '...';
let players = {};
let bullets = [];
let keys = {};
let scene, camera, renderer, controls, clock, loader, dracoLoader; // Keep dracoLoader declared for now
let mapMesh = null;
let playerModel = null;
// REMOVED let gunModel = null;
// REMOVED let gunViewModel = null;
let velocityY = 0;
let isOnGround = false;
let loadingScreen, homeScreen, gameUI, playerCountSpan, playerNameInput, playerPhraseInput, joinButton, homeScreenError, infoDiv, healthBarFill, healthText, killMessageDiv;
let killMessageTimeout = null;
let gunshotSound;
// REMOVED let currentRecoilOffset = new THREE.Vector3(0, 0, 0);

// ========================================================
// FUNCTION DEFINITIONS
// ========================================================

// --- Input Handling ---
function onKeyDown(event) { /* ... Same ... */ }
function onKeyUp(event) { /* ... Same ... */ }
function onMouseDown(event) { /* ... Same ... */ }

// --- UI State Management ---
function setGameState(newState, options = {}) { /* ... Same (ensure joinButton re-enabled in homescreen) ... */ }

// --- Asset Loading ---
function loadSound() { /* ... Same ... */ }
function loadPlayerModel() { // Loads Player model only
    playerModelLoadState = 'loading'; console.log(`Load P Model: ${PLAYER_MODEL_PATH}`); if (!loader)return;
    loader.load(PLAYER_MODEL_PATH, function(gltf){ playerModel=gltf.scene;playerModel.traverse(function(c){if(c.isMesh)c.castShadow=true;});playerModelLoadState='loaded';checkAssetsReady(); }, undefined, function(err){ console.error("P Model ERR:",err);playerModelLoadState='error';checkAssetsReady(); });
}
// REMOVED function loadGunModel() { ... }
function loadMap(mapPath) { // Loads Map
    mapLoadState = 'loading'; console.log(`Load Map: ${mapPath}`); if (!loader)return;
    loader.load(mapPath, function(gltf){ mapMesh=gltf.scene;mapMesh.traverse(function(c){if(c.isMesh){c.castShadow=true; c.receiveShadow=true; c.userData.isCollidable=true;}});scene.add(mapMesh);mapLoadState='loaded';checkAssetsReady(); }, undefined, function(err){ console.error(`Map ERR (${mapPath}):`,err);mapLoadState='error';checkAssetsReady(); });
}
function checkAssetsReady() { // Checks Map and Player Model only
    console.log(`CheckR: Map=${mapLoadState}, PModel=${playerModelLoadState}`);
    const mapR=mapLoadState==='loaded'||mapLoadState==='error';
    const pModelR=playerModelLoadState==='loaded'||playerModelLoadState==='error';
    if(mapR && pModelR){ // Only check these two
        if(mapLoadState==='error'||playerModelLoadState==='error'){
            assetsReady=false;
            // Log which one failed specifically
            let errorMsg = "FATAL: Asset Error! ";
            if (mapLoadState === 'error') errorMsg += "(Map Failed) ";
            if (playerModelLoadState === 'error') errorMsg += "(Player Model Failed) ";
            console.error(errorMsg.trim());
            setGameState('loading',{message: errorMsg + "<br/>Check Console.",error:true});
        } else {
            assetsReady=true; console.log("Assets OK (Map + Player Model).");
            if(socket?.connected && gameState==='loading'){ setGameState('homescreen',{playerCount:playerCountSpan?.textContent??'?'});}
            else if(gameState==='joining'){ sendJoinDetails();}
        }
    } else { assetsReady=false; }
}

// --- Network & Joining ---
function setupSocketIO() { /* ... Same ... */ }
function handleInitialize(data) { /* ... Same ... */ }
function attemptJoinGame() { /* ... Same ... */ }
function sendJoinDetails() { /* ... Same ... */ }

// --- Player Management ---
function addPlayer(playerData) { // Uses Player Model
    if(players[playerData.id]||playerData.id===localPlayerId)return; players[playerData.id]={...playerData,mesh:null,targetPosition:null,targetRotationY:null};
    if(playerModel&&playerModel!=='error'){ try{const dS=0.3;// <<<=== ADJUST PLAYER SCALE const mI=playerModel.clone();mI.scale.set(dS,dS,dS);mI.traverse(function(c){if(c.isMesh)c.castShadow=true;}); const vY=playerData.y;mI.position.set(playerData.x,vY,playerData.z);mI.rotation.y=playerData.rotationY;scene.add(mI);players[playerData.id].mesh=mI;players[playerData.id].targetPosition=mI.position.clone();players[playerData.id].targetRotationY=mI.rotation.y;}catch(e){console.error(`Model error ${playerData.id}:`,e);addPlayerFallbackMesh(playerData);}}else{addPlayerFallbackMesh(playerData);}
}
function addPlayerFallbackMesh(playerData) { /* ... Same (Cylinder fallback) ... */ }
function removePlayerMesh(playerId) { /* ... Same ... */ }
function updateRemotePlayerPosition(playerData) { /* ... Same ... */ }

// --- Game Logic Update ---
function updatePlayer(deltaTime) { // No gun view model update
    if(gameState!=='playing'||!controls?.isLocked||!localPlayerId||!players[localPlayerId])return; const o=controls.getObject(); const s=players[localPlayerId]; if(!s||s.health<=0)return;
    const sp=keys['ShiftLeft']?MOVEMENT_SPEED_SPRINTING:MOVEMENT_SPEED; const dS=sp*deltaTime; const pPos=o.position.clone();
    velocityY-=GRAVITY*deltaTime; o.position.y+=velocityY*deltaTime;
    if(keys['KeyW']){controls.moveForward(dS);} if(keys['KeyS']){controls.moveForward(-dS);} if(keys['KeyA']){controls.moveRight(-dS);} if(keys['KeyD']){controls.moveRight(dS);}
    const cPos=o.position; for(const id in players){if(id!==localPlayerId&&players[id].mesh&&players[id].mesh.visible){const oM=players[id].mesh; const dXZ=new THREE.Vector2(cPos.x-oM.position.x,cPos.z-oM.position.z).length(); if(dXZ<PLAYER_COLLISION_RADIUS*2){o.position.x=pPos.x; o.position.z=pPos.z; o.position.y=cPos.y; break;}}}
    let gY=0; if(o.position.y<gY+PLAYER_HEIGHT){o.position.y=gY+PLAYER_HEIGHT;if(velocityY<0)velocityY=0;isOnGround=true;}else{isOnGround=false;}
    if(o.position.y<VOID_Y_LEVEL&&s.health>0){socket.emit('fellIntoVoid');s.health=0;updateHealthBar(0);showKillMessage("You fell into the void.");}
    // updateViewModel(deltaTime); // REMOVED gun update
    const lPos=o.position.clone(); lPos.y-=PLAYER_HEIGHT; const lS=players[localPlayerId]; const pc=lPos.distanceToSquared(new THREE.Vector3(lS?.x??0,lS?.y??0,lS?.z??0))>0.001; const cR=new THREE.Euler().setFromQuaternion(camera.quaternion,'YXZ'); const cRY=cR.y; const rc=Math.abs(cRY-(lS?.rotationY??0))>0.01;
    if(pc||rc){ if(lS){lS.x=lPos.x;lS.y=lPos.y;lS.z=lPos.z;lS.rotationY=cRY;} socket.emit('playerUpdate',{x:lPos.x,y:lPos.y,z:lPos.z,rotationY:cRY});}
}

// --- View Model / Recoil REMOVED ---
// function updateViewModel(deltaTime) { ... }
// function attachGunViewModel() { ... }
// function removeGunViewModel() { ... }

// --- Shoot, Bullet, Interpolation, UI, Event Handlers ---
function shoot() { // Basic shoot, no recoil
    if(gameState!=='playing'||!socket||!localPlayerId||!controls?.isLocked||!players[localPlayerId]||players[localPlayerId].health<=0)return;
    // currentRecoilOffset.copy(RECOIL_AMOUNT); // REMOVED recoil
    if(gunshotSound){try{gunshotSound.cloneNode().play().catch(function(e){});}catch(e){}}
    const bP=new THREE.Vector3(),bD=new THREE.Vector3(); if(!camera)return;
    camera.getWorldPosition(bP); camera.getWorldDirection(bD); // Shoot from camera
    socket.emit('shoot',{position:{x:bP.x,y:bP.y,z:bP.z},direction:{x:bD.x,y:bD.y,z:bD.z}});
}
function spawnBullet(d) { /* ... Same ... */ }
function updateBullets(dT) { /* ... Same ... */ }
function updateOtherPlayers(dT) { /* ... Same ... */ }
function updateHealthBar(h) { /* ... Same ... */ }
function showKillMessage(m) { /* ... Same ... */ }
function handlePlayerJoined(pD) { /* ... Same ... */ }
function handlePlayerLeft(pId) { /* ... Same ... */ }
function handleHealthUpdate(d) { /* ... Same ... */ }
function handlePlayerDied(data) { /* ... Same (uses name/phrase from server) ... */ }
function handlePlayerRespawned(pD) { /* ... Same (uses name/phrase from server) ... */ }

// --- Animation Loop ---
function animate() { requestAnimationFrame(animate); const dT=clock?clock.getDelta():0.016; if(gameState==='playing'){if(players[localPlayerId]){updatePlayer(dT);}updateBullets(dT);updateOtherPlayers(dT);} if(renderer&&scene&&camera){try{renderer.render(scene,camera);}catch(e){console.error("Render error:",e);}}}
// --- Utility Functions ---
function onWindowResize() { if(camera){camera.aspect=window.innerWidth/window.innerHeight;camera.updateProjectionMatrix();} if(renderer)renderer.setSize(window.innerWidth,window.innerHeight); }

// ========================================================
// INITIALIZATION FUNCTION DEFINITION
// ========================================================
function init() {
    console.log("Initializing Shawty - Simplified Baseline + Menu/Models...");
    // Get UI Elements & Null Checks
    loadingScreen=document.getElementById('loadingScreen'); if (!loadingScreen)return; homeScreen=document.getElementById('homeScreen'); if (!homeScreen)return; gameUI=document.getElementById('gameUI'); if (!gameUI)return; playerCountSpan=document.getElementById('playerCount'); if (!playerCountSpan)return; playerNameInput=document.getElementById('playerNameInput'); if (!playerNameInput)return; playerPhraseInput=document.getElementById('playerPhraseInput'); if (!playerPhraseInput)return; joinButton=document.getElementById('joinButton'); if (!joinButton)return; homeScreenError=document.getElementById('homeScreenError'); if (!homeScreenError)return; infoDiv=document.getElementById('info'); if (!infoDiv)return; healthBarFill=document.getElementById('healthBarFill'); if (!healthBarFill)return; healthText=document.getElementById('healthText'); if (!healthText)return; killMessageDiv=document.getElementById('killMessage'); if (!killMessageDiv)return; const canvas=document.getElementById('gameCanvas'); if (!canvas)return; console.log("UI elements found.");

    setGameState('loading');

    // Setup Three.js Core
    try {
        scene=new THREE.Scene(); scene.background=new THREE.Color(0x87ceeb); scene.fog=new THREE.Fog(0x87ceeb,0,150);
        camera=new THREE.PerspectiveCamera(75,window.innerWidth/window.innerHeight,0.1,1000);
        renderer=new THREE.WebGLRenderer({canvas:canvas,antialias:true}); renderer.setSize(window.innerWidth,window.innerHeight); renderer.shadowMap.enabled=true;
        clock=new THREE.Clock();
        loader=new THREE.GLTFLoader();
        dracoLoader=new THREE.DRACOLoader();
        dracoLoader.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/libs/draco/');
        dracoLoader.setDecoderConfig({type:'js'});
        // *** DRACO IS DISABLED FOR THIS TEST ***
        // loader.setDRACOLoader(dracoLoader); // Comment this out
        console.log("Three.js core initialized. Draco setup SKIPPED.");
    } catch (e) { console.error("3js Init Error:", e); setGameState('loading',{message:"Graphics Error!",error:true}); return; }

    // Lighting
    try { const ambL=new THREE.AmbientLight(0xffffff,0.6);scene.add(ambL);const dirL=new THREE.DirectionalLight(0xffffff,0.9);dirL.position.set(10,15,10);dirL.castShadow=true;scene.add(dirL); } catch(e){ console.error("Lighting Error:", e); setGameState('loading',{message:"Graphics Error(Light)!",error:true}); return; }

    // Controls
    try {
        controls=new THREE.PointerLockControls(camera,document.body);
        controls.addEventListener('lock',function(){console.log('Locked');});
        controls.addEventListener('unlock',function(){console.log('Unlocked'); if(gameState==='playing')setGameState('homescreen',{playerCount:playerCountSpan?.textContent??'?'}); }); // Go home only if playing
        console.log("Controls initialized.");
    } catch (e) { console.error("Controls Init Error:", e); setGameState('loading',{message:"Controls Error!",error:true}); return; }

    // Start Loading Assets & Connecting (NO GUN MODEL)
    console.log("Start loads & socket..."); loadSound(); loadPlayerModel(); loadMap(MAP_PATH); setupSocketIO();

    // Add Event Listeners
    console.log("Add listeners..."); joinButton?.addEventListener('click',attemptJoinGame); window.addEventListener('resize',onWindowResize); document.addEventListener('keydown',onKeyDown); document.addEventListener('keyup',onKeyUp); document.addEventListener('mousedown',onMouseDown); console.log("Listeners added.");

    // Start loop
    console.log("Start animate."); animate();
}

// ========================================================
// --- START THE APPLICATION ---
// ========================================================
if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', init); } else { init(); }
