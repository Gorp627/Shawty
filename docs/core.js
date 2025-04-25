// docs/core.js

// ========================================================
// INITIALIZATION FUNCTION DEFINITION
// ========================================================
function init() {
    console.log("Init Shawty - Split Files + Gun Logic");
    // Get UI Elements & Null Checks
    getUIElements();
    const canvas = document.getElementById('gameCanvas');
    if (!loadingScreen || !homeScreen || !gameUI || !canvas /* etc */ ) { console.error("! Critical UI missing!"); return; }
    console.log("UI elements refs obtained.");

    setGameState('loading');

    // Setup Three.js Core
    try { /* ... Same ... */ } catch (e) { /* ... error handling ... */ return; }

    // Lighting
    try { /* ... Same ... */ } catch(e){ /* ... error handling ... */ return; }

    // Controls
    try { /* ... Same ... */ } catch (e) { /* ... error handling ... */ return; }

    // Start Loading Assets & Connecting
    console.log("Start loads & socket...");
    if (typeof loadSound === 'function') loadSound(); else console.error("loadSound not defined!");
    if (typeof loadPlayerModel === 'function') loadPlayerModel(); else console.error("loadPlayerModel not defined!");
    if (typeof loadGunModel === 'function') loadGunModel(); else console.error("loadGunModel not defined!");
    if (typeof loadMap === 'function') loadMap(MAP_PATH); else console.error("loadMap not defined!");

    // *** ADD LOGS AROUND setupSocketIO CALL ***
    console.log("...About to call setupSocketIO...");
    if (typeof setupSocketIO === 'function') {
        setupSocketIO();
    } else {
        console.error("setupSocketIO not defined!");
    }
    console.log("...Called setupSocketIO...");
    // ****************************************

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
