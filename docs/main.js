// docs/main.js

// --- Configuration ---
const SERVER_URL = 'https://gametest-psxl.onrender.com';
const MAP_PATH = 'assets/maps/map.glb';
const SOUND_PATH_GUNSHOT = 'assets/maps/gunshot.wav'; // User specified path
const PLAYER_MODEL_PATH = 'assets/maps/Shawty1.glb'; // User specified path
const GUN_MODEL_PATH = 'assets/maps/gun2.glb'; // User specified path

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
const BULLET_LIFETIME = 3000; // ms
// Gun View Model Config - **ADJUST THESE**
const GUN_POS_OFFSET = new THREE.Vector3(0.4, -0.35, -0.7);
const GUN_SCALE = 0.1; // Start small, e.g., 0.1, 0.08
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
let playerModel = null; // Template model
let gunModel = null; // Template gun model
let gunViewModel = null; // Instance attached to camera
let velocityY = 0;
let isOnGround = false;
let loadingScreen, homeScreen, gameUI, playerCountSpan, playerNameInput, playerPhraseInput, joinButton, homeScreenError, infoDiv, healthBarFill, healthText, killMessageDiv;
let killMessageTimeout = null;
let gunshotSound;
let frameCount = 0; // For throttled logs
let currentRecoilOffset = new THREE.Vector3(0, 0, 0);

// ========================================================
// FUNCTION DEFINITIONS (Define ALL before init)
// ========================================================

// --- Input Handling ---
function onKeyDown(event) {
    keys[event.code] = true;
    if (event.code === 'Space') {
        event.preventDefault(); // Prevent page scroll
        if (isOnGround && gameState === 'playing') {
            velocityY = JUMP_FORCE;
            isOnGround = false;
        }
    }
}

function onKeyUp(event) {
    keys[event.code] = false;
}

function onMouseDown(event) {
    // If not playing or pointer isn't locked, attempt to lock pointer on click
    if (gameState === 'playing' && !controls?.isLocked) {
        controls?.lock();
    }
    // Shoot only if playing, locked, and left mouse
    else if (gameState === 'playing' && controls?.isLocked && event.button === 0) {
        shoot();
    }
}

