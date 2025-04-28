// docs/game.js - Main Game Orchestrator (REGENERATED with Debug Logs & Robustness Checks)

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
        this.mapMesh = null;
        this.playerRigidBodyHandles = {};
        this.mapColliderHandle = null;
        // Note: rapierWorld and rapierEventQueue are reset/created in initializePhysics
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
            // Scene
            this.scene = new THREE.Scene(); window.scene = this.scene; // Assign to global scope
            this.scene.background = new THREE.Color(0x6699cc); // Sky blue
            this.scene.fog = new THREE.Fog(0x6699cc, 20, 200); // Fog effect

            // Camera
            this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
            window.camera = this.camera; // Assign to global scope
            // Camera position is dynamic, set relative to player later

            // Clock
            this.clock = new THREE.Clock(); window.clock = this.clock; // Assign to global scope

            // Renderer
            const canvasElement = document.getElementById('gameCanvas');
            if (!canvasElement) throw new Error("Required canvas element '#gameCanvas' not found in HTML!");
            this.renderer = new THREE.WebGLRenderer({ canvas: canvasElement, antialias: true });
            window.renderer = this.renderer; // Assign to global scope
            this.renderer.setSize(window.innerWidth, window.innerHeight);
            this.renderer.shadowMap.enabled = true; // Enable shadows
            this.renderer.shadowMap.type = THREE.PCFSoftShadowMap; // Optional: Softer shadows

            // Pointer Lock Controls
            this.controls = new THREE.PointerLockControls(this.camera, document.body);
            window.controls = this.controls; // Assign to global scope
            this.controls.addEventListener('lock', () => { console.log('[Controls] Pointer Locked'); });
            this.controls.addEventListener('unlock', () => { console.log('[Controls] Pointer Unlocked'); });
            // We move the controls.getObject() container in the animate loop

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

            // Lighting
            const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
            this.scene.add(ambientLight);
            const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
            directionalLight.position.set(30, 40, 20); // Adjust light direction
            directionalLight.castShadow = true;
            directionalLight.shadow.mapSize.width = 1024;
            directionalLight.shadow.mapSize.height = 1024;
             // Adjust shadow camera frustum to encompass the expected map size
             directionalLight.shadow.camera.near = 1;
             directionalLight.shadow.camera.far = 150; // Increased far plane
             directionalLight.shadow.camera.left = -60; // Wider bounds
             directionalLight.shadow.camera.right = 60;
             directionalLight.shadow.camera.top = 60;
             directionalLight.shadow.camera.bottom = -60;
            this.scene.add(directionalLight);
            this.scene.add(directionalLight.target); // Important for directing the light

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
            // This case should ideally be caught by the constructor listener, but double-check
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
            // Ensure previous world is cleared if somehow it existed but wasn't assigned globally
            if (window.rapierWorld) { window.rapierWorld = null; window.rapierEventQueue = null; }

            rapierWorld = new RAPIER.World(gravityVector); // Assign to global scope
            window.rapierWorld = rapierWorld; // Ensure global assignment
            if (!rapierWorld) throw new Error("Failed to create Rapier World.");

            rapierEventQueue = new RAPIER.EventQueue(true); // Enable event reporting
            window.rapierEventQueue = rapierEventQueue; // Ensure global assignment
            if (!rapierEventQueue) throw new Error("Failed to create Rapier EventQueue.");

            console.log("[Game] Rapier world and event queue created successfully.");
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
        // Check if manager globals exist (should be loaded via script tags)
        if (!window.UIManager || !window.Input || !window.stateMachine || !window.loadManager || !window.Network || !window.Effects) {
            console.error("!!! One or more required global managers are undefined!");
            UIManager?.showError("FATAL: Core Manager Load!", 'loading');
            if (stateMachine) stateMachine.transitionTo('loading', { message: "FATAL: Mgr Load Fail!", error: true });
            return false;
        }
        try {
            // Initialize each manager, checking return values if they provide them
            if (!UIManager.initialize()) throw new Error("UIManager initialization failed");
            // Input needs controls, which should exist after initializeThreeJS
            if (!this.controls) throw new Error("PointerLockControls not ready for Input Manager");
            if (!Input.init(this.controls)) throw new Error("Input initialization failed"); // Pass controls ref
            Effects.initialize(this.scene); // Pass scene ref

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
                Network.init(); // Calls Network.setupSocketIO() internally
                console.log("[Game] Network initialization requested.");
                return true; // init() itself is likely async connection-wise
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
        // --- 'ready' Event: All required assets loaded successfully ---
        loadManager.on('ready', () => {
            console.log("[Game] LoadManager 'ready' event received. All required assets loaded.");
            assetsAreReady = true;
            this.mapMesh = loadManager.getAssetData('map'); // Get the processed map Object3D

            if (!this.mapMesh) {
                console.error("!!! Map data missing from LoadManager even after 'ready' event! Critical error.");
                if (stateMachine) stateMachine.transitionTo('loading', { message: "FATAL: Map Data Corrupt!", error: true });
                return;
            }
            console.log("[Game] Visual map mesh reference stored.");
            // Add visual map to the scene if it's not already there
            if (this.scene && !this.mapMesh.parent) {
                 this.scene.add(this.mapMesh);
                 console.log("[Game] Added visual map mesh to the Three.js scene.");
             }

            // --- Create Rapier Map Collider ---
            // This MUST happen AFTER Rapier is ready AND the map asset is loaded.
            this.createMapCollider(); // Encapsulated collider creation

            // Attempt to proceed (e.g., to homescreen or start game)
            this.attemptProceedToGame();
        });

        // --- 'error' Event: An error occurred during loading ---
        loadManager.on('error', (errorData) => {
            console.error("!!! LoadManager reported an error:", errorData);
            assetsAreReady = false; // Mark assets as not ready
            this.mapMesh = null; // Clear map mesh reference
            // Consider resetting mapColliderHandle if it was created? Less critical if game won't start.
            // this.mapColliderHandle = null;

            // Transition to an error state
            if (stateMachine) stateMachine.transitionTo('loading', { message: `FATAL: Asset Load Error!<br/>${errorData.message || 'Unknown asset error'}`, error: true });
        });
        console.log("[Game] LoadManager event listeners bound ('ready', 'error').");
    }

    // --- Create Rapier Collider for the Map ---
    createMapCollider() {
        // Only proceed if Rapier is ready, world exists, map mesh loaded, and collider not yet created
        if (!RAPIER || !rapierWorld || !this.mapMesh || this.mapColliderHandle !== null) {
            if (this.mapColliderHandle !== null) console.warn("[Game] Map collider already exists. Skipping recreation.");
            else console.warn(`[Game] Cannot create map collider. Conditions not met: RapierReady=${!!RAPIER}, WorldReady=${!!rapierWorld}, MapMeshReady=${!!this.mapMesh}`);
            return false; // Indicate failure or already done
        }

        console.log("[Game] Attempting to create Rapier trimesh collider for the map...");
        try {
            let foundGeometry = false;
            let createdCollider = null;

            this.mapMesh.traverse((child) => {
                // Find the first suitable mesh with geometry
                if (!foundGeometry && child.isMesh && child.geometry) {
                    let geometry = child.geometry;
                    // Ensure geometry has position attribute
                    if (!geometry.attributes.position || geometry.attributes.position.count === 0) {
                         console.warn(`[Game] Skipping mesh '${child.name || '?'}': No position vertices.`);
                         return; // Continue traversal
                    }

                    let vertices = geometry.attributes.position.array;
                    let indices = geometry.index ? geometry.index.array : null;

                    console.log(`[Game] Found map geometry in mesh: ${child.name || '?'}. Vertices: ${vertices.length / 3}${indices ? `, Indices: ${indices.length / 3}` : ', No Indices (will generate triangles from vertices)'}.`);

                    let colliderDesc;
                    if (indices) {
                        // Use vertices and indices directly
                        colliderDesc = RAPIER.ColliderDesc.trimesh(vertices, indices);
                    } else {
                        // If no indices, Rapier expects vertices grouped into triangles [v1x, v1y, v1z, v2x, v2y, v2z, v3x, v3y, v3z, ...]
                        // This might be incorrect if the model vertices aren't ordered this way.
                        console.warn(`[Game] Map geometry '${child.name || '?'}' lacks indices. Creating trimesh from raw vertices; collision might be inaccurate if vertices are not ordered per-triangle.`);
                        if ((vertices.length / 3) % 3 !== 0) {
                             console.error(`[Game] Vertex count (${vertices.length / 3}) is not divisible by 3. Cannot form triangles for Rapier trimesh without indices. Skipping mesh.`);
                             return; // Cannot proceed with this mesh
                        }
                        colliderDesc = RAPIER.ColliderDesc.trimesh(vertices); // Rapier expects flat array
                    }

                    // Set physics properties for the map collider
                    colliderDesc.setFriction(0.7).setRestitution(0.1).setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS); // Enable collision events if needed later

                    // Create the collider in the Rapier world
                    createdCollider = rapierWorld.createCollider(colliderDesc);
                    if (!createdCollider) throw new Error("Rapier world failed to create map collider object.");

                    this.mapColliderHandle = createdCollider.handle; // Store the handle

                    console.log(`[Game] Successfully created Rapier map collider with handle: ${this.mapColliderHandle}`);
                    foundGeometry = true; // Stop traversal after finding and processing the first suitable mesh
                }
            }); // End traverse

            if (!foundGeometry) {
                 console.error("!!! No suitable mesh with geometry found within the loaded map asset to create a collider!");
                 UIManager?.showError("Map Physics Failed (No Mesh Found)!", 'loading');
                 if(stateMachine) stateMachine.transitionTo('loading', {message:"Map Physics Failed!", error:true});
                 return false;
             }

            return true; // Collider created successfully

        } catch (e) {
            console.error("!!! Error during Rapier map collider creation:", e);
            this.mapColliderHandle = null; // Ensure handle is null on error
            if (stateMachine) stateMachine.transitionTo('loading', { message: `FATAL: Map Physics Error!<br/>${e.message}`, error: true });
            return false; // Indicate failure
        }
    }

    // --- Check if all prerequisites for starting gameplay or moving to homescreen are met ---
    attemptProceedToGame() {
        const rapierIsSetup = !!RAPIER && !!rapierWorld; // Basic Rapier init done
        const mapColliderExists = this.mapColliderHandle !== null && this.mapColliderHandle !== undefined; // Map physics ready
        console.log(`[Game] Checking prerequisites: RapierSetup=${rapierIsSetup}, MapCollider=${mapColliderExists}, AssetsReady=${assetsAreReady}, NetworkInitialized=${networkIsInitialized}, InitDataReceived=${!!initializationData}`);

        // Condition 1: Ready to START the actual gameplay
        if (rapierIsSetup && mapColliderExists && assetsAreReady && networkIsInitialized && initializationData) {
            console.log("[Game] All prerequisites met -> Calling startGamePlay...");
            if (typeof this.startGamePlay === 'function') {
                 this.startGamePlay(initializationData);
             } else {
                 console.error("!!! CRITICAL: startGamePlay method is missing on the game instance!");
                 if(stateMachine) stateMachine.transitionTo('loading',{message:'Internal Game Error!', error:true});
             }
        }
        // Condition 2: Ready to go to the HOMESCREEN (Physics & Assets ready, waiting for network/join)
        else if (rapierIsSetup && mapColliderExists && assetsAreReady && stateMachine?.is('loading')) {
             console.log("[Game] Core components (Physics, Assets, Map Collider) ready -> Transitioning to Homescreen");
             let currentPCount = '?';
             if (UIManager?.playerCountSpan) currentPCount = UIManager.playerCountSpan.textContent ?? '?';
             stateMachine.transitionTo('homescreen', { playerCount: currentPCount });
        }
        // Condition 3: Still waiting...
        else {
             const waitingFor = [];
             if (!rapierIsSetup) waitingFor.push("Rapier");
             if (!mapColliderExists) waitingFor.push("Map Collider");
             if (!assetsAreReady) waitingFor.push("Assets");
             if (!networkIsInitialized) waitingFor.push("Network Connection");
             if (!initializationData && networkIsInitialized) waitingFor.push("Server Init Data"); // Only wait if connected
             console.log(`[Game] Still waiting for prerequisites: [${waitingFor.join(', ')}]. Current state: ${stateMachine?.currentState || 'unknown'}`);
             // No state change needed here, just wait for other events to trigger this check again.
        }
    }

    // --- Bind State Machine Transition Listeners ---
    bindOtherStateTransitions() {
        if (UIManager?.bindStateListeners) UIManager.bindStateListeners(stateMachine);
        else console.error("!!! UIManager or bindStateListeners method missing!");

        if (stateMachine) {
            stateMachine.on('transition', (data) => { // Listen to generic transition event
                const fromState = data.from;
                const toState = data.to;
                console.log(`[Game State Listener] Transition detected: ${fromState} -> ${toState}`);

                // --- Cleanup Logic: When leaving 'playing' or 'joining' towards a non-playing state ---
                if ((fromState === 'playing' || fromState === 'joining') && (toState === 'homescreen' || toState === 'loading')) {
                    console.log(`[Game State] Cleaning up physics and player state after leaving ${fromState} for ${toState}...`);

                    // Remove all player rigid bodies from Rapier world
                    for (const playerId in this.playerRigidBodyHandles) {
                        const handle = this.playerRigidBodyHandles[playerId];
                        if (rapierWorld && handle !== undefined && handle !== null) {
                            try {
                                let body = rapierWorld.getRigidBody(handle);
                                if (body) {
                                    rapierWorld.removeRigidBody(body);
                                    // console.log(`Removed Rapier body handle ${handle} for player ${playerId}`);
                                }
                            } catch (e) { console.error(`Error removing rigid body handle ${handle} for player ${playerId}:`, e); }
                        }
                    }
                    this.playerRigidBodyHandles = {}; // Clear the handles map

                    // Remove visual meshes & player data (Network._removePlayer handles this)
                    for (const id in window.players) { // Use global players object
                        if (id !== localPlayerId && typeof Network?._removePlayer === 'function') {
                            Network._removePlayer(id); // Calls player.remove() and deletes from players object
                        }
                    }
                    // Clear local player reference from global object
                    if (window.players?.[localPlayerId]) {
                        delete window.players[localPlayerId];
                    }
                    window.players = {}; // Reset global players object

                    localPlayerId = null; // Reset local player ID

                    // Reset network/init flags (might be redundant depending on flow)
                    networkIsInitialized = false; // Needs re-init on next join attempt
                    initializationData = null;

                    // Unlock controls if locked
                    if (controls?.isLocked) {
                        controls.unlock();
                        console.log("[Game State] Unlocked pointer controls during cleanup.");
                    }
                    console.log("[Game State] Player and physics state cleared.");
                }

                // --- Setup Logic: When entering 'playing' ---
                else if (toState === 'playing') {
                    // UI updates (health, info) are now handled at the end of startGamePlay
                    console.log("[Game State] Entered 'playing' state.");
                    // Consider locking controls automatically here? Or require user click.
                    // if (controls && !controls.isLocked) controls.lock();
                }

                // --- Handling Loading Errors during transition ---
                 else if (toState === 'loading' && data.options?.error) {
                     console.error(`[Game State] Transitioned to loading state with error: ${data.options.message}`);
                     // Ensure controls are unlocked
                     if (controls?.isLocked) controls.unlock();
                     // Reset critical state flags
                     networkIsInitialized = false;
                     assetsAreReady = false; // Assets might need reloading
                     initializationData = null;
                     // Perform cleanup similar to leaving 'playing' state, just in case
                     for (const handle of Object.values(this.playerRigidBodyHandles)) { /* remove bodies */ }
                     this.playerRigidBodyHandles = {};
                     for (const id in window.players) { if (id !== localPlayerId) Network?._removePlayer(id); }
                     if (window.players?.[localPlayerId]) delete window.players[localPlayerId];
                     window.players = {};
                     localPlayerId = null;
                     console.log("[Game State] Performed cleanup due to loading error state.");
                 }
            });
        } else {
            console.error("!!! stateMachine is missing! Cannot bind state transitions.");
        }
        console.log("[Game] State transition listeners bound.");
    }

    // --- Add Global Event Listeners (Window Resize, Join Button) ---
    addEventListeners() {
        console.log("[Game] Adding global event listeners (Resize, Join Button)...");

        // Join Button Listener
        if (UIManager?.joinButton && typeof Network?.attemptJoinGame === 'function') {
            UIManager.joinButton.addEventListener('click', () => {
                // Prerequisite checks are now handled inside Network.attemptJoinGame
                Network.attemptJoinGame();
            });
            console.log("[Game] 'Join Game' button click listener added.");
        } else {
            console.error("!!! Cannot add join listener: UIManager.joinButton or Network.attemptJoinGame is missing!");
        }

        // Window Resize Listener
        window.addEventListener('resize', this.handleResize.bind(this)); // Use bind for correct 'this'

        console.log("[Game] Global event listeners added.");
    }

    // --- Main Update/Animate Loop ---
    animate() {
        requestAnimationFrame(() => this.animate()); // Maintain 'this' context

        const dt = this.clock ? this.clock.getDelta() : 0.0166; // Delta time or fixed step fallback

        // --- Physics Step ---
        if (rapierWorld && rapierEventQueue) {
            try {
                rapierWorld.step(rapierEventQueue); // Advance physics simulation
                // --- Event Processing (Example) ---
                // rapierEventQueue.drainCollisionEvents((handle1, handle2, started) => {
                //    console.log(`Collision event: ${handle1}, ${handle2}, Started: ${started}`);
                // });
            } catch (e) {
                console.error("!!! Error during Rapier world step:", e);
                // Consider pausing or showing an error overlay
            }
        }

        // --- Gameplay Updates (Only when playing) ---
        if (stateMachine?.is('playing') && localPlayerId && window.players[localPlayerId]) {
            try {
                // Update Local Player based on Input & Physics
                const localHandle = this.playerRigidBodyHandles[localPlayerId];
                const localBody = (localHandle !== undefined && localHandle !== null && rapierWorld) ? rapierWorld.getRigidBody(localHandle) : null;
                if (typeof updateLocalPlayer === 'function' && localBody) {
                    updateLocalPlayer(dt, localBody); // Update local physics based on input
                } else if (!localBody) {
                    // console.warn("[Animate] Local player body not found for update."); // Can be spammy
                }

                // Update Other Systems (Effects, etc.)
                if (typeof Effects?.update === 'function') {
                    Effects.update(dt);
                }

                // --- Sync Camera to Local Player's Physics Body ---
                if (localBody && controls?.getObject()) {
                    const playerPosition = localBody.translation(); // Center of the Rapier body
                    const cameraOffset = CONFIG?.CAMERA_Y_OFFSET ?? 1.6; // Height relative to body center
                    controls.getObject().position.set(
                        playerPosition.x,
                        playerPosition.y + cameraOffset,
                        playerPosition.z
                    );
                    // Camera rotation is handled by PointerLockControls based on mouse input
                }

                // --- Sync Remote Player Visual Meshes to Kinematic Bodies ---
                for (const id in window.players) {
                    if (id === localPlayerId) continue; // Skip local player

                    const remotePlayer = window.players[id];
                    // Check if it's a valid remote player with a mesh
                    if (remotePlayer instanceof ClientPlayer && remotePlayer.mesh) {
                        const remoteHandle = this.playerRigidBodyHandles[id];
                        const remoteBody = (remoteHandle !== undefined && remoteHandle !== null && rapierWorld) ? rapierWorld.getRigidBody(remoteHandle) : null;

                        if (remoteBody) {
                            const bodyPosition = remoteBody.translation(); // Get current position from physics body
                            const bodyRotation = remoteBody.rotation(); // Get current rotation from physics body

                            // Apply physics position/rotation directly to the Three.js mesh
                            remotePlayer.mesh.position.set(bodyPosition.x, bodyPosition.y, bodyPosition.z);
                            remotePlayer.mesh.quaternion.set(bodyRotation.x, bodyRotation.y, bodyRotation.z, bodyRotation.w);

                            // --- Optional Y-Offset Adjustment ---
                            // If Rapier body center != visual mesh origin (e.g., mesh origin at feet)
                            const playerHeight = CONFIG?.PLAYER_HEIGHT || 1.8;
                            // Heuristic: Assume Cylinder origin is center, others might be at feet.
                            // Adjust if the model's origin is known to be at its base.
                            if (!(remotePlayer.mesh.geometry instanceof THREE.CylinderGeometry)) {
                                // Shift mesh down by half height if its origin is at feet
                                // remotePlayer.mesh.position.y -= playerHeight / 2.0;
                                // NOTE: If your GLTF model's origin IS ALREADY CENTERED, REMOVE this adjustment.
                                // For Shawty1.glb, assuming origin might be near feet, this might be needed.
                                // If Shawty1.glb origin is centered, comment out the line below.
                                remotePlayer.mesh.position.y -= playerHeight / 2.0; // ASSUMING FEET ORIGIN FOR GLB
                            }
                        } else {
                           // console.warn(`[Animate] Remote player ${id} has mesh but no physics body found.`);
                        }
                    }
                } // End remote player loop

            } catch (e) {
                console.error("!!! Error during main 'playing' state update loop:", e);
                // Graceful error handling? Pause game?
            }
        } // End 'playing' state updates

        // --- Rendering ---
        if (renderer && scene && camera) {
            try {
                renderer.render(scene, camera);
            } catch (e) {
                console.error("!!! Error during Three.js rendering:", e);
                // Stop loop? Show error?
            }
        } else {
             // console.warn("[Animate] Renderer, Scene, or Camera missing. Skipping render.");
        }
    } // End animate()

    // --- Window Resize Handler ---
    handleResize() {
        if (camera) {
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
        }
        if (renderer) {
            renderer.setSize(window.innerWidth, window.innerHeight);
        }
         // console.log("[Game] Handled window resize."); // Optional log
    }

    // --- Start Game Play Method (Called by Network 'initialize' handler) ---
    startGamePlay(initData) {
        console.log('[Game] Attempting to start gameplay...');
        console.log('[Game] Received initialization data:', JSON.stringify(initData)); // Log received data

        // --- Essential Prerequisite Checks ---
        if (!initData?.id || typeof initData.players !== 'object') {
            console.error("!!! Invalid initialization data received from server:", initData);
            stateMachine?.transitionTo('homescreen');
            UIManager?.showError("Server Init Invalid!", "homescreen");
            return;
        }
        if (!rapierWorld || !RAPIER || this.mapColliderHandle === null || this.mapColliderHandle === undefined) {
            console.error("!!! Cannot start gameplay: Rapier physics world or map collider not ready!");
            stateMachine?.transitionTo('homescreen'); // Go back if physics isn't ready
            UIManager?.showError("Physics Not Ready!", 'homescreen');
            return;
        }
        if (stateMachine?.is('playing')) {
            console.warn("[Game] startGamePlay called while already in 'playing' state. Resetting state first.");
            // Force cleanup before proceeding (should ideally be handled by state transition, but belt-and-suspenders)
             this.cleanupGameState(); // Call cleanup manually
        } else {
            console.log("[Game] Cleaning up previous player/physics state before starting new game...");
            this.cleanupGameState(); // Ensure clean state
        }

        // --- Set Local Player ID ---
        localPlayerId = initData.id;
        window.localPlayerId = localPlayerId; // Update global reference
        console.log(`[Game] Local Player ID set to: ${localPlayerId}`);

        // --- Create Player Objects and Physics Bodies ---
        console.log("[Game] Creating player objects and Rapier bodies based on initData...");
        const playerHeight = CONFIG?.PLAYER_HEIGHT || 1.8;
        const playerRadius = CONFIG?.PLAYER_RADIUS || 0.4;
        // Height of the cylindrical part of the capsule collider
        const capsuleHalfHeight = Math.max(0.01, playerHeight / 2.0 - playerRadius);

        let localPlayerCreated = false;
        for (const id in initData.players) {
            const serverPlayerData = initData.players[id];

            // Validate essential position data from server
            if (serverPlayerData.x === undefined || serverPlayerData.y === undefined || serverPlayerData.z === undefined) {
                console.warn(`[Game] Invalid position data for player ${id} in initData. Skipping creation.`);
                continue;
            }

            // Calculate Rapier body center Y position. Server sends Y at feet.
            // IMPORTANT: Use server Y + half height for initial placement. Physics handles falling.
            const bodyCenterY = serverPlayerData.y + playerHeight / 2.0;

            try {
                // Define the collider shape (Capsule) shared by all players
                let playerColliderDesc = RAPIER.ColliderDesc.capsule(capsuleHalfHeight, playerRadius)
                    .setFriction(0.7)
                    .setRestitution(0.1) // Slight bounciness
                    .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS); // Enable collision events

                // --- Initial Rotation Quaternion ---
                const initialRotationY = serverPlayerData.rotationY || 0;
                const initialRotationQuat = RAPIER.Quaternion.fromAxisAngle({ x: 0, y: 1, z: 0 }, initialRotationY);
                if (!initialRotationQuat) throw new Error(`Quaternion creation failed for player ${id}!`);

                let rigidBody;
                let rigidBodyDesc;

                // --- LOCAL PLAYER ---
                if (id === localPlayerId) {
                    console.log(`[Game] Initializing LOCAL player: ${serverPlayerData.name || 'Unnamed'} (ID: ${id})`);
                    // Store player data in the global players object
                    window.players[id] = { ...serverPlayerData, isLocal: true, mesh: null }; // No visual mesh for local player

                    // Create Dynamic Rigid Body for local player
                    rigidBodyDesc = RAPIER.RigidBodyDesc.dynamic()
                        .setTranslation(serverPlayerData.x, bodyCenterY, serverPlayerData.z)
                        .setRotation(initialRotationQuat)
                        .setLinvel(0, 0, 0).setAngvel({ x: 0, y: 0, z: 0 }) // Start stationary
                        .setLinearDamping(0.5).setAngularDamping(1.0) // Damping
                        .lockRotations() // Prevent capsule from falling over
                        .setCanSleep(false); // Keep player active

                    rigidBody = rapierWorld.createRigidBody(rigidBodyDesc);
                    if (!rigidBody) throw new Error("Failed to create local player rigid body.");

                    this.playerRigidBodyHandles[id] = rigidBody.handle; // Store handle
                    console.log(`[Game] Created DYNAMIC Rapier body for local player. Handle: ${rigidBody.handle}`);

                    // Create and attach the collider to the body
                    rapierWorld.createCollider(playerColliderDesc, rigidBody.handle);

                    // Sync Initial Camera Position to the new body's position
                    this.syncCameraToBody(rigidBody);

                    // Update UI for local player
                    if (UIManager) {
                        UIManager.updateHealthBar(serverPlayerData.health ?? CONFIG.PLAYER_DEFAULT_HEALTH);
                        UIManager.updateInfo(`Playing as ${serverPlayerData.name || 'Player'}`);
                        UIManager.clearError('homescreen');
                        UIManager.clearKillMessage();
                    }
                    localPlayerCreated = true;

                }
                // --- REMOTE PLAYER ---
                else {
                    console.log(`[Game] Initializing REMOTE player: ${serverPlayerData.name || 'Unnamed'} (ID: ${id})`);
                    // Create ClientPlayer instance (loads mesh) using Network helper
                    let remotePlayerInstance = null;
                    if (typeof Network?._addPlayer === 'function') {
                        remotePlayerInstance = Network._addPlayer(serverPlayerData); // Creates ClientPlayer, adds to window.players[id]
                    } else { console.error("!!! Network._addPlayer function missing!"); }

                    if (!remotePlayerInstance || !(remotePlayerInstance instanceof ClientPlayer)) {
                        console.warn(`[Game] Failed to create ClientPlayer visual instance for remote player ${id}. Skipping physics body.`);
                        continue; // Skip physics if visual representation failed
                    }

                    // Create Kinematic Position-Based Rigid Body for remote players
                    rigidBodyDesc = RAPIER.RigidBodyDesc.kinematicPositionBased()
                        .setTranslation(serverPlayerData.x, bodyCenterY, serverPlayerData.z)
                        .setRotation(initialRotationQuat);
                        // Kinematic bodies are moved manually via setNextKinematic...

                    rigidBody = rapierWorld.createRigidBody(rigidBodyDesc);
                    if (!rigidBody) throw new Error(`Failed to create remote player (${id}) rigid body.`);

                    this.playerRigidBodyHandles[id] = rigidBody.handle; // Store handle
                    console.log(`[Game] Created KINEMATIC Rapier body for remote player ${id}. Handle: ${rigidBody.handle}`);

                    // Create and attach the collider
                    rapierWorld.createCollider(playerColliderDesc, rigidBody.handle);
                } // End if remote player

            } catch (bodyError) {
                 console.error(`!!! Error creating player body or collider for ID ${id}:`, bodyError);
                 // Attempt cleanup for the failed player
                 this.cleanupPlayer(id);
                 // If local player failed, it's critical -> go back to homescreen
                 if (id === localPlayerId) {
                     stateMachine?.transitionTo('homescreen');
                     UIManager?.showError("FATAL: Player Init Fail!", 'homescreen');
                     return; // Stop initialization process
                 }
            }
        } // End loop through initData.players

        if (!localPlayerCreated) {
             console.error("!!! CRITICAL: Local player was not found in initialization data or failed to be created!");
             stateMachine?.transitionTo('homescreen');
             UIManager?.showError("FATAL: Local Player Missing!", 'homescreen');
             return;
        }

        console.log(`[Game] Player initialization complete. ${Object.keys(window.players).length} players in state.`);

        // --- Transition to Playing State ---
        if (stateMachine) {
            console.log("[Game] Transitioning state machine to 'playing'...");
            stateMachine.transitionTo('playing');
        } else {
            console.error("!!! stateMachine is missing! Cannot transition to playing state.");
        }
    } // End startGamePlay()

    // --- Helper: Sync Camera to Body ---
    syncCameraToBody(playerBody) {
        if (playerBody && controls?.getObject()) {
            const bodyPos = playerBody.translation();
            const cameraOffset = CONFIG?.CAMERA_Y_OFFSET ?? 1.6;
            controls.getObject().position.set(bodyPos.x, bodyPos.y + cameraOffset, bodyPos.z);
            // Initial camera rotation is based on PointerLockControls default / mouse
        }
    }

     // --- Helper: Cleanup Game State (Players & Physics) ---
     cleanupGameState() {
         console.log("[Game Cleanup] Cleaning up player objects and physics bodies...");
         // Remove Rapier bodies
         for (const playerId in this.playerRigidBodyHandles) {
             const handle = this.playerRigidBodyHandles[playerId];
             if (rapierWorld && handle !== undefined && handle !== null) {
                 try {
                     let body = rapierWorld.getRigidBody(handle);
                     if (body) rapierWorld.removeRigidBody(body);
                 } catch (e) { /* Ignore errors during cleanup */ }
             }
         }
         this.playerRigidBodyHandles = {};

         // Remove visual meshes and clear player data using Network helper
         for (const id in window.players) {
             if (typeof Network?._removePlayer === 'function') {
                 Network._removePlayer(id); // Handles mesh removal and players[id] deletion
             } else { // Manual fallback if helper missing
                 if(window.players[id] instanceof ClientPlayer) window.players[id].remove();
                 delete window.players[id];
             }
         }
         window.players = {}; // Ensure players object is empty

         localPlayerId = null; // Reset local ID
         window.localPlayerId = null;
         console.log("[Game Cleanup] State cleared.");
     }

     // --- Helper: Cleanup a Single Player ---
     cleanupPlayer(playerId) {
         console.warn(`[Game Cleanup] Cleaning up individual player: ${playerId}`);
         // Remove body
         const handle = this.playerRigidBodyHandles[playerId];
         if (rapierWorld && handle !== undefined && handle !== null) {
             try {
                 let body = rapierWorld.getRigidBody(handle);
                 if (body) rapierWorld.removeRigidBody(body);
             } catch (e) { /* Ignore */ }
             delete this.playerRigidBodyHandles[playerId];
         }
         // Remove visual/data
         if (typeof Network?._removePlayer === 'function') {
             Network._removePlayer(playerId);
         } else {
            if(window.players[playerId] instanceof ClientPlayer) window.players[playerId].remove();
             delete window.players[playerId];
         }
     }

    // --- Start Asset Loading Process ---
    startAssetLoading() {
        console.log("[Game] Requesting asset loading via LoadManager...");
        if (typeof loadManager?.startLoading === 'function') {
             loadManager.startLoading();
        } else {
             console.error("!!! LoadManager or startLoading function is missing!");
             if (stateMachine) stateMachine.transitionTo('loading', { message: "FATAL: Asset Mgr Fail!", error: true });
        }
    }

} // End Game Class

