// docs/game.js - Main Game Orchestrator (with Rapier.js)

// --- Global Flags and Data ---
let networkIsInitialized = false;
let assetsAreReady = false;
let initializationData = null;
var currentGameInstance = null;
var groundCollider = null; // Store ground collider handle for potential use

// --- Physics Constants (Use defaults if CONFIG not loaded) ---
const GRAVITY_Y = -25.0; // Define default gravity

class Game {
    // --- Constructor ---
    constructor() {
        this.scene = null; this.camera = null; this.renderer = null; this.controls = null; this.clock = null;
        this.players = players; this.keys = keys; this.mapMesh = null; // Visual map
        // --- Rapier Specific ---
        this.rapierWorld = null;         // Rapier world instance
        this.rapierEventHandlers = null; // Optional event handlers
        this.physicsBodies = {};         // Map Player ID -> { rigidBody: RAPIER.RigidBody, collider: RAPIER.Collider } or just handles
        // --- End Rapier ---
        this.lastCallTime = performance.now();
        console.log("[Game] Instance created.");
    }

    // --- Start Method ---
    start() {
        console.log("[Game] Starting...");
        networkIsInitialized = false; assetsAreReady = false; initializationData = null;
        this.mapMesh = null; this.physicsBodies = {}; this.rapierWorld = null; groundCollider = null; this.rapierEventHandlers = null; this.lastCallTime = performance.now();

        // Initialize Three.js core components first
        if (!this.initializeCoreComponents()) { return; }
        if (!this.initializeManagers()) { return; }
        if (!this.initializeNetwork()) { return; } // Does not depend on Rapier

        // Set up listeners that might proceed before Rapier is ready
        this.bindLoadManagerListeners();
        this.bindOtherStateTransitions();
        this.addEventListeners();

        // Start loading assets - can happen while waiting for Rapier
        this.startAssetLoading();

        // Start initial state machine transition
        if(stateMachine) stateMachine.transitionTo('loading', {message:"Loading Engine..."}); else console.error("stateMachine missing!");

        // Wait for Rapier WASM to load BEFORE creating the physics world and starting the game loop
        this.waitForRapierAndStart();
    }

    // --- Wait for Rapier ---
    async waitForRapierAndStart() {
        console.log("[Game] Waiting for Rapier physics engine...");
        // Check if rapier_init.js already finished
        if (window.isRapierReady) {
            console.log("[Game] Rapier already ready.");
            this.RAPIER = window.RAPIER; // Assign from global
            this.initializePhysics();
            this.animate(); // Start the main loop AFTER physics is initialized
            console.log("[Game] Started successfully setup after waiting for Rapier.");
            this.attemptProceedToGame(); // Check if we can move past loading screen
        } else {
             // Add event listener to wait for the custom event
            window.addEventListener('rapier-ready', () => {
                console.log("[Game] 'rapier-ready' event received.");
                this.RAPIER = window.RAPIER; // Assign from global
                this.initializePhysics();
                this.animate(); // Start the main loop AFTER physics is initialized
                console.log("[Game] Started successfully setup after Rapier event.");
                this.attemptProceedToGame(); // Check if we can move past loading screen
             }, { once: true }); // Listen only once
        }
    }

    // --- Initialize Rapier World and Ground ---
    initializePhysics() {
        if (!this.RAPIER) { console.error("Rapier library (this.RAPIER) not available during physics init!"); return false; }
        console.log("[Game] Initializing Rapier World...");
        try {
            const gravity = new this.RAPIER.Vector3(0.0, CONFIG?.GRAVITY ?? GRAVITY_Y, 0.0);
            this.rapierWorld = new this.RAPIER.World(gravity);
            rapierWorld = this.rapierWorld; // Assign to global if needed elsewhere (careful!)
            console.log("[Game] Rapier world created.");

            // Create Ground
            let groundColliderDesc = this.RAPIER.ColliderDesc.cuboid(100.0, 0.1, 100.0) // Large thin box at Y=0
                .setTranslation(0.0, -0.1, 0.0) // Position its top surface at Y=0
                .setFriction(0.5)
                .setRestitution(0.1);
            groundCollider = this.rapierWorld.createCollider(groundColliderDesc); // Returns collider handle
            console.log("[Game] Rapier ground collider created.");
            return true;

        } catch (e) {
            console.error("!!! Rapier Physics World Init Error:", e);
            stateMachine?.transitionTo('loading', { message: `FATAL: Physics World Init Error! ${e.message}`, error: true });
            return false;
        }
    }


