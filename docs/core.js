// docs/core.js

// Needs access to MOST globals and functions defined in other files.

// ========================================================
// INITIALIZATION FUNCTION DEFINITION
// ========================================================
function init() {
    console.log("Init Shawty - Split Files + Gun Logic");
    // Get UI Elements FIRST
    // Ensure getUIElements is defined (likely in ui.js) and called
    if (typeof getUIElements === 'function') {
        getUIElements();
    } else {
        console.error("getUIElements function not found! Cannot get UI references.");
        // Attempt manual gets as fallback
        loadingScreen = document.getElementById('loadingScreen');
        homeScreen = document.getElementById('homeScreen');
        gameUI = document.getElementById('gameUI');
        playerCountSpan = document.getElementById('playerCount');
        playerNameInput = document.getElementById('playerNameInput');
        playerPhraseInput = document.getElementById('playerPhraseInput');
        joinButton = document.getElementById('joinButton');
        homeScreenError = document.getElementById('homeScreenError');
        infoDiv = document.getElementById('info');
        healthBarFill = document.getElementById('healthBarFill');
        healthText = document.getElementById('healthText');
        killMessageDiv = document.getElementById('killMessage');
    }

    const canvas = document.getElementById('gameCanvas');

    // Null check critical elements
    if (!loadingScreen || !homeScreen || !gameUI || !canvas || !joinButton ) {
         console.error("Critical UI element missing after get attempts!");
         // Display error on body if loading screen itself is missing
         document.body.innerHTML = '<p style="color:red; font-size: 2em; text-align:center; padding-top: 40vh;">FATAL: Critical UI Element Missing!</p>';
         return; // Stop init
    }
    console.log("UI elements refs obtained/checked.");

    setGameState('loading'); // Start loading

    // Setup Three.js Core
    try {
        scene=new THREE.Scene(); scene.background=new THREE.Color(0x87ceeb); scene.fog=new THREE.Fog(0x87ceeb,0,150);
        camera=new THREE.PerspectiveCamera(75,window.innerWidth/window.innerHeight,0.1,1000);
        renderer=new THREE.WebGLRenderer({canvas:canvas,antialias:true}); // Use canvas variable
        renderer.setSize(window.innerWidth,window.innerHeight); renderer.shadowMap.enabled=true;
        clock=new THREE.Clock();
        // Loaders should be initialized in config.js
        if (!loader || !dracoLoader) {
            throw new Error("Loaders not initialized globally in config.js!");
        }
        // Ensure Draco is associated (should happen in config.js now, but double check)
        // loader.setDRACOLoader(dracoLoader); // This line is now in config.js
        console.log("Three.js core initialized.");
    } catch (e) { console.error("3js Init Error:", e); setGameState('loading',{message:"Graphics Error!",error:true}); return; }

    // Lighting
    try { const ambL=new THREE.AmbientLight(0xffffff,0.6);scene.add(ambL);const dirL=new THREE.DirectionalLight(0xffffff,0.9);dirL.position.set(10,15,10);dirL.castShadow=true;scene.add(dirL); } catch(e){ console.error("Lighting Error:", e); setGameState('loading',{message:"Graphics Error(Light)!",error:true}); return; }

    // Controls
    try {
        controls=new THREE.PointerLockControls(camera,document.body);
        controls.addEventListener('lock',function(){console.log('Pointer Locked');});
        // REVISED UNLOCK LISTENER - DOES NOTHING AUTOMATICALLY
        controls.addEventListener('unlock',function(){
            console.log('Pointer Unlocked (Escape pressed or focus lost)');
            // Player must click canvas to re-lock (handled by onMouseDown).
        });
        console.log("Controls initialized.");
    } catch (e) { console.error("Controls Init Error:", e); setGameState('loading',{message:"Controls Error!",error:true}); return; }

    // Start Loading Assets & Connecting
    console.log("Start loads & socket...");
    if (typeof loadSound === 'function') loadSound(); else console.error("loadSound not defined!");
    if (typeof loadPlayerModel === 'function') loadPlayerModel(); else console.error("loadPlayerModel not defined!");
    if (typeof loadGunModel === 'function') loadGunModel(); else console.error("loadGunModel not defined!"); // Load Gun
    if (typeof loadMap === 'function') loadMap(MAP_PATH); else console.error("loadMap not defined!");
    if (typeof setupSocketIO === 'function') setupSocketIO(); else console.error("setupSocketIO not defined!");


    // Add Event Listeners
    console.log("Add listeners...");
    if (joinButton && typeof attemptJoinGame === 'function') { joinButton.addEventListener('click',attemptJoinGame); } else { console.error("Join button/function missing!"); }
    window.addEventListener('resize',onWindowResize); // Utility function defined below
    document.addEventListener('keydown',onKeyDown); // Handler defined below
    document.addEventListener('keyup',onKeyUp);     // Handler defined below
    document.addEventListener('mousedown',onMouseDown); // Handler defined below
    console.log("Listeners added.");

    // Start loop
    console.log("Start animate.");
    animate(); // Defined below
}

