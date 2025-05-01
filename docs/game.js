// Docs/game.js
// Manual Raycasting - Delta Time Log (with DEBUG logging)

console.log('game.js loaded (Manual Raycasting - Delta Time Log)');

// Assuming THREE is global or imported
// import * as THREE from 'three'; // Or your path

class Game {
    constructor() {
        console.log('[DEBUG] Game constructor called.');
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.stateMachine = null;
        this.inputManager = null;
        this.uiManager = null;
        this.loadManager = null;
        this.networkManager = null;
        this.gameLogic = null;
        this.effectManager = null;

        this.entities = new Map(); // Store players, potentially bullets, etc.
        this.localPlayerId = null;
        this.localPlayer = null; // Direct reference to the local player entity
        this.mapMesh = null; // Reference to the loaded map mesh

        this.clock = new THREE.Clock();
        this.lastTimestamp = 0;

        this.config = window.gameConfig || {}; // Load from config.js

        // Bind the update loop method to this instance
        this._update = this._update.bind(this);

         // Prerequisites flags
        this.assetsReady = false;
        this.mapMeshReady = false;
        this.networkReady = false; // True when connected and received initial data
        this.initDataReceived = false; // Specifically tracks if server init data arrived
    }

    async initialize() {
        console.log('--- Game Init Sequence (Manual Raycasting) ---');

        // 0. State Machine
        this.stateMachine = new StateMachine(this);
        this.stateMachine.transitionTo('loading', 'Initializing Core...');

        // 1. UI Manager (for loading screen updates)
        this.uiManager = new UIManager(this);
        this.uiManager.initialize();
        console.log('[UIManager] Initialized successfully.');
        this.uiManager.bindStateListeners(); // Needs stateMachine
        console.log('[UIManager] State listeners bound successfully.');

        // 2. Basic Graphics Setup
        this.stateMachine.transitionTo('loading', 'Setting Up Graphics...');
        this.setupGraphics();

        // 3. Input Manager
        // Pass the renderer's DOM element (canvas) to InputManager
        this.inputManager = new InputManager(this.renderer.domElement);
        this.inputManager.bindEventListeners(); // !! IMPORTANT !!
        console.log('[Input] Initialized (Using Global THREE).');


        // 4. Effect Manager (Audio Listener needs camera)
        this.effectManager = new EffectManager(this.camera);
        console.log('[Effects] Initialized (Explosion Added, Sound Ready).');

        // 5. Load Manager
        this.stateMachine.transitionTo('loading', 'Preparing Asset Loaders...');
        this.loadManager = new LoadManager(this); // Pass game instance if needed
        console.log('[LoadManager] Initialized (Uses Global THREE/Scope - v5 Add Map to Scene).');
        await this.loadInitialAssets(); // Start loading assets

        // 6. Network Manager
        this.stateMachine.transitionTo('loading', 'Connecting to Server...');
        this.networkManager = new NetworkManager(this); // Pass game instance
        this.networkManager.connect();
        console.log('[Network] Initialized and requesting connection.');

         // 7. Game Logic (Physics, Raycasting)
         // Needs access to entities, map mesh etc, maybe initialized later
         this.gameLogic = new GameLogic(this); // Pass game instance
         console.log('[GameLogic] Initialized (Manual Raycasting v6 - Simplified Collision).');


        console.log('--- Game Init Sequence Complete (Waiting for Assets/Network/InitData) ---');
        // The game loop will start checking prerequisites
        this._update(); // Start the loop
    }

     async loadInitialAssets() {
        this.stateMachine.transitionTo('loading', 'Loading Game Assets...');
        try {
            await this.loadManager.loadAssets([
                { name: 'map', type: 'gltf', path: 'assets/maps/the first map!.glb' },
                { name: 'playerModel', type: 'gltf', path: 'assets/maps/Shawty1.glb' },
                { name: 'gunModel', type: 'gltf', path: 'assets/maps/gun2.glb' },
                { name: 'gunSound', type: 'audio', path: 'assets/maps/gunshot.wav' }
                 // Add other essential assets
            ]);
            console.log('[Game] Asset Load Manager reported \'ready\'.');
            this.assetsReady = true;
            this.checkPrerequisites(); // Check if we can proceed
        } catch (error) {
            console.error("Asset loading failed:", error);
            this.stateMachine.transitionTo('error', 'Asset loading failed');
        }
    }


