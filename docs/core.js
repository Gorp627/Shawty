// docs/core.js

// Needs access to MOST globals and functions defined in other files.

// ========================================================
// INITIALIZATION FUNCTION DEFINITION
// ========================================================
function init() {
    console.log("Init Shawty - Split Files + Gun Logic");

    // --- Get UI Elements & Null Checks AT START OF INIT ---
    loadingScreen=document.getElementById('loadingScreen'); if (!loadingScreen){console.error("! 'loadingScreen'");return;}
    homeScreen=document.getElementById('homeScreen'); if (!homeScreen){console.error("! 'homeScreen'");return;}
    gameUI=document.getElementById('gameUI'); if (!gameUI){console.error("! 'gameUI'");return;}
    playerCountSpan=document.getElementById('playerCount'); if (!playerCountSpan){console.error("! 'playerCount'");return;}
    playerNameInput=document.getElementById('playerNameInput'); if (!playerNameInput){console.error("! 'playerNameInput'");return;}
    playerPhraseInput=document.getElementById('playerPhraseInput'); if (!playerPhraseInput){console.error("! 'playerPhraseInput'");return;}
    joinButton=document.getElementById('joinButton'); if (!joinButton){console.error("! 'joinButton'");return;}
    homeScreenError=document.getElementById('homeScreenError'); if (!homeScreenError){console.error("! 'homeScreenError'");return;}
    infoDiv=document.getElementById('info'); if (!infoDiv){console.error("! 'info'");return;}
    healthBarFill=document.getElementById('healthBarFill'); if (!healthBarFill){console.error("! 'healthBarFill'");return;}
    healthText=document.getElementById('healthText'); if (!healthText){console.error("! 'healthText'");return;}
    killMessageDiv=document.getElementById('killMessage'); if (!killMessageDiv){console.error("! 'killMessage'");return;}
    const canvas=document.getElementById('gameCanvas'); if (!canvas){console.error("! 'gameCanvas'");return;}
    console.log("All required UI elements found.");
    // --- End UI Element Grab ---

    // Now safe to set initial state
    setGameState('loading');

    // Setup Three.js Core
    try {
        scene=new THREE.Scene(); scene.background=new THREE.Color(0x87ceeb); scene.fog=new THREE.Fog(0x87ceeb,0,150);
        camera=new THREE.PerspectiveCamera(75,window.innerWidth/window.innerHeight,0.1,1000);
        renderer=new THREE.WebGLRenderer({canvas:canvas,antialias:true}); // Use canvas ref
        renderer.setSize(window.innerWidth,window.innerHeight); renderer.shadowMap.enabled=true;
        clock=new THREE.Clock();
        // Loaders should be initialized globally in config.js
        if (!loader || !dracoLoader) { throw new Error("Loaders not initialized!"); }
        console.log("Three.js core initialized.");
    } catch (e) { console.error("3js Init Error:", e); setGameState('loading',{message:"Graphics Error!",error:true}); return; }

    // Lighting
    try { const ambL=new THREE.AmbientLight(0xffffff,0.6);scene.add(ambL);const dirL=new THREE.DirectionalLight(0xffffff,0.9);dirL.position.set(10,15,10);dirL.castShadow=true;scene.add(dirL); } catch(e){ console.error("Lighting Error:", e); setGameState('loading',{message:"Graphics Error(Light)!",error:true}); return; }

    // Controls
    try {
        controls=new THREE.PointerLockControls(camera,document.body);
        controls.addEventListener('lock',function(){console.log('Locked');});
        controls.addEventListener('unlock',function(){ console.log('Unlocked'); /* No automatic state change */ });
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
    // joinButton ref is guaranteed IF we passed the checks above
    if (typeof attemptJoinGame === 'function') { joinButton.addEventListener('click',attemptJoinGame); } else { console.error("attemptJoinGame missing!"); }
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
    // if (frameCount++ % 300 === 0) { console.log(`Animate running. State: ${gameState}`); }

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
function onMouseDown(event) { if (gameState === 'playing' && !controls?.isLocked) { controls?.lock(); } else if (gameState === 'playing' && controls?.isLocked && event.button === 0) { if(typeof shoot === 'function') shoot(); } }

// --- View Model Functions ---
function attachGunViewModel() { /* ... Same ... */ }
function removeGunViewModel() { /* ... Same ... */ }

// ========================================================
// --- START THE APPLICATION ---
// ========================================================
if (document.readyState === 'loading') { console.log("DOM Loading..."); document.addEventListener('DOMContentLoaded', init); }
else { console.log("DOM Ready."); init(); }
console.log("core.js loaded");
