// --- START OF FULL game.js FILE (Manual Raycasting v9 - Delta Time Log - WITH DEBUG LOGS & GLOBAL CHECK) ---
// docs/game.js - Main Game Orchestrator (Manual Raycasting v9 - Delta Time Log)

var currentGameInstance = null; // Holds the single Game instance

class Game {
    // --- Constructor ---
    constructor() {
        console.log('[DEBUG] Game constructor called.'); // DEBUG
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        this.clock = null;
        this.players = window.players;
        this.localPlayerMesh = null;
        this.playerVelocities = window.playerVelocities;
        this.playerIsGrounded = window.playerIsGrounded;
        this.lastNetworkSendTime = 0;
        this.attemptCounter = 0;
        this.interpolationFactor = 0.15;
    }

    // --- Main Initialization Sequence ---
    async init() {
        console.log("--- Game Init Sequence (Manual Raycasting) ---");
        if (currentGameInstance) { console.warn("Game instance already exists! Aborting new init."); return; }
        currentGameInstance = this;
        if (typeof THREE === 'undefined') { console.error("!!! CRITICAL: THREE.js library not loaded!"); return; }
        console.log('[DEBUG] Game.init() started.'); // DEBUG

        // 1. Setup State Machine & UI Listeners
        stateMachine.transitionTo('loading', { message: 'Initializing Core...' });
        console.log('[DEBUG] SM transitioned to loading.'); // DEBUG
        if (!UIManager.initialize()) { console.error("UIManager initialization failed!"); return; }
        UIManager.bindStateListeners(stateMachine);
        console.log('[DEBUG] UIManager initialized and listeners bound.'); // DEBUG

        // 2. Setup Three.js Core Components
        stateMachine.transitionTo('loading', { message: 'Setting up Graphics...' });
        this.clock = new THREE.Clock();
        this.scene = new THREE.Scene(); window.scene = this.scene;
        this.scene.background = new THREE.Color(0x87CEEB);
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 500); window.camera = this.camera;
        this.renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('gameCanvas'), antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.shadowMap.enabled = true;
        window.renderer = this.renderer;
        console.log('[DEBUG] Three.js core components created (Scene, Camera, Renderer).'); // DEBUG

        // 3. Setup PointerLockControls
        if (typeof THREE.PointerLockControls === 'undefined') { console.error("!!! THREE.PointerLockControls not found!"); stateMachine.transitionTo('loading', { message: 'FATAL: Controls Library Failed!', error: true }); return; }
        this.controls = new THREE.PointerLockControls(this.camera, this.renderer.domElement); window.controls = this.controls;
        console.log('[DEBUG] PointerLockControls created.'); // DEBUG
        this.controls.addEventListener('lock', () => {
            console.log('[DEBUG] Pointer Locked.'); // DEBUG
            if(stateMachine?.is('playing') && UIManager?.gameUI) { UIManager.gameUI.style.cursor = 'none'; }
            const audioListener = window.listener;
            if (audioListener?.context?.state === 'suspended') {
                audioListener.context.resume().then(() => console.log('[DEBUG] AudioContext resumed on pointer lock.')).catch(e => console.error('Error resuming AC:', e)); // DEBUG
            }
        });
        this.controls.addEventListener('unlock', () => {
            console.log('[DEBUG] Pointer Unlocked.'); // DEBUG
            if(UIManager?.gameUI) { UIManager.gameUI.style.cursor = 'default'; } });
        this.scene.add(this.controls.getObject());
        console.log('[DEBUG] PointerLockControls listeners added and object added to scene.'); // DEBUG

        // 4. Setup Scene Lighting
        this.scene.add(new THREE.AmbientLight(0x606070, 1.0));
        const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
        dirLight.position.set(40, 50, 30);
        dirLight.castShadow = true;
        dirLight.shadow.mapSize.width = 2048; dirLight.shadow.mapSize.height = 2048;
        dirLight.shadow.camera.near = 1; dirLight.shadow.camera.far = 150;
        dirLight.shadow.camera.left = -60; dirLight.shadow.camera.right = 60;
        dirLight.shadow.camera.top = 60; dirLight.shadow.camera.bottom = -60;
        dirLight.shadow.bias = -0.001;
        this.scene.add(dirLight);
        const hemisphereLight = new THREE.HemisphereLight( 0x87CEEB, 0x404020, 0.6 );
        this.scene.add( hemisphereLight );
        console.log('[DEBUG] Scene lighting added.'); // DEBUG

