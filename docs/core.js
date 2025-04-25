// docs/core.js

// Needs access to MOST globals and functions defined in other files.

// ========================================================
// INITIALIZATION FUNCTION DEFINITION
// ========================================================
function init() {
    // ADDED A VERY EARLY LOG TO BE SURE
    console.log("--- Entering init() function ---");

    // Get UI Elements FIRST
    // Ensure getUIElements exists and is called
    if (typeof getUIElements === 'function') {
        getUIElements();
    } else {
        console.error("getUIElements function not found! Attempting manual gets.");
        // Fallback gets just in case ui.js didn't load right
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
    if (!loadingScreen || !homeScreen || !gameUI || !canvas || !joinButton || !playerNameInput /* etc... check others if needed */) {
         console.error("! Critical UI element missing! Aborting init.");
         // Attempt to display error on loading screen if possible
         if (loadingScreen && loadingScreen.style) {
              loadingScreen.style.display = 'flex';
              const p = loadingScreen.querySelector('p');
              if (p) p.innerHTML = "FATAL: UI Init Error!"; p.style.color = 'red';
         }
         return;
    }
    console.log("UI elements refs obtained.");

    setGameState('loading');

    // Setup Three.js Core
    try {
        scene=new THREE.Scene(); scene.background=new THREE.Color(0x87ceeb); scene.fog=new THREE.Fog(0x87ceeb,0,150);
        camera=new THREE.PerspectiveCamera(75,window.innerWidth/window.innerHeight,0.1,1000);
        renderer=new THREE.WebGLRenderer({canvas:canvas,antialias:true});
        renderer.setSize(window.innerWidth,window.innerHeight); renderer.shadowMap.enabled=true;
        clock=new THREE.Clock();
        if (!loader || !dracoLoader) { throw new Error("Loaders not initialized globally!"); }
        console.log("Three.js core initialized.");
    } catch (e) { console.error("3js Init Error:", e); setGameState('loading',{message:"Graphics Error!",error:true}); return; }

    // Lighting
    try { const ambL=new THREE.AmbientLight(0xffffff,0.6);scene.add(ambL);const dirL=new THREE.DirectionalLight(0xffffff,0.9);dirL.position.set(10,15,10);dirL.castShadow=true;scene.add(dirL); } catch(e){ console.error("Lighting Error:", e); setGameState('loading',{message:"Graphics Error(Light)!",error:true}); return; }

    // Controls
    try {
        controls=new THREE.PointerLockControls(camera,document.body);
        controls.addEventListener('lock',function(){console.log('Locked');});
        controls.addEventListener('unlock',function(){ console.log('Unlocked'); /* No state change */ });
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
function animate() { /* ... Same ... */ }

// --- Utility Functions ---
function onWindowResize() { /* ... Same ... */ }

// --- Input Handlers ---
function onKeyDown(event) { /* ... Same ... */ }
function onKeyUp(event) { /* ... Same ... */ }
function onMouseDown(event) { /* ... Same ... */ }

// --- View Model Functions ---
function attachGunViewModel() { /* ... Same ... */ }
function removeGunViewModel() { /* ... Same ... */ }


// ========================================================
// --- START THE APPLICATION ---
// ========================================================
// REMOVED DOMContentLoaded listener - call init directly
console.log("core.js: Attempting to call init() directly...");
try {
    init(); // <<< CALL INIT DIRECTLY
    console.log("core.js: init() finished.");
} catch(e) {
    console.error("!!! CRITICAL ERROR CALLING INIT !!!", e);
    // Display error fallback if possible
    const loadingScreenFallback = document.getElementById('loadingScreen');
    if (loadingScreenFallback) {
         loadingScreenFallback.style.display = 'flex';
         loadingScreenFallback.innerHTML = `<p style="color:red; font-size: 1.2em;">FATAL SCRIPT ERROR DURING INIT!<br>Check Console (F12)</p>`;
    }
}

console.log("core.js loaded and executed.");
