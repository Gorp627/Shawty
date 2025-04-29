// docs/game.js - Main Game Orchestrator (Log/Validate Physics Position - FULL FILE v3)

// --- Global Flags and Data ---
let networkIsInitialized = false; let assetsAreReady = false; let initializationData = null;
var currentGameInstance = null; // Holds the single Game instance
var RAPIER = window.RAPIER || null; // Will be populated by rapier_init.js
var rapierWorld = null;
var rapierEventQueue = null;
window.isRapierReady = window.isRapierReady || false; // Flag set by rapier_init.js

// Debug flags (Set these for testing)
const USE_SIMPLE_GROUND = false; // <<< Use the actual map
const DEBUG_FIXED_CAMERA = false; // <<< Use dynamic camera linked to player
const DEBUG_MINIMAL_RENDER_LOOP = false; // <<< Run full game loop
const DEBUG_FORCE_SPAWN_POS = true; // <<< FORCE SPAWN POSITION NEAR ORIGIN

class Game {
    // --- Constructor ---
    constructor() {
        // Core Three.js components
        this.scene = null; this.camera = null; this.renderer = null; this.controls = null; this.clock = null;
        // Game state references (using globals defined in config.js)
        this.players = window.players; // Reference global players object
        this.keys = window.keys;       // Reference global keys object
        this.mapMesh = null; // Reference to loaded map asset
        this.simpleGroundMesh = null; // Reference to the simple visual ground plane (if used)
        // Physics state
        this.playerRigidBodyHandles = {}; // Stores Rapier RigidBody handles keyed by player ID
        this.mapColliderHandle = null;    // Stores the Rapier Collider handle for the map/ground
        this.rapierReady = window.isRapierReady; // Check initial Rapier status
        // Timing
        this.lastCallTime = performance.now(); // For performance monitoring (optional)
        this._physicsLogCounter = 0; // Counter for selective logging in animate loop

        console.log("[Game] Instance created.");

        // --- Rapier Initialization Listener ---
        // This handles the case where Rapier finishes loading *after* the Game object is created.
        if (!this.rapierReady) {
            window.addEventListener('rapier-ready', () => {
                console.log("[Game] Received 'rapier-ready' event.");
                RAPIER = window.RAPIER; // Ensure global RAPIER is assigned from window
                if (!RAPIER) {
                    console.error("!!! CRITICAL: RAPIER object is missing even after 'rapier-ready' event!");
                    if (UIManager) UIManager.showError(`FATAL: Physics Load Fail! (Event)`, 'loading');
                    if (stateMachine) stateMachine.transitionTo('loading', { message: "Physics Lib Failed! (Event)", error: true });
                } else {
                    this.initializePhysics(); // Initialize physics world now
                    this.attemptProceedToGame(); // Check if ready for homescreen/game
                }
            }, { once: true }); // Only run this listener once
        } else {
            // Rapier was already ready when the game instance was created
            if (!window.RAPIER) {
                console.error("!!! CRITICAL: Rapier flag was true, but global RAPIER object is missing!");
                if (UIManager) UIManager.showError(`FATAL: Physics Load Fail! (Flag)`, 'loading');
                if (stateMachine) stateMachine.transitionTo('loading', { message: "Physics Lib Failed! (Flag)", error: true });
            } else {
                RAPIER = window.RAPIER; // Ensure global is assigned
                this.initializePhysics(); // Initialize physics world immediately
                console.log("[Game] Rapier was already ready on construct.");
            }
        }
    }

    // --- Start Method: Kicks off the entire initialization process ---
    start() {
        console.log("[Game] Starting game initialization process...");
        // Reset core state variables for a fresh start
        networkIsInitialized = false;
        assetsAreReady = false;
        initializationData = null;
        this.mapMesh = null; this.simpleGroundMesh = null;
        this.playerRigidBodyHandles = {};
        this.mapColliderHandle = null;
        this.lastCallTime = performance.now();

        // Initialize subsystems in order
        if (!this.initializeThreeJS()) { return; } // Stop if Three.js fails
        if (!this.initializeManagers()) { return; } // Stop if essential managers fail
        if (!this.initializeNetwork()) { return; } // Stop if network setup fails

        // Bind event listeners after managers are initialized
        this.bindLoadManagerListeners();
        this.bindOtherStateTransitions();
        this.addEventListeners();

        console.log("[Game] Triggering Asset loading and waiting for Rapier...");
        this.startAssetLoading(); // Start loading map/player models

        // Set initial state machine state
        if (stateMachine) stateMachine.transitionTo('loading', { message: "Initializing..." });
        else console.error("!!! StateMachine is missing during start!");

        this.animate(); // Start the main render/update loop
        console.log("[Game] Basic setup complete. Main loop started. Waiting for assets and Rapier...");
    }

