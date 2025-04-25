// docs/core.js

// Needs access to MOST globals and functions defined in other files.

// ========================================================
// INITIALIZATION FUNCTION DEFINITION
// ========================================================
function init() {
    console.log("Init Shawty - Split Files");
    // Get UI Elements FIRST
    getUIElements(); // Call function from ui.js
    // NOW get canvas AFTER calling getUIElements OR just get it directly here
    const canvas = document.getElementById('gameCanvas'); // <<< GET CANVAS HERE

    // Null check elements needed by THIS function
    if (!loadingScreen || !homeScreen || !gameUI || !canvas ) {
         console.error("Critical UI element missing!");
         if (loadingScreen) {
              loadingScreen.style.display = 'flex';
              const p = loadingScreen.querySelector('p');
              if (p) p.innerHTML = "FATAL: UI Init Error!"; p.style.color = 'red';
         }
         return; // Stop init
    }
    console.log("UI elements refs obtained.");

    setGameState('loading'); // Start loading

    // Setup Three.js Core
    try {
        scene=new THREE.Scene(); scene.background=new THREE.Color(0x87ceeb); scene.fog=new THREE.Fog(0x87ceeb,0,150);
        camera=new THREE.PerspectiveCamera(75,window.innerWidth/window.innerHeight,0.1,1000);
        renderer=new THREE.WebGLRenderer({canvas:canvas,antialias:true}); // Use canvas variable
        renderer.setSize(window.innerWidth,window.innerHeight); renderer.shadowMap.enabled=true;
        clock=new THREE.Clock();
        loader=new THREE.GLTFLoader();
        dracoLoader=new THREE.DRACOLoader();
        dracoLoader.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/libs/draco/');
        dracoLoader.setDecoderConfig({type:'js'});
        loader.setDRACOLoader(dracoLoader); // Draco is enabled
        console.log("Three.js core initialized. Draco ENABLED.");
    } catch (e) { console.error("3js Init Error:", e); setGameState('loading',{message:"Graphics Error!",error:true}); return; }

    // Lighting
    try { const ambL=new THREE.AmbientLight(0xffffff,0.6);scene.add(ambL);const dirL=new THREE.DirectionalLight(0xffffff,0.9);dirL.position.set(10,15,10);dirL.castShadow=true;scene.add(dirL); } catch(e){ console.error("Lighting Error:", e); setGameState('loading',{message:"Graphics Error(Light)!",error:true}); return; }

    // Controls
    try {
        controls=new THREE.PointerLockControls(camera,document.body);
        controls.addEventListener('lock',function(){console.log('Locked');});
        // Revised unlock listener - DOES NOT CHANGE STATE automatically
        controls.addEventListener('unlock',function(){
            console.log('Unlocked');
            // Player must click canvas to re-lock (handled by onMouseDown)
        });
        console.log("Controls initialized.");
    } catch (e) { console.error("Controls Init Error:", e); setGameState('loading',{message:"Controls Error!",error:true}); return; }

    // Start Loading Assets & Connecting
    console.log("Start loads & socket...");
    // Ensure functions are defined before calling
    if (typeof loadSound === 'function') loadSound(); else console.error("loadSound not defined!");
    if (typeof loadPlayerModel === 'function') loadPlayerModel(); else console.error("loadPlayerModel not defined!");
    if (typeof loadGunModel === 'function') loadGunModel(); else console.error("loadGunModel not defined!"); // Still loading gun
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
    animate(); // Defined below
}

// --- Animation Loop ---
function animate() {
    requestAnimationFrame(animate);
    const dT = clock ? clock.getDelta() : 0.016; // Use clock if available

    // *** ADDED THROTTLED CAMERA POSITION LOG ***
    if (frameCount++ % 120 === 0) { // Log approx every 2 seconds
        console.log(`Animate State: ${gameState}, Cam Pos: ${camera?.position?.toArray()?.map(n=>n.toFixed(2))?.join(',')}`);
    }
    // ***************************************

    if (gameState === 'playing') {
        // Ensure functions from other modules are available
        if (typeof updatePlayer === 'function' && players[localPlayerId]) { updatePlayer(dT); }
        if (typeof updateBullets === 'function') { updateBullets(dT); }
        if (typeof updateOtherPlayers === 'function') { updateOtherPlayers(dT); }
    }
    if (renderer && scene && camera) {
        try { renderer.render(scene, camera); } catch (e) { console.error("Render error:", e); }
    }
}

// --- Utility Functions ---
function onWindowResize() { if(camera){camera.aspect=window.innerWidth/window.innerHeight;camera.updateProjectionMatrix();} if(renderer)renderer.setSize(window.innerWidth,window.innerHeight); }

// Input Handlers (Defined here as they access global 'keys' and call 'shoot')
function onKeyDown(event) { keys[event.code] = true; if (event.code === 'Space') { event.preventDefault(); if (isOnGround && gameState === 'playing') { velocityY = JUMP_FORCE; isOnGround = false; } } }
function onKeyUp(event) { keys[event.code] = false; }
// Revised onMouseDown to handle re-locking
function onMouseDown(event) { if (gameState === 'playing' && !controls?.isLocked) { console.log("Click detect while unlocked, locking..."); controls?.lock(); } else if (gameState === 'playing' && controls?.isLocked && event.button === 0) { if(typeof shoot === 'function') shoot(); } }


// --- View Model Functions (Defined in core.js) ---
function attachGunViewModel() { /* ... Same as previous ... */ }
function removeGunViewModel() { /* ... Same as previous ... */ }


// ========================================================
// --- START THE APPLICATION ---
// ========================================================
if (document.readyState === 'loading') {
     console.log("DOM Loading... waiting for DOMContentLoaded");
     document.addEventListener('DOMContentLoaded', init);
} else {
     console.log("DOM Ready, calling init directly.");
     init();
}

 console.log("core.js loaded");
