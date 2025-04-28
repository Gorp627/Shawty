// docs/game.js - Main Game Orchestrator (with Rapier.js - Corrected fromAxisAngle & Debug Logs)

// --- Global Flags and Data ---
let networkIsInitialized = false; let assetsAreReady = false; let initializationData = null;
var currentGameInstance = null; var groundColliderHandle = null;
var RAPIER = window.RAPIER || null; var rapierWorld = null; var rapierEventQueue = null;
window.isRapierReady = window.isRapierReady || false;

class Game {
    // --- Constructor ---
    constructor() {
        this.scene = null; this.camera = null; this.renderer = null; this.controls = null; this.clock = null;
        this.players = players; this.keys = keys; this.mapMesh = null;
        this.playerRigidBodyHandles = {}; // Stores Rapier RigidBody handles keyed by player ID
        this.mapColliderHandle = null; // Stores the Rapier Collider handle for the map
        this.rapierReady = window.isRapierReady;
        this.lastCallTime = performance.now();
        console.log("[Game] Instance created.");

        // Listen for Rapier readiness if it's not ready yet
        if (!this.rapierReady) {
            window.addEventListener('rapier-ready', () => {
                console.log("[Game] Received 'rapier-ready' event.");
                RAPIER = window.RAPIER; // Ensure global RAPIER is set
                if (!RAPIER) {
                    console.error("!!! RAPIER object is missing even after 'rapier-ready' event!");
                     if(UIManager) UIManager.showError(`Physics Load Fail! (Event)`, 'loading');
                     if(stateMachine) stateMachine.transitionTo('loading', {message:"Physics Lib Failed! (Event)", error:true});
                } else {
                    this.initializePhysics(); // Initialize physics now that Rapier is loaded
                    this.attemptProceedToGame(); // Check if we can proceed (e.g., to homescreen)
                }
            }, { once: true });
        } else {
             // Rapier was already ready when the game instance was created
             if (!window.RAPIER) {
                 console.error("!!! RAPIER flag true, but global RAPIER object is missing!");
                 if(UIManager) UIManager.showError(`Physics Load Fail! (Flag)`, 'loading');
                 if(stateMachine) stateMachine.transitionTo('loading', {message:"Physics Lib Failed! (Flag)", error:true});
             } else {
                 RAPIER = window.RAPIER; // Ensure global is set
                 this.initializePhysics();
                 console.log("[Game] Rapier was ready on construct.");
             }
        }
    }

    // --- Start Method ---
    start() {
        console.log("[Game] Starting game initialization...");
        // Reset state variables
        networkIsInitialized = false;
        assetsAreReady = false;
        initializationData = null;
        this.mapMesh = null;
        this.playerRigidBodyHandles = {};
        this.mapColliderHandle = null;
        // Note: rapierWorld and rapierEventQueue are initialized in initializePhysics
        this.lastCallTime = performance.now();

        if (!this.initializeThreeJS()) { return; } // Stop if Three.js fails
        if (!this.initializeManagers()) { return; } // Stop if managers fail
        if (!this.initializeNetwork()) { return; } // Stop if network setup fails

        this.bindLoadManagerListeners();
        this.bindOtherStateTransitions();
        this.addEventListeners();

        console.log("[Game] Triggering Asset loading and waiting for Rapier...");
        this.startAssetLoading(); // Start loading map/player models

        // Initial state transition
        if(stateMachine) stateMachine.transitionTo('loading', {message:"Initializing..."});
        else console.error("!!! stateMachine is missing during start!");

        this.animate(); // Start the main loop
        console.log("[Game] Basic setup complete. Waiting for assets and Rapier...");
    }

