// --- START OF FULL game.js FILE (Manual Raycasting v2 - Joining Fix) ---
// docs/game.js - Main Game Orchestrator (Manual Raycasting v2 - Joining Fix)

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
            document.body.innerHTML = "<p style='color:red; text-align:center;'>FATAL ERROR: Graphics Library (THREE.js) failed to load. Check index.html script order.</p>";
            return;
        }

        // 1. Setup State Machine & UI Listeners
        stateMachine.transitionTo('loading', { message: 'Initializing Core...' });
        if (!UIManager.initialize()) {
             console.error("UIManager initialization failed!");
             document.body.innerHTML = "<p style='color:red; text-align:center;'>FATAL ERROR: UI System Failed to Initialize. Check console (F12).</p>";
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
        // this.renderer.shadowMap.type = THREE.PCFSoftShadowMap; // Optional: Softer shadows
        window.renderer = this.renderer; // Assign to global AND instance

        // 3. Setup PointerLockControls
        if (typeof THREE.PointerLockControls === 'undefined') {
             console.error("!!! THREE.PointerLockControls not found! Check index.html script order.");
             stateMachine.transitionTo('loading', { message: 'FATAL: Controls Library Failed!', error: true }); return;
        }
        // Pass THIS camera instance to the controls
        this.controls = new THREE.PointerLockControls(this.camera, this.renderer.domElement); window.controls = this.controls; // Assign to global AND instance
        this.controls.addEventListener('lock', () => {
            // Only lock cursor styling if actually playing
            if(stateMachine?.is('playing') && UIManager?.gameUI) { UIManager.gameUI.style.cursor = 'none'; }
             // Resume Audio Context on lock (essential for user interaction requirement)
            const audioListener = window.listener; // Access global listener
            if (audioListener && audioListener.context && audioListener.context.state === 'suspended') {
                console.log('AudioContext suspended, attempting to resume...');
                audioListener.context.resume().then(() => console.log('AudioContext resumed.')).catch(e => console.error('Error resuming AC:', e));
            }
        });
        this.controls.addEventListener('unlock', () => {
            // Reset cursor when unlocked
            if(UIManager?.gameUI) { UIManager.gameUI.style.cursor = 'default'; }
             // If playing and unlocked, transition to pause/menu? (Optional future feature)
             // if (stateMachine?.is('playing')) {
             //     // stateMachine.transitionTo('paused'); // Example
             // }
        });
        // Add the controls' object (which CONTAINS the camera) to THIS scene instance
        this.scene.add(this.controls.getObject()); // Camera is a child of this object

        // 4. Setup Scene Lighting (Add lights to THIS scene instance)
        this.scene.add(new THREE.AmbientLight(0x606070, 1.0)); // Ambient light
        const dirLight = new THREE.DirectionalLight(0xffffff, 1.2); // Increased intensity
        dirLight.position.set(40, 50, 30);
        dirLight.castShadow = true;
        dirLight.shadow.mapSize.width = 2048; dirLight.shadow.mapSize.height = 2048;
        dirLight.shadow.camera.near = 1; dirLight.shadow.camera.far = 150; // Adjusted shadow camera range
        dirLight.shadow.camera.left = -60; dirLight.shadow.camera.right = 60;
        dirLight.shadow.camera.top = 60; dirLight.shadow.camera.bottom = -60;
        dirLight.shadow.bias = -0.001; // Adjust shadow bias to prevent artifacts
        this.scene.add(dirLight);
        // this.scene.add( new THREE.CameraHelper( dirLight.shadow.camera ) ); // Optional: Visualize shadow camera
        const hemisphereLight = new THREE.HemisphereLight( 0x87CEEB, 0x404020, 0.6 ); // Sky/Ground light
        this.scene.add( hemisphereLight );

        // 5. Initialize Input System
        if (!Input.init(this.controls)) { stateMachine.transitionTo('loading', { message: 'Input Init Failed!', error: true }); return; }

        // 6. Initialize Effects System (Pass THIS scene and camera instances)
        if (!Effects.initialize(this.scene, this.camera)) { stateMachine.transitionTo('loading', { message: 'Effects Init Failed!', error: true }); return; }

        // 7. Physics: Not needed, map collision relies on loaded mapMesh

        // 8. Setup Asset Loaders
        stateMachine.transitionTo('loading', { message: 'Preparing Asset Loaders...' });
        this.setupLoaders(); // Uses global window.loader etc.

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
             console.error("!!! THREE.DRACOLoader or THREE.GLTFLoader constructors not found! Check index.html script order.");
             stateMachine.transitionTo('loading', { message: 'FATAL: GFX Loader Failed!', error: true }); return;
        }
        // Use global loaders defined in config.js scope
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
        // Map visual mesh (mapMesh) is loaded by LoadManager and added to scene. Collision uses this mesh.
        this.attemptProceedToGame(); // Check prerequisites again
    }

    onLoadError(errorData) {
        console.error("[Game] Asset Load Manager reported 'error':", errorData.message);
        stateMachine?.transitionTo('loading', { message: `Asset Load Failed!<br/>${errorData.message}`, error: true });
    }

    // --- Check Prerequisites & Transition Logic ---
    attemptProceedToGame() {
        this.attemptCounter++;
        const callCount = this.attemptCounter;

        // Access global flags and check for mapMesh
        const assetsReady = window.assetsAreReady;
        const networkReady = window.networkIsInitialized;
        const initDataPresent = !!window.initializationData; // Use the global var
        const mapMeshReady = !!window.mapMesh; // Check if the map VISUAL mesh is loaded

        console.log(`[Game attempt #${callCount}] Checking prerequisites: Assets=${assetsReady}, MapMesh=${mapMeshReady}, Network=${networkReady}, InitData=${initDataPresent}, State=${stateMachine?.currentState}`);

        // Condition 1: Ready for ACTUAL GAMEPLAY? (Assets, Map Mesh, Network, AND Init Data are ready)
        // ***** REMOVED STATE CHECK HERE *****
        if (assetsReady && mapMeshReady && networkReady && initDataPresent) {
             console.log(`[Game attempt #${callCount}] Prerequisites met! Attempting to start gameplay...`);
             // Call startGamePlay - the state check is removed here because receiving initData implies we *should* start.
             // startGamePlay will handle the state transition internally.
             this.startGamePlay(window.initializationData);
             // Consume data ONLY if startGamePlay doesn't fail implicitly (it transitions state)
             if (stateMachine?.is('playing')) {
                window.initializationData = null;
             } else {
                console.warn(`[Game attempt #${callCount}] startGamePlay was called but state did not transition to 'playing'. initData not consumed.`);
             }
        }
        // Condition 2: Ready for HOMESCREEN? (Assets, Map Mesh, Network ready, No Init Data yet, AND NOT already active)
        else if (assetsReady && mapMeshReady && networkReady && !initDataPresent &&
                 !stateMachine?.is('homescreen') && !stateMachine?.is('characterSelect') && !stateMachine?.is('joining') && !stateMachine?.is('playing'))
        {
            console.log(`[Game attempt #${callCount}] Core components ready, transitioning to Homescreen... (Current state: ${stateMachine.currentState})`);
            stateMachine?.transitionTo('homescreen'); // <<< TRANSITION TO HOMESCREEN
        }
        // Condition 3: Still waiting...
        else {
            if (stateMachine?.is('loading') && !stateMachine.options?.error) {
                let waitMsg = "Initializing...";
                if (!assetsReady) waitMsg = "Loading Assets...";
                else if (!mapMeshReady) waitMsg = "Loading Map Mesh...";
                // else if (!physicsReady) waitMsg = "Loading Physics..."; // Removed physics check
                else if (!networkReady) waitMsg = "Connecting...";
                // console.log(`[Game attempt #${callCount}] Prerequisites not met. Updating loading message: ${waitMsg}`); // Less verbose logging
                stateMachine?.transitionTo('loading', { message: waitMsg }); // Update loading message
            } else if (!stateMachine?.is('loading')) { // Only log if not in loading state
                console.log(`[Game attempt #${callCount}] Prerequisites not met or invalid state for transition. State: ${stateMachine?.currentState}, Error: ${stateMachine?.options?.error || 'none'}`);
            }
        }
    }

    // --- Start Actual Gameplay Logic ---
    startGamePlay(initData) {
        // Prevent starting if already playing
        if (stateMachine?.is('playing')) {
            console.warn("[Game] startGamePlay called while already in 'playing' state. Ignoring.");
            return;
        }
        // ***** TRANSITION TO PLAYING STATE HERE *****
        stateMachine.transitionTo('playing'); // Set state FIRST
        console.log("[Game] --- Starting Gameplay (Manual Raycasting) ---");

        this.cleanupAllPlayers(); // Ensure clean slate before adding new players
        window.localPlayerId = initData.id; // Use global scope
        console.log(`[Game] Local Player ID set: ${window.localPlayerId}`);

        for (const id in initData.players) {
            const playerData = initData.players[id]; if (!playerData) continue;

            if (id === window.localPlayerId) {
                // --- Create LOCAL Player ---
                console.log("[Game] Creating LOCAL player objects...");
                // Store lastSent values used by gameLogic's network update check
                window.players[id] = {
                    id: id, name: playerData.name, phrase: playerData.phrase,
                    health: playerData.health, isLocal: true, mesh: null,
                    x: playerData.x, y: playerData.y, z: playerData.z, rotationY: playerData.rotationY, // Current server state
                    lastSentX: playerData.x, lastSentY: playerData.y, lastSentZ: playerData.z, lastSentRotY: playerData.rotationY, // Last sent state
                };
                // window.localPlayerName = playerData.name; // Name is set in UI flow now
                // window.localPlayerPhrase = playerData.phrase; // Phrase removed from UI/config
                UIManager.updateInfo(`Playing as ${window.localPlayerName}`); // Use name set in UI
                UIManager.updateHealthBar(playerData.health);

                const playerModelAsset = window.playerModelData; // Global asset data from LoadManager
                if (playerModelAsset?.scene) {
                    try {
                        this.localPlayerMesh = playerModelAsset.scene.clone();
                        this.localPlayerMesh.scale.set(0.5, 0.5, 0.5);
                        this.localPlayerMesh.visible = false; // Player mesh is not visible in first person
                        this.localPlayerMesh.userData = { entityId: id, isPlayer: true, isLocal: true };
                        // Ensure local player mesh parts don't cast shadows that interfere with the camera view
                        this.localPlayerMesh.traverse(child => {
                            if(child.isMesh){
                                child.castShadow = false; // Usually false for local player
                                child.receiveShadow = false; // Usually false for local player
                                child.visible = false; // Keep invisible
                            }
                        });
                        // Set initial MESH position (feet level) based on server data
                        this.localPlayerMesh.position.set(playerData.x, playerData.y, playerData.z);
                        this.localPlayerMesh.rotation.set(0, playerData.rotationY, 0);
                        this.scene.add(this.localPlayerMesh);
                        window.players[id].mesh = this.localPlayerMesh; // Assign mesh to global players object
                        // console.log("[Game] Created local player GLTF mesh (hidden).");
                    } catch(e) { console.error("Error cloning/adding local player mesh:", e); }
                } else { console.error("!!! Local player model asset not found!"); }

                 const gunModelAsset = window.gunModelData; // Global asset data
                 if(gunModelAsset?.scene && this.camera) {
                     // Remove previous gunMesh if it exists (e.g., after disconnect/reconnect)
                     if (window.gunMesh) this.camera.remove(window.gunMesh);

                     window.gunMesh = gunModelAsset.scene.clone();
                     window.gunMesh.scale.set(0.3, 0.3, 0.3); // Adjusted scale
                     window.gunMesh.position.set(0.15, -0.15, -0.4); // Position relative to camera
                     window.gunMesh.rotation.set(0, Math.PI, 0); // Orient gun
                     window.gunMesh.traverse(child => { if (child.isMesh) child.castShadow = true; }); // Gun can cast shadow
                     this.camera.add(window.gunMesh); // Attach gun TO THE CAMERA
                     // console.log("[Game] Attached gun model to camera.");
                 } else if (!this.camera) {
                     console.error("!!! Cannot attach gun model: Game camera not initialized.");
                 } else { console.warn("Gun model asset not ready, cannot attach gun."); }

                 // Teleport controls/camera to start position
                 if (this.controls) {
                     const startPos = new THREE.Vector3(playerData.x, playerData.y + CONFIG.CAMERA_Y_OFFSET, playerData.z);
                     this.controls.getObject().position.copy(startPos);
                     // Ensure camera rotation matches initial server rotation
                     this.camera.rotation.set(0, playerData.rotationY, 0);
                     // Reset look direction in PointerLockControls? Not directly possible, but setting camera rotation helps.
                     // console.log("[Game] Set initial camera position and rotation.");
                 }


            } else {
                // --- Create REMOTE Player ---
                // console.log(`[Game] Creating REMOTE player objects for ${playerData.name || id}...`);
                const remotePlayer = new ClientPlayer(playerData); // ClientPlayer constructor uses global scene, sets mesh pos/rot
                window.players[id] = remotePlayer; // Assign to global players object

                if (!remotePlayer.mesh) {
                     console.warn(`Remote player ${id} mesh failed to load.`);
                }
            }
            // Initialize velocity and grounded state for ALL players (local and remote)
            this.playerVelocities[id] = new THREE.Vector3(0, 0, 0);
            this.playerIsGrounded[id] = false; // Assume airborne initially, will be checked/updated
        }
         console.log("[Game] Finished initial player processing.");
    }

    // --- Player Cleanup ---
    cleanupPlayer(playerId) {
        const player = window.players[playerId]; // Use global players
        // Remove visual mesh
        if (player?.mesh && this.scene) {
            this.scene.remove(player.mesh);
            // Proper disposal if ClientPlayer doesn't handle it
            if (player instanceof ClientPlayer) {
                 player.remove(); // ClientPlayer.remove should handle disposal
            } else {
                // Manual disposal for local player mesh if needed (shouldn't be necessary)
            }
             player.mesh = null;
        }
        // Remove from global players map
        if (window.players[playerId]) delete window.players[playerId];

        // Clear local player references if it's the local player
        if(playerId === window.localPlayerId) { this.localPlayerMesh = null; }

        // Clean up manual physics state maps
        if (this.playerVelocities[playerId]) delete this.playerVelocities[playerId];
        if (this.playerIsGrounded.hasOwnProperty(playerId)) delete this.playerIsGrounded[playerId];
     }

     cleanupAllPlayers() {
         console.log("[Game] Cleaning up all player objects (Manual Raycasting)...");
         const playerIds = Object.keys(window.players); // Use global players
         playerIds.forEach(id => this.cleanupPlayer(id));
         window.localPlayerId = null; this.localPlayerMesh = null;
         this.playerVelocities = {}; this.playerIsGrounded = {}; window.players = {}; // Reset state maps & global players
         console.log("[Game] Player cleanup finished.");
     }

    // --- Main Update Loop (Manual Raycasting) ---
    update() {
        requestAnimationFrame(this.update.bind(this));
        if (!this.clock || !this.renderer || !this.scene || !this.camera || !window.mapMesh) return; // Ensure map mesh is ready too

        const deltaTime = this.clock.getDelta();
        // Clamp delta time to prevent massive jumps if the tab loses focus or frame rate drops significantly
        const clampedDeltaTime = Math.min(deltaTime, 0.05); // Max step 50ms (20 FPS)

        if (stateMachine.is('playing')) {

            // --- 1. Update Local Player Input & Intent (Calculate Velocity Changes) ---
            if (this.localPlayerMesh && localPlayerId && this.playerVelocities[localPlayerId]) {
                updateLocalPlayerInput(clampedDeltaTime, this.camera, this.localPlayerMesh);
            }

            // --- 2. Apply Physics & Collision (Local Player) ---
            if (this.localPlayerMesh && localPlayerId && this.playerVelocities[localPlayerId]) {
                // This function now handles gravity, collision checks, and updates mesh position
                this.playerIsGrounded[localPlayerId] = checkPlayerCollisionAndMove(
                    this.localPlayerMesh,
                    this.playerVelocities[localPlayerId],
                    clampedDeltaTime
                );
            }

            // --- 3. Update Remote Players (Interpolation & Basic Simulation) ---
            for (const id in window.players) {
                if (id === localPlayerId) continue; // Skip local player
                const player = window.players[id];
                const playerMesh = player?.mesh;
                const playerVelocity = this.playerVelocities[id]; // Remote players also have velocity for shockwaves etc.

                if (player instanceof ClientPlayer && playerMesh && playerVelocity) {
                    try {
                        // Apply simple physics simulation ONLY if velocity is non-negligible (e.g. after shockwave)
                        if (playerVelocity.lengthSq() > 0.01) {
                             // Apply gravity to remote players too (simplistic simulation)
                            if (!this.playerIsGrounded[id]) { // Crude grounded check
                                playerVelocity.y -= (CONFIG?.GRAVITY_ACCELERATION ?? 28.0) * clampedDeltaTime;
                            }
                            playerMesh.position.addScaledVector(playerVelocity, clampedDeltaTime);
                            // Simple ground plane check for remote players to stop falling through floor
                             if (playerMesh.position.y < 0) { // Assuming 0 is ground level for simplicity
                                playerMesh.position.y = 0;
                                playerVelocity.y = 0;
                                this.playerIsGrounded[id] = true;
                             } else {
                                 this.playerIsGrounded[id] = false; // Crude check
                             }
                            playerVelocity.multiplyScalar(0.98); // Dampen velocity quickly
                        }

                        // Interpolate mesh position towards the latest known server position
                        playerMesh.position.lerp(new THREE.Vector3(player.serverX, player.serverY, player.serverZ), this.interpolationFactor);

                        // Interpolate mesh rotation towards the latest known server rotation
                        const targetQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), player.serverRotY);
                        playerMesh.quaternion.slerp(targetQuat, this.interpolationFactor);

                    } catch(e) { console.error(`Error updating remote player ${id}:`, e); }
                }
            }


            // --- 4. Update Camera Position/Rotation (Based on Controls) ---
            // PointerLockControls automatically handles camera rotation based on mouse input.
            // We need to position the *controls object* (camera's parent) based on the local player mesh position.
            if (this.localPlayerMesh && this.camera && this.controls) {
                 try {
                     // Camera's PARENT object position should follow the mesh's FEET position + offset
                     const targetCameraParentPos = this.localPlayerMesh.position.clone();
                     targetCameraParentPos.y += CONFIG.CAMERA_Y_OFFSET; // Add eye height offset FROM FEET
                     this.controls.getObject().position.copy(targetCameraParentPos);

                 } catch(e) { console.error("Error updating camera/controls position:", e); }
            }

            // --- 5. Send Network Update (Local Player State) ---
            // This function checks if enough movement/rotation occurred before sending
            sendLocalPlayerUpdateIfNeeded(this.localPlayerMesh, this.camera);

            // --- 6. Update Effects ---
            Effects?.update(deltaTime); // Use original deltaTime for effects timing?

        } // End if(stateMachine.is('playing'))

        // --- Render Scene ---
        if (this.renderer && this.scene && this.camera) {
            this.renderer.render(this.scene, this.camera);
        }
    } // End Update Loop

} // End Game Class

// --- Global Initialization Trigger ---
document.addEventListener('DOMContentLoaded', () => {
    // Physics engine check removed
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
console.log("game.js loaded (Manual Raycasting v2 - Joining Fix)");
// --- END OF FULL game.js FILE (Manual Raycasting v2 - Joining Fix) ---
