// --- START OF FULL game.js FILE (PASSING Input State v1 - COMPLETE CODE) ---
// docs/game.js - Main Game Orchestrator

var currentGameInstance = null; // Holds the single Game instance

class Game {
    // --- Constructor ---
    constructor() {
        console.log('[DEBUG] Game constructor called.');
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        this.clock = null;
        this.gameLogic = null; // Will hold GameLogic instance

        // References to global state (still needed for setup/initialization)
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
        console.log("--- Game Init Sequence (Passing Input State) ---");
        if (currentGameInstance) { console.warn("Game instance already exists! Aborting new init."); return; }
        currentGameInstance = this;
        if (typeof THREE === 'undefined') { console.error("!!! CRITICAL: THREE.js library not loaded!"); return; }
        console.log('[DEBUG] Game.init() started.');

        // State Machine & UI
        stateMachine.transitionTo('loading', { message: 'Initializing Core...' });
        if (!UIManager.initialize()) { console.error("UIManager initialization failed!"); return; }
        UIManager.bindStateListeners(stateMachine);
        console.log('[DEBUG] UIManager initialized and listeners bound.');

        // Three.js Core
        stateMachine.transitionTo('loading', { message: 'Setting up Graphics...' });
        this.clock = new THREE.Clock();
        this.scene = new THREE.Scene(); window.scene = this.scene;
        this.scene.background = new THREE.Color(0x87CEEB);
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 500); window.camera = this.camera;
        this.renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('gameCanvas'), antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.shadowMap.enabled = true;
        window.renderer = this.renderer;
        console.log('[DEBUG] Three.js core components created.');

        // PointerLockControls
        if (typeof THREE.PointerLockControls === 'undefined') { console.error("!!! THREE.PointerLockControls not found!"); stateMachine.transitionTo('loading', { message: 'FATAL: Controls Library Failed!', error: true }); return; }
        this.controls = new THREE.PointerLockControls(this.camera, this.renderer.domElement); window.controls = this.controls;
        this.controls.addEventListener('lock', () => { console.log('[DEBUG] Pointer Locked.'); if(stateMachine?.is('playing') && UIManager?.gameUI) { UIManager.gameUI.style.cursor = 'none'; } const audioListener = window.listener; if (audioListener?.context?.state === 'suspended') { audioListener.context.resume().catch(e => console.error('Error resuming AC:', e)); } });
        this.controls.addEventListener('unlock', () => { console.log('[DEBUG] Pointer Unlocked.'); if(UIManager?.gameUI) { UIManager.gameUI.style.cursor = 'default'; } });
        this.scene.add(this.controls.getObject());
        console.log('[DEBUG] PointerLockControls setup.');

        // Lighting
        this.scene.add(new THREE.AmbientLight(0x606070, 1.0));
        const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
        dirLight.position.set(40, 50, 30);
        dirLight.castShadow = true;
        // Shadow settings
        dirLight.shadow.mapSize.width = 2048;
        dirLight.shadow.mapSize.height = 2048;
        dirLight.shadow.camera.near = 1;
        dirLight.shadow.camera.far = 150;
        dirLight.shadow.camera.left = -60;
        dirLight.shadow.camera.right = 60;
        dirLight.shadow.camera.top = 60;
        dirLight.shadow.camera.bottom = -60;
        dirLight.shadow.bias = -0.001;
        this.scene.add(dirLight);
        const hemisphereLight = new THREE.HemisphereLight( 0x87CEEB, 0x404020, 0.6 );
        this.scene.add( hemisphereLight );
        console.log('[DEBUG] Scene lighting added.');

        // Input System
        if (!Input.init(this.controls)) { stateMachine.transitionTo('loading', { message: 'Input Init Failed!', error: true }); return; }
        console.log('[DEBUG] Input.init() successful.');

