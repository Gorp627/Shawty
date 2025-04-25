// docs/core.js

// ========================================================
// INITIALIZATION FUNCTION DEFINITION
// ========================================================
function init() {
    console.log("Init Shawty - Split Files + Gun Logic");
    getUIElements();
    const canvas = document.getElementById('gameCanvas');
    if (!loadingScreen || !homeScreen || !gameUI || !canvas /* etc */ ) { console.error("! Critical UI missing!"); return; }
    console.log("UI elements refs obtained.");

    setGameState('loading');

    // Setup Three.js Core
    try {
        scene=new THREE.Scene(); scene.background=new THREE.Color(0x87ceeb); scene.fog=new THREE.Fog(0x87ceeb,0,150);
        camera=new THREE.PerspectiveCamera(75,window.innerWidth/window.innerHeight,0.1,1000);
        renderer=new THREE.WebGLRenderer({canvas:canvas,antialias:true});
        renderer.setSize(window.innerWidth,window.innerHeight); renderer.shadowMap.enabled=true;
        clock=new THREE.Clock();

        // *** INITIALIZE LOADERS HERE ***
        console.log("core.js: Initializing Loaders...");
        loader = new THREE.GLTFLoader();
        dracoLoader = new THREE.DRACOLoader();
        dracoLoader.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/libs/draco/');
        dracoLoader.setDecoderConfig({ type: 'js' });
        loader.setDRACOLoader(dracoLoader); // Associate them
        console.log("core.js: Loaders Initialized.");
        // ******************************

        console.log("Three.js core scene/cam/renderer initialized.");
    } catch (e) { console.error("3js Init Error:", e); setGameState('loading',{message:"Graphics Error!",error:true}); return; }

    // Lighting
    try { /* ... Same ... */ } catch(e){ /* ... error handling ... */ return; }

    // Controls
    try { /* ... Same ... */ } catch (e) { /* ... error handling ... */ return; }

    // Start Loading Assets & Connecting
    console.log("Start loads & socket...");
    // *** PASS INITIALIZED LOADER TO LOADING FUNCTIONS ***
    if (typeof loadSound === 'function') loadSound(); else console.error("loadSound not defined!");
    if (typeof loadPlayerModel === 'function') loadPlayerModel(loader); else console.error("loadPlayerModel not defined!");
    if (typeof loadGunModel === 'function') loadGunModel(loader); else console.error("loadGunModel not defined!");
    if (typeof loadMap === 'function') loadMap(MAP_PATH, loader); else console.error("loadMap not defined!");
    if (typeof setupSocketIO === 'function') setupSocketIO(); else console.error("setupSocketIO not defined!");
    // **************************************************

    // Add Event Listeners
    console.log("Add listeners...");
    /* ... Same listener setup ... */
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
if (document.readyState === 'loading') { console.log("DOM Loading..."); document.addEventListener('DOMContentLoaded', init); }
else { console.log("DOM Ready."); init(); }
console.log("core.js loaded");
