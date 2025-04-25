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
         // Attempt to display error on loading screen if possible
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
        // Use the canvas variable obtained above
        renderer=new THREE.WebGLRenderer({canvas:canvas,antialias:true}); // <<< USE CANVAS VARIABLE
        renderer.setSize(window.innerWidth,window.innerHeight); renderer.shadowMap.enabled=true;
        clock=new THREE.Clock(); loader=new THREE.GLTFLoader(); dracoLoader=new THREE.DRACOLoader();
        dracoLoader.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/libs/draco/'); dracoLoader.setDecoderConfig({type:'js'});
        // loader.setDRACOLoader(dracoLoader); // Keep Draco disabled for now
        console.log("Three.js core initialized.");
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

    // Start Loading Assets & Connecting
    console.log("Start loads & socket...");
    // These should be defined in assets.js / network.js now
    if (typeof loadSound === 'function') loadSound(); else console.error("loadSound not defined!");
    if (typeof loadPlayerModel === 'function') loadPlayerModel(); else console.error("loadPlayerModel not defined!");
    if (typeof loadMap === 'function') loadMap(MAP_PATH); else console.error("loadMap not defined!");
    if (typeof setupSocketIO === 'function') setupSocketIO(); else console.error("setupSocketIO not defined!");


    // Add Event Listeners
    console.log("Add listeners...");
    // Ensure joinButton exists before adding listener
    joinButton = joinButton || document.getElementById('joinButton');
    if (joinButton && typeof attemptJoinGame === 'function') {
        joinButton.addEventListener('click',attemptJoinGame); // Function from network.js
    } else {
        console.error("Join button or attemptJoinGame function not found/ready!");
    }
    window.addEventListener('resize',onWindowResize); // Utility function defined below
    document.addEventListener('keydown',onKeyDown); // Handler defined below
    document.addEventListener('keyup',onKeyUp); // Handler defined below
    document.addEventListener('mousedown',onMouseDown); // Handler defined below
    console.log("Listeners added.");

    // Start loop
    console.log("Start animate.");
    animate(); // Defined below
}

// --- Animation Loop ---
function animate() {
    requestAnimationFrame(animate);
    const dT = clock ? clock.getDelta() : 0.016;
    // if (frameCount++ % 300 === 0) { console.log(`Animate running. State: ${gameState}`); } // Throttled log

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

// Input Handlers (Defined here as they access global 'keys')
function onKeyDown(event) { keys[event.code] = true; if (event.code === 'Space') { event.preventDefault(); if (isOnGround && gameState === 'playing') { velocityY = JUMP_FORCE; isOnGround = false; } } }
function onKeyUp(event) { keys[event.code] = false; }
function onMouseDown(event) { if (gameState === 'playing' && !controls?.isLocked) { controls?.lock(); } else if (gameState === 'playing' && controls?.isLocked && event.button === 0) { if(typeof shoot === 'function') shoot(); } }


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
