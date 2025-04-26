// docs/game.js - Main Game Orchestrator

class Game {
    constructor() { /* ... Same ... */ }

    start() {
        console.log("[Game] Starting...");
        if (!this.initializeCoreComponents() || !this.initializeManagers()) { return; }

        // --- Listener for LoadManager removed ---
        // console.log("[Game] Binding LoadManager listeners...");
        // if (typeof loadManager !== 'undefined') {
        //     loadManager.on('ready', () => { /* ... removed ... */ });
        //     loadManager.on('error', (data) => { /* ... removed ... */ });
        //     console.log("[Game] LoadManager listeners attached.");
        // } else { console.error("LoadManager missing!"); return; }
        // --- ------------------------------ ---

        this.bindOtherStateTransitions(); // Bind UI state transitions
        stateMachine.transitionTo('loading'); // Initial state trigger

        // Start loading assets
        console.log("[Game] Starting asset load via LoadManager...");
        if(typeof loadManager !== 'undefined') loadManager.startLoading(); else console.error("LoadManager missing!");


        // Start Socket.IO connection
        if(typeof Network !== 'undefined' && typeof Network.init === 'function') Network.init(); else console.error("Network missing!");

        this.addEventListeners(); // Add window/doc listeners

        // Start the main animation loop
        this.animate();
        console.log("[Game] Started successfully.");
    }

    initializeCoreComponents() { /* ... Same ... */ }
    initializeManagers() { /* ... Same ... */ }

    // Bind only UI state transitions here now
    bindOtherStateTransitions() {
        if(typeof UIManager!=='undefined') UIManager.bindStateListeners(stateMachine); else console.error("UIManager missing");
        stateMachine.on('transition', (data) => {
           if(data.to === 'homescreen' && data.from === 'playing') { if(typeof Effects !== 'undefined') Effects.removeGunViewModel(); bullets.forEach(b => b.remove()); bullets = []; }
           else if (data.to === 'playing') { if(typeof UIManager !== 'undefined' && players[localPlayerId]) { UIManager.updateHealthBar(players[localPlayerId].health); } if (typeof Effects !== 'undefined') Effects.attachGunViewModel(); }
        });
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