    // --- Initialize Three.js Scene, Renderer, Camera, Controls, Loader ---
    initializeThreeJS() {
        console.log("[Game] Initializing Three.js...");
        try {
            this.scene = new THREE.Scene(); window.scene = this.scene; // Assign to global scope
            this.scene.background = new THREE.Color(0x6699cc); // Sky blue
            this.scene.fog = new THREE.Fog(0x6699cc, 20, 200); // Fog effect

            this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
            window.camera = this.camera; // Assign to global scope
            // Initial camera position set by syncCameraToBody later unless debugging

            this.clock = new THREE.Clock(); window.clock = this.clock; // Assign to global scope
            const canvasElement = document.getElementById('gameCanvas');
            if (!canvasElement) throw new Error("Required canvas element '#gameCanvas' not found in HTML!");

            this.renderer = new THREE.WebGLRenderer({ canvas: canvasElement, antialias: true });
            window.renderer = this.renderer; // Assign to global scope
            this.renderer.setSize(window.innerWidth, window.innerHeight);
            this.renderer.shadowMap.enabled = true; // Enable shadows
            this.renderer.shadowMap.type = THREE.PCFSoftShadowMap; // Optional: Softer shadows
            // Set clear color to match background/fog initially
            this.renderer.setClearColor(0x6699cc, 1);


            // Initialize controls
            this.controls = new THREE.PointerLockControls(this.camera, document.body);
            window.controls = this.controls; // Assign to global scope
            this.controls.addEventListener('lock', () => { console.log('[Controls] Pointer Locked'); });
            this.controls.addEventListener('unlock', () => { console.log('[Controls] Pointer Unlocked'); });


            // GLTF Loader Setup (using globals from <script> tags)
            if (typeof THREE.DRACOLoader === 'undefined' || typeof THREE.GLTFLoader === 'undefined') {
                throw new Error("THREE.DRACOLoader or THREE.GLTFLoader is not available!");
            }
            window.dracoLoader = new THREE.DRACOLoader();
            window.dracoLoader.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/libs/draco/');
            window.dracoLoader.setDecoderConfig({ type: 'js' });
            window.dracoLoader.preload();
            window.loader = new THREE.GLTFLoader(); // Assign global loader used by LoadManager
            window.loader.setDRACOLoader(window.dracoLoader);

            // --- Original Lighting Setup ---
            console.log("[Game] Setting up standard lighting.");
            const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
            this.scene.add(ambientLight);
            const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
            directionalLight.position.set(30, 40, 20);
            directionalLight.castShadow = true;
            directionalLight.shadow.mapSize.width = 1024; directionalLight.shadow.mapSize.height = 1024;
            directionalLight.shadow.camera.near = 1; directionalLight.shadow.camera.far = 150;
            directionalLight.shadow.camera.left = -60; directionalLight.shadow.camera.right = 60;
            directionalLight.shadow.camera.top = 60; directionalLight.shadow.camera.bottom = -60;
            this.scene.add(directionalLight);
            this.scene.add(directionalLight.target);
            // --- End Original Lighting ---

            console.log("[Game] Three.js initialized successfully.");
            return true;
        } catch (e) {
            console.error("!!! CRITICAL Three.js Initialization Error:", e);
            UIManager?.showError(`FATAL: Graphics Init!<br/>${e.message}`, 'loading');
            if (stateMachine) stateMachine.transitionTo('loading', { message: "GFX Init Failed!", error: true });
            return false;
        }
    }