// --- Global Game Initialization Function ---
function runGame() {
     console.log("--- runGame() invoked ---");
     try {
         // Simple check if an instance already exists (shouldn't normally happen)
         if (window.currentGameInstance) {
             console.warn("!!! Previous game instance found during runGame. Overwriting (Check for duplicate calls).");
             // Consider adding more robust cleanup here if needed
         }
         const gameInstance = new Game();
         window.currentGameInstance = gameInstance; // Assign to global scope for access
         gameInstance.start(); // Start the game initialization process
     } catch (e) {
         console.error("!!! CRITICAL Error Creating Game Instance:", e);
         document.body.innerHTML = `<p style='color:red; font-size: 1.5em; text-align: center; padding: 20px;'>FATAL ERROR: GAME INITIALIZATION FAILED.<br/>Check console (F12) for details.</p>`;
         // Attempt to clean up any partial state?
     }
}

// --- DOM Ready Check ---
// Ensures HTML is parsed before JS tries to access elements like the canvas
if (document.readyState === 'loading') {
    console.log("DOM not ready, adding DOMContentLoaded listener for runGame().");
    document.addEventListener('DOMContentLoaded', runGame);
} else {
    console.log("DOM already ready, calling runGame() immediately.");
    runGame();
}

console.log("game.js loaded (REGENERATED with Debug Logs & Robustness Checks)");
