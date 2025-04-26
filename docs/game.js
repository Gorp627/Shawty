// docs/game.js - Main Game Orchestrator

// --- Global Flags and Data for State Synchronization ---
let networkIsInitialized = false; // Flag: Server sent initialize data
let assetsAreReady = false;       // Flag: LoadManager confirmed required assets are loaded via 'ready' event
let initializationData = null;  // To store data from server's 'initialize' event
var currentGameInstance = null; // To hold the Game instance

class Game {
    // --- Constructor ---
    constructor() {
        this.scene = null; this.camera = null; this.renderer = null; this.controls = null; this.clock = null;
        this.players = players; this.bullets = bullets; this.keys = keys; // Use globals from config
        this.frameCount = 0; this.debugLogFrequency = 180;
        console.log("[Game] Instance created.");
    }

    // --- Start Method ---
    start() {
        console.log("[Game] Starting...");
        // Reset synchronization flags on start
        networkIsInitialized = false;
        assetsAreReady = false; // Reset asset flag initially, LoadManager 'ready' event sets it true
        initializationData = null;

        if (!this.initializeCoreComponents()) { return; }
        if (!this.initializeManagers()) { return; }

        // Bind LoadManager Listener
        console.log("[Game] Binding LoadManager listeners...");
        if (typeof loadManager !== 'undefined') {
            loadManager.on('ready', () => {
                console.log("[Game] LoadManager 'ready' event received. All required assets loaded successfully.");
                assetsAreReady = true; // Set the flag: assets are confirmed ready by LM

                // Assets are ready. Decide next step based on network status and current state.
                if (networkIsInitialized) {
                     // Network was already initialized before assets finished. Try entering play state.
                     console.log("[Game] Assets ready, Network was already initialized. Attempting to enter playing state.");
                     window.attemptEnterPlayingState();
                 } else if (stateMachine.is('loading')) {
                     // Assets ready, network not ready, and we are in loading state. Go to homescreen.
                     console.log("[Game] Assets ready, Network not initialized. Transitioning to Homescreen.");
                      if (typeof UIManager !== 'undefined') {
                         stateMachine.transitionTo('homescreen', { playerCount: UIManager.playerCountSpan?.textContent ?? '?' });
                     } else {
                         stateMachine.transitionTo('homescreen');
                     }
                 } else {
                     // Assets ready, network not ready, but not in loading state (e.g., already on homescreen). Do nothing here.
                     console.log("[Game] Assets ready, Network not initialized, state is not 'loading'. No state change needed from here.");
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
            return; // Cannot proceed without LoadManager
        }

        this.bindOtherStateTransitions();
        if(typeof stateMachine!=='undefined') stateMachine.transitionTo('loading'); else console.error("stateMachine missing!");

        // Initialize Network
        console.log("[Game] Initializing Network...");
        if(typeof Network!=='undefined' && typeof Network.init==='function') {
            Network.init(); // Network.init calls setupSocketIO which connects
        } else {
            console.error("Network missing or invalid!");
            if(typeof stateMachine!=='undefined') stateMachine.transitionTo('loading',{message:`FATAL: Network Module Failed!`,error:true});
            return; // Cannot proceed without Network
        }

        // Start loading assets
        console.log("[Game] Starting asset load via LoadManager...");
        if(typeof loadManager!=='undefined') {
            loadManager.startLoading();
        } else {
             console.error("LoadManager missing - cannot start loading!");
             // State machine should already be showing an error from earlier checks
        }


        this.addEventListeners();
        this.animate();
        console.log("[Game] Started successfully setup.");
    }

    // --- Initialize Core Components ---
    initializeCoreComponents() {
         console.log("[Game] Init Core Components...");
         try {
             // --- Essential Scene Setup ---
             this.scene = new THREE.Scene();
             this.scene.background = new THREE.Color(0x6699cc);
             this.scene.fog = new THREE.Fog(0x6699cc, 0, 200); // Near, Far
             scene = this.scene; // Assign global

             // --- Camera ---
             this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
             camera = this.camera; // Assign global

             // --- Clock ---
             this.clock = new THREE.Clock();
             clock = this.clock; // Assign global

             // --- Renderer ---
             const canvas = document.getElementById('gameCanvas');
             if (!canvas) throw new Error("Canvas element #gameCanvas not found!");
             this.renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
             this.renderer.setSize(window.innerWidth, window.innerHeight);
             this.renderer.shadowMap.enabled = true; // Enable shadows
             renderer = this.renderer; // Assign global

             // --- Controls ---
             this.controls = new THREE.PointerLockControls(this.camera, document.body);
             this.controls.addEventListener('lock', function () { console.log('[Controls] Locked'); });
             this.controls.addEventListener('unlock', function () { console.log('[Controls] Unlocked'); /* No state change */ });
             controls = this.controls; // Assign global

             // --- Loaders (CRITICAL: Initialize here!) ---
             dracoLoader = new THREE.DRACOLoader(); // Assign global
             dracoLoader.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/libs/draco/'); // Use CDN path
             dracoLoader.setDecoderConfig({ type: 'js' });
             dracoLoader.preload();

             loader = new THREE.GLTFLoader(); // Assign global
             loader.setDRACOLoader(dracoLoader); // Link DRACOLoader to GLTFLoader
             console.log("[Game] Loaders Initialized (GLTF + DRACO).");


             // --- Lighting ---
             const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
             scene.add(ambientLight);
             const directionalLight = new THREE.DirectionalLight(0xffffff, 1.0);
             directionalLight.position.set(15, 20, 10);
             directionalLight.castShadow = true;
             directionalLight.shadow.mapSize.width = 1024;
             directionalLight.shadow.mapSize.height = 1024;
             scene.add(directionalLight);
             scene.add(directionalLight.target);

             console.log("[Game] Core Components OK.");
             return true; // Success

         } catch(e) {
             console.error("!!! Core Component Initialization Error:", e);
             // Try to use UIManager, otherwise fallback to alert
             if(typeof UIManager !=='undefined' && UIManager.showError) {
                 UIManager.showError("FATAL: Graphics Initialization Error!", 'loading');
             } else {
                 alert("FATAL: Graphics Initialization Error! Check Console.");
                 document.body.innerHTML = "<p style='color:red; font-size: 1.5em; text-align: center;'>FATAL: Graphics Initialization Error!</p>";
             }
             return false; // Failure
         }
    }

    // --- Initialize Managers ---
    initializeManagers() {
         console.log("[Game] Init Managers...");
         // Check if manager scripts have loaded and exposed their objects
         if(typeof UIManager ==='undefined'||typeof Input ==='undefined'||typeof stateMachine ==='undefined'||typeof loadManager ==='undefined'||typeof Network ==='undefined'||typeof Effects ==='undefined') {
              console.error("!!! One or more required managers are undefined! Check script load order and execution.");
              // Attempt to show error via UIManager if it exists, otherwise basic message
              if (typeof UIManager !=='undefined' && UIManager.showError){
                  UIManager.showError("FATAL: Manager Script Load Error!", 'loading');
              } else {
                  document.body.innerHTML = "<p style='color:red; font-size: 1.5em; text-align: center;'>FATAL: MANAGER SCRIPT LOAD ERROR</p>";
              }
              return false; // Failure
         }

         try {
             // Initialize managers that have an init method
             if (!UIManager.initialize()) throw new Error("UIManager failed initialization");
             Input.init(this.controls); // Pass controls reference to Input manager
             Effects.initialize(this.scene); // Pass scene reference to Effects manager
             // stateMachine, loadManager, Network are objects/modules initialized differently or don't need an explicit init call here
             console.log("[Game] Managers Initialized.");
             return true; // Success
         }
         catch (e) {
             console.error("!!! Manager Initialization Error:", e);
             // Use UIManager if available
             if(typeof UIManager !=='undefined' && UIManager.showError) {
                UIManager.showError("FATAL: Game Setup Error!", 'loading');
             } else {
                 alert("FATAL: Game Setup Error! Check Console.");
                 document.body.innerHTML = "<p style='color:red; font-size: 1.5em; text-align: center;'>FATAL: Game Setup Error!</p>";
             }
             return false; // Failure
         }
    }

    // --- Bind State Transitions ---
    bindOtherStateTransitions() {
        if(typeof UIManager!=='undefined' && typeof UIManager.bindStateListeners === 'function') {
            UIManager.bindStateListeners(stateMachine);
        } else { console.error("UIManager or bindStateListeners missing"); }

        stateMachine.on('transition', (data) => {
             console.log(`[Game State Listener] Transition: ${data.from} -> ${data.to}`);
             if (data.to === 'homescreen') {
                 // Reset network flag only when entering homescreen
                 networkIsInitialized = false;
                 initializationData = null;
                 // ** DO NOT RESET assetsAreReady here - assets stay loaded! **
                 console.log("[Game] Reset network flags on entering homescreen.");

                 if (data.from === 'playing') { // Specific cleanup when stopping play
                     console.log("[Game] Cleaning up after playing state...");
                     if(Effects) Effects.removeGunViewModel(); // Remove gun view model
                     // Clear bullets
                     bullets.forEach(b => b.remove()); bullets = [];
                     // Clear remote players (local player cleared on next join)
                     for (const id in players) { if(id !== localPlayerId && Network._removePlayer) Network._removePlayer(id); }
                     // players = {}; // Keep local player data? Maybe not necessary.
                     localPlayerId = null; // Reset local ID
                     if (controls?.isLocked) controls.unlock(); // Ensure cursor is unlocked
                 }

             } else if (data.to === 'playing') {
                 // *** ADDED LOGGING HERE ***
                 // Check readiness using the LoadManager helper *at the moment of transition*
                 const isGunModelAssetReady = loadManager?.isAssetReady('gunModel');
                 console.log(`[Game] >>> Entering 'playing' state listener. loadManager.isAssetReady('gunModel') = ${isGunModelAssetReady}`);

                 console.log("[Game] State transitioned to 'playing'. Attaching gun.");
                 if (Effects) {
                     // Use the check we just made
                     if (isGunModelAssetReady && camera && CONFIG) {
                         console.log("[Game] Prerequisites seem met based on LoadManager check. Calling attachGunViewModel...");
                         Effects.attachGunViewModel();
                     } else {
                         // Log details if failed
                         console.error(`!!! Entered 'playing' but prerequisites check failed! gunAssetReady=${isGunModelAssetReady}, cam=${!!camera}, cfg=${!!CONFIG}`);
                     }
                 } else { console.error("Effects module missing!"); }

                 // Update UI health bar for local player
                 if (UIManager && localPlayerId && players[localPlayerId]) {
                     UIManager.updateHealthBar(players[localPlayerId].health);
                 }

             } else if (data.to === 'loading' && data.options?.error) {
                 console.error("Transitioned to loading state WITH ERROR:", data.options.message);
                 if (controls?.isLocked) controls.unlock();
                 // Maybe reset flags here too?
                 networkIsInitialized = false; assetsAreReady = false; initializationData = null;
             }
        });
        console.log("[Game] Other State Listeners Bound");
    }

    // --- Add Event Listeners ---
    addEventListeners() {
        console.log("[Game] Add global listeners...");
        // Ensure UI elements and Network function exist before adding listener
        if (UIManager && UIManager.joinButton && typeof Network !== 'undefined' && typeof Network.attemptJoinGame === 'function') {
             UIManager.joinButton.addEventListener('click', Network.attemptJoinGame);
             console.log("[Game] 'click' listener added to joinButton.");
        } else {
            console.error("!!! Could not add joinButton listener: UIManager or Network missing/invalid!");
            // Maybe display an error to the user if UIManager is available
            if (UIManager && UIManager.showError) {
                UIManager.showError("Join button broken!", 'homescreen');
            }
        }
        // Window resize listener
        window.addEventListener('resize', this.handleResize.bind(this));
        console.log("[Game] Global Listeners added.");
    }

    // --- Update Loop ---
    update(deltaTime) {
        // Only run game logic updates when in the 'playing' state
        if (stateMachine.is('playing')) {
            // Wrap calls in try-catch for safety during development
            try { if (typeof updateLocalPlayer === 'function' && localPlayerId && players[localPlayerId]) updateLocalPlayer(deltaTime); } catch (e) { console.error("Error during updateLocalPlayer:", e); }
            try { if (typeof updateRemotePlayers === 'function') updateRemotePlayers(deltaTime); } catch (e) { console.error("Error during updateRemotePlayers:", e); }
            try { if (typeof updateBullets === 'function') updateBullets(deltaTime); } catch (e) { console.error("Error during updateBullets:", e); }
            try { if (typeof Effects !== 'undefined' && typeof Effects.update === 'function') Effects.update(deltaTime); } catch (e) { console.error("Error during Effects.update:", e); }
        }
    }

    // --- Animation Loop ---
    animate() {
        requestAnimationFrame(()=>this.animate()); // Loop the animation
        const deltaTime = this.clock ? this.clock.getDelta() : 0.016; // Get time delta, provide fallback

        this.update(deltaTime); // Run game logic updates

        // Render the scene if components are ready
        if(this.renderer && this.scene && this.camera) {
            try {
                this.renderer.render(this.scene, this.camera);
            } catch (e) {
                console.error("!!! Render error:", e);
            }
        }
    }

    // --- Resize Handler ---
    handleResize() {
        if(this.camera) {
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();
        }
        if(this.renderer) {
            this.renderer.setSize(window.innerWidth, window.innerHeight);
        }
    }

    // --- Start Game Play Method ---
    startGamePlay(data) {
        // *** ADDED LOGGING HERE ***
        console.log(`[Game] >>> startGamePlay executing. Checking loadManager.isAssetReady('gunModel'): ${loadManager?.isAssetReady('gunModel')}`);

        console.log('[Game] startGamePlay called.');

        localPlayerId = data.id;
        console.log(`[Game] Local player ID set to: ${localPlayerId}`);

        console.log("[Game] Clearing existing players and bullets before initialization.");
        for(const id in players) { if(Network._removePlayer) Network._removePlayer(id); } // Use Network's cleanup
        players = {}; // Reset players object
        bullets.forEach(b => b.remove()); bullets = []; // Reset bullets array

        let initialPosX = 0, initialPosY = 0, initialPosZ = 0;

        // Populate the players object with data from the server
        for (const id in data.players) {
            const serverPlayerData = data.players[id];
            if (id === localPlayerId) {
                console.log(`[Game] Initializing local player data for ${serverPlayerData.name}`);
                players[id] = { ...serverPlayerData, isLocal: true, mesh: null }; // Local player uses camera controls, no mesh needed here
                initialPosX = serverPlayerData.x; initialPosY = serverPlayerData.y; initialPosZ = serverPlayerData.z;
                const visualY = initialPosY + (CONFIG?.PLAYER_HEIGHT || 1.8); // Camera Y position
                if (controls?.getObject()) {
                     controls.getObject().position.set(initialPosX, visualY, initialPosZ);
                     controls.getObject().rotation.set(0, serverPlayerData.rotationY || 0, 0); // Set initial camera Y rotation
                     console.log(`[Game] Set initial controls position to (${initialPosX.toFixed(2)}, ${visualY.toFixed(2)}, ${initialPosZ.toFixed(2)}) rotY: ${(serverPlayerData.rotationY || 0).toFixed(2)}`);
                } else { console.error("!!! Controls object missing during startGamePlay!"); }
                // Reset physics state
                velocityY = 0; isOnGround = true;
                // Update UI
                if (typeof UIManager !== 'undefined') {
                    UIManager.updateHealthBar(serverPlayerData.health);
                    UIManager.updateInfo(`Playing as ${players[id].name}`); // Use name from server data
                    UIManager.clearError('homescreen'); UIManager.clearKillMessage();
                }
            } else {
                // Add remote players using the Network utility function which creates ClientPlayer instances
                 if(Network._addPlayer) Network._addPlayer(serverPlayerData);
                 else console.error("Network._addPlayer missing!");
            }
        }

        console.log(`[Game] Initialization complete in startGamePlay. ${Object.keys(players).length} players active.`);

        // FINALLY, transition the state machine
        if (typeof stateMachine !== 'undefined') {
             console.log("[Game] Transitioning state machine to 'playing'...");
             stateMachine.transitionTo('playing');
        } else { console.error("!!! stateMachine missing! Cannot transition to 'playing' state."); }
    }

} // End Game Class

// --- Global Function: attemptEnterPlayingState ---
function attemptEnterPlayingState() {
    // *** ADDED LOGGING HERE ***
    console.log(`[Game] >>> attemptEnterPlayingState executing. Checking loadManager.isAssetReady('gunModel'): ${loadManager?.isAssetReady('gunModel')}`);

    console.log(`[Game] attemptEnterPlayingState called. networkReady=${networkIsInitialized}, assetsReady=${assetsAreReady}`);
    if (networkIsInitialized && assetsAreReady && typeof stateMachine !== 'undefined' && !stateMachine.is('playing')) {
        console.log("[Game] Both network and assets are ready! Starting game play...");
        if (!initializationData) {
             console.error("!!! CRITICAL: Network and assets ready, but initializationData is missing!");
             stateMachine?.transitionTo('homescreen'); // Revert state
             if (UIManager) UIManager.showError("Initialization Error", 'homescreen');
             return;
        }
        // Call the actual setup function using the stored game instance
        if (currentGameInstance && typeof currentGameInstance.startGamePlay === 'function') {
             currentGameInstance.startGamePlay(initializationData);
        } else {
             console.error("!!! Cannot find game instance or startGamePlay method!");
             stateMachine?.transitionTo('homescreen'); // Revert state
              if (UIManager) UIManager.showError("Game Startup Error", 'homescreen');
        }

    } else {
        // Log why we aren't entering yet
        if (!networkIsInitialized) console.log("[Game] Waiting for server initialization...");
        if (!assetsAreReady) console.log("[Game] Waiting for assets to load...");
         if (stateMachine?.is('playing')) console.log("[Game] Already in playing state.");
    }
}
// Make it globally accessible
window.attemptEnterPlayingState = attemptEnterPlayingState;


// --- Global Entry Point: runGame ---
function runGame() {
    console.log("--- runGame() triggered ---");
    try {
        const gameInstance = new Game();
        window.currentGameInstance = gameInstance; // Store instance globally for access
        gameInstance.start();
        window.onresize = () => gameInstance.handleResize(); // Use instance method for resize
    } catch (e) {
        console.error("!!! Error creating Game instance:", e);
        document.body.innerHTML = "<p style='color:red; font-size: 1.5em; text-align: center;'>GAME INITIALIZATION FAILED. Check Console.</p>";
    }
}

// --- DOM Ready Execution ---
if (document.readyState === 'loading') { // Loading hasn't finished yet
    document.addEventListener('DOMContentLoaded', runGame);
    console.log("DOM not ready, scheduling runGame on DOMContentLoaded.");
} else { // `DOMContentLoaded` has already fired
    console.log("DOM ready, running runGame immediately.");
    runGame();
}

console.log("game.js loaded and executed");