        // Effects System
        if (!Effects.initialize(this.scene, this.camera)) { stateMachine.transitionTo('loading', { message: 'Effects Init Failed!', error: true }); return; }
        console.log('[DEBUG] Effects.initialize() successful.');

        // Instantiate GameLogic
        try {
             if (typeof GameLogic === 'undefined') throw new Error("GameLogic class is not defined/loaded!");
             this.gameLogic = new GameLogic(this); // Create instance
             console.log('[DEBUG] GameLogic instance created successfully.');
        } catch (e) {
             console.error("!!! CRITICAL: Failed to instantiate GameLogic:", e);
             stateMachine.transitionTo('loading', { message: 'FATAL: Game Logic Init Failed!', error: true });
             return;
        }

        // Asset Loaders
        stateMachine.transitionTo('loading', { message: 'Preparing Asset Loaders...' });
        this.setupLoaders();
        console.log('[DEBUG] Asset loaders setup.');

        // Start Loading Assets
        stateMachine.transitionTo('loading', { message: 'Loading Game Assets...' });
        loadManager.on('ready', this.onAssetsReady.bind(this));
        loadManager.on('error', this.onLoadError.bind(this));
        loadManager.startLoading();
        console.log('[DEBUG] Asset loading started.');

        // Networking
        stateMachine.transitionTo('loading', { message: 'Connecting to Server...' });
        if (typeof Network?.init === 'function') { Network.init(); }
        else { console.error("Network.init missing!"); stateMachine.transitionTo('loading', { message: 'Network Init Failed!', error: true }); return; }
        console.log('[DEBUG] Network.init() called.');

        // Event Listeners
        this.addEventListeners();
        console.log('[DEBUG] Window resize listener added.');

