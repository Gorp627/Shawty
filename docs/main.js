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
const BULLET_LIFETIME = 3000;
// Gun View Model Config - **ADJUST THESE**
const GUN_POS_OFFSET = new THREE.Vector3(0.4, -0.35, -0.7);
const GUN_SCALE = 0.1; // **ADJUST** e.g., 0.8, 1.0, 0.5, 1.2
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

    // Ensure UI elements refs are available
    loadingScreen = loadingScreen || document.getElementById('loadingScreen');
    homeScreen = homeScreen || document.getElementById('homeScreen');
    gameUI = gameUI || document.getElementById('gameUI');
    const canvas = document.getElementById('gameCanvas');

    if (gameState === newState && !(newState === 'loading' && options.error)) {
        // console.warn(`Already in state: ${newState}. Ignoring redundant call.`);
        return;
    }
    gameState = newState;

    // Ensure elements exist before manipulating style
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
                    // console.log("Join button re-enabled for homescreen."); // Reduce noise
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
            // console.log(">>> Setting state to PLAYING"); // Reduce noise
            const canvasElem = document.getElementById('gameCanvas');

            if(gameUI) {
                gameUI.style.display = 'block'; // Make UI container visible
                requestAnimationFrame(() => { gameUI.classList.add('visible'); }); // Fade in
                // console.log(">>> Game UI display set to block, visibility triggered.");
            } else { console.error(">>> gameUI element not found!"); }

            if(canvasElem) {
                 canvasElem.style.display = 'block';
                 // console.log(">>> Canvas display set to block.");
            } else { console.error(">>> gameCanvas element not found!"); }

            if (scene && controls) {
                if (!scene.getObjectByName("PlayerControls")) {
                    // console.log(">>> Adding player controls object to scene.");
                    controls.getObject().name = "PlayerControls";
                    scene.add(controls.getObject());
                } else {
                    // console.log(">>> Player controls object already in scene.");
                }
                 attachGunViewModel(); // Attach gun model to camera
                 // console.log(">>> Position Check - Camera:", camera?.position.toArray()); // Log array form
                 // console.log(">>> Position Check - Controls Object:", controls?.getObject()?.position.toArray()); // Log array form

                // console.log(">>> Attempting controls.lock()...");
                 // Use timeout to help ensure browser is ready for lock after state change/render
                 setTimeout(() => {
                      if(gameState === 'playing' && !controls.isLocked) {
                        //   console.log(">>> Executing delayed controls.lock()");
                          controls.lock();
                      }
                 }, 100); // 100ms delay
            } else { console.error(">>> Scene or Controls not ready when setting state to playing!");}

            onWindowResize(); // Ensure size is correct
            // console.log(">>> Game state set to PLAYING complete."); // Reduce noise
            break;
    }
    // console.log(`Switched state from ${previousState} to ${gameState}`); // Reduce noise
}


// --- Asset Loading ---
function loadSound() {
     try { gunshotSound = new Audio(SOUND_PATH_GUNSHOT); gunshotSound.volume = 0.4; gunshotSound.preload = 'auto'; gunshotSound.load(); console.log("Sound OK."); } catch(e){ console.error("Audio error:",e); gunshotSound = null; }
}

function loadPlayerModel() {
    playerModelLoadState = 'loading'; console.log(`Load P Model: ${PLAYER_MODEL_PATH}`);
    if (!loader) { console.error("! Loader missing"); return; }
    loader.load(PLAYER_MODEL_PATH,
    function(gltf){ // Success
        // console.log(">>> P Model SUCCESS");
        playerModel=gltf.scene; playerModel.traverse(function(c){if(c.isMesh)c.castShadow=true;}); playerModelLoadState='loaded'; checkAssetsReady();
    },
    undefined, // Progress
    function(error){ // Error
        console.error("!!! P Model ERR:",error); playerModelLoadState='error'; checkAssetsReady();
    });
}

