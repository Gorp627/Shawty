// docs/main.js - Step 2: Add Back UI Flow & Player Models

// --- Configuration ---
const SERVER_URL = 'https://gametest-psxl.onrender.com';
const MAP_PATH = 'assets/maps/map.glb';
const SOUND_PATH_GUNSHOT = 'assets/maps/gunshot.wav'; // User path
const PLAYER_MODEL_PATH = 'assets/maps/Shawty1.glb'; // User path
// NO GUN MODEL PATH

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
// NO GUN/RECOIL CONSTANTS

// --- Global Variables ---
let gameState = 'loading';
let assetsReady = false;
let mapLoadState = 'loading';
let playerModelLoadState = 'loading'; // Player model only
// NO GUN STATE let gunModelLoadState = 'loading';
let socket;
let localPlayerId = null;
let localPlayerName = 'Anonymous';
let localPlayerPhrase = '...';
let players = {};
let bullets = [];
let keys = {};
let scene, camera, renderer, controls, clock, loader, dracoLoader;
let mapMesh = null;
let playerModel = null; // Template player model
// NO GUN let gunModel = null;
// NO GUN let gunViewModel = null;
let velocityY = 0;
let isOnGround = false;
let loadingScreen, homeScreen, gameUI, playerCountSpan, playerNameInput, playerPhraseInput, joinButton, homeScreenError, infoDiv, healthBarFill, healthText, killMessageDiv;
let killMessageTimeout = null;
let gunshotSound;
// NO RECOIL let currentRecoilOffset = new THREE.Vector3(0, 0, 0);

// ========================================================
// FUNCTION DEFINITIONS
// ========================================================

// --- Input Handling ---
function onKeyDown(event) {
    keys[event.code] = true;
    if (event.code === 'Space') {
        event.preventDefault();
        if (isOnGround && gameState === 'playing') {
            velocityY = JUMP_FORCE;
            isOnGround = false;
        }
    }
}
function onKeyUp(event) { keys[event.code] = false; }
function onMouseDown(event) {
    if (gameState === 'playing' && !controls?.isLocked) { controls?.lock(); }
    else if (gameState === 'playing' && controls?.isLocked && event.button === 0) { shoot(); }
}

// --- UI State Management ---
function setGameState(newState, options = {}) {
    console.log(`Set state: ${newState}`); const previousState = gameState;
    loadingScreen=loadingScreen||document.getElementById('loadingScreen'); homeScreen=homeScreen||document.getElementById('homeScreen'); gameUI=gameUI||document.getElementById('gameUI'); const canvas=document.getElementById('gameCanvas');
    if(gameState===newState && !(newState==='loading'&&options.error)) return; gameState = newState;
    playerCountSpan=playerCountSpan||document.getElementById('playerCount'); joinButton=joinButton||document.getElementById('joinButton');
    if(loadingScreen){loadingScreen.style.display='none'; loadingScreen.classList.remove('assets','error');const p=loadingScreen.querySelector('p');if(p)p.style.color='';}
    if(homeScreen){homeScreen.style.display='none';homeScreen.classList.remove('visible');}
    if(gameUI){gameUI.style.display='none';gameUI.classList.remove('visible');}
    if(canvas)canvas.style.display='none';
    switch(newState){
        case'loading':if(loadingScreen){loadingScreen.style.display='flex';const p=loadingScreen.querySelector('p');if(p)p.innerHTML=options.message||'Loading...';if(options.assets)loadingScreen.classList.add('assets');if(options.error&&p){p.style.color='#e74c3c';loadingScreen.classList.add('error');}}break;
        case'homescreen':if(homeScreen){homeScreen.style.display='flex';homeScreen.classList.add('visible');if(playerCountSpan)playerCountSpan.textContent=options.playerCount??playerCountSpan.textContent??'?';if(controls?.isLocked)controls.unlock();const obj=scene?.getObjectByName("PlayerControls");if(obj)scene.remove(obj); /*removeGunViewModel(); NO GUN*/ if(joinButton){joinButton.disabled=false;joinButton.textContent="Join Game";}}break;
        case'joining':if(joinButton){joinButton.disabled=true;joinButton.textContent="Joining...";}if(options.waitingForAssets)setGameState('loading',{message:"Loading Assets...",assets:true});break;
        case'playing':const cElem=document.getElementById('gameCanvas');if(gameUI){gameUI.style.display='block';gameUI.classList.add('visible');}else console.error("! gameUI");if(cElem){cElem.style.display='block';}else console.error("! gameCanvas");if(scene&&controls){if(!scene.getObjectByName("PlayerControls")){controls.getObject().name="PlayerControls";scene.add(controls.getObject());} /*attachGunViewModel(); NO GUN*/ setTimeout(function(){if(gameState==='playing'&&!controls.isLocked)controls.lock();},100);}else console.error("! Scene/Controls missing!");onWindowResize();break;
    } console.log(`Switched state from ${previousState} to ${gameState}`);
}


