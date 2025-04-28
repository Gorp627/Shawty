// docs/game.js - Main Game Orchestrator (Fixed Camera + Reference Cube Debug)

// --- Global Flags and Data ---
let networkIsInitialized = false; let assetsAreReady = false; let initializationData = null;
var currentGameInstance = null; // Holds the single Game instance
var RAPIER = window.RAPIER || null; // Will be populated by rapier_init.js
var rapierWorld = null;
var rapierEventQueue = null;
window.isRapierReady = window.isRapierReady || false; // Flag set by rapier_init.js

// Debug flag (Keep using simple ground for now)
const USE_SIMPLE_GROUND = true;
const DEBUG_FIXED_CAMERA = true; // <<< SET TO true TO FIX CAMERA POSITION

class Game {
    // --- Constructor ---
    constructor() {
        // Core Three.js components
        this.scene = null; this.camera = null; this.renderer = null; this.controls = null; this.clock = null;
        // Game state references
        this.players = window.players; this.keys = window.keys;
        this.mapMesh = null; this.simpleGroundMesh = null;
        // Physics state
        this.playerRigidBodyHandles = {}; this.mapColliderHandle = null;
        this.rapierReady = window.isRapierReady;
        // Timing
        this.lastCallTime = performance.now();

        console.log("[Game] Instance created.");

        // --- Rapier Initialization Listener ---
        if (!this.rapierReady) {
            window.addEventListener('rapier-ready', () => {
                console.log("[Game] Received 'rapier-ready' event.");
                RAPIER = window.RAPIER;
                if (!RAPIER) { console.error("!!! RAPIER missing after event!"); /* Handle error */ }
                else { this.initializePhysics(); this.attemptProceedToGame(); }
            }, { once: true });
        } else {
            if (!window.RAPIER) { console.error("!!! RAPIER flag true, but object missing!"); /* Handle error */ }
            else { RAPIER = window.RAPIER; this.initializePhysics(); console.log("[Game] Rapier ready on construct."); }
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

            // *** DEBUG: Set initial fixed camera position if DEBUG_FIXED_CAMERA is true ***
            if (DEBUG_FIXED_CAMERA) {
                this.camera.position.set(0, 5, 15); // Position back, up, looking towards origin
                this.camera.lookAt(0, 0, 0); // Look at the center
                console.log("[DEBUG] Setting fixed initial camera position/lookAt.");
            }
            // *** END DEBUG ***


            this.clock = new THREE.Clock(); window.clock = this.clock;
            const canvasElement = document.getElementById('gameCanvas');
            if (!canvasElement) throw new Error("Required canvas element '#gameCanvas' not found!");
            this.renderer = new THREE.WebGLRenderer({ canvas: canvasElement, antialias: true });
            window.renderer = this.renderer;
            this.renderer.setSize(window.innerWidth, window.innerHeight);
            this.renderer.shadowMap.enabled = true;
            this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

            // Initialize controls, but don't link camera position if debugging
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

            // --- Lighting Setup (Simplified) ---
            console.log("[Game] Using simplified Hemisphere lighting.");
            const hemisphereLight = new THREE.HemisphereLight(0xccccff, 0x888844, 1.5);
            this.scene.add(hemisphereLight);
            // Add a directional light as well for shadows if needed
            const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5); // Reduced intensity
             directionalLight.position.set(30, 40, 20);
             directionalLight.castShadow = true; // Enable shadows
             this.scene.add(directionalLight);
             this.scene.add(directionalLight.target);


            // *** DEBUG: Add a reference cube ***
            console.log("[DEBUG] Adding reference cube to scene.");
            const cubeGeo = new THREE.BoxGeometry(2, 2, 2); // Size 2x2x2
            const cubeMat = new THREE.MeshStandardMaterial({ color: 0xff0000 }); // Bright red
            const refCube = new THREE.Mesh(cubeGeo, cubeMat);
            refCube.position.set(0, 1, 0); // Place slightly above origin
            refCube.castShadow = true;
            refCube.receiveShadow = true;
            this.scene.add(refCube);
            // *** END DEBUG ***


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
        // (Identical to previous version)
        if (!RAPIER) { console.error("!!! RAPIER object missing!"); return false; }
        if (rapierWorld) { console.warn("[Game] Physics already initialized."); return true; }
        console.log("[Game] Initializing Rapier Physics Engine...");
        try {
            const gravityVector = new RAPIER.Vector3(0.0, CONFIG?.GRAVITY ?? -25.0, 0.0);
            rapierWorld = new RAPIER.World(gravityVector); window.rapierWorld = rapierWorld;
            if (!rapierWorld) throw new Error("Failed Rapier World creation.");
            rapierEventQueue = new RAPIER.EventQueue(true); window.rapierEventQueue = rapierEventQueue;
            if (!rapierEventQueue) throw new Error("Failed Rapier EventQueue creation.");
            console.log("[Game] Rapier world/queue created.");
            return true;
        } catch (e) {
            console.error("!!! CRITICAL Rapier Init Error:", e);
            rapierWorld = null; window.rapierWorld = null; rapierEventQueue = null; window.rapierEventQueue = null;
            if (UIManager) UIManager.showError(`FATAL: Physics Init!<br/>${e.message}`, 'loading');
            if (stateMachine) stateMachine.transitionTo('loading', { message: "Physics Init Failed!", error: true });
            return false;
        }
    }