        // Start Render Loop
        console.log('[DEBUG] Starting the render loop (_update)...');
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
    }
    addEventListeners() {
        window.addEventListener('resize', this.onWindowResize.bind(this), false);
    }
    onWindowResize() {
        if (this.camera && this.renderer) {
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(window.innerWidth, window.innerHeight);
        }
    }

    // --- Loading Callbacks ---
    onAssetsReady() {
        console.log("[Game] Asset Load Manager reported 'ready'.");
        window.assetsAreReady = true;
        this.attemptProceedToGame();
    }
    onLoadError(errorData) {
        console.error("[Game] Asset Load Manager reported 'error':", errorData.message);
        stateMachine?.transitionTo('loading', { message: `Asset Load Failed!<br/>${errorData.message}`, error: true });
    }

    // --- Check Prerequisites & Transition Logic ---
    attemptProceedToGame() {
        this.attemptCounter++;
        const callCount = this.attemptCounter;
        const assetsReady = window.assetsAreReady;
        const networkReady = window.networkIsInitialized;
        const initDataPresent = !!window.initializationData;
        const mapMeshReady = !!window.mapMesh;
        console.log(`[DEBUG Game attempt #${callCount}] Checking prerequisites: Assets=${assetsReady}, MapMesh=${mapMeshReady}, Network=${networkReady}, InitData=${initDataPresent}, State=${stateMachine?.currentState}`);
        if (assetsReady && mapMeshReady && networkReady && initDataPresent) {
            console.log(`[DEBUG Game attempt #${callCount}] Prerequisites met! Attempting to start gameplay...`);
            this.startGamePlay(window.initializationData);
            if (stateMachine?.is('playing')) {
                window.initializationData = null;
            } else {
                console.warn(`[DEBUG Game attempt #${callCount}] startGamePlay called but state did not transition to 'playing'. initData not consumed.`);
            }
        } else if (assetsReady && mapMeshReady && networkReady && !initDataPresent && !stateMachine?.is('homescreen') && !stateMachine?.is('characterSelect') && !stateMachine?.is('joining') && !stateMachine?.is('playing')) {
            console.log(`[DEBUG Game attempt #${callCount}] Core components ready, transitioning to Homescreen... (Current state: ${stateMachine.currentState})`);
            stateMachine?.transitionTo('homescreen');
        } else {
            if (stateMachine?.is('loading') && !stateMachine.options?.error) {
                let waitMsg = "Initializing...";
                if (!assetsReady) waitMsg = "Loading Assets...";
                else if (!mapMeshReady) waitMsg = "Loading Map Mesh...";
                else if (!networkReady) waitMsg = "Connecting...";
                stateMachine?.transitionTo('loading', { message: waitMsg });
            } else if (!stateMachine?.is('loading')) {
                console.log(`[DEBUG Game attempt #${callCount}] Prerequisites not met or invalid state for transition. State: ${stateMachine?.currentState}, Error: ${stateMachine?.options?.error || 'none'}`);
            }
        }
    } // End attemptProceedToGame


    // --- Start Actual Gameplay Logic ---
    startGamePlay(initData) {
        if (stateMachine?.is('playing')) { console.warn("[DEBUG Game] startGamePlay called while already in 'playing' state. Ignoring."); return; }
        console.log('[DEBUG] Cleaning up players before starting gameplay...');
        this.cleanupAllPlayers();
        stateMachine.transitionTo('playing');
        console.log("[Game] --- Starting Gameplay (Passing Input State) ---");
        console.log("[DEBUG] State transitioned to 'playing'. Setting up players...");
        window.localPlayerId = initData.id;
        console.log(`[DEBUG Game] Local Player ID set: ${window.localPlayerId}`);
        if (typeof window.playerVelocities !== 'object' || window.playerVelocities === null) { console.log("[DEBUG Game] Initializing global playerVelocities map."); window.playerVelocities = {}; }
        if (typeof window.playerIsGrounded !== 'object' || window.playerIsGrounded === null) { console.log("[DEBUG Game] Initializing global playerIsGrounded map."); window.playerIsGrounded = {}; }
        for (const id in initData.players) {
            const playerData = initData.players[id];
            if (!playerData) continue;
            console.log(`[DEBUG] Processing player data from init: ${id === window.localPlayerId ? 'Local' : 'Remote'} Player ID ${id}`);
            if (id === window.localPlayerId) {
                window.players[id] = { id: id, name: playerData.name, phrase: playerData.phrase, health: playerData.health, isLocal: true, mesh: null, x: playerData.x, y: playerData.y, z: playerData.z, rotationY: playerData.rotationY, lastSentX: playerData.x, lastSentY: playerData.y, lastSentZ: playerData.z, lastSentRotY: playerData.rotationY };
                console.log(`[DEBUG] Local player data object created for ${id}.`);
                UIManager.updateInfo(`Playing as ${window.localPlayerName}`); UIManager.updateHealthBar(playerData.health);
                const playerModelAsset = window.playerModelData;
                if (playerModelAsset?.scene) {
                    try {
                        console.log(`[DEBUG] Cloning player model for local player ${id}.`);
                        this.localPlayerMesh = playerModelAsset.scene.clone();
                        this.localPlayerMesh.scale.set(0.5, 0.5, 0.5);
                        this.localPlayerMesh.visible = false; // Local player mesh is invisible (first-person view)
                        this.localPlayerMesh.userData = { entityId: id, isPlayer: true, isLocal: true };
                        this.localPlayerMesh.traverse(child => { if(child.isMesh){ child.castShadow = false; child.receiveShadow = false; child.visible = false; } }); // Ensure children are also invisible
                        this.localPlayerMesh.position.set(playerData.x, playerData.y, playerData.z);
                        this.localPlayerMesh.rotation.set(0, playerData.rotationY, 0);
                        this.scene.add(this.localPlayerMesh);
                        window.players[id].mesh = this.localPlayerMesh;
                        console.log(`[DEBUG] Local player mesh added to scene at (${playerData.x.toFixed(1)}, ${playerData.y.toFixed(1)}, ${playerData.z.toFixed(1)})`);
                    } catch(e) { console.error("Error cloning/adding local player mesh:", e); }
                } else { console.error("!!! Local player model asset not found!"); }
                const gunModelAsset = window.gunModelData;
                 if(gunModelAsset?.scene && this.camera) {
                     console.log(`[DEBUG] Cloning and attaching gun model to camera.`);
                     if (window.gunMesh) this.camera.remove(window.gunMesh);
                     window.gunMesh = gunModelAsset.scene.clone();
                     window.gunMesh.scale.set(0.5, 0.5, 0.5);
                     window.gunMesh.position.set(0.15, -0.15, -0.4); // Adjust gun position relative to camera
                     window.gunMesh.rotation.set(0, Math.PI, 0); // Adjust gun rotation
                     window.gunMesh.traverse(child => { if (child.isMesh) child.castShadow = true; });
                     this.camera.add(window.gunMesh); // Add gun as child of camera
                 } else if (!this.camera) { console.error("!!! Cannot attach gun model: Game camera not initialized."); } else { console.warn("Gun model asset not ready, cannot attach gun."); }
                 if (this.controls) {
                     // Set camera position directly - PointerLockControls moves the camera object itself
                     const startPos = new THREE.Vector3(playerData.x, playerData.y + CONFIG.CAMERA_Y_OFFSET, playerData.z);
                     console.log(`[DEBUG] Setting controls/camera position to (${startPos.x.toFixed(1)}, ${startPos.y.toFixed(1)}, ${startPos.z.toFixed(1)}) and rotY ${playerData.rotationY.toFixed(2)}`);
                     this.controls.getObject().position.copy(startPos); // Move the controls object (which contains the camera)
                     this.camera.rotation.set(0, playerData.rotationY, 0); // Set initial camera rotation
                 }
            } else {
                 console.log(`[DEBUG] Creating ClientPlayer instance for remote player ${id}.`);
                const remotePlayer = new ClientPlayer(playerData);
                window.players[id] = remotePlayer;
                if (!remotePlayer.mesh) { console.warn(`Remote player ${id} mesh failed to load.`); }
            }
            console.log(`[DEBUG Game] Initializing physics state for player ${id}`);
            window.playerVelocities[id] = new THREE.Vector3(0, 0, 0);
            window.playerIsGrounded[id] = false;
        }
        if (window.mapMesh) {
            console.log("[DEBUG] Map Mesh Check:", window.mapMesh instanceof THREE.Object3D, "Visible:", window.mapMesh.visible);
            let hasMeshChild = false; window.mapMesh.traverse(child => { if (child.isMesh) hasMeshChild = true; });
            console.log("[DEBUG] Map Mesh has Mesh children:", hasMeshChild);
        }
        else { console.error("!!! Map Mesh (window.mapMesh) is missing when starting gameplay!"); }
        console.log("[DEBUG Game] Finished initial player processing.");
    } // End startGamePlay


    // --- Player Cleanup ---
    cleanupPlayer(playerId) {
        const player = window.players[playerId];
        if (player?.mesh && this.scene) {
            this.scene.remove(player.mesh);
            if (player instanceof ClientPlayer) { player.remove(); }
            player.mesh = null;
        }
        if (window.players && window.players[playerId]) { delete window.players[playerId]; }
        if(playerId === window.localPlayerId) { this.localPlayerMesh = null; }
        if (window.playerVelocities && window.playerVelocities[playerId]) { delete window.playerVelocities[playerId]; }
        if (window.playerIsGrounded && window.playerIsGrounded.hasOwnProperty(playerId)) { delete window.playerIsGrounded[playerId]; }
    }
    cleanupAllPlayers() {
        console.log("[DEBUG Game] Cleaning up all player objects...");
        const playerIds = (window.players && typeof window.players === 'object') ? Object.keys(window.players) : [];
        playerIds.forEach(id => this.cleanupPlayer(id));
        window.localPlayerId = null;
        this.localPlayerMesh = null;
        window.players = {};
        window.playerVelocities = {};
        window.playerIsGrounded = {};
        this.players = window.players;
        this.playerVelocities = window.playerVelocities;
        this.playerIsGrounded = window.playerIsGrounded;
        console.log("[DEBUG Game] All player cleanup finished.");
    } // End cleanupAllPlayers


    // --- Main Update Loop ---
    update() {
        requestAnimationFrame(this.update.bind(this));

        if (!this.clock || !this.renderer || !this.scene || !this.camera || !this.gameLogic) { return; } // Check if gameLogic exists

        const deltaTime = this.clock.getDelta();
        const clampedDeltaTime = Math.min(deltaTime, 0.05); // Prevent physics issues with large delta

        // --- Capture Input State to Pass Down ---
        let currentInputState = null;
        if (window.Input) {
             currentInputState = {
                 keys: { ...window.Input.keys }, // Pass a shallow copy
                 mouseButtons: { ...window.Input.mouseButtons }, // Pass a shallow copy
                 requestingDash: window.Input.requestingDash,
                 dashDirection: window.Input.dashDirection, // Pass reference (it's an object)
                 isLocked: this.controls?.isLocked ?? false
             };

             // Log Input State (for verification)
             const activeKeys = Object.entries(currentInputState.keys).filter(([key, value]) => value === true).map(([key]) => key).join(',');
             const activeMouse = Object.entries(currentInputState.mouseButtons).filter(([btn, value]) => value === true).map(([btn]) => `Btn${btn}`).join(',');
             if (activeKeys || activeMouse || (window.Input._lastLoggedLockState !== currentInputState.isLocked) ) {
                 console.log(`[DEBUG Input State @ GameLoop Capture] Keys: [${activeKeys}] | Mouse: [${activeMouse}] | Locked: ${currentInputState.isLocked}`);
                 window.Input._lastLoggedLockState = currentInputState.isLocked;
             }

             // Important: Consumption of dash request flag now happens INSIDE gameLogic.updateLocalPlayerInput
        }
        // -----------------------------------------


        if (stateMachine.is('playing')) {
            // --- Define prerequisites ---
            const localMeshExists = !!this.localPlayerMesh;
            const idExists = !!window.localPlayerId;
            const velocityMapExists = typeof window.playerVelocities === 'object' && window.playerVelocities !== null;
            const localVelocityEntryExists = velocityMapExists && window.playerVelocities[window.localPlayerId] !== undefined;
            const groundedMapExists = typeof window.playerIsGrounded === 'object' && window.playerIsGrounded !== null;
            const localGroundedEntryExists = groundedMapExists && window.playerIsGrounded.hasOwnProperty(window.localPlayerId);
            const mapMeshExists = !!window.mapMesh;

            const canUpdateInput = localMeshExists && idExists && localVelocityEntryExists && groundedMapExists && localGroundedEntryExists && currentInputState !== null; // Check input state captured
            const canCheckCollision = localMeshExists && idExists && localVelocityEntryExists && mapMeshExists;

             if (!canUpdateInput || !canCheckCollision) {
                 console.warn(`[DEBUG Update PreReqs] FAILED - Mesh:${localMeshExists}, ID:${idExists}, Map:${mapMeshExists}, VelMap:${velocityMapExists}, VelEntry:${localVelocityEntryExists}, GroundMap:${groundedMapExists}, GroundEntry:${localGroundedEntryExists}, InputStateValid:${currentInputState !== null} -> CanUpdateInput: ${canUpdateInput}, CanCheckCollision: ${canCheckCollision}`);
             }

            // --- Use GameLogic instance ---
            if (canUpdateInput) {
                // Pass the captured input state
                this.gameLogic.updateLocalPlayerInput(clampedDeltaTime, this.camera, this.localPlayerMesh, currentInputState);
            }
            if (canCheckCollision) {
                const groundedResult = this.gameLogic.checkPlayerCollisionAndMove(
                    this.localPlayerMesh,
                    window.playerVelocities[window.localPlayerId],
                    clampedDeltaTime
                );
                if (groundedResult !== undefined) {
                    window.playerIsGrounded[window.localPlayerId] = groundedResult;
                }
             }
             // --- End Use GameLogic instance ---


            // Update Remote Players
            for (const id in window.players) {
                if (id === window.localPlayerId) continue;
                const player = window.players[id];
                const playerMesh = player?.mesh;
                const playerVelocity = window.playerVelocities ? window.playerVelocities[id] : undefined;
                if (player instanceof ClientPlayer && playerMesh && playerVelocity !== undefined) {
                    try {
                        if (playerVelocity.lengthSq() > 0.01) {
                            if (window.playerIsGrounded && !window.playerIsGrounded[id]) {
                                playerVelocity.y -= (CONFIG?.GRAVITY_ACCELERATION ?? 28.0) * clampedDeltaTime;
                            }
                            playerMesh.position.addScaledVector(playerVelocity, clampedDeltaTime);
                            if (playerMesh.position.y < 0) { playerMesh.position.y = 0; playerVelocity.y = 0; if(window.playerIsGrounded) window.playerIsGrounded[id] = true; }
                            else { if(window.playerIsGrounded) window.playerIsGrounded[id] = false; }
                            playerVelocity.multiplyScalar(0.98);
                        }
                        playerMesh.position.lerp(new THREE.Vector3(player.serverX, player.serverY, player.serverZ), this.interpolationFactor);
                        const targetQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), player.serverRotY);
                        playerMesh.quaternion.slerp(targetQuat, this.interpolationFactor);
                    } catch(e) { console.error(`Error updating remote player ${id}:`, e); }
                }
            }

            // Update Camera Position - The controls object moves the camera based on mouse input
            // We just need to ensure the controls object's base position matches the invisible player mesh position
            if (this.localPlayerMesh && this.camera && this.controls) {
                try {
                    const targetCameraParentPos = this.localPlayerMesh.position.clone();
                    targetCameraParentPos.y += CONFIG.CAMERA_Y_OFFSET; // Camera height offset
                    this.controls.getObject().position.copy(targetCameraParentPos);
                } catch(e) { console.error("Error updating camera/controls position:", e); }
            }

            // Use GameLogic for Network Update
            if(this.gameLogic && typeof this.gameLogic.sendLocalPlayerUpdateIfNeeded === 'function') {
                 this.gameLogic.sendLocalPlayerUpdateIfNeeded(this.localPlayerMesh, this.camera);
             } else if (this.gameLogic && !this._loggedNetworkUpdateError) {
                 console.error('[DEBUG Update] CRITICAL: this.gameLogic.sendLocalPlayerUpdateIfNeeded is NOT a function!');
                 this._loggedNetworkUpdateError = true;
             }

            // Update Effects
            Effects?.update(deltaTime);

        } // End if(stateMachine.is('playing'))

        // Render Scene
        if (this.renderer && this.scene && this.camera) {
            this.renderer.render(this.scene, this.camera);
        }
    } // End Update Loop

} // End Game Class

// --- Global Initialization Trigger ---
document.addEventListener('DOMContentLoaded', () => {
    const startGameInit = () => {
         console.log("[DEBUG] DOMContentLoaded fired. Starting Game Initialization...");
         const game = new Game();
         game._loggedNetworkUpdateError = false; // Initialize error flag
         game.init().catch(error => {
             console.error("[DEBUG] Unhandled error during Game Initialization:", error);
              if(typeof UIManager !== 'undefined') { UIManager.showLoading(`Initialization Error:<br/>${error.message}`, true); }
              else { document.body.innerHTML = `<p style='color:red; font-size: 1.5em;'>FATAL INITIALIZATION ERROR: ${error.message}</p>`; }
         });
    };
    startGameInit();
});
console.log("game.js loaded (PASSING Input State v1)");
// --- END OF FULL game.js FILE ---