// --- Asset Loading ---
function loadSound() { try{gunshotSound=new Audio(SOUND_PATH_GUNSHOT);gunshotSound.volume=0.4;gunshotSound.preload='auto';gunshotSound.load();console.log("Sound OK.");}catch(e){console.error("Audio err:",e);gunshotSound=null;} }
function loadPlayerModel() { playerModelLoadState = 'loading'; console.log(`Load P Model: ${PLAYER_MODEL_PATH}`); if (!loader)return; loader.load(PLAYER_MODEL_PATH, function(gltf){ playerModel=gltf.scene;playerModel.traverse(function(c){if(c.isMesh)c.castShadow=true;});playerModelLoadState='loaded';checkAssetsReady(); }, undefined, function(err){ console.error("P Model ERR:",err);playerModelLoadState='error';checkAssetsReady(); }); }
// NO GUN function loadGunModel() { ... }
function loadMap(mapPath) { mapLoadState = 'loading'; console.log(`Load Map: ${mapPath}`); if(!loader)return; loader.load(mapPath, function(gltf){ mapMesh=gltf.scene;mapMesh.traverse(function(c){if(c.isMesh){c.castShadow=true; c.receiveShadow=true; c.userData.isCollidable=true;}});scene.add(mapMesh);mapLoadState='loaded';checkAssetsReady(); }, undefined, function(err){ console.error(`Map ERR (${mapPath}):`,err);mapLoadState='error';checkAssetsReady(); }); }
function checkAssetsReady() { // Check only Map and Player Model
    console.log(`CheckR: Map=${mapLoadState}, PModel=${playerModelLoadState}`); // Removed GunModel check
    const mapR=mapLoadState==='loaded'||mapLoadState==='error';
    const pModelR=playerModelLoadState==='loaded'||playerModelLoadState==='error';
    // NO GUN const gModelR=gunModelLoadState==='loaded'||gunModelLoadState==='error';
    if(mapR && pModelR){ // Check only these two
        if(mapLoadState==='error'||playerModelLoadState==='error'){ // Check if either failed
            assetsReady=false; console.error("Asset load fail."); setGameState('loading',{message:"FATAL: Asset Error!",error:true});
        } else {
            assetsReady=true; console.log("Assets OK.");
            if(socket?.connected && gameState==='loading'){ setGameState('homescreen',{playerCount:playerCountSpan?.textContent??'?'});}
            else if(gameState==='joining'){ sendJoinDetails();}
        }
    } else { assetsReady=false; }
}

