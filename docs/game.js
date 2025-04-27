// docs/game.js - Main Game Orchestrator (with Cannon-es)

// --- Global Flags and Data ---
let networkIsInitialized = false;
let assetsAreReady = false;
let initializationData = null;
var currentGameInstance = null;

// --- Physics Constants ---
// Define timeStep using CONFIG after it's loaded. Default provided here as fallback.
const timeStep = 1 / 60; // Default value, CONFIG will override later if possible.

class Game {
    // --- Constructor ---
    constructor() {
        this.scene = null; this.camera = null; this.renderer = null; this.controls = null; this.clock = null;
        this.players = players; // Use global players object
        this.keys = keys;       // Use global keys object
        this.mapMesh = null;    // Visual map mesh reference
        this.physicsBodies = {}; // Store physics bodies keyed by player ID
        this.world = null;      // Cannon-es world stored on instance
        this.lastCallTime = performance.now(); // For physics step timing
        console.log("[Game] Instance created.");
    }

    // --- Start Method ---
    start() {
        console.log("[Game] Starting...");
        networkIsInitialized = false;
        assetsAreReady = false;
        initializationData = null;
        this.mapMesh = null;
        this.physicsBodies = {};
        this.world = null;
        this.lastCallTime = performance.now();

        // Use CONFIG value for timeStep if available
        const effectiveTimeStep = typeof CONFIG !== 'undefined' ? (CONFIG.PHYSICS_TIMESTEP || 1 / 60) : 1/60;

        if (!this.initializeCoreComponents()) { return; } // Initializes Three.js AND Cannon.js world
        if (!this.initializeManagers()) { return; }

        this.bindLoadManagerListeners(); // Setup asset loading listeners
        this.bindOtherStateTransitions();

        if(typeof stateMachine!=='undefined') stateMachine.transitionTo('loading'); else console.error("stateMachine missing!");

        this.initializeNetwork();   // Setup network connections
        this.startAssetLoading();   // Start loading map, models etc.
        this.addEventListeners();   // Setup UI listeners (join button etc.)
        this.animate(effectiveTimeStep);             // Start the main loop, pass timestep
        console.log("[Game] Started successfully setup.");
    }

    // --- Setup Asset Loading ---
    bindLoadManagerListeners() {
        console.log("[Game] Binding LoadManager listeners...");
        if (typeof loadManager === 'undefined') {
            console.error("LoadManager missing!");
            // Consider adding error state transition here
             if(typeof stateMachine!=='undefined') stateMachine.transitionTo('loading',{message:"FATAL: Load Manager script missing!", error:true});
            return;
        }

        loadManager.on('ready', () => {
            console.log("[Game] LoadManager 'ready' event received.");
            assetsAreReady = true;
            this.mapMesh = loadManager.getAssetData('map'); // Store visual map reference
            if (!this.mapMesh) {
                console.error("!!! [Game] LoadManager 'ready' but mapMesh data is missing!");
                stateMachine.transitionTo('loading', { message: "FATAL: Map asset data failed!", error: true });
                return;
            }
            console.log("[Game] Visual map mesh reference stored.");

            // Now that assets are ready, check if we can proceed
            this.attemptProceedToGame();
        });

        loadManager.on('error', (data) => {
            console.error("[Game] LoadManager 'error' event received.");
            assetsAreReady = false;
            this.mapMesh = null;   // Reset map ref on error
            if(typeof stateMachine!=='undefined') stateMachine.transitionTo('loading',{message:`FATAL: Asset Error!<br/>${data.message||'Check console.'}`,error:true});
        });
    }