    // --- Initialize Network ---
    initializeNetwork() {
        console.log("[Game] Initializing Network Module...");
        if (Network?.init) { try { Network.init(); console.log("Net module init OK."); return true; } catch (e) { console.error("Net Init Error:", e); stateMachine?.transitionTo('loading', { message: `FATAL: Network Failed! ${e.message}`, error: true }); return false; } }
        else { console.error("Network missing!"); stateMachine?.transitionTo('loading', { message: `FATAL: Network Load Fail!`, error: true }); return false; }
    }

    // --- Setup Asset Loading ---
    bindLoadManagerListeners() {
        if (!loadManager) { console.error("LoadManager missing!"); stateMachine?.transitionTo('loading',{message:"Load Manager Fail!", error:true}); return; }
        loadManager.on('ready', () => {
            console.log("[Game] LoadManager 'ready'."); assetsAreReady = true;
            this.mapMesh = loadManager.getAssetData('map');
            if (!this.mapMesh) { console.error("Map data missing post-ready!"); stateMachine?.transitionTo('loading', { message: "Map Data Fail!", error: true }); return; }
            console.log("[Game] Map mesh stored."); this.attemptProceedToGame(); // Check if ready to proceed
        });
        loadManager.on('error', (data) => { console.error("LoadManager error:", data); assetsAreReady = false; this.mapMesh = null; stateMachine?.transitionTo('loading',{message:`Asset Error!<br/>${data.message||'Check console.'}`,error:true}); });
        console.log("[Game] LoadManager listeners bound.");
    }

