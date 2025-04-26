// docs/game.js - Main Game Orchestrator

let networkIsInitialized = false;
let assetsAreReady = false;
let initializationData = null;
var currentGameInstance = null;

class Game {
    // ... constructor ...
    constructor() { /* ... */ }

    start() { /* ... (No changes needed in start itself) ... */ }
    initializeCoreComponents() { /* ... (No changes) ... */ }
    initializeManagers() { /* ... (No changes) ... */ }

    bindOtherStateTransitions() {
        if (UIManager?.bindStateListeners) UIManager.bindStateListeners(stateMachine);
        else console.error("UIManager missing");

        stateMachine.on('transition', (data) => {
             console.log(`[Game State Listener] Transition: ${data.from} -> ${data.to}`);
             if (data.to === 'homescreen') {
                 networkIsInitialized = false; initializationData = null; // Reset network, keep assets
                 console.log("[Game] Reset network flags on entering homescreen.");
                 if (data.from === 'playing') { /* ... cleanup ... */ }
             } else if (data.to === 'playing') {
                 // *** ADDED LOGGING HERE ***
                 console.log(`[Game] >>> Entering 'playing' state listener. Checking window.gunModel: ${window.gunModel ? 'Object' : window.gunModel}`);

                 console.log("[Game] State transitioned to 'playing'. Attaching gun.");
                 if (Effects) {
                     const gunModelReady = !!(window.gunModel && window.gunModel !== 'error'); // Check window.gunModel directly
                     const cameraReady = !!camera;
                     const configReady = !!CONFIG;
                     // *** ADDED LOGGING HERE ***
                     console.log(`[Game] >>> Playing State Prerequisites: gun=${gunModelReady}, cam=${cameraReady}, cfg=${configReady}`);

                     if (gunModelReady && cameraReady && configReady) {
                         Effects.attachGunViewModel();
                     } else {
                         console.error(`!!! Entered 'playing' but gun prerequisites not met!`);
                     }
                 } else { console.error("Effects module missing!"); }
                 if (UIManager && players[localPlayerId]) UIManager.updateHealthBar(players[localPlayerId].health);

             } else if (data.to === 'loading' && data.options?.error) { /* ... */ }
        });
        console.log("[Game] Other State Listeners Bound");
    }

    addEventListeners() { /* ... (No changes) ... */ }
    update(deltaTime) { /* ... (No changes) ... */ }
    animate() { /* ... (No changes) ... */ }
    handleResize() { /* ... (No changes) ... */ }

    startGamePlay(data) {
        // *** ADDED LOGGING HERE ***
        console.log(`[Game] >>> startGamePlay executing. Checking window.gunModel: ${window.gunModel ? 'Object' : window.gunModel}`);

        console.log('[Game] startGamePlay called.');
        localPlayerId = data.id;
        /* ... rest of setup ... */
        if (stateMachine) {
             console.log("[Game] Transitioning state machine to 'playing'...");
             stateMachine.transitionTo('playing');
        } else { console.error("!!! stateMachine missing!"); }
    }

} // End Game Class

function attemptEnterPlayingState() {
    // *** ADDED LOGGING HERE ***
    console.log(`[Game] >>> attemptEnterPlayingState executing. Checking window.gunModel: ${window.gunModel ? 'Object' : window.gunModel}`);

    console.log(`[Game] attemptEnterPlayingState called. networkReady=${networkIsInitialized}, assetsReady=${assetsAreReady}`);
    if (networkIsInitialized && assetsAreReady && !stateMachine.is('playing')) {
        console.log("[Game] Both ready! Starting game play...");
        if (!initializationData) { /* ... error handling ... */ return; }
        if (currentGameInstance?.startGamePlay) {
            currentGameInstance.startGamePlay(initializationData);
        } else { /* ... error handling ... */ }
    } else { /* ... waiting messages ... */ }
}
window.attemptEnterPlayingState = attemptEnterPlayingState;

function runGame() { /* ... (No changes) ... */ }
if (document.readyState === 'loading') { /* ... */ } else { /* ... */ }
console.log("game.js loaded and executed");
