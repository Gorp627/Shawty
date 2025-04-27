// docs/game.js - Main Game Orchestrator

// --- Global Flags and Data for State Synchronization ---
let networkIsInitialized = false; // Flag: Socket connection established
let assetsAreReady = false;       // Flag: LoadManager confirmed required assets are loaded via 'ready' event
let initializationData = null;  // To store data from server's 'initialize' event
var currentGameInstance = null; // To hold the Game instance

class Game {
    // --- Constructor ---
    constructor() {
        this.scene = null; this.camera = null; this.renderer = null; this.controls = null; this.clock = null;
        this.players = players; // Use global players object
        this.keys = keys;       // Use global keys object
        console.log("[Game] Instance created.");
    }

    // --- Start Method ---
    start() {
        console.log("[Game] Starting...");
        // Reset flags
        networkIsInitialized = false; // Reset on game start
        assetsAreReady = false;
        initializationData = null;

        if (!this.initializeCoreComponents()) { return; }
        if (!this.initializeManagers()) { return; }

        // Bind LoadManager Listener
        console.log("[Game] Binding LoadManager listeners...");
        if (typeof loadManager !== 'undefined') {
            loadManager.on('ready', () => {
                console.log("[Game] LoadManager 'ready' event received.");
                assetsAreReady = true; // Set the flag

                // Decide next step based on network status and current game state
                if (networkIsInitialized && initializationData) {
                     // Network was already initialized (got 'initialize' event) before assets finished. Start game now.
                     console.log("[Game LoadReady Handler] Assets ready, Network was initialized. Starting game play.");
                     if (currentGameInstance?.startGamePlay) {
                         currentGameInstance.startGamePlay(initializationData);
                     } else { console.error("[Game LoadReady Handler] Game instance missing!"); }

                 } else if (stateMachine.is('joining') && Network.isConnected()) {
                      // Assets just finished loading WHILE we were in the 'joining' state AND connected. Send details now.
                      console.log("[Game LoadReady Handler] Assets ready while joining and connected. Sending join details...");
                      Network.sendJoinDetails();

                 } else if (stateMachine.is('loading')) {
                     // Assets ready, network not ready OR not joining. Go to homescreen.
                     console.log("[Game LoadReady Handler] Assets ready, Network not ready or not joining. Transitioning to Homescreen.");
                     stateMachine.transitionTo('homescreen', { playerCount: UIManager.playerCountSpan?.textContent ?? '?' });

                 } else {
                     // Assets ready, but state is already homescreen or playing. Do nothing specific here.
                     console.log(`[Game LoadReady Handler] Assets ready, state is ${stateMachine.currentState}. No action needed from here.`);
                 }
            });
            // Listener for LoadManager errors
            loadManager.on('error', (data) => {
                console.error("[Game] LoadManager 'error' event received.");
                assetsAreReady = false; // Ensure flag is false on error
                if(typeof stateMachine!=='undefined') stateMachine.transitionTo('loading',{message:`FATAL: Asset Error!<br/>${data.message||'Check console.'}`,error:true});
            });
            console.log("[Game] LoadManager listeners attached.");
        } else {
            console.error("LoadManager missing!");
             if(typeof stateMachine!=='undefined') stateMachine.transitionTo('loading',{message:`FATAL: LoadManager Missing!`,error:true});
            return;
        }

        this.bindOtherStateTransitions();
        if(typeof stateMachine!=='undefined') stateMachine.transitionTo('loading'); else console.error("stateMachine missing!");

        // Initialize Network (Network init sets up listeners including 'connect')
        console.log("[Game] Initializing Network...");
        if(typeof Network!=='undefined' && typeof Network.init==='function') {
            Network.init();
        } else {
            console.error("Network missing or invalid!");
            if(typeof stateMachine!=='undefined') stateMachine.transitionTo('loading',{message:`FATAL: Network Module Failed!`,error:true});
            return;
        }

        // Start loading assets AFTER setting up network listeners
        console.log("[Game] Starting asset load via LoadManager...");
        if(typeof loadManager!=='undefined') {
            loadManager.startLoading();
        } else {
             console.error("LoadManager missing - cannot start loading!");
        }

        this.addEventListeners(); // Add join button listener etc.
        this.animate();
        console.log("[Game] Started successfully setup.");
    }

    // --- Initialize Core Components ---
    initializeCoreComponents() { /* ... no change ... */ }

    // --- Initialize Managers ---
    initializeManagers() { /* ... no change ... */ }

