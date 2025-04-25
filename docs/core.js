// docs/core.js

// Needs access to MOST globals and functions defined in other files.

// ========================================================
// INITIALIZATION FUNCTION DEFINITION
// ========================================================
function init() {
    console.log("Init Shawty - Split Files + Gun Logic");
    // Get UI Elements & Null Checks
    // ... (Same null checks) ...
    loadingScreen=document.getElementById('loadingScreen'); if(!loadingScreen)return; homeScreen=document.getElementById('homeScreen'); if(!homeScreen)return; gameUI=document.getElementById('gameUI'); if(!gameUI)return; playerCountSpan=document.getElementById('playerCount'); if(!playerCountSpan)return; playerNameInput=document.getElementById('playerNameInput'); if(!playerNameInput)return; playerPhraseInput=document.getElementById('playerPhraseInput'); if(!playerPhraseInput)return; joinButton=document.getElementById('joinButton'); if(!joinButton)return; homeScreenError=document.getElementById('homeScreenError'); if(!homeScreenError)return; infoDiv=document.getElementById('info'); if(!infoDiv)return; healthBarFill=document.getElementById('healthBarFill'); if(!healthBarFill)return; healthText=document.getElementById('healthText'); if(!healthText)return; killMessageDiv=document.getElementById('killMessage'); if(!killMessageDiv)return; const canvas=document.getElementById('gameCanvas'); if(!canvas)return;
    console.log("UI elements found.");

    setGameState('loading');

    // Setup Three.js Core
    try { /* ... Same ... */ } catch (e) { /* ... error handling ... */ return; }

    // Lighting
    try { /* ... Same ... */ } catch(e){ /* ... error handling ... */ return; }

    // Controls
    try {
        controls=new THREE.PointerLockControls(camera,document.body);
        controls.addEventListener('lock',function(){console.log('Pointer Locked');});
        // --- REVISED UNLOCK LISTENER (Does Nothing) ---
        controls.addEventListener('unlock',function(){
            console.log('Pointer Unlocked (Escape pressed or focus lost)');
            // Intentionally do NOT change game state here.
            // Player must click canvas to re-lock (handled by onMouseDown).
        });
        // -------------------------------------------
        console.log("Controls initialized.");
    } catch (e) { console.error("CRITICAL Controls Init Error:", e); setGameState('loading',{message:"Controls Error!",error:true}); return; }

    // Start Loading Assets & Connecting
    console.log("Start loads & socket...");
    if (typeof loadSound === 'function') loadSound(); else console.error("loadSound not defined!");
    if (typeof loadPlayerModel === 'function') loadPlayerModel(); else console.error("loadPlayerModel not defined!");
    if (typeof loadGunModel === 'function') loadGunModel(); else console.error("loadGunModel not defined!");
    if (typeof loadMap === 'function') loadMap(MAP_PATH); else console.error("loadMap not defined!");
    if (typeof setupSocketIO === 'function') setupSocketIO(); else console.error("setupSocketIO not defined!");

    // Add Event Listeners
    console.log("Add listeners...");
    if (joinButton && typeof attemptJoinGame === 'function') { joinButton.addEventListener('click',attemptJoinGame); } else { console.error("Join button/function missing!"); }
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

// --- Input Handlers (Defined in core.js) ---
function onKeyDown(event) { /* ... Same ... */ }
function onKeyUp(event) { /* ... Same ... */ }
function onMouseDown(event) { /* ... Same ... */ } // Already handles re-locking on click

// --- View Model Functions (Defined in core.js) ---
function attachGunViewModel() { /* ... Same ... */ }
function removeGunViewModel() { /* ... Same ... */ }

// ========================================================
// --- START THE APPLICATION ---
// ========================================================
if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', init); } else { init(); }
console.log("core.js loaded");
