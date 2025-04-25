// docs/main.js - Baseline Version

// --- Configuration ---
const SERVER_URL = 'https://gametest-psxl.onrender.com';
const MAP_PATH = 'assets/maps/map.glb';
const SOUND_PATH_GUNSHOT = 'assets/maps/gunshot.wav'; // Your path

const PLAYER_HEIGHT = 1.8;
const PLAYER_RADIUS = 0.4;
const MOVEMENT_SPEED = 5.0;
const MOVEMENT_SPEED_SPRINTING = 8.0;
const BULLET_SPEED = 50;
const GRAVITY = 19.62;
const JUMP_FORCE = 8.0;
const VOID_Y_LEVEL = -20;
const PLAYER_COLLISION_RADIUS = PLAYER_RADIUS;
const KILL_MESSAGE_DURATION = 4000;
const BULLET_LIFETIME = 3000;

// --- Global Variables ---
let socket;
let localPlayerId = null;
let players = {};
let bullets = [];
let keys = {};
let scene, camera, renderer, controls, clock, loader, dracoLoader;
let mapMesh = null;
let velocityY = 0;
let isOnGround = false;
let infoDiv, healthBarFill, healthText, killMessageDiv; // UI Elements
let killMessageTimeout = null;
let gunshotSound;

// ========================================================
// FUNCTION DEFINITIONS
// ========================================================

function onKeyDown(event) {
    keys[event.code] = true;
    if (event.code === 'Space') {
        event.preventDefault();
        if (isOnGround) { // Can only jump if on ground
            velocityY = JUMP_FORCE;
            isOnGround = false;
        }
    }
}

function onKeyUp(event) { keys[event.code] = false; }

function onMouseDown(event) { if (controls?.isLocked && event.button === 0) { shoot(); } }

function setupSocketIO() {
    console.log(`Connecting to: ${SERVER_URL}`);
    socket=io(SERVER_URL,{transports:['websocket']}); // Simple connection
    socket.on('connect',function(){console.log('Socket connected:',socket.id); infoDiv.textContent='Connected';});
    socket.on('disconnect',function(reason){console.warn('Disconnected:',reason); infoDiv.textContent='Disconnected'; for(const id in players)removePlayerMesh(id); players={}; bullets=[];});
    socket.on('connect_error',function(err){console.error('Connect Err:',err.message); infoDiv.textContent=`Connect Fail: ${err.message}`;});
    socket.on('initialize',function(data){handleInitialize(data);}); // Use separate handler
    socket.on('playerJoined',function(d){handlePlayerJoined(d);});
    socket.on('playerLeft',function(id){handlePlayerLeft(id);});
    socket.on('playerMoved',function(d){updateRemotePlayerPosition(d);});
    socket.on('shotFired',function(d){spawnBullet(d);});
    socket.on('healthUpdate',function(d){handleHealthUpdate(d);});
    socket.on('playerDied',function(d){handlePlayerDied(d);});
    socket.on('playerRespawned',function(d){handlePlayerRespawned(d);});
}

function handleInitialize(data) {
    console.log('Handling initialize data...'); localPlayerId = data.id;
    for(const id in players)removePlayerMesh(id); players = {}; bullets = [];
    for(const id in data.players){ const pD=data.players[id]; if(id===localPlayerId){ players[id]={...pD, mesh:null}; const visY=pD.y+PLAYER_HEIGHT; if(controls?.getObject()){controls.getObject().position.set(pD.x,visY,pD.z);} velocityY=0;isOnGround=true; updateHealthBar(pD.health); infoDiv.textContent=`Playing`; }else{addPlayer(pD);}}
    console.log("Initialized players:",Object.keys(players).length);
}

function addPlayer(playerData) { // Uses CYLINDER for baseline
    console.log(`Adding player ${playerData.id}`); if(players[playerData.id]||playerData.id===localPlayerId)return;
    players[playerData.id]={...playerData,mesh:null,targetPosition:null,targetRotationY:null};
    try{ const geo=new THREE.CylinderGeometry(PLAYER_RADIUS,PLAYER_RADIUS,PLAYER_HEIGHT,8); const mat=new THREE.MeshStandardMaterial({color:0x00ff00}); const mesh=new THREE.Mesh(geo,mat); mesh.castShadow=true;const visY=playerData.y+(PLAYER_HEIGHT/2); mesh.position.set(playerData.x,visY,playerData.z); mesh.rotation.y=playerData.rotationY; scene.add(mesh); players[playerData.id].mesh=mesh; players[playerData.id].targetPosition=mesh.position.clone(); players[playerData.id].targetRotationY=mesh.rotation.y;}catch(e){console.error(`Fallback mesh error ${playerData.id}:`,e);}
}
function removePlayerMesh(playerId) { if(players[playerId]?.mesh){ try{ scene.remove(players[playerId].mesh); if(players[playerId].mesh.geometry)players[playerId].mesh.geometry.dispose(); if(players[playerId].mesh.material){if(Array.isArray(players[playerId].mesh.material)){players[playerId].mesh.material.forEach(function(m){m.dispose();});}else{players[playerId].mesh.material.dispose();}} }catch(e){} players[playerId].mesh=null; } }
function updateRemotePlayerPosition(pD) { if(pD.id!==localPlayerId&&players[pD.id]){ const p=players[pD.id];let visY;if(p.mesh&&p.mesh.geometry instanceof THREE.CylinderGeometry){visY=pD.y+(PLAYER_HEIGHT/2);}else{visY=pD.y;}p.targetPosition=new THREE.Vector3(pD.x,visY,pD.z);p.targetRotationY=pD.rotationY;p.x=pD.x;p.y=pD.y;p.z=pD.z;p.rotationY=pD.rotationY; /* name/phrase update removed */}}