function loadGunModel() {
    gunModelLoadState = 'loading'; console.log(`Load G Model: ${GUN_MODEL_PATH}`);
    if (!loader) { console.error("! Loader missing"); return; }
    loader.load(GUN_MODEL_PATH,
    function(gltf){ // Success
        // console.log(">>> G Model SUCCESS");
        gunModel=gltf.scene; gunModel.traverse(function(c){if(c.isMesh){c.castShadow=false; c.receiveShadow=false;}}); gunModelLoadState='loaded'; checkAssetsReady();
    },
    undefined, // Progress
    function(error){ // Error
        console.error("!!! G Model ERR:",error); gunModelLoadState='error'; checkAssetsReady();
    });
}

function loadMap(mapPath) {
    mapLoadState = 'loading'; console.log(`Load Map: ${mapPath}`);
    if (!loader) { console.error("! Loader missing"); return; }
    loader.load(mapPath,
    function(gltf){ // Success
        // console.log(">>> Map SUCCESS");
        mapMesh=gltf.scene; mapMesh.traverse(function(c){if(c.isMesh){c.castShadow=true; c.receiveShadow=true; c.userData.isCollidable=true;}});
        scene.add(mapMesh); mapLoadState='loaded'; checkAssetsReady();
    },
    undefined, // Progress
    function(error){ // Error
        console.error(`!!! Map ERR (${mapPath}):`,error); mapLoadState='error'; checkAssetsReady();
    });
}


function checkAssetsReady() {
    // console.log(`CheckR: M=${mapLoadState}, P=${playerModelLoadState}, G=${gunModelLoadState}`); // Reduce noise
    const mapR=mapLoadState==='loaded'||mapLoadState==='error';const pModelR=playerModelLoadState==='loaded'||playerModelLoadState==='error';const gModelR=gunModelLoadState==='loaded'||gunModelLoadState==='error';
    if(mapR && pModelR && gModelR){ // Check all three
        if(mapLoadState==='error'||playerModelLoadState==='error'||gunModelLoadState==='error'){ // Check if any failed
            assetsReady=false; console.error("Asset load failed.");
            setGameState('loading',{message:"FATAL: Asset Error!<br/>Check Console.",error:true});
        } else {
            assetsReady=true; console.log("Assets OK.");
            if(socket?.connected && gameState==='loading'){
                // console.log("Show homescreen (Assets+Socket ready).");
                setGameState('homescreen',{playerCount:playerCountSpan?.textContent??'?'});
            } else if(gameState==='joining'){
                 // console.log("Assets ready while joining.");
                 sendJoinDetails();
            }
        }
    } else { assetsReady=false; } // Still waiting
}

// --- Network & Joining ---
function setupSocketIO() {
    // console.log(`Connect: ${SERVER_URL}`); // Reduce noise
    socket=io(SERVER_URL,{transports:['websocket'],autoConnect:true});
    socket.on('connect', function(){ console.log('Socket connected! ID:',socket.id); checkAssetsReady(); });
    socket.on('disconnect', function(reason){ console.warn('Disconnected:',reason); setGameState('homescreen',{playerCount:0}); infoDiv.textContent='Disconnected'; for(const id in players)removePlayerMesh(id); players={}; bullets=[]; });
    socket.on('connect_error', function(err){ console.error('Connect Err:',err.message); mapLoadState='error'; playerModelLoadState='error'; gunModelLoadState = 'error'; assetsReady=false; setGameState('loading',{message:`Connect Fail!<br/>${err.message}`,error:true}); });
    socket.on('playerCountUpdate', function(count){ /* console.log("Player count:",count); */ playerCountSpan=playerCountSpan||document.getElementById('playerCount'); if(playerCountSpan)playerCountSpan.textContent=count; else console.warn("playerCountSpan missing"); if(assetsReady&&socket.connected&&gameState==='loading'){setGameState('homescreen',{playerCount:count});} });
    socket.on('initialize', function(data){ handleInitialize(data); });
    socket.on('playerJoined', function(d){handlePlayerJoined(d);});
    socket.on('playerLeft', function(id){handlePlayerLeft(id);});
    socket.on('playerMoved', function(d){updateRemotePlayerPosition(d);});
    socket.on('shotFired', function(d){spawnBullet(d);});
    socket.on('healthUpdate', function(d){handleHealthUpdate(d);});
    socket.on('playerDied', function(d){handlePlayerDied(d);});
    socket.on('playerRespawned', function(d){handlePlayerRespawned(d);});
}

