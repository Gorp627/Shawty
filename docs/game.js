// docs/game.js - Main Game Orchestrator (with Cannon-es)

// --- Global Flags and Data ---
let networkIsInitialized = false;
let assetsAreReady = false;
let initializationData = null;
var currentGameInstance = null;

// --- Physics Constants ---
const timeStep = 1 / 60; // Default value, will use CONFIG if available

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

        const effectiveTimeStep = typeof CONFIG !== 'undefined' ? (CONFIG.PHYSICS_TIMESTEP || 1 / 60) : 1/60;

        if (!this.initializeCoreComponents()) { return; }
        if (!this.initializeManagers()) { return; }
        if (!this.initializeNetwork()) { return; }

        this.bindLoadManagerListeners();
        this.bindOtherStateTransitions();
        this.addEventListeners();

        if(typeof stateMachine!=='undefined') stateMachine.transitionTo('loading'); else console.error("stateMachine missing!");
        this.startAssetLoading();

        this.animate(effectiveTimeStep);
        console.log("[Game] Started successfully setup.");
    }

    // --- Initialize Network (NEW METHOD) ---
    initializeNetwork() {
        console.log("[Game] Initializing Network Module...");
        if (typeof Network !== 'undefined' && typeof Network.init === 'function') {
            try {
                Network.init(); // Calls setupSocketIO etc.
                console.log("[Game] Network module initialized.");
                return true;
            } catch (e) {
                console.error("!!! Network Module Init Error:", e);
                if (typeof stateMachine !== 'undefined') stateMachine.transitionTo('loading', { message: `FATAL: Network Module Failed! ${e.message}`, error: true });
                return false;
            }
        } else {
            console.error("Network object or Network.init function missing!");
            if (typeof stateMachine !== 'undefined') stateMachine.transitionTo('loading', { message: `FATAL: Network Module Load Failed!`, error: true });
            return false;
        }
    }


    // --- Setup Asset Loading ---
    bindLoadManagerListeners() {
        console.log("[Game] Binding LoadManager listeners...");
        if (typeof loadManager === 'undefined') { console.error("LoadManager missing!"); return; }

        loadManager.on('ready', () => {
            console.log("[Game] LoadManager 'ready' event received.");
            assetsAreReady = true;
            this.mapMesh = loadManager.getAssetData('map');
            if (!this.mapMesh) {
                console.error("!!! [Game] LoadManager 'ready' but mapMesh data missing!");
                if(typeof stateMachine!=='undefined') stateMachine.transitionTo('loading', { message: "FATAL: Map asset data failed!", error: true });
                return;
            }
            console.log("[Game] Visual map mesh reference stored.");

            // <<< REVISED LOGIC >>>
            // Assets are ready. Decide what state to enter next.
            if (networkIsInitialized && initializationData) {
                // This case is rare: if network init message arrived BEFORE assets finished.
                console.log("[Game LoadReady Handler] Assets ready, Network init already happened. Starting game play.");
                if (currentGameInstance?.startGamePlay) {
                    currentGameInstance.startGamePlay(initializationData);
                } else { console.error("[Game LoadReady Handler] Game instance missing!"); }
            } else if (stateMachine?.is('joining') && Network?.isConnected()) {
                 // Assets finished while joining AND connected, let Network handle sending details
                 console.log("[Game LoadReady Handler] Assets ready while joining & connected. Network should send details.");
                 // Potentially redundant if Network.connect already triggered this, but safe fallback
                 Network.sendJoinDetails();
            } else if (stateMachine?.is('loading') || stateMachine?.is('uninitialized')) {
                // Default: Assets are ready, but we haven't started joining or received init data.
                // Go to the HomeScreen.
                console.log("[Game LoadReady Handler] Assets ready. Transitioning to HomeScreen.");
                 stateMachine.transitionTo('homescreen', { playerCount: UIManager?.playerCountSpan?.textContent ?? '?' });
            } else {
                 // Already on homescreen, joining, or playing - assets just finished in background? No state change needed here.
                  console.log(`[Game LoadReady Handler] Assets ready, state is '${stateMachine?.currentState || 'Unknown'}'. No immediate action.`);
            }
             // REMOVED the call to this.attemptProceedToGame() from here - logic moved above.
        });

        loadManager.on('error', (data) => {
            console.error("[Game] LoadManager 'error' event received.", data);
            assetsAreReady = false;
            this.mapMesh = null;
            if(typeof stateMachine!=='undefined') stateMachine.transitionTo('loading',{message:`FATAL: Asset Error!<br/>${data.message||'Check console.'}`,error:true});
        });
    }

     // --- Centralized logic (OBSOLETE/REMOVED - logic moved to handlers) ---
    // attemptProceedToGame() { ... }


    // --- Initialize Core Components (Three.js + Cannon.js) ---
    initializeCoreComponents() {
         console.log("[Game] Init Core Components (Three.js & Cannon.js)...");
         try {
             this.scene = new THREE.Scene(); scene = this.scene;
             this.scene.background = new THREE.Color(0x6699cc); this.scene.fog = new THREE.Fog(0x6699cc, 0, 200);
             this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000); camera = this.camera;
             this.clock = new THREE.Clock(); clock = this.clock;
             const canvas = document.getElementById('gameCanvas'); if (!canvas) throw new Error("Fatal: #gameCanvas not found!");
             this.renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true }); renderer = this.renderer;
             this.renderer.setSize(window.innerWidth, window.innerHeight); this.renderer.shadowMap.enabled = true;
             this.controls = new THREE.PointerLockControls(this.camera, document.body); controls = this.controls;
             this.controls.addEventListener('lock', () => { console.log('[Controls] Locked'); }); this.controls.addEventListener('unlock', () => { console.log('[Controls] Unlocked'); });
             dracoLoader = new THREE.DRACOLoader(); dracoLoader.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/libs/draco/'); dracoLoader.setDecoderConfig({ type: 'js' }); dracoLoader.preload();
             loader = new THREE.GLTFLoader(); loader.setDRACOLoader(dracoLoader);
             const ambL = new THREE.AmbientLight(0xffffff, 0.7); this.scene.add(ambL);
             const dirL = new THREE.DirectionalLight(0xffffff, 1.0); dirL.position.set(15, 20, 10); dirL.castShadow = true; dirL.shadow.mapSize.width = 1024; dirL.shadow.mapSize.height = 1024;
             this.scene.add(dirL); this.scene.add(dirL.target);
             console.log("[Game] Three.js Components OK.");

             if (typeof CANNON === 'undefined') throw new Error("Cannon library not loaded! Check index.html.");
             this.world = new CANNON.World(); world = this.world;
             this.world.gravity.set(0, (typeof CONFIG !== 'undefined' ? CONFIG.GRAVITY : -9.82), 0);
             this.world.broadphase = new CANNON.NaiveBroadphase();

             const groundMaterial = new CANNON.Material("groundMaterial");
             const playerMaterial = new CANNON.Material("playerMaterial");
             const groundPlayerContactMaterial = new CANNON.ContactMaterial( groundMaterial, playerMaterial, { friction: 0.1, restitution: 0.1 });
             this.world.addContactMaterial(groundPlayerContactMaterial);

             const groundShape = new CANNON.Plane();
             const groundBody = new CANNON.Body({ mass: 0, shape: groundShape, material: groundMaterial });
             groundBody.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
             groundBody.position.set(0, 0, 0);
             this.world.addBody(groundBody);
             console.log("[Game] Cannon.js World and Ground OK.");

             return true;
         } catch(e) {
             console.error("!!! Core Component Init Error:", e);
             if(typeof UIManager !== 'undefined' && UIManager?.showError) UIManager.showError(`FATAL: Graphics/Physics Init Error! ${e.message}`, 'loading');
             else alert(`FATAL: Graphics/Physics Init Error! ${e.message}`);
             return false;
         }
    }

    // --- Initialize Other Managers ---
    initializeManagers() {
         console.log("[Game] Init Managers...");
         if(typeof UIManager === 'undefined' || typeof Input === 'undefined' || typeof stateMachine === 'undefined' || typeof loadManager === 'undefined' || typeof Network === 'undefined' || typeof Effects === 'undefined') { /* ... error handling ... */ return false; }
         try {
             if(!UIManager.initialize()) throw new Error("UIManager failed init");
             Input.init(this.controls);
             Effects.initialize(this.scene);
             console.log("[Game] Managers Initialized.");
             return true;
         } catch (e) { /* ... error handling ... */ return false; }
    }

    // --- Bind State Transitions ---
    bindOtherStateTransitions() {
        if(typeof UIManager !== 'undefined' && UIManager?.bindStateListeners) UIManager.bindStateListeners(stateMachine); else console.error("UIManager missing when binding listeners");
        if (typeof stateMachine !== 'undefined') {
            stateMachine.on('transition', (data) => {
                 console.log(`[Game State Listener] Transition: ${data.from} -> ${data.to}`);
                 if (data.to === 'homescreen') {
                     networkIsInitialized = false; initializationData = null; console.log("[Game] Reset network/init flags for homescreen.");
                     if (data.from === 'playing' || data.from === 'joining') {
                         console.log(`[Game] Cleanup after ${data.from} state...`);
                         for(const id in this.physicsBodies) { if (this.world) this.world.removeBody(this.physicsBodies[id]); } this.physicsBodies = {};
                         for(const id in players){ if(id !== localPlayerId && Network?._removePlayer){ Network._removePlayer(id); } }
                         if(players && players[localPlayerId]) { delete players[localPlayerId]; }
                         players = {}; localPlayerId = null;
                         if(controls?.isLocked) controls.unlock(); console.log("[Game] Player/physics state cleared.");
                     }
                 } else if (data.to === 'playing') {
                     console.log("[Game] State transitioned to 'playing'.");
                     if (typeof UIManager !== 'undefined' && localPlayerId && players[localPlayerId]) UIManager.updateHealthBar(players[localPlayerId].health);
                     if (typeof UIManager !== 'undefined' && players[localPlayerId]?.name) UIManager.updateInfo(`Playing as ${players[localPlayerId].name}`);
                 } else if (data.to === 'loading' && data.options?.error) { /* ... error handling ... */ }
            });
        } else { console.error("stateMachine missing for transitions!"); }
        console.log("[Game] Other State Listeners Bound");
    }

    // --- Add Event Listeners ---
    addEventListeners() {
        console.log("[Game] Add global listeners...");
        if (typeof UIManager?.joinButton !== 'undefined' && typeof Network?.attemptJoinGame === 'function') {
            UIManager.joinButton.addEventListener('click', () => {
                if (!assetsAreReady) { UIManager.showError("Assets loading...", 'homescreen'); return; }
                Network.attemptJoinGame();
            }); console.log("[Game] Join listener added.");
        } else { console.error("Cannot add join listener!"); }
        window.addEventListener('resize', this.handleResize.bind(this));
        console.log("[Game] Global Listeners added.");
    }

    // --- Main Update/Animate Loop ---
     animate(physicsTimeStep) {
        requestAnimationFrame(() => this.animate(physicsTimeStep));
        const now = performance.now();
        const dt = (now - this.lastCallTime) / 1000.0;
        this.lastCallTime = now;

        if (this.world) { this.world.step(physicsTimeStep, dt); }

        if(stateMachine?.is('playing')){
            try{
                const localPlayerBody = localPlayerId ? this.physicsBodies[localPlayerId] : null;
                if (updateLocalPlayer) updateLocalPlayer(dt, localPlayerBody);
            } catch(e){console.error("Err updateLP:",e);}
            try{ if(Effects?.update) Effects.update(dt); } catch(e){console.error("Err Effects.update:",e);}

             // Sync Visuals
             const localBody = localPlayerId ? this.physicsBodies[localPlayerId] : null;
             if (localBody && controls?.getObject()) {
                 controls.getObject().position.copy(localBody.position);
                 controls.getObject().position.y += (CONFIG?.CAMERA_Y_OFFSET !== undefined ? CONFIG.CAMERA_Y_OFFSET : 1.6);
             }
             for (const id in players) {
                 if (id !== localPlayerId && players[id] instanceof ClientPlayer && players[id].mesh) {
                     const remoteBody = this.physicsBodies[id];
                     if (remoteBody) {
                          players[id].mesh.position.copy(remoteBody.position);
                          players[id].mesh.quaternion.copy(remoteBody.quaternion);
                          const playerHeight = CONFIG?.PLAYER_HEIGHT || 1.8;
                           if (!(players[id].mesh.geometry instanceof THREE.CylinderGeometry)) {
                               players[id].mesh.position.y -= playerHeight / 2;
                           }
                     }
                 }
             }
        }

        if (renderer && scene && camera) { try { renderer.render(scene, camera); } catch (e) { console.error("Render error:", e); } }
    }


    // --- Resize Handler ---
    handleResize() {
        if (this.camera) { this.camera.aspect = window.innerWidth / window.innerHeight; this.camera.updateProjectionMatrix(); }
        if (this.renderer) { this.renderer.setSize(window.innerWidth, window.innerHeight); }
    }

    // --- Start Game Play Method ---
    startGamePlay(initData) {
        console.log('[Game] startGamePlay called.');
        if (!initData || !initData.id || !this.world) { /* ... error handling ... */ return; }
        if (stateMachine?.is('playing')) { /* ... warning ... */ return; }
        if (!this.mapMesh) { /* ... error handling ... */ return; } // Keep mapMesh check as visual is needed

        localPlayerId = initData.id; console.log(`[Game] Local ID: ${localPlayerId}`);
        console.log("[Game] Clearing previous player/physics state...");
        for (const id in this.physicsBodies) { if (this.world) this.world.removeBody(this.physicsBodies[id]); } this.physicsBodies = {};
        for (const id in players) { if (Network?._removePlayer) Network._removePlayer(id); } players = {};

        let iPosX=0, iPosY=0, iPosZ=0;
        const playerMaterial = this.world.materials.find(m => m.name === "playerMaterial");

        // Process player data from server
        for(const id in initData.players){
            const sPD = initData.players[id];
            const playerHeight = CONFIG?.PLAYER_HEIGHT || 1.8;
            const playerRadius = CONFIG?.PLAYER_RADIUS || 0.4;
            const bodyCenterY = sPD.y + playerHeight / 2.0;

            if(id === localPlayerId){
                console.log(`[Game] Init local player: ${sPD.name}`);
                players[id] = { ...sPD, isLocal: true, mesh: null };
                iPosX=sPD.x; iPosY=sPD.y; iPosZ=sPD.z;

                const playerShape = new CANNON.Sphere(playerRadius);
                const playerBody = new CANNON.Body({ mass: CONFIG?.PLAYER_MASS || 70, position: new CANNON.Vec3(sPD.x, bodyCenterY, sPD.z), shape: playerShape, material: playerMaterial, linearDamping: 0.5, angularDamping: 0.9 });
                 playerBody.angularFactor.set(0,1,0);
                this.world.addBody(playerBody); this.physicsBodies[id] = playerBody;
                console.log(`[Game] Created local physics body at y=${bodyCenterY.toFixed(2)}`);

                if(controls?.getObject()){ controls.getObject().position.copy(playerBody.position); controls.getObject().position.y += (CONFIG?.CAMERA_Y_OFFSET !== undefined ? CONFIG.CAMERA_Y_OFFSET : 1.6); }

                if(UIManager){ UIManager.updateHealthBar(sPD.health); UIManager.updateInfo(`Playing as ${players[id].name}`); UIManager.clearError('homescreen'); UIManager.clearKillMessage(); }

            } else {
                 if(Network?._addPlayer) Network._addPlayer(sPD);
                 const remotePlayer = players[id];
                 if (remotePlayer instanceof ClientPlayer && world) {
                     const remoteShape = new CANNON.Sphere(playerRadius);
                     const remoteBody = new CANNON.Body({ mass: 0, shape: remoteShape, position: new CANNON.Vec3(sPD.x, bodyCenterY, sPD.z), type: CANNON.Body.KINEMATIC, material: playerMaterial });
                     remoteBody.quaternion.setFromEuler(0, sPD.rotationY || 0, 0);
                     this.world.addBody(remoteBody); this.physicsBodies[id] = remoteBody;
                 }
            }
        }
        console.log(`[Game] Init complete. ${Object.keys(players).length} players.`);

        if(stateMachine){ console.log("[Game] Transitioning state to 'playing'..."); stateMachine.transitionTo('playing'); }
        else { console.error("stateMachine missing!"); }
    }

    // --- Added method for consistency ---
    startAssetLoading() {
        console.log("[Game] Starting asset load via LoadManager...");
        if (typeof loadManager !== 'undefined') {
            loadManager.startLoading();
        } else {
             console.error("LoadManager missing - cannot start loading!");
             if(typeof stateMachine !== 'undefined') stateMachine.transitionTo('loading', {message:"FATAL: Asset Loading Manager failed!", error: true});
        }
    }

} // End Game Class

// --- Global Entry Point: runGame ---
function runGame() { console.log("--- runGame() ---"); try { const gI=new Game(); window.currentGameInstance=gI; gI.start(); window.onresize=()=>gI.handleResize(); } catch(e){console.error("Error creating Game:",e);document.body.innerHTML="<p>GAME INIT FAILED.</p>";}}

// --- DOM Ready Execution ---
if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',runGame);}else{runGame();}
console.log("game.js loaded (Revised Ready Handler Logic)");
