// --- START OF FULL game.js FILE (Manual Raycasting v4 - Debug Logging) ---
// docs/game.js - Main Game Orchestrator (Manual Raycasting v4 - Debug Logging)

var currentGameInstance = null; // Holds the single Game instance

class Game {
    // --- Constructor ---
    constructor() {
        // Core components to be initialized
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        this.clock = null;
        // Game state references - Use globals from config.js (via window scope)
        this.players = window.players; // Reference global players object
        this.localPlayerMesh = null; // Reference to the local player's VISUAL mesh

        // ** Manual Physics Globals (referenced from config.js) **
        this.playerVelocities = window.playerVelocities; // Reference global velocity map
        this.playerIsGrounded = window.playerIsGrounded; // Reference global grounded map

        this.lastNetworkSendTime = 0;
        this.attemptCounter = 0; // Initialize attempt counter for debugging transitions
        this.interpolationFactor = 0.15; // How quickly remote players snap to server position
    }

    // --- Main Initialization Sequence ---
    async init() {
        console.log("--- Game Init Sequence (Manual Raycasting) ---");
        if (currentGameInstance) {
            console.warn("Game instance already exists! Aborting new init.");
            return;
        }
        currentGameInstance = this;

        // Ensure THREE is loaded globally before proceeding
        if (typeof THREE === 'undefined') {
            console.error("!!! CRITICAL: THREE.js library not loaded before Game.init()!");
            document.body.innerHTML = "<p style='color:red; text-align:center;'>FATAL ERROR: Graphics Library (THREE.js) failed to load.</p>";
            return;
        }

        // 1. Setup State Machine & UI Listeners
        stateMachine.transitionTo('loading', { message: 'Initializing Core...' });
        if (!UIManager.initialize()) {
             console.error("UIManager initialization failed!");
             document.body.innerHTML = "<p style='color:red; text-align:center;'>FATAL ERROR: UI System Failed to Initialize.</p>";
             return; // Stop
        }
        UIManager.bindStateListeners(stateMachine);

        // 2. Setup Three.js Core Components
        stateMachine.transitionTo('loading', { message: 'Setting up Graphics...' });
        this.clock = new THREE.Clock();
        this.scene = new THREE.Scene(); window.scene = this.scene; // Assign to global AND instance
        this.scene.background = new THREE.Color(0x87CEEB); // Sky Blue
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 500); window.camera = this.camera; // Assign to global AND instance
        this.renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('gameCanvas'), antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.shadowMap.enabled = true;
        window.renderer = this.renderer; // Assign to global AND instance

        // 3. Setup PointerLockControls
        if (typeof THREE.PointerLockControls === 'undefined') {
             console.error("!!! THREE.PointerLockControls not found!");
             stateMachine.transitionTo('loading', { message: 'FATAL: Controls Library Failed!', error: true }); return;
        }
        this.controls = new THREE.PointerLockControls(this.camera, this.renderer.domElement); window.controls = this.controls; // Assign to global AND instance
        this.controls.addEventListener('lock', () => {
            if(stateMachine?.is('playing') && UIManager?.gameUI) { UIManager.gameUI.style.cursor = 'none'; }
            const audioListener = window.listener;
            if (audioListener && audioListener.context && audioListener.context.state === 'suspended') {
                audioListener.context.resume().then(() => console.log('AudioContext resumed.')).catch(e => console.error('Error resuming AC:', e));
            }
        });
        this.controls.addEventListener('unlock', () => {
            if(UIManager?.gameUI) { UIManager.gameUI.style.cursor = 'default'; }
        });
        this.scene.add(this.controls.getObject());

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

        // 5. Initialize Input System
        if (!Input.init(this.controls)) { stateMachine.transitionTo('loading', { message: 'Input Init Failed!', error: true }); return; }

        // 6. Initialize Effects System
        if (!Effects.initialize(this.scene, this.camera)) { stateMachine.transitionTo('loading', { message: 'Effects Init Failed!', error: true }); return; }

        // 7. Physics: Not needed

        // 8. Setup Asset Loaders
        stateMachine.transitionTo('loading', { message: 'Preparing Asset Loaders...' });
        this.setupLoaders();

        // 9. Start Loading Assets
        stateMachine.transitionTo('loading', { message: 'Loading Game Assets...' });
        loadManager.on('ready', this.onAssetsReady.bind(this));
        loadManager.on('error', this.onLoadError.bind(this));
        loadManager.startLoading();

