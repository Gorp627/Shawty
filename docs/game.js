// docs/game.js - Main Game Orchestrator (Simplified Ground Plane Debug)

// --- Global Flags and Data ---
let networkIsInitialized = false; let assetsAreReady = false; let initializationData = null;
var currentGameInstance = null; // Holds the single Game instance
var RAPIER = window.RAPIER || null; // Will be populated by rapier_init.js
var rapierWorld = null;
var rapierEventQueue = null;
window.isRapierReady = window.isRapierReady || false; // Flag set by rapier_init.js

// Debug flag
const USE_SIMPLE_GROUND = true; // <<< SET TO true TO USE A SIMPLE PLANE INSTEAD OF THE MAP GLB

class Game {
    // --- Constructor ---
    constructor() {
        // Core Three.js components
        this.scene = null; this.camera = null; this.renderer = null; this.controls = null; this.clock = null;
        // Game state references (using globals defined in config.js)
        this.players = window.players; // Reference global players object
        this.keys = window.keys;       // Reference global keys object
        this.mapMesh = null; // Reference to loaded map asset (even if not used visually)
        this.simpleGroundMesh = null; // Reference to the simple visual ground plane
        // Physics state
        this.playerRigidBodyHandles = {}; // Stores Rapier RigidBody handles keyed by player ID
        this.mapColliderHandle = null;    // Stores the Rapier Collider handle for the map/ground
        this.rapierReady = window.isRapierReady; // Check initial Rapier status
        // Timing
        this.lastCallTime = performance.now();

        console.log("[Game] Instance created.");

        // --- Rapier Initialization Listener ---
        if (!this.rapierReady) {
            window.addEventListener('rapier-ready', () => {
                console.log("[Game] Received 'rapier-ready' event.");
                RAPIER = window.RAPIER;
                if (!RAPIER) {
                    console.error("!!! CRITICAL: RAPIER object missing after 'rapier-ready' event!");
                    if (UIManager) UIManager.showError(`FATAL: Physics Load Fail! (Event)`, 'loading');
                    if (stateMachine) stateMachine.transitionTo('loading', { message: "Physics Lib Failed! (Event)", error: true });
                } else {
                    this.initializePhysics();
                    this.attemptProceedToGame();
                }
            }, { once: true });
        } else {
            if (!window.RAPIER) {
                console.error("!!! CRITICAL: Rapier flag true, but global RAPIER object missing!");
                if (UIManager) UIManager.showError(`FATAL: Physics Load Fail! (Flag)`, 'loading');
                if (stateMachine) stateMachine.transitionTo('loading', { message: "Physics Lib Failed! (Flag)", error: true });
            } else {
                RAPIER = window.RAPIER;
                this.initializePhysics();
                console.log("[Game] Rapier was already ready on construct.");
            }
        }
    }

    // --- Start Method ---
    start() {
        console.log("[Game] Starting game initialization process...");
        networkIsInitialized = false; assetsAreReady = false; initializationData = null;
        this.mapMesh = null; this.simpleGroundMesh = null;
        this.playerRigidBodyHandles = {}; this.mapColliderHandle = null;
        this.lastCallTime = performance.now();

        if (!this.initializeThreeJS()) { return; }
        if (!this.initializeManagers()) { return; }
        if (!this.initializeNetwork()) { return; }
        this.bindLoadManagerListeners();
        this.bindOtherStateTransitions();
        this.addEventListeners();
        console.log("[Game] Triggering Asset loading and waiting for Rapier...");
        this.startAssetLoading();
        if (stateMachine) stateMachine.transitionTo('loading', { message: "Initializing..." });
        else console.error("!!! StateMachine is missing during start!");
        this.animate();
        console.log("[Game] Basic setup complete. Main loop started.");
    }

