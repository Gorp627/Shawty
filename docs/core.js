// docs/core.js

// ========================================================
// INITIALIZATION FUNCTION DEFINITION
// ========================================================
function init() {
    console.log("Init Shawty - Split Files + Gun Logic");
    getUIElements();
    const canvas = document.getElementById('gameCanvas');
    if (!loadingScreen || !homeScreen || !gameUI || !canvas ) { console.error("! Critical UI missing!"); return; }
    console.log("UI elements refs obtained.");

    setGameState('loading');

    // Setup Three.js Core
    try {
        scene=new THREE.Scene(); scene.background=new THREE.Color(0x87ceeb); scene.fog=new THREE.Fog(0x87ceeb,0,150);
        camera=new THREE.PerspectiveCamera(75,window.innerWidth/window.innerHeight,0.1,1000);
        renderer=new THREE.WebGLRenderer({canvas:canvas,antialias:true}); renderer.setSize(window.innerWidth,window.innerHeight); renderer.shadowMap.enabled=true;
        clock=new THREE.Clock(); loader=new THREE.GLTFLoader(); dracoLoader=new THREE.DRACOLoader();
        dracoLoader.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/libs/draco/'); dracoLoader.setDecoderConfig({type:'js'});
        loader.setDRACOLoader(dracoLoader); // Assuming assets ARE Draco compressed now
        console.log("Three.js core initialized. Draco ENABLED.");
    } catch (e) { console.error("3js Init Error:", e); setGameState('loading',{message:"Graphics Error!",error:true}); return; }

    // Lighting
    try { const ambL=new THREE.AmbientLight(0xffffff,0.6);scene.add(ambL);const dirL=new THREE.DirectionalLight(0xffffff,0.9);dirL.position.set(10,15,10);dirL.castShadow=true;scene.add(dirL); } catch(e){ console.error("Lighting Error:", e); setGameState('loading',{message:"Graphics Error(Light)!",error:true}); return; }

    // Controls
    try {
        controls=new THREE.PointerLockControls(camera,document.body);
        controls.addEventListener('lock',function(){console.log('Locked');});
        controls.addEventListener('unlock',function(){console.log('Unlocked'); if(gameState==='playing')setGameState('homescreen',{playerCount:playerCountSpan?.textContent??'?'}); });
        console.log("Controls initialized.");
    } catch (e) { console.error("Controls Init Error:", e); setGameState('loading',{message:"Controls Error!",error:true}); return; }

    // Start Loading Assets & Connecting
    console.log("Start loads & socket...");
    // Ensure functions are defined before calling
    if (typeof loadSound === 'function') loadSound(); else console.error("loadSound not defined!");
    if (typeof loadPlayerModel === 'function') loadPlayerModel(); else console.error("loadPlayerModel not defined!");
    if (typeof loadGunModel === 'function') loadGunModel(); else console.error("loadGunModel not defined!"); // <<< CALL GUN LOAD
    if (typeof loadMap === 'function') loadMap(MAP_PATH); else console.error("loadMap not defined!");
    if (typeof setupSocketIO === 'function') setupSocketIO(); else console.error("setupSocketIO not defined!");

    // Add Event Listeners
    console.log("Add listeners...");
    joinButton = joinButton || document.getElementById('joinButton');
    if (joinButton && typeof attemptJoinGame === 'function') { joinButton.addEventListener('click',attemptJoinGame); } else { console.error("Join button/function missing!"); }
    window.addEventListener('resize',onWindowResize);
    document.addEventListener('keydown',onKeyDown);
    document.addEventListener('keyup',onKeyUp);
    document.addEventListener('mousedown',onMouseDown);
    console.log("Listeners added.");

    // Start loop
    console.log("Start animate.");
    animate();
}

// --- Animation Loop ---
function animate() {
    requestAnimationFrame(animate);
    const dT = clock ? clock.getDelta() : 0.016;
    if (gameState === 'playing') {
        if (typeof updatePlayer === 'function' && players[localPlayerId]) { updatePlayer(dT); } // Calls updateViewModel internally
        if (typeof updateBullets === 'function') { updateBullets(dT); }
        if (typeof updateOtherPlayers === 'function') { updateOtherPlayers(dT); }
    }
    if (renderer && scene && camera) { try { renderer.render(scene, camera); } catch (e) { console.error("Render error:", e); } }
}

// --- Utility Functions ---
function onWindowResize() { if(camera){camera.aspect=window.innerWidth/window.innerHeight;camera.updateProjectionMatrix();} if(renderer)renderer.setSize(window.innerWidth,window.innerHeight); }

// Input Handlers defined in core.js
function onKeyDown(event) { keys[event.code] = true; if (event.code === 'Space') { event.preventDefault(); if (isOnGround && gameState === 'playing') { velocityY = JUMP_FORCE; isOnGround = false; } } }
function onKeyUp(event) { keys[event.code] = false; }
function onMouseDown(event) { if (gameState === 'playing' && !controls?.isLocked) { controls?.lock(); } else if (gameState === 'playing' && controls?.isLocked && event.button === 0) { if(typeof shoot === 'function') shoot(); else console.error("shoot func missing!"); } }

// --- View Model Functions defined in core.js (Need access to camera, gunModel, GUN_SCALE etc) ---
function attachGunViewModel() {
    if (!gunModel || gunModel === 'error' || !camera) { console.warn("Cannot attach gun: Model/camera not ready or failed."); return; }
    if (gunViewModel && gunViewModel.parent === camera) return; // Already attached
    gunViewModel = gunModel.clone();
    gunViewModel.scale.set(GUN_SCALE, GUN_SCALE, GUN_SCALE);
    gunViewModel.position.copy(GUN_POS_OFFSET);
    // Reset recoil on attach
    currentRecoilOffset.set(0,0,0);
    // Add an initial rotation if the model isn't facing forward in Blender export
    // gunViewModel.rotation.y = Math.PI; // Example: Rotate 180 deg
    camera.add(gunViewModel); // Make gun child of camera
    console.log("Gun view model attached.");
}
function removeGunViewModel() {
    if (gunViewModel && camera) {
        camera.remove(gunViewModel); // Remove from camera parent
        gunViewModel = null; // Clear reference
        console.log("Gun view model removed.");
    }
}


// ========================================================
// --- START THE APPLICATION ---
// ========================================================
if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', init); } else { init(); }
console.log("core.js loaded");