     // --- Separate Three.js Initialization ---
    initializeThreeJS() {
        console.log("[Game] Initializing Three.js...");
        try {
            this.scene = new THREE.Scene(); scene = this.scene; // Assign to global
            this.scene.background = new THREE.Color(0x6699cc);
            this.scene.fog = new THREE.Fog(0x6699cc, 10, 250); // Adjusted fog range

            this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
            camera = this.camera; // Assign to global
            // Initial camera position will be set relative to player later

            this.clock = new THREE.Clock(); clock = this.clock; // Assign to global

            const canvasElement = document.getElementById('gameCanvas');
            if (!canvasElement) throw new Error("Required canvas element #gameCanvas not found in HTML!");
            this.renderer = new THREE.WebGLRenderer({ canvas: canvasElement, antialias: true });
            renderer = this.renderer; // Assign to global
            this.renderer.setSize(window.innerWidth, window.innerHeight);
            this.renderer.shadowMap.enabled = true; // Enable shadows

            // Pointer Lock Controls
            this.controls = new THREE.PointerLockControls(this.camera, document.body);
            controls = this.controls; // Assign to global
            this.controls.addEventListener('lock', ()=>{console.log('[Controls] Pointer Locked');});
            this.controls.addEventListener('unlock', ()=>{console.log('[Controls] Pointer Unlocked');});
            // We'll move the camera itself in the animate loop based on the player body

            // GLTF Loader Setup
            dracoLoader = new THREE.DRACOLoader();
            dracoLoader.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/libs/draco/'); // Path to Draco decoder files
            dracoLoader.setDecoderConfig({ type: 'js' }); // Use JS decoder
            dracoLoader.preload(); // Preload the decoder module
            loader = new THREE.GLTFLoader(); // Assign to global
            loader.setDRACOLoader(dracoLoader);

            // Lighting
            const ambientLight = new THREE.AmbientLight(0xffffff, 0.6); // Softer ambient
            scene.add(ambientLight);
            const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8); // Slightly less intense directional
            directionalLight.position.set(20, 30, 15);
            directionalLight.castShadow = true;
            directionalLight.shadow.mapSize.width = 1024; // Shadow map resolution
            directionalLight.shadow.mapSize.height = 1024;
            directionalLight.shadow.camera.near = 0.5;
            directionalLight.shadow.camera.far = 100;
            directionalLight.shadow.camera.left = -50;
             directionalLight.shadow.camera.right = 50;
             directionalLight.shadow.camera.top = 50;
             directionalLight.shadow.camera.bottom = -50;
            scene.add(directionalLight);
            scene.add(directionalLight.target); // Needed for directional light targeting

            console.log("[Game] Three.js initialized successfully.");
            return true;
        } catch(e) {
            console.error("!!! CRITICAL Three.js Initialization Error:", e);
            UIManager?.showError(`FATAL: Graphics Init!<br/>${e.message}`, 'loading');
             if(stateMachine) stateMachine.transitionTo('loading', {message:"GFX Init Failed!", error:true});
            return false;
        }
    }

    // --- Separate Physics Initialization ---
    initializePhysics() {
        if (!RAPIER) { console.error("!!! Cannot initialize physics: RAPIER object is missing!"); return false; }
        if (rapierWorld) { console.warn("[Game] Physics already initialized. Skipping."); return true; }
        console.log("[Game] Initializing Rapier Physics Engine...");
        try {
            const gravityVector = new RAPIER.Vector3(0.0, CONFIG?.GRAVITY ?? -25.0, 0.0);
            rapierWorld = new RAPIER.World(gravityVector);
            if (!rapierWorld) throw new Error("Failed to create Rapier World.");

            rapierEventQueue = new RAPIER.EventQueue(true); // Enable contact/intersection event reporting if needed later
            if (!rapierEventQueue) throw new Error("Failed to create Rapier EventQueue.");

            console.log("[Game] Rapier world and event queue created successfully.");
            // Ground/Map collider is created *after* the map asset loads (see bindLoadManagerListeners)
            return true;
        } catch (e) {
            console.error("!!! CRITICAL Rapier Initialization Error:", e);
            rapierWorld = null; // Ensure they are null on failure
            rapierEventQueue = null;
            if(UIManager) UIManager.showError(`FATAL: Physics Init!<br/>${e.message}`, 'loading');
            if(stateMachine) stateMachine.transitionTo('loading', {message:"Physics Init Failed!", error:true});
            return false;
        }
    }

    // --- Initialize Network ---
    initializeNetwork() {
        console.log("[Game] Initializing Network connection...");
        if (typeof Network?.init === 'function') {
            try {
                Network.init(); // Calls Network.setupSocketIO()
                console.log("[Game] Network initialization called.");
                return true;
            } catch (e) {
                console.error("!!! Network Initialization Error:", e);
                if(stateMachine) stateMachine.transitionTo('loading', { message: `FATAL: Net Init!<br/>${e.message}`, error: true });
                return false;
            }
        } else {
            console.error("!!! Network object or init function is missing!");
            if(stateMachine) stateMachine.transitionTo('loading', { message: `FATAL: Net Code Failed!`, error: true });
            return false;
        }
    }

    // --- Setup Asset Loading Listeners ---
    bindLoadManagerListeners() {
        if (!loadManager) {
            console.error("!!! LoadManager is missing! Cannot bind listeners.");
             if(stateMachine) stateMachine.transitionTo('loading',{message:"FATAL: Load Mgr Missing!", error:true});
            return;
        }
        loadManager.on('ready', () => {
            console.log("[Game] LoadManager 'ready' event received. All required assets loaded.");
            assetsAreReady = true;
            this.mapMesh = loadManager.getAssetData('map'); // Get the loaded map Object3D

            if (!this.mapMesh) {
                console.error("!!! Map data missing from LoadManager even after 'ready' event!");
                if(stateMachine) stateMachine.transitionTo('loading', { message: "FATAL: Map Data Load Error!", error: true });
                return;
            }
            console.log("[Game] Visual map mesh stored.");
            if(scene && !this.mapMesh.parent) { // Add visual map to scene if not already added
                 scene.add(this.mapMesh);
                 console.log("[Game] Added visual map mesh to the scene.");
             }

            // --- Create Rapier Map Collider ---
            // This needs to happen AFTER Rapier is ready AND map is loaded
            if (RAPIER && rapierWorld && this.mapMesh && this.mapColliderHandle === null) {
                try {
                    console.log("[Game] Creating Rapier trimesh collider for the map...");
                    let foundGeometry = false;
                    this.mapMesh.traverse((child) => {
                        // Find the first suitable mesh with geometry
                        if (!foundGeometry && child.isMesh && child.geometry) {
                            let geometry = child.geometry;
                            let vertices = geometry.attributes.position.array;
                            let indices = geometry.index ? geometry.index.array : null;

                            if (!vertices) throw new Error(`Mesh '${child.name || 'unnamed'}' has no vertex data!`);

                            console.log(`[Game] Found map geometry in mesh: ${child.name || '?'}. Vertices: ${vertices.length / 3}${indices ? `, Indices: ${indices.length / 3}` : ', No Indices (using vertices directly)'}.`);

                            let colliderDesc;
                            if (indices) {
                                colliderDesc = RAPIER.ColliderDesc.trimesh(vertices, indices);
                            } else {
                                // If no indices, Rapier expects vertices grouped into triangles
                                // This might not be correct for all models without indices.
                                console.warn(`[Game] Map geometry '${child.name || '?'}' lacks indices. Creating trimesh from vertices; this might be incorrect if vertices aren't ordered triangle-wise.`);
                                colliderDesc = RAPIER.ColliderDesc.trimesh(vertices);
                            }

                            colliderDesc.setFriction(0.7).setRestitution(0.1); // Set physics properties

                            // Create the collider and store its handle
                            let collider = rapierWorld.createCollider(colliderDesc);
                            if (!collider) throw new Error("Rapier world failed to create map collider.");
                            this.mapColliderHandle = collider.handle; // Store the handle

                            console.log(`[Game] Successfully created Rapier map collider with handle: ${this.mapColliderHandle}`);
                            foundGeometry = true; // Stop after finding the first mesh
                        }
                    });

                    if (!foundGeometry) {
                        console.error("!!! No suitable mesh with geometry found within the loaded map asset to create a collider!");
                        // Don't necessarily fail the whole game, but physics won't work correctly.
                        // Maybe transition to an error state or show a warning?
                        UIManager?.showError("Map Physics Failed (No Mesh)!", 'loading');
                         if(stateMachine) stateMachine.transitionTo('loading', {message:"Map Physics Failed!", error:true});
                         return; // Stop further processing here if map physics fails
                    }
                } catch(e) {
                    console.error("!!! Error creating Rapier map collider:", e);
                     this.mapColliderHandle = null; // Ensure handle is null on error
                     if(stateMachine) stateMachine.transitionTo('loading', { message: `FATAL: Map Physics!<br/>${e.message}`, error: true });
                     return;
                }
            } else {
                 // This case could happen if assets load *before* Rapier is ready, or if map failed to load
                 console.warn(`[Game] Cannot create map collider yet. RapierReady=${!!RAPIER}, WorldReady=${!!rapierWorld}, MapMeshReady=${!!this.mapMesh}, ColliderExists=${this.mapColliderHandle !== null}`);
                 // We just wait for Rapier to be ready, then attemptProceedToGame will be called again.
             }

            this.attemptProceedToGame(); // Check if we can move to homescreen/game
        });

        loadManager.on('error', (errorData) => {
            console.error("!!! LoadManager reported an error:", errorData);
            assetsAreReady = false;
            this.mapMesh = null;
            // If map collider was created, maybe remove it? Or just prevent game start.
            // For now, just transition to an error state.
            if(stateMachine) stateMachine.transitionTo('loading',{message:`FATAL: Asset Load Error!<br/>${errorData.message||'Unknown asset error'}`,error:true});
        });
        console.log("[Game] LoadManager event listeners bound.");
    }

     // --- Check if all prerequisites for starting gameplay are met ---
    attemptProceedToGame() {
        const rapierIsSetup = !!RAPIER && !!rapierWorld && this.mapColliderHandle !== null && this.mapColliderHandle !== undefined;
        console.log(`[Game] Checking prerequisites to proceed: RapierSetup=${rapierIsSetup}, AssetsReady=${assetsAreReady}, NetworkInitialized=${networkIsInitialized}, InitializationDataReceived=${!!initializationData}`);

        if (rapierIsSetup && assetsAreReady && networkIsInitialized && initializationData) {
            // All conditions met to start the actual game
            console.log("[Game] All prerequisites met -> Starting gameplay...");
            if (this.startGamePlay) { // Check if method exists on current instance
                 this.startGamePlay(initializationData);
             } else {
                 console.error("!!! startGamePlay method is missing on the game instance!");
                 // Handle this critical error, maybe reset state
                 if(stateMachine) stateMachine.transitionTo('loading',{message:'Internal Game Error!', error:true});
             }
        } else if (rapierIsSetup && assetsAreReady && stateMachine?.is('loading')) {
             // Core components (physics, assets) are ready, but network/server data isn't yet.
             // Safe to transition to the Homescreen.
             console.log("[Game] Core components ready -> Transitioning to Homescreen");
             let currentPCount = '?';
             if(UIManager?.playerCountSpan) currentPCount = UIManager.playerCountSpan.textContent ?? '?';
             stateMachine.transitionTo('homescreen', { playerCount: currentPCount });
        } else {
             // Still waiting for something (Rapier, Assets, Network connection, or Server Init data)
             console.log(`[Game] Still waiting for prerequisites. Current state: ${stateMachine?.currentState || 'unknown'}`);
             // No state change needed here, wait for other events (Rapier ready, Assets ready, Network connect/initialize)
        }
    }

    // --- Initialize Managers ---
    initializeManagers() {
        console.log("[Game] Initializing Managers (UI, Input, StateMachine, LoadManager, Network, Effects)...");
        // Check if managers are loaded (they should be globals from script tags)
        if(!UIManager || !Input || !stateMachine || !loadManager || !Network || !Effects) {
             console.error("!!! One or more required managers are undefined!");
             UIManager?.showError("FATAL: Core Manager Load!", 'loading'); // Attempt to show error even if UIManager might be the missing one
             if(stateMachine) stateMachine.transitionTo('loading', {message:"FATAL: Mgr Load Fail!", error:true});
             return false;
         }
        try {
             // Initialize each manager
             if(!UIManager.initialize()) throw new Error("UIManager initialization failed");
             if(!Input.init(this.controls)) throw new Error("Input initialization failed (requires controls)"); // Pass controls ref
             Effects.initialize(this.scene); // Pass scene ref

             console.log("[Game] Managers initialized successfully.");
             return true;
        } catch (e) {
             console.error("!!! Error initializing managers:", e);
             UIManager?.showError(`FATAL: Manager Setup!<br/>${e.message}`, 'loading');
             if(stateMachine) stateMachine.transitionTo('loading', {message:"FATAL: Mgr Setup Fail!", error:true});
             return false;
        }
    }

    // --- Bind State Transitions ---
    bindOtherStateTransitions() {
        if(UIManager?.bindStateListeners) UIManager.bindStateListeners(stateMachine);
        else console.error("!!! UIManager or bindStateListeners method missing!");

        if (stateMachine) {
            stateMachine.on('transition', (data) => { // Listen to generic transition event
                const fromState = data.from;
                const toState = data.to;
                console.log(`[Game State Listener] Transition detected: ${fromState} -> ${toState}`);

                // --- Cleanup Logic when leaving 'playing' or 'joining' ---
                if ((fromState === 'playing' || fromState === 'joining') && (toState === 'homescreen' || toState === 'loading')) {
                    console.log(`[Game State] Cleaning up physics and player state after leaving ${fromState}...`);

                    // Remove all player rigid bodies from Rapier world
                    for (const playerId in this.playerRigidBodyHandles) {
                         const handle = this.playerRigidBodyHandles[playerId];
                         if (rapierWorld && handle !== undefined && handle !== null) {
                             try {
                                 let body = rapierWorld.getRigidBody(handle);
                                 if (body) {
                                     rapierWorld.removeRigidBody(body);
                                     // console.log(`Removed Rapier body handle ${handle} for player ${playerId}`);
                                 } else {
                                     // console.warn(`Could not find body for handle ${handle} during cleanup.`);
                                 }
                             } catch (e) {
                                 console.error(`Error removing rigid body handle ${handle} for player ${playerId}:`, e);
                             }
                         }
                    }
                    this.playerRigidBodyHandles = {}; // Clear the handles map

                    // Remove visual meshes (handled by _removePlayer in Network, called below)

                    // Remove non-local players from client state and scene
                    for (const id in players) {
                        if (id !== localPlayerId && typeof Network?._removePlayer === 'function') {
                             Network._removePlayer(id); // Calls player.remove() and deletes from players object
                        }
                    }
                     // Clear local player reference
                     if(players?.[localPlayerId]) {
                         // Don't remove local player mesh if it exists (often it doesn't)
                         delete players[localPlayerId];
                     }
                     players = {}; // Reset global players object

                     localPlayerId = null; // Reset local player ID

                     // Reset network/init flags
                     networkIsInitialized = false; // Needs re-init on next join attempt
                     initializationData = null;

                     // Unlock controls if locked
                     if (controls?.isLocked) {
                         controls.unlock();
                         console.log("[Game State] Unlocked pointer controls.");
                     }
                     console.log("[Game State] Player and physics state cleared.");
                 }

                 // --- Setup Logic when entering 'playing' ---
                 else if (toState === 'playing') {
                     // Update UI with initial health and info (done in startGamePlay now)
                     const localPData = localPlayerId ? players[localPlayerId] : null;
                     if (UIManager && localPData) {
                         UIManager.updateHealthBar(localPData.health);
                         UIManager.updateInfo(`Playing as ${localPData.name || 'Player'}`);
                         // Lock controls automatically? Maybe not, let user click first.
                     } else {
                          console.warn("[Game State] Entered 'playing' but local player data or UI Manager missing.");
                     }
                 }

                 // --- Handling Loading Errors ---
                  else if (toState === 'loading' && data.options?.error) {
                      console.error(`[Game State] Transitioned to loading with error: ${data.options.message}`);
                      // Ensure controls are unlocked on error
                      if (controls?.isLocked) controls.unlock();
                      // Reset critical state flags
                      networkIsInitialized = false;
                      assetsAreReady = false; // Might need reloading
                      initializationData = null;
                      // Clear players and physics (similar to cleanup above)
                      // This might be redundant if the error caused a transition FROM playing/joining,
                      // but good to ensure cleanup if error happened earlier.
                      for (const id in this.playerRigidBodyHandles) { /* ... remove bodies ... */ }
                      this.playerRigidBodyHandles = {};
                      for (const id in players) { if (id !== localPlayerId) Network?._removePlayer(id); }
                      if (players?.[localPlayerId]) delete players[localPlayerId];
                      players = {};
                      localPlayerId = null;
                      // Map collider doesn't need removal here, it persists unless assets fail critically
                  }
             });
        } else {
             console.error("!!! stateMachine is missing! Cannot bind state transitions.");
        }
        console.log("[Game] State transition listeners bound.");
    }

    // --- Add Global Event Listeners ---
    addEventListeners() {
        console.log("[Game] Adding global event listeners (Resize, Join Button)...");

        // Join Button Listener
        if (UIManager?.joinButton && typeof Network?.attemptJoinGame === 'function') {
            UIManager.joinButton.addEventListener('click', () => {
                 // No prerequisite check here anymore - moved inside attemptJoinGame
                 Network.attemptJoinGame();
            });
            console.log("[Game] 'Join Game' button click listener added.");
        } else {
            console.error("!!! Cannot add join listener: UIManager.joinButton or Network.attemptJoinGame is missing!");
            // This might indicate a load order issue or UI setup failure
        }

        // Window Resize Listener
        window.addEventListener('resize', this.handleResize.bind(this)); // Use bind to maintain 'this' context

        console.log("[Game] Global event listeners added.");
    }

    // --- Main Update/Animate Loop ---
     animate() {
         // Request the next frame
         requestAnimationFrame(() => this.animate()); // Use arrow function for correct 'this'

         // Calculate delta time
         const dt = this.clock ? this.clock.getDelta() : 0.016; // Use fixed step if clock fails?

         // --- Physics Step ---
         if (rapierWorld && rapierEventQueue) {
             try {
                 rapierWorld.step(rapierEventQueue);
                 // Process events from rapierEventQueue if needed (e.g., collisions)
                 // rapierEventQueue.drainCollisionEvents((handle1, handle2, started) => { /* ... */ });
             } catch (e) {
                 console.error("!!! Error during Rapier world step:", e);
                 // Consider pausing the game or handling the error gracefully
             }
         }

         // --- Game Logic Update (Only when playing) ---
         if (stateMachine?.is('playing') && localPlayerId) {
             try {
                 // Update Local Player Input/Physics
                 const localHandle = this.playerRigidBodyHandles[localPlayerId];
                 const localBody = (localHandle !== undefined && localHandle !== null && rapierWorld) ? rapierWorld.getRigidBody(localHandle) : null;
                 if (typeof updateLocalPlayer === 'function' && localBody) {
                     updateLocalPlayer(dt, localBody); // Pass body reference
                 }

                 // Update Other Systems (e.g., Effects)
                 if (typeof Effects?.update === 'function') {
                     Effects.update(dt);
                 }

                 // --- Sync Camera to Local Player Body ---
                 if (localBody && controls?.getObject()) {
                      const playerPosition = localBody.translation();
                      const cameraOffset = CONFIG?.CAMERA_Y_OFFSET ?? 1.6;
                      // Set camera container position (PointerLockControls moves the inner camera object)
                      controls.getObject().position.set(
                          playerPosition.x,
                          playerPosition.y + cameraOffset, // Camera height relative to body center
                          playerPosition.z
                      );
                 }

                // --- Sync Remote Player Visuals to Kinematic Bodies ---
                for (const id in players) {
                    if (id !== localPlayerId && players[id] instanceof ClientPlayer && players[id].mesh) {
                        const remoteHandle = this.playerRigidBodyHandles[id];
                        const remoteBody = (remoteHandle !== undefined && remoteHandle !== null && rapierWorld) ? rapierWorld.getRigidBody(remoteHandle) : null;

                        if (remoteBody) {
                            const bodyPosition = remoteBody.translation(); // Get current position from physics
                            const bodyRotation = remoteBody.rotation(); // Get current rotation from physics

                            // Apply position and rotation directly to the Three.js mesh
                            players[id].mesh.position.set(bodyPosition.x, bodyPosition.y, bodyPosition.z);
                            players[id].mesh.quaternion.set(bodyRotation.x, bodyRotation.y, bodyRotation.z, bodyRotation.w);

                             // Adjust Y position based on model origin assumption (IF NEEDED)
                             // If GLTF origin is at feet, but Rapier body is centered:
                             const playerHeight = CONFIG?.PLAYER_HEIGHT || 1.8;
                             if (!(players[id].mesh.geometry instanceof THREE.CylinderGeometry)) { // Assume GLTF origin might be feet
                                 // Rapier body 'y' is center, mesh 'y' needs to be center - half_height
                                 players[id].mesh.position.y -= playerHeight / 2.0;
                             }
                             // If GLTF origin IS center (like cylinder), no adjustment needed here.
                        }
                    }
                }

             } catch(e) {
                 console.error("!!! Error during main game update loop:", e);
             }
         } // End of 'playing' state updates


         // --- Rendering ---
         if (renderer && scene && camera) {
             try {
                 renderer.render(scene, camera);
             } catch (e) {
                 console.error("!!! Error during Three.js rendering:", e);
                 // Handle render error, maybe stop the loop or display an overlay
             }
         }
     } // End animate()

    // --- Resize Handler ---
    handleResize() {
        if (camera) {
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            // console.log("Camera aspect updated");
        }
        if (renderer) {
            renderer.setSize(window.innerWidth, window.innerHeight);
            // console.log("Renderer size updated");
        }
    }

    // --- Start Game Play Method (Called after receiving initialization data) ---
    startGamePlay(initData) {
        console.log('[Game] startGamePlay called.');
        // *** ADDED: Log received data ***
        console.log('[Game] startGamePlay called. Received initData:', JSON.stringify(initData));

        // --- Essential Checks ---
        if (!initData?.id || typeof initData.players !== 'object') {
             console.error("!!! Invalid initialization data received from server:", initData);
             stateMachine?.transitionTo('homescreen');
             UIManager?.showError("Server Init Invalid!", "homescreen");
             return;
        }
        if (!rapierWorld || !RAPIER || this.mapColliderHandle === null || this.mapColliderHandle === undefined) {
             console.error("!!! Cannot start gameplay: Rapier physics world or map collider not ready!");
             stateMachine?.transitionTo('homescreen');
             UIManager?.showError("Physics Not Ready!", 'homescreen');
             return;
        }
         if (stateMachine?.is('playing')) {
             console.warn("[Game] startGamePlay called while already in 'playing' state. Ignoring.");
             return;
         }

         // --- State Reset (Ensure clean slate before creating new players/bodies) ---
         console.log("[Game] Clearing previous player/physics state before starting new game...");
         // Remove existing bodies (might be redundant if transition cleanup worked, but safe)
         for (const handle of Object.values(this.playerRigidBodyHandles)) {
             if (rapierWorld && handle !== undefined && handle !== null) {
                 try { rapierWorld.removeRigidBody(rapierWorld.getRigidBody(handle)); } catch (e) { /* ignore */ }
             }
         }
         this.playerRigidBodyHandles = {};
         // Remove existing player objects/meshes
         for (const id in players) {
             if (typeof Network?._removePlayer === 'function') Network._removePlayer(id);
         }
         players = {}; // Reset global players

         // --- Set Local Player ID ---
         localPlayerId = initData.id;
         console.log(`[Game] Local Player ID set to: ${localPlayerId}`);

         // --- Create Player Objects and Physics Bodies ---
         console.log("[Game] Creating player objects and Rapier bodies...");
         const playerHeight = CONFIG?.PLAYER_HEIGHT || 1.8;
         const playerRadius = CONFIG?.PLAYER_RADIUS || 0.4;
         const capsuleHalfHeight = Math.max(0.01, playerHeight / 2.0 - playerRadius); // Height of the cylinder part

         for (const id in initData.players) {
             const serverPlayerData = initData.players[id];

             // Validate essential position data
             if (serverPlayerData.x === undefined || serverPlayerData.y === undefined || serverPlayerData.z === undefined) {
                 console.warn(`[Game] Invalid position data for player ${id}. Skipping creation.`);
                 continue;
             }

             // Calculate Rapier body position (center Y)
             // Server sends Y at feet, Rapier capsule body origin is its center.
             const bodyCenterY = serverPlayerData.y + playerHeight / 2.0;

             try {
                 // Define the collider shape (Capsule)
                 let playerColliderDesc = RAPIER.ColliderDesc.capsule(capsuleHalfHeight, playerRadius)
                     .setFriction(0.7)
                     .setRestitution(0.1); // Some bounciness

                 // --- Initial Rotation ---
                 const initialRotationY = serverPlayerData.rotationY || 0;
                 // Use fromAxisAngle for clarity - rotate around Y axis
                 const initialRotationQuat = RAPIER.Quaternion.fromAxisAngle({ x: 0, y: 1, z: 0 }, initialRotationY);
                 if (!initialRotationQuat) { throw new Error("Quaternion creation failed!"); }

                 let rigidBody;
                 let rigidBodyDesc;

                 // --- LOCAL PLAYER ---
                 if (id === localPlayerId) {
                     console.log(`[Game] Initializing LOCAL player: ${serverPlayerData.name || 'Unnamed'} (ID: ${id})`);
                     // Store player data (no visual mesh for local player)
                     players[id] = { ...serverPlayerData, isLocal: true, mesh: null };

                     // Create Dynamic Rigid Body for local player
                     rigidBodyDesc = RAPIER.RigidBodyDesc.dynamic()
                         .setTranslation(serverPlayerData.x, bodyCenterY, serverPlayerData.z)
                         .setRotation(initialRotationQuat)
                         .setLinvel(0, 0, 0) // Start stationary
                         .setAngvel({ x: 0, y: 0, z: 0 })
                         .setLinearDamping(0.5) // Some air resistance
                         .setAngularDamping(1.0) // Prevent spinning easily
                         .lockRotations() // Prevent capsule from falling over
                         .setCanSleep(false); // Keep active

                     rigidBody = rapierWorld.createRigidBody(rigidBodyDesc);
                     if (!rigidBody) throw new Error("Failed to create local player rigid body.");

                     // Store the handle
                     this.playerRigidBodyHandles[id] = rigidBody.handle;
                     console.log(`[Game] Created DYNAMIC Rapier body for local player. Handle: ${rigidBody.handle}`);

                     // Create and attach the collider
                     rapierWorld.createCollider(playerColliderDesc, rigidBody.handle); // Attach to body

                     // Initial Camera Position (sync with body)
                     if (controls?.getObject()) {
                         const bodyPos = rigidBody.translation();
                         controls.getObject().position.set(bodyPos.x, bodyPos.y + (CONFIG?.CAMERA_Y_OFFSET ?? 1.6), bodyPos.z);
                         // Initial camera rotation is handled by PointerLockControls based on mouse
                     }

                     // Update UI for local player
                     if (UIManager) {
                         UIManager.updateHealthBar(serverPlayerData.health ?? CONFIG.PLAYER_DEFAULT_HEALTH);
                         UIManager.updateInfo(`Playing as ${serverPlayerData.name || 'Player'}`);
                         UIManager.clearError('homescreen'); // Ensure homescreen errors are gone
                         UIManager.clearKillMessage();
                     }

                 }
                 // --- REMOTE PLAYER ---
                 else {
                      console.log(`[Game] Initializing REMOTE player: ${serverPlayerData.name || 'Unnamed'} (ID: ${id})`);
                      // Create ClientPlayer instance (loads mesh)
                      // Use _addPlayer from Network which creates ClientPlayer
                      if (typeof Network?._addPlayer === 'function') {
                         const remotePlayerInstance = Network._addPlayer(serverPlayerData); // Creates ClientPlayer, adds to players[id]
                         if (!remotePlayerInstance || !(remotePlayerInstance instanceof ClientPlayer)) {
                              console.warn(`[Game] Failed to create ClientPlayer instance for remote player ${id}. Skipping physics body.`);
                              continue; // Skip physics if visual player failed
                         }
                      } else {
                         console.error("!!! Network._addPlayer function missing!");
                         continue; // Cannot create remote player representation
                      }

                     // Create Kinematic Position-Based Rigid Body for remote players
                     rigidBodyDesc = RAPIER.RigidBodyDesc.kinematicPositionBased()
                         .setTranslation(serverPlayerData.x, bodyCenterY, serverPlayerData.z)
                         .setRotation(initialRotationQuat);
                         // Kinematic bodies don't need velocity, damping, etc.

                     rigidBody = rapierWorld.createRigidBody(rigidBodyDesc);
                     if (!rigidBody) throw new Error(`Failed to create remote player (${id}) rigid body.`);

                     // Store the handle
                     this.playerRigidBodyHandles[id] = rigidBody.handle;
                     console.log(`[Game] Created KINEMATIC Rapier body for remote player ${id}. Handle: ${rigidBody.handle}`);

                     // Create and attach the collider
                     rapierWorld.createCollider(playerColliderDesc, rigidBody.handle);
                 }

             } catch (bodyError) {
                  console.error(`!!! Error creating player body or collider for ID ${id}:`, bodyError);
                  // Clean up potentially created body/player object for this ID?
                  if(this.playerRigidBodyHandles[id] !== undefined) {
                     try { rapierWorld?.removeRigidBody(rapierWorld.getRigidBody(this.playerRigidBodyHandles[id])); } catch(e) {}
                     delete this.playerRigidBodyHandles[id];
                  }
                  if(players[id]) {
                      if(players[id] instanceof ClientPlayer) players[id].remove();
                      delete players[id];
                  }
                  // If local player failed, this is critical
                  if(id === localPlayerId) {
                      stateMachine?.transitionTo('homescreen');
                      UIManager?.showError("FATAL: Player Init Fail!", 'homescreen');
                      return; // Stop initialization
                  }
             }
         } // End loop through initData.players

         console.log(`[Game] Initialization complete. ${Object.keys(players).length} players created.`);

         // --- Transition to Playing State ---
         if(stateMachine) {
             console.log("[Game] Transitioning to 'playing' state...");
             stateMachine.transitionTo('playing');
         } else {
             console.error("!!! stateMachine is missing! Cannot transition to playing state.");
         }
    } // End startGamePlay()

    // --- Start Asset Loading ---
    startAssetLoading() {
        console.log("[Game] Starting asset loading process...");
        if (typeof loadManager?.startLoading === 'function') {
             loadManager.startLoading();
        } else {
             console.error("!!! LoadManager or startLoading function is missing!");
             if(stateMachine) stateMachine.transitionTo('loading', {message:"FATAL: Asset Mgr Fail!", error: true});
        }
    }

} // End Game Class