    // --- Initialize Three.js ---
    initializeThreeJS() {
        console.log("[Game] Initializing Three.js...");
        try {
            this.scene = new THREE.Scene(); window.scene = this.scene;
            this.scene.background = new THREE.Color(0x6699cc);
            this.scene.fog = new THREE.Fog(0x6699cc, 20, 200);
            this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
            window.camera = this.camera;
            this.clock = new THREE.Clock(); window.clock = this.clock;
            const canvasElement = document.getElementById('gameCanvas');
            if (!canvasElement) throw new Error("Required canvas element '#gameCanvas' not found!");
            this.renderer = new THREE.WebGLRenderer({ canvas: canvasElement, antialias: true });
            window.renderer = this.renderer;
            this.renderer.setSize(window.innerWidth, window.innerHeight);
            this.renderer.shadowMap.enabled = true;
            this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
            this.controls = new THREE.PointerLockControls(this.camera, document.body);
            window.controls = this.controls;
            this.controls.addEventListener('lock', () => { console.log('[Controls] Pointer Locked'); });
            this.controls.addEventListener('unlock', () => { console.log('[Controls] Pointer Unlocked'); });
            if (typeof THREE.DRACOLoader === 'undefined' || typeof THREE.GLTFLoader === 'undefined') throw new Error("DRACOLoader or GLTFLoader not available!");
            window.dracoLoader = new THREE.DRACOLoader();
            window.dracoLoader.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/libs/draco/');
            window.dracoLoader.setDecoderConfig({ type: 'js' });
            window.dracoLoader.preload();
            window.loader = new THREE.GLTFLoader();
            window.loader.setDRACOLoader(window.dracoLoader);

            // --- Lighting Setup (Simplified for Debugging) ---
            console.log("[Game] Using simplified Hemisphere lighting.");
            const hemisphereLight = new THREE.HemisphereLight(0xccccff, 0x888844, 1.5);
            this.scene.add(hemisphereLight);
            // --- End Simplified Lighting ---

            console.log("[Game] Three.js initialized successfully.");
            return true;
        } catch (e) {
            console.error("!!! CRITICAL Three.js Initialization Error:", e);
            UIManager?.showError(`FATAL: Graphics Init!<br/>${e.message}`, 'loading');
            if (stateMachine) stateMachine.transitionTo('loading', { message: "GFX Init Failed!", error: true });
            return false;
        }
    }

