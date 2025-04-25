// docs/main.js

// --- Configuration ---
const SERVER_URL = 'https://gametest-psxl.onrender.com';
const MAP_PATH = 'assets/maps/map.glb';
const SOUND_PATH_GUNSHOT = 'assets/maps/gunshot.wav';
const PLAYER_MODEL_PATH = 'assets/maps/Shawty1.glb';
const GUN_MODEL_PATH = 'assets/maps/gun2.glb';

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
// Gun View Model Config - **ADJUST THESE**
const GUN_POS_OFFSET = new THREE.Vector3(0.4, -0.35, -0.7);
const GUN_SCALE = 0.35; // <<< INCREASED GUN SCALE - ADJUST FURTHER IF NEEDED
// Recoil Config - **ADJUST THESE**
const RECOIL_AMOUNT = new THREE.Vector3(0, 0.015, 0.06);
const RECOIL_RECOVER_SPEED = 20;

// --- Global Variables ---
let gameState = 'loading';
let assetsReady = false;
let mapLoadState = 'loading';
let playerModelLoadState = 'loading';
let gunModelLoadState = 'loading';
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
function onKeyDown(event) { /* ... Same ... */ }
function onKeyUp(event) { /* ... Same ... */ }
function onMouseDown(event) { /* ... Same ... */ }

// --- UI State Management ---
function setGameState(newState, options = {}) { /* ... Same ... */ }

// --- Asset Loading ---
function loadSound() { /* ... Same ... */ }
function loadPlayerModel() { /* ... Same ... */ }
function loadGunModel() { /* ... Same ... */ }
function loadMap(mapPath) { /* ... Same ... */ }
function checkAssetsReady() { /* ... Same ... */ }

// --- Network & Joining ---
function setupSocketIO() {
    console.log(`Connect: ${SERVER_URL}`); socket=io(SERVER_URL,{transports:['websocket'],autoConnect:true});
    socket.on('connect',function(){console.log('Socket OK! ID:',socket.id); checkAssetsReady();});
    socket.on('disconnect',function(reason){console.warn('Disconnected:',reason); setGameState('homescreen',{playerCount:0}); infoDiv.textContent='Disconnected'; for(const id in players)removePlayerMesh(id); players={}; bullets=[];});
    socket.on('connect_error',function(err){console.error('Connect Err:',err.message); mapLoadState='error'; playerModelLoadState='error'; gunModelLoadState = 'error'; assetsReady=false; setGameState('loading',{message:`Connect Fail!<br/>${err.message}`,error:true});});
    socket.on('playerCountUpdate',function(count){playerCountSpan=playerCountSpan||document.getElementById('playerCount'); if(playerCountSpan)playerCountSpan.textContent=count; if(assetsReady&&socket.connected&&gameState==='loading'){setGameState('homescreen',{playerCount:count});}});
    socket.on('initialize',function(data){handleInitialize(data);});
    socket.on('playerJoined',function(d){handlePlayerJoined(d);});
    socket.on('playerLeft',function(id){handlePlayerLeft(id);});
    socket.on('playerMoved',function(d){updateRemotePlayerPosition(d);});
    socket.on('shotFired',function(d){spawnBullet(d);});
    socket.on('healthUpdate',function(d){handleHealthUpdate(d);}); // Log inside handler
    socket.on('playerDied',function(d){handlePlayerDied(d);}); // Log inside handler
    socket.on('playerRespawned',function(d){handlePlayerRespawned(d);});
}
function handleInitialize(data) { /* ... Same ... */ }
function attemptJoinGame() { /* ... Same ... */ }
function sendJoinDetails() { /* ... Same ... */ }

// --- Player Management & Model Loading ---
function addPlayer(playerData) {
    if(players[playerData.id]||playerData.id===localPlayerId)return;
    players[playerData.id]={...playerData,mesh:null,targetPosition:null,targetRotationY:null};
    if(playerModel&&playerModel!=='error'){
        try{
            const modelInstance=playerModel.clone();
            // <<<=== SET PLAYER SCALE TO 0.3 ===>>>
            const desiredScale=0.3; // Explicitly set requested scale
            modelInstance.scale.set(desiredScale,desiredScale,desiredScale);
            console.log(`Scaled PLAYER model instance ${playerData.id} to ${desiredScale}`);
            // <<<-------------------------------->>>
            modelInstance.traverse(function(c){if(c.isMesh)c.castShadow=true;});
            const visualY=playerData.y; // Assume model origin at feet
            modelInstance.position.set(playerData.x,visualY,playerData.z);
            modelInstance.rotation.y=playerData.rotationY;
            scene.add(modelInstance);
            players[playerData.id].mesh=modelInstance;
            players[playerData.id].targetPosition=modelInstance.position.clone();
            players[playerData.id].targetRotationY=modelInstance.rotation.y;
        } catch(e){
            console.error(`Model error ${playerData.id}:`,e); addPlayerFallbackMesh(playerData);
        }
    } else {
        addPlayerFallbackMesh(playerData);
    }
}
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