     // --- Check if ready to proceed (after assets or network ready) ---
    attemptProceedToGame() {
         // Wait for Rapier to be ready AS WELL
        if (!this.rapierWorld) {
            console.log("[Game] AttemptProceed: Waiting for Rapier world init.");
                        console.log("[Game] Map mesh stored."); this.attemptProceedToGame();
        });
        loadManager.on('error', (data) => { /* ... error handling ... */ });
        console.log("[Game] LoadManager listeners bound.");
    }

     // --- Check if ready to start game ---
    attemptProceedToGame() {
         // Check if ALL conditions are met: Rapier loaded, Physics World created, Assets Loaded, Network Init Message received
        console.log(`[Game] Check Proceed: Rapier=${this.rapierReady}, World=${!!rapierWorld}, Assets=${assetsAreReady}, NetInit=${networkIsInitialized}, Data=${!!initializationData}`);
        if (this.rapierReady && rapierWorld && assetsAreReady && networkIsInitialized && initializationData) {
            console.log("[Game] All Prerequisites met. Starting game play...");
            if (currentGameInstance?.startGamePlay) { currentGameInstance.startGamePlay(initializationData); } else { console.error("Game instance missing!"); }
        } else if (assetsAreReady && stateMachine?.is('joining') && Network?.isConnected()) {
             // This case is now less relevant as we wait for Rapier too
            console.log("[Game] Assets ready while Joining & Connected, but waiting for Rapier/InitData?");
            // Network.sendJoinDetails(); // Maybe wait until Rapier is also ready?
        } else {
             console.log(`[Game] Prerequisites not met. State: ${stateMachine?.currentState}`);
        }
        // If assets are ready but other things aren't, potentially transition to homescreen
        // Note: Need careful state management here. The original 'loading->homescreen' on asset ready might still be needed.
         if (assetsAreReady && this.rapierReady && stateMachine?.is('loading') && !networkIsInitialized && !initializationData) {
            console.log("[Game] Assets & Rapier ready, still loading state -> To Homescreen");
            stateMachine.transitionTo('homescreen', { playerCount: UIManager?.playerCountSpan?.textContent ?? '?' });
         }
    }


    // --- Initialize Other Managers ---
    initializeManagers() {
         console.log("[Game] Init Managers...");
         if(!UIManager || !Input || !stateMachine || !loadManager || !Network || !Effects) { console.error("Mgr undefined!"); UIManager?.showError("FATAL: Mgr Load Error!", 'loading'); return false; }
         try { if(!UIManager.initialize()) throw new Error("UI init fail"); Input.init(this.controls); Effects.initialize(this.scene); console.log("[Game] Managers Initialized."); return true;
         } catch (e) { console.error("!!! Mgr Init Error:", e); UIManager?.showError(`FATAL: Mgr Setup! ${e.message}`, 'loading'); return false; }
    }

    // --- Bind State Transitions ---
    bindOtherStateTransitions() {
         if(UIManager?.bindStateListeners) UIManager.bindStateListeners(stateMachine); else console.error("UIManager binding missing");
         if (stateMachine) { stateMachine.on('transition', (data) => { console.log(`[Game Listener] State: ${data.from} -> ${data.to}`); if (data.to === 'homescreen') { networkIsInitialized = false; initializationData = null; if (data.from === 'playing' || data.from === 'joining') { console.log(`Cleanup after ${data.from}...`); for(const id in this.playerRigidBodies) { if (rapierWorld && this.playerRigidBodies[id]) rapierWorld.removeRigidBody(this.playerRigidBodies[id].handle); } this.playerRigidBodies = {}; for(const id in players){ if(id !== localPlayerId && Network?._removePlayer){ Network._removePlayer(id); } } if(players?.[localPlayerId]) { delete players[localPlayerId]; } players = {}; localPlayerId = null; if(controls?.isLocked) controls.unlock(); console.log("Player/physics cleared."); } } else if (data.to === 'playing') { if (UIManager && localPlayerId && players?.[localPlayerId]) { UIManager.updateHealthBar(players[localPlayerId].health); UIManager.updateInfo(`Playing as ${players[localPlayerId].name}`); } } else if (data.to === 'loading' && data.options?.error) { console.error("Load error:", data.options.message); console.error("!!! Mgr Init Error:", e); UIManager?.showError(`FATAL: Mgr Setup Error! ${e.message}`, 'loading'); return false; }
    }

    // --- Bind State Transitions ---
    bindOtherStateTransitions() {
        if(UIManager?.bindStateListeners) UIManager.bindStateListeners(stateMachine); else console.error("UIManager binding missing");
        if (stateMachine) { stateMachine.on('transition', (data) => { console.log(`[Game Listener] State: ${data.from} -> ${data.to}`); if (data.to === 'homescreen') { networkIsInitialized = false; initializationData = null; if (data.from === 'playing' || data.from === 'joining') { console.log(`Cleanup after ${data.from}...`); for(const handle in this.physicsBodies) { if (this.rapierWorld && this.physicsBodies[handle]) this.rapierWorld.removeRigidBody(this.physicsBodies[handle]); } this.physicsBodies = {}; /* Remove RAPIER bodies */ for(const id in players){ if(id !== localPlayerId && Network?._removePlayer){ Network._removePlayer(id); } } if(players?.[localPlayerId]) { delete players[localPlayerId]; } players = {}; localPlayerId = null; if(controls?.isLocked) controls.unlock(); console.log("State cleared for homescreen."); } } else if (data.to === 'playing') { if (UIManager && localPlayerId && players?.[localPlayerId]) { UIManager.updateHealthBar(players[localPlayerId].health); UIManager.updateInfo(`Playing as ${players[localPlayerId].name}`); }} else if (data.to === 'loading' && data.options?.error) { console.error("Loading error state:", data.options.message); if(controls?.isLocked)controls.unlock(); networkIsInitialized=false; assetsAreReady=false; initializationData=null; this.mapMesh=null; this.physicsBodies={}; players={}; localPlayerId=null; } }); }
        else { console.error("stateMachine missing!"); } console.log("[Game] State Listeners Bound");
    }

    // --- Add Event Listeners ---
    addEventListeners() {
        console.log("[Game] Add listeners..."); if (UIManager?.joinButton && Network?.attemptJoinGame) { UIManager.joinButton.addEventListener('click', () => { if (!assetsAreReady) { UIManager.showError("Assets loading...", 'homescreen'); return; } Network.attemptJoinGame(); }); console.log("Join listener added."); } else { console.error("Cannot add join listener!"); } window.addEventListener('resize', this.handleResize.bind(this)); console.log("Global listeners added.");
    }

    // --- Main Update/Animate Loop ---
     animate() { // Removed timestep arg, Rapier uses internal fixed step
        requestAnimationFrame(() => this.animate()); // Loop
        const dt = this.clock.getDelta(); // Use Three clock delta for non-physics timing?

        // --- Step Physics World ---
        // Rapier recommends stepping within the animation loop. It handles internal timing.
        if (this.rapierWorld) {
             this.rapierWorld.step();
        }

        // --- Game Logic Update (If Playing) ---
        if(stateMachine?.is('playing')){
            try{ // Update local player based on input, applying forces/impulses/velocity to Rapier body
                const localPlayerBodyHandle = localPlayerId ? this.physicsBodies[localPlayerId] : null;
                const localPlayerBody = localPlayerBodyHandle ? this.rapierWorld.getRigidBody(localPlayerBodyHandle) : null;
                if (updateLocalPlayer && localPlayerBody) updateLocalPlayer(dt, localPlayerBody); // Pass body reference
            } catch(e){console.error("Err updateLP:",e);}

            try{ if(Effects?.update) Effects.update(dt); } catch(e){console.error("Err Effects.update:",e);}

             // --- Synchronize ALL Visuals with Physics ---
             const localBodyHandle = localPlayerId ? this.physicsBodies[localPlayerId] : null;
             const localBody = localBodyHandle ? this.rapierWorld.getRigidBody(localBodyHandle) : null;
             // Sync Local Player Controls
             if (localBody && controls?.getObject()) {
                 const bodyPos = localBody.translation(); // Get {x, y, z}
                 controls.getObject().position.set(bodyPos.x, bodyPos.y + (CONFIG?.CAMERA_Y_OFFSET ?? 1.6), bodyPos.z); // Apply offset from body center
                 // Rotation is driven by PointerLockControls mouse movement
             }
             // Sync Remote Player Meshes
             for (const id in players) {
                 if (id !== localPlayerId && players[id] instanceof ClientPlayer && players[id].mesh) {
                     const remoteBodyHandle = this.physicsBodies[id];
                     const remoteBody = remoteBodyHandle ? this.rapierWorld.getRigidBody(remoteBodyHandle) : null;
                     if (remoteBody) {
                          const bodyPos = remoteBody.translation(); const bodyRot = remoteBody.rotation();
                          players[id].mesh.position.set(bodyPos.x, bodyPos.y, bodyPos.z); // Sync position from body center
                          players[id].mesh.quaternion.set(bodyRot.x, bodyRot.y, bodyRot.z, bodyRot.w); // Sync rotation
                          const playerHeight = CONFIG?.PLAYER_HEIGHT || 1.8;
                           // Adjust mesh Y based on assumed origin vs physics body center
                           if (!(players[id].mesh.geometry instanceof THREE.CylinderGeometry)) { // Assuming GLB at feet, Cyl at center
                               players[id].mesh.position.y -= playerHeight / 2;
                           }
                     }
                 }
             }
        } // End if playing

        // --- Render Scene ---
        if (renderer && scene && camera) { try { renderer.render(scene, camera); } catch (e) { console.error("Render error:", e); } }
    }


    // --- Resize Handler ---
    handleResize() { if (camera) { camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); } if (renderer) { renderer.setSize(window.innerWidth, window.innerHeight); } }

    // --- Ground Contact Handler (OBSOLETE - use raycast) ---
    // handlePlayerGroundContact(event) { ... } // Remove this, logic moves to gameLogic using world.castRay


    // --- Start Game Play Method ---
    startGamePlay(initData) {
        console.log('[Game] startGamePlay called.');
        // --- Checks ---
        if (!initData?.id) { console.error("Invalid initData"); stateMachine?.transitionTo('homescreen'); UIManager?.showError("Game init fail (data).", 'homescreen'); return; }
        if (!this.rapierWorld || !RAPIER) { console.error("Physics world/Rapier missing"); stateMachine?.transitionTo('homescreen'); UIManager?.showError("Game init fail (physics).", 'homescreen'); return; }
        if (stateMachine?.is('playing')) { console.warn("Already playing"); return; }

        localPlayerId = initData.id; console.log(`[Game] Local ID: ${localPlayerId}`);
        console.log("[Game] Clearing previous state...");
        // Remove previous Rapier bodies
        for (const handle of Object.values(this.physicsBodies)) { if (handle) this.rapierWorld.removeRigidBody(handle); } this.physicsBodies = {};
        // Remove previous player data/meshes
        for (const id in players) { if (Network?._removePlayer) Network._removePlayer(id); } players = {};

        // Process players
        for(const id in initData.players){
            const sPD = initData.players[id];
            if (sPD.x === undefined || sPD.y === undefined || sPD.z === undefined) { console.warn(`Invalid pos for ${id}`); continue; }
            const playerHeight = CONFIG?.PLAYER_HEIGHT || 1.8;
            const playerRadius = CONFIG?.PLAYER_RADIUS || 0.4;
            // Capsule vertices are relative to body center. Height is total height, radius is sphere ends.
            const capsuleHalfHeight = (playerHeight - 2 * playerRadius) / 2.0;
            const bodyCenterY = sPD.y + playerHeight / 2.0; // Body center based on feet Y

            try {
                 // --- Player Collider --- Use Capsule for better movement
                let playerColliderDesc = RAPIER.ColliderDesc.capsuleY(capsuleHalfHeight > 0 ? capsuleHalfHeight : 0.01 , playerRadius) // Ensure halfHeight > 0
                    .setFriction(0.5).setRestitution(0.1).setTranslation(0,0,0); // Position relative to body

                if(id === localPlayerId){ // --- LOCAL PLAYER ---
                    console.log(`[Game] Init local player: ${sPD.name}`);
                    players[id] = { ...sPD, isLocal: true, mesh: null }; // Cache server data

                    let rigidBodyDesc = RAPIER.RigidBodyDesc.dynamic()
                        .setTranslation(sPD.x, bodyCenterY, sPD.z) // Set initial position
                        .setLinearDamping(0.5)
                        .setAngularDamping(0.9)
                        .lockRotations(); // Lock all rotations for simple character controller
                        // .restrictRotations(true, false, true); // Alt: Only allow Y rotation

                    let body = this.rapierWorld.createRigidBody(rigidBodyDesc);
                    if (!body) throw new Error("Local body creation failed.");
                    this.rapierWorld.createCollider(playerColliderDesc, body); // Attach collider
                    this.physicsBodies[id] = body.handle; // STORE THE HANDLE
                    console.log(`Created DYNAMIC body handle ${body.handle} for local player ${id}`);


                    if(controls?.getObject()){ controls.getObject().position.set(sPD.x, bodyCenterY + (CONFIG?.CAMERA_Y_OFFSET ?? 1.6) , sPD.z); }
                    if(UIManager){ UIManager.updateHealthBar(sPD.health ?? 100); UIManager.updateInfo(`Playing as ${sPD.name}`); UIManager.clearError('homescreen'); UIManager.clearKillMessage(); }

                } else { // --- REMOTE PLAYER ---
                     if(Network?._addPlayer) Network._addPlayer(sPD); const remotePlayer = players[id];
                     if (remotePlayer instanceof ClientPlayer && world) {
                         let rigidBodyDesc = RAPIER.RigidBodyDesc.kinematicPositionBased() // Use Kinematic
                             .setTranslation(sPD.x, bodyCenterY, sPD.z)
                             .setRotation({ x: 0, y: sPD.rotationY || 0, z: 0, w: 1}); // TODOreturn;
        }
        console.log(`[Game] Check Proceed: RAPIER READY, assets=${assetsAreReady}, net=${networkIsInitialized}, data=${!!initializationData}`);
        if (assetsAreReady && networkIsInitialized && initializationData) {
            console.log("All Ready -> startGamePlay"); if (currentGameInstance?.startGamePlay) { currentGameInstance.startGamePlay(initializationData); } else { console.error("Game instance missing!"); }
        } else if (assetsAreReady && stateMachine?.is('joining') && Network?.isConnected()) {
            console.log("Ready while Joining -> sendJoinDetails"); Network.sendJoinDetails();
        } else if (assetsAreReady && (stateMachine?.is('loading') || stateMachine?.is('uninitialized')) && !networkIsInitialized && !initializationData) {
             console.log("Ready while Loading -> HomeScreen"); let pCount = '?'; if (UIManager?.playerCountSpan) pCount = UIManager.playerCountSpan.textContent ?? '?'; stateMachine.transitionTo('homescreen', { playerCount: pCount });
        } else if (!assetsAreReady && stateMachine?.is('loading')) {
             console.log("[Game] Still loading assets..."); // Don't transition away from loading if assets aren't done
        } else {
             console.log(`Not ready or invalid state: ${stateMachine?.currentState}`);
        }
    }


    // --- Initialize Core Components (Three.js Only) ---
    initializeCoreComponents() {
        console.log("[Game] Init Core Components (Three.js)...");
         try { // Setup scene, camera, renderer, controls, loaders, lights
             this.scene = new THREE.Scene(); scene = this.scene; this.scene.background = new THREE.Color(0x6699cc); this.scene.fog = new THREE.Fog(0x6699cc, 0, 200);
             this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000); camera = this.camera;
             this.clock = new THREE.Clock(); clock = this.clock; const canvas = document.getElementById('gameCanvas'); if (!canvas) throw new Error("#gameCanvas missing!");
             this.renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true }); renderer = this.renderer; this.renderer.setSize(window.innerWidth, window.innerHeight); this.renderer.shadowMap.enabled = true;
             this.controls = new THREE.PointerLockControls(this.camera, document.body); controls = this.controls; this.controls.addEventListener('lock', ()=>{console.log('[Controls] Locked');}); this.controls.addEventListener('unlock', ()=>{console.log('[Controls] Unlocked');});
             dracoLoader = new THREE.DRACOLoader(); dracoLoader.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/libs/draco/'); dracoLoader.setDecoderConfig({ type: 'js' }); dracoLoader.preload(); loader = new THREE.GLTFLoader(); loader.setDRACOLoader(dracoLoader);
             const ambL = new THREE.AmbientLight(0xffffff, 0.7); this.scene.add(ambL); const dirL = new THREE.DirectionalLight(0xffffff, 1.0); dirL.position.set(15, 20, 10); dirL.castShadow = true; dirL.shadow.mapSize.width=1024; dirL.shadow.mapSize.height=1024; this.scene.add(dirL); this.scene.add(dirL.target);
             console.log("[Game] Three.js Components OK."); return true;
         } catch(e) { console.error("!!! Core Comp Init Error:", e); UIManager?.showError(`FATAL Init Error! ${e.message}`, 'loading'); return false; }
    }

    // --- Initialize Other Managers ---
    initializeManagers() {
        console.log("[Game] Init Managers...");
         if(!UIManager || !Input || !stateMachine || !loadManager || !Network || !Effects) { console.error("Mgr undefined!"); UIManager?.showError("FATAL: Mgr Load Error!", 'loading'); return false; }
         try { if(!UIManager.initialize()) throw new Error("UI init fail"); Input.init(this.controls); Effects.initialize(this.scene); console.log("[Game] Managers Initialized."); return true;
         } catch (e) { console.error("!!! Mgr Init Error:", e); UIManager?.showError(`FATAL: Mgr Setup Error! ${e.message}`, 'loading'); return false; }
    }

    // --- Bind State Transitions ---
    bindOtherStateTransitions() {
        if(UIManager?.bindStateListeners) UIManager.bindStateListeners(stateMachine); else console.error("UIManager binding missing");
        if (stateMachine) { stateMachine.on('transition', (data) => { console.log(`[Game Listener] State: ${data.from} -> ${data.to}`); if (data.to === 'homescreen') { networkIsInitialized = false; initializationData = null; if (data.from === 'playing' || data.from === 'joining') { console.log(`Cleanup after ${data.from}...`); for(const id in this.physicsBodies) { const body = this.rapierWorld?.getRigidBody(this.physicsBodies[id]?.handle); if(this.rapierWorld && body) this.rapierWorld.removeRigidBody(body); } this.physicsBodies = {}; for(const id in players){ if(id !== localPlayerId && Network?._removePlayer){ Network._removePlayer(id); } } if(players?.[localPlayerId]) { delete players[localPlayerId]; } players = {}; localPlayerId = null; if(controls?.isLocked) controls.unlock(); console.log("State cleared."); } } else if (data.to === 'playing') { if (UIManager && localPlayerId && players?.[localPlayerId]) { UIManager.updateHealthBar(players[localPlayerId].health); UIManager.updateInfo(`Playing as ${players[localPlayerId].name}`); }} else if (data.to === 'loading' && data.options?.error) { console.error("Loading error:", data.options.message); if(controls?.isLocked)controls.unlock(); networkIsInitialized=false; assetsAreReady=false; initializationData=null; this.mapMesh=null; this.physicsBodies={}; players={}; localPlayerId=null; } }); }
        else { console.error("stateMachine missing!"); } console.log("[Game] State Listeners Bound");
    }

    // --- Add Event Listeners ---
    addEventListeners() {
        console.log("[Game] Add listeners..."); if (UIManager?.joinButton && Network?.attemptJoinGame) { UIManager.joinButton.addEventListener('click', () => { if (!assetsAreReady || !this.rapierWorld) { UIManager.showError("Loading assets/physics...", 'homescreen'); return; } Network.attemptJoinGame(); }); console.log("Join listener added."); } else { console.error("Cannot add join listener!"); } window.addEventListener('resize', this.handleResize.bind(this)); console.log("Global listeners added.");
    }

    // --- Main Update/Animate Loop ---
     animate() { // Remove physicsTimeStep arg if(controls?.isLocked)controls.unlock(); networkIsInitialized=false; assetsAreReady=false; initializationData=null; this.mapMesh=null; this.playerRigidBodies = {}; players={}; localPlayerId=null; } }); }
         else { console.error("stateMachine missing!"); } console.log("[Game] State Listeners Bound");
    }

    // --- Add Event Listeners ---
    addEventListeners() {
        console.log("[Game] Add listeners..."); if (UIManager?.joinButton && Network?.attemptJoinGame) { UIManager.joinButton.addEventListener('click', () => { // Check all prerequisites now
             if (!this.rapierReady || !rapierWorld) { UIManager.showError("Physics loading...", 'homescreen'); return; } if (!assetsAreReady) { UIManager.showError("Assets loading...", 'homescreen'); return; } Network.attemptJoinGame(); }); console.log("Join listener added."); } else { console.error("Cannot add join listener!"); } window.addEventListener('resize', this.handleResize.bind(this)); console.log("Global listeners added.");
    }

    // --- Main Update/Animate Loop ---
     animate(physicsTimeStep) { // physicsTimeStep might not be needed if Rapier handles dt well
        requestAnimationFrame(() => this.animate(physicsTimeStep));
        const dt = this.clock ? this.clock.getDelta() : 0.016; // Use clock delta time

        // --- Physics Step ---
        if (rapierWorld) {
            rapierWorld.step(rapierEventQueue); // Step the simulation

            // --- Process Collision Events (for Ground Check etc.) ---
            if (rapierEventQueue) {
                rapierEventQueue.drainCollisionEvents((handle1, handle2, started) => {
                     // Check if local player body handle collided with ground body handle
                     const localBody = localPlayerId ? this.playerRigidBodies[localPlayerId] : null;
                     // IMPORTANT: Need ground body handle. Rapier doesn't have global like Cannon groundBody ref easily.
                     // We need to query by collider handle perhaps, or tag the ground body/collider.
                     // SIMPLIFICATION for now: Assume ground is static/fixed and check collision type.
                     if(localBody?.handle === handle1 || localBody?.handle === handle2) {
                          // console.log(`Collision Event: Started=${started}, Handle1=${handle1}, Handle2=${handle2}`);
                          if (started) {
                              // Check if the *other* body is potentially the ground (is it fixed?)
                              let otherHandle = (localBody.handle === handle1) ? handle2 : handle1;
                              let otherBody = rapierWorld.getRigidBody(otherHandle);
                              if (otherBody && otherBody.isFixed()) {
                                  // This is likely the ground. Check normal if needed for slopes.
                                  // For now, any collision start with a fixed body implies grounded.
                                   window.isPlayerGrounded = true; // Set global flag (from rapier_test.js)
                                  // console.log("Ground contact start.");
                              }
                          } else {
                               // Collision ended, doesn't necessarily mean not grounded if still touching elsewhere
                               // Grounded flag should be reset each frame in gameLogic for robustness
                          }
                     }
                 });
            }
        }

        // --- Game Logic Update ---
        if(stateMachine?.is('playing')){
            try{ const localPlayerBody = localPlayerId ? this.playerRigidBodies[localPlayerId] : null; if (updateLocalPlayer) updateLocalPlayer(dt, localPlayerBody); } catch(e){console.error("Err updateLP:",e);}
            try{ if(Effects?.update) Effects.update(dt); } catch(e){console.error("Err Effects.update:",e);}

             // --- Sync Visuals ---
             const localBody = localPlayerId ? this.playerRigidBodies[localPlayerId] : null;
             // Sync Local Controls
             if (localBody && controls?.getObject()) {
                 const bodyPos = localBody.translation(); // Use Rapier methods
                 controls.getObject().position.set(bodyPos.x, bodyPos.y + (CONFIG?.CAMERA_Y_OFFSET ?? 1.6), bodyPos.z); // Add offset
             }
             // Sync Remote Meshes
             for (const id in players) {
                 if (id !== localPlayerId && players[id] instanceof ClientPlayer && players[id].mesh) {
                     const remoteBody = this.playerRigidBodies[id];
                     if (remoteBody) {
                          const bodyPos = remoteBody.translation();
                          const bodyRot = remoteBody.rotation(); // Rapier quaternion
                          players[id].mesh.position.set(bodyPos.x, bodyPos.y, bodyPos.z);
                          players[id].mesh.quaternion.set(bodyRot.x, bodyRot.y, bodyRot.z, bodyRot.w);
                          const playerHeight = CONFIG?.PLAYER_HEIGHT || 1.8;
                          // Adjust Y based on assumption that physics body is centered, but GLB model origin is feet
                          if (!(players[id].mesh.geometry instanceof THREE.CylinderGeometry)) { players[id].mesh.position.y -= playerHeight / 2.0; }
                     }
                 }
             }
        }

        // --- Render ---
        if (renderer && scene && camera) { try { renderer.render(scene, camera); } catch (e) { console.error("Render error:", e); } }
    }


    // --- Resize Handler ---
    handleResize() { if (camera) { camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); } if (renderer) { renderer.setSize(window.innerWidth, window.innerHeight); } }


    // --- Start Game Play Method ---
    startGamePlay(initData) {
        console.log('[Game] startGamePlay called.');
        if (!initData || !initData.id || !rapierWorld || !RAPIER) { console.error("Invalid initData or Rapier/World missing"); stateMachine?.transitionTo('homescreen'); UIManager?.showError("Game init failed (setup).", 'homescreen'); return; }
        if (stateMachine?.is('playing')) { console.warn("Already playing"); return; }

        localPlayerId = initData.id; console.log(`[Game] Local ID: ${localPlayerId}`);
        console.log("[Game] Clearing previous state...");
        //: Convert Euler to Quat
                             // Quat conversion: Need THREE.Quaternion() or manual calculation
                             // let q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, sPD.rotationY || 0, 0));
                             // rigidBodyDesc.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w });


                         let body = this.rapierWorld.createRigidBody(rigidBodyDesc);
                         if (!body) throw new Error(`Remote body ${id} fail.`);
                         this.rapierWorld.createCollider(playerColliderDesc, body); // Attach collider
                         this.physicsBodies[id] = body.handle; // STORE HANDLE
                         console.log(`Created KINEMATIC body handle ${body.handle} for remote player ${id}`);
                     } else { console.warn(`Skip remote physics body ${id}.`); }
                }
            } catch(bodyError) { console.error(`Body creation error for ${id}:`, bodyError); stateMachine?.transitionTo('homescreen'); UIManager?.showError("Game init fail (body).", 'homescreen'); return; }
        } // End for loop

        console.log(`[Game] Init complete. ${Object.keys(players).length} players.`);
        if(stateMachine){ console.log("[Game] Transitioning state to 'playing'..."); stateMachine.transitionTo('playing'); }
        else { console.error("stateMachine missing!"); }
    }

    // --- Start Asset Loading ---
    startAssetLoading() { /* ... same as before ... */ }

} // End Game Class

// --- Global Entry Point & DOM Ready ---
function runGame() { console.log("--- runGame() ---"); try { const gI=new Game(); window.currentGameInstance=gI; gI.start(); window.onresize=()=>gI.handleResize(); } catch(e){console.error("!!Error creating Game:",e);document.body.innerHTML="<p>GAME INIT FAILED.</p>";}}
if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',runGame);}else{runGame();}
console.log("game.js loaded (Using Rapier)");