    // --- Initialize Rapier Physics ---
    initializePhysics() {
        // (Identical to previous version - checks RAPIER, creates world/queue)
        if (!RAPIER) {
            console.error("!!! Cannot initialize physics: RAPIER object missing!");
            UIManager?.showError(`FATAL: Physics Lib Missing!`, 'loading');
            if(stateMachine) stateMachine.transitionTo('loading', {message:"Physics Lib Failed!", error:true});
            return false;
        }
        if (rapierWorld) {
            console.warn("[Game] Physics world already initialized. Skipping.");
            return true;
        }
        console.log("[Game] Initializing Rapier Physics Engine...");
        try {
            const gravityVector = new RAPIER.Vector3(0.0, CONFIG?.GRAVITY ?? -25.0, 0.0);
            if (window.rapierWorld) { window.rapierWorld = null; window.rapierEventQueue = null; }
            rapierWorld = new RAPIER.World(gravityVector); window.rapierWorld = rapierWorld;
            if (!rapierWorld) throw new Error("Failed to create Rapier World.");
            rapierEventQueue = new RAPIER.EventQueue(true); window.rapierEventQueue = rapierEventQueue;
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

    // --- Initialize Core Managers ---
    initializeManagers() {
        // (Identical to previous version - checks and initializes UI, Input, Effects)
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
        // (Identical to previous version - calls Network.init)
        console.log("[Game] Initializing Network connection...");
        if (typeof Network?.init === 'function') {
            try { Network.init(); console.log("[Game] Network initialization requested."); return true; }
            catch (e) { console.error("!!! Network Initialization Error:", e); if (stateMachine) stateMachine.transitionTo('loading', { message: `FATAL: Net Init!<br/>${e.message}`, error: true }); return false; }
        } else { console.error("!!! Global Network object or init function is missing!"); if (stateMachine) stateMachine.transitionTo('loading', { message: `FATAL: Net Code Failed!`, error: true }); return false; }
    }

    // --- Setup Asset Loading Listeners ---
    bindLoadManagerListeners() {
        if (!loadManager) {
            console.error("!!! LoadManager is missing! Cannot bind asset listeners.");
            if (stateMachine) stateMachine.transitionTo('loading', { message: "FATAL: Load Mgr Missing!", error: true });
            return;
        }
        loadManager.on('ready', () => {
            console.log("[Game] LoadManager 'ready' event received.");
            assetsAreReady = true;
            // Store reference to loaded map asset, even if not visually used
            this.mapMesh = loadManager.getAssetData('map');
            if (!this.mapMesh && !USE_SIMPLE_GROUND) { // Only critical if NOT using simple ground
                console.error("!!! Map asset data missing after 'ready' event!");
                 if (stateMachine) stateMachine.transitionTo('loading', { message: "FATAL: Map Data Corrupt!", error: true });
                 return;
            }

            // --- Conditional Scene Setup ---
            if (USE_SIMPLE_GROUND) {
                 console.log("[Game] Using simple ground plane for debugging.");
                 // Create visual plane
                 const groundSize = CONFIG.MAP_BOUNDS_X ? CONFIG.MAP_BOUNDS_X * 2 : 200; // Use config or default
                 const groundGeo = new THREE.PlaneGeometry(groundSize, groundSize);
                 // Use MeshStandardMaterial to react to light
                 const groundMat = new THREE.MeshStandardMaterial({ color: 0x888888, side: THREE.DoubleSide });
                 this.simpleGroundMesh = new THREE.Mesh(groundGeo, groundMat);
                 this.simpleGroundMesh.rotation.x = -Math.PI / 2; // Rotate to be horizontal
                 this.simpleGroundMesh.receiveShadow = true; // Allow shadows on the ground
                 this.simpleGroundMesh.position.y = 0; // Position at Y=0
                 if(this.scene) this.scene.add(this.simpleGroundMesh);
                 console.log("[Game] Added simple visual ground plane to scene.");
            } else {
                 // Use the loaded map mesh
                 console.log("[Game] Using loaded GLB map.");
                 if (!this.mapMesh) { console.error("Map mesh is null despite LoadManager ready!"); return; }
                 if (this.scene && !this.mapMesh.parent) {
                     this.scene.add(this.mapMesh);
                     console.log("[Game] Added loaded map mesh to the scene.");
                 }
            }
            // --- End Conditional Scene Setup ---


            this.createMapCollider(); // Attempt to create map/ground physics collider
            this.attemptProceedToGame(); // Check if ready for next stage
        });
        loadManager.on('error', (errorData) => {
            console.error("!!! LoadManager reported an error:", errorData);
            assetsAreReady = false; this.mapMesh = null; this.simpleGroundMesh = null;
            if (stateMachine) stateMachine.transitionTo('loading', { message: `FATAL: Asset Load Error!<br/>${errorData.message || 'Unknown asset error'}`, error: true });
        });
        console.log("[Game] LoadManager event listeners bound.");
    }

    // --- Create Rapier Collider for the Map/Ground ---
    createMapCollider() {
        // Check prerequisites
        if (!RAPIER || !rapierWorld || this.mapColliderHandle !== null) {
             if (this.mapColliderHandle !== null) console.warn("[Game] Map/Ground collider already exists.");
             else console.warn(`[Game] Cannot create map/ground collider. RAPIER/World not ready.`);
             return false;
        }
        // Need either the loaded map or the simple ground flag to be true
        if (!this.mapMesh && !USE_SIMPLE_GROUND) {
            console.warn("[Game] Cannot create map collider: No map mesh loaded and not using simple ground.");
            return false;
        }

        console.log(`[Game] Attempting to create Rapier collider (Simple Ground: ${USE_SIMPLE_GROUND})...`);
        try {
            let colliderDesc;
            if (USE_SIMPLE_GROUND) {
                // Create a large, thin box collider for the simple ground plane
                 const groundSize = CONFIG.MAP_BOUNDS_X ? CONFIG.MAP_BOUNDS_X : 100; // Half-size for cuboid extent
                 const groundThickness = 0.5; // Half-thickness
                 colliderDesc = RAPIER.ColliderDesc.cuboid(groundSize, groundThickness, groundSize)
                     .setTranslation(0, -groundThickness, 0); // Position center slightly below Y=0
                 console.log(`[Game] Creating simple cuboid ground collider: ${groundSize*2}x${groundThickness*2}x${groundSize*2}`);
            } else {
                // Use the complex trimesh logic for the loaded map
                let foundGeometry = false;
                this.mapMesh.traverse((child) => {
                    if (!foundGeometry && child.isMesh && child.geometry) {
                        if (!child.geometry.attributes.position || child.geometry.attributes.position.count === 0) {
                            console.warn(`[Game] Skipping mesh '${child.name || '?'}': No vertices.`); return;
                        }
                        let vertices = child.geometry.attributes.position.array;
                        let indices = child.geometry.index ? child.geometry.index.array : null;
                        console.log(`[Game] Using geometry from map mesh: ${child.name || '?'}. Verts: ${vertices.length / 3}${indices ? `, Indices: ${indices.length / 3}` : ''}.`);
                        if (indices) { colliderDesc = RAPIER.ColliderDesc.trimesh(vertices, indices); }
                        else {
                            console.warn(`[Game] Map mesh lacks indices.`);
                            if ((vertices.length / 3) % 3 !== 0) { console.error(`Vert count not div by 3. Cannot create trimesh.`); return; }
                            colliderDesc = RAPIER.ColliderDesc.trimesh(vertices);
                        }
                        foundGeometry = true; // Stop after finding first mesh
                    }
                });
                if (!foundGeometry || !colliderDesc) {
                     throw new Error("No suitable mesh geometry found or processed for map collider.");
                }
            }

            // Common collider setup
            colliderDesc.setFriction(0.7).setRestitution(0.1).setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);
            let createdCollider = rapierWorld.createCollider(colliderDesc);
            if (!createdCollider) throw new Error("Rapier world failed to create map/ground collider object.");
            this.mapColliderHandle = createdCollider.handle;
            console.log(`[Game] Successfully created Rapier map/ground collider with handle: ${this.mapColliderHandle}`);
            return true; // Success

        } catch (e) {
            console.error("!!! Error during Rapier map/ground collider creation:", e);
            this.mapColliderHandle = null;
            if (stateMachine) stateMachine.transitionTo('loading', { message: `FATAL: Map Physics Error!<br/>${e.message}`, error: true });
            return false;
        }
    }


    // --- Check Prerequisites ---
    attemptProceedToGame() {
        // (Identical to previous version - checks flags and transitions state)
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
             console.log(`[Game] Still waiting for prerequisites: [${waitingFor.join(', ')}]. State: ${stateMachine?.currentState || 'unknown'}`);
        }
    }