// --- UI State Management ---
function setGameState(newState, options = {}) {
    console.log(`Setting game state to: ${newState}`, options);
    const previousState = gameState;

    loadingScreen = loadingScreen || document.getElementById('loadingScreen');
    homeScreen = homeScreen || document.getElementById('homeScreen');
    gameUI = gameUI || document.getElementById('gameUI');
    const canvas = document.getElementById('gameCanvas');

    if (gameState === newState && !(newState === 'loading' && options.error)) {
        return; // Prevent redundant state changes unless forcing error display
    }
    gameState = newState;

    // Ensure elements are grabbed before use
    playerCountSpan = playerCountSpan || document.getElementById('playerCount');
    joinButton = joinButton || document.getElementById('joinButton');


    // Hide all sections first
    if(loadingScreen) { loadingScreen.style.display = 'none'; loadingScreen.classList.remove('assets', 'error'); const p = loadingScreen.querySelector('p'); if(p) p.style.color = ''; }
    if(homeScreen) { homeScreen.style.display = 'none'; homeScreen.classList.remove('visible'); }
    if(gameUI) { gameUI.style.display = 'none'; gameUI.classList.remove('visible'); }
    if(canvas) canvas.style.display = 'none';

    // Show the target section
    switch (newState) {
        case 'loading':
            if(loadingScreen) {
                loadingScreen.style.display = 'flex';
                const p = loadingScreen.querySelector('p');
                if (p) p.innerHTML = options.message || 'Loading...';
                if (options.assets) loadingScreen.classList.add('assets');
                if (options.error && p) {
                     p.style.color = '#e74c3c'; // Red error text
                     loadingScreen.classList.add('error');
                }
            }
            break;
        case 'homescreen':
             if(homeScreen) {
                homeScreen.style.display = 'flex';
                requestAnimationFrame(() => { homeScreen.classList.add('visible'); }); // Fade in
                if(playerCountSpan) playerCountSpan.textContent = options.playerCount ?? playerCountSpan.textContent ?? '?'; // Update count safely
                if (controls?.isLocked) {
                    console.log("Unlocking controls explicitly for homescreen state.");
                    controls.unlock(); // This should NOT trigger the state change now
                }
                const playerControlsObject = scene?.getObjectByName("PlayerControls");
                if (playerControlsObject) {
                    console.log("Removing player controls from scene for homescreen.");
                    scene.remove(playerControlsObject);
                }
                removeGunViewModel(); // Remove gun from camera view
                if(joinButton) {
                    // Ensure Join button is re-enabled
                    joinButton.disabled = false;
                    joinButton.textContent = "Join Game";
                    console.log("Join button re-enabled for homescreen.");
                }
            }
            break;
        case 'joining':
             joinButton = joinButton || document.getElementById('joinButton'); // Make sure we have it
             if(joinButton) {
                joinButton.disabled = true;
                joinButton.textContent = "Joining...";
             }
             if(options.waitingForAssets) {
                 // Re-use 'loading' state visually
                 setGameState('loading', { message: "Loading Assets...", assets: true });
             }
             // Otherwise, stay visually on homescreen (button disabled)
            break;
        case 'playing':
            console.log(">>> Setting state to PLAYING");
            const canvasElem = document.getElementById('gameCanvas');

            if(gameUI) {
                gameUI.style.display = 'block'; // Make UI container visible
                requestAnimationFrame(() => { gameUI.classList.add('visible'); }); // Fade in
                console.log(">>> Game UI display set to block, visibility triggered.");
            } else { console.error(">>> gameUI element not found!"); }

            if(canvasElem) {
                 canvasElem.style.display = 'block';
                 console.log(">>> Canvas display set to block.");
            } else { console.error(">>> gameCanvas element not found!"); }

            if (scene && controls) {
                if (!scene.getObjectByName("PlayerControls")) {
                    console.log(">>> Adding player controls object to scene.");
                    controls.getObject().name = "PlayerControls";
                    scene.add(controls.getObject());
                } else {
                     console.log(">>> Player controls object already in scene.");
                }
                 attachGunViewModel(); // Attach gun model to camera
                 console.log(">>> Position Check - Camera:", camera?.position.toArray()); // Log array form
                 console.log(">>> Position Check - Controls Object:", controls?.getObject()?.position.toArray()); // Log array form

                console.log(">>> Attempting controls.lock()...");
                 // Use timeout to help ensure browser is ready for lock after state change/render
                 setTimeout(() => {
                      if(gameState === 'playing' && !controls.isLocked) {
                          console.log(">>> Executing delayed controls.lock()");
                          controls.lock();
                      }
                 }, 100); // 100ms delay
            } else { console.error(">>> Scene or Controls not ready when setting state to playing!");}

            onWindowResize(); // Ensure size is correct
            console.log(">>> Game state set to PLAYING complete.");
            break;
    }
     console.log(`Switched state from ${previousState} to ${gameState}`);
}


// --- Asset Loading ---
function loadSound() {
     try {
        gunshotSound = new Audio(SOUND_PATH_GUNSHOT);
        gunshotSound.volume = 0.4;
        gunshotSound.preload = 'auto';
        gunshotSound.load();
        console.log("Gunshot sound object created.");
    } catch(e){ console.error("Audio error:",e); gunshotSound = null; }
}