// --- Animation Loop ---
function animate() {
    requestAnimationFrame(animate);
    const dT = clock ? clock.getDelta() : 0.016; // Get delta time
    // Throttled log to check if loop is running
    if (frameCount++ % 300 === 0) { console.log(`Animate running. State: ${gameState}`); }

    if (gameState === 'playing') {
        // Ensure functions from other modules are available before calling
        if (typeof updatePlayer === 'function' && players[localPlayerId]) { updatePlayer(dT); }
        if (typeof updateBullets === 'function') { updateBullets(dT); }
        if (typeof updateOtherPlayers === 'function') { updateOtherPlayers(dT); }
    }
    if (renderer && scene && camera) { // Ensure Three.js components exist
        try { renderer.render(scene, camera); } catch (e) { console.error("Render error:", e); }
    }
}

// --- Utility Functions ---
function onWindowResize() { if(camera){camera.aspect=window.innerWidth/window.innerHeight;camera.updateProjectionMatrix();} if(renderer)renderer.setSize(window.innerWidth,window.innerHeight); }

// --- Input Handlers (Defined in core.js) ---
function onKeyDown(event) { keys[event.code] = true; if (event.code === 'Space') { event.preventDefault(); if (isOnGround && gameState === 'playing') { velocityY = JUMP_FORCE; isOnGround = false; } } }
function onKeyUp(event) { keys[event.code] = false; }
// Revised onMouseDown to handle re-locking
function onMouseDown(event) {
    if (gameState === 'playing' && !controls?.isLocked) {
        console.log("Click detect while unlocked, locking...");
        controls?.lock(); // Attempt re-lock
    } else if (gameState === 'playing' && controls?.isLocked && event.button === 0) {
        if(typeof shoot === 'function') shoot(); else console.error("shoot func missing!"); // Shoot if locked
    }
}

// --- View Model Functions (Defined in core.js - need access to camera, gunModel etc.) ---
function attachGunViewModel() {
    // Check prerequisites
    if (!gunModel || gunModel === 'error' || !camera) {
         console.warn("Cannot attach gun: Model template or camera not ready/failed.");
         return;
    }
    // Prevent double-adding
    if (gunViewModel && gunViewModel.parent === camera) {
        // console.log("Gun already attached."); // Reduce noise
        return;
    }
    // Remove old one if it exists but isn't attached (shouldn't happen often)
    if (gunViewModel) removeGunViewModel();

    try { // Add try-catch for safety
        gunViewModel = gunModel.clone(); // Clone the loaded gun model scene
        gunViewModel.scale.set(GUN_SCALE, GUN_SCALE, GUN_SCALE); // Apply scale from config
        gunViewModel.position.copy(GUN_POS_OFFSET); // Apply offset from config
        currentRecoilOffset.set(0,0,0); // Reset recoil state

        // Add any necessary initial rotation based on how the gun model was exported
        // Example: gunViewModel.rotation.y = Math.PI; // Rotate 180 degrees

        camera.add(gunViewModel); // Make the gun model a child of the camera
        console.log("Gun view model attached to camera.");
    } catch (e) {
        console.error("Error attaching gun view model:", e);
        gunViewModel = null; // Ensure it's null if attaching failed
    }
}
function removeGunViewModel() {
    if (gunViewModel && camera) { // Check both exist
        try { // Add try-catch
            camera.remove(gunViewModel); // Remove from camera parent
            // Dispose? Only if not reusing template materials/geo extensively via clone
            gunViewModel = null; // Clear reference
            console.log("Gun view model removed.");
        } catch (e) {
            console.error("Error removing gun view model:", e);
            gunViewModel = null; // Ensure it's null on error too
        }
    }
}


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