    // --- Initialize Rapier Physics World and Event Queue ---
    initializePhysics() {
        if (!RAPIER) {
            console.error("!!! Cannot initialize physics: RAPIER object is missing!");
            UIManager?.showError(`FATAL: Physics Lib Missing!`, 'loading');
            if(stateMachine) stateMachine.transitionTo('loading', {message:"Physics Lib Failed!", error:true});
            return false;
        }
        if (rapierWorld) {
            console.warn("[Game] Physics world already initialized. Skipping re-initialization.");
            return true;
        }
        console.log("[Game] Initializing Rapier Physics Engine...");
        try {
            const gravityVector = new RAPIER.Vector3(0.0, CONFIG?.GRAVITY ?? -25.0, 0.0);
            if (window.rapierWorld) { window.rapierWorld = null; window.rapierEventQueue = null; } // Clear previous just in case

            rapierWorld = new RAPIER.World(gravityVector); // Assign to global scope
            window.rapierWorld = rapierWorld; // Ensure global assignment
            if (!rapierWorld) throw new Error("Failed to create Rapier World.");

            rapierEventQueue = new RAPIER.EventQueue(true); // Enable event reporting
            window.rapierEventQueue = rapierEventQueue; // Ensure global assignment
            if (!rapierEventQueue) throw new Error("Failed to create Rapier EventQueue.");

            console.log(`[Game] Rapier world/queue created (Gravity: ${gravityVector.y}).`);
            return true;
        } catch (e) {
            console.error("!!! CRITICAL Rapier Initialization Error:", e);
            rapierWorld = null; window.rapierWorld = null; // Ensure globals are null on failure
            rapierEventQueue = null; window.rapierEventQueue = null;
            if (UIManager) UIManager.showError(`FATAL: Physics Init!<br/>${e.message}`, 'loading');
            if (stateMachine) stateMachine.transitionTo('loading', { message: "Physics Init Failed!", error: true });
            return false;
        }
    }

    // --- Initialize Core Managers (UI, Input, etc.) ---
    initializeManagers() {
        console.log("[Game] Initializing Managers (UI, Input, StateMachine, LoadManager, Network, Effects)...");
        if (!window.UIManager || !window.Input || !window.stateMachine || !window.loadManager || !window.Network || !window.Effects) {
            console.error("!!! One or more required global managers are undefined!");
            UIManager?.showError("FATAL: Core Manager Load!", 'loading');
            if (stateMachine) stateMachine.transitionTo('loading', { message: "FATAL: Mgr Load Fail!", error: true });
            return false;
        }
        try {
            if (!UIManager.initialize()) throw new Error("UIManager initialization failed");
            if (!this.controls) throw new Error("PointerLockControls not ready for Input Manager");
            if (!Input.init(this.controls)) throw new Error("Input initialization failed");
            Effects.initialize(this.scene);
            console.log("[Game] Managers initialized successfully.");
            return true;
        } catch (e) {
            console.error("!!! Error initializing managers:", e);
            UIManager?.showError(`FATAL: Manager Setup!<br/>${e.message}`, 'loading');
            if (stateMachine) stateMachine.transitionTo('loading', { message: "FATAL: Mgr Setup Fail!", error: true });
            return false;
        }
    }

    // --- Initialize Network Layer ---
    initializeNetwork() {
        console.log("[Game] Initializing Network connection...");
        if (typeof Network?.init === 'function') {
            try {
                Network.init();
                console.log("[Game] Network initialization requested.");
                return true;
            } catch (e) {
                console.error("!!! Network Initialization Error:", e);
                if (stateMachine) stateMachine.transitionTo('loading', { message: `FATAL: Net Init!<br/>${e.message}`, error: true });
                return false;
            }
        } else {
            console.error("!!! Global Network object or init function is missing!");
            if (stateMachine) stateMachine.transitionTo('loading', { message: `FATAL: Net Code Failed!`, error: true });
            return false;
        }
    }

