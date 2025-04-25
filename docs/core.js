// docs/core.js

// ========================================================
// INITIALIZATION FUNCTION DEFINITION
// ========================================================
function init() {
    console.log("Init Shawty - Split Files + Gun Logic");
    // ... (Get UI Elements & Null Checks - SAME) ...
    getUIElements();
    const canvas = document.getElementById('gameCanvas');
    if (!loadingScreen || !homeScreen || !gameUI || !canvas || !joinButton /* etc */) { console.error("! Critical UI missing!"); return; }
    console.log("UI elements refs obtained.");

    setGameState('loading');

    // Setup Three.js Core
    try { /* ... Same ... */ } catch (e) { /* ... error handling ... */ return; }

    // Lighting
    try { /* ... Same ... */ } catch(e){ /* ... error handling ... */ return; }

    // Controls
    try { /* ... Same (with unlock listener doing nothing) ... */ } catch (e) { /* ... error handling ... */ return; }

    // Start Loading Assets & Connecting
    console.log("Start loads & socket...");
    if (typeof loadSound === 'function') loadSound(); else console.error("loadSound not defined!");
    // *** COMMENT OUT PLAYER MODEL LOAD CALL ***
    // if (typeof loadPlayerModel === 'function') loadPlayerModel(); else console.error("loadPlayerModel not defined!");
    console.log("--- Skipping loadPlayerModel call (testing) ---"); // Add log
    // ****************************************
    if (typeof loadGunModel === 'function') loadGunModel(); else console.error("loadGunModel not defined!");
    if (typeof loadMap === 'function') loadMap(MAP_PATH); else console.error("loadMap not defined!");
    if (typeof setupSocketIO === 'function') setupSocketIO(); else console.error("setupSocketIO not defined!");


    // Add Event Listeners
    // ... (Same listener setup) ...

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
if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', init); }
else { init(); }
console.log("core.js loaded");
