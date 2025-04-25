// docs/core.js

// Needs access to MOST globals and functions defined in other files.

// ========================================================
// INITIALIZATION FUNCTION DEFINITION
// ========================================================
function init() {
    console.log("Init Shawty - Split Files");
    // Get UI Elements (make sure ui.js is loaded first or call getUIElements())
    getUIElements(); // Call function from ui.js
    if (!loadingScreen || !homeScreen || !gameUI || !canvas ) { // Basic check
         console.error("Critical UI element missing after getUIElements()!");
         return;
    }
    console.log("UI elements refs obtained.");

    setGameState('loading'); // Start loading

    // Setup Three.js Core
    try {
        scene=new THREE.Scene(); scene.background=new THREE.Color(0x87ceeb); scene.fog=new THREE.Fog(0x87ceeb,0,150);
        camera=new THREE.PerspectiveCamera(75,window.innerWidth/window.innerHeight,0.1,1000);
        renderer=new THREE.WebGLRenderer({canvas:document.getElementById('gameCanvas'),antialias:true}); // Use ID directly here
        renderer.setSize(window.innerWidth,window.innerHeight); renderer.shadowMap.enabled=true;
        clock=new THREE.Clock(); loader=new THREE.GLTFLoader(); dracoLoader=new THREE.DRACOLoader();
        dracoLoader.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/libs/draco/'); dracoLoader.setDecoderConfig({type:'js'});
        // loader.setDRACOLoader(dracoLoader); // Draco disabled for test
        console.log("Three.js core initialized.");
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
    loadSound(); loadPlayerModel(); loadMap(MAP_PATH); setupSocketIO(); // Functions from other files

    // Add Event Listeners
    console.log("Add listeners...");
    joinButton?.addEventListener('click',attemptJoinGame); // Function from network.js
    window.addEventListener('resize',onWindowResize); // Utility function
    document.addEventListener('keydown',onKeyDown); // Handler defined here
    document.addEventListener('keyup',onKeyUp); // Handler defined here
    document.addEventListener('mousedown',onMouseDown); // Handler defined here
    console.log("Listeners added.");

    // Start loop
    console.log("Start animate.");
    animate(); // Defined here
}

// --- Animation Loop ---
function animate() {
    requestAnimationFrame(animate);
    const dT = clock ? clock.getDelta() : 0.016;
    // Only run throttled log here for less noise
    // if (frameCount++ % 300 === 0) { console.log(`Animate running. State: ${gameState}`); }

    if (gameState === 'playing') {
        if (players[localPlayerId]) { updatePlayer(dT); } // From gameLogic.js
        updateBullets(dT); // From gameLogic.js
        updateOtherPlayers(dT); // From player.js
    }
    if (renderer && scene && camera) {
        try { renderer.render(scene, camera); } catch (e) { console.error("Render error:", e); }
    }
}

// --- Utility Functions ---
function onWindowResize() { if(camera){camera.aspect=window.innerWidth/window.innerHeight;camera.updateProjectionMatrix();} if(renderer)renderer.setSize(window.innerWidth,window.innerHeight); }

// Input Handlers defined here as they directly modify global 'keys'
function onKeyDown(event) { keys[event.code] = true; if (event.code === 'Space') { event.preventDefault(); if (isOnGround && gameState === 'playing') { velocityY = JUMP_FORCE; isOnGround = false; } } }
function onKeyUp(event) { keys[event.code] = false; }
function onMouseDown(event) { if (gameState === 'playing' && !controls?.isLocked) { controls?.lock(); } else if (gameState === 'playing' && controls?.isLocked && event.button === 0) { if(typeof shoot === 'function') shoot(); } } // Calls shoot from gameLogic.js


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