    // --- Setup Asset Loading Listeners (LoadManager Events) ---
    bindLoadManagerListeners() {
        if (!loadManager) {
            console.error("!!! LoadManager is missing! Cannot bind asset listeners.");
            if (stateMachine) stateMachine.transitionTo('loading', { message: "FATAL: Load Mgr Missing!", error: true });
            return;
        }
        loadManager.on('ready', () => {
            console.log("[Game] LoadManager 'ready' event received. All required assets loaded.");
            assetsAreReady = true;
            this.mapMesh = loadManager.getAssetData('map');

            if (!this.mapMesh && !USE_SIMPLE_GROUND) {
                console.error("!!! Map asset data missing after 'ready' event!");
                 if (stateMachine) stateMachine.transitionTo('loading', { message: "FATAL: Map Data Corrupt!", error: true });
                 return;
            }

            if (USE_SIMPLE_GROUND) {
                 console.log("[Game] Using simple ground plane.");
                 const groundSize = CONFIG.MAP_BOUNDS_X ? CONFIG.MAP_BOUNDS_X * 2 : 200;
                 const groundGeo = new THREE.PlaneGeometry(groundSize, groundSize);
                 const groundMat = new THREE.MeshStandardMaterial({ color: 0x888888, side: THREE.DoubleSide });
                 this.simpleGroundMesh = new THREE.Mesh(groundGeo, groundMat);
                 this.simpleGroundMesh.rotation.x = -Math.PI / 2; this.simpleGroundMesh.receiveShadow = true; this.simpleGroundMesh.position.y = 0;
                 if(this.scene) this.scene.add(this.simpleGroundMesh); console.log("[Game] Added simple visual ground plane.");
            } else if (this.mapMesh) {
                 console.log("[Game] Using loaded GLB map.");
                 if (this.scene && !this.mapMesh.parent) { this.scene.add(this.mapMesh); console.log("[Game] Added loaded map mesh to scene."); }
                 else if (!this.scene) { console.error("Scene not available to add map mesh!"); }
            }

            this.createMapCollider();
            this.attemptProceedToGame();
        });
        loadManager.on('error', (errorData) => {
            console.error("!!! LoadManager reported an error:", errorData);
            assetsAreReady = false; this.mapMesh = null; this.simpleGroundMesh = null;
            if (stateMachine) stateMachine.transitionTo('loading', { message: `FATAL: Asset Load Error!<br/>${errorData.message || 'Unknown asset error'}`, error: true });
        });
        console.log("[Game] LoadManager event listeners bound ('ready', 'error').");
    }

