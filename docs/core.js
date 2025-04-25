// docs/core.js

// ========================================================
// INITIALIZATION FUNCTION DEFINITION
// ========================================================
function init() {
    console.log("Init Shawty - Split Files + Gun Logic");
    // Get UI Elements FIRST
    if (typeof getUIElements === 'function') { getUIElements(); } else { console.error("getUIElements func missing!"); return; }
    const canvas = document.getElementById('gameCanvas');
    if (!loadingScreen || !homeScreen || !gameUI || !canvas || !joinButton /* etc */ ) { console.error("! Critical UI missing!"); return; }
    console.log("UI elements refs obtained.");

    setGameState('loading');

    // Setup Three.js Core
    try {
        scene=new THREE.Scene(); scene.background=new THREE.Color(0x87ceeb); scene.fog=new THREE.Fog(0x87ceeb,0,150);
        camera=new THREE.PerspectiveCamera(75,window.innerWidth/window.innerHeight,0.1,1000);
        renderer=new THREE.WebGLRenderer({canvas:canvas,antialias:true});
        renderer.setSize(window.innerWidth,window.innerHeight); renderer.shadowMap.enabled=true;
        clock=new THREE.Clock();
        // Loaders should be initialized globally in config.js
        if (!loader || !dracoLoader) { throw new Error("Loaders not initialized!"); }
        console.log("Three.js core initialized. Draco ENABLED.");
    } catch (e) { console.error("3js Init Error:", e); setGameState('loading',{message:"Graphics Error!",error:true}); return; }

    // Lighting
    try { const ambL=new THREE.AmbientLight(0xffffff,0.6);scene.add(ambL);const dirL=new THREE.DirectionalLight(0xffffff,0.9);dirL.position.set(10,15,10);dirL.castShadow=true;scene.add(dirL); } catch(e){ console.error("Lighting Error:", e); setGameState('loading',{message:"Graphics Error(Light)!",error:true}); return; }

    // Controls
    try {
        controls=new THREE.PointerLockControls(camera,document.body);
        controls.addEventListener('lock',function(){console.log('Pointer Locked');});
        // CORRECTED UNLOCK LISTENER - DOES NOTHING AUTOMATICALLY
        controls.addEventListener('unlock',function(){ console.log('Pointer Unlocked'); });
        console.log("Controls initialized.");
    } catch (e) { console.error("Controls Init Error:", e); setGameState('loading',{message:"Controls Error!",error:true}); return; }

    // Start Loading Assets & Connecting
    console.log("Start loads & socket...");
    if(typeof loadSound === 'function')loadSound(); else console.error("loadSound missing!");
    if(typeof loadPlayerModel === 'function')loadPlayerModel(); else console.error("loadPlayerModel missing!");
    if(typeof loadGunModel === 'function')loadGunModel(); else console.error("loadGunModel missing!");
    if(typeof loadMap === 'function')loadMap(MAP_PATH); else console.error("loadMap missing!");
    if(typeof setupSocketIO === 'function')setupSocketIO(); else console.error("setupSocketIO missing!");


    // Add Event Listeners
    console.log("Add listeners...");
    joinButton = joinButton || document.getElementById('joinButton');
    if (joinButton && typeof attemptJoinGame === 'function') { joinButton.addEventListener('click',attemptJoinGame); } else { console.error("Join button/func missing!"); }
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

    // *** ADDED THROTTLED CAMERA POSITION LOG ***
    if (frameCount++ % 120 === 0) { // Log approx every 2 seconds
        console.log(`Animate State: ${gameState}, Cam Pos: ${camera?.position?.toArray()?.map(n=>n.toFixed(2))?.join(',')}`);
    }
    // ***************************************

    if (gameState === 'playing') {
        if (typeof updatePlayer === 'function' && players[localPlayerId]) { updatePlayer(dT); }
        if (typeof updateBullets === 'function') { updateBullets(dT); }
        if (typeof updateOtherPlayers === 'function') { updateOtherPlayers(dT); }
    }
    if (renderer && scene && camera) { try { renderer.render(scene, camera); } catch (e) { console.error("Render error:", e); } }
}

// --- Utility Functions ---
function onWindowResize() { if(camera){camera.aspect=window.innerWidth/window.innerHeight;camera.updateProjectionMatrix();} if(renderer)renderer.setSize(window.innerWidth,window.innerHeight); }

// --- Input Handlers ---
function onKeyDown(event) { keys[event.code] = true; if (event.code === 'Space') { event.preventDefault(); if (isOnGround && gameState === 'playing') { velocityY = JUMP_FORCE; isOnGround = false; } } }
function onKeyUp(event) { keys[event.code] = false; }
function onMouseDown(event) { if (gameState === 'playing' && !controls?.isLocked) { console.log("Click detect while unlocked, locking..."); controls?.lock(); } else if (gameState === 'playing' && controls?.isLocked && event.button === 0) { if(typeof shoot === 'function') shoot(); } }

// --- View Model Functions ---
function attachGunViewModel() { /* ... Same ... */ }
function removeGunViewModel() { /* ... Same ... */ }


// ========================================================
// --- START THE APPLICATION ---
// ========================================================
if (document.readyState === 'loading') { console.log("DOM Loading..."); document.addEventListener('DOMContentLoaded', init); }
else { console.log("DOM Ready."); init(); }
console.log("core.js loaded");