function handleInitialize(data) {
     // console.log('Handling initialize data...'); // Reduce noise
     localPlayerId = data.id;
     for(const id in players)removePlayerMesh(id); players = {}; bullets = [];
     let iPosX=0,iPosY=0,iPosZ=0;
     for(const id in data.players){ const pD=data.players[id]; if(id===localPlayerId){ players[id]={...pD,name:localPlayerName,phrase:localPlayerPhrase,mesh:null}; iPosX=pD.x;iPosY=pD.y;iPosZ=pD.z; const visY=iPosY+PLAYER_HEIGHT; if(controls?.getObject()){controls.getObject().position.set(iPosX,visY,iPosZ);/* console.log(`Set controls pos: ${iPosX},${visY},${iPosZ}`);*/}else console.error("Controls missing!"); velocityY=0;isOnGround=true; updateHealthBar(pD.health); infoDiv.textContent=`Playing as ${localPlayerName}`; }else{addPlayer(pD);}}
     console.log("Game initialized players:",Object.keys(players).length); setGameState('playing');
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
    // console.log(`Add player ${playerData.id}`); // Reduce noise
    if(players[playerData.id]||playerData.id===localPlayerId)return;
    players[playerData.id]={...playerData,mesh:null,targetPosition:null,targetRotationY:null};
    if(playerModel&&playerModel!=='error'){ try{const dS=0.8;//<<< ADJUST SCALE const mI=playerModel.clone();mI.scale.set(dS,dS,dS);mI.traverse(function(c){if(c.isMesh)c.castShadow=true;}); const vY=playerData.y;mI.position.set(playerData.x,vY,playerData.z);mI.rotation.y=playerData.rotationY;scene.add(mI);players[playerData.id].mesh=mI;players[playerData.id].targetPosition=mI.position.clone();players[playerData.id].targetRotationY=mI.rotation.y;}catch(e){console.error(`Model error ${playerData.id}:`,e);addPlayerFallbackMesh(playerData);}}else{addPlayerFallbackMesh(playerData);}
}
function addPlayerFallbackMesh(playerData) {
    if(!players[playerData.id]||players[playerData.id].mesh)return; console.warn(`Fallback for ${playerData.id}`); try{ const geo=new THREE.CylinderGeometry(PLAYER_RADIUS,PLAYER_RADIUS,PLAYER_HEIGHT,8); const mat=new THREE.MeshStandardMaterial({color:0xff00ff}); const mesh=new THREE.Mesh(geo,mat); mesh.castShadow=true;const visY=playerData.y+(PLAYER_HEIGHT/2); mesh.position.set(playerData.x,visY,playerData.z); mesh.rotation.y=playerData.rotationY; scene.add(mesh); players[playerData.id].mesh=mesh; players[playerData.id].targetPosition=mesh.position.clone(); players[playerData.id].targetRotationY=mesh.rotation.y;}catch(e){console.error(`Fallback error ${playerData.id}:`,e);}
}
function removePlayerMesh(playerId) {
     if(players[playerId]?.mesh){ try{ scene.remove(players[playerId].mesh); if(players[playerId].mesh.geometry)players[playerId].mesh.geometry.dispose(); if(players[playerId].mesh.material){if(Array.isArray(players[playerId].mesh.material)){players[playerId].mesh.material.forEach(function(m){m.dispose();});}else{players[playerId].mesh.material.dispose();}} }catch(e){console.error(`Remove mesh err ${playerId}:`,e);} players[playerId].mesh=null; }
}
function updateRemotePlayerPosition(playerData) {
     if(playerData.id!==localPlayerId&&players[playerData.id]){ const p=players[playerData.id];let vY;if(p.mesh&&p.mesh.geometry instanceof THREE.CylinderGeometry){vY=playerData.y+(PLAYER_HEIGHT/2);}else{vY=playerData.y;}p.targetPosition=new THREE.Vector3(playerData.x,vY,playerData.z);p.targetRotationY=playerData.rotationY;p.x=playerData.x;p.y=playerData.y;p.z=playerData.z;p.rotationY=playerData.rotationY;p.name=playerData.name;p.phrase=playerData.phrase;}
}

// --- Game Logic Update Loop ---
function updatePlayer(deltaTime) {
    if(gameState!=='playing'||!controls?.isLocked||!localPlayerId||!players[localPlayerId])return; const o=controls.getObject(); const s=players[localPlayerId]; if(!s||s.health<=0)return;
    const sp=keys['ShiftLeft']?MOVEMENT_SPEED_SPRINTING:MOVEMENT_SPEED; const dS=sp*deltaTime; const pPos=o.position.clone();
    velocityY-=GRAVITY*deltaTime; o.position.y+=velocityY*deltaTime;
    if(keys['KeyW']){controls.moveForward(dS);} if(keys['KeyS']){controls.moveForward(-dS);} if(keys['KeyA']){controls.moveRight(-dS);} if(keys['KeyD']){controls.moveRight(dS);}
    const cPos=o.position; for(const id in players){if(id!==localPlayerId&&players[id].mesh&&players[id].mesh.visible){const oM=players[id].mesh; const dXZ=new THREE.Vector2(cPos.x-oM.position.x,cPos.z-oM.position.z).length(); if(dXZ<PLAYER_COLLISION_RADIUS*2){o.position.x=pPos.x; o.position.z=pPos.z; o.position.y=cPos.y; break;}}}
    let gY=0; if(o.position.y<gY+PLAYER_HEIGHT){o.position.y=gY+PLAYER_HEIGHT;if(velocityY<0)velocityY=0;isOnGround=true;}else{isOnGround=false;}
    if(o.position.y<VOID_Y_LEVEL&&s.health>0){console.log("Void death");socket.emit('fellIntoVoid');s.health=0;updateHealthBar(0);showKillMessage("You fell into the void.");}
    updateViewModel(deltaTime); // Update gun
    const lPos=o.position.clone(); lPos.y-=PLAYER_HEIGHT; const lS=players[localPlayerId]; const pc=lPos.distanceToSquared(new THREE.Vector3(lS?.x??0,lS?.y??0,lS?.z??0))>0.001; const cR=new THREE.Euler().setFromQuaternion(camera.quaternion,'YXZ'); const cRY=cR.y; const rc=Math.abs(cRY-(lS?.rotationY??0))>0.01;
    if(pc||rc){ if(lS){lS.x=lPos.x;lS.y=lPos.y;lS.z=lPos.z;lS.rotationY=cRY;} socket.emit('playerUpdate',{x:lPos.x,y:lPos.y,z:lPos.z,rotationY:cRY});}
}

// --- View Model Update (Recoil) ---
function updateViewModel(deltaTime) { if(!gunViewModel||!camera)return; currentRecoilOffset.lerp(new THREE.Vector3(0,0,0),deltaTime*RECOIL_RECOVER_SPEED); const fP=GUN_POS_OFFSET.clone().add(currentRecoilOffset); gunViewModel.position.copy(fP); gunViewModel.rotation.copy(camera.rotation); }
function attachGunViewModel() { if(!gunModel||gunModel==='error'||!camera)return; if(gunViewModel)return; gunViewModel=gunModel.clone(); gunViewModel.scale.set(GUN_SCALE,GUN_SCALE,GUN_SCALE); gunViewModel.position.copy(GUN_POS_OFFSET); camera.add(gunViewModel); console.log("Gun attached."); }
function removeGunViewModel() { if(gunViewModel&&camera){camera.remove(gunViewModel);gunViewModel=null;console.log("Gun removed.");} }

// --- Shoot, Bullet, Interpolation, UI, Event Handlers ---
function shoot() { if(gameState!=='playing'||!socket||!localPlayerId||!controls?.isLocked||!players[localPlayerId]||players[localPlayerId].health<=0)return; currentRecoilOffset.copy(RECOIL_AMOUNT); if(gunshotSound){try{gunshotSound.cloneNode().play().catch(function(e){/* console.warn("Sound fail:",e) */});}catch(e){console.error("Sound error:",e);}} const bP=new THREE.Vector3(),bD=new THREE.Vector3(); if(!camera)return; if(gunViewModel){const mO=new THREE.Vector3(0,-0.05,-0.5).applyQuaternion(camera.quaternion);bP.copy(camera.position).add(mO);}else{camera.getWorldPosition(bP);} camera.getWorldDirection(bD); socket.emit('shoot',{position:{x:bP.x,y:bP.y,z:bP.z},direction:{x:bD.x,y:bD.y,z:bD.z}});}
function spawnBullet(d) { /* console.log(`Spawning bullet ${d.bulletId}`); */ const g=new THREE.SphereGeometry(0.1,6,6);const m=new THREE.MeshBasicMaterial({color:0xffff00});const h=new THREE.Mesh(g,m); h.position.set(d.position.x,d.position.y,d.position.z); const v=new THREE.Vector3(d.direction.x,d.direction.y,d.direction.z).normalize().multiplyScalar(BULLET_SPEED); bullets.push({id:d.bulletId,mesh:h,velocity:v,ownerId:d.shooterId,spawnTime:Date.now()}); scene.add(h); }
function updateBullets(dT) { const rI=[]; for(let i=bullets.length-1;i>=0;i--){const b=bullets[i];if(!b?.mesh){if(!rI.includes(i))rI.push(i);continue;}b.mesh.position.addScaledVector(b.velocity,dT);let hit=false;for(const pId in players){if(pId!==b.ownerId&&players[pId].mesh&&players[pId].mesh.visible){const pM=players[pId].mesh; const pP=new THREE.Vector3();pM.getWorldPosition(pP);const dist=b.mesh.position.distanceTo(pP);const pSR=(pM.scale?.x||1)*PLAYER_RADIUS; const t=pSR+0.1; if(dist<t){hit=true;if(b.ownerId===localPlayerId){socket.emit('hit',{targetId:pId,damage:10});}if(!rI.includes(i))rI.push(i);scene.remove(b.mesh);break;}}}if(hit)continue; if(Date.now()-b.spawnTime>BULLET_LIFETIME){if(!rI.includes(i))rI.push(i);scene.remove(b.mesh);}} if(rI.length>0){ rI.sort((a,b)=>b-a); for(const idx of rI){ bullets.splice(idx,1); } } }
function updateOtherPlayers(dT) { for(const id in players){if(id!==localPlayerId&&players[id].mesh){const p=players[id],m=p.mesh;if(p.targetPosition&&p.targetRotationY!==undefined){m.position.lerp(p.targetPosition,dT*12);let aD=p.targetRotationY-m.rotation.y;while(aD<-Math.PI)aD+=Math.PI*2;while(aD>Math.PI)aD-=Math.PI*2;m.rotation.y+=aD*dT*12;}}}}
function updateHealthBar(h) { const hp=Math.max(0,Math.min(100,h)); if(healthBarFill&&healthText){const fW=`${hp}%`; const bP=`${100-hp}% 0%`; healthBarFill.style.width=fW; healthBarFill.style.backgroundPosition=bP; healthText.textContent=`${Math.round(hp)}%`;}}
function showKillMessage(m) { if(killMessageTimeout)clearTimeout(killMessageTimeout);if(killMessageDiv){killMessageDiv.textContent=m;killMessageDiv.classList.add('visible');killMessageTimeout=setTimeout(function(){killMessageDiv.classList.remove('visible');},KILL_MESSAGE_DURATION);}}
function handlePlayerJoined(pD) { if(pD.id!==localPlayerId&&!players[pD.id]){addPlayer(pD);}}
function handlePlayerLeft(pId) { removePlayerMesh(pId);delete players[pId];}
function handleHealthUpdate(d) { if(players[d.id]){players[d.id].health=d.health;if(d.id===localPlayerId){updateHealthBar(d.health);}}}
function handlePlayerDied(d) { if(players[d.targetId]){players[d.targetId].health=0;if(players[d.targetId].mesh)players[d.targetId].mesh.visible=false;}if(d.targetId===localPlayerId){updateHealthBar(0);const kN=d.killerName||'environment';const kP=d.killerPhrase||'...';let msg=`You just got ${kP} by ${kN}.`;if(!d.killerId)msg=`You died.`;showKillMessage(msg);infoDiv.textContent=`YOU DIED`;}}
function handlePlayerRespawned(pD) { if(!players[pD.id]&&pD.id!==localPlayerId){addPlayer(pD);}else if(players[pD.id]||pD.id===localPlayerId){const p=players[pD.id]||players[localPlayerId];p.health=pD.health;p.x=pD.x;p.y=pD.y;p.z=pD.z;p.rotationY=pD.rotationY;p.name=pD.name;p.phrase=pD.phrase; if(pD.id===localPlayerId){if(controls?.getObject())controls.getObject().position.set(p.x,p.y+PLAYER_HEIGHT,p.z);velocityY=0;isOnGround=true;updateHealthBar(p.health);infoDiv.textContent=`Playing as ${localPlayerName}`;showKillMessage("");killMessageDiv.classList.remove('visible');if(killMessageTimeout)clearTimeout(killMessageTimeout);}else{if(p.mesh){p.mesh.visible=true;let vY=p.mesh.geometry instanceof THREE.CylinderGeometry?p.y+(PLAYER_HEIGHT/2):p.y;p.mesh.position.set(p.x,vY,p.z);p.targetPosition=new THREE.Vector3(p.x,vY,p.z);p.targetRotationY=p.rotationY;}}}}

// --- Animation Loop ---
function animate() { requestAnimationFrame(animate); const dT=clock?clock.getDelta():0.016; /* if(frameCount++%300===0)console.log(`Animate running. State: ${gameState}`); */ if(gameState==='playing'){if(players[localPlayerId]){updatePlayer(dT);}updateBullets(dT);updateOtherPlayers(dT);} if(renderer&&scene&&camera){try{renderer.render(scene,camera);}catch(e){console.error("Render error:",e);}}}
// --- Utility Functions ---
function onWindowResize() { if(camera){camera.aspect=window.innerWidth/window.innerHeight;camera.updateProjectionMatrix();} if(renderer)renderer.setSize(window.innerWidth,window.innerHeight); }

// ========================================================
// INITIALIZATION FUNCTION DEFINITION
// ========================================================
function init() {
    console.log("Initializing Shawty...");
    // Get UI Elements & Null Checks
    loadingScreen=document.getElementById('loadingScreen'); if (!loadingScreen){console.error("! 'loadingScreen'");return;} homeScreen=document.getElementById('homeScreen'); if (!homeScreen){console.error("! 'homeScreen'");return;} gameUI=document.getElementById('gameUI'); if (!gameUI){console.error("! 'gameUI'");return;} playerCountSpan=document.getElementById('playerCount'); if (!playerCountSpan){console.error("! 'playerCount'");return;} playerNameInput=document.getElementById('playerNameInput'); if (!playerNameInput){console.error("! 'playerNameInput'");return;} playerPhraseInput=document.getElementById('playerPhraseInput'); if (!playerPhraseInput){console.error("! 'playerPhraseInput'");return;} joinButton=document.getElementById('joinButton'); if (!joinButton){console.error("! 'joinButton'");return;} homeScreenError=document.getElementById('homeScreenError'); if (!homeScreenError){console.error("! 'homeScreenError'");return;} infoDiv=document.getElementById('info'); if (!infoDiv){console.error("! 'info'");return;} healthBarFill=document.getElementById('healthBarFill'); if (!healthBarFill){console.error("! 'healthBarFill'");return;} healthText=document.getElementById('healthText'); if (!healthText){console.error("! 'healthText'");return;} killMessageDiv=document.getElementById('killMessage'); if (!killMessageDiv){console.error("! 'killMessage'");return;} const canvas=document.getElementById('gameCanvas'); if (!canvas){console.error("! 'gameCanvas'");return;} console.log("All required UI elements found.");

    setGameState('loading'); // Start loading

    // Setup Three.js Core
    try {
        scene=new THREE.Scene(); scene.background=new THREE.Color(0x87ceeb); scene.fog=new THREE.Fog(0x87ceeb,0,150);
        camera=new THREE.PerspectiveCamera(75,window.innerWidth/window.innerHeight,0.1,1000);
        renderer=new THREE.WebGLRenderer({canvas:canvas,antialias:true}); renderer.setSize(window.innerWidth,window.innerHeight); renderer.shadowMap.enabled=true;
        clock=new THREE.Clock();
        // Initialize loaders HERE
        console.log("Initializing THREE.GLTFLoader..."); loader=new THREE.GLTFLoader();
        console.log("Initializing THREE.DRACOLoader..."); dracoLoader=new THREE.DRACOLoader();
        dracoLoader.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/libs/draco/'); dracoLoader.setDecoderConfig({type:'js'}); loader.setDRACOLoader(dracoLoader);
        console.log("Three.js core initialized.");
    } catch (e) { console.error("CRITICAL Three.js init error:", e); setGameState('loading',{message: "FATAL: Graphics Init Error!", error: true}); return; }

    // Lighting
    try { const ambL=new THREE.AmbientLight(0xffffff,0.6);scene.add(ambL);const dirL=new THREE.DirectionalLight(0xffffff,0.9);dirL.position.set(10,15,10);dirL.castShadow=true;dirL.shadow.mapSize.width=1024;dirL.shadow.mapSize.height=1024;scene.add(dirL); /* console.log("Lighting added."); */ } catch(e){ console.error("Lighting Error:", e); setGameState('loading',{message:"FATAL: Graphics Error (Light)!",error:true}); return; }

    // Controls
    try {
        controls=new THREE.PointerLockControls(camera,document.body); controls.addEventListener('lock',function(){console.log('Pointer Locked');});
        controls.addEventListener('unlock',function(){console.log('Pointer Unlocked'); /* No state change */});
        console.log("PointerLockControls initialized.");
    } catch (e) { console.error("CRITICAL Controls Init Error:", e); setGameState('loading',{message: "FATAL: Controls Error!", error: true}); return; }

    // Start Loading Assets & Connecting
    console.log("Starting asset loads & socket..."); loadSound(); loadPlayerModel(); loadGunModel(); loadMap(MAP_PATH); setupSocketIO();

    // Add Event Listeners
    console.log("Adding listeners..."); joinButton?.addEventListener('click',attemptJoinGame); window.addEventListener('resize',onWindowResize); document.addEventListener('keydown',onKeyDown); document.addEventListener('keyup',onKeyUp); document.addEventListener('mousedown',onMouseDown); console.log("Listeners added.");

    // Start animation loop
    console.log("Starting animate loop."); animate();
}


// ========================================================
// --- START THE APPLICATION (Call init) ---
// ========================================================
if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', init); } else { init(); }