        // 5. Initialize Input System
        console.log('[DEBUG] Attempting Input.init()...'); // DEBUG
        if (!Input.init(this.controls)) {
            console.error("[DEBUG] Input.init() FAILED!"); // DEBUG
             stateMachine.transitionTo('loading', { message: 'Input Init Failed!', error: true }); return; }
        console.log('[DEBUG] Input.init() successful.'); // DEBUG

        // 6. Initialize Effects System
        console.log('[DEBUG] Attempting Effects.initialize()...'); // DEBUG
        if (!Effects.initialize(this.scene, this.camera)) {
             console.error("[DEBUG] Effects.initialize() FAILED!"); // DEBUG
             stateMachine.transitionTo('loading', { message: 'Effects Init Failed!', error: true }); return; }
        console.log('[DEBUG] Effects.initialize() successful.'); // DEBUG


        // 8. Setup Asset Loaders
        stateMachine.transitionTo('loading', { message: 'Preparing Asset Loaders...' });
        this.setupLoaders();
        console.log('[DEBUG] Asset loaders setup.'); // DEBUG

        // 9. Start Loading Assets
        stateMachine.transitionTo('loading', { message: 'Loading Game Assets...' });
        loadManager.on('ready', this.onAssetsReady.bind(this));
        loadManager.on('error', this.onLoadError.bind(this));
        loadManager.startLoading();
        console.log('[DEBUG] Asset loading started via loadManager.'); // DEBUG

        // 10. Initialize Networking
        stateMachine.transitionTo('loading', { message: 'Connecting to Server...' });
        console.log('[DEBUG] Attempting Network.init()...'); // DEBUG
        if (typeof Network?.init === 'function') { Network.init(); }
        else { console.error("Network.init missing!"); stateMachine.transitionTo('loading', { message: 'Network Init Failed!', error: true }); return; }
        console.log('[DEBUG] Network.init() called.'); // DEBUG

        // 11. Add Window Resize Listener
        this.addEventListeners();
        console.log('[DEBUG] Window resize listener added.'); // DEBUG

        // 12. Start the Render Loop
        console.log('[DEBUG] Starting the render loop (_update)...'); // DEBUG
        this.update();

