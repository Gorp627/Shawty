// docs/game.js - Main Game Orchestrator

class Game {
    constructor() {
        // ... (Assign properties: scene, camera, etc.) ... Same
        this.scene = null; this.camera = null; this.renderer = null; this.controls = null; this.clock = null;
        this.players = players; this.bullets = bullets; this.keys = keys;
        this.frameCount = 0; this.debugLogFrequency = 180;
        console.log("[Game] Instance created.");
    }

    start() {
        console.log("[Game] Starting...");
        if (!this.initializeCoreComponents() || !this.initializeManagers()) { return; } // Stop if essentials fail

        // *** Bind LoadManager Listener BEFORE starting load ***
        if (typeof loadManager !== 'undefined') {
            loadManager.on('ready', () => {
                 console.log("[Game] LoadManager 'ready' event received."); // Add log
                if(Network.isConnected()) { // Use Network.isConnected() check
                     stateMachine.transitionTo('homescreen', {playerCount: UIManager.playerCountSpan?.textContent ?? '?'});
                } else {
                    // If socket not connected yet, the 'connect' handler will show homescreen
                    console.log("[Game] Assets ready, but waiting for socket connection...");
                    stateMachine.transitionTo('loading', {message: 'Connecting...'}); // Stay loading but show connecting
                }
            });
             loadManager.on('error', (data) => {
                  stateMachine.transitionTo('loading', {message: `FATAL: Asset Error!<br/>${data.message||''}`, error: true});
            });
            console.log("[Game] LoadManager listeners attached.");
        } else { console.error("LoadManager missing, cannot attach listeners."); return; }
        // *****************************************************

        this.bindOtherStateTransitions(); // Bind UI state transitions (can be separate func)
        stateMachine.transitionTo('loading'); // Initial state trigger

        // Start loading assets *after* attaching listener
        loadManager.startLoading();

        // Start Socket.IO connection
        if(typeof Network !== 'undefined' && typeof Network.init === 'function') Network.init(); else console.error("Network missing!");

        this.addEventListeners(); // Add window/doc listeners

        // Start the main animation loop
        this.animate();
        console.log("[Game] Started successfully.");
    }

    initializeCoreComponents() { /* ... Same ... */ }
    initializeManagers() { /* ... Same ... */ }

    // Separate function for UI state binding for clarity
    bindOtherStateTransitions() {
        if(typeof UIManager !== 'undefined') UIManager.bindStateListeners(stateMachine); else console.error("UIManager missing");
        stateMachine.on('transition', (data) => {
           if(data.to === 'homescreen' && data.from === 'playing') {
                if(typeof removeGunViewModel === 'function') removeGunViewModel();
                bullets.forEach(b => b.remove()); bullets = [];
           } else if (data.to === 'playing') {
                if(typeof updateHealthBar === 'function' && players[localPlayerId]) {
                     updateHealthBar(players[localPlayerId].health);
                }
                if (typeof attachGunViewModel === 'function') attachGunViewModel();
           }
        });
         // Moved loadManager listeners to start()
         console.log("[Game] Other State Listeners Bound");
    }

    addEventListeners() { /* ... Same ... */ }
    update(deltaTime) { /* ... Same ... */ }
    animate() { /* ... Same ... */ }
    handleResize() { /* ... Same ... */ }
}

// --- START THE GAME ---
function runGame() { /* ... Same ... */ }
if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', runGame); } else { runGame(); }
console.log("game.js loaded");