// --- Network & Joining ---
function setupSocketIO() { // Connects early, includes name/phrase logic now
    console.log(`Connect: ${SERVER_URL}`); socket=io(SERVER_URL,{transports:['websocket'],autoConnect:true});
    socket.on('connect',function(){console.log('Socket OK! ID:',socket.id); checkAssetsReady();});
    socket.on('disconnect',function(reason){console.warn('Disconnected:',reason); setGameState('homescreen',{playerCount:0}); infoDiv.textContent='Disconnected'; for(const id in players)removePlayerMesh(id); players={}; bullets=[];});
    socket.on('connect_error',function(err){console.error('Connect Err:',err.message); mapLoadState='error'; playerModelLoadState='error'; assetsReady=false; setGameState('loading',{message:`Connect Fail!<br/>${err.message}`,error:true});});
    socket.on('playerCountUpdate',function(count){playerCountSpan=playerCountSpan||document.getElementById('playerCount'); if(playerCountSpan)playerCountSpan.textContent=count; if(assetsReady&&socket.connected&&gameState==='loading')setGameState('homescreen',{playerCount:count});});
    socket.on('initialize',function(data){handleInitialize(data);});
    socket.on('playerJoined',function(d){handlePlayerJoined(d);});
    socket.on('playerLeft',function(id){handlePlayerLeft(id);});
    socket.on('playerMoved',function(d){updateRemotePlayerPosition(d);});
    socket.on('shotFired',function(d){spawnBullet(d);});
    socket.on('healthUpdate',function(d){handleHealthUpdate(d);});
    socket.on('playerDied',function(d){handlePlayerDied(d);}); // Will handle phrase display
    socket.on('playerRespawned',function(d){handlePlayerRespawned(d);});
}
function handleInitialize(data) { // Handles server response after sending details
     console.log('Initialize handling.'); localPlayerId = data.id;
     for(const id in players)removePlayerMesh(id); players = {}; bullets = [];
     for(const id in data.players){ const pD=data.players[id]; if(id===localPlayerId){ players[id]={...pD,name:localPlayerName,phrase:localPlayerPhrase,mesh:null}; const visY=pD.y+PLAYER_HEIGHT; if(controls?.getObject()){controls.getObject().position.set(pD.x,visY,pD.z);} velocityY=0;isOnGround=true; updateHealthBar(pD.health); infoDiv.textContent=`Playing as ${localPlayerName}`; }else{addPlayer(pD);}} // Add OTHER players using their data
     console.log("Initialized players:",Object.keys(players).length); setGameState('playing'); // GO TO GAME
}
function attemptJoinGame() { // Triggered by button click
    localPlayerName = playerNameInput.value.trim() || 'Anonymous'; localPlayerPhrase = playerPhraseInput.value.trim() || '...'; if(!localPlayerName){homeScreenError.textContent='Enter name';return;} if(localPlayerPhrase.length>20){homeScreenError.textContent='Phrase too long';return;} homeScreenError.textContent='';
    console.log(`Joining as "${localPlayerName}"`); setGameState('joining',{waitingForAssets:!assetsReady}); // Enter joining state
    if(assetsReady){ sendJoinDetails(); }else console.log("Wait assets..."); // Send details if assets ready, else wait
}
function sendJoinDetails() { // Called when assets are ready AND joining state
    if(socket?.connected&&gameState==='joining'){ console.log("Sending details."); socket.emit('setPlayerDetails',{name:localPlayerName,phrase:localPlayerPhrase}); } // Send to server
    else if(gameState!=='joining'){ console.warn("Not joining state."); setGameState('homescreen',{playerCount:playerCountSpan?.textContent??'?'});} // Abort if state changed
    else{ console.error("Socket disconnected."); homeScreenError.textContent='Connection lost.'; setGameState('homescreen',{playerCount:playerCountSpan?.textContent??'?'});} // Abort on connection error
}