function loadMap(mapPath) { console.log(`Load Map: ${mapPath}`); if(!loader)return; loader.load(mapPath,function(gltf){ mapMesh=gltf.scene;mapMesh.traverse(function(c){if(c.isMesh){c.castShadow=true; c.receiveShadow=true; c.userData.isCollidable=true;}});scene.add(mapMesh);console.log("Map OK");},undefined,function(err){console.error(`Map ERR (${mapPath}):`,err);});}
function loadSound() { try{gunshotSound=new Audio(SOUND_PATH_GUNSHOT);gunshotSound.volume=0.4;gunshotSound.preload='auto';gunshotSound.load();}catch(e){console.error("Audio err:",e);gunshotSound=null;}}

function updatePlayer(deltaTime) {
    if(!controls?.isLocked||!localPlayerId||!players[localPlayerId])return; const o=controls.getObject(); const s=players[localPlayerId]; if(!s||s.health<=0)return;
    const spd=keys['ShiftLeft']?MOVEMENT_SPEED_SPRINTING:MOVEMENT_SPEED; const moveSpeed=spd*deltaTime; const pPos=o.position.clone();
    velocityY-=GRAVITY*deltaTime; o.position.y+=velocityY*deltaTime;
    if(keys['KeyW']){controls.moveForward(moveSpeed);} if(keys['KeyS']){controls.moveForward(-moveSpeed);} if(keys['KeyA']){controls.moveRight(-moveSpeed);} if(keys['KeyD']){controls.moveRight(moveSpeed);}
    const cPos=o.position; for(const id in players){if(id!==localPlayerId&&players[id].mesh&&players[id].mesh.visible){const oM=players[id].mesh; const dXZ=new THREE.Vector2(cPos.x-oM.position.x,cPos.z-oM.position.z).length(); if(dXZ<PLAYER_COLLISION_RADIUS*2){o.position.x=pPos.x; o.position.z=pPos.z; o.position.y=cPos.y; break;}}}
    let gY=0; if(o.position.y<gY+PLAYER_HEIGHT){o.position.y=gY+PLAYER_HEIGHT;if(velocityY<0)velocityY=0;isOnGround=true;}else{isOnGround=false;}
    if(o.position.y<VOID_Y_LEVEL&&s.health>0){socket.emit('fellIntoVoid');s.health=0;updateHealthBar(0);showKillMessage("You fell into the void.");}
    const lPos=o.position.clone(); lPos.y-=PLAYER_HEIGHT; const lS=players[localPlayerId]; const pc=lPos.distanceToSquared(new THREE.Vector3(lS?.x??0,lS?.y??0,lS?.z??0))>0.001; const cR=new THREE.Euler().setFromQuaternion(camera.quaternion,'YXZ'); const cRY=cR.y; const rc=Math.abs(cRY-(lS?.rotationY??0))>0.01;
    if(pc||rc){ if(lS){lS.x=lPos.x;lS.y=lPos.y;lS.z=lPos.z;lS.rotationY=cRY;} socket.emit('playerUpdate',{x:lPos.x,y:lPos.y,z:lPos.z,rotationY:cRY});}
}

