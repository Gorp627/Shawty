// docs/game.js - Main Game Orchestrator (Create Local Mesh, Camera Sync, Use Effects - FULL FILE v6)

// --- Global Flags and Data ---
let networkIsInitialized = false;
let assetsAreReady = false;
let physicsIsReady = false; // Track Rapier's readiness separately
let initializationData = null; // From server
var currentGameInstance = null; // Holds the single Game instance
// RAPIER / rapierWorld / rapierEventQueue are now set globally in config.js and populated by rapier_init.js / game.js

class Game {
    // --- Constructor ---
    constructor() {
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        this.clock = null;
        // Game state references (using globals defined in config.js)
        this.players = window.players; // Reference global players object
        this.keys = window.keys; // Reference global keys object
        this.localPlayerMesh = null; // Added: Reference to the local player's VISUAL mesh
        this.mapColliderHandle = null; // Handle for the map collider
        this.playerRigidBodyHandles = {}; // Rapier rigid body handles { playerId: handle }
        this.physicsStepAccumulator = 0;
        this.lastNetworkSendTime = 0;
        // Debug Meshes (optional)
        this.debugMeshes = {}; // Debug meshes for rigid bodies
        this.DEBUG_SHOW_PLAYER_COLLIDERS = false; // Set true to show wireframes
    }

    // --- Main Initialization ---
    async init() {
        console.log("--- Game Init Sequence ---");
        if (currentGameInstance) { console.warn("Game instance already exists!"); return; }
        currentGameInstance = this; // Set global reference

        // 1. Setup State Machine & UI Listeners
        stateMachine.transitionTo('loading', { message: 'Initializing Core...' });
        if (!UIManager.initialize()) return; // Stop if critical UI elements missing
        UIManager.bindStateListeners(stateMachine);

        // 2. Setup Three.js Core
        stateMachine.transitionTo('loading', { message: 'Setting up Graphics...' });
        this.clock = new THREE.Clock();
        this.scene = new THREE.Scene();
        window.scene = this.scene; // Assign to global for access by other modules
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 500); // Increased far plane
        window.camera = this.camera; // Assign to global
        this.renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('gameCanvas'), antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.shadowMap.enabled = true;
        window.renderer = this.renderer; // Assign to global

        // 3. Setup Controls (PointerLock)
        this.controls = new THREE.PointerLockControls(this.camera, this.renderer.domElement);
        window.controls = this.controls; // Assign to global

        // Lock/Unlock Listeners for Controls
        this.controls.addEventListener('lock', () => {
            console.log("Pointer Locked");
            if(stateMachine?.is('playing') && UIManager) { UIManager.gameUI.style.cursor = 'none'; } // Hide cursor in game
        });
        this.controls.addEventListener('unlock', () => {
            console.log("Pointer Unlocked");
            if(stateMachine?.is('playing') && UIManager) { UIManager.gameUI.style.cursor = 'default'; } // Show cursor if UI visible
            // Do NOT automatically pause or go to homescreen here, let state machine handle it if needed (e.g., on disconnect)
        });
        this.scene.add(this.controls.getObject()); // Add camera container to scene

        // 4. Setup Lighting
        this.scene.add(new THREE.AmbientLight(0x606070)); // Slightly brighter ambient
        const dirLight = new THREE.DirectionalLight(0xffffff, 0.9);
        dirLight.position.set(40, 50, 30);
        dirLight.castShadow = true;
        dirLight.shadow.mapSize.width = 2048;
        dirLight.shadow.mapSize.height = 2048;
        dirLight.shadow.camera.near = 0.5;
        dirLight.shadow.camera.far = 500;
        // Optional: Adjust shadow camera bounds if needed
        // dirLight.shadow.camera.left = -100; dirLight.shadow.camera.right = 100;
        // dirLight.shadow.camera.top = 100; dirLight.shadow.camera.bottom = -100;
        this.scene.add(dirLight);
        // Optional: Add a helper to visualize the light's direction
        // const dirLightHelper = new THREE.DirectionalLightHelper( dirLight, 10 ); scene.add( dirLightHelper );