    // --- Initialize Core Managers ---
    initializeManagers() {
        // (Identical to previous version)
        console.log("[Game] Initializing Managers...");
        if (!window.UIManager || !window.Input || !window.stateMachine || !window.loadManager || !window.Network || !window.Effects) { console.error("!!! Managers undefined!"); return false; }
        try {
            if (!UIManager.initialize()) throw new Error("UIManager failed");
            if (!this.controls) throw new Error("Controls missing for Input");
            if (!Input.init(this.controls)) throw new Error("Input failed");
            Effects.initialize(this.scene);
            console.log("[Game] Managers initialized.");
            return true;
        } catch (e) { console.error("!!! Mgr Init Error:", e); return false; }
    }

    // --- Initialize Network Layer ---
    initializeNetwork() {
        // (Identical to previous version)
        console.log("[Game] Initializing Network...");
        if (typeof Network?.init === 'function') {
            try { Network.init(); console.log("[Game] Network init requested."); return true; }
            catch (e) { console.error("!!! Net Init Error:", e); return false; }
        } else { console.error("!!! Network object missing!"); return false; }
    }

    // --- Setup Asset Loading Listeners ---
    bindLoadManagerListeners() {
        // (Using Simple Ground Plane logic from previous step)
        if (!loadManager) { console.error("!!! LoadManager missing!"); return; }
        loadManager.on('ready', () => {
            console.log("[Game] LoadManager 'ready' event received.");
            assetsAreReady = true;
            this.mapMesh = loadManager.getAssetData('map'); // Still load it
            if (USE_SIMPLE_GROUND) {
                 console.log("[Game] Using simple ground plane.");
                 const groundSize = CONFIG.MAP_BOUNDS_X ? CONFIG.MAP_BOUNDS_X * 2 : 200;
                 const groundGeo = new THREE.PlaneGeometry(groundSize, groundSize);
                 const groundMat = new THREE.MeshStandardMaterial({ color: 0x888888, side: THREE.DoubleSide });
                 this.simpleGroundMesh = new THREE.Mesh(groundGeo, groundMat);
                 this.simpleGroundMesh.rotation.x = -Math.PI / 2;
                 this.simpleGroundMesh.receiveShadow = true;
                 this.simpleGroundMesh.position.y = 0;
                 if(this.scene) this.scene.add(this.simpleGroundMesh);
                 console.log("[Game] Added simple visual ground plane.");
            } else { /* Use loaded map logic if USE_SIMPLE_GROUND is false */ }
            this.createMapCollider();
            this.attemptProceedToGame();
        });
        loadManager.on('error', (errorData) => {
            console.error("!!! LoadManager error:", errorData);
            assetsAreReady = false; this.mapMesh = null; this.simpleGroundMesh = null;
            if (stateMachine) stateMachine.transitionTo('loading', { message: `FATAL: Asset Load Error!`, error: true });
        });
        console.log("[Game] LoadManager listeners bound.");
    }

