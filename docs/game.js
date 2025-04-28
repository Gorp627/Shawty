// docs/game.js - Main Game Orchestrator (Fixed Rapier Rotation Setting)

// --- Global Flags and Data ---
let networkIsInitialized = false; let assetsAreReady = false; let initializationData = null;
var currentGameInstance = null; // Holds the single Game instance
var RAPIER = window.RAPIER || null; // Will be populated by rapier_init.js
var rapierWorld = null;
var rapierEventQueue = null;
window.isRapierReady = window.isRapierReady || false; // Flag set by rapier_init.js

class Game {
    // --- Constructor ---
    constructor() {
        // Core Three.js components
        this.scene = null; this.camera = null; this.renderer = null; this.controls = null; this.clock = null;
        // Game state references (using globals defined in config.js)
        this.players = window.players; // Reference global players object
        this.keys = window.keys;       // Reference global keys object
        this.mapMesh = null; // Visual map mesh (THREE.Object3D)
        // Physics state
        this.playerRigidBodyHandles = {}; // Stores Rapier RigidBody handles keyed by player ID
        this.mapColliderHandle = null;    // Stores the Rapier Collider handle for the map
        this.rapierReady = window.isRapierReady; // Check initial Rapier status
        // Timing
        this.lastCallTime = performance.now(); // For performance monitoring (optional)

        console.log("[Game] Instance created.");

        // --- Rapier Initialization Listener ---
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
        this.mapMesh = null;
        this.playerRigidBodyHandles = {};
        this.mapColliderHandle = null;
        this.lastCallTime = performance.now();

        // Initialize subsystems in order
        if (!this.initializeThreeJS()) { return; }
        if (!this.initializeManagers()) { return; }
        if (!this.initializeNetwork()) { return; }

        // Bind event listeners after managers are initialized
        this.bindLoadManagerListeners();
        this.bindOtherStateTransitions();
        this.addEventListeners();

        console.log("[Game] Triggering Asset loading and waiting for Rapier...");
        this.startAssetLoading();

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
            // Scene
            this.scene = new THREE.Scene(); window.scene = this.scene;
            this.scene.background = new THREE.Color(0x6699cc);
            this.scene.fog = new THREE.Fog(0x6699cc, 20, 200);

            // Camera
            this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
            window.camera = this.camera;

            // Clock
            this.clock = new THREE.Clock(); window.clock = this.clock;

            // Renderer
            const canvasElement = document.getElementById('gameCanvas');
            if (!canvasElement) throw new Error("Required canvas element '#gameCanvas' not found in HTML!");
            this.renderer = new THREE.WebGLRenderer({ canvas: canvasElement, antialias: true });
            window.renderer = this.renderer;
            this.renderer.setSize(window.innerWidth, window.innerHeight);
            this.renderer.shadowMap.enabled = true;
            this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

            // Pointer Lock Controls
            this.controls = new THREE.PointerLockControls(this.camera, document.body);
            window.controls = this.controls;
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
            window.loader = new THREE.GLTFLoader();
            window.loader.setDRACOLoader(window.dracoLoader);

            // Lighting
            const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
            this.scene.add(ambientLight);
            const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
            directionalLight.position.set(30, 40, 20);
            directionalLight.castShadow = true;
            directionalLight.shadow.mapSize.width = 1024;
            directionalLight.shadow.mapSize.height = 1024;
            directionalLight.shadow.camera.near = 1;
            directionalLight.shadow.camera.far = 150;
            directionalLight.shadow.camera.left = -60;
            directionalLight.shadow.camera.right = 60;
            directionalLight.shadow.camera.top = 60;
            directionalLight.shadow.camera.bottom = -60;
            this.scene.add(directionalLight);
            this.scene.add(directionalLight.target);

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

            rapierWorld = new RAPIER.World(gravityVector);
            window.rapierWorld = rapierWorld;
            if (!rapierWorld) throw new Error("Failed to create Rapier World.");

            rapierEventQueue = new RAPIER.EventQueue(true);
            window.rapierEventQueue = rapierEventQueue;
            if (!rapierEventQueue) throw new Error("Failed to create Rapier EventQueue.");

            console.log("[Game] Rapier world and event queue created successfully.");
            return true;
        } catch (e) {
            console.error("!!! CRITICAL Rapier Initialization Error:", e);
            rapierWorld = null; window.rapierWorld = null;
            rapierEventQueue = null; window.rapierEventQueue = null;
            if (UIManager) UIManager.showError(`FATAL: Physics Init!<br/>${e.message}`, 'loading');
            if (stateMachine) stateMachine.transitionTo('loading', { message: "Physics Init Failed!", error: true });
            return false;
        }
    }

    // --- Initialize Core Managers (UI, Input, etc.) ---
    initializeManagers() {
        console.log("[Game] Initializing Managers...");
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
            console.log("[Game] LoadManager 'ready' event received.");
            assetsAreReady = true;
            this.mapMesh = loadManager.getAssetData('map');
            if (!this.mapMesh) {
                console.error("!!! Map data missing from LoadManager even after 'ready' event! Critical error.");
                if (stateMachine) stateMachine.transitionTo('loading', { message: "FATAL: Map Data Corrupt!", error: true });
                return;
            }
            console.log("[Game] Visual map mesh reference stored.");
            if (this.scene && !this.mapMesh.parent) {
                 this.scene.add(this.mapMesh);
                 console.log("[Game] Added visual map mesh to the Three.js scene.");
             }
            this.createMapCollider(); // Attempt to create map physics collider
            this.attemptProceedToGame(); // Check if ready for next stage
        });
        loadManager.on('error', (errorData) => {
            console.error("!!! LoadManager reported an error:", errorData);
            assetsAreReady = false; this.mapMesh = null;
            if (stateMachine) stateMachine.transitionTo('loading', { message: `FATAL: Asset Load Error!<br/>${errorData.message || 'Unknown asset error'}`, error: true });
        });
        console.log("[Game] LoadManager event listeners bound ('ready', 'error').");
    }

    // --- Create Rapier Collider for the Map ---
    createMapCollider() {
        if (!RAPIER || !rapierWorld || !this.mapMesh || this.mapColliderHandle !== null) {
            if (this.mapColliderHandle !== null) console.warn("[Game] Map collider already exists. Skipping recreation.");
            else console.warn(`[Game] Cannot create map collider. Conditions not met: RapierReady=${!!RAPIER}, WorldReady=${!!rapierWorld}, MapMeshReady=${!!this.mapMesh}`);
            return false;
        }
        console.log("[Game] Attempting to create Rapier trimesh collider for the map...");
        try {
            let foundGeometry = false; let createdCollider = null;
            this.mapMesh.traverse((child) => {
                if (!foundGeometry && child.isMesh && child.geometry) {
                    if (!child.geometry.attributes.position || child.geometry.attributes.position.count === 0) {
                         console.warn(`[Game] Skipping mesh '${child.name || '?'}': No position vertices.`); return;
                    }
                    let vertices = child.geometry.attributes.position.array;
                    let indices = child.geometry.index ? child.geometry.index.array : null;
                    console.log(`[Game] Found map geometry in mesh: ${child.name || '?'}. Vertices: ${vertices.length / 3}${indices ? `, Indices: ${indices.length / 3}` : ', No Indices'}.`);
                    let colliderDesc;
                    if (indices) {
                        colliderDesc = RAPIER.ColliderDesc.trimesh(vertices, indices);
                    } else {
                        console.warn(`[Game] Map geometry '${child.name || '?'}' lacks indices. Creating trimesh from raw vertices; collision might be inaccurate.`);
                        if ((vertices.length / 3) % 3 !== 0) {
                             console.error(`[Game] Vertex count (${vertices.length / 3}) not divisible by 3. Cannot form triangles without indices. Skipping mesh.`); return;
                        }
                        colliderDesc = RAPIER.ColliderDesc.trimesh(vertices);
                    }
                    colliderDesc.setFriction(0.7).setRestitution(0.1).setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);
                    createdCollider = rapierWorld.createCollider(colliderDesc);
                    if (!createdCollider) throw new Error("Rapier world failed to create map collider object.");
                    this.mapColliderHandle = createdCollider.handle;
                    console.log(`[Game] Successfully created Rapier map collider with handle: ${this.mapColliderHandle}`);
                    foundGeometry = true;
                }
            });
            if (!foundGeometry) {
                 console.error("!!! No suitable mesh with geometry found within the loaded map asset!");
                 UIManager?.showError("Map Physics Failed (No Mesh Found)!", 'loading');
                 if(stateMachine) stateMachine.transitionTo('loading', {message:"Map Physics Failed!", error:true});
                 return false;
             }
            return true;
        } catch (e) {
            console.error("!!! Error during Rapier map collider creation:", e);
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

        // Condition 1: Ready to START the actual gameplay
        if (rapierIsSetup && mapColliderExists && assetsAreReady && networkIsInitialized && initializationData) {
            console.log("[Game] All prerequisites met -> Calling startGamePlay...");
            if (typeof this.startGamePlay === 'function') { this.startGamePlay(initializationData); }
            else { console.error("!!! CRITICAL: startGamePlay method missing!"); if(stateMachine) stateMachine.transitionTo('loading',{message:'Internal Game Error!', error:true}); }
        }
        // Condition 2: Ready to go to the HOMESCREEN
        else if (rapierIsSetup && mapColliderExists && assetsAreReady && stateMachine?.is('loading')) {
             console.log("[Game] Core components ready -> Transitioning to Homescreen");
             let currentPCount = UIManager?.playerCountSpan?.textContent ?? '?';
             stateMachine.transitionTo('homescreen', { playerCount: currentPCount });
        }
        // Condition 3: Still waiting...
        else {
             const waitingFor = [];
             if (!rapierIsSetup) waitingFor.push("Rapier"); if (!mapColliderExists) waitingFor.push("Map Collider");
             if (!assetsAreReady) waitingFor.push("Assets"); if (!networkIsInitialized) waitingFor.push("Network");
             if (!initializationData && networkIsInitialized) waitingFor.push("Server Init Data");
             console.log(`[Game] Still waiting for prerequisites: [${waitingFor.join(', ')}]. State: ${stateMachine?.currentState || 'unknown'}`);
        }
    }

    // --- Bind State Machine Transition Listeners ---
    bindOtherStateTransitions() {
        if (UIManager?.bindStateListeners) UIManager.bindStateListeners(stateMachine);
        else console.error("!!! UIManager or bindStateListeners method missing!");

        if (stateMachine) {
            stateMachine.on('transition', (data) => {
                const fromState = data.from; const toState = data.to;
                console.log(`[Game State Listener] Transition detected: ${fromState} -> ${toState}`);

                // --- Cleanup Logic: When leaving 'playing' or 'joining' ---
                if ((fromState === 'playing' || fromState === 'joining') && (toState === 'homescreen' || toState === 'loading')) {
                    console.log(`[Game State] Cleaning up physics and player state after leaving ${fromState} for ${toState}...`);
                    this.cleanupGameState(); // Encapsulated cleanup
                    if (controls?.isLocked) { controls.unlock(); console.log("[Game State] Unlocked pointer controls during cleanup."); }
                }
                // --- Setup Logic: When entering 'playing' ---
                else if (toState === 'playing') { console.log("[Game State] Entered 'playing' state."); }
                // --- Handling Loading Errors ---
                 else if (toState === 'loading' && data.options?.error) {
                     console.error(`[Game State] Transitioned to loading state with error: ${data.options.message}`);
                     if (controls?.isLocked) controls.unlock();
                     // Reset critical state flags for safety
                     networkIsInitialized = false; assetsAreReady = false; initializationData = null;
                     this.cleanupGameState(); // Perform cleanup
                     console.log("[Game State] Performed cleanup due to loading error state.");
                 }
            });
        } else { console.error("!!! stateMachine is missing! Cannot bind state transitions."); }
        console.log("[Game] State transition listeners bound.");
    }

    // --- Add Global Event Listeners (Window Resize, Join Button) ---
    addEventListeners() {
        console.log("[Game] Adding global event listeners (Resize, Join Button)...");
        if (UIManager?.joinButton && typeof Network?.attemptJoinGame === 'function') {
            UIManager.joinButton.addEventListener('click', Network.attemptJoinGame); // Direct reference
            console.log("[Game] 'Join Game' button click listener added.");
        } else { console.error("!!! Cannot add join listener: UIManager.joinButton or Network.attemptJoinGame missing!"); }
        window.addEventListener('resize', this.handleResize.bind(this));
        console.log("[Game] Global event listeners added.");
    }

    // --- Main Update/Animate Loop ---
    animate() {
        requestAnimationFrame(() => this.animate());
        const dt = this.clock ? this.clock.getDelta() : 0.0166;

        // --- Physics Step ---
        if (rapierWorld && rapierEventQueue) {
            try { rapierWorld.step(rapierEventQueue); /* Process events if needed */ }
            catch (e) { console.error("!!! Error during Rapier world step:", e); }
        }

        // --- Gameplay Updates (Only when playing) ---
        if (stateMachine?.is('playing') && localPlayerId && window.players[localPlayerId]) {
            try {
                // Update Local Player
                const localHandle = this.playerRigidBodyHandles[localPlayerId];
                const localBody = (localHandle !== undefined && localHandle !== null && rapierWorld) ? rapierWorld.getRigidBody(localHandle) : null;
                if (typeof updateLocalPlayer === 'function' && localBody) { updateLocalPlayer(dt, localBody); }

                // Update Other Systems
                if (typeof Effects?.update === 'function') { Effects.update(dt); }

                // Sync Camera to Local Player Body
                this.syncCameraToBody(localBody); // Use helper

                // Sync Remote Player Visuals
                for (const id in window.players) {
                    if (id === localPlayerId) continue;
                    const remotePlayer = window.players[id];
                    if (remotePlayer instanceof ClientPlayer && remotePlayer.mesh) {
                        const remoteHandle = this.playerRigidBodyHandles[id];
                        const remoteBody = (remoteHandle !== undefined && remoteHandle !== null && rapierWorld) ? rapierWorld.getRigidBody(remoteHandle) : null;
                        if (remoteBody) {
                            const bodyPosition = remoteBody.translation();
                            const bodyRotation = remoteBody.rotation();
                            remotePlayer.mesh.position.set(bodyPosition.x, bodyPosition.y, bodyPosition.z);
                            remotePlayer.mesh.quaternion.set(bodyRotation.x, bodyRotation.y, bodyRotation.z, bodyRotation.w);
                            // Optional Y-Offset Adjustment (Assuming feet origin for GLB)
                            const playerHeight = CONFIG?.PLAYER_HEIGHT || 1.8;
                            if (!(remotePlayer.mesh.geometry instanceof THREE.CylinderGeometry)) {
                                remotePlayer.mesh.position.y -= playerHeight / 2.0;
                            }
                        }
                    }
                }
            } catch (e) { console.error("!!! Error during main 'playing' state update loop:", e); }
        } // End 'playing' updates

        // --- Rendering ---
        if (renderer && scene && camera) {
            try { renderer.render(scene, camera); }
            catch (e) { console.error("!!! Error during Three.js rendering:", e); }
        }
    } // End animate()

    // --- Window Resize Handler ---
    handleResize() {
        if (camera) { camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); }
        if (renderer) { renderer.setSize(window.innerWidth, window.innerHeight); }
    }

    // --- Start Game Play Method (Called by Network 'initialize' handler) ---
    startGamePlay(initData) {
        console.log('[Game] Attempting to start gameplay...');
        console.log('[Game] Received initialization data:', JSON.stringify(initData));

        // --- Essential Prerequisite Checks ---
        if (!initData?.id || typeof initData.players !== 'object') {
            console.error("!!! Invalid initialization data received from server:", initData);
            stateMachine?.transitionTo('homescreen'); UIManager?.showError("Server Init Invalid!", "homescreen"); return;
        }
        if (!rapierWorld || !RAPIER || this.mapColliderHandle === null || this.mapColliderHandle === undefined) {
            console.error("!!! Cannot start gameplay: Rapier world or map collider not ready!");
            stateMachine?.transitionTo('homescreen'); UIManager?.showError("Physics Not Ready!", 'homescreen'); return;
        }
        if (stateMachine?.is('playing')) {
            console.warn("[Game] startGamePlay called while already playing. Resetting state first.");
             this.cleanupGameState();
        } else {
            console.log("[Game] Cleaning up previous player/physics state before starting...");
            this.cleanupGameState();
        }

        // --- Set Local Player ID ---
        localPlayerId = initData.id; window.localPlayerId = localPlayerId;
        console.log(`[Game] Local Player ID set to: ${localPlayerId}`);

        // --- Create Player Objects and Physics Bodies ---
        console.log("[Game] Creating player objects and Rapier bodies based on initData...");
        const playerHeight = CONFIG?.PLAYER_HEIGHT || 1.8;
        const playerRadius = CONFIG?.PLAYER_RADIUS || 0.4;
        const capsuleHalfHeight = Math.max(0.01, playerHeight / 2.0 - playerRadius);

        let localPlayerCreated = false;
        for (const id in initData.players) {
            const serverPlayerData = initData.players[id];
            if (serverPlayerData.x === undefined || serverPlayerData.y === undefined || serverPlayerData.z === undefined) {
                console.warn(`[Game] Invalid position data for player ${id}. Skipping creation.`); continue;
            }
            const bodyCenterY = serverPlayerData.y + playerHeight / 2.0;

            try {
                let playerColliderDesc = RAPIER.ColliderDesc.capsule(capsuleHalfHeight, playerRadius)
                    .setFriction(0.7).setRestitution(0.1).setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);

                // --- Initial Rotation ---
                const initialRotationY = serverPlayerData.rotationY || 0;
                 // *** FIX: Set rotation directly on RigidBodyDesc using Euler angles ***
                 const initialRotationEuler = { x: 0, y: initialRotationY, z: 0 };

                let rigidBody; let rigidBodyDesc;

                // --- LOCAL PLAYER ---
                if (id === localPlayerId) {
                    console.log(`[Game] Initializing LOCAL player: ${serverPlayerData.name || 'Unnamed'} (ID: ${id})`);
                    window.players[id] = { ...serverPlayerData, isLocal: true, mesh: null };
                    rigidBodyDesc = RAPIER.RigidBodyDesc.dynamic()
                        .setTranslation(serverPlayerData.x, bodyCenterY, serverPlayerData.z)
                        .setRotation(initialRotationEuler) // <<< USE EULER ANGLES HERE
                        .setLinvel(0, 0, 0).setAngvel({ x: 0, y: 0, z: 0 })
                        .setLinearDamping(0.5).setAngularDamping(1.0)
                        .lockRotations().setCanSleep(false);
                    rigidBody = rapierWorld.createRigidBody(rigidBodyDesc);
                    if (!rigidBody) throw new Error("Failed to create local player rigid body.");
                    this.playerRigidBodyHandles[id] = rigidBody.handle;
                    console.log(`[Game] Created DYNAMIC Rapier body for local player. Handle: ${rigidBody.handle}`);
                    rapierWorld.createCollider(playerColliderDesc, rigidBody.handle);
                    this.syncCameraToBody(rigidBody);
                    if (UIManager) {
                        UIManager.updateHealthBar(serverPlayerData.health ?? CONFIG.PLAYER_DEFAULT_HEALTH);
                        UIManager.updateInfo(`Playing as ${serverPlayerData.name || 'Player'}`);
                        UIManager.clearError('homescreen'); UIManager.clearKillMessage();
                    }
                    localPlayerCreated = true;
                }
                // --- REMOTE PLAYER ---
                else {
                    console.log(`[Game] Initializing REMOTE player: ${serverPlayerData.name || 'Unnamed'} (ID: ${id})`);
                    let remotePlayerInstance = null;
                    if (typeof Network?._addPlayer === 'function') { remotePlayerInstance = Network._addPlayer(serverPlayerData); }
                    else { console.error("!!! Network._addPlayer function missing!"); }
                    if (!remotePlayerInstance || !(remotePlayerInstance instanceof ClientPlayer)) {
                        console.warn(`[Game] Failed ClientPlayer instance for remote ${id}. Skipping physics.`); continue;
                    }
                    rigidBodyDesc = RAPIER.RigidBodyDesc.kinematicPositionBased()
                        .setTranslation(serverPlayerData.x, bodyCenterY, serverPlayerData.z)
                        .setRotation(initialRotationEuler); // <<< USE EULER ANGLES HERE
                    rigidBody = rapierWorld.createRigidBody(rigidBodyDesc);
                    if (!rigidBody) throw new Error(`Failed to create remote player (${id}) rigid body.`);
                    this.playerRigidBodyHandles[id] = rigidBody.handle;
                    console.log(`[Game] Created KINEMATIC Rapier body for remote player ${id}. Handle: ${rigidBody.handle}`);
                    rapierWorld.createCollider(playerColliderDesc, rigidBody.handle);
                }
            } catch (bodyError) {
                 console.error(`!!! Error creating player body or collider for ID ${id}:`, bodyError);
                 this.cleanupPlayer(id); // Attempt cleanup for the failed player
                 if (id === localPlayerId) { // Critical if local player failed
                     stateMachine?.transitionTo('homescreen');
                     UIManager?.showError("FATAL: Player Init Fail!", 'homescreen');
                     return; // Stop initialization
                 }
            }
        } // End loop through initData.players

        if (!localPlayerCreated) {
             console.error("!!! CRITICAL: Local player not created (missing in initData or failed creation)!");
             stateMachine?.transitionTo('homescreen'); UIManager?.showError("FATAL: Local Player Missing!", 'homescreen'); return;
        }
        console.log(`[Game] Player initialization complete. ${Object.keys(window.players).length} players in state.`);

        // --- Transition to Playing State ---
        if (stateMachine) { console.log("[Game] Transitioning state machine to 'playing'..."); stateMachine.transitionTo('playing'); }
        else { console.error("!!! stateMachine is missing! Cannot transition to playing state."); }
    } // End startGamePlay()

    // --- Helper: Sync Camera to Body ---
    syncCameraToBody(playerBody) {
        if (playerBody && controls?.getObject()) {
            const bodyPos = playerBody.translation();
            const cameraOffset = CONFIG?.CAMERA_Y_OFFSET ?? 1.6;
            controls.getObject().position.set(bodyPos.x, bodyPos.y + cameraOffset, bodyPos.z);
        }
    }

     // --- Helper: Cleanup Game State (Players & Physics) ---
     cleanupGameState() {
         console.log("[Game Cleanup] Cleaning up player objects and physics bodies...");
         // Remove Rapier bodies
         for (const playerId in this.playerRigidBodyHandles) {
             const handle = this.playerRigidBodyHandles[playerId];
             if (rapierWorld && handle !== undefined && handle !== null) {
                 try { let body = rapierWorld.getRigidBody(handle); if (body) rapierWorld.removeRigidBody(body); }
                 catch (e) { /* Ignore errors during cleanup */ }
             }
         }
         this.playerRigidBodyHandles = {};
         // Remove visual meshes and clear player data using Network helper
         for (const id in window.players) {
             if (typeof Network?._removePlayer === 'function') { Network._removePlayer(id); }
             else { if(window.players[id] instanceof ClientPlayer) window.players[id].remove(); delete window.players[id]; }
         }
         window.players = {}; // Ensure players object is empty
         localPlayerId = null; window.localPlayerId = null; // Reset local ID
         console.log("[Game Cleanup] State cleared.");
     }

     // --- Helper: Cleanup a Single Player ---
     cleanupPlayer(playerId) {
         console.warn(`[Game Cleanup] Cleaning up individual player: ${playerId}`);
         const handle = this.playerRigidBodyHandles[playerId];
         if (rapierWorld && handle !== undefined && handle !== null) {
             try { let body = rapierWorld.getRigidBody(handle); if (body) rapierWorld.removeRigidBody(body); }
             catch (e) { /* Ignore */ }
             delete this.playerRigidBodyHandles[playerId];
         }
         if (typeof Network?._removePlayer === 'function') { Network._removePlayer(playerId); }
         else { if(window.players[playerId] instanceof ClientPlayer) window.players[playerId].remove(); delete window.players[playerId]; }
     }

    // --- Start Asset Loading Process ---
    startAssetLoading() {
        console.log("[Game] Requesting asset loading via LoadManager...");
        if (typeof loadManager?.startLoading === 'function') { loadManager.startLoading(); }
        else { console.error("!!! LoadManager or startLoading missing!"); if (stateMachine) stateMachine.transitionTo('loading', { message: "FATAL: Asset Mgr Fail!", error: true }); }
    }

} // End Game Class

// --- Global Game Initialization Function ---
function runGame() {
     console.log("--- runGame() invoked ---");
     try {
         if (window.currentGameInstance) { console.warn("!!! Previous game instance found. Overwriting."); }
         const gameInstance = new Game();
         window.currentGameInstance = gameInstance;
         gameInstance.start();
     } catch (e) {
         console.error("!!! CRITICAL Error Creating Game Instance:", e);
         document.body.innerHTML = `<p style='color:red; font-size: 1.5em; text-align: center; padding: 20px;'>FATAL ERROR: GAME INITIALIZATION FAILED.<br/>Check console (F12) for details.</p>`;
     }
}

// --- DOM Ready Check ---
if (document.readyState === 'loading') {
    console.log("DOM not ready, adding DOMContentLoaded listener for runGame().");
    document.addEventListener('DOMContentLoaded', runGame);
} else {
    console.log("DOM already ready, calling runGame() immediately.");
    runGame();
}

console.log("game.js loaded (Fixed Rapier Rotation Setting)");