     // --- Centralized logic to check if game can start ---
    attemptProceedToGame() {
        console.log(`[Game] attemptProceedToGame: assetsReady=${assetsAreReady}, networkInitialized=${networkIsInitialized}, initData=${!!initializationData}`);
        if (assetsAreReady && networkIsInitialized && initializationData) {
            // Everything is ready! Start the game.
            console.log("[Game] All prerequisites met. Starting game play...");
            if (currentGameInstance?.startGamePlay) {
                currentGameInstance.startGamePlay(initializationData);
            } else { console.error("[Game] Game instance missing!"); }
        } else if (assetsAreReady && stateMachine?.is('joining') && Network.isConnected()) {
            // Assets finished while joining and connected, send details.
            console.log("[Game] Assets ready while joining. Sending join details...");
            Network.sendJoinDetails();
        } else if (!assetsAreReady && stateMachine?.is('joining')) {
             console.log("[Game] Waiting for assets...");
             // UI should indicate loading state via UIManager listener
        } else if (assetsAreReady && !networkIsInitialized && stateMachine?.is('joining')) {
             console.log("[Game] Assets ready, waiting for network connection/initialization...");
             // UI should indicate connecting state via UIManager listener
        } else {
            console.log(`[Game] Prerequisites not yet met. State: ${stateMachine?.currentState || 'Unknown'}`);
        }
    }