    // --- Create Rapier Collider for the Map/Ground ---
    createMapCollider() {
        if (!RAPIER || !rapierWorld || this.mapColliderHandle !== null) { if (this.mapColliderHandle !== null) console.warn("Map collider already exists."); else console.warn(`Cannot create map collider: RAPIER/World missing.`); return false; }
        if (!this.mapMesh && !USE_SIMPLE_GROUND) { console.warn("Cannot create map collider: No map mesh loaded/not using simple ground."); return false; }
        console.log(`[Game] Attempting to create Rapier collider (Simple Ground: ${USE_SIMPLE_GROUND})...`);
        try {
            let colliderDesc;
            if (USE_SIMPLE_GROUND) {
                 const groundSize = CONFIG.MAP_BOUNDS_X ? CONFIG.MAP_BOUNDS_X : 100; const groundThickness = 0.5;
                 colliderDesc = RAPIER.ColliderDesc.cuboid(groundSize, groundThickness, groundSize).setTranslation(0, -groundThickness, 0);
                 console.log(`[Game] Creating simple cuboid ground collider.`);
            } else {
                 if (!this.mapMesh) throw new Error("Map mesh required for trimesh collider is null.");
                 let foundGeometry = false;
                 this.mapMesh.traverse((child) => {
                     if (!foundGeometry && child.isMesh && child.geometry) {
                         if (!child.geometry.attributes.position || child.geometry.attributes.position.count === 0) { console.warn(`Skipping mesh '${child.name || '?'}': No vertices.`); return; }
                         let vertices = child.geometry.attributes.position.array; let indices = child.geometry.index ? child.geometry.index.array : null;
                         console.log(`Using map mesh: ${child.name}. Verts: ${vertices.length / 3}${indices ? `, Indices: ${indices.length / 3}` : ''}.`);
                         if (indices) { colliderDesc = RAPIER.ColliderDesc.trimesh(vertices, indices); }
                         else { console.warn(`Map mesh lacks indices.`); if ((vertices.length / 3) % 3 !== 0) { console.error(`Vert count not div by 3.`); return; } colliderDesc = RAPIER.ColliderDesc.trimesh(vertices); }
                         foundGeometry = true;
                     }
                 });
                 if (!foundGeometry || !colliderDesc) { throw new Error("No suitable mesh geometry found for map collider."); }
            }
            colliderDesc.setFriction(0.7).setRestitution(0.1).setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);
            let createdCollider = rapierWorld.createCollider(colliderDesc);
            if (!createdCollider) throw new Error("Rapier world failed to create map/ground collider object.");
            this.mapColliderHandle = createdCollider.handle;
            console.log(`[Game] Successfully created Rapier map/ground collider with handle: ${this.mapColliderHandle}`);
            return true;
        } catch (e) {
            console.error("!!! Error during Rapier map/ground collider creation:", e);
            this.mapColliderHandle = null;
            if (stateMachine) stateMachine.transitionTo('loading', { message: `FATAL: Map Physics Error!<br/>${e.message}`, error: true });
            return false;
        }
    }

    // --- Check if all prerequisites for starting gameplay or moving to homescreen are met ---
    attemptProceedToGame() {
        const rapierIsSetup = !!RAPIER && !!rapierWorld;
        const mapColliderExists = this.mapColliderHandle !== null && this.mapColliderHandle !== undefined;
        console.log(`[Game] Checking prerequisites: RapierSetup=${rapierIsSetup}, MapCollider=${mapColliderExists}, AssetsReady=${assetsAreReady}, NetworkInitialized=${networkIsInitialized}, InitDataReceived=${!!initializationData}`);
        if (rapierIsSetup && mapColliderExists && assetsAreReady && networkIsInitialized && initializationData) {
            console.log("[Game] All prerequisites met -> Calling startGamePlay...");
            if (typeof this.startGamePlay === 'function') { this.startGamePlay(initializationData); }
            else { console.error("!!! CRITICAL: startGamePlay method missing!"); if(stateMachine) stateMachine.transitionTo('loading',{message:'Internal Game Error!', error:true}); }
        } else if (rapierIsSetup && mapColliderExists && assetsAreReady && stateMachine?.is('loading')) {
             console.log("[Game] Core components ready -> Transitioning to Homescreen");
             let currentPCount = UIManager?.playerCountSpan?.textContent ?? '?';
             stateMachine.transitionTo('homescreen', { playerCount: currentPCount });
        } else {
             const waitingFor = [];
             if (!rapierIsSetup) waitingFor.push("Rapier"); if (!mapColliderExists) waitingFor.push("Map Collider");
             if (!assetsAreReady) waitingFor.push("Assets"); if (!networkIsInitialized) waitingFor.push("Network");
             if (!initializationData && networkIsInitialized) waitingFor.push("Server Init Data");
             console.log(`[Game] Still waiting for prerequisites: [${waitingFor.join(', ')}]. State: ${stateMachine?.currentState || '?'}`);
        }
    }

    // --- Bind State Machine Transition Listeners ---
    bindOtherStateTransitions() {
        if (UIManager?.bindStateListeners) UIManager.bindStateListeners(stateMachine);
        else console.error("!!! UIManager or bindStateListeners method missing!");
        if (stateMachine) {
            stateMachine.on('transition', (data) => {
                const { from: f, to: t } = data; console.log(`[Game State Listener] Transition: ${f} -> ${t}`);
                if ((f === 'playing' || f === 'joining') && (t === 'homescreen' || t === 'loading')) {
                    console.log(`[Game State] Cleaning up after ${f}...`); this.cleanupGameState(); if (controls?.isLocked) controls.unlock();
                } else if (t === 'playing') { console.log("[Game State] Entered 'playing'."); }
                 else if (t === 'loading' && data.options?.error) {
                     console.error(`[Game State] Loading error: ${data.options.message}`); if (controls?.isLocked) controls.unlock();
                     networkIsInitialized = false; assetsAreReady = false; initializationData = null; this.cleanupGameState();
                 }
            });
        } else { console.error("!!! stateMachine missing!"); }
        console.log("[Game] State transition listeners bound.");
    }

    // --- Add Global Event Listeners (Window Resize, Join Button) ---
    addEventListeners() {
        console.log("[Game] Adding global event listeners (Resize, Join Button)...");
        if (UIManager?.joinButton && typeof Network?.attemptJoinGame === 'function') {
            UIManager.joinButton.addEventListener('click', Network.attemptJoinGame); console.log("[Game] 'Join Game' button listener added.");
        } else { console.error("!!! Cannot add join listener: UIManager.joinButton or Network.attemptJoinGame missing!"); }
        window.addEventListener('resize', this.handleResize.bind(this)); console.log("[Game] Global event listeners added.");
    }

    // --- Main Update/Animate Loop ---
    animate() {
        requestAnimationFrame(() => this.animate());
        const dt = this.clock ? this.clock.getDelta() : 0.0166;

        // --- Physics Step ---
        if (!DEBUG_MINIMAL_RENDER_LOOP && rapierWorld) {
             try { rapierWorld.step(rapierEventQueue); }
             catch (e) { console.error("Rapier step error:", e); }
        }

        // --- Gameplay Updates ---
        if (!DEBUG_MINIMAL_RENDER_LOOP && stateMachine?.is('playing') && localPlayerId && window.players[localPlayerId]) {
            try {
                const localHandle = this.playerRigidBodyHandles[localPlayerId];
                const localBody = (localHandle !== undefined && rapierWorld) ? rapierWorld.getRigidBody(localHandle) : null;
                if (typeof updateLocalPlayer === 'function' && localBody) { updateLocalPlayer(dt, localBody); }
                if (typeof Effects?.update === 'function') { Effects.update(dt); }

                // --- Camera Sync & Validation ---
                if (!DEBUG_FIXED_CAMERA && localBody) {
                     try {
                         const playerPosition = localBody.translation();
                         // Log only occasionally
                         if (this._physicsLogCounter % 60 === 0) { console.log(`[Physics Debug] Player Pos: x=${playerPosition.x?.toFixed(2)}, y=${playerPosition.y?.toFixed(2)}, z=${playerPosition.z?.toFixed(2)}`); }

                         // Validate position before syncing camera
                         if (playerPosition && Number.isFinite(playerPosition.x) && Number.isFinite(playerPosition.y) && Number.isFinite(playerPosition.z)) {
                             this.syncCameraToBody(localBody);
                         } else { console.error(`!!! Invalid Player Position from Physics! x=${playerPosition?.x}, y=${playerPosition?.y}, z=${playerPosition?.z}. Skipping camera sync.`); }
                     } catch (e) { console.error("Error getting/checking player translation:", e); }
                }
                // --- End Camera Sync ---

                // Sync Remote Players
                for (const id in window.players) { if (id === localPlayerId) continue; const p=window.players[id]; if (p instanceof ClientPlayer && p.mesh) { const h=this.playerRigidBodyHandles[id]; const b=(h!==undefined&&rapierWorld)?rapierWorld.getRigidBody(h):null; if(b){ const bp=b.translation(); const br=b.rotation(); p.mesh.position.set(bp.x,bp.y,bp.z); p.mesh.quaternion.set(br.x,br.y,br.z,br.w); const ph=CONFIG?.PLAYER_HEIGHT||1.8; if (!(p.mesh.geometry instanceof THREE.CylinderGeometry)){ p.mesh.position.y -= ph/2.0; }} } }

                this._physicsLogCounter++; // Increment log counter

            } catch (e) { console.error("Playing loop error:", e); }
        }

        // --- Rendering ---
        if (renderer && scene && camera) {
            try {
                // Validate camera position before rendering
                if (!Number.isFinite(camera.position.x) || !Number.isFinite(camera.position.y) || !Number.isFinite(camera.position.z)) {
                    console.error(`!!! Invalid Camera Position before render! x=${camera.position.x}, y=${camera.position.y}, z=${camera.position.z}`);
                } else {
                     renderer.render(scene, camera);
                }
            }
            catch (e) { console.error("!!! Rendering error:", e); }
        }
    } // End animate()

    // --- Window Resize Handler ---
    handleResize() {
        if (camera) { camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); }
        if (renderer) { renderer.setSize(window.innerWidth, window.innerHeight); console.log(`[Game] Resized renderer`); }
    }

    // --- Start Game Play Method (Called by Network 'initialize' handler) ---
    startGamePlay(initData) {
        console.log('[Game] startGamePlay...'); console.log('Init data:', JSON.stringify(initData));
        if (!initData?.id || typeof initData.players !== 'object') { console.error("Invalid init data"); stateMachine?.transitionTo('homescreen'); UIManager?.showError("Server Init Invalid!", "homescreen"); return; }
        if (!rapierWorld || !RAPIER || this.mapColliderHandle === null || this.mapColliderHandle === undefined) { console.error("Physics not ready"); stateMachine?.transitionTo('homescreen'); UIManager?.showError("Physics Not Ready!", 'homescreen'); return; }
        if (stateMachine?.is('playing')) { console.warn("Already playing, resetting..."); this.cleanupGameState(); } else { console.log("Cleaning up..."); this.cleanupGameState(); }

        localPlayerId = initData.id; window.localPlayerId = localPlayerId; console.log(`Local ID: ${localPlayerId}`);
        console.log("Creating players/bodies...");
        const ph = CONFIG?.PLAYER_HEIGHT||1.8; const pr = CONFIG?.PLAYER_RADIUS||0.4; const ch = Math.max(0.01, ph/2.0-pr);
        let localCreated = false;

        for (const id in initData.players) {
            // Use a local copy for safety within loop/catch
            const playerDataForLoop = initData.players[id];
            if (playerDataForLoop.x === undefined || playerDataForLoop.y === undefined || playerDataForLoop.z === undefined) { console.warn(`Invalid pos ${id}. Skipping.`); continue; }

            // *** DEBUG: Force spawn position if flag is set ***
            let spawnX = playerDataForLoop.x;
            let spawnY = playerDataForLoop.y; // Use server Y as base
            let spawnZ = playerDataForLoop.z;
            if (DEBUG_FORCE_SPAWN_POS && id === localPlayerId) {
                spawnX = 0;
                spawnY = 5; // Start slightly above ground plane (Y=0)
                spawnZ = 5;
                console.log(`[DEBUG] Forcing local player spawn to (${spawnX}, ${spawnY}, ${spawnZ})`);
            }
            // *** END DEBUG ***

            const bodyCenterY = spawnY + ph / 2.0; // Calculate center based on potentially overridden spawnY

            try { // Start try block for this player
                let pCD = RAPIER.ColliderDesc.capsule(ch,pr).setFriction(0.7).setRestitution(0.1).setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);
                const iRY = playerDataForLoop.rotationY||0; const iRE = {x:0,y:iRY,z:0}; let rb; let rbD;

                if (id === localPlayerId) {
                    console.log(`Init LOCAL: ${playerDataForLoop.name} (${id})`);
                    window.players[id]={...playerDataForLoop,isLocal:true,mesh:null};
                    // Use potentially overridden spawn coords
                    rbD=RAPIER.RigidBodyDesc.dynamic().setTranslation(spawnX, bodyCenterY, spawnZ).setRotation(iRE).setLinvel(0,0,0).setAngvel({x:0,y:0,z:0}).setLinearDamping(0.5).setAngularDamping(1.0).lockRotations().setCanSleep(false);
                    rb=rapierWorld.createRigidBody(rbD); if(!rb) throw new Error("Fail local body.");
                    this.playerRigidBodyHandles[id]=rb.handle; console.log(`Created DYNAMIC body. H: ${rb.handle}`);
                    rapierWorld.createCollider(pCD,rb.handle);
                    if(!DEBUG_FIXED_CAMERA) { this.syncCameraToBody(rb); }
                    if(UIManager) {
                        UIManager.updateHealthBar(playerDataForLoop.health??100); // Use local loop var
                        UIManager.updateInfo(`Playing as ${playerDataForLoop.name || 'P'}`); // Use local loop var
                        UIManager.clearError('homescreen'); UIManager.clearKillMessage();
                    }
                    localCreated = true;
                } else { // Remote player (use server position)
                    console.log(`Init REMOTE: ${playerDataForLoop.name} (${id})`);
                    let rpI=Network?._addPlayer(playerDataForLoop); if(!rpI) { console.warn(`Fail ClientPlayer ${id}.`); continue; }
                    // Use original server x/z for remote players
                    rbD=RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(playerDataForLoop.x, bodyCenterY, playerDataForLoop.z).setRotation(iRE);
                    rb=rapierWorld.createRigidBody(rbD); if(!rb) throw new Error(`Fail remote body ${id}.`);
                    this.playerRigidBodyHandles[id]=rb.handle; console.log(`Created KINEMATIC body. H: ${rb.handle}`);
                    rapierWorld.createCollider(pCD,rb.handle);
                }
            } catch (bodyError) { // Catch errors specific to this player
                 console.error(`!!! Body/collider error creating player ${id}:`, bodyError);
                 this.cleanupPlayer(id); // Attempt cleanup for the player that failed
                 // If the *local* player failed, this is critical
                 if (id === localPlayerId) {
                     console.error("CRITICAL: Failed to create local player body/collider.");
                     stateMachine?.transitionTo('homescreen'); // Go back home
                     // Show specific error
                     UIManager?.showError("FATAL: Player Init Fail!", 'homescreen');
                     return; // Stop the entire startGamePlay process
                 }
                 // If a remote player failed, log it but continue processing others
            }
        } // End loop through players

        if (!localCreated) { console.error("!!! Local player failed!"); stateMachine?.transitionTo('homescreen'); UIManager?.showError("FATAL: Local Player Missing!", 'homescreen'); return; }
        console.log(`Player init complete. ${Object.keys(window.players).length} players.`);
        if (stateMachine) { console.log("Transitioning state -> 'playing'..."); stateMachine.transitionTo('playing'); } else { console.error("stateMachine missing!"); }
    }

    // --- Helper: Sync Camera to Body ---
    syncCameraToBody(playerBody) {
        if (playerBody && controls?.getObject()) {
            try {
                const bodyPos = playerBody.translation();
                 // *** Add validation here too before setting ***
                 if (bodyPos && Number.isFinite(bodyPos.x) && Number.isFinite(bodyPos.y) && Number.isFinite(bodyPos.z)) {
                    const cameraOffset = CONFIG?.CAMERA_Y_OFFSET ?? 1.6;
                    controls.getObject().position.set(bodyPos.x, bodyPos.y + cameraOffset, bodyPos.z);
                 } else {
                    console.error(`!!! Invalid bodyPos in syncCameraToBody! x=${bodyPos?.x}, y=${bodyPos?.y}, z=${bodyPos?.z}`);
                 }
            } catch (e) { console.error("Error accessing body translation in syncCameraToBody:", e); }
        }
    }

     // --- Helper: Cleanup Game State ---
     cleanupGameState() {
         console.log("[Game Cleanup] Cleaning up player objects and physics bodies...");
         for (const playerId in this.playerRigidBodyHandles) { const handle = this.playerRigidBodyHandles[playerId]; if (rapierWorld && handle !== undefined && handle !== null) { try { let body = rapierWorld.getRigidBody(handle); if (body) rapierWorld.removeRigidBody(body); } catch (e) { /* Ignore */ } } } this.playerRigidBodyHandles = {};
         for (const id in window.players) { if (typeof Network?._removePlayer === 'function') { Network._removePlayer(id); } else { if(window.players[id] instanceof ClientPlayer) window.players[id].remove(); delete window.players[id]; } } window.players = {};
         localPlayerId = null; window.localPlayerId = null;
         console.log("[Game Cleanup] State cleared.");
     }

     // --- Helper: Cleanup a Single Player ---
     cleanupPlayer(playerId) {
         console.warn(`[Game Cleanup] Cleaning up individual player: ${playerId}`);
         const handle = this.playerRigidBodyHandles[playerId]; if (rapierWorld && handle !== undefined && handle !== null) { try { let body = rapierWorld.getRigidBody(handle); if (body) rapierWorld.removeRigidBody(body); } catch (e) { /* Ignore */ } delete this.playerRigidBodyHandles[playerId]; }
         if (typeof Network?._removePlayer === 'function') { Network._removePlayer(playerId); } else { if(window.players[playerId] instanceof ClientPlayer) window.players[playerId].remove(); delete window.players[playerId]; }
     }

    // --- Start Asset Loading Process ---
    startAssetLoading() {
        console.log("[Game] Requesting asset loading via LoadManager...");
        if (typeof loadManager?.startLoading === 'function') { loadManager.startLoading(); }
        else { console.error("!!! LoadManager or startLoading missing!"); if (stateMachine) stateMachine.transitionTo('loading', { message: "FATAL: Asset Mgr Fail!", error: true }); }
    }

} // End Game Class

// --- Global Game Initialization Function ---
function runGame() { console.log("--- runGame() ---"); try { if(window.currentGameInstance){console.warn("Prev instance found.");} const gI=new Game(); window.currentGameInstance=gI; gI.start(); } catch(e) { console.error("!!! Game Instance Err:", e); document.body.innerHTML = `<p style='color:red;'>FATAL GAME INIT FAILED.</p>`; } }
// --- DOM Ready Check ---
if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', runGame); } else { runGame(); }

console.log("game.js loaded (Log/Validate Physics Pos)");