function shoot() {
    if(!socket||!localPlayerId||!controls?.isLocked||!players[localPlayerId]||players[localPlayerId].health<=0)return;
    if(gunshotSound){try{gunshotSound.cloneNode().play().catch(function(e){});}catch(e){}}
    const bP=new THREE.Vector3(),bD=new THREE.Vector3(); if(!camera)return;
    camera.getWorldPosition(bP); camera.getWorldDirection(bD);
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
function handlePlayerDied(d) { if(players[d.targetId]){players[d.targetId].health=0;if(players[d.targetId].mesh)players[d.targetId].mesh.visible=false;}if(d.targetId===localPlayerId){updateHealthBar(0);const kN=d.killerName||'environment';const kP=d.killerPhrase||'...';let msg=`You just got ${kP} by ${kN}.`;if(!d.killerId)msg=`You died.`;showKillMessage(msg);infoDiv.textContent=`YOU DIED`;}} // Catchphrase logic removed for baseline
function handlePlayerRespawned(pD) { if(!players[pD.id]&&pD.id!==localPlayerId){addPlayer(pD);}else if(players[pD.id]||pD.id===localPlayerId){const p=players[pD.id]||players[pD.id];p.health=pD.health;p.x=pD.x;p.y=pD.y;p.z=pD.z;p.rotationY=pD.rotationY; /* name/phrase removed */ if(pD.id===localPlayerId){if(controls?.getObject())controls.getObject().position.set(p.x,p.y+PLAYER_HEIGHT,p.z);velocityY=0;isOnGround=true;updateHealthBar(p.health);infoDiv.textContent=`Playing`;showKillMessage("");killMessageDiv.classList.remove('visible');if(killMessageTimeout)clearTimeout(killMessageTimeout);}else{if(p.mesh){p.mesh.visible=true;let vY=p.mesh.geometry instanceof THREE.CylinderGeometry?p.y+(PLAYER_HEIGHT/2):p.y;p.mesh.position.set(p.x,vY,p.z);p.targetPosition=new THREE.Vector3(p.x,vY,p.z);p.targetRotationY=p.rotationY;}}}}

function animate() { requestAnimationFrame(animate); const dT=clock?clock.getDelta():0.016; if(players[localPlayerId]){updatePlayer(dT);} updateBullets(dT); updateOtherPlayers(dT); if(renderer&&scene&&camera){try{renderer.render(scene,camera);}catch(e){console.error("Render error:",e);}}}
function onWindowResize() { if(camera){camera.aspect=window.innerWidth/window.innerHeight;camera.updateProjectionMatrix();} if(renderer)renderer.setSize(window.innerWidth,window.innerHeight); }

// ========================================================
// INITIALIZATION FUNCTION
// ========================================================
function init() {
    console.log("Initializing Baseline Shawty...");
    // Get UI Elements
    infoDiv=document.getElementById('info'); if (!infoDiv){console.error("! 'info'");return;}
    healthBarFill=document.getElementById('healthBarFill'); if (!healthBarFill){console.error("! 'healthBarFill'");return;}
    healthText=document.getElementById('healthText'); if (!healthText){console.error("! 'healthText'");return;}
    killMessageDiv=document.getElementById('killMessage'); if (!killMessageDiv){console.error("! 'killMessage'");return;}
    const canvas=document.getElementById('gameCanvas'); if (!canvas){console.error("! 'gameCanvas'");return;}
    console.log("Baseline UI elements found.");

    // Setup Three.js
    try {
        scene=new THREE.Scene(); scene.background=new THREE.Color(0x87ceeb); scene.fog=new THREE.Fog(0x87ceeb,0,150);
        camera=new THREE.PerspectiveCamera(75,window.innerWidth/window.innerHeight,0.1,1000);
        renderer=new THREE.WebGLRenderer({canvas:canvas,antialias:true}); renderer.setSize(window.innerWidth,window.innerHeight); renderer.shadowMap.enabled=true;
        clock=new THREE.Clock();
        loader=new THREE.GLTFLoader(); dracoLoader=new THREE.DRACOLoader();
        dracoLoader.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/libs/draco/'); dracoLoader.setDecoderConfig({type:'js'}); loader.setDRACOLoader(dracoLoader);
        console.log("Three.js core initialized.");
    } catch (e) { console.error("CRITICAL Three.js init error:", e); infoDiv.textContent = "Graphics Error!"; return; }

    // Lighting
    try { const ambL=new THREE.AmbientLight(0xffffff,0.6);scene.add(ambL);const dirL=new THREE.DirectionalLight(0xffffff,0.9);dirL.position.set(10,15,10);dirL.castShadow=true;scene.add(dirL); } catch(e){ console.error("Lighting Error:", e); }

    // Controls
    try {
        controls=new THREE.PointerLockControls(camera,document.body);
        // Simple lock on canvas click
        canvas.addEventListener('click', function() { controls.lock(); });
        controls.addEventListener('lock',function(){console.log('Pointer Locked');});
        controls.addEventListener('unlock',function(){console.log('Pointer Unlocked');});
        scene.add(controls.getObject()); // Add controls object directly
        console.log("PointerLockControls initialized.");
    } catch (e) { console.error("CRITICAL Controls Init Error:", e); infoDiv.textContent = "Controls Error!"; return; }

    // Load Assets & Connect
    console.log("Starting asset loads & socket...");
    loadSound();
    loadMap(MAP_PATH); // Only map needed for baseline visual
    setupSocketIO(); // Connect

    // Add Event Listeners
    console.log("Adding listeners...");
    window.addEventListener('resize',onWindowResize);
    document.addEventListener('keydown',onKeyDown);
    document.addEventListener('keyup',onKeyUp);
    document.addEventListener('mousedown',onMouseDown);
    console.log("Listeners added.");

    // Start animation loop
    console.log("Starting animate loop.");
    animate();
}

// ========================================================
// --- START THE APPLICATION ---
// ========================================================
if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', init); } else { init(); }