    // --- Bind State Transitions ---
    bindOtherStateTransitions() {
        if(UIManager?.bindStateListeners) UIManager.bindStateListeners(stateMachine);
        else console.error("UIManager missing");

        stateMachine.on('transition', (data) => {
             console.log(`[Game State Listener] Transition: ${data.from} -> ${data.to}`);
             if (data.to === 'homescreen') {
                 // Reset flags when returning to homescreen
                 networkIsInitialized = false; // Socket might still be connected, but we are not 'initialized' in game context
                 initializationData = null;
                 console.log("[Game] Reset network/init flags for homescreen.");
                 // Player list cleanup moved here for robustness
                 if (data.from === 'playing' || data.from === 'joining') { // Clean up if coming from playing OR joining
                     console.log(`[Game] Cleanup after ${data.from} state...`);
                     for(const id in players){ if(id !== localPlayerId && Network._removePlayer){ Network._removePlayer(id); } }
                     if(players[localPlayerId]) { delete players[localPlayerId]; }
                     players = {}; localPlayerId = null;
                     if(controls?.isLocked) controls.unlock();
                     console.log("[Game] Player state cleared for homescreen.");
                 }
             } else if (data.to === 'playing') {
                 console.log("[Game] State transitioned to 'playing'.");
                 // Ensure UI reflects playing state
                 if (UIManager && localPlayerId && players[localPlayerId]) UIManager.updateHealthBar(players[localPlayerId].health);
                 if (UIManager && players[localPlayerId]?.name) UIManager.updateInfo(`Playing as ${players[localPlayerId].name}`);

             } else if (data.to === 'loading' && data.options?.error) { console.error("Loading error state:", data.options.message); if(controls?.isLocked)controls.unlock(); networkIsInitialized = false; assetsAreReady = false; initializationData = null;}
        });
        console.log("[Game] Other State Listeners Bound");
    }

    // --- Add Event Listeners ---
    addEventListeners() {
        console.log("[Game] Add global listeners...");
        // Modify Join Button listener
        if (UIManager?.joinButton && Network?.attemptJoinGame) {
            UIManager.joinButton.addEventListener('click', () => {
                // Check if assets are ready before attempting to join
                if (!assetsAreReady) {
                    UIManager.showError("Assets still loading, please wait...", 'homescreen');
                    // Optionally trigger loading screen again or just keep button disabled
                    // stateMachine?.transitionTo('loading', { message: "Waiting for assets..." });
                    return;
                }
                // If assets are ready, proceed with the join attempt
                Network.attemptJoinGame();
            });
            console.log("[Game] Join listener added (with asset check).");
        } else {
            console.error("Cannot add join listener!");
        }
        window.addEventListener('resize', this.handleResize.bind(this));
        console.log("[Game] Global Listeners added.");
    }

    // --- Update Loop ---
    update(dt) { /* ... no change ... */ }

    // --- Animate Loop ---
    animate() { /* ... no change ... */ }

    // --- Resize Handler ---
    handleResize() { /* ... no change ... */ }

    // --- Start Game Play Method ---
    // This is now ONLY called by Network.handleInitialize when initialize data is received AND assets are ready
    startGamePlay(initData) {
        console.log('[Game] startGamePlay called.');
        if (!initData || !initData.id) {
            console.error("[Game] startGamePlay called with invalid initData!");
            stateMachine.transitionTo('homescreen');
            UIManager.showError("Failed to initialize game.", 'homescreen');
            return;
        }
        if (stateMachine.is('playing')) {
             console.warn("[Game] startGamePlay called while already playing. Ignoring.");
             return;
        }

        localPlayerId = initData.id; console.log(`[Game] Local ID: ${localPlayerId}`);
        console.log("[Game] Clearing previous player state for game start...");
        for(const id in players) { Network._removePlayer(id); } // Ensure clean slate
        players={};

        let iPosX=0, iPosY=0, iPosZ=0;

        // Process player data from server's initialize message
        for(const id in initData.players){
            const sPD = initData.players[id];
            if(id === localPlayerId){
                console.log(`[Game] Init local player: ${sPD.name}`);
                players[id] = { ...sPD, isLocal: true, mesh: null };
                iPosX=sPD.x; iPosY=sPD.y; iPosZ=sPD.z;

                const visualY = iPosY + (CONFIG?.PLAYER_HEIGHT || 1.8);
                if(controls?.getObject()){
                    controls.getObject().position.set(iPosX, visualY, iPosZ);
                    controls.getObject().rotation.set(0, sPD.rotationY || 0, 0);
                    console.log(`[Game] Set controls pos(${iPosX.toFixed(1)}, ${visualY.toFixed(1)}, ${iPosZ.toFixed(1)}) rotY(${sPD.rotationY?.toFixed(2)})`);
                    // Attempt to lock pointer AFTER setting position and transitioning state
                    // Pointer lock requires user interaction usually, handled by mousedown in Input.js
                } else { console.error("[Game] Controls object missing during local player spawn!"); }

                if(UIManager){
                    UIManager.updateHealthBar(sPD.health);
                    UIManager.updateInfo(`Playing as ${players[id].name}`);
                    UIManager.clearError('homescreen');
                    UIManager.clearKillMessage();
                }
            } else {
                if(Network._addPlayer) Network._addPlayer(sPD);
            }
        }
        console.log(`[Game] Init complete. ${Object.keys(players).length} players.`);

        // Transition state AFTER setting up player data and controls position
        if(stateMachine){
            console.log("[Game] Transitioning state to 'playing'...");
            stateMachine.transitionTo('playing'); // This will trigger UI changes via UIManager listeners
        } else { console.error("stateMachine missing!"); }
    }

} // End Game Class

// --- REMOVED Global Function: attemptEnterPlayingState ---

// --- Global Entry Point: runGame ---
function runGame() { console.log("--- runGame() ---"); try { const gI=new Game(); window.currentGameInstance=gI; gI.start(); window.onresize=()=>gI.handleResize(); } catch(e){console.error("Error creating Game:",e);document.body.innerHTML="<p>GAME INIT FAILED.</p>";}}

// --- DOM Ready Execution ---
if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',runGame);}else{runGame();}
console.log("game.js loaded (Simplified Join Logic)");