    // --- Initialize Core Components (Three.js + Cannon.js) ---
    initializeCoreComponents() {
         console.log("[Game] Init Core Components (Three.js & Cannon.js)...");
         try {
             // --- Three.js Setup ---
             this.scene = new THREE.Scene(); scene = this.scene;
             this.scene.background = new THREE.Color(0x6699cc);
             this.scene.fog = new THREE.Fog(0x6699cc, 0, 200);
             this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000); camera = this.camera;
             this.clock = new THREE.Clock(); clock = this.clock;
             const canvas = document.getElementById('gameCanvas');
             if (!canvas) throw new Error("Fatal: #gameCanvas element not found!");
             this.renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true }); renderer = this.renderer;
             this.renderer.setSize(window.innerWidth, window.innerHeight);
             this.renderer.shadowMap.enabled = true;
             this.controls = new THREE.PointerLockControls(this.camera, document.body); controls = this.controls;
             this.controls.addEventListener('lock', () => { console.log('[Controls] Locked'); });
             this.controls.addEventListener('unlock', () => { console.log('[Controls] Unlocked'); });
             dracoLoader = new THREE.DRACOLoader();
             dracoLoader.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/libs/draco/');
             dracoLoader.setDecoderConfig({ type: 'js' }); dracoLoader.preload();
             loader = new THREE.GLTFLoader(); loader.setDRACOLoader(dracoLoader);
             const ambL = new THREE.AmbientLight(0xffffff, 0.7); this.scene.add(ambL);
             const dirL = new THREE.DirectionalLight(0xffffff, 1.0);
             dirL.position.set(15, 20, 10);
             dirL.castShadow = true;
             dirL.shadow.mapSize.width = 1024; dirL.shadow.mapSize.height = 1024;
             this.scene.add(dirL); this.scene.add(dirL.target);
             console.log("[Game] Three.js Components OK.");

             // --- Cannon.js Setup ---
             if (typeof CANNON === 'undefined') throw new Error("Cannon-es library not loaded!");
             this.world = new CANNON.World(); world = this.world; // Assign to global
             this.world.gravity.set(0, CONFIG.GRAVITY || -9.82, 0); // Set gravity from config
             this.world.broadphase = new CANNON.NaiveBroadphase(); // Simple broadphase needed for collisions

             // -- Create Materials --
             const groundMaterial = new CANNON.Material("groundMaterial");
             const playerMaterial = new CANNON.Material("playerMaterial");

             // -- Define Contact Material --
             const groundPlayerContactMaterial = new CANNON.ContactMaterial(
                 groundMaterial, playerMaterial,
                 {
                     friction: 0.1,      // Adjust friction as needed
                     restitution: 0.1    // Adjust bounciness as needed
                 }
             );
             this.world.addContactMaterial(groundPlayerContactMaterial); // Add the contact material to the world

             // -- Create Ground Physics Body --
             const groundShape = new CANNON.Plane(); // Represents an infinite horizontal plane
             const groundBody = new CANNON.Body({
                 mass: 0, // Static body
                 shape: groundShape,
                 material: groundMaterial // Assign the ground material
             });
             // Rotate the plane so its normal points upwards (along positive Y)
             groundBody.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
             groundBody.position.set(0, 0, 0); // Position the ground plane at Y=0
             this.world.addBody(groundBody);
             console.log("[Game] Cannon.js World and Ground OK.");


             return true; // Success
         } catch(e) {
             console.error("!!! Core Component Init Error:", e);
             if(typeof UIManager !== 'undefined' && UIManager?.showError) UIManager.showError("FATAL: Graphics Init Error!", 'loading');
             else alert("FATAL: Graphics Init Error!");
             return false;
         }
    }

    // --- Initialize Other Managers ---
    initializeManagers() {
         console.log("[Game] Init Managers...");
         if(typeof UIManager === 'undefined' || typeof Input === 'undefined' || typeof stateMachine === 'undefined' || typeof loadManager === 'undefined' || typeof Network === 'undefined' || typeof Effects === 'undefined') {
             console.error("!!! One or more Manager modules are undefined!");
             if(typeof UIManager !== 'undefined' && UIManager?.showError) UIManager.showError("FATAL: Mgr Load Error!", 'loading');
             else document.body.innerHTML = "<p>FATAL: MANAGER SCRIPT LOAD ERROR</p>";
             return false;
         }
         try {
             if(!UIManager.initialize()) throw new Error("UIManager failed init");
             Input.init(this.controls);
             Effects.initialize(this.scene);
             console.log("[Game] Managers Initialized.");
             return true;
         } catch (e) {
             console.error("!!! Manager Initialization Error:", e);
             if(typeof UIManager !== 'undefined' && UIManager?.showError) UIManager.showError("FATAL: Game Setup Error!", 'loading');
             else alert("FATAL: Game Setup Error!");
             return false;
         }
    }

    // --- Bind State Transitions ---
    bindOtherStateTransitions() {
        if(typeof UIManager !== 'undefined' && UIManager?.bindStateListeners) UIManager.bindStateListeners(stateMachine);
        else console.error("UIManager missing when binding state listeners");

        if (typeof stateMachine !== 'undefined') {
            stateMachine.on('transition', (data) => {
                 console.log(`[Game State Listener] Transition: ${data.from} -> ${data.to}`);
                 if (data.to === 'homescreen') {
                     networkIsInitialized = false;
                     initializationData = null;
                     console.log("[Game] Reset network/init flags for homescreen.");
                     if (data.from === 'playing' || data.from === 'joining') {
                         console.log(`[Game] Cleanup after ${data.from} state...`);
                         // Clear physics bodies and players map
                         for(const id in this.physicsBodies) { if (this.world) this.world.removeBody(this.physicsBodies[id]); } this.physicsBodies = {};
                         for(const id in players){ if(id !== localPlayerId && typeof Network !== 'undefined' && Network._removePlayer){ Network._removePlayer(id); } } // Let network handle removing ClientPlayer meshes
                         if(typeof players !== 'undefined' && players[localPlayerId]) { delete players[localPlayerId]; }
                         players = {}; localPlayerId = null;
                         if(typeof controls !== 'undefined' && controls?.isLocked) controls.unlock();
                         console.log("[Game] Player and physics state cleared for homescreen.");
                     }
                 } else if (data.to === 'playing') {
                     console.log("[Game] State transitioned to 'playing'.");
                     if (typeof UIManager !== 'undefined' && localPlayerId && players[localPlayerId]) UIManager.updateHealthBar(players[localPlayerId].health);
                     if (typeof UIManager !== 'undefined' && players[localPlayerId]?.name) UIManager.updateInfo(`Playing as ${players[localPlayerId].name}`);

                 } else if (data.to === 'loading' && data.options?.error) {
                     console.error("Loading error state:", data.options.message);
                     if(typeof controls !== 'undefined' && controls?.isLocked)controls.unlock();
                     networkIsInitialized = false; assetsAreReady = false; initializationData = null; this.mapMesh = null; this.physicsBodies = {};
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
        if (typeof UIManager !== 'undefined' && UIManager?.joinButton && typeof Network !== 'undefined' && Network?.attemptJoinGame) {
            UIManager.joinButton.addEventListener('click', () => {
                if (typeof assetsAreReady === 'undefined' || !assetsAreReady) {
                    UIManager.showError("Assets still loading, please wait...", 'homescreen');
                    return;
                }
                Network.attemptJoinGame();
            });
            console.log("[Game] Join listener added (with asset check).");
        } else {
            console.error("Cannot add join listener! Check UIManager, joinButton, Network, and attemptJoinGame availability.");
        }
        window.addEventListener('resize', this.handleResize.bind(this));
        console.log("[Game] Global Listeners added.");
    }

    // --- Main Update/Animate Loop ---
     animate(physicsTimeStep) { // Accept timestep from config
        requestAnimationFrame(() => this.animate(physicsTimeStep)); // Pass timestep recursively

        const now = performance.now();
        const dt = (now - this.lastCallTime) / 1000.0;
        this.lastCallTime = now;

        // --- Physics Step ---
        if (this.world) {
             this.world.step(physicsTimeStep, dt); // Use passed fixed timestep
        }

        // --- Game Logic Update ---
        if(typeof stateMachine !== 'undefined' && stateMachine.is('playing')){
            try{
                const localPlayerBody = localPlayerId ? this.physicsBodies[localPlayerId] : null;
                if (typeof updateLocalPlayer === 'function') {
                     updateLocalPlayer(dt, localPlayerBody); // Pass actual delta time for logic checks? Or physicsTimeStep? Usually delta.
                 }
            } catch(e){console.error("Err updateLP:",e);}

            // updateRemotePlayers function may not be needed if visuals are directly synced below
            // try{ if(typeof updateRemotePlayers === 'function') updateRemotePlayers(dt); } catch(e){console.error("Err updateRP:",e);}

            try{ if(typeof Effects !== 'undefined' && Effects?.update) Effects.update(dt); } catch(e){console.error("Err Effects.update:",e);}


             // --- Synchronize ALL Visuals with Physics ---
             // Local Player Camera/Controls
             const localBody = localPlayerId ? this.physicsBodies[localPlayerId] : null;
             if (localBody && typeof controls !== 'undefined' && controls?.getObject()) {
                 controls.getObject().position.copy(localBody.position);
                 controls.getObject().position.y += (CONFIG?.CAMERA_Y_OFFSET !== undefined ? CONFIG.CAMERA_Y_OFFSET : 1.6); // Adjust camera relative to body center
             }

             // Remote Player Meshes
             for (const id in players) {
                 if (id !== localPlayerId && players[id] instanceof ClientPlayer && players[id].mesh) {
                     const remoteBody = this.physicsBodies[id];
                     if (remoteBody) {
                          players[id].mesh.position.copy(remoteBody.position);
                          players[id].mesh.quaternion.copy(remoteBody.quaternion);
                          const playerHeight = CONFIG?.PLAYER_HEIGHT || 1.8;
                           // Adjust visual mesh Y if its origin is different from the physics body origin (center)
                           if (!(players[id].mesh.geometry instanceof THREE.CylinderGeometry)) { // Assuming cylinder is centered, but GLB might be at feet
                               // Adjust feet-origin mesh based on center-origin physics body
                               players[id].mesh.position.y -= playerHeight / 2;
                           }
                     }
                 }
             }
        }


        // --- Render ---
        if (this.renderer && this.scene && this.camera) {
            try { this.renderer.render(this.scene, this.camera); } catch (e) { console.error("Render error:", e); }
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
        if (!initData || !initData.id) { /* ... error handling ... */ return; }
        if (stateMachine?.is('playing')) { /* ... warning ... */ return; }
        if (!this.world) { /* ... error handling ... */ return; }


        localPlayerId = initData.id; console.log(`[Game] Local ID: ${localPlayerId}`);
        console.log("[Game] Clearing previous player/physics state...");
        for (const id in this.physicsBodies) { if (this.world) this.world.removeBody(this.physicsBodies[id]); } this.physicsBodies = {};
        for (const id in players) { if (Network._removePlayer) Network._removePlayer(id); } players = {};


        let iPosX=0, iPosY=0, iPosZ=0;

        // Process player data from server
        for(const id in initData.players){
            const sPD = initData.players[id];

            // Find the playerMaterial defined during physics setup
            const playerMaterial = this.world.materials.find(m => m.name === "playerMaterial");
            if (!playerMaterial) console.warn("Player material not found in physics world!");

            if(id === localPlayerId){
                console.log(`[Game] Init local player: ${sPD.name}`);
                players[id] = { ...sPD, isLocal: true, mesh: null };

                // Create Local Player Physics Body
                const playerRadius = CONFIG?.PLAYER_RADIUS || 0.4;
                const playerHeight = CONFIG?.PLAYER_HEIGHT || 1.8;
                const playerShape = new CANNON.Sphere(playerRadius); // Simple sphere shape for now
                const bodyCenterY = sPD.y + playerHeight / 2.0; // Calculate center from feet
                const playerBody = new CANNON.Body({
                    mass: CONFIG?.PLAYER_MASS || 70,
                    position: new CANNON.Vec3(sPD.x, bodyCenterY, sPD.z),
                    shape: playerShape,
                    material: playerMaterial, // Assign physics material
                    linearDamping: 0.5,
                    angularDamping: 0.9
                });
                 playerBody.angularFactor.set(0,1,0); // Prevent tilting
                this.world.addBody(playerBody);
                this.physicsBodies[id] = playerBody;
                console.log(`[Game] Created local physics body at y=${bodyCenterY.toFixed(2)}`);

                // Initial controls position (will be updated in animate)
                 if(typeof controls !== 'undefined' && controls?.getObject()){
                     controls.getObject().position.copy(playerBody.position);
                     controls.getObject().position.y += (CONFIG?.CAMERA_Y_OFFSET !== undefined ? CONFIG.CAMERA_Y_OFFSET : 1.6);
                 } else { console.error("[Game] Controls object missing during local player spawn!"); }

                // No manual physics state reset needed

                if(typeof UIManager !== 'undefined'){
                     UIManager.updateHealthBar(sPD.health);
                     UIManager.updateInfo(`Playing as ${players[id].name}`);
                     UIManager.clearError('homescreen');
                     UIManager.clearKillMessage();
                 }

            } else {
                 // Create Remote Player (Visual + Physics)
                 if(typeof Network !== 'undefined' && Network._addPlayer) {
                     Network._addPlayer(sPD); // Creates ClientPlayer instance and visual mesh
                     const remotePlayer = players[id];

                     if (remotePlayer instanceof ClientPlayer && typeof world !== 'undefined') {
                         const remoteRadius = CONFIG?.PLAYER_RADIUS || 0.4;
                         const remoteHeight = CONFIG?.PLAYER_HEIGHT || 1.8;
                         const remoteShape = new CANNON.Sphere(remoteRadius);
                         const remoteBodyCenterY = sPD.y + remoteHeight / 2.0;
                         const remoteBody = new CANNON.Body({
                              mass: 0, // KINEMATIC
                              shape: remoteShape,
                              position: new CANNON.Vec3(sPD.x, remoteBodyCenterY, sPD.z),
                              type: CANNON.Body.KINEMATIC,
                              material: playerMaterial // Assign physics material
                         });
                         // Set initial rotation for kinematic body
                          remoteBody.quaternion.setFromEuler(0, sPD.rotationY || 0, 0);
                         this.world.addBody(remoteBody);
                         this.physicsBodies[id] = remoteBody; // Store body ref
                     }
                 }
            }
        }
        console.log(`[Game] Init complete. ${Object.keys(players).length} players.`);

        // Transition state AFTER setting up world and bodies
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
console.log("game.js loaded (Cannon-es Integration)");