    // --- Bind State Transitions ---
    bindOtherStateTransitions() {
        // (Identical to previous version - handles cleanup on leaving playing/joining)
        if (UIManager?.bindStateListeners) UIManager.bindStateListeners(stateMachine);
        else console.error("!!! UIManager or bindStateListeners method missing!");
        if (stateMachine) {
            stateMachine.on('transition', (data) => {
                const fromState = data.from; const toState = data.to;
                console.log(`[Game State Listener] Transition detected: ${fromState} -> ${toState}`);
                if ((fromState === 'playing' || fromState === 'joining') && (toState === 'homescreen' || toState === 'loading')) {
                    console.log(`[Game State] Cleaning up state after leaving ${fromState} for ${toState}...`);
                    this.cleanupGameState();
                    if (controls?.isLocked) { controls.unlock(); console.log("[Game State] Unlocked pointer controls."); }
                } else if (toState === 'playing') { console.log("[Game State] Entered 'playing' state."); }
                 else if (toState === 'loading' && data.options?.error) {
                     console.error(`[Game State] Loading error state: ${data.options.message}`);
                     if (controls?.isLocked) controls.unlock();
                     networkIsInitialized = false; assetsAreReady = false; initializationData = null;
                     this.cleanupGameState(); console.log("[Game State] Cleanup after loading error.");
                 }
            });
        } else { console.error("!!! stateMachine is missing!"); }
        console.log("[Game] State transition listeners bound.");
    }