// --- Player Management & Model Loading ---
function addPlayer(playerData) { // Use PLAYER model now
    console.log(`Add player ${playerData.id} (${playerData.name})`); if(players[playerData.id]||playerData.id===localPlayerId)return;
    players[playerData.id]={...playerData,mesh:null,targetPosition:null,targetRotationY:null}; // Add player data WITH name/phrase from server
    if(playerModel&&playerModel!=='error'){ try{const dS=0.8;// <<<=== ADJUST SCALE const mI=playerModel.clone();mI.scale.set(dS,dS,dS);mI.traverse(function(c){if(c.isMesh)c.castShadow=true;}); const vY=playerData.y;mI.position.set(playerData.x,vY,playerData.z);mI.rotation.y=playerData.rotationY;scene.add(mI);players[playerData.id].mesh=mI;players[playerData.id].targetPosition=mI.position.clone();players[playerData.id].targetRotationY=mI.rotation.y;}catch(e){console.error(`Model error ${playerData.id}:`,e);addPlayerFallbackMesh(playerData);}}else{addPlayerFallbackMesh(playerData);}
}
function addPlayerFallbackMesh(playerData) { // Fallback cylinder if needed
    if(!players[playerData.id]||players[playerData.id].mesh)return; console.warn(`Fallback for ${playerData.id}`); try{const g=new THREE.CylinderGeometry(PLAYER_RADIUS,PLAYER_RADIUS,PLAYER_HEIGHT,8);const m=new THREE.MeshStandardMaterial({color:0xff00ff});const h=new THREE.Mesh(g,m); h.castShadow=true;const vY=playerData.y+(PLAYER_HEIGHT/2); h.position.set(playerData.x,vY,playerData.z); h.rotation.y=playerData.rotationY; scene.add(h); players[playerData.id].mesh=h; players[playerData.id].targetPosition=h.position.clone(); players[playerData.id].targetRotationY=h.rotation.y;}catch(e){console.error(`Fallback error ${playerData.id}:`,e);}
}
function removePlayerMesh(playerId) { if(players[playerId]?.mesh){ try{ scene.remove(players[playerId].mesh); if(players[playerId].mesh.geometry)players[playerId].mesh.geometry.dispose(); if(players[playerId].mesh.material){if(Array.isArray(players[playerId].mesh.material)){players[playerId].mesh.material.forEach(function(m){m.dispose();});}else{players[playerId].mesh.material.dispose();}} }catch(e){} players[playerId].mesh=null; } }
function updateRemotePlayerPosition(playerData) { // Adjusts visual Y based on mesh type
     if(playerData.id!==localPlayerId&&players[playerData.id]){ const p=players[playerData.id];let vY;if(p.mesh&&p.mesh.geometry instanceof THREE.CylinderGeometry){vY=playerData.y+(PLAYER_HEIGHT/2);}else{vY=playerData.y;}p.targetPosition=new THREE.Vector3(playerData.x,vY,playerData.z);p.targetRotationY=playerData.rotationY;p.x=playerData.x;p.y=playerData.y;p.z=playerData.z;p.rotationY=playerData.rotationY;p.name=playerData.name;p.phrase=playerData.phrase;} // Keep name/phrase update
}

// --- Game Logic ---
function updatePlayer(dT) { if(gameState!=='playing'||!controls?.isLocked||!localPlayerId||!players[localPlayerId])return; const o=controls.getObject();const s=players[localPlayerId]; if(!s||s.health<=0)return; const sp=keys['ShiftLeft']?MOVEMENT_SPEED_SPRINTING:MOVEMENT_SPEED; const dS=sp*dT; const pP=o.position.clone(); velocityY-=GRAVITY*dT; o.position.y+=velocityY*dT; if(keys['KeyW']){controls.moveForward(dS);} if(keys['KeyS']){controls.moveForward(-dS);} if(keys['KeyA']){controls.moveRight(-dS);} if(keys['KeyD']){controls.moveRight(dS);} const cP=o.position; for(const id in players){if(id!==localPlayerId&&players[id].mesh&&players[id].mesh.visible){const oM=players[id].mesh; const dXZ=new THREE.Vector2(cP.x-oM.position.x,cP.z-oM.position.z).length(); if(dXZ<PLAYER_COLLISION_RADIUS*2){o.position.x=pP.x; o.position.z=pP.z; o.position.y=cP.y; break;}}} let gY=0; if(o.position.y<gY+PLAYER_HEIGHT){o.position.y=gY+PLAYER_HEIGHT;if(velocityY<0)velocityY=0;isOnGround=true;}else{isOnGround=false;} if(o.position.y<VOID_Y_LEVEL&&s.health>0){socket.emit('fellIntoVoid');s.health=0;updateHealthBar(0);showKillMessage("You fell into the void.");} /* updateViewModel(dT); NO GUN */ const lP=o.position.clone(); lP.y-=PLAYER_HEIGHT; const lS=players[localPlayerId]; const pc=lP.distanceToSquared(new THREE.Vector3(lS?.x??0,lS?.y??0,lS?.z??0))>0.001; const cR=new THREE.Euler().setFromQuaternion(camera.quaternion,'YXZ'); const cRY=cR.y; const rc=Math.abs(cRY-(lS?.rotationY??0))>0.01; if(pc||rc){ if(lS){lS.x=lP.x;lS.y=lP.y;lS.z=lP.z;lS.rotationY=cRY;} socket.emit('playerUpdate',{x:lP.x,y:lP.y,z:lP.z,rotationY:cRY});}}
// NO GUN function updateViewModel(...) { ... }
// NO GUN function attachGunViewModel() { ... }
// NO GUN function removeGunViewModel() { ... }

function shoot() { // Basic shoot without recoil/viewmodel
    if(gameState!=='playing'||!socket||!localPlayerId||!controls?.isLocked||!players[localPlayerId]||players[localPlayerId].health<=0)return;
    if(gunshotSound){try{gunshotSound.cloneNode().play().catch(function(e){});}catch(e){}} // Play sound
    const bP=new THREE.Vector3(),bD=new THREE.Vector3(); if(!camera)return; camera.getWorldPosition(bP); camera.getWorldDirection(bD); // Originate from camera
    socket.emit('shoot',{position:{x:bP.x,y:bP.y,z:bP.z},direction:{x:bD.x,y:bD.y,z:bD.z}});
}
function spawnBullet(d) { const g=new THREE.SphereGeometry(0.1,6,6);const m=new THREE.MeshBasicMaterial({color:0xffff00});const h=new THREE.Mesh(g,m); h.position.set(d.position.x,d.position.y,d.position.z); const v=new THREE.Vector3(d.direction.x,d.direction.y,d.direction.z).normalize().multiplyScalar(BULLET_SPEED); bullets.push({id:d.bulletId,mesh:h,velocity:v,ownerId:d.shooterId,spawnTime:Date.now()}); scene.add(h); }
function updateBullets(dT) { const rI=[]; for(let i=bullets.length-1;i>=0;i--){const b=bullets[i];if(!b?.mesh){if(!rI.includes(i))rI.push(i);continue;}b.mesh.position.addScaledVector(b.velocity,dT);let hit=false;for(const pId in players){if(pId!==b.ownerId&&players[pId].mesh&&players[pId].mesh.visible){const pM=players[pId].mesh; const pP=new THREE.Vector3();pM.getWorldPosition(pP);const dist=b.mesh.position.distanceTo(pP);const pSR=(pM.scale?.x||1)*PLAYER_RADIUS; const t=pSR+0.1; if(dist<t){hit=true;if(b.ownerId===localPlayerId){socket.emit('hit',{targetId:pId,damage:10});}if(!rI.includes(i))rI.push(i);scene.remove(b.mesh);break;}}}if(hit)continue; if(Date.now()-b.spawnTime>BULLET_LIFETIME){if(!rI.includes(i))rI.push(i);scene.remove(b.mesh);}} if(rI.length>0){ rI.sort((a,b)=>b-a); for(const idx of rI){ bullets.splice(idx,1); } } }
function updateOtherPlayers(dT) { for(const id in players){if(id!==localPlayerId&&players[id].mesh){const p=players[id],m=p.mesh;if(p.targetPosition&&p.targetRotationY!==undefined){m.position.lerp(p.targetPosition,dT*12);let aD=p.targetRotationY-m.rotation.y;while(aD<-Math.PI)aD+=Math.PI*2;while(aD>Math.PI)aD-=Math.PI*2;m.rotation.y+=aD*dT*12;}}}}
function updateHealthBar(h) { const hp=Math.max(0,Math.min(100,h)); if(healthBarFill&&healthText){const fW=`${hp}%`; const bP=`${100-hp}% 0%`; healthBarFill.style.width=fW; healthBarFill.style.backgroundPosition=bP; healthText.textContent=`${Math.round(hp)}%`;}}
function showKillMessage(m) { if(killMessageTimeout)clearTimeout(killMessageTimeout);if(killMessageDiv){killMessageDiv.textContent=m;killMessageDiv.classList.add('visible');killMessageTimeout=setTimeout(function(){killMessageDiv.classList.remove('visible');},KILL_MESSAGE_DURATION);}}
function handlePlayerJoined(pD) { if(pD.id!==localPlayerId&&!players[pD.id]){addPlayer(pD);}}
function handlePlayerLeft(pId) { removePlayerMesh(pId);delete players[pId];}
function handleHealthUpdate(d) { if(players[d.id]){players[d.id].health=d.health;if(d.id===localPlayerId){updateHealthBar(d.health);}}}
function handlePlayerDied(data) { // Uses killer name/phrase
    if(players[data.targetId]){players[data.targetId].health=0;if(players[data.targetId].mesh)players[data.targetId].mesh.visible=false;}
    if(data.targetId===localPlayerId){updateHealthBar(0);const kN=data.killerName||'environment';const kP=data.killerPhrase||'...';let msg=`You just got ${kP} by ${kN}.`;if(!data.killerId)msg=`You died.`;showKillMessage(msg);infoDiv.textContent=`YOU DIED`;}
}
function handlePlayerRespawned(pD) { // Includes name/phrase sync
     if(!players[pD.id]&&pD.id!==localPlayerId){addPlayer(pD);}else if(players[pD.id]||pD.id===localPlayerId){const p=players[pD.id]||players[pD.id];p.health=pD.health;p.x=pD.x;p.y=pD.y;p.z=pD.z;p.rotationY=pD.rotationY;p.name=pD.name;p.phrase=pD.phrase; if(pD.id===localPlayerId){if(controls?.getObject())controls.getObject().position.set(p.x,p.y+PLAYER_HEIGHT,p.z);velocityY=0;isOnGround=true;updateHealthBar(p.health);infoDiv.textContent=`Playing as ${localPlayerName}`;showKillMessage("");killMessageDiv.classList.remove('visible');if(killMessageTimeout)clearTimeout(killMessageTimeout);}else{if(p.mesh){p.mesh.visible=true;let vY=p.mesh.geometry instanceof THREE.CylinderGeometry?p.y+(PLAYER_HEIGHT/2):p.y;p.mesh.position.set(p.x,vY,p.z);p.targetPosition=new THREE.Vector3(p.x,vY,p.z);p.targetRotationY=p.rotationY;}}}
}

// --- Animation Loop ---
function animate() { requestAnimationFrame(animate); const dT=clock?clock.getDelta():0.016; /* if(frameCount++%300===0)console.log(`Animate state: ${gameState}`); */ if(gameState==='playing'){if(players[localPlayerId]){updatePlayer(dT);}updateBullets(dT);updateOtherPlayers(dT);} if(renderer&&scene&&camera){try{renderer.render(scene,camera);}catch(e){console.error("Render error:",e);}}}
// --- Utility Functions ---
function onWindowResize() { if(camera){camera.aspect=window.innerWidth/window.innerHeight;camera.updateProjectionMatrix();} if(renderer)renderer.setSize(window.innerWidth,window.innerHeight); }

// ========================================================
// INITIALIZATION FUNCTION
// ========================================================
function init() {
    console.log("Init Shawty Baseline+Menu");
    // Get UI & Null Checks
    loadingScreen=document.getElementById('loadingScreen'); if (!loadingScreen)return; homeScreen=document.getElementById('homeScreen'); if (!homeScreen)return; gameUI=document.getElementById('gameUI'); if (!gameUI)return; playerCountSpan=document.getElementById('playerCount'); if (!playerCountSpan)return; playerNameInput=document.getElementById('playerNameInput'); if (!playerNameInput)return; playerPhraseInput=document.getElementById('playerPhraseInput'); if (!playerPhraseInput)return; joinButton=document.getElementById('joinButton'); if (!joinButton)return; homeScreenError=document.getElementById('homeScreenError'); if (!homeScreenError)return; infoDiv=document.getElementById('info'); if (!infoDiv)return; healthBarFill=document.getElementById('healthBarFill'); if (!healthBarFill)return; healthText=document.getElementById('healthText'); if (!healthText)return; killMessageDiv=document.getElementById('killMessage'); if (!killMessageDiv)return; const canvas=document.getElementById('gameCanvas'); if (!canvas)return; console.log("UI elements found.");

    setGameState('loading'); // Start loading

    // Setup Three.js
    try {
        scene=new THREE.Scene(); scene.background=new THREE.Color(0x87ceeb); scene.fog=new THREE.Fog(0x87ceeb,0,150);
        camera=new THREE.PerspectiveCamera(75,window.innerWidth/window.innerHeight,0.1,1000);
        renderer=new THREE.WebGLRenderer({canvas:canvas,antialias:true}); renderer.setSize(window.innerWidth,window.innerHeight); renderer.shadowMap.enabled=true;
        clock=new THREE.Clock(); loader=new THREE.GLTFLoader(); dracoLoader=new THREE.DRACOLoader();
        dracoLoader.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/libs/draco/'); dracoLoader.setDecoderConfig({type:'js'}); loader.setDRACOLoader(dracoLoader);
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

    // Start Loads & Connect
    console.log("Start loads & socket..."); loadSound(); loadPlayerModel(); loadMap(MAP_PATH); setupSocketIO(); // Only load map and player model

    // Add Event Listeners
    console.log("Add listeners..."); joinButton?.addEventListener('click',attemptJoinGame); window.addEventListener('resize',onWindowResize); document.addEventListener('keydown',onKeyDown); document.addEventListener('keyup',onKeyUp); document.addEventListener('mousedown',onMouseDown); console.log("Listeners added.");

    // Start loop
    console.log("Start animate."); animate();
}

// ========================================================
// --- START THE APPLICATION ---
// ========================================================
if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', init); } else { init(); }