function updateBullets(deltaTime) { // Added logging for damage
    const removeIdx=[];
    for(let i=bullets.length-1;i>=0;i--){
        const b=bullets[i];
        if(!b?.mesh){ if(!removeIdx.includes(i))removeIdx.push(i); continue; }
        b.mesh.position.addScaledVector(b.velocity,deltaTime);
        let hit=false;
        for(const pId in players){
            if(pId!==b.ownerId && players[pId].mesh && players[pId].mesh.visible){
                const pM=players[pId].mesh;
                const pPos=new THREE.Vector3(); pM.getWorldPosition(pPos);
                const dist=b.mesh.position.distanceTo(pP);
                const pScaleR=(pM.scale?.x||1)*PLAYER_RADIUS; // Use PLAYER_RADIUS here
                const t=pScaleR+0.1; // Use PLAYER_RADIUS + bullet radius

                if(dist<t){
                    console.log(`Client hit: Bul ${b.id} -> P ${pId}`); // Log hit detection
                    hit=true;
                    if(b.ownerId===localPlayerId){
                        // *** LOG EMITTING HIT ***
                        console.log(`>>> Emitting 'hit' event to server: target=${pId}, damage=10`);
                        socket.emit('hit',{targetId:pId,damage:10});
                        // *** ---------------- ***
                    }
                    if(!removeIdx.includes(i))removeIdx.push(i);
                    scene.remove(b.mesh);
                    break;
                }
            }
        }
        if(hit)continue;
        if(Date.now()-b.spawnTime>BULLET_LIFETIME){if(!removeIdx.includes(i))removeIdx.push(i);scene.remove(b.mesh);}
    }
    if(removeIdx.length>0){ removeIdx.sort((a,b)=>b-a); for(const idx of removeIdx){ bullets.splice(idx,1); } }
}

function updateOtherPlayers(deltaTime) { /* ... Same ... */ }
function updateHealthBar(health) { /* ... Same ... */ }
function showKillMessage(message) { /* ... Same ... */ }
function handlePlayerJoined(playerData) { /* ... Same ... */ }
function handlePlayerLeft(playerId) { /* ... Same ... */ }

function handleHealthUpdate(data) { // Added logging
    console.log(">>> Received 'healthUpdate' event:", data); // Log event
    if(players[data.id]){
        players[data.id].health=data.health;
        if(data.id===localPlayerId){
            updateHealthBar(data.health);
            console.log(`Local health UI updated via network: ${data.health}`);
        } else {
            console.log(`Remote player ${data.id} health set to ${data.health}`);
        }
    } else {
        console.warn(`Received healthUpdate for unknown player: ${data.id}`);
    }
}

function handlePlayerDied(data) { // Added logging
    console.log(">>> Received 'playerDied' event:", data); // Log event
    if(players[data.targetId]){
        players[data.targetId].health=0;
        if(players[data.targetId].mesh) players[data.targetId].mesh.visible=false;
    } else {
        console.warn(`Received playerDied for unknown player: ${data.targetId}`);
    }
    if(data.targetId===localPlayerId){
        updateHealthBar(0);
        const kN=data.killerName||'environment';const kP=data.killerPhrase||'...';
        let msg=`You just got ${kP} by ${kN}.`; if(!data.killerId)msg=`You died.`;
        showKillMessage(msg);infoDiv.textContent=`YOU DIED`;
    }
}
function handlePlayerRespawned(playerData) { /* ... Same ... */ }

// --- Animation Loop ---
function animate() { /* ... Same ... */ }

// --- Utility Functions ---
function onWindowResize() { /* ... Same ... */ }

// ========================================================
// INITIALIZATION FUNCTION DEFINITION
// ========================================================
function init() { /* ... Same as previous ... */ }

// ========================================================
// --- START THE APPLICATION (Call init) ---
// ========================================================
if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', init); } else { init(); }