function loadPlayerModel() {
    playerModelLoadState = 'loading';
    console.log(`Loading player model: ${PLAYER_MODEL_PATH}`);
    if (!loader) { console.error("! Loader not init before loadPlayerModel"); return; }
    loader.load(PLAYER_MODEL_PATH,
    (gltf)=>{ // Success
        console.log(">>> Player model SUCCESS callback entered.");
        playerModel=gltf.scene; playerModel.traverse((c)=>{if(c.isMesh)c.castShadow=true;}); playerModelLoadState='loaded'; checkAssetsReady();
    },
    undefined, // Progress
    (error)=>{ // Error
        console.error("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
        console.error("!!! >>> Player model ERROR callback entered.");
        console.error("!!! FATAL: Error loading player model:", error);
        console.error("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
        if (error instanceof ErrorEvent) console.error("Network/ErrorEvent details:", error.message);
        else if (error instanceof ProgressEvent) console.error("ProgressEvent likely network fail (404?). Check Network tab!");
        playerModelLoadState='error'; checkAssetsReady();
    });
}

function loadGunModel() {
    gunModelLoadState = 'loading';
    console.log(`Loading gun model: ${GUN_MODEL_PATH}`);
    if (!loader) { console.error("! Loader not init before loadGunModel"); return; }
    loader.load(GUN_MODEL_PATH,
    (gltf)=>{ // Success
        console.log(">>> Gun model SUCCESS callback entered.");
        gunModel=gltf.scene; gunModel.traverse((c)=>{if(c.isMesh){c.castShadow=false; c.receiveShadow=false;}});
        gunModelLoadState='loaded'; checkAssetsReady();
    },
    undefined, // Progress
    (error)=>{ // Error
        console.error("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
        console.error("!!! >>> Gun model ERROR callback entered.");
        console.error("!!! FATAL: Error loading gun model:", error);
        console.error("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
        if (error instanceof ErrorEvent) console.error("Network/ErrorEvent details:", error.message);
        else if (error instanceof ProgressEvent) console.error("ProgressEvent likely network fail (404?). Check Network tab!");
        gunModelLoadState='error'; checkAssetsReady();
    });
}

function loadMap(mapPath) {
    mapLoadState = 'loading';
    console.log(`Loading map: ${mapPath}`);
    if (!loader) { console.error("! Loader not init before loadMap"); return; }
    loader.load(mapPath,
    (gltf)=>{ // Success
        console.log(">>> Map SUCCESS callback entered.");
        mapMesh=gltf.scene; mapMesh.traverse((c)=>{if(c.isMesh){c.castShadow=true; c.receiveShadow=true; c.userData.isCollidable=true;}});
        scene.add(mapMesh); mapLoadState='loaded'; checkAssetsReady();
    },
    undefined, // Progress
    (error)=>{ // Error
        console.error("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
        console.error(`!!! >>> Map ERROR callback entered (${mapPath}):`);
        console.error(`!!! FATAL: Error loading map (${mapPath}):`, error);
        console.error("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
        if (error instanceof ErrorEvent) console.error("Network/ErrorEvent details:", error.message);
        else if (error instanceof ProgressEvent) console.error("ProgressEvent likely network fail (404?). Check Network tab!");
        mapLoadState='error'; checkAssetsReady();
    });
}


function checkAssetsReady() {
    console.log(`checkReady: Map=${mapLoadState}, PModel=${playerModelLoadState}, GModel=${gunModelLoadState}`);
    const mapR=mapLoadState==='loaded'||mapLoadState==='error';const pModelR=playerModelLoadState==='loaded'||playerModelLoadState==='error';const gModelR=gunModelLoadState==='loaded'||gunModelLoadState==='error';
    if(mapR && pModelR && gModelR){ // Check all three
        if(mapLoadState==='error'||playerModelLoadState==='error'||gunModelLoadState==='error'){ // Check if any failed
            assetsReady=false; console.error("Asset load failed.");
            setGameState('loading',{message:"FATAL: Asset Error!<br/>Check Console.",error:true});
        } else {
            assetsReady=true; console.log("Assets ready.");
            if(socket?.connected && gameState==='loading'){
                console.log("Show homescreen (Assets+Socket ready).");
                setGameState('homescreen',{playerCount:playerCountSpan?.textContent??'?'});
            } else if(gameState==='joining'){
                 console.log("Assets ready while joining.");
                 sendJoinDetails();
            }
        }
    } else { assetsReady=false; } // Still waiting
}

// --- Network & Joining ---
function setupSocketIO() {
    console.log(`Connecting to: ${SERVER_URL}`); socket=io(SERVER_URL,{transports:['websocket'],autoConnect:true});
    socket.on('connect',()=>{ console.log('Socket connected! ID:',socket.id); checkAssetsReady(); if (gameState === 'homescreen' && playerCountSpan && playerCountSpan.textContent === '?') console.log("Connected, on homescreen, count '?'. Wait update.");});
    socket.on('disconnect',(reason)=>{ console.warn('Disconnected:',reason); setGameState('homescreen',{playerCount:0}); infoDiv.textContent='Disconnected'; for(const id in players)removePlayerMesh(id); players={}; bullets=[]; });
    socket.on('connect_error',(err)=>{ console.error(">>> Socket CONNECT_ERROR callback entered."); console.error('Connection Error:',err.message); mapLoadState='error'; playerModelLoadState='error'; gunModelLoadState = 'error'; assetsReady=false; setGameState('loading',{message:`Connection Failed!<br/>${err.message}`,error:true}); });
    socket.on('playerCountUpdate',(count)=>{ console.log(">>> Socket PLAYER_COUNT_UPDATE callback entered.", count); playerCountSpan=playerCountSpan||document.getElementById('playerCount'); if(playerCountSpan)playerCountSpan.textContent=count; else console.warn("playerCountSpan missing"); if(assetsReady&&socket.connected&&gameState==='loading'){setGameState('homescreen',{playerCount:count});} });
    socket.on('initialize',(data)=>{ console.log('>>> Socket INITIALIZE callback entered.'); handleInitialize(data); }); // Use separate handler
    socket.on('playerJoined',(d)=>{handlePlayerJoined(d);}); socket.on('playerLeft',(id)=>{handlePlayerLeft(id);}); socket.on('playerMoved',(d)=>{updateRemotePlayerPosition(d);}); socket.on('shotFired',(d)=>{spawnBullet(d);}); socket.on('healthUpdate',(d)=>{handleHealthUpdate(d);}); socket.on('playerDied',(d)=>{handlePlayerDied(d);}); socket.on('playerRespawned',(d)=>{handlePlayerRespawned(d);});
} // End setupSocketIO

function handleInitialize(data) { // Separate initialization logic
     console.log('Handling initialize data...'); localPlayerId = data.id;
     for(const id in players)removePlayerMesh(id); players = {}; bullets = [];
     let iPosX=0,iPosY=0,iPosZ=0;
     for(const id in data.players){ const pD=data.players[id]; if(id===localPlayerId){ players[id]={...pD,name:localPlayerName,phrase:localPlayerPhrase,mesh:null}; iPosX=pD.x;iPosY=pD.y;iPosZ=pD.z; const visY=iPosY+PLAYER_HEIGHT; if(controls?.getObject()){controls.getObject().position.set(iPosX,visY,iPosZ);console.log(`Set controls pos: ${iPosX},${visY},${iPosZ}`);}else console.error("Controls missing!"); velocityY=0;isOnGround=true; updateHealthBar(pD.health); infoDiv.textContent=`Playing as ${localPlayerName}`; }else{addPlayer(pD);}}
     console.log("Game initialized with players:",Object.keys(players).length); setGameState('playing');
}

function attemptJoinGame() {
    localPlayerName = playerNameInput.value.trim() || 'Anonymous'; localPlayerPhrase = playerPhraseInput.value.trim() || '...'; if(!localPlayerName){homeScreenError.textContent='Enter name';return;} if(localPlayerPhrase.length>20){homeScreenError.textContent='Phrase too long';return;} homeScreenError.textContent='';
    console.log(`Joining as "${localPlayerName}"`); setGameState('joining',{waitingForAssets:!assetsReady});
    if(assetsReady){ sendJoinDetails(); }else console.log("Wait assets...");
}
function sendJoinDetails() {
    if(socket?.connected&&gameState==='joining'){ console.log("Sending details."); socket.emit('setPlayerDetails',{name:localPlayerName,phrase:localPlayerPhrase}); }
    else if(gameState!=='joining'){ console.warn("Not joining state."); setGameState('homescreen',{playerCount:playerCountSpan?.textContent??'?'});}
    else{ console.error("Socket disconnected."); homeScreenError.textContent='Connection lost.'; setGameState('homescreen',{playerCount:playerCountSpan?.textContent??'?'});}
}

// --- Player Management & Model Loading ---
function addPlayer(playerData) {
    console.log(`Adding player ${playerData.id} (${playerData.name})`); if(players[playerData.id]||playerData.id===localPlayerId)return;
    players[playerData.id]={...playerData,mesh:null,targetPosition:null,targetRotationY:null};
    if(playerModel&&playerModel!=='error'){ try{const modelInstance=playerModel.clone();const desiredScale=0.8;// <<<=== ADJUST SCALE modelInstance.scale.set(desiredScale,desiredScale,desiredScale); modelInstance.traverse((c)=>{if(c.isMesh)c.castShadow=true;}); const visualY=playerData.y; modelInstance.position.set(playerData.x,visualY,playerData.z); modelInstance.rotation.y=playerData.rotationY; scene.add(modelInstance); players[playerData.id].mesh=modelInstance; players[playerData.id].targetPosition=modelInstance.position.clone(); players[playerData.id].targetRotationY=modelInstance.rotation.y;} catch(e){console.error(`Model error for ${playerData.id}:`,e);addPlayerFallbackMesh(playerData);}} else{console.warn(`Fallback for ${playerData.id}`);addPlayerFallbackMesh(playerData);}
}
function addPlayerFallbackMesh(playerData) {
    if(!players[playerData.id]||players[playerData.id].mesh)return; console.warn(`Using fallback for ${playerData.id}`); try{const geo=new THREE.CylinderGeometry(PLAYER_RADIUS,PLAYER_RADIUS,PLAYER_HEIGHT,8);const mat=new THREE.MeshStandardMaterial({color:0xff00ff}); const mesh=new THREE.Mesh(geo,mat); mesh.castShadow=true;const visY=playerData.y+(PLAYER_HEIGHT/2); mesh.position.set(playerData.x,visY,playerData.z); mesh.rotation.y=playerData.rotationY; scene.add(mesh); players[playerData.id].mesh=mesh; players[playerData.id].targetPosition=mesh.position.clone(); players[playerData.id].targetRotationY=mesh.rotation.y;}catch(e){console.error(`Fallback mesh error ${playerData.id}:`,e);}
}
function removePlayerMesh(playerId) {
    if(players[playerId]?.mesh){ try{ scene.remove(players[playerId].mesh); if(players[playerId].mesh.geometry)players[playerId].mesh.geometry.dispose(); if(players[playerId].mesh.material){if(Array.isArray(players[playerId].mesh.material)){players[playerId].mesh.material.forEach(m=>m.dispose());}else{players[playerId].mesh.material.dispose();}} console.log(`Removed mesh ${playerId}`); }catch(e){console.error(`Error remove mesh ${playerId}:`,e);} players[playerId].mesh=null; }
}
function updateRemotePlayerPosition(playerData) {
     if(playerData.id!==localPlayerId&&players[playerData.id]){ const p=players[playerData.id];let visY;if(p.mesh&&p.mesh.geometry instanceof THREE.CylinderGeometry){visY=playerData.y+(PLAYER_HEIGHT/2);}else{visY=playerData.y;}p.targetPosition=new THREE.Vector3(playerData.x,visY,playerData.z);p.targetRotationY=playerData.rotationY;p.x=playerData.x;p.y=playerData.y;p.z=playerData.z;p.rotationY=playerData.rotationY;p.name=playerData.name;p.phrase=playerData.phrase;}
}

// --- Game Logic Update Loop ---
function updatePlayer(deltaTime) {
    if(gameState!=='playing'||!controls?.isLocked||!localPlayerId||!players[localPlayerId])return; const playerObject=controls.getObject();const playerState=players[localPlayerId]; if(!playerState||playerState.health<=0)return;
    const currentSpeed=keys['ShiftLeft']?MOVEMENT_SPEED_SPRINTING:MOVEMENT_SPEED; const speed=currentSpeed*deltaTime; const previousPosition=playerObject.position.clone();
    velocityY-=GRAVITY*deltaTime; playerObject.position.y+=velocityY*deltaTime;
    if(keys['KeyW']){controls.moveForward(speed);} if(keys['KeyS']){controls.moveForward(-speed);} if(keys['KeyA']){controls.moveRight(-speed);} if(keys['KeyD']){controls.moveRight(speed);}
    const currentPosition=playerObject.position; for(const id in players){if(id!==localPlayerId&&players[id].mesh&&players[id].mesh.visible){const otherMesh=players[id].mesh; const dXZ=new THREE.Vector2(currentPosition.x-otherMesh.position.x,currentPosition.z-otherMesh.position.z).length(); if(dXZ<PLAYER_COLLISION_RADIUS*2){console.log("Player collision revert"); playerObject.position.x=previousPosition.x; playerObject.position.z=previousPosition.z; playerObject.position.y=currentPosition.y; break;}}}
    let groundY=0; if(playerObject.position.y<groundY+PLAYER_HEIGHT){playerObject.position.y=groundY+PLAYER_HEIGHT;if(velocityY<0)velocityY=0;isOnGround=true;}else{isOnGround=false;}
    if(playerObject.position.y<VOID_Y_LEVEL&&playerState.health>0){console.log("Void death");socket.emit('fellIntoVoid');playerState.health=0;updateHealthBar(0);showKillMessage("You fell into the void.");}
    updateViewModel(deltaTime);
    const logicalPos=playerObject.position.clone(); logicalPos.y-=PLAYER_HEIGHT; const lastSent=players[localPlayerId]; const posChanged=logicalPos.distanceToSquared(new THREE.Vector3(lastSent?.x??0,lastSent?.y??0,lastSent?.z??0))>0.001; const camRot=new THREE.Euler().setFromQuaternion(camera.quaternion,'YXZ'); const curRotY=camRot.y; const rotChanged=Math.abs(curRotY-(lastSent?.rotationY??0))>0.01;
    if(posChanged||rotChanged){if(lastSent){lastSent.x=logicalPos.x;lastSent.y=logicalPos.y;lastSent.z=logicalPos.z;lastSent.rotationY=curRotY;}socket.emit('playerUpdate',{x:logicalPos.x,y:logicalPos.y,z:logicalPos.z,rotationY:curRotY});}
}

// --- View Model Update (Recoil) ---
function updateViewModel(deltaTime) { if(!gunViewModel||!camera)return; currentRecoilOffset.lerp(new THREE.Vector3(0,0,0),deltaTime*RECOIL_RECOVER_SPEED); const finalGunPos=GUN_POS_OFFSET.clone().add(currentRecoilOffset); gunViewModel.position.copy(finalGunPos); gunViewModel.rotation.copy(camera.rotation); }
function attachGunViewModel() { if(!gunModel||gunModel==='error'||!camera){console.error("! Gun template/camera missing");return;} if(gunViewModel)return; gunViewModel=gunModel.clone(); gunViewModel.scale.set(GUN_SCALE,GUN_SCALE,GUN_SCALE); gunViewModel.position.copy(GUN_POS_OFFSET); camera.add(gunViewModel); console.log("Gun view model attached."); }
function removeGunViewModel() { if(gunViewModel&&camera){camera.remove(gunViewModel);gunViewModel=null;console.log("Gun view model removed.");} }


// --- Shoot, Bullet, Interpolation, UI, Event Handlers ---
function shoot() {
    console.log("Shoot func start."); if(gameState!=='playing'||!socket||!localPlayerId||!controls?.isLocked||!players[localPlayerId]||players[localPlayerId].health<=0){console.log(`Shoot blocked`);return;}
    currentRecoilOffset.copy(RECOIL_AMOUNT); console.log("Recoil applied.");
    if(gunshotSound){try{gunshotSound.cloneNode().play().catch(e=>console.warn("Sound fail:",e));console.log("Gun sound played.");}catch(e){console.error("Sound error:",e);}}else console.warn("No gunshot sound.");
    const bulPos=new THREE.Vector3(),bulDir=new THREE.Vector3(); if(!camera){console.error("! Camera missing");return;}
    if(gunViewModel){const muzzleOffset=new THREE.Vector3(0,-0.05,-0.5).applyQuaternion(camera.quaternion);bulPos.copy(camera.position).add(muzzleOffset);console.log("Bullet origin: gun approx");}else{camera.getWorldPosition(bulPos);console.log("Bullet origin: cam");} camera.getWorldDirection(bulDir);
    console.log("Emit shoot event."); socket.emit('shoot',{position:{x:bulPos.x,y:bulPos.y,z:bulPos.z},direction:{x:bulDir.x,y:bulDir.y,z:bulDir.z}}); console.log("Shoot emitted.");
}
function spawnBullet(bulletData) {
     console.log(`Spawning bullet ${bulletData.bulletId}`); const geo=new THREE.SphereGeometry(0.1,6,6);const mat=new THREE.MeshBasicMaterial({color:0xffff00});const mesh=new THREE.Mesh(geo,mat); mesh.position.set(bulletData.position.x,bulletData.position.y,bulletData.position.z); const vel=new THREE.Vector3(bulletData.direction.x,bulletData.direction.y,bulletData.direction.z).normalize().multiplyScalar(BULLET_SPEED); bullets.push({id:bulletData.bulletId,mesh:mesh,velocity:vel,ownerId:bulletData.shooterId,spawnTime:Date.now()}); scene.add(mesh); console.log(`Bullet ${bulletData.bulletId} added.`);
}
function updateBullets(deltaTime) {
     const removeIdx=[]; for(let i=bullets.length-1;i>=0;i--){const b=bullets[i];if(!b?.mesh){if(!removeIdx.includes(i))removeIdx.push(i);continue;}b.mesh.position.addScaledVector(b.velocity,deltaTime);let hit=false;for(const pId in players){if(pId!==b.ownerId&&players[pId].mesh&&players[pId].mesh.visible){const pMesh=players[pId].mesh; const pPos=new THREE.Vector3();pMesh.getWorldPosition(pPos);const dist=b.mesh.position.distanceTo(pPos);const pScaleR=(pMesh.scale?.x||1)*PLAYER_RADIUS; const thresh=pScaleR+0.1; if(dist<thresh){console.log(`Client hit: Bul ${b.id} -> P ${pId}`);hit=true;if(b.ownerId===localPlayerId){socket.emit('hit',{targetId:pId,damage:10});}if(!removeIdx.includes(i))removeIdx.push(i);scene.remove(b.mesh);break;}}}if(hit)continue; if(Date.now()-b.spawnTime>BULLET_LIFETIME){if(!removeIdx.includes(i))removeIdx.push(i);scene.remove(b.mesh);}} if(removeIdx.length>0){removeIdx.sort((a,b)=>b-a);for(const idx of removeIdx){if(bullets[idx]?.mesh){}bullets.splice(idx,1);}}
}
function updateOtherPlayers(deltaTime) { for(const id in players){if(id!==localPlayerId&&players[id].mesh){const p=players[id],m=p.mesh;if(p.targetPosition&&p.targetRotationY!==undefined){m.position.lerp(p.targetPosition,deltaTime*12);let angDiff=p.targetRotationY-m.rotation.y;while(angDiff<-Math.PI)angDiff+=Math.PI*2;while(angDiff>Math.PI)angDiff-=Math.PI*2;m.rotation.y+=angDiff*deltaTime*12;}}}}
function updateHealthBar(health) { const hp=Math.max(0,Math.min(100,health)); if(healthBarFill&&healthText){const fillW=`${hp}%`; const bgPos=`${100-hp}% 0%`; healthBarFill.style.width=fillW; healthBarFill.style.backgroundPosition=bgPos; healthText.textContent=`${Math.round(hp)}%`;}}
function showKillMessage(message) { if(killMessageTimeout)clearTimeout(killMessageTimeout);if(killMessageDiv){killMessageDiv.textContent=message;killMessageDiv.classList.add('visible');killMessageTimeout=setTimeout(()=>{killMessageDiv.classList.remove('visible');},KILL_MESSAGE_DURATION);}}
function handlePlayerJoined(playerData) { console.log('Player joined handled:',playerData.id);if(playerData.id!==localPlayerId&&!players[playerData.id]){addPlayer(playerData);}}
function handlePlayerLeft(playerId) { console.log('Player left handled:',playerId);removePlayerMesh(playerId);delete players[playerId];}
function handleHealthUpdate(data) { if(players[data.id]){players[data.id].health=data.health;if(data.id===localPlayerId){updateHealthBar(data.health);console.log(`Local health UI updated: ${data.health}`);}}}
function handlePlayerDied(data) { console.log(`Player died handled: ${data.targetId}`);if(players[data.targetId]){players[data.targetId].health=0;if(players[data.targetId].mesh){players[data.targetId].mesh.visible=false;}}if(data.targetId===localPlayerId){updateHealthBar(0);const killerN=data.killerName||'the environment';const killerP=data.killerPhrase||'...';let msg=`You just got ${killerP} by ${killerN}.`;if(!data.killerId)msg=`You died.`;showKillMessage(msg);infoDiv.textContent=`YOU DIED`;}}
function handlePlayerRespawned(playerData) { console.log(`Player respawn handled: ${playerData.id}`); if(!players[playerData.id]&&playerData.id!==localPlayerId){addPlayer(playerData);}else if(players[playerData.id]||playerData.id===localPlayerId){const p=players[playerData.id]||players[localPlayerId];p.health=playerData.health;p.x=playerData.x;p.y=playerData.y;p.z=playerData.z;p.rotationY=playerData.rotationY;p.name=playerData.name;p.phrase=playerData.phrase; if(playerData.id===localPlayerId){if(controls?.getObject())controls.getObject().position.set(p.x,p.y+PLAYER_HEIGHT,p.z);velocityY=0;isOnGround=true;updateHealthBar(p.health);infoDiv.textContent=`Playing as ${localPlayerName}`;showKillMessage("");killMessageDiv.classList.remove('visible');if(killMessageTimeout)clearTimeout(killMessageTimeout);}else{if(p.mesh){p.mesh.visible=true;let visY=p.mesh.geometry instanceof THREE.CylinderGeometry?p.y+(PLAYER_HEIGHT/2):p.y;p.mesh.position.set(p.x,visY,p.z);p.targetPosition=new THREE.Vector3(p.x,visY,p.z);p.targetRotationY=p.rotationY;}}}}

// --- Animation Loop ---
function animate() {
    requestAnimationFrame(animate);
    const deltaTime = clock ? clock.getDelta() : 0.016;
    if (frameCount++ % 300 === 0) { console.log(`Animate running. State: ${gameState}`);}
    if (gameState === 'playing') { if (players[localPlayerId]) { updatePlayer(deltaTime); } updateBullets(deltaTime); updateOtherPlayers(deltaTime); }
    if (renderer && scene && camera) { try { renderer.render(scene, camera); } catch (e) { console.error("Render error:", e); } }
}

// --- Utility Functions ---
function onWindowResize() { if(camera){camera.aspect=window.innerWidth/window.innerHeight;camera.updateProjectionMatrix();} if(renderer)renderer.setSize(window.innerWidth,window.innerHeight); }

// ========================================================
// INITIALIZATION FUNCTION DEFINITION
// ========================================================
function init() {
    console.log("Initializing Shawty...");
    // Get UI Elements & Null Checks
    loadingScreen=document.getElementById('loadingScreen'); if(!loadingScreen){console.error("! 'loadingScreen'");return;}
    homeScreen=document.getElementById('homeScreen'); if(!homeScreen){console.error("! 'homeScreen'");return;}
    gameUI=document.getElementById('gameUI'); if(!gameUI){console.error("! 'gameUI'");return;}
    playerCountSpan=document.getElementById('playerCount'); if(!playerCountSpan){console.error("! 'playerCount'");return;}
    playerNameInput=document.getElementById('playerNameInput'); if(!playerNameInput){console.error("! 'playerNameInput'");return;}
    playerPhraseInput=document.getElementById('playerPhraseInput'); if(!playerPhraseInput){console.error("! 'playerPhraseInput'");return;}
    joinButton=document.getElementById('joinButton'); if(!joinButton){console.error("! 'joinButton'");return;}
    homeScreenError=document.getElementById('homeScreenError'); if(!homeScreenError){console.error("! 'homeScreenError'");return;}
    infoDiv=document.getElementById('info'); if(!infoDiv){console.error("! 'info'");return;}
    healthBarFill=document.getElementById('healthBarFill'); if(!healthBarFill){console.error("! 'healthBarFill'");return;}
    healthText=document.getElementById('healthText'); if(!healthText){console.error("! 'healthText'");return;}
    killMessageDiv=document.getElementById('killMessage'); if(!killMessageDiv){console.error("! 'killMessage'");return;}
    const canvas=document.getElementById('gameCanvas'); if(!canvas){console.error("! 'gameCanvas'");return;}
    console.log("All required UI elements found.");

    setGameState('loading'); // Start loading

    // Setup Three.js Core
    try {
        scene=new THREE.Scene(); scene.background=new THREE.Color(0x87ceeb); scene.fog=new THREE.Fog(0x87ceeb,0,150);
        camera=new THREE.PerspectiveCamera(75,window.innerWidth/window.innerHeight,0.1,1000);
        renderer=new THREE.WebGLRenderer({canvas:canvas,antialias:true}); renderer.setSize(window.innerWidth,window.innerHeight); renderer.shadowMap.enabled=true;
        clock=new THREE.Clock();
        console.log("Initializing THREE.GLTFLoader..."); loader=new THREE.GLTFLoader(); // <<< Init Loader
        console.log("Initializing THREE.DRACOLoader..."); dracoLoader=new THREE.DRACOLoader(); // <<< Init Draco
        dracoLoader.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/libs/draco/'); dracoLoader.setDecoderConfig({type:'js'}); loader.setDRACOLoader(dracoLoader);
        console.log("Three.js core initialized.");
    } catch (e) { console.error("CRITICAL ERROR Three.js init:", e); setGameState('loading',{message: "FATAL: Graphics Init Error!", error: true}); return; }

    // Lighting
    try { const ambL=new THREE.AmbientLight(0xffffff,0.6);scene.add(ambL);const dirL=new THREE.DirectionalLight(0xffffff,0.9);dirL.position.set(10,15,10);dirL.castShadow=true;dirL.shadow.mapSize.width=1024;dirL.shadow.mapSize.height=1024;scene.add(dirL); console.log("Lighting added."); } catch(e){ console.error("Lighting Error:", e); setGameState('loading',{message:"FATAL: Graphics Error (Light)!",error:true}); return; }

    // Controls
    try {
        controls=new THREE.PointerLockControls(camera,document.body); controls.addEventListener('lock',()=>{console.log('Pointer Locked');});
        controls.addEventListener('unlock',()=>{ console.log('Pointer Unlocked'); /* No automatic state change */ });
        console.log("PointerLockControls initialized.");
    } catch (e) { console.error("CRITICAL Controls Init Error:", e); setGameState('loading',{message: "FATAL: Controls Init Error!", error: true}); return; }

    // Start Loading Assets & Connecting
    console.log("Starting asset loads & socket..."); loadSound(); loadPlayerModel(); loadGunModel(); loadMap(MAP_PATH); setupSocketIO();

    // Add Event Listeners
    console.log("Adding event listeners..."); joinButton?.addEventListener('click',attemptJoinGame); window.addEventListener('resize',onWindowResize); document.addEventListener('keydown',onKeyDown); document.addEventListener('keyup',onKeyUp); document.addEventListener('mousedown',onMouseDown); console.log("Event listeners added.");

    // Start animation loop
    console.log("Starting animation loop."); animate();
}


// ========================================================
// --- START THE APPLICATION (Call init) ---
// ========================================================
if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', init); } else { init(); }