        // 10. Initialize Networking
        stateMachine.transitionTo('loading', { message: 'Connecting to Server...' });
        if (typeof Network?.init === 'function') { Network.init(); }
        else { console.error("Network.init missing!"); stateMachine.transitionTo('loading', { message: 'Network Init Failed!', error: true }); return; }

        // 11. Add Window Resize Listener
        this.addEventListeners();

        // 12. Start the Render Loop
        this.update();

        console.log("--- Game Init Sequence Complete (Waiting for Assets/Network/InitData) ---");
    }

    // --- Setup Sub-functions ---
    setupLoaders() {
        if (!THREE) { console.error("!!! THREE missing during loader setup!"); return; }
        if (typeof THREE.DRACOLoader === 'undefined' || typeof THREE.GLTFLoader === 'undefined') {
             console.error("!!! THREE.DRACOLoader or THREE.GLTFLoader constructors not found!");
             stateMachine.transitionTo('loading', { message: 'FATAL: GFX Loader Failed!', error: true }); return;
        }
        window.dracoLoader = new THREE.DRACOLoader();
        window.dracoLoader.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/libs/draco/');
        window.loader = new THREE.GLTFLoader();
        window.loader.setDRACOLoader(window.dracoLoader);
        console.log("[Game] GLTF/DRACO Loaders Initialized.");
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

        console.log(`[Game attempt #${callCount}] Checking prerequisites: Assets=${assetsReady}, MapMesh=${mapMeshReady}, Network=${networkReady}, InitData=${initDataPresent}, State=${stateMachine?.currentState}`);

        // Condition 1: Ready for ACTUAL GAMEPLAY?
        if (assetsReady && mapMeshReady && networkReady && initDataPresent) {
             console.log(`[Game attempt #${callCount}] Prerequisites met! Attempting to start gameplay...`);
             this.startGamePlay(window.initializationData);
             if (stateMachine?.is('playing')) {
                window.initializationData = null;
             } else { console.warn(`[Game attempt #${callCount}] startGamePlay was called but state did not transition to 'playing'. initData not consumed.`); }
        }
        // Condition 2: Ready for HOMESCREEN?
        else if (assetsReady && mapMeshReady && networkReady && !initDataPresent &&
                 !stateMachine?.is('homescreen') && !stateMachine?.is('characterSelect') && !stateMachine?.is('joining') && !stateMachine?.is('playing'))
        {
            console.log(`[Game attempt #${callCount}] Core components ready, transitioning to Homescreen... (Current state: ${stateMachine.currentState})`);
            stateMachine?.transitionTo('homescreen');
        }
        // Condition 3: Still waiting...
        else {
            if (stateMachine?.is('loading') && !stateMachine.options?.error) {
                let waitMsg = "Initializing...";
                if (!assetsReady) waitMsg = "Loading Assets...";
                else if (!mapMeshReady) waitMsg = "Loading Map Mesh...";
                else if (!networkReady) waitMsg = "Connecting...";
                stateMachine?.transitionTo('loading', { message: waitMsg });
            } else if (!stateMachine?.is('loading')) {
                console.log(`[Game attempt #${callCount}] Prerequisites not met or invalid state for transition. State: ${stateMachine?.currentState}, Error: ${stateMachine?.options?.error || 'none'}`);
            }
        }
    }

    // --- Start Actual Gameplay Logic ---
    startGamePlay(initData) {
        if (stateMachine?.is('playing')) {
            console.warn("[Game] startGamePlay called while already in 'playing' state. Ignoring.");
            return;
        }
        this.cleanupAllPlayers(); // Cleanup BEFORE setting state and processing

        stateMachine.transitionTo('playing'); // Set state FIRST
        console.log("[Game] --- Starting Gameplay (Manual Raycasting) ---");

        window.localPlayerId = initData.id;
        console.log(`[Game] Local Player ID set: ${window.localPlayerId}`);

        // Process initial player data from server
        for (const id in initData.players) {
            const playerData = initData.players[id]; if (!playerData) continue;

            if (id === window.localPlayerId) {
                // Create LOCAL Player representation
                window.players[id] = {
                    id: id, name: playerData.name, phrase: playerData.phrase,
                    health: playerData.health, isLocal: true, mesh: null,
                    x: playerData.x, y: playerData.y, z: playerData.z, rotationY: playerData.rotationY,
                    lastSentX: playerData.x, lastSentY: playerData.y, lastSentZ: playerData.z, lastSentRotY: playerData.rotationY,
                };
                UIManager.updateInfo(`Playing as ${window.localPlayerName}`);
                UIManager.updateHealthBar(playerData.health);

                // Create local player mesh (invisible)
                const playerModelAsset = window.playerModelData;
                if (playerModelAsset?.scene) {
                    try {
                        this.localPlayerMesh = playerModelAsset.scene.clone();
                        this.localPlayerMesh.scale.set(0.5, 0.5, 0.5);
                        this.localPlayerMesh.visible = false;
                        this.localPlayerMesh.userData = { entityId: id, isPlayer: true, isLocal: true };
                        this.localPlayerMesh.traverse(child => { if(child.isMesh){ child.castShadow = false; child.receiveShadow = false; child.visible = false; } });
                        this.localPlayerMesh.position.set(playerData.x, playerData.y, playerData.z);
                        this.localPlayerMesh.rotation.set(0, playerData.rotationY, 0);
                        this.scene.add(this.localPlayerMesh);
                        window.players[id].mesh = this.localPlayerMesh;
                    } catch(e) { console.error("Error cloning/adding local player mesh:", e); }
                } else { console.error("!!! Local player model asset not found!"); }

                // Attach gun model
                const gunModelAsset = window.gunModelData;
                 if(gunModelAsset?.scene && this.camera) {
                     if (window.gunMesh) this.camera.remove(window.gunMesh);
                     window.gunMesh = gunModelAsset.scene.clone();
                     // *** ADJUST GUN SCALE HERE ***
                     window.gunMesh.scale.set(0.5, 0.5, 0.5); // Example: Increased scale
                     window.gunMesh.position.set(0.15, -0.15, -0.4); // May need minor position tweaks after scaling
                     window.gunMesh.rotation.set(0, Math.PI, 0);
                     window.gunMesh.traverse(child => { if (child.isMesh) child.castShadow = true; });
                     this.camera.add(window.gunMesh);
                 } else if (!this.camera) { console.error("!!! Cannot attach gun model: Game camera not initialized.");
                 } else { console.warn("Gun model asset not ready, cannot attach gun."); }

                 // Set initial camera/controls position
                 if (this.controls) {
                     const startPos = new THREE.Vector3(playerData.x, playerData.y + CONFIG.CAMERA_Y_OFFSET, playerData.z);
                     this.controls.getObject().position.copy(startPos);
                     this.camera.rotation.set(0, playerData.rotationY, 0);
                 }

            } else {
                // Create REMOTE Player representation
                const remotePlayer = new ClientPlayer(playerData);
                window.players[id] = remotePlayer;
                if (!remotePlayer.mesh) { console.warn(`Remote player ${id} mesh failed to load.`); }
            }
            // Initialize physics state maps for this player
            this.playerVelocities[id] = new THREE.Vector3(0, 0, 0);
            this.playerIsGrounded[id] = false; // Start airborne, ground check will correct
        }
        // Map Mesh Check (moved from loop)
        if (window.mapMesh) {
            console.log("Map Mesh Check:", window.mapMesh instanceof THREE.Object3D, "Visible:", window.mapMesh.visible);
            let hasMeshChild = false;
            window.mapMesh.traverse(child => { if (child.isMesh) hasMeshChild = true; });
            console.log("Map Mesh has Mesh children:", hasMeshChild);
        } else {
            console.error("!!! Map Mesh (window.mapMesh) is missing when starting gameplay!");
        }

        console.log("[Game] Finished initial player processing.");
    }

    // --- Player Cleanup ---
    cleanupPlayer(playerId) {
        const player = window.players[playerId];
        if (player?.mesh && this.scene) {
            this.scene.remove(player.mesh);
            if (player instanceof ClientPlayer) { player.remove(); }
            player.mesh = null;
        }
        if (window.players && window.players[playerId]) {
            delete window.players[playerId];
        }
        if(playerId === window.localPlayerId) { this.localPlayerMesh = null; }
        if (this.playerVelocities && this.playerVelocities[playerId]) {
            delete this.playerVelocities[playerId];
        }
        if (this.playerIsGrounded && this.playerIsGrounded.hasOwnProperty(playerId)) {
            delete this.playerIsGrounded[playerId];
        }
     }

     cleanupAllPlayers() {
         console.log("[Game] Cleaning up all player objects (Manual Raycasting)...");
         const playerIds = (window.players && typeof window.players === 'object') ? Object.keys(window.players) : [];
         playerIds.forEach(id => this.cleanupPlayer(id));
         window.localPlayerId = null;
         this.localPlayerMesh = null;
         this.playerVelocities = {};
         this.playerIsGrounded = {};
         window.players = {};
         console.log("[Game] Player cleanup finished.");
     }

    // --- Main Update Loop (Manual Raycasting) ---
    update() {
        requestAnimationFrame(this.update.bind(this));
        if (!this.clock || !this.renderer || !this.scene || !this.camera || !window.mapMesh) {
            return; // Skip update if core components or map aren't ready
        }

        const deltaTime = this.clock.getDelta();
        const clampedDeltaTime = Math.min(deltaTime, 0.05); // Clamp delta time

        if (stateMachine.is('playing')) {
             // console.log("Game Loop Running - Playing State"); // <-- TEMP LOG

            // 1. Update Local Player Input & Intent
            if (this.localPlayerMesh && localPlayerId && this.playerVelocities[localPlayerId]) {
                updateLocalPlayerInput(clampedDeltaTime, this.camera, this.localPlayerMesh);
            }

            // 2. Apply Physics & Collision (Local Player)
            if (this.localPlayerMesh && localPlayerId && this.playerVelocities[localPlayerId]) {
                const groundedResult = checkPlayerCollisionAndMove(
                    this.localPlayerMesh,
                    this.playerVelocities[localPlayerId],
                    clampedDeltaTime
                );
                // Only update if the function didn't return undefined (e.g., due to early exit)
                if (groundedResult !== undefined) {
                    this.playerIsGrounded[localPlayerId] = groundedResult;
                }
                // console.log("Grounded state updated to:", this.playerIsGrounded[localPlayerId]); // <-- TEMP LOG
            }

            // 3. Update Remote Players (Interpolation)
            for (const id in window.players) {
                if (id === localPlayerId) continue;
                const player = window.players[id];
                const playerMesh = player?.mesh;
                const playerVelocity = this.playerVelocities[id];

                if (player instanceof ClientPlayer && playerMesh && playerVelocity) {
                    try {
                        // Simple physics simulation (gravity/damping) if velocity exists (e.g., after shockwave)
                        if (playerVelocity.lengthSq() > 0.01) {
                             if (!this.playerIsGrounded[id]) { // Use potentially stale grounded state for remote
                                playerVelocity.y -= (CONFIG?.GRAVITY_ACCELERATION ?? 28.0) * clampedDeltaTime;
                             }
                             playerMesh.position.addScaledVector(playerVelocity, clampedDeltaTime);
                             // Basic ground clamp
                             if (playerMesh.position.y < 0) {
                                playerMesh.position.y = 0; playerVelocity.y = 0; this.playerIsGrounded[id] = true;
                             } else { this.playerIsGrounded[id] = false; }
                             playerVelocity.multiplyScalar(0.98); // Dampen velocity
                        }

                        // Interpolate position & rotation towards server state
                        playerMesh.position.lerp(new THREE.Vector3(player.serverX, player.serverY, player.serverZ), this.interpolationFactor);
                        const targetQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), player.serverRotY);
                        playerMesh.quaternion.slerp(targetQuat, this.interpolationFactor);

                    } catch(e) { console.error(`Error updating remote player ${id}:`, e); }
                }
            }

            // 4. Update Camera Position/Rotation
            if (this.localPlayerMesh && this.camera && this.controls) {
                 try {
                     const targetCameraParentPos = this.localPlayerMesh.position.clone();
                     targetCameraParentPos.y += CONFIG.CAMERA_Y_OFFSET;
                     this.controls.getObject().position.copy(targetCameraParentPos);
                 } catch(e) { console.error("Error updating camera/controls position:", e); }
            }

            // 5. Send Network Update
            sendLocalPlayerUpdateIfNeeded(this.localPlayerMesh, this.camera);

            // 6. Update Effects
            Effects?.update(deltaTime);

        } // End if(stateMachine.is('playing'))

        // Render Scene ALWAYS
        if (this.renderer && this.scene && this.camera) {
            this.renderer.render(this.scene, this.camera);
        }
    } // End Update Loop

} // End Game Class

// --- Global Initialization Trigger ---
document.addEventListener('DOMContentLoaded', () => {
    const startGameInit = () => {
         console.log("DOM ready. Starting Game Initialization...");
         const game = new Game();
         game.init().catch(error => {
             console.error("Unhandled error during Game Initialization:", error);
              if(typeof UIManager !== 'undefined') { UIManager.showLoading(`Initialization Error:<br/>${error.message}`, true); }
              else { document.body.innerHTML = `<p style='color:red; font-size: 1.5em;'>FATAL INITIALIZATION ERROR: ${error.message}</p>`; }
         });
    };
    startGameInit();
});
console.log("game.js loaded (Manual Raycasting v4 - Debug Logging)");
// --- END OF FULL game.js FILE (Manual Raycasting v4 - Debug Logging) ---