        // 5. Initialize Input System (pass controls reference)
        if (!Input.init(this.controls)) {
            stateMachine.transitionTo('loading', { message: 'Input Init Failed!', error: true });
            return;
        }

        // 6. Initialize Effects System (pass scene and camera)
        if (!Effects.initialize(this.scene, this.camera)) {
             stateMachine.transitionTo('loading', { message: 'Effects Init Failed!', error: true });
             return;
        }

        // 7. Initialize Physics (Wait for Rapier WASM)
        stateMachine.transitionTo('loading', { message: 'Loading Physics Engine...' });
        if (!window.isRapierReady) { // Check flag set by rapier_init.js
            console.log("Waiting for Rapier physics engine...");
            await new Promise(resolve => window.addEventListener('rapier-ready', resolve, { once: true }));
        }
        this.setupPhysics(); // Now Rapier should be ready

        // 8. Setup Asset Loaders (Needs Three.js ready)
        stateMachine.transitionTo('loading', { message: 'Preparing Asset Loaders...' });
        this.setupLoaders();

        // 9. Start Loading Assets
        stateMachine.transitionTo('loading', { message: 'Loading Game Assets...' });
        loadManager.on('ready', this.onAssetsReady.bind(this));
        loadManager.on('error', this.onLoadError.bind(this));
        loadManager.startLoading(); // Will trigger 'ready' or 'error' event

        // 10. Initialize Networking
        stateMachine.transitionTo('loading', { message: 'Connecting to Server...' });
        if (typeof Network?.init === 'function') {
            Network.init(); // Starts connection attempt
            // Network events will handle progress (connected, error, initialized)
        } else {
            console.error("Network.init is not a function!");
            stateMachine.transitionTo('loading', { message: 'Network Init Failed!', error: true });
            return;
        }

        // 11. Add Window Resize Listener
        this.addEventListeners();

        // 12. Start the Render Loop
        this.update();