    // --- Add Global Event Listeners ---
    addEventListeners() {
        // (Identical to previous version - resize, join button)
        console.log("[Game] Adding global event listeners...");
        if (UIManager?.joinButton && typeof Network?.attemptJoinGame === 'function') {
            UIManager.joinButton.addEventListener('click', Network.attemptJoinGame);
            console.log("[Game] 'Join Game' button listener added.");
        } else { console.error("!!! Cannot add join listener!"); }
        window.addEventListener('resize', this.handleResize.bind(this));
        console.log("[Game] Global event listeners added.");
    }

    // --- Main Update/Animate Loop ---
    animate() {
        requestAnimationFrame(() => this.animate());
        const dt = this.clock ? this.clock.getDelta() : 0.0166;

        if (rapierWorld && rapierEventQueue) {
            try { rapierWorld.step(rapierEventQueue); }
            catch (e) { console.error("!!! Error during Rapier step:", e); }
        }

        if (stateMachine?.is('playing') && localPlayerId && window.players[localPlayerId]) {
            try {
                const localHandle = this.playerRigidBodyHandles[localPlayerId];
                const localBody = (localHandle !== undefined && rapierWorld) ? rapierWorld.getRigidBody(localHandle) : null;
                if (typeof updateLocalPlayer === 'function' && localBody) { updateLocalPlayer(dt, localBody); }
                if (typeof Effects?.update === 'function') { Effects.update(dt); }
                if (localBody) { this.syncCameraToBody(localBody); }

                for (const id in window.players) { // Sync remote players
                    if (id === localPlayerId) continue;
                    const remotePlayer = window.players[id];
                    if (remotePlayer instanceof ClientPlayer && remotePlayer.mesh) {
                        const remoteHandle = this.playerRigidBodyHandles[id];
                        const remoteBody = (remoteHandle !== undefined && rapierWorld) ? rapierWorld.getRigidBody(remoteHandle) : null;
                        if (remoteBody) {
                            const bodyPosition = remoteBody.translation();
                            const bodyRotation = remoteBody.rotation();
                            remotePlayer.mesh.position.set(bodyPosition.x, bodyPosition.y, bodyPosition.z);
                            remotePlayer.mesh.quaternion.set(bodyRotation.x, bodyRotation.y, bodyRotation.z, bodyRotation.w);
                            const playerHeight = CONFIG?.PLAYER_HEIGHT || 1.8;
                            if (!(remotePlayer.mesh.geometry instanceof THREE.CylinderGeometry)) {
                                remotePlayer.mesh.position.y -= playerHeight / 2.0; // Adjust Y if mesh origin at feet
                            }
                        }
                    }
                }
            } catch (e) { console.error("!!! Error during 'playing' state update loop:", e); }
        }

        if (renderer && scene && camera) {
            try { renderer.render(scene, camera); }
            catch (e) { console.error("!!! Error during rendering:", e); }
        }
    }