    // --- Create Rapier Collider for Map/Ground ---
    createMapCollider() {
        // (Using Simple Ground Plane logic from previous step)
        if (!RAPIER || !rapierWorld || this.mapColliderHandle !== null) { /* Handle checks */ return false; }
        if (!this.mapMesh && !USE_SIMPLE_GROUND) { console.warn("No map/ground to create collider for."); return false; }
        console.log(`[Game] Creating Rapier collider (Simple: ${USE_SIMPLE_GROUND})...`);
        try {
            let colliderDesc;
            if (USE_SIMPLE_GROUND) {
                 const groundSize = CONFIG.MAP_BOUNDS_X ? CONFIG.MAP_BOUNDS_X : 100;
                 const groundThickness = 0.5;
                 colliderDesc = RAPIER.ColliderDesc.cuboid(groundSize, groundThickness, groundSize)
                     .setTranslation(0, -groundThickness, 0);
                 console.log(`[Game] Simple cuboid collider.`);
            } else { /* Trimesh logic */ }
            colliderDesc.setFriction(0.7).setRestitution(0.1).setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);
            let createdCollider = rapierWorld.createCollider(colliderDesc);
            if (!createdCollider) throw new Error("Collider creation failed.");
            this.mapColliderHandle = createdCollider.handle;
            console.log(`[Game] Created map/ground collider. Handle: ${this.mapColliderHandle}`);
            return true;
        } catch (e) { console.error("!!! Collider creation error:", e); this.mapColliderHandle = null; return false; }
    }

    // --- Check Prerequisites ---
    attemptProceedToGame() {
        // (Identical to previous version)
        const rapierIsSetup = !!RAPIER && !!rapierWorld;
        const mapColliderExists = this.mapColliderHandle !== null && this.mapColliderHandle !== undefined;
        console.log(`[Game] Checking prerequisites: Rapier=${rapierIsSetup}, Collider=${mapColliderExists}, Assets=${assetsAreReady}, Net=${networkIsInitialized}, Data=${!!initializationData}`);
        if (rapierIsSetup && mapColliderExists && assetsAreReady && networkIsInitialized && initializationData) {
            console.log("[Game] All prerequisites met -> Calling startGamePlay...");
            if (typeof this.startGamePlay === 'function') { this.startGamePlay(initializationData); }
            else { console.error("!!! startGamePlay missing!"); }
        } else if (rapierIsSetup && mapColliderExists && assetsAreReady && stateMachine?.is('loading')) {
             console.log("[Game] Core ready -> Transitioning to Homescreen");
             stateMachine.transitionTo('homescreen', { playerCount: UIManager?.playerCountSpan?.textContent ?? '?' });
        } else { console.log(`[Game] Still waiting... State: ${stateMachine?.currentState || '?'}`); }
    }

    // --- Bind State Transitions ---
    bindOtherStateTransitions() {
        // (Identical to previous version)
        if (UIManager?.bindStateListeners) UIManager.bindStateListeners(stateMachine);
        else console.error("!!! UIManager missing bindStateListeners");
        if (stateMachine) {
            stateMachine.on('transition', (data) => {
                const { from: fromState, to: toState } = data;
                console.log(`[Game State Listener] Transition: ${fromState} -> ${toState}`);
                if ((fromState === 'playing' || fromState === 'joining') && (toState === 'homescreen' || toState === 'loading')) {
                    console.log(`[Game State] Cleaning up after ${fromState}...`); this.cleanupGameState();
                    if (controls?.isLocked) controls.unlock();
                } else if (toState === 'playing') { console.log("[Game State] Entered 'playing'."); }
                 else if (toState === 'loading' && data.options?.error) {
                     console.error(`[Game State] Loading error: ${data.options.message}`); if (controls?.isLocked) controls.unlock();
                     networkIsInitialized = false; assetsAreReady = false; initializationData = null; this.cleanupGameState();
                 }
            });
        } else { console.error("!!! stateMachine missing!"); }
        console.log("[Game] State listeners bound.");
    }

    // --- Add Global Event Listeners ---
    addEventListeners() {
        // (Identical to previous version)
        console.log("[Game] Adding global listeners...");
        if (UIManager?.joinButton && Network?.attemptJoinGame) { UIManager.joinButton.addEventListener('click', Network.attemptJoinGame); console.log("[Game] Join listener added."); }
        else { console.error("!!! Cannot add join listener!"); }
        window.addEventListener('resize', this.handleResize.bind(this));
        console.log("[Game] Global listeners added.");
    }

    // --- Main Update/Animate Loop ---
    animate() {
        requestAnimationFrame(() => this.animate());
        const dt = this.clock ? this.clock.getDelta() : 0.0166;

        if (rapierWorld) { try { rapierWorld.step(rapierEventQueue); } catch (e) { console.error("Rapier step error:", e); } }

        // --- Gameplay Updates (Only when playing) ---
        if (stateMachine?.is('playing') && localPlayerId && window.players[localPlayerId]) {
            try {
                const localHandle = this.playerRigidBodyHandles[localPlayerId];
                const localBody = (localHandle !== undefined && rapierWorld) ? rapierWorld.getRigidBody(localHandle) : null;

                // Update Local Player Physics/Input
                if (typeof updateLocalPlayer === 'function' && localBody) { updateLocalPlayer(dt, localBody); }

                // Update Effects
                if (typeof Effects?.update === 'function') { Effects.update(dt); }

                // --- Camera Sync ---
                if (!DEBUG_FIXED_CAMERA) { // Only sync if not using fixed debug camera
                     if (localBody) { this.syncCameraToBody(localBody); }
                } else {
                     // If debugging with fixed camera, ensure controls rotation works
                     // Controls are already linked to camera, Pointer Lock handles rotation.
                }


                // Sync Remote Player Visuals
                for (const id in window.players) {
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
                                remotePlayer.mesh.position.y -= playerHeight / 2.0; // Y-Offset if mesh origin @ feet
                            }
                        }
                    }
                } // End remote player sync loop

            } catch (e) { console.error("!!! Error during 'playing' update loop:", e); }
        } // End 'playing' state updates

        // --- Rendering ---
        if (renderer && scene && camera) {
            try { renderer.render(scene, camera); }
            catch (e) { console.error("!!! Rendering error:", e); }
        }
    } // End animate()

    // --- Window Resize Handler ---
    handleResize() {
        if (camera) { camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); }
        if (renderer) { renderer.setSize(window.innerWidth, window.innerHeight); }
    }

    // --- Start Game Play ---
    startGamePlay(initData) {
        // (Identical to previous version, using fixed rotation logic)
         console.log('[Game] Attempting startGamePlay...');
         console.log('[Game] Received init data:', JSON.stringify(initData));
         if (!initData?.id || typeof initData.players !== 'object') { console.error("Invalid init data"); /* Handle error */ return; }
         if (!rapierWorld || !RAPIER || this.mapColliderHandle === null) { console.error("Physics not ready"); /* Handle error */ return; }
         if (stateMachine?.is('playing')) { console.warn("Already playing, resetting..."); this.cleanupGameState(); }
         else { console.log("Cleaning up previous state..."); this.cleanupGameState(); }

         localPlayerId = initData.id; window.localPlayerId = localPlayerId;
         console.log(`[Game] Local Player ID: ${localPlayerId}`);
         console.log("[Game] Creating players/bodies...");
         const playerHeight = CONFIG?.PLAYER_HEIGHT || 1.8; const playerRadius = CONFIG?.PLAYER_RADIUS || 0.4;
         const capsuleHalfHeight = Math.max(0.01, playerHeight / 2.0 - playerRadius);
         let localPlayerCreated = false;

         for (const id in initData.players) {
             const serverPlayerData = initData.players[id];
             if (serverPlayerData.x === undefined || serverPlayerData.y === undefined || serverPlayerData.z === undefined) { console.warn(`Invalid pos for ${id}`); continue; }
             const bodyCenterY = serverPlayerData.y + playerHeight / 2.0;
             try {
                 let playerColliderDesc = RAPIER.ColliderDesc.capsule(capsuleHalfHeight, playerRadius).setFriction(0.7).setRestitution(0.1).setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);
                 const initialRotationY = serverPlayerData.rotationY || 0;
                 const initialRotationEuler = { x: 0, y: initialRotationY, z: 0 };
                 let rigidBody; let rigidBodyDesc;

                 if (id === localPlayerId) {
                     console.log(`Init LOCAL player: ${serverPlayerData.name} (ID: ${id})`);
                     window.players[id] = { ...serverPlayerData, isLocal: true, mesh: null };
                     rigidBodyDesc = RAPIER.RigidBodyDesc.dynamic().setTranslation(serverPlayerData.x, bodyCenterY, serverPlayerData.z).setRotation(initialRotationEuler).setLinvel(0, 0, 0).setAngvel({ x: 0, y: 0, z: 0 }).setLinearDamping(0.5).setAngularDamping(1.0).lockRotations().setCanSleep(false);
                     rigidBody = rapierWorld.createRigidBody(rigidBodyDesc); if (!rigidBody) throw new Error("Failed local body.");
                     this.playerRigidBodyHandles[id] = rigidBody.handle; console.log(`Created DYNAMIC body. Handle: ${rigidBody.handle}`);
                     rapierWorld.createCollider(playerColliderDesc, rigidBody.handle);
                     // *** Don't sync camera here if debugging fixed camera ***
                     if (!DEBUG_FIXED_CAMERA) { this.syncCameraToBody(rigidBody); }
                     if (UIManager) { UIManager.updateHealthBar(serverPlayerData.health ?? 100); UIManager.updateInfo(`Playing as ${serverPlayerData.name || 'Player'}`); UIManager.clearError('homescreen'); UIManager.clearKillMessage(); }
                     localPlayerCreated = true;
                 } else {
                     console.log(`Init REMOTE player: ${serverPlayerData.name} (ID: ${id})`);
                     let remotePlayerInstance = Network?._addPlayer(serverPlayerData);
                     if (!remotePlayerInstance) { console.warn(`Failed ClientPlayer instance remote ${id}.`); continue; }
                     rigidBodyDesc = RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(serverPlayerData.x, bodyCenterY, serverPlayerData.z).setRotation(initialRotationEuler);
                     rigidBody = rapierWorld.createRigidBody(rigidBodyDesc); if (!rigidBody) throw new Error(`Failed remote body ${id}.`);
                     this.playerRigidBodyHandles[id] = rigidBody.handle; console.log(`Created KINEMATIC body. Handle: ${rigidBody.handle}`);
                     rapierWorld.createCollider(playerColliderDesc, rigidBody.handle);
                 }
             } catch (bodyError) { console.error(`!!! Body/collider error for ${id}:`, bodyError); this.cleanupPlayer(id); if (id === localPlayerId) { /* Handle critical failure */ return; } }
         }
         if (!localPlayerCreated) { console.error("!!! Local player failed!"); /* Handle error */ return; }
         console.log(`Player init complete. ${Object.keys(window.players).length} players.`);
         if (stateMachine) { console.log("Transitioning state to 'playing'..."); stateMachine.transitionTo('playing'); } else { console.error("stateMachine missing!"); }
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
         console.log("[Game Cleanup] Cleaning up state...");
         for (const playerId in this.playerRigidBodyHandles) { const handle = this.playerRigidBodyHandles[playerId]; if (rapierWorld && handle !== undefined) { try { let b = rapierWorld.getRigidBody(handle); if(b) rapierWorld.removeRigidBody(b); } catch (e) {} } } this.playerRigidBodyHandles = {};
         for (const id in window.players) { if (typeof Network?._removePlayer === 'function') { Network._removePlayer(id); } else { if(window.players[id] instanceof ClientPlayer) window.players[id].remove(); delete window.players[id]; } } window.players = {};
         localPlayerId = null; window.localPlayerId = null;
         console.log("[Game Cleanup] State cleared.");
     }

     // --- Helper: Cleanup a Single Player ---
     cleanupPlayer(playerId) {
         // (Identical to previous version)
         console.warn(`[Game Cleanup] Cleaning up player: ${playerId}`);
         const handle = this.playerRigidBodyHandles[playerId]; if (rapierWorld && handle !== undefined) { try { let b=rapierWorld.getRigidBody(handle); if(b) rapierWorld.removeRigidBody(b); } catch (e) {} delete this.playerRigidBodyHandles[playerId]; }
         if (typeof Network?._removePlayer === 'function') { Network._removePlayer(playerId); } else { if(window.players[playerId] instanceof ClientPlayer) window.players[playerId].remove(); delete window.players[playerId]; }
     }

    // --- Start Asset Loading Process ---
    startAssetLoading() {
        // (Identical to previous version)
        console.log("[Game] Requesting asset loading...");
        if (typeof loadManager?.startLoading === 'function') { loadManager.startLoading(); }
        else { console.error("!!! LoadManager missing!"); if (stateMachine) stateMachine.transitionTo('loading', { message: "FATAL: Asset Mgr Fail!", error: true }); }
    }

} // End Game Class

// --- Global Game Initialization Function ---
function runGame() {
     // (Identical to previous version)
     console.log("--- runGame() invoked ---");
     try { if (window.currentGameInstance) { console.warn("!!! Previous game instance found."); } const gameInstance = new Game(); window.currentGameInstance = gameInstance; gameInstance.start(); }
     catch (e) { console.error("!!! CRITICAL Error Creating Game Instance:", e); document.body.innerHTML = `<p style='color:red;'>FATAL ERROR: GAME INIT FAILED.</p>`; }
}

// --- DOM Ready Check ---
if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', runGame); }
else { runGame(); }

console.log("game.js loaded (Fixed Camera + Ref Cube Debug)");