        console.log("--- Game Init Sequence Complete (Waiting for Assets/Network/InitData) ---");
    }

    // --- Setup Sub-functions ---
    setupLoaders() {
        if (!THREE) { console.error("!!! THREE missing during loader setup!"); return; }
        if (typeof THREE.DRACOLoader === 'undefined' || typeof THREE.GLTFLoader === 'undefined') { console.error("!!! THREE.DRACOLoader or THREE.GLTFLoader constructors not found!"); stateMachine.transitionTo('loading', { message: 'FATAL: GFX Loader Failed!', error: true }); return; }
        window.dracoLoader = new THREE.DRACOLoader();
        window.dracoLoader.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/libs/draco/');
        window.loader = new THREE.GLTFLoader();
        window.loader.setDRACOLoader(window.dracoLoader);
        // console.log("[Game] GLTF/DRACO Loaders Initialized."); // Original log
    }
    addEventListeners() { window.addEventListener('resize', this.onWindowResize.bind(this), false); }
    onWindowResize() { if (this.camera && this.renderer) { this.camera.aspect = window.innerWidth / window.innerHeight; this.camera.updateProjectionMatrix(); this.renderer.setSize(window.innerWidth, window.innerHeight); } }

    // --- Loading Callbacks ---
    onAssetsReady() {
         console.log("[Game] Asset Load Manager reported 'ready'.");
         console.log('[DEBUG] Received loadManager "ready" event.'); // DEBUG
         window.assetsAreReady = true;
         this.attemptProceedToGame();
     }
    onLoadError(errorData) {
        console.error("[Game] Asset Load Manager reported 'error':", errorData.message);
        console.error('[DEBUG] Received loadManager "error" event:', errorData); // DEBUG
        stateMachine?.transitionTo('loading', { message: `Asset Load Failed!<br/>${errorData.message}`, error: true });
     }

    // --- Check Prerequisites & Transition Logic ---
    attemptProceedToGame() {
        this.attemptCounter++; const callCount = this.attemptCounter;
        const assetsReady = window.assetsAreReady, networkReady = window.networkIsInitialized, initDataPresent = !!window.initializationData, mapMeshReady = !!window.mapMesh;
        console.log(`[DEBUG Game attempt #${callCount}] Checking prerequisites: Assets=${assetsReady}, MapMesh=${mapMeshReady}, Network=${networkReady}, InitData=${initDataPresent}, State=${stateMachine?.currentState}`); // DEBUG
        // console.log(`[Game attempt #${callCount}] Checking prerequisites: Assets=${assetsReady}, MapMesh=${mapMeshReady}, Network=${networkReady}, InitData=${initDataPresent}, State=${stateMachine?.currentState}`); // Original log
        if (assetsReady && mapMeshReady && networkReady && initDataPresent) {
             console.log(`[DEBUG Game attempt #${callCount}] Prerequisites met! Attempting to start gameplay...`); // DEBUG
             this.startGamePlay(window.initializationData);
             if (stateMachine?.is('playing')) {
                 console.log("[DEBUG] State is 'playing' after startGamePlay, consuming initData."); // DEBUG
                 window.initializationData = null;
             } else { console.warn(`[DEBUG Game attempt #${callCount}] startGamePlay called but state did not transition to 'playing'. initData not consumed.`); } // DEBUG
        } else if (assetsReady && mapMeshReady && networkReady && !initDataPresent && !stateMachine?.is('homescreen') && !stateMachine?.is('characterSelect') && !stateMachine?.is('joining') && !stateMachine?.is('playing')) {
            console.log(`[DEBUG Game attempt #${callCount}] Core components ready, transitioning to Homescreen... (Current state: ${stateMachine.currentState})`); // DEBUG
             stateMachine?.transitionTo('homescreen');
        } else {
            if (stateMachine?.is('loading') && !stateMachine.options?.error) {
                let waitMsg = "Initializing..."; if (!assetsReady) waitMsg = "Loading Assets..."; else if (!mapMeshReady) waitMsg = "Loading Map Mesh..."; else if (!networkReady) waitMsg = "Connecting...";
                console.log(`[DEBUG Game attempt #${callCount}] Updating loading message: ${waitMsg}`); // DEBUG
                stateMachine?.transitionTo('loading', { message: waitMsg });
            } else if (!stateMachine?.is('loading')) {
                console.log(`[DEBUG Game attempt #${callCount}] Prerequisites not met or invalid state for transition. State: ${stateMachine?.currentState}, Error: ${stateMachine?.options?.error || 'none'}`); // DEBUG
             }
        }
    }

    // --- Start Actual Gameplay Logic ---
    startGamePlay(initData) {
        if (stateMachine?.is('playing')) { console.warn("[DEBUG Game] startGamePlay called while already in 'playing' state. Ignoring."); return; } // DEBUG
        console.log('[DEBUG] Cleaning up players before starting gameplay...'); // DEBUG
        this.cleanupAllPlayers();
        stateMachine.transitionTo('playing');
        console.log("[Game] --- Starting Gameplay (Manual Raycasting) ---");
        console.log("[DEBUG] State transitioned to 'playing'. Setting up players..."); // DEBUG
        window.localPlayerId = initData.id;
        console.log(`[DEBUG Game] Local Player ID set: ${window.localPlayerId}`); // DEBUG

        if (typeof window.playerVelocities !== 'object' || window.playerVelocities === null) { console.log("[DEBUG Game] Initializing global playerVelocities map."); window.playerVelocities = {}; } // DEBUG
        if (typeof window.playerIsGrounded !== 'object' || window.playerIsGrounded === null) { console.log("[DEBUG Game] Initializing global playerIsGrounded map."); window.playerIsGrounded = {}; } // DEBUG

        for (const id in initData.players) {
            const playerData = initData.players[id]; if (!playerData) continue;
             console.log(`[DEBUG] Processing player data from init: ${id === window.localPlayerId ? 'Local' : 'Remote'} Player ID ${id}`); // DEBUG
            if (id === window.localPlayerId) {
                window.players[id] = { id: id, name: playerData.name, phrase: playerData.phrase, health: playerData.health, isLocal: true, mesh: null, x: playerData.x, y: playerData.y, z: playerData.z, rotationY: playerData.rotationY, lastSentX: playerData.x, lastSentY: playerData.y, lastSentZ: playerData.z, lastSentRotY: playerData.rotationY };
                console.log(`[DEBUG] Local player data object created for ${id}.`); // DEBUG
                UIManager.updateInfo(`Playing as ${window.localPlayerName}`); UIManager.updateHealthBar(playerData.health);
                const playerModelAsset = window.playerModelData;
                if (playerModelAsset?.scene) {
                    try {
                        console.log(`[DEBUG] Cloning player model for local player ${id}.`); // DEBUG
                        this.localPlayerMesh = playerModelAsset.scene.clone(); this.localPlayerMesh.scale.set(0.5, 0.5, 0.5); this.localPlayerMesh.visible = false; this.localPlayerMesh.userData = { entityId: id, isPlayer: true, isLocal: true }; this.localPlayerMesh.traverse(child => { if(child.isMesh){ child.castShadow = false; child.receiveShadow = false; child.visible = false; } }); this.localPlayerMesh.position.set(playerData.x, playerData.y, playerData.z); this.localPlayerMesh.rotation.set(0, playerData.rotationY, 0); this.scene.add(this.localPlayerMesh); window.players[id].mesh = this.localPlayerMesh;
                        console.log(`[DEBUG] Local player mesh added to scene at (${playerData.x.toFixed(1)}, ${playerData.y.toFixed(1)}, ${playerData.z.toFixed(1)})`); // DEBUG
                    } catch(e) { console.error("Error cloning/adding local player mesh:", e); }
                } else { console.error("!!! Local player model asset not found!"); }
                const gunModelAsset = window.gunModelData;
                 if(gunModelAsset?.scene && this.camera) {
                     console.log(`[DEBUG] Cloning and attaching gun model to camera.`); // DEBUG
                     if (window.gunMesh) this.camera.remove(window.gunMesh); window.gunMesh = gunModelAsset.scene.clone(); window.gunMesh.scale.set(0.5, 0.5, 0.5); window.gunMesh.position.set(0.15, -0.15, -0.4); window.gunMesh.rotation.set(0, Math.PI, 0); window.gunMesh.traverse(child => { if (child.isMesh) child.castShadow = true; }); this.camera.add(window.gunMesh);
                 } else if (!this.camera) { console.error("!!! Cannot attach gun model: Game camera not initialized."); } else { console.warn("Gun model asset not ready, cannot attach gun."); }
                 if (this.controls) {
                      const startPos = new THREE.Vector3(playerData.x, playerData.y + CONFIG.CAMERA_Y_OFFSET, playerData.z);
                      console.log(`[DEBUG] Setting controls/camera position to (${startPos.x.toFixed(1)}, ${startPos.y.toFixed(1)}, ${startPos.z.toFixed(1)}) and rotY ${playerData.rotationY.toFixed(2)}`); // DEBUG
                      this.controls.getObject().position.copy(startPos); this.camera.rotation.set(0, playerData.rotationY, 0);
                 }
            } else {
                 console.log(`[DEBUG] Creating ClientPlayer instance for remote player ${id}.`); // DEBUG
                const remotePlayer = new ClientPlayer(playerData); window.players[id] = remotePlayer; if (!remotePlayer.mesh) { console.warn(`Remote player ${id} mesh failed to load.`); }
            }
            console.log(`[DEBUG Game] Initializing physics state for player ${id}`); // DEBUG
            window.playerVelocities[id] = new THREE.Vector3(0, 0, 0);
            window.playerIsGrounded[id] = false;
        }
        if (window.mapMesh) {
            console.log("[DEBUG] Map Mesh Check:", window.mapMesh instanceof THREE.Object3D, "Visible:", window.mapMesh.visible); // DEBUG
            let hasMeshChild = false; window.mapMesh.traverse(child => { if (child.isMesh) hasMeshChild = true; });
            console.log("[DEBUG] Map Mesh has Mesh children:", hasMeshChild); // DEBUG
        }
        else { console.error("!!! Map Mesh (window.mapMesh) is missing when starting gameplay!"); }
        console.log("[DEBUG Game] Finished initial player processing."); // DEBUG
    }

    // --- Player Cleanup ---
    cleanupPlayer(playerId) {
        const player = window.players[playerId];
        if (player?.mesh && this.scene) {
            console.log(`[DEBUG] Removing mesh for player ${playerId}.`); // DEBUG
             this.scene.remove(player.mesh);
             if (player instanceof ClientPlayer) { player.remove(); } // ClientPlayer handles dispose
             player.mesh = null;
        }
        if (window.players && window.players[playerId]) { delete window.players[playerId]; }
        if(playerId === window.localPlayerId) { this.localPlayerMesh = null; }
        if (window.playerVelocities && window.playerVelocities[playerId]) { delete window.playerVelocities[playerId]; }
        if (window.playerIsGrounded && window.playerIsGrounded.hasOwnProperty(playerId)) { delete window.playerIsGrounded[playerId]; }
        // console.log(`[DEBUG] Cleaned up data for player ${playerId}.`); // DEBUG
     }
     cleanupAllPlayers() {
         console.log("[DEBUG Game] Cleaning up all player objects..."); // DEBUG
         const playerIds = (window.players && typeof window.players === 'object') ? Object.keys(window.players) : [];
         playerIds.forEach(id => this.cleanupPlayer(id));
         window.localPlayerId = null; this.localPlayerMesh = null; window.players = {}; window.playerVelocities = {}; window.playerIsGrounded = {};
         this.players = window.players; this.playerVelocities = window.playerVelocities; this.playerIsGrounded = window.playerIsGrounded;
         console.log("[DEBUG Game] All player cleanup finished."); // DEBUG
     }

    // --- Main Update Loop (Manual Raycasting) ---
    update() {
        requestAnimationFrame(this.update.bind(this));

        // console.log(`>>> GAME UPDATE - State: ${stateMachine?.currentState}`); // Keep commented unless needed

        if (!this.clock || !this.renderer || !this.scene || !this.camera) { // Removed mapMesh check here, logic inside handles it
            // console.warn("[DEBUG Update Loop] Required components missing, skipping update."); // DEBUG
            return;
        }

        const deltaTime = this.clock.getDelta();
        const clampedDeltaTime = Math.min(deltaTime, 0.05); // Prevent physics issues with large delta
        // ***** LOG DELTA TIME *****
        // console.log(`[DEBUG] DeltaTime: ${deltaTime.toFixed(4)}, Clamped: ${clampedDeltaTime.toFixed(4)}`); // DEBUG

        // --- DEBUG: Log Input State ---
        if (stateMachine.is('playing') && window.Input) {
             const activeKeys = Object.entries(window.Input.keys)
                 .filter(([key, value]) => value === true)
                 .map(([key]) => key)
                 .join(',');
             const activeMouse = Object.entries(window.Input.mouseButtons)
                 .filter(([btn, value]) => value === true)
                 .map(([btn]) => `Btn${btn}`)
                 .join(',');

             // Only log if something is active OR if pointer lock state changes
             if (activeKeys || activeMouse || (window.Input._lastLoggedLockState !== this.controls?.isLocked) ) {
                 console.log(`[DEBUG Input State @ GameLoop] Keys: [${activeKeys}] | Mouse: [${activeMouse}] | Locked: ${this.controls?.isLocked}`);
                 window.Input._lastLoggedLockState = this.controls?.isLocked; // Track last logged lock state
             }
         }
         // --- End Debug Log ---

        if (stateMachine.is('playing')) {
            // --- Define prerequisites using DIRECT global checks ---
            const localMeshExists = !!this.localPlayerMesh;
            const idExists = !!window.localPlayerId;
            const velocityMapExists = typeof window.playerVelocities === 'object' && window.playerVelocities !== null;
            const localVelocityEntryExists = velocityMapExists && window.playerVelocities[window.localPlayerId] !== undefined;
            const groundedMapExists = typeof window.playerIsGrounded === 'object' && window.playerIsGrounded !== null;
            const localGroundedEntryExists = groundedMapExists && window.playerIsGrounded.hasOwnProperty(window.localPlayerId);
            const mapMeshExists = !!window.mapMesh; // Need map for collision

            const canUpdateInput = localMeshExists && idExists && localVelocityEntryExists && groundedMapExists && localGroundedEntryExists;
            const canCheckCollision = localMeshExists && idExists && localVelocityEntryExists && mapMeshExists; // Need map for collision

             // ***** Log prerequisites ONLY if they are false *****
             if (!canUpdateInput || !canCheckCollision) {
                 console.warn(`[DEBUG Update PreReqs] FAILED - Mesh:${localMeshExists}, ID:${idExists}, Map:${mapMeshExists}, VelMap:${velocityMapExists}, VelEntry:${localVelocityEntryExists}, GroundMap:${groundedMapExists}, GroundEntry:${localGroundedEntryExists} -> CanUpdateInput: ${canUpdateInput}, CanCheckCollision: ${canCheckCollision}`); // DEBUG
             }


            // --- 1. Update Local Player Input & Intent ---
            if (canUpdateInput) {
                // ***** ADDED CHECK for function existence *****
                if (typeof window.updateLocalPlayerInput === 'function') {
                    // console.log('[DEBUG Update] Calling updateLocalPlayerInput...'); // DEBUG
                    window.updateLocalPlayerInput(clampedDeltaTime, this.camera, this.localPlayerMesh); // Explicitly call window.
                } else {
                    // Log the error ONLY ONCE to avoid spamming console
                    if (!this._loggedUpdateInputError) {
                        console.error('[DEBUG Update] CRITICAL: window.updateLocalPlayerInput is NOT a function!');
                        this._loggedUpdateInputError = true; // Set flag after logging once
                    }
                }
                 // ***** END ADDED CHECK *****
            }

            // --- 2. Apply Physics & Collision (Local Player) ---
            if (canCheckCollision) {
                 // ***** ADDED CHECK for function existence *****
                 if (typeof window.checkPlayerCollisionAndMove === 'function') {
                    // console.log('[DEBUG Update] Calling checkPlayerCollisionAndMove...'); // DEBUG
                    const groundedResult = window.checkPlayerCollisionAndMove( // Explicitly call window.
                        this.localPlayerMesh,
                        window.playerVelocities[window.localPlayerId],
                        clampedDeltaTime
                    );
                    if (groundedResult !== undefined) {
                        // Only update if the function returned a valid boolean
                        if (window.playerIsGrounded[window.localPlayerId] !== groundedResult) {
                            // console.log(`[DEBUG] Grounded state changed to: ${groundedResult}`); // DEBUG
                        }
                        window.playerIsGrounded[window.localPlayerId] = groundedResult;
                    }
                 } else {
                     // Log the error ONLY ONCE
                     if (!this._loggedCollisionError) {
                        console.error('[DEBUG Update] CRITICAL: window.checkPlayerCollisionAndMove is NOT a function!');
                        this._loggedCollisionError = true;
                     }
                 }
                 // ***** END ADDED CHECK *****
             }

            // --- 3. Update Remote Players (Interpolation) ---
            for (const id in window.players) {
                if (id === window.localPlayerId) continue;
                const player = window.players[id]; const playerMesh = player?.mesh; const playerVelocity = window.playerVelocities ? window.playerVelocities[id] : undefined;
                if (player instanceof ClientPlayer && playerMesh && playerVelocity !== undefined) {
                    try {
                        // Simple dead reckoning / interpolation
                        if (playerVelocity.lengthSq() > 0.01) { // Apply velocity if significant
                             if (window.playerIsGrounded && !window.playerIsGrounded[id]) {
                                 // Apply gravity to remote players if airborne
                                 playerVelocity.y -= (CONFIG?.GRAVITY_ACCELERATION ?? 28.0) * clampedDeltaTime;
                             }
                             playerMesh.position.addScaledVector(playerVelocity, clampedDeltaTime); // Move based on velocity
                             // Simple floor collision for remote players
                             if (playerMesh.position.y < 0) { playerMesh.position.y = 0; playerVelocity.y = 0; if(window.playerIsGrounded) window.playerIsGrounded[id] = true; }
                             else { if(window.playerIsGrounded) window.playerIsGrounded[id] = false; }
                             playerVelocity.multiplyScalar(0.98); // Damp velocity
                        }
                        // Interpolate towards last known server position/rotation
                        playerMesh.position.lerp(new THREE.Vector3(player.serverX, player.serverY, player.serverZ), this.interpolationFactor);
                        const targetQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), player.serverRotY);
                        playerMesh.quaternion.slerp(targetQuat, this.interpolationFactor);
                    } catch(e) { console.error(`Error updating remote player ${id}:`, e); }
                }
            }

            // --- 4. Update Camera Position/Rotation ---
            // Camera position is now implicitly handled by controls using localPlayerMesh position
            // No need to manually set camera pos here if controls parent follows player
            if (this.localPlayerMesh && this.camera && this.controls) {
                 try {
                     // Ensure the controls object (which holds the camera) is at the correct height relative to player feet
                     const targetCameraParentPos = this.localPlayerMesh.position.clone();
                     targetCameraParentPos.y += CONFIG.CAMERA_Y_OFFSET;
                     this.controls.getObject().position.copy(targetCameraParentPos);
                 } catch(e) { console.error("Error updating camera/controls position:", e); }
            }


            // --- 5. Send Network Update ---
            // ***** ADDED CHECK for function existence *****
            if(typeof window.sendLocalPlayerUpdateIfNeeded === 'function') {
                // console.log('[DEBUG Update] Calling sendLocalPlayerUpdateIfNeeded...'); // DEBUG
                window.sendLocalPlayerUpdateIfNeeded(this.localPlayerMesh, this.camera); // Explicitly call window.
            } else {
                 if (!this._loggedNetworkUpdateError) {
                     console.error('[DEBUG Update] CRITICAL: window.sendLocalPlayerUpdateIfNeeded is NOT a function!');
                     this._loggedNetworkUpdateError = true;
                 }
            }
            // ***** END ADDED CHECK *****


            // --- 6. Update Effects ---
            // console.log('[DEBUG Update] Calling Effects.update...'); // DEBUG
            Effects?.update(deltaTime);

        } // End if(stateMachine.is('playing'))

        // Render Scene ALWAYS if renderer exists
        if (this.renderer && this.scene && this.camera) {
            // console.log('[DEBUG Update] Rendering scene...'); // DEBUG
            this.renderer.render(this.scene, this.camera);
        } else {
            // console.warn('[DEBUG Update] Skipping render - Renderer/Scene/Camera missing.'); // DEBUG
        }
    } // End Update Loop

} // End Game Class

// --- Global Initialization Trigger ---
document.addEventListener('DOMContentLoaded', () => {
    const startGameInit = () => {
         console.log("[DEBUG] DOMContentLoaded fired. Starting Game Initialization..."); // DEBUG
         const game = new Game();
         // Initialize flags for logging errors only once per category
         game._loggedUpdateInputError = false;
         game._loggedCollisionError = false;
         game._loggedNetworkUpdateError = false;

         game.init().catch(error => {
             console.error("[DEBUG] Unhandled error during Game Initialization:", error); // DEBUG
              if(typeof UIManager !== 'undefined') { UIManager.showLoading(`Initialization Error:<br/>${error.message}`, true); }
              else { document.body.innerHTML = `<p style='color:red; font-size: 1.5em;'>FATAL INITIALIZATION ERROR: ${error.message}</p>`; }
         });
    };
    startGameInit();
});
console.log("game.js loaded (Manual Raycasting v9 - Delta Time Log - WITH DEBUG LOGS & GLOBAL CHECK)");
// --- END OF FULL game.js FILE (Manual Raycasting v9 - Delta Time Log - WITH DEBUG LOGS & GLOBAL CHECK) ---