    // --- Window Resize Handler ---
    handleResize() {
        if (camera) { camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); }
        if (renderer) { renderer.setSize(window.innerWidth, window.innerHeight); }
    }

    // --- Start Game Play ---
    startGamePlay(initData) {
        // (Identical to previous version, including the fix for setting rotation)
         console.log('[Game] Attempting to start gameplay...');
        console.log('[Game] Received initialization data:', JSON.stringify(initData));
        if (!initData?.id || typeof initData.players !== 'object') {
            console.error("!!! Invalid initialization data:", initData); stateMachine?.transitionTo('homescreen'); UIManager?.showError("Server Init Invalid!", "homescreen"); return;
        }
        if (!rapierWorld || !RAPIER || this.mapColliderHandle === null || this.mapColliderHandle === undefined) {
            console.error("!!! Cannot start: Physics world or map collider not ready!"); stateMachine?.transitionTo('homescreen'); UIManager?.showError("Physics Not Ready!", 'homescreen'); return;
        }
        if (stateMachine?.is('playing')) { console.warn("[Game] Already playing. Resetting state first."); this.cleanupGameState(); }
        else { console.log("[Game] Cleaning up previous state..."); this.cleanupGameState(); }

        localPlayerId = initData.id; window.localPlayerId = localPlayerId;
        console.log(`[Game] Local Player ID set to: ${localPlayerId}`);
        console.log("[Game] Creating player objects and Rapier bodies...");
        const playerHeight = CONFIG?.PLAYER_HEIGHT || 1.8;
        const playerRadius = CONFIG?.PLAYER_RADIUS || 0.4;
        const capsuleHalfHeight = Math.max(0.01, playerHeight / 2.0 - playerRadius);
        let localPlayerCreated = false;

        for (const id in initData.players) {
            const serverPlayerData = initData.players[id];
            if (serverPlayerData.x === undefined || serverPlayerData.y === undefined || serverPlayerData.z === undefined) { console.warn(`[Game] Invalid position for player ${id}. Skipping.`); continue; }
            const bodyCenterY = serverPlayerData.y + playerHeight / 2.0;
            try {
                let playerColliderDesc = RAPIER.ColliderDesc.capsule(capsuleHalfHeight, playerRadius).setFriction(0.7).setRestitution(0.1).setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);
                const initialRotationY = serverPlayerData.rotationY || 0;
                const initialRotationEuler = { x: 0, y: initialRotationY, z: 0 };
                let rigidBody; let rigidBodyDesc;

                if (id === localPlayerId) {
                    console.log(`[Game] Initializing LOCAL player: ${serverPlayerData.name || 'Unnamed'} (ID: ${id})`);
                    window.players[id] = { ...serverPlayerData, isLocal: true, mesh: null };
                    rigidBodyDesc = RAPIER.RigidBodyDesc.dynamic().setTranslation(serverPlayerData.x, bodyCenterY, serverPlayerData.z).setRotation(initialRotationEuler).setLinvel(0, 0, 0).setAngvel({ x: 0, y: 0, z: 0 }).setLinearDamping(0.5).setAngularDamping(1.0).lockRotations().setCanSleep(false);
                    rigidBody = rapierWorld.createRigidBody(rigidBodyDesc);
                    if (!rigidBody) throw new Error("Failed local rigid body creation.");
                    this.playerRigidBodyHandles[id] = rigidBody.handle;
                    console.log(`[Game] Created DYNAMIC body. Handle: ${rigidBody.handle}`);
                    rapierWorld.createCollider(playerColliderDesc, rigidBody.handle);
                    this.syncCameraToBody(rigidBody);
                    if (UIManager) { UIManager.updateHealthBar(serverPlayerData.health ?? 100); UIManager.updateInfo(`Playing as ${serverPlayerData.name || 'Player'}`); UIManager.clearError('homescreen'); UIManager.clearKillMessage(); }
                    localPlayerCreated = true;
                } else {
                    console.log(`[Game] Initializing REMOTE player: ${serverPlayerData.name || 'Unnamed'} (ID: ${id})`);
                    let remotePlayerInstance = null;
                    if (typeof Network?._addPlayer === 'function') { remotePlayerInstance = Network._addPlayer(serverPlayerData); } else { console.error("!!! Network._addPlayer missing!"); }
                    if (!remotePlayerInstance || !(remotePlayerInstance instanceof ClientPlayer)) { console.warn(`[Game] Failed ClientPlayer instance for remote ${id}. Skipping physics.`); continue; }
                    rigidBodyDesc = RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(serverPlayerData.x, bodyCenterY, serverPlayerData.z).setRotation(initialRotationEuler);
                    rigidBody = rapierWorld.createRigidBody(rigidBodyDesc);
                    if (!rigidBody) throw new Error(`Failed remote rigid body (${id}) creation.`);
                    this.playerRigidBodyHandles[id] = rigidBody.handle;
                    console.log(`[Game] Created KINEMATIC body. Handle: ${rigidBody.handle}`);
                    rapierWorld.createCollider(playerColliderDesc, rigidBody.handle);
                }
            } catch (bodyError) {
                 console.error(`!!! Error creating body/collider for ID ${id}:`, bodyError); this.cleanupPlayer(id);
                 if (id === localPlayerId) { stateMachine?.transitionTo('homescreen'); UIManager?.showError("FATAL: Player Init Fail!", 'homescreen'); return; }
            }
        }
        if (!localPlayerCreated) { console.error("!!! Local player not created!"); stateMachine?.transitionTo('homescreen'); UIManager?.showError("FATAL: Local Player Missing!", 'homescreen'); return; }
        console.log(`[Game] Player initialization complete. ${Object.keys(window.players).length} players.`);
        if (stateMachine) { console.log("[Game] Transitioning state to 'playing'..."); stateMachine.transitionTo('playing'); }
        else { console.error("!!! stateMachine missing!"); }
    }

    // --- Helper: Sync Camera to Body ---
    syncCameraToBody(playerBody) {
        // (Identical to previous version)
        if (playerBody && controls?.getObject()) {
            try {
                const bodyPos = playerBody.translation();
                const cameraOffset = CONFIG?.CAMERA_Y_OFFSET ?? 1.6;
                controls.getObject().position.set(bodyPos.x, bodyPos.y + cameraOffset, bodyPos.z);
            } catch (e) { console.error("Error accessing body translation in syncCameraToBody:", e); }
        }
    }

     // --- Helper: Cleanup Game State ---
     cleanupGameState() {
         // (Identical to previous version)
         console.log("[Game Cleanup] Cleaning up player objects and physics bodies...");
         for (const playerId in this.playerRigidBodyHandles) {
             const handle = this.playerRigidBodyHandles[playerId];
             if (rapierWorld && handle !== undefined && handle !== null) {
                 try { let body = rapierWorld.getRigidBody(handle); if (body) rapierWorld.removeRigidBody(body); } catch (e) { /* Ignore */ }
             }
         }
         this.playerRigidBodyHandles = {};
         for (const id in window.players) {
             if (typeof Network?._removePlayer === 'function') { Network._removePlayer(id); }
             else { if(window.players[id] instanceof ClientPlayer) window.players[id].remove(); delete window.players[id]; }
         }
         window.players = {};
         localPlayerId = null; window.localPlayerId = null;
         console.log("[Game Cleanup] State cleared.");
     }

     // --- Helper: Cleanup a Single Player ---
     cleanupPlayer(playerId) {
         // (Identical to previous version)
         console.warn(`[Game Cleanup] Cleaning up individual player: ${playerId}`);
         const handle = this.playerRigidBodyHandles[playerId];
         if (rapierWorld && handle !== undefined && handle !== null) {
             try { let body = rapierWorld.getRigidBody(handle); if (body) rapierWorld.removeRigidBody(body); } catch (e) { /* Ignore */ }
             delete this.playerRigidBodyHandles[playerId];
         }
         if (typeof Network?._removePlayer === 'function') { Network._removePlayer(playerId); }
         else { if(window.players[playerId] instanceof ClientPlayer) window.players[playerId].remove(); delete window.players[playerId]; }
     }

    // --- Start Asset Loading Process ---
    startAssetLoading() {
        // (Identical to previous version)
        console.log("[Game] Requesting asset loading via LoadManager...");
        if (typeof loadManager?.startLoading === 'function') { loadManager.startLoading(); }
        else { console.error("!!! LoadManager or startLoading missing!"); if (stateMachine) stateMachine.transitionTo('loading', { message: "FATAL: Asset Mgr Fail!", error: true }); }
    }

} // End Game Class

// --- Global Game Initialization Function ---
function runGame() {
     // (Identical to previous version)
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

console.log("game.js loaded (Simplified Ground Plane Debug)");
