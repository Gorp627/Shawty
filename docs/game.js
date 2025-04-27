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
        this.mapMesh = null;   // Reference to the loaded map mesh
        console.log("[Game] Instance created.");
    }

    // --- Start Method ---
    start() {
        console.log("[Game] Starting...");
        // Reset flags
        networkIsInitialized = false;
        assetsAreReady = false;
        initializationData = null;
        this.mapMesh = null; // Reset map mesh ref

        if (!this.initializeCoreComponents()) { return; }
        if (!this.initializeManagers()) { return; }

        // Bind LoadManager Listener
        console.log("[Game] Binding LoadManager listeners...");
        if (typeof loadManager !== 'undefined') {
            loadManager.on('ready', () => {
                console.log("[Game] LoadManager 'ready' event received.");
                assetsAreReady = true;

                // Get map mesh data from LoadManager and store it on the instance
                this.mapMesh = loadManager.getAssetData('map');
                if (!this.mapMesh) {
                    console.error("!!! [Game] LoadManager 'ready' but mapMesh data is missing!");
                    stateMachine.transitionTo('loading', { message: "FATAL: Map asset data missing!", error: true });
                    return;
                }
                console.log("[Game] Map mesh reference stored in game instance.");


                // Decide next step based on network status and current game state
                if (networkIsInitialized && initializationData) {
                     console.log("[Game LoadReady Handler] Assets ready, Network was initialized. Attempting game play start.");
                     if (currentGameInstance?.startGamePlay) {
                         currentGameInstance.startGamePlay(initializationData); // startGamePlay will verify this.mapMesh
                     } else { console.error("[Game LoadReady Handler] Game instance missing!"); }

                 } else if (typeof stateMachine !== 'undefined' && stateMachine.is('joining') && typeof Network !== 'undefined' && Network.isConnected()) {
                      console.log("[Game LoadReady Handler] Assets ready while joining and connected. Sending join details...");
                      Network.sendJoinDetails();

                 } else if (typeof stateMachine !== 'undefined' && stateMachine.is('loading')) {
                     console.log("[Game LoadReady Handler] Assets ready, Network not ready or not joining. Transitioning to Homescreen.");
                     stateMachine.transitionTo('homescreen', { playerCount: typeof UIManager !== 'undefined' ? (UIManager.playerCountSpan?.textContent ?? '?') : '?' });

                 } else {
                     console.log(`[Game LoadReady Handler] Assets ready, state is ${stateMachine?.currentState || 'unknown'}. No action needed from here.`);
                 }
            });
            // Listener for LoadManager errors
            loadManager.on('error', (data) => {
                console.error("[Game] LoadManager 'error' event received.");
                assetsAreReady = false;
                this.mapMesh = null;   // Reset map ref on error
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
            Network.init();
        } else {
            console.error("Network missing or invalid!");
            if(typeof stateMachine!=='undefined') stateMachine.transitionTo('loading',{message:`FATAL: Network Module Failed!`,error:true});
            return;
        }

        // Start loading assets
        console.log("[Game] Starting asset load via LoadManager...");
        if(typeof loadManager!=='undefined') {
            loadManager.startLoading();
        } else {
             console.error("LoadManager missing - cannot start loading!");
        }

        this.addEventListeners();
        this.animate();
        console.log("[Game] Started successfully setup.");
    }

    // --- Initialize Core Components ---
    initializeCoreComponents() {
         console.log("[Game] Init Core Components...");
         try {
             // Scene setup
             this.scene = new THREE.Scene(); scene = this.scene; // Assign to global 'scene'
             this.scene.background = new THREE.Color(0x6699cc);
             this.scene.fog = new THREE.Fog(0x6699cc, 0, 200);

             // Camera setup
             this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000); camera = this.camera; // Assign to global 'camera'

             // Clock and Renderer setup
             this.clock = new THREE.Clock(); clock = this.clock; // Assign to global 'clock'
             const canvas = document.getElementById('gameCanvas');
             if (!canvas) throw new Error("Fatal: #gameCanvas element not found in HTML!");
             this.renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true }); renderer = this.renderer; // Assign to global 'renderer'
             this.renderer.setSize(window.innerWidth, window.innerHeight);
             this.renderer.shadowMap.enabled = true;

             // Controls setup
             this.controls = new THREE.PointerLockControls(this.camera, document.body); controls = this.controls; // Assign to global 'controls'
             this.controls.addEventListener('lock', () => { console.log('[Controls] Locked'); });
             this.controls.addEventListener('unlock', () => { console.log('[Controls] Unlocked'); });

             // Loaders setup (assigning to globals used by loadManager etc.)
             dracoLoader = new THREE.DRACOLoader(); // Assign to global 'dracoLoader'
             dracoLoader.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/libs/draco/');
             dracoLoader.setDecoderConfig({ type: 'js' });
             dracoLoader.preload();
             loader = new THREE.GLTFLoader(); // Assign to global 'loader'
             loader.setDRACOLoader(dracoLoader);
             console.log("[Game] Loaders Initialized.");

             // Lighting setup
             const ambL = new THREE.AmbientLight(0xffffff, 0.7);
             scene.add(ambL);
             const dirL = new THREE.DirectionalLight(0xffffff, 1.0);
             dirL.position.set(15, 20, 10);
             dirL.castShadow = true;
             dirL.shadow.mapSize.width = 1024;
             dirL.shadow.mapSize.height = 1024;
             scene.add(dirL);
             scene.add(dirL.target); // Target for directional light

             console.log("[Game] Core Components OK.");
             return true; // Indicate success
         } catch(e) {
             console.error("!!! Core Component Initialization Error:", e);
             if(typeof UIManager !== 'undefined' && UIManager?.showError) UIManager.showError("FATAL: Graphics Init Error!", 'loading');
             else alert("FATAL: Graphics Init Error!");
             return false; // Indicate failure
         }
    }

    // --- Initialize Managers ---
    initializeManagers() {
         console.log("[Game] Init Managers...");
         // Check if all required manager modules/globals exist
         if(typeof UIManager === 'undefined' || typeof Input === 'undefined' || typeof stateMachine === 'undefined' || typeof loadManager === 'undefined' || typeof Network === 'undefined' || typeof Effects === 'undefined') {
             console.error("!!! One or more Manager modules are undefined!");
             if(typeof UIManager !== 'undefined' && UIManager?.showError) UIManager.showError("FATAL: Mgr Load Error!", 'loading');
             else document.body.innerHTML = "<p>FATAL: MANAGER SCRIPT LOAD ERROR</p>"; // Fallback error display
             return false; // Indicate failure
         }
         try {
             // Initialize each manager
             if(!UIManager.initialize()) throw new Error("UIManager failed init");
             Input.init(this.controls); // Pass controls reference to Input manager
             Effects.initialize(this.scene); // Pass scene reference to Effects manager
             console.log("[Game] Managers Initialized.");
             return true; // Indicate success
         } catch (e) {
             console.error("!!! Manager Initialization Error:", e);
             if(typeof UIManager !== 'undefined' && UIManager?.showError) UIManager.showError("FATAL: Game Setup Error!", 'loading');
             else alert("FATAL: Game Setup Error!");
             return false; // Indicate failure
         }
    }

    // --- Bind State Transitions ---
    bindOtherStateTransitions() {
        // Bind UIManager listeners first if available
        if(typeof UIManager !== 'undefined' && UIManager?.bindStateListeners) UIManager.bindStateListeners(stateMachine);
        else console.error("UIManager missing when binding state listeners");

        // Bind Game's own transition listener
        if (typeof stateMachine !== 'undefined') {
            stateMachine.on('transition', (data) => {
                 console.log(`[Game State Listener] Transition: ${data.from} -> ${data.to}`);
                 if (data.to === 'homescreen') {
                     // Reset flags when returning to homescreen
                     networkIsInitialized = false;
                     initializationData = null;
                     console.log("[Game] Reset network/init flags for homescreen.");
                     // Cleanup players when leaving playing/joining state
                     if (data.from === 'playing' || data.from === 'joining') {
                         console.log(`[Game] Cleanup after ${data.from} state...`);
                         for(const id in players){ if(id !== localPlayerId && typeof Network !== 'undefined' && Network._removePlayer){ Network._removePlayer(id); } }
                         if(typeof players !== 'undefined' && players[localPlayerId]) { delete players[localPlayerId]; }
                         players = {}; localPlayerId = null;
                         if(typeof controls !== 'undefined' && controls?.isLocked) controls.unlock();
                         console.log("[Game] Player state cleared for homescreen.");
                     }
                 } else if (data.to === 'playing') {
                     console.log("[Game] State transitioned to 'playing'.");
                     // Update UI elements relevant to playing state
                     if (typeof UIManager !== 'undefined' && localPlayerId && players[localPlayerId]) UIManager.updateHealthBar(players[localPlayerId].health);
                     if (typeof UIManager !== 'undefined' && players[localPlayerId]?.name) UIManager.updateInfo(`Playing as ${players[localPlayerId].name}`);

                 } else if (data.to === 'loading' && data.options?.error) {
                     // Handle entering loading state due to an error
                     console.error("Loading error state:", data.options.message);
                     if(typeof controls !== 'undefined' && controls?.isLocked)controls.unlock();
                     networkIsInitialized = false; assetsAreReady = false; initializationData = null; // Reset flags on error
                 }
            });
        } else {
            console.error("stateMachine missing when binding transitions!");
        }
        console.log("[Game] Other State Listeners Bound");
    }

    // --- Add Event Listeners ---
    addEventListeners() {
        console.log("[Game] Add global listeners...");
        // Join Button Listener
        if (typeof UIManager !== 'undefined' && UIManager?.joinButton && typeof Network !== 'undefined' && Network?.attemptJoinGame) {
            UIManager.joinButton.addEventListener('click', () => {
                // Ensure assets are ready before allowing join attempt
                if (typeof assetsAreReady === 'undefined' || !assetsAreReady) {
                    UIManager.showError("Assets still loading, please wait...", 'homescreen');
                    return; // Prevent join attempt if assets aren't ready
                }
                // Assets are ready, proceed with join attempt
                Network.attemptJoinGame();
            });
            console.log("[Game] Join listener added (with asset check).");
        } else {
            console.error("Cannot add join listener! Check UIManager, joinButton, Network, and attemptJoinGame availability.");
        }
        // Window Resize Listener
        window.addEventListener('resize', this.handleResize.bind(this)); // Use bind to maintain 'this' context
        console.log("[Game] Global Listeners added.");
    }

    // --- Update Loop ---
    update(dt) {
        if(typeof stateMachine !== 'undefined' && stateMachine.is('playing')){
            try{
                // Pass mapMesh instance variable to updateLocalPlayer
                if(typeof updateLocalPlayer === 'function') updateLocalPlayer(dt, this.mapMesh);
            } catch(e){console.error("Err updateLP:",e);}
            try{ if(typeof updateRemotePlayers === 'function') updateRemotePlayers(dt); } catch(e){console.error("Err updateRP:",e);}
            try{ if(typeof Effects !== 'undefined' && Effects?.update) Effects.update(dt); } catch(e){console.error("Err Effects.update:",e);}
        }
    }

    // --- Animate Loop ---
    animate() {
        requestAnimationFrame(() => this.animate()); // Queue next frame
        const dT = this.clock ? this.clock.getDelta() : 0.016; // Get delta time, default if clock missing
        this.update(dT); // Call update logic
        // Render scene if components are ready
        if (this.renderer && this.scene && this.camera) {
            try {
                this.renderer.render(this.scene, this.camera);
            } catch (e) {
                console.error("Render error:", e);
                // Consider adding logic to stop the loop or show an error state if rendering fails repeatedly
            }
        }
    }

    // --- Resize Handler ---
    handleResize() {
        if (this.camera) {
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();
        }
        if (this.renderer) {
            this.renderer.setSize(window.innerWidth, window.innerHeight);
        }
    }

    // --- Start Game Play Method ---
    startGamePlay(initData) {
        console.log('[Game] startGamePlay called.');
        if (!initData || !initData.id) {
            console.error("[Game] startGamePlay called with invalid initData!");
            if (typeof stateMachine !== 'undefined') stateMachine.transitionTo('homescreen');
            if (typeof UIManager !== 'undefined') UIManager.showError("Failed to initialize game.", 'homescreen');
            return;
        }
        if (typeof stateMachine !== 'undefined' && stateMachine.is('playing')) {
             console.warn("[Game] startGamePlay called while already playing. Ignoring.");
             return;
        }

        // Check the mapMesh stored on the Game instance
        if (!this.mapMesh) {
            console.error("!!! [Game] startGamePlay: Instance mapMesh is not ready! Cannot start game. Assets loaded?", assetsAreReady);
             if (typeof stateMachine !== 'undefined') stateMachine.transitionTo('homescreen');
             if (typeof UIManager !== 'undefined') UIManager.showError("Map data missing. Cannot start.", 'homescreen');
            return;
        }


        localPlayerId = initData.id; console.log(`[Game] Local ID: ${localPlayerId}`);
        console.log("[Game] Clearing previous player state for game start...");
        for(const id in players) { if (typeof Network !== 'undefined' && Network._removePlayer) Network._removePlayer(id); }
        players={};

        let iPosX=0, iPosY=0, iPosZ=0;

        // Process player data from server's initialize message
        for(const id in initData.players){
            const sPD = initData.players[id];
            if(id === localPlayerId){
                console.log(`[Game] Init local player: ${sPD.name}`);
                players[id] = { ...sPD, isLocal: true, mesh: null };
                iPosX=sPD.x; iPosY=sPD.y; iPosZ=sPD.z;

                const cameraOffset = CONFIG?.CAMERA_Y_OFFSET || (CONFIG?.PLAYER_HEIGHT || 1.8);
                const visualY = iPosY + cameraOffset;
                if(typeof controls !== 'undefined' && controls?.getObject()){
                    controls.getObject().position.set(iPosX, visualY, iPosZ);
                    controls.getObject().rotation.set(0, sPD.rotationY || 0, 0);
                    console.log(`[Game] Set controls pos(${iPosX.toFixed(1)}, ${visualY.toFixed(1)}, ${iPosZ.toFixed(1)}) rotY(${sPD.rotationY?.toFixed(2)})`);
                } else { console.error("[Game] Controls object missing during local player spawn!"); }

                // Reset Physics State for Local Player
                velocityY = 0;
                isOnGround = true;
                console.log("[Game] Initial physics state reset (vy=0, onGround=true).");

                if(typeof UIManager !== 'undefined'){
                    UIManager.updateHealthBar(sPD.health);
                    UIManager.updateInfo(`Playing as ${players[id].name}`);
                    UIManager.clearError('homescreen');
                    UIManager.clearKillMessage();
                }
            } else {
                if(typeof Network !== 'undefined' && Network._addPlayer) Network._addPlayer(sPD);
            }
        }
        console.log(`[Game] Init complete. ${Object.keys(players).length} players.`);

        // Transition state AFTER setting up player data and CONFIRMING mapMesh
        if(typeof stateMachine !== 'undefined'){
            console.log("[Game] Transitioning state to 'playing'...");
            stateMachine.transitionTo('playing');
        } else { console.error("stateMachine missing!"); }
    }

} // End Game Class

// --- Global Entry Point: runGame ---
function runGame() { console.log("--- runGame() ---"); try { const gI=new Game(); window.currentGameInstance=gI; gI.start(); window.onresize=()=>gI.handleResize(); } catch(e){console.error("Error creating Game:",e);document.body.innerHTML="<p>GAME INIT FAILED.</p>";}}

// --- DOM Ready Execution ---
if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',runGame);}else{runGame();}
console.log("game.js loaded (Using Instance mapMesh, Passing to Logic)");