    setupGraphics() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x87CEEB); // Sky blue background

        const width = window.innerWidth;
        const height = window.innerHeight;

        this.camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
        this.camera.position.set(0, 1.8, 5); // Adjust as needed
         // Add AudioListener for effects
        if (this.effectManager && this.effectManager.listener) {
            this.camera.add(this.effectManager.listener);
             console.log("[Effects] AudioListener attached to camera.");
        }


        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(width, height);
        this.renderer.shadowMap.enabled = true; // Enable shadows if needed

        document.body.appendChild(this.renderer.domElement);

        // Basic Lighting
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
        this.scene.add(ambientLight);

        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(5, 10, 7);
        directionalLight.castShadow = true;
        this.scene.add(directionalLight);

        window.addEventListener('resize', this.onWindowResize.bind(this), false);
         console.log('[Game] GLTF/DRACO Loaders Initialized.'); // Assuming LoadManager handles this
    }

    onWindowResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    // Called by NetworkManager when connection is established
    handleNetworkReady() {
        console.log('[Game] Network Manager reported connection ready.');
        this.networkReady = true;
        this.checkPrerequisites();
    }

    // Called by NetworkManager when initial game state is received
    handleInitializationData(data) {
        console.log('[Game] Received initialization data:', data);
        this.localPlayerId = data.playerId;
        // Potentially receive initial positions of other players, map info etc.
        // ... handle other initial data ...

        this.initDataReceived = true;
        console.log(`[Game] Local Player ID set: ${this.localPlayerId}`);

        // Now that we have the ID, create the local player entity
        // We might need assets to be ready first depending on the PlayerEntity constructor
        if (this.assetsReady) {
             this.createLocalPlayer(this.localPlayerId);
        }
        // If assets aren't ready, createLocalPlayer should be called when assets ARE ready

        this.checkPrerequisites();
    }

    // Called by LoadManager when the map GLTF is processed
    handleMapMeshLoaded(mesh) {
        console.log('[Game] Load Manager reported map mesh loaded.');
        this.mapMesh = mesh;
        this.scene.add(this.mapMesh); // Add map to the scene
        this.mapMesh.traverse(node => { // Enable shadows for map objects
            if (node.isMesh) {
                node.castShadow = true;
                node.receiveShadow = true;
            }
        });
        this.mapMeshReady = true;
        console.log('[Game] Map Mesh added to scene.');
        this.checkPrerequisites();
    }


    checkPrerequisites(attempt = 1) {
        const currentState = this.stateMachine ? this.stateMachine.currentState : 'unknown';
        console.log(`[Game attempt #${attempt}] Checking prerequisites: Assets=${this.assetsReady}, MapMesh=${this.mapMeshReady}, Network=${this.networkReady}, InitData=${this.initDataReceived}, State=${currentState}`);

        // Only proceed if in a state waiting for game start (e.g., loading, joining)
        if (currentState !== 'loading' && currentState !== 'joining') {
            console.log(`[Game attempt #${attempt}] Prerequisites check skipped, state is ${currentState}`);
            return;
        }

         // We need assets (like player model), the network connection, AND the initial data (like player ID)
        if (this.assetsReady && this.mapMeshReady && this.networkReady && this.initDataReceived) {
            console.log(`[Game attempt #${attempt}] Prerequisites met. Attempting to start gameplay...`);

            // Ensure local player is created if not already (might happen if init data arrived before assets)
            if (!this.localPlayer && this.localPlayerId) {
                 this.createLocalPlayer(this.localPlayerId);
            }

             if (this.localPlayer) {
                 this.stateMachine.transitionTo('playing'); // Transition state FIRST
                 this.startGameplay(); // Then run setup for that state
             } else {
                 console.error("[Game] Prerequisites met, but local player object not created! Cannot start gameplay.");
                 // Potential issue: PlayerEntity creation failed?
                 this.stateMachine.transitionTo('error', 'Player creation failed');
             }

        } else {
            console.log(`[Game attempt #${attempt}] Prerequisites not yet met. Waiting...`);
            // Optionally, update loading UI
             if (this.uiManager) {
                 let msg = "Waiting for: ";
                 if (!this.assetsReady) msg += "Assets...";
                 else if (!this.mapMeshReady) msg += "Map Mesh...";
                 else if (!this.networkReady) msg += "Server Connection...";
                 else if (!this.initDataReceived) msg += "Initialization Data...";
                 this.uiManager.updateLoadingMessage(msg);
             }
        }
    }


     createLocalPlayer(playerId) {
        if (this.entities.has(playerId)) {
            console.warn(`[Game] Attempted to create local player ${playerId}, but entity already exists.`);
            this.localPlayer = this.entities.get(playerId); // Ensure localPlayer ref is set
            return;
        }

        console.log(`[Game] Creating local player entity for ID: ${playerId}`);
        try {
            // Assume PlayerEntity constructor needs necessary assets/config
            const playerModelData = this.loadManager.getAsset('playerModel'); // Get model data
            const config = { /* player config */ };

            if (!playerModelData || !playerModelData.scene) {
                throw new Error("Player model asset not loaded or invalid.");
            }

            const newPlayer = new PlayerEntity(
                playerId,
                true, // isLocal
                this, // Pass game instance
                playerModelData.scene.clone(), // Clone the model scene
                config
            );

            this.entities.set(playerId, newPlayer);
            this.localPlayer = newPlayer; // Set direct reference
            this.scene.add(newPlayer.mesh); // Add player mesh to scene
             console.log(`[Game] Local Player ${playerId} created and added to scene.`);

             // Initialize physics state ONLY after creation and adding to scene
             this.gameLogic.initializePhysicsState(newPlayer);
             console.log(`[Game] Initializing physics state for player ${playerId}`);
             this.localPlayer.mesh.visible = true; // Make sure it's visible
             console.log(`Map Mesh Check: ${this.mapMesh ? 'true' : 'false'}`);
             if (this.mapMesh) {
                console.log(`Map Mesh has Mesh children: ${this.mapMesh.children.some(c => c.isMesh)}`);
                console.log(`Map Mesh visible: ${this.mapMesh.visible}`);
             }
             console.log('[Game] Finished initial player processing.');


        } catch (error) {
            console.error(`[Game] Error creating local player ${playerId}:`, error);
            // Handle error appropriately, maybe transition to an error state
            this.stateMachine.transitionTo('error', 'Failed to create player entity.');
        }
    }

     // Called when state transitions to 'playing'
     startGameplay() {
        console.log('[Game] --- Starting Gameplay (Manual Raycasting) ---');
         // Optional: Hide loading screen, show HUD etc. via UIManager
         this.uiManager.showHUD();
         this.uiManager.hideLoadingScreen();
         this.uiManager.hideCharacterSelect();

         // Maybe do final setup for physics, controls based on player being ready
         if (this.localPlayer) {
             console.log(`[Game] Gameplay started for local player: ${this.localPlayer.id}`);
             // Potentially center camera or setup controls specific to the player
             // this.localPlayer.setupControls(this.inputManager); // If player handles its input directly
         } else {
              console.error("[Game] !!! Tried to start gameplay but localPlayer is null !!!");
         }

         // The _update loop is already running, it will now execute the 'playing' logic.
     }


    // --- Entity Management ---
    addEntity(entity) {
        if (!entity || !entity.id) {
            console.error('[Game] Attempted to add invalid entity:', entity);
            return;
        }
        if (this.entities.has(entity.id)) {
            console.warn(`[Game] Entity with ID ${entity.id} already exists. Overwriting.`);
            // Consider cleanup of the old entity's mesh?
            const oldEntity = this.entities.get(entity.id);
            if (oldEntity.mesh) this.scene.remove(oldEntity.mesh);
        }
        this.entities.set(entity.id, entity);
        if (entity.mesh) {
             this.scene.add(entity.mesh);
             console.log(`[Game] Added entity ${entity.id} to game and scene.`);
        } else {
             console.log(`[Game] Added entity ${entity.id} to game (no mesh).`);
        }

    }

    removeEntity(entityId) {
        const entity = this.entities.get(entityId);
        if (entity) {
            console.log(`[Game] Removing entity ${entityId}`);
            if (entity.mesh) {
                this.scene.remove(entity.mesh);
                console.log(`[Game] Removed mesh for entity ${entityId}`);
                // Dispose geometry/material if necessary
                if (typeof entity.dispose === 'function') {
                     entity.dispose();
                }
            }
            this.entities.delete(entityId);

             // Clear local player reference if it's the one being removed
             if (this.localPlayer && this.localPlayer.id === entityId) {
                 console.log("[Game] Local player entity removed.");
                 this.localPlayer = null;
                 this.localPlayerId = null;
                 // Potentially transition state back to menu or connection lost
                 this.stateMachine.transitionTo('homescreen', 'Player left');
             }

        } else {
            console.warn(`[Game] Attempted to remove non-existent entity ${entityId}`);
        }
    }

     getEntity(entityId) {
         return this.entities.get(entityId);
     }

     // Central cleanup function (e.g., before restarting)
     cleanupGame() {
         console.log('[Game] Cleaning up all player objects (Manual Raycasting)...');
         // Remove all entity meshes from the scene and clear the map
         this.entities.forEach(entity => {
             if (entity.mesh) {
                 this.scene.remove(entity.mesh);
                 if (typeof entity.dispose === 'function') {
                    entity.dispose(); // Player-specific cleanup
                }
             }
         });
         this.entities.clear();
         this.localPlayer = null;
         this.localPlayerId = null;
         console.log('[Game] Player cleanup finished.');

         // Remove map mesh
         if (this.mapMesh) {
             this.scene.remove(this.mapMesh);
              // Potentially dispose map geometry/materials if loaded uniquely
             this.mapMesh = null;
             this.mapMeshReady = false;
             console.log('[Game] Map mesh removed.');
         }

         // Reset other relevant states if needed
         this.networkReady = false;
         this.initDataReceived = false;
         // Assets usually remain loaded unless explicitly unloaded
     }

    // --- Main Game Loop ---
    _update() {
        const timestamp = performance.now();
        // Calculate delta time safely, handle first frame
        const deltaTime = this.lastTimestamp > 0 ? (timestamp - this.lastTimestamp) / 1000.0 : 1 / 60; // seconds, default 60fps if first frame
        this.lastTimestamp = timestamp;

        // Enforce a maximum delta time to prevent physics explosions if the tab hangs
        const maxDeltaTime = 0.1; // 100ms (10 FPS)
        const dt = Math.min(deltaTime, maxDeltaTime);

        const currentState = this.stateMachine ? this.stateMachine.currentState : null;

        // --- DEBUG: Log loop start ---
        // console.log(`[DEBUG] Game Loop Tick | State: ${currentState} | Delta: ${dt.toFixed(4)}s`);
        // ---

         // --- DEBUG: Log Input State ---
         if (this.inputManager) {
             // Create a compact representation of pressed keys/buttons for logging
             const activeKeys = Object.entries(this.inputManager.keysPressed)
                 .filter(([key, value]) => value === true)
                 .map(([key]) => key)
                 .join(',');
             const activeMouse = Object.entries(this.inputManager.mouseButtonsPressed)
                 .filter(([btn, value]) => value === true)
                 .map(([btn]) => `Btn${btn}`)
                 .join(',');

             if (activeKeys || activeMouse) { // Only log if something is active
                 console.log(`[DEBUG] Input State | Keys: [${activeKeys}] | Mouse: [${activeMouse}] | Locked: ${this.inputManager.isPointerLocked()}`);
             }
         }
         // ---

        // Update based on game state
        if (currentState === 'playing') {
            // --- Player Updates ---
             if (this.localPlayer && this.inputManager) {
                 // --- DEBUG: Call Player Update ---
                 // console.log(`[DEBUG] Calling update for local player ${this.localPlayer.id}`);
                 // ---
                 // Pass necessary context: delta time, input state, game logic
                this.localPlayer.update(dt, this.inputManager, this.gameLogic);
             } else if (!this.localPlayer) {
                 // console.warn('[DEBUG] Game Loop: Playing state but no local player found!');
             } else if (!this.inputManager) {
                 console.warn('[DEBUG] Game Loop: Playing state but no input manager found!');
             }

            // Update remote players (usually just interpolation/animation)
            this.entities.forEach(entity => {
                if (!entity.isLocal) {
                    // Remote players might have simpler update logic
                     // entity.update(dt);
                }
            });

            // --- Physics/Game Logic Update ---
            if (this.gameLogic) {
                // --- DEBUG: Call Game Logic Update ---
                 // console.log('[DEBUG] Calling GameLogic update...');
                 // ---
                 // Pass entities and map for collision checks etc.
                 this.gameLogic.update(dt, this.entities, this.mapMesh);
            }

             // --- Bullet/Effect Updates ---
             if (this.effectManager) {
                // This might involve iterating through active bullets/particles
                // For simplicity, let's assume bullets are entities for now
                // this.effectManager.update(dt);
             }


            // --- Network Updates ---
            if (this.networkManager && this.localPlayer) {
                // Send local player state to server periodically
                this.networkManager.sendPlayerState(this.localPlayer.getState());
            }

        } else if (currentState === 'loading') {
            // Update loading screen? Check prerequisites?
            // Prerequisites are checked when assets/network events occur
        }
        // Handle other states...

        // --- Rendering ---
        if (this.renderer && this.scene && this.camera) {
            this.renderer.render(this.scene, this.camera);
        }

         // --- Input State Reset (End of Frame) ---
         if (this.inputManager) {
             // Reset per-frame input states like mouse delta
             this.inputManager.resetFrameState();
         }

        // Request the next frame
        requestAnimationFrame(this._update);
    }
}

// Make Game class available globally or manage through modules
window.Game = Game;

// --- Initial Load Confirmation ---
console.log('[Game] DOM ready. Starting Game Initialization...');
// ---

// --- Auto-Initialization ---
// Ensure this runs after the DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.currentGame = new Game();
    window.currentGame.initialize().catch(error => {
        console.error("Error during game initialization:", error);
        // Display error to user?
        if (window.currentGame && window.currentGame.uiManager) {
            window.currentGame.uiManager.showError("Fatal Error During Initialization. Check Console.");
        } else {
            alert("Fatal Error During Initialization. Check Console.");
        }
         if (window.currentGame && window.currentGame.stateMachine) {
             window.currentGame.stateMachine.transitionTo('error', 'Initialization failed');
         }
    });
});