        console.log("--- Game Init Sequence Complete (Waiting for Assets/Network) ---");
    }

    // --- Setup Sub-functions ---
    setupPhysics() {
        if (!RAPIER) { console.error("!!! RAPIER global missing!"); return; }
        rapierWorld = new RAPIER.World({ x: 0, y: CONFIG.GRAVITY, z: 0 });
        rapierEventQueue = new RAPIER.EventQueue(true); // Enable collision event queue
        window.rapierWorld = rapierWorld; // Assign to global
        window.rapierEventQueue = rapierEventQueue;
        physicsIsReady = true;
        console.log("[Game] Rapier Physics World Initialized.");
        this.attemptProceedToGame(); // Check if other things are ready now
    }

    setupLoaders() {
        if (!THREE) return;
        // Create GLTF and DRACO loaders, assign to window for loadManager
        dracoLoader = new THREE.DRACOLoader();
        dracoLoader.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/libs/draco/'); // Path to Draco decoders
        loader = new THREE.GLTFLoader();
        loader.setDRACOLoader(dracoLoader);
        window.dracoLoader = dracoLoader;
        window.loader = loader;
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
        assetsAreReady = true; // Set flag
        // Create the map collider now that the map asset is loaded
        this.createMapCollider();
        this.attemptProceedToGame(); // Check if network is also ready
    }

    onLoadError(errorData) {
        console.error("[Game] Asset Load Manager reported 'error':", errorData.message);
        stateMachine.transitionTo('loading', { message: `Asset Load Failed!<br/>${errorData.message}`, error: true });
    }

    // --- Network Callback (triggered by Network.handleInitialize) ---
    attemptProceedToGame() {
        // This function is called when Assets, Physics, OR Network becomes ready
        // It checks if ALL conditions are met to start the actual gameplay.
        console.log(`[Game] attemptProceedToGame called. Status: Assets=${assetsAreReady}, Physics=${physicsIsReady}, Network=${networkIsInitialized}, InitData=${!!initializationData}`);
        if (assetsAreReady && physicsIsReady && networkIsInitialized && initializationData) {
            console.log("[Game] All prerequisites met! Starting gameplay...");
            this.startGamePlay(initializationData);
            initializationData = null; // Consume the init data
        } else {
            console.log("[Game] Prerequisites not yet met. Waiting...");
            // Optionally update loading message based on what's missing
            let waitMsg = "Initializing...";
            if (!assetsAreReady) waitMsg = "Loading Assets...";
            else if (!physicsIsReady) waitMsg = "Loading Physics...";
            else if (!networkIsInitialized) waitMsg = "Connecting...";
            else if (!initializationData) waitMsg = "Waiting for Server Data...";
             if (!stateMachine.is('error')) { // Don't overwrite error messages
                 stateMachine.transitionTo('loading', { message: waitMsg });
             }
        }
    }

    // --- Start Actual Gameplay ---
    startGamePlay(initData) {
        console.log("[Game] --- Starting Gameplay ---");
        stateMachine.transitionTo('playing'); // Triggers UI change via UIManager listener

        // Clear previous player data (important if rejoining)
        this.cleanupAllPlayers();

        // Process the initialization data from the server
        localPlayerId = initData.id;
        console.log(`[Game] Local Player ID set: ${localPlayerId}`);

        // Process all players received from the server
        for (const id in initData.players) {
            const playerData = initData.players[id];
            if (!playerData) continue;

            if (id === localPlayerId) {
                // --- Create LOCAL Player ---
                console.log("[Game] Creating LOCAL player objects...");
                // 1. Store data locally (using global players map for convenience)
                players[id] = {
                    id: id,
                    name: playerData.name,
                    phrase: playerData.phrase,
                    health: playerData.health,
                    isLocal: true,
                    mesh: null, // Initialize mesh as null
                    // Store initial server position (feet) for reference
                    x: playerData.x,
                    y: playerData.y,
                    z: playerData.z,
                    rotationY: playerData.rotationY,
                };
                window.localPlayerName = playerData.name; // Update global name
                window.localPlayerPhrase = playerData.phrase;
                UIManager.updateInfo(`Playing as ${playerData.name}`);
                UIManager.updateHealthBar(playerData.health);

                // 2. Create Physics Body (Dynamic)
                const playerHeight = CONFIG.PLAYER_HEIGHT;
                const bodyCenterY = playerData.y + playerHeight / 2.0; // Calculate center Y
                const startPos = { x: playerData.x, y: bodyCenterY, z: playerData.z };
                this.createPlayerPhysicsBody(id, startPos, playerData.rotationY, true); // true for local player

                // 3. Create Visual Mesh (using loaded model)
                const playerModelAsset = loadManager.getAssetData('playerModel');
                if (playerModelAsset?.scene) {
                    try {
                        this.localPlayerMesh = playerModelAsset.scene.clone(); // Clone for local player
                        this.localPlayerMesh.scale.set(0.5, 0.5, 0.5); // Example scale - ADJUST
                        this.localPlayerMesh.castShadow = true;
                        this.localPlayerMesh.receiveShadow = true;
                        this.localPlayerMesh.visible = false; // Hide torso for local player
                        this.localPlayerMesh.userData = { entityId: id, isPlayer: true, isLocal: true };
                         this.localPlayerMesh.traverse(child => {
                             if (child.isMesh) {
                                 child.castShadow = true; child.receiveShadow = true;
                                 // Make local player mesh invisible to self (optional)
                                 // This hides the body, but you might want shadows or legs visible.
                                 // If you hide it, attach the gun directly to the camera later.
                                 // If you show parts (like legs), attach gun to mesh.
                                 child.visible = false; // Simplest: Hide whole body
                             }
                         });
                        scene.add(this.localPlayerMesh);
                        players[id].mesh = this.localPlayerMesh; // Link mesh reference
                        console.log("[Game] Created local player GLTF mesh (initially hidden).");
                    } catch(e) { console.error("Error cloning/adding local player mesh:", e);}
                } else {
                    console.error("!!! Local player model asset not found!");
                    // No fallback mesh for local player - critical error?
                }

                 // 4. Attach Gun Model to Camera
                 const gunModelAsset = loadManager.getAssetData('gunModel');
                 if(gunModelAsset?.scene) {
                     gunMesh = gunModelAsset.scene.clone();
                     gunMesh.scale.set(0.1, 0.1, 0.1); // Adjust scale as needed
                     // Adjust position/rotation relative to camera VIEW
                     gunMesh.position.set(0.15, -0.15, -0.4); // Right, Down, Forward from camera center
                     gunMesh.rotation.set(0, Math.PI, 0); // Adjust as needed (Y up)
                      gunMesh.traverse(child => { if (child.isMesh) child.castShadow = true; });
                     camera.add(gunMesh); // Add gun directly to camera
                     console.log("[Game] Attached gun model to camera.");
                 } else {
                      console.warn("Gun model asset not ready, cannot attach gun.");
                 }

            } else {
                // --- Create REMOTE Player ---
                console.log(`[Game] Creating REMOTE player objects for ${playerData.name || id}...`);
                // 1. Create ClientPlayer visual instance (uses loadMesh with GLTF)
                const remotePlayer = new ClientPlayer(playerData); // Creates mesh, adds to scene
                players[id] = remotePlayer; // Store in global map

                // 2. Create Physics Body (Kinematic)
                if (remotePlayer.mesh) { // Only create body if mesh was created
                    const playerHeight = CONFIG.PLAYER_HEIGHT;
                    const bodyCenterY = playerData.y + playerHeight / 2.0;
                    const startPos = { x: playerData.x, y: bodyCenterY, z: playerData.z };
                    this.createPlayerPhysicsBody(id, startPos, playerData.rotationY, false); // false for remote
                } else {
                     console.warn(`Skipping physics body for remote player ${id}, mesh failed.`);
                }
            }
        }
         console.log("[Game] Finished processing initial player data.");
    }

    // --- Physics Body Creation ---
    createPlayerPhysicsBody(playerId, initialPosition, initialRotationY, isLocal) {
        if (!rapierWorld || !RAPIER) { console.error("!!! Physics world/Rapier missing for body creation!"); return; }

        const h = CONFIG.PLAYER_HEIGHT;
        const r = CONFIG.PLAYER_RADIUS;
        const capsuleHalfHeight = Math.max(0.01, h / 2.0 - r); // Avoid zero height

        let rbDesc;
        let collDesc = RAPIER.ColliderDesc.capsuleY(capsuleHalfHeight, r)
            .setFriction(0.7).setRestitution(0.1).setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS); // Listen for collisions

        // Convert Y rotation to Quaternion
        const q = RAPIER.Quaternion.fromAxisAngle({ x: 0, y: 1, z: 0 }, initialRotationY);
        if (!q) { console.error(`Failed to create quaternion for player ${playerId}`); return; }


        if (isLocal) {
            // --- Dynamic Body for Local Player ---
            rbDesc = RAPIER.RigidBodyDesc.dynamic()
                .setTranslation(initialPosition.x, initialPosition.y, initialPosition.z)
                .setRotation(q)
                .setLinearDamping(0.5) // Air resistance
                .setAngularDamping(1.0) // Prevent spinning
                .lockRotations() // Prevent capsule falling over
                .setCcdEnabled(true); // Enable Continuous Collision Detection for fast movement
            collDesc.setDensity(1.0); // Give mass to dynamic body

             // Optional: Set user data on collider/body to identify player ID
             collDesc.userData = { entityId: playerId, isLocal: true };


        } else {
            // --- Kinematic Body for Remote Players ---
            rbDesc = RAPIER.RigidBodyDesc.kinematicPositionBased()
                .setTranslation(initialPosition.x, initialPosition.y, initialPosition.z)
                .setRotation(q); // Set initial state

             // Optional: Set user data on collider/body
             collDesc.userData = { entityId: playerId, isLocal: false };
        }

        // Create body and collider
        try {
            const body = rapierWorld.createRigidBody(rbDesc);
            if (!body) throw new Error("RigidBody creation failed.");

            rapierWorld.createCollider(collDesc, body.handle); // Attach collider to body handle

            this.playerRigidBodyHandles[playerId] = body.handle; // Store handle
            console.log(`[Game] Created ${isLocal ? 'DYNAMIC' : 'KINEMATIC'} Rapier body for player ${playerId} (Handle: ${body.handle}) at ~(${initialPosition.x.toFixed(1)}, ${initialPosition.y.toFixed(1)}, ${initialPosition.z.toFixed(1)})`);

            // Debug wireframe
            if (this.DEBUG_SHOW_PLAYER_COLLIDERS) this.addDebugMesh(playerId, r, h, initialPosition, q);

        } catch(e) {
             console.error(`!!! Failed to create physics body for ${playerId} (isLocal=${isLocal}):`, e);
             // Cleanup? If colliderDesc or body failed.
        }
    }

    // --- Map Collider Creation ---
    createMapCollider() {
        if (!rapierWorld || !RAPIER || !window.mapMesh) {
            console.error("Physics, Rapier, or mapMesh not ready for map collider creation!");
            this.createSimpleGroundCollider(); // Create fallback ground
            return;
        }
        console.log("[Game] Attempting to create map collider...");
        try {
            // Process the loaded map scene to extract vertices and indices
            const geometries = [];
            window.mapMesh.traverse(child => {
                if (child.isMesh) {
                    // Apply world transformations to geometry vertices
                    const clonedGeom = child.geometry.clone();
                    clonedGeom.applyMatrix4(child.matrixWorld);
                    geometries.push(clonedGeom);
                }
            });

            if (geometries.length === 0) throw new Error("No meshes found in map asset.");

            // Combine all mesh data into single vertex/index arrays
            const vertices = [];
            const indices = [];
            let indexOffset = 0;

            geometries.forEach(geom => {
                const posAttr = geom.attributes.position;
                const idxAttr = geom.index;

                if (!posAttr) return; // Skip meshes without position

                // Add vertices
                for (let i = 0; i < posAttr.count; i++) {
                    vertices.push(posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i));
                }

                // Add indices
                if (idxAttr) {
                    for (let i = 0; i < idxAttr.count; i++) {
                        indices.push(idxAttr.getX(i) + indexOffset);
                    }
                } else {
                    // Handle non-indexed geometry (create indices for triangles)
                    for (let i = 0; i < posAttr.count; i += 3) {
                        indices.push(indexOffset + i, indexOffset + i + 1, indexOffset + i + 2);
                    }
                }
                indexOffset += posAttr.count; // Update offset for next mesh
                geom.dispose(); // Dispose cloned geometry
            });


            if (vertices.length > 0 && indices.length > 0) {
                // Create Rapier Trimesh collider
                 const vertsF32 = new Float32Array(vertices);
                 const indsU32 = new Uint32Array(indices);
                 let colliderDesc = RAPIER.ColliderDesc.trimesh(vertsF32, indsU32)
                     .setFriction(1.0) // High friction for ground
                     .setRestitution(0.1); // Low bounce
                this.mapColliderHandle = rapierWorld.createCollider(colliderDesc).handle; // Creates fixed body automatically
                console.log(`[Game] Trimesh map collider created successfully. Handle: ${this.mapColliderHandle}. Vertices: ${vertices.length / 3}, Indices: ${indices.length / 3}`);
            } else {
                throw new Error("No valid vertices/indices generated from map meshes.");
            }

        } catch (e) {
            console.error("!!! Error creating Trimesh map collider:", e);
            console.warn("Falling back to simple ground collider.");
            this.createSimpleGroundCollider();
        }
    }

    createSimpleGroundCollider() {
        if (!rapierWorld || !RAPIER) { return; }
        let cd = RAPIER.ColliderDesc.cuboid(100, 0.5, 100)
             .setTranslation(0, -0.5, 0) // Position slightly below origin
             .setFriction(1.0);
        this.mapColliderHandle = rapierWorld.createCollider(cd).handle;
        console.warn("[Game] Using SIMPLE GROUND COLLIDER (DEBUG/FALLBACK).");
    }

    // --- Debug ---
    addDebugMesh(playerId, r, h, position, rotation) {
         if (!scene || !THREE) return;
         const capsuleGeom = new THREE.CapsuleGeometry(r, h - 2 * r, 4, 8);
         const wireframeMat = new THREE.MeshBasicMaterial({ color: playerId === localPlayerId ? 0x00ff00 : 0xffff00, wireframe: true });
         const wireframeMesh = new THREE.Mesh(capsuleGeom, wireframeMat);
         wireframeMesh.position.set(position.x, position.y, position.z);
         wireframeMesh.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w);
         scene.add(wireframeMesh);
         this.debugMeshes[playerId] = wireframeMesh;
         console.log(`[Debug] Added wireframe for ${playerId}`);
    }

    // --- Cleanup ---
    cleanupPlayer(playerId) {
         // Remove visual mesh
         if (players[playerId]) {
             if (players[playerId].mesh) {
                 scene?.remove(players[playerId].mesh);
                 // TODO: Proper disposal of geometry/materials if needed (depends if cloned)
                 players[playerId].mesh = null;
             }
             delete players[playerId]; // Remove from client state
         }
         if(playerId === localPlayerId) {
             this.localPlayerMesh = null; // Clear local ref
         }

         // Remove debug mesh
         if (this.debugMeshes[playerId]) {
             scene?.remove(this.debugMeshes[playerId]);
             this.debugMeshes[playerId].geometry?.dispose();
             this.debugMeshes[playerId].material?.dispose();
             delete this.debugMeshes[playerId];
         }

         // Remove physics body
         const bodyHandle = this.playerRigidBodyHandles[playerId];
         if (bodyHandle !== undefined && bodyHandle !== null && rapierWorld) {
             try {
                 let body = rapierWorld.getRigidBody(bodyHandle);
                 if (body) rapierWorld.removeRigidBody(body);
             } catch (e) { console.error(`Error removing Rapier body handle ${bodyHandle}:`, e); }
             delete this.playerRigidBodyHandles[playerId];
         }
         // console.log(`[Game] Cleaned up player ${playerId}`);
     }

     cleanupAllPlayers() {
         console.log("[Game] Cleaning up all player objects...");
         // Use Object.keys to avoid issues with modifying during iteration
         const playerIds = Object.keys(players);
         playerIds.forEach(id => this.cleanupPlayer(id));
         // Ensure local player refs are also cleared
         localPlayerId = null;
         this.localPlayerMesh = null;
         // Clear physics handles map just in case
         this.playerRigidBodyHandles = {};
     }


    // --- Main Update Loop ---
    update() {
        requestAnimationFrame(this.update.bind(this));
        if (!this.clock || !this.renderer || !this.scene || !this.camera) return; // Core components missing

        const deltaTime = this.clock.getDelta();

        // Update based on state
        if (stateMachine.is('playing')) {
            // --- Physics Step ---
            if (rapierWorld && RAPIER) {
                 // Fixed timestep simulation for stability
                 const physicsTimestep = 1 / 60; // Target 60Hz physics rate
                 this.physicsStepAccumulator += deltaTime;
                 while (this.physicsStepAccumulator >= physicsTimestep) {
                     // Update local player input logic BEFORE stepping physics
                     const localPlayerBodyHandle = this.playerRigidBodyHandles[localPlayerId];
                     if (localPlayerBodyHandle !== undefined && localPlayerBodyHandle !== null) {
                          try {
                              const localBody = rapierWorld.getRigidBody(localPlayerBodyHandle);
                              if (localBody) {
                                  updateLocalPlayer(physicsTimestep, localBody); // Pass fixed step
                              }
                          } catch(e) { console.error("Error getting/updating local player body:", e);}
                     }

                     // Step the physics world
                     rapierWorld.step(rapierEventQueue);

                     this.physicsStepAccumulator -= physicsTimestep;
                 }

                 // --- Handle Collision Events (After stepping) ---
                 rapierEventQueue.drainCollisionEvents((handle1, handle2, started) => {
                     // Example: Log collisions between players or player/map
                     const body1 = rapierWorld.getRigidBody(handle1);
                     const body2 = rapierWorld.getRigidBody(handle2);
                     const collider1 = rapierWorld.getCollider(handle1); // Use collider handle directly
                     const collider2 = rapierWorld.getCollider(handle2);

                     if (body1 && body2 && collider1?.userData && collider2?.userData) {
                          const id1 = collider1.userData.entityId;
                          const id2 = collider2.userData.entityId;

                          if (started && id1 && id2 && id1 !== id2) {
                              // Player-Player collision start
                              // console.log(`Collision Start: Player ${id1} vs Player ${id2}`);
                              // Optional: Play collision sound?
                          }
                     } else if(started && (collider1?.userData?.isLocal || collider2?.userData?.isLocal)){
                          // Local Player collided with something else (map?)
                          // console.log("Local player collided with map/other");
                     }
                 });
            }

            // --- Update Remote Player Visuals ---
            // Remote player meshes follow their kinematic bodies directly (Rapier handles interpolation)
            for (const id in this.players) {
                 if (id === localPlayerId || !this.players[id] || !this.players[id].mesh) continue; // Skip local or invalid players

                 const remotePlayer = this.players[id];
                 const bodyHandle = this.playerRigidBodyHandles[id];
                 if (bodyHandle !== undefined && bodyHandle !== null && rapierWorld) {
                      try {
                          const body = rapierWorld.getRigidBody(bodyHandle);
                          if (body) {
                              const position = body.translation(); // Get current interpolated position
                              const rotation = body.rotation(); // Get current interpolated rotation

                              // Position mesh at feet based on body center
                              const playerHeight = CONFIG.PLAYER_HEIGHT;
                              remotePlayer.mesh.position.set(position.x, position.y - playerHeight / 2.0, position.z);
                              remotePlayer.mesh.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w);

                              // Update debug mesh if enabled
                              if (this.DEBUG_SHOW_PLAYER_COLLIDERS && this.debugMeshes[id]) {
                                   this.debugMeshes[id].position.set(position.x, position.y, position.z); // Debug mesh at body center
                                   this.debugMeshes[id].quaternion.copy(rotation);
                              }
                          }
                      } catch(e) { console.error(`Error updating remote player ${id} visuals:`, e);}
                 }
            }

            // --- Update Camera ---
            // Camera follows the LOCAL player's physics body smoothly
             const localPlayerBodyHandle = this.playerRigidBodyHandles[localPlayerId];
             if (localPlayerBodyHandle !== undefined && localPlayerBodyHandle !== null && rapierWorld) {
                 try {
                     const localBody = rapierWorld.getRigidBody(localPlayerBodyHandle);
                     if (localBody) {
                         const bodyPos = localBody.translation(); // Physics body center position
                         // Target position slightly above the body center for eye level
                         const targetCameraPos = new THREE.Vector3(bodyPos.x, bodyPos.y + CONFIG.CAMERA_Y_OFFSET, bodyPos.z);
                         // Smoothly interpolate camera position towards the target
                         camera.position.lerp(targetCameraPos, 0.7); // Adjust lerp factor (0.1 = very smooth, 0.9 = very snappy)

                         // Camera rotation is handled by PointerLockControls modifying camera directly
                     }
                 } catch(e) { console.error("Error updating camera position:", e);}
             }

             // --- Update Effects ---
             Effects?.update(deltaTime);

        } // End if(stateMachine.is('playing'))

        // --- Render ---
        this.renderer.render(this.scene, this.camera);
    }

} // End Game Class

// --- Global Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    // Wait for Rapier AND DOM before starting the game init
    const startGameInit = () => {
         console.log("DOM Content Loaded. Starting Game Initialization...");
         const game = new Game();
         game.init().catch(error => {
             console.error("Unhandled error during Game Initialization:", error);
              // Attempt to display error via UIManager if it initialized
              UIManager?.showLoading(`Initialization Error:<br/>${error.message}`, true);
              // Fallback if UI Manager failed
              if (!UIManager?.loadingScreen) {
                   document.body.innerHTML = `<p style='color:red; font-size: 1.5em;'>FATAL INITIALIZATION ERROR: ${error.message}</p>`;
              }
         });
    };

    if (window.isRapierReady) {
        startGameInit(); // Rapier already ready
    } else {
        console.log("DOM Content Loaded, waiting for Rapier...");
        window.addEventListener('rapier-ready', startGameInit, { once: true });
        window.addEventListener('rapier-error', () => {
             console.error("Rapier failed to load, cannot start game.");
             // Error message is already shown by rapier_init.js
        }, { once: true });
    }
});
console.log("game.js loaded (Local Mesh, Camera Sync, Effects - v6)");