// --- Global Game Initialization ---
function runGame() {
     console.log("--- runGame() called ---");
     try {
         // Ensure previous instance is cleaned up if necessary (though state transitions should handle this)
         if(window.currentGameInstance) {
             console.warn("Previous game instance found during runGame. Attempting cleanup (should not happen often).");
             // Add cleanup logic if needed, e.g., removing listeners
         }
         const gameInstance = new Game();
         window.currentGameInstance = gameInstance; // Assign to global
         gameInstance.start(); // Start the game initialization process
         // Resize handler is bound internally now
         // window.onresize = () => gameInstance.handleResize();
     } catch(e) {
         console.error("!!! CRITICAL Error creating Game instance:", e);
         document.body.innerHTML = `<p style='color:red; font-size: 1.5em; text-align: center; padding: 20px;'>FATAL ERROR: GAME INITIALIZATION FAILED.<br/>Check console (F12) for details.</p>`;
         // Clean up any partial state?
     }
}

// --- DOM Ready Check ---
if (document.readyState === 'loading') { // Loading hasn't finished yet
    document.addEventListener('DOMContentLoaded', runGame);
} else { // `DOMContentLoaded` has already fired
    runGame();
}

console.log("game.js loaded (Rapier - Corrected fromAxisAngle, Debug Logs)");
