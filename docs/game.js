// docs/game.js - Main Game Orchestrator (Uses Global Scope - v11 Complete and Verified)

// --- Global variables like networkIsInitialized, assetsAreReady, etc., ---
// --- are DECLARED in config.js and accessed directly here. ---
// --- DO NOT re-declare them with let/const/var here. ---

var currentGameInstance = null; // Holds the single Game instance
// Other globals like RAPIER, rapierWorld, THREE, camera etc. are accessed directly via window or assumed global

class Game {
    // --- Constructor ---
    constructor() {
        // Core components to be initialized
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        this.clock = null;
        // Game state references (using globals defined in config.js scope)
        this.players = window.players; // Reference global players object
        this.keys = window.keys; // Reference global keys object
        this.localPlayerMesh = null; // Reference to the local player's VISUAL mesh
        this.mapColliderHandle = null; // Handle for the map collider
        this.playerRigidBodyHandles = {}; // Map of playerId to Rapier rigid body handles
        this.physicsStepAccumulator = 0;
        this.lastNetworkSendTime = 0;
        // Debug Meshes (optional)
        this.debugMeshes = {}; // Map of playerId to debug meshes
        this.DEBUG_SHOW_PLAYER_COLLIDERS = false; // Set true to show wireframes
    }

    // --- Main Initialization Sequence ---
    async init() {
        console.log("--- Game Init Sequence ---");
        if (currentGameInstance) {
            console.warn("Game instance already exists! Aborting new init.");
            return;
        }
        currentGameInstance = this; // Set global reference to this instance

        // Ensure THREE is loaded globally before proceeding
        if (typeof THREE === 'undefined') {
            console.error("!!! CRITICAL: THREE.js library not loaded before Game.init()!");
            // Display fatal error to user
            document.body.innerHTML = "<p style='color:red; text-align:center;'>FATAL ERROR: Graphics Library (THREE.js) failed to load. Check index.html script order.</p>";
            return; // Stop initialization
        }

        // 1. Setup State Machine & UI Listeners (Uses global stateMachine, UIManager)
        stateMachine.transitionTo('loading', { message: 'Initializing Core...' });
        if (!UIManager.initialize()) {
             console.error("UIManager initialization failed!");
             // Display fatal error as UI manager is critical
             document.body.innerHTML = "<p style='color:red; text-align:center;'>FATAL ERROR: UI System Failed to Initialize. Check console (F12).</p>";
             return; // Stop
        }
        UIManager.bindStateListeners(stateMachine);

        // 2. Setup Three.js Core Components
        stateMachine.transitionTo('loading', { message: 'Setting up Graphics...' });
        this.clock = new THREE.Clock();
        this.scene = new THREE.Scene(); window.scene = this.scene; // Assign to global window.scene
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 500); window.camera = this.camera; // Assign to global window.camera
        this.renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('gameCanvas'), antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight); this.renderer.shadowMap.enabled = true; window.renderer = this.renderer; // Assign to global window.renderer

        // 3. Setup PointerLockControls
        if (typeof THREE.PointerLockControls === 'undefined') {
             console.error("!!! THREE.PointerLockControls not found! Check index.html script order.");
             stateMachine.transitionTo('loading', { message: 'FATAL: Controls Library Failed!', error: true }); return;
        }
        this.controls = new THREE.PointerLockControls(this.camera, this.renderer.domElement); window.controls = this.controls; // Assign to global window.controls
        // Add listeners for pointer lock/unlock
        this.controls.addEventListener('lock', () => {
            // console.log("Pointer Locked"); // Less spammy log
            if(stateMachine?.is('playing') && UIManager?.gameUI) { UIManager.gameUI.style.cursor = 'none'; }
        });
        this.controls.addEventListener('unlock', () => {
            // console.log("Pointer Unlocked"); // Less spammy log
            if(stateMachine?.is('playing') && UIManager?.gameUI) { UIManager.gameUI.style.cursor = 'default'; }
        });
        // Add the controls' object (which contains the camera) to the scene
        this.scene.add(this.controls.getObject());

        // 4. Setup Scene Lighting
        this.scene.add(new THREE.AmbientLight(0x606070)); // Ambient light for overall illumination
        const dirLight = new THREE.DirectionalLight(0xffffff, 0.9); // Main directional light
        dirLight.position.set(40, 50, 30); // Position the light source
        dirLight.castShadow = true; // Enable shadow casting
        // Configure shadow properties for quality/performance
        dirLight.shadow.mapSize.width = 2048; dirLight.shadow.mapSize.height = 2048;
        dirLight.shadow.camera.near = 0.5; dirLight.shadow.camera.far = 500;
        // Optional: Adjust shadow camera frustum if needed
        // dirLight.shadow.camera.left = -100; dirLight.shadow.camera.right = 100;
        // dirLight.shadow.camera.top = 100; dirLight.shadow.camera.bottom = -100;
        this.scene.add(dirLight);
        // Optional: Add a helper to visualize the light
        // const dirLightHelper = new THREE.DirectionalLightHelper( dirLight, 10 ); scene.add( dirLightHelper );

        // 5. Initialize Input System (Uses global Input object)
        if (!Input.init(this.controls)) {
            stateMachine.transitionTo('loading', { message: 'Input Init Failed!', error: true }); return;
        }

        // 6. Initialize Effects System (Uses global Effects object)
        if (!Effects.initialize(this.scene, this.camera)) {
            stateMachine.transitionTo('loading', { message: 'Effects Init Failed!', error: true }); return;
        }

        // 7. Initialize Physics (Waits for global RAPIER, assigns to global rapierWorld)
        stateMachine.transitionTo('loading', { message: 'Loading Physics Engine...' });
        if (!window.isRapierReady) { // Check global flag set by rapier_init.js
            console.log("Waiting for Rapier physics engine...");
            // Use event listener to wait for Rapier to be ready
            await new Promise((resolve, reject) => {
                const readyListener = () => { console.log("Heard rapier-ready event."); resolve(); cleanup(); };
                const errorListener = (e) => { console.error("Heard rapier-error event.", e.detail); reject(new Error("Rapier failed to initialize")); cleanup(); };
                const cleanup = () => { window.removeEventListener('rapier-ready', readyListener); window.removeEventListener('rapier-error', errorListener); };
                window.addEventListener('rapier-ready', readyListener, { once: true });
                window.addEventListener('rapier-error', errorListener, { once: true });
            }).catch(err => {
                 console.error("Error waiting for Rapier:", err);
                 stateMachine.transitionTo('loading', { message: 'FATAL: Physics Engine Failed!', error: true }); return;
            });
        }
        this.setupPhysics(); // Setup Rapier world using global RAPIER

        // 8. Setup Asset Loaders (Assigns to global loader/dracoLoader)
        stateMachine.transitionTo('loading', { message: 'Preparing Asset Loaders...' });
        this.setupLoaders();

        // 9. Start Loading Assets (Uses global loadManager)
        stateMachine.transitionTo('loading', { message: 'Loading Game Assets...' });
        loadManager.on('ready', this.onAssetsReady.bind(this));
        loadManager.on('error', this.onLoadError.bind(this));
        loadManager.startLoading();

        // 10. Initialize Networking (Uses global Network object)
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
    setupPhysics() {
        // Uses global RAPIER and assigns to global rapierWorld/EventQueue
        if (!RAPIER) { console.error("!!! RAPIER global object is missing during physics setup!"); return; }
        rapierWorld = new RAPIER.World({ x: 0, y: CONFIG.GRAVITY, z: 0 }); // Use GRAVITY from global CONFIG
        rapierEventQueue = new RAPIER.EventQueue(true); // Enable collision event queue
        window.rapierWorld = rapierWorld; // Assign to global scope
        window.rapierEventQueue = rapierEventQueue; // Assign to global scope
        physicsIsReady = true; // Set global flag
        console.log("[Game] Rapier Physics World Initialized.");
        this.attemptProceedToGame(); // Check if other dependencies are met
    }

    setupLoaders() {
        // Uses global THREE and assigns to global loader/dracoLoader
        if (!THREE) { console.error("!!! THREE missing during loader setup!"); return; }
        if (typeof THREE.DRACOLoader === 'undefined' || typeof THREE.GLTFLoader === 'undefined') {
             console.error("!!! THREE.DRACOLoader or THREE.GLTFLoader constructors not found! Check index.html script order."); return;
        }
        dracoLoader = new THREE.DRACOLoader(); // Assign to global dracoLoader
        dracoLoader.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/libs/draco/'); // Path to Draco decoder files
        loader = new THREE.GLTFLoader(); // Assign to global loader
        loader.setDRACOLoader(dracoLoader);
        window.dracoLoader = dracoLoader; // Explicitly assign to window
        window.loader = loader; // Explicitly assign to window
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
        assetsAreReady = true; // Set global flag
        this.createMapCollider(); // Create collider now map asset is loaded and Rapier is ready
        this.attemptProceedToGame(); // Check prerequisites again
    }

    onLoadError(errorData) {
        console.error("[Game] Asset Load Manager reported 'error':", errorData.message);
        // Use global stateMachine
        stateMachine.transitionTo('loading', { message: `Asset Load Failed!<br/>${errorData.message}`, error: true });
    }

    // --- Check Prerequisites & Transition Logic ---
    attemptProceedToGame() {
        // This is called whenever Assets, Physics, or Network state might have changed.
        // Uses global flags: assetsAreReady, physicsIsReady, networkIsInitialized, initializationData

        console.log(`[Game] Checking prerequisites: Assets=${assetsAreReady}, Physics=${physicsIsReady}, Network=${networkIsInitialized}, InitData=${!!initializationData}`);

        // Condition 1: Everything ready for ACTUAL GAMEPLAY?
        if (assetsAreReady && physicsIsReady && networkIsInitialized && initializationData) {
            // Prevent starting gameplay multiple times if somehow called again after starting
            if (!stateMachine.is('playing')) {
                console.log("[Game] All prerequisites met! Starting gameplay...");
                this.startGamePlay(initializationData); // Pass data to start function
                initializationData = null; // Consume the init data (clear global)
            } else {
                 console.log("[Game] Already in playing state, ignoring redundant attemptProceedToGame for gameplay start.");
            }
        }
        // Condition 2: Ready for HOMESCREEN, but not gameplay yet?
        // Need Assets, Physics, and a Network connection established. Don't need InitData yet.
        // Also check if we are currently in the 'loading' state to prevent unnecessary transitions.
        else if (assetsAreReady && physicsIsReady && networkIsInitialized && !initializationData && stateMachine.is('loading')) {
            console.log("[Game] Core components ready, transitioning to Homescreen...");
            stateMachine.transitionTo('homescreen'); // <<< TRANSITION TO HOMESCREEN
            // UIManager listener for 'homescreen' will handle showing the UI elements.
        }
        // Condition 3: Still waiting for something...
        else {
            // Update loading message if still in loading state and not showing an error
            if (stateMachine.is('loading') && !stateMachine.options.error) {
                let waitMsg = "Initializing...";
                if (!assetsAreReady) waitMsg = "Loading Assets...";
                else if (!physicsIsReady) waitMsg = "Loading Physics...";
                else if (!networkIsInitialized) waitMsg = "Connecting...";
                // No need to mention InitData here, user needs homescreen first
                stateMachine.transitionTo('loading', { message: waitMsg }); // Re-transition to update message
            }
            // console.log("[Game] Prerequisites not yet fully met. Waiting..."); // Less spammy log
        }
    }

    // --- Start Actual Gameplay Logic ---
    startGamePlay(initData) {
        console.log("[Game] --- Starting Gameplay ---");
        // Use global stateMachine, UIManager, players, THREE, RAPIER, Effects, Network, scene, camera, gunMesh, loadManager, CONFIG
        stateMachine.transitionTo('playing'); // Trigger UI change via UIManager listener

        this.cleanupAllPlayers(); // Clear any old state first

        localPlayerId = initData.id; // Set global localPlayerId
        console.log(`[Game] Local Player ID set: ${localPlayerId}`);

        // Process all players received from the server
        for (const id in initData.players) {
            const playerData = initData.players[id]; if (!playerData) continue; // Skip if null/undefined data

            if (id === localPlayerId) {
                // --- Create LOCAL Player ---
                console.log("[Game] Creating LOCAL player objects...");
                // 1. Store data locally (using global players map)
                players[id] = {
                    id: id, name: playerData.name, phrase: playerData.phrase,
                    health: playerData.health, isLocal: true, mesh: null, // Mesh added later
                    x: playerData.x, y: playerData.y, z: playerData.z, rotationY: playerData.rotationY, // Initial server state cache
                };
                window.localPlayerName = playerData.name; // Update global name/phrase for UI etc.
                window.localPlayerPhrase = playerData.phrase;
                UIManager.updateInfo(`Playing as ${playerData.name}`); // Update UI
                UIManager.updateHealthBar(playerData.health); // Update UI

                // 2. Create Physics Body (Dynamic) using instance method
                const playerHeight = CONFIG.PLAYER_HEIGHT; const bodyCenterY = playerData.y + playerHeight / 2.0;
                const startPos = { x: playerData.x, y: bodyCenterY, z: playerData.z };
                this.createPlayerPhysicsBody(id, startPos, playerData.rotationY, true); // true = isLocal

                // 3. Create Visual Mesh (using global playerModelData from loadManager)
                const playerModelAsset = window.playerModelData;
                if (playerModelAsset?.scene) {
                    try {
                        this.localPlayerMesh = playerModelAsset.scene.clone(); // Clone for local player, assign to instance var
                        this.localPlayerMesh.scale.set(0.5, 0.5, 0.5); // Example scale - ADJUST
                        this.localPlayerMesh.visible = false; // Hide local player body for FPS view
                        this.localPlayerMesh.userData = { entityId: id, isPlayer: true, isLocal: true };
                        // Make all submeshes invisible too
                         this.localPlayerMesh.traverse(child => { if(child.isMesh){ child.castShadow=true; child.receiveShadow=true; child.visible=false; } });
                        scene.add(this.localPlayerMesh); // Add to global scene
                        players[id].mesh = this.localPlayerMesh; // Link mesh reference in global players map
                        console.log("[Game] Created local player GLTF mesh (hidden).");
                    } catch(e) { console.error("Error cloning/adding local player mesh:", e); }
                } else { console.error("!!! Local player model asset not found! Cannot create mesh."); }

                 // 4. Attach Gun Model to Camera (using global gunModelData)
                 const gunModelAsset = window.gunModelData;
                 if(gunModelAsset?.scene) {
                     gunMesh = gunModelAsset.scene.clone(); // Assign to global gunMesh var
                     gunMesh.scale.set(0.1, 0.1, 0.1); // Adjust scale as needed
                     // Adjust position/rotation relative to camera VIEW
                     gunMesh.position.set(0.15, -0.15, -0.4); // Right, Down, Forward from camera center - ADJUST
                     gunMesh.rotation.set(0, Math.PI, 0); // Adjust rotation as needed (Y is up)
                      gunMesh.traverse(child => { if (child.isMesh) child.castShadow = true; }); // Gun casts shadows
                     camera.add(gunMesh); // Add gun directly to global camera
                     console.log("[Game] Attached gun model to camera.");
                 } else { console.warn("Gun model asset not ready, cannot attach gun."); }

            } else {
                // --- Create REMOTE Player ---
                console.log(`[Game] Creating REMOTE player objects for ${playerData.name || id}...`);
                // 1. Create ClientPlayer visual instance (uses global THREE/scene/loadManager/etc.)
                const remotePlayer = new ClientPlayer(playerData); // ClientPlayer class handles mesh loading
                players[id] = remotePlayer; // Store in global players map

                // 2. Create Physics Body (Kinematic) - Only if mesh was successfully created
                if (remotePlayer.mesh) {
                    const playerHeight = CONFIG.PLAYER_HEIGHT; const bodyCenterY = playerData.y + playerHeight / 2.0;
                    const startPos = { x: playerData.x, y: bodyCenterY, z: playerData.z };
                    this.createPlayerPhysicsBody(id, startPos, playerData.rotationY, false); // false = remote player
                } else {
                     console.warn(`Skipping physics body creation for remote player ${id}, mesh failed to load.`);
                }
            }
        }
         console.log("[Game] Finished initial player processing.");
    }

    // --- Physics Body Creation ---
    createPlayerPhysicsBody(playerId, initialPosition, initialRotationY, isLocal) {
        // Uses global RAPIER, rapierWorld, CONFIG
        if (!rapierWorld || !RAPIER) { console.error("!!! Physics world/Rapier missing for body creation!"); return; }
        const h = CONFIG.PLAYER_HEIGHT; const r = CONFIG.PLAYER_RADIUS;
        const capsuleHalfHeight = Math.max(0.01, h / 2.0 - r); // Avoid zero height cylinder part

        let rigidBodyDesc;
        let colliderDesc = RAPIER.ColliderDesc.capsuleY(capsuleHalfHeight, r) // Rapier capsule takes half-height of cylinder part
            .setFriction(0.7).setRestitution(0.1).setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS); // Listen for collisions

        // Convert Y rotation to Quaternion using global RAPIER
        const quaternion = RAPIER.Quaternion.fromAxisAngle({ x: 0, y: 1, z: 0 }, initialRotationY);
        if (!quaternion) { console.error(`Failed to create quaternion for player ${playerId}`); return; }

        // Add userData to the collider for identification in collision events
        colliderDesc.userData = { entityId: playerId, isLocal: isLocal, isPlayer: true };

        if (isLocal) {
            // --- Dynamic Body for Local Player ---
            rigidBodyDesc = RAPIER.RigidBodyDesc.dynamic()
                .setTranslation(initialPosition.x, initialPosition.y, initialPosition.z)
                .setRotation(quaternion)
                .setLinearDamping(0.5) // Air resistance feel
                .setAngularDamping(1.0) // Resistance to spinning
                .lockRotations() // Prevent capsule falling over from torque
                .setCcdEnabled(true); // Continuous Collision Detection for fast movement
            colliderDesc.setDensity(1.0); // Give mass to dynamic body based on volume
        } else {
            // --- Kinematic Body for Remote Players ---
            rigidBodyDesc = RAPIER.RigidBodyDesc.kinematicPositionBased() // Moves based on setNextKinematic...
                .setTranslation(initialPosition.x, initialPosition.y, initialPosition.z)
                .setRotation(quaternion); // Set initial kinematic state
        }

        // Create body and collider using global rapierWorld
        try {
            const body = rapierWorld.createRigidBody(rigidBodyDesc);
            if (!body) throw new Error("Rapier RigidBody creation returned null.");
            // Create collider and attach it to the body's handle
            rapierWorld.createCollider(colliderDesc, body.handle);
            // Store the handle in the instance's map
            this.playerRigidBodyHandles[playerId] = body.handle;
            console.log(`[Game] Created ${isLocal ? 'DYNAMIC' : 'KINEMATIC'} Rapier body for player ${playerId} (Handle: ${body.handle})`);
            // Add debug mesh if enabled
            if (this.DEBUG_SHOW_PLAYER_COLLIDERS) {
                this.addDebugMesh(playerId, r, h, initialPosition, quaternion);
            }
        } catch(e) {
             console.error(`!!! Failed to create physics body or collider for ${playerId} (isLocal=${isLocal}):`, e);
        }
    }

    // --- Map Collider Creation ---
    createMapCollider() {
        // Uses global RAPIER, rapierWorld, window.mapMesh (THREE.Object3D from loadManager)
        if (!rapierWorld || !RAPIER || !window.mapMesh) {
            console.warn("Map collider prerequisites (Rapier/World/MapMesh) not met, using simple ground.");
            this.createSimpleGroundCollider(); // Create fallback ground
            return;
        }
        console.log("[Game] Attempting to create map collider from loaded GLTF...");
        try {
            // Process the loaded map scene (window.mapMesh) to extract combined vertices and indices
            const geometries = [];
            window.mapMesh.traverse(child => {
                if (child.isMesh) {
                    // IMPORTANT: Apply world matrix transformation to vertices
                    const clonedGeometry = child.geometry.clone(); // Clone to avoid modifying original
                    clonedGeometry.applyMatrix4(child.matrixWorld); // Apply parent transformations
                    geometries.push(clonedGeometry);
                }
            });

            if (geometries.length === 0) throw new Error("No mesh geometries found within the loaded map asset.");

            // Combine all mesh data into single vertex/index arrays
            const vertices = [];
            const indices = [];
            let currentIndexOffset = 0;

            geometries.forEach(geometry => {
                const positionAttribute = geometry.attributes.position;
                const indexAttribute = geometry.index;

                if (!positionAttribute) return; // Skip meshes without position data

                // Add vertices to the main array
                for (let i = 0; i < positionAttribute.count; i++) {
                    vertices.push(positionAttribute.getX(i), positionAttribute.getY(i), positionAttribute.getZ(i));
                }

                // Add indices to the main array, adjusting for the offset
                if (indexAttribute) {
                    for (let i = 0; i < indexAttribute.count; i++) {
                        indices.push(indexAttribute.getX(i) + currentIndexOffset);
                    }
                } else {
                    // Handle non-indexed geometry (create indices assuming triangles)
                    for (let i = 0; i < positionAttribute.count; i += 3) {
                        indices.push(currentIndexOffset + i, currentIndexOffset + i + 1, currentIndexOffset + i + 2);
                    }
                }
                currentIndexOffset += positionAttribute.count; // Update offset for the next mesh's indices
                geometry.dispose(); // Dispose of the cloned geometry to free memory
            });


            if (vertices.length > 0 && indices.length > 0) {
                // Create Rapier Trimesh collider using the combined data
                 const vertsF32 = new Float32Array(vertices);
                 const indsU32 = new Uint32Array(indices);
                 let colliderDesc = RAPIER.ColliderDesc.trimesh(vertsF32, indsU32)
                     .setFriction(1.0) // High friction for ground surfaces
                     .setRestitution(0.1); // Low bounciness
                 // Creating a collider without a body handle automatically creates a fixed rigid body for it
                 const mapCollider = rapierWorld.createCollider(colliderDesc);
                 this.mapColliderHandle = mapCollider.handle; // Store the handle in the Game instance
                 console.log(`[Game] Trimesh map collider created successfully. Handle: ${this.mapColliderHandle}. Vertices: ${vertices.length / 3}, Triangles: ${indices.length / 3}`);
            } else {
                throw new Error("No valid vertices or indices could be extracted from map meshes.");
            }

        } catch (e) {
            console.error("!!! Error creating Trimesh map collider:", e);
            console.warn("Falling back to simple ground collider due to error.");
            this.createSimpleGroundCollider();
        }
    }

    createSimpleGroundCollider() {
        // Uses global RAPIER, rapierWorld
        if (!rapierWorld || !RAPIER) { console.error("Cannot create simple ground, Rapier/World missing."); return; }
        let colliderDesc = RAPIER.ColliderDesc.cuboid(100.0, 0.5, 100.0) // Large flat plane
             .setTranslation(0, -0.5, 0) // Position it slightly below origin
             .setFriction(1.0);
        const groundCollider = rapierWorld.createCollider(colliderDesc); // Creates fixed body automatically
        this.mapColliderHandle = groundCollider.handle; // Store handle in instance
        console.warn("[Game] Using SIMPLE GROUND COLLIDER (DEBUG/FALLBACK).");
    }

    // --- Debug Mesh Creation ---
    addDebugMesh(playerId, radius, height, position, quaternion) {
         // Uses global scene, THREE
         if (!scene || !THREE) return;
         const capsuleHeight = height - 2 * radius; // Height of cylinder part
         const capsuleGeom = new THREE.CapsuleGeometry(radius, capsuleHeight, 4, 8);
         const wireframeMat = new THREE.MeshBasicMaterial({ color: playerId === localPlayerId ? 0x00ff00 : 0xffff00, wireframe: true });
         const wireframeMesh = new THREE.Mesh(capsuleGeom, wireframeMat);
         // Set position and rotation based on the physics body's state
         wireframeMesh.position.set(position.x, position.y, position.z);
         wireframeMesh.quaternion.set(quaternion.x, quaternion.y, quaternion.z, quaternion.w);
         scene.add(wireframeMesh);
         this.debugMeshes[playerId] = wireframeMesh; // Store in instance map
         // console.log(`[Debug] Added wireframe for ${playerId}`); // Less spammy
    }

    // --- Player Cleanup ---
    cleanupPlayer(playerId) {
        // Uses global players, scene, rapierWorld
        const player = players[playerId];
        // Remove visual mesh
        if (player && player.mesh && scene) {
             scene.remove(player.mesh);
             // Consider more thorough disposal here if performance becomes an issue
             // player.mesh.traverse(c => { if(c.geometry) c.geometry.dispose(); if(c.material) c.material.dispose(); });
             player.mesh = null; // Clear reference
        }
        if (players[playerId]) delete players[playerId]; // Remove from client state map

        // Clear local player specific reference if it matches
        if(playerId === localPlayerId) { this.localPlayerMesh = null; }

        // Remove debug mesh
        if (this.debugMeshes[playerId]) {
             if(scene) scene.remove(this.debugMeshes[playerId]);
             // Dispose geometry/material of debug mesh if they aren't shared
             this.debugMeshes[playerId].geometry?.dispose();
             this.debugMeshes[playerId].material?.dispose();
             delete this.debugMeshes[playerId]; // Remove from instance map
        }

        // Remove physics body
        const bodyHandle = this.playerRigidBodyHandles[playerId];
        if (bodyHandle !== undefined && bodyHandle !== null && rapierWorld) {
             try {
                 let body = rapierWorld.getRigidBody(bodyHandle);
                 if (body) rapierWorld.removeRigidBody(body); // This also removes associated colliders
             } catch (e) { console.error(`Error removing Rapier body handle ${bodyHandle}:`, e); }
             delete this.playerRigidBodyHandles[playerId]; // Remove from instance map
         }
         // console.log(`[Game] Cleaned up player ${playerId}`); // Less spammy
     }

     cleanupAllPlayers() {
         // Uses global players map
         console.log("[Game] Cleaning up all player objects...");
         // Get keys first to avoid issues while iterating and deleting
         const playerIds = Object.keys(players);
         playerIds.forEach(id => this.cleanupPlayer(id));
         // Ensure local player refs are also cleared
         localPlayerId = null; // Clear global ID
         this.localPlayerMesh = null; // Clear instance ref
         this.playerRigidBodyHandles = {}; // Clear instance map
         players = {}; // Clear global players map completely
         console.log("[Game] Player cleanup finished.");
     }

    // --- Main Update Loop ---
    update() {
        requestAnimationFrame(this.update.bind(this));
        // Use global clock, renderer, scene, camera, stateMachine, rapierWorld, RAPIER, players, localPlayerId, updateLocalPlayer, Effects, CONFIG, THREE
        if (!this.clock || !this.renderer || !this.scene || !this.camera) return; // Core components missing

        const deltaTime = this.clock.getDelta();

        // Update logic only when in 'playing' state
        if (stateMachine.is('playing')) {
            // --- Physics Simulation Step ---
            if (rapierWorld && RAPIER) {
                 const physicsTimestep = 1 / 60; // Target 60Hz physics rate
                 this.physicsStepAccumulator += deltaTime;

                 // Use fixed timestep loop for stable physics
                 while (this.physicsStepAccumulator >= physicsTimestep) {
                     // Update local player input & forces BEFORE stepping the world
                     const localPlayerBodyHandle = this.playerRigidBodyHandles[localPlayerId]; // Use instance map
                     if (localPlayerBodyHandle !== undefined && localPlayerBodyHandle !== null) {
                          try {
                              const localBody = rapierWorld.getRigidBody(localPlayerBodyHandle);
                              if (localBody) {
                                  // updateLocalPlayer function (defined in gameLogic.js) uses globals
                                  updateLocalPlayer(physicsTimestep, localBody);
                              }
                          } catch(e) { console.error("Error getting/updating local player body:", e); }
                     }

                     // Step the physics world
                     rapierWorld.step(rapierEventQueue);

                     this.physicsStepAccumulator -= physicsTimestep;
                 } // End fixed timestep loop

                 // --- Handle Collision Events (After stepping) ---
                 rapierEventQueue.drainCollisionEvents((handle1, handle2, started) => {
                     // Example: Log collisions involving the local player
                     const collider1 = rapierWorld.getCollider(handle1);
                     const collider2 = rapierWorld.getCollider(handle2);
                     if(started && collider1?.userData?.isLocal && collider2?.userData?.isPlayer) {
                        // console.log(`Local player collided with player ${collider2.userData.entityId}`);
                     } else if (started && collider2?.userData?.isLocal && collider1?.userData?.isPlayer) {
                        // console.log(`Local player collided with player ${collider1.userData.entityId}`);
                     } else if (started && (collider1?.userData?.isLocal || collider2?.userData?.isLocal)) {
                        // console.log(`Local player collided with map/other object.`);
                     }
                 });
            } // End Physics Step

            // --- Update Remote Player Visuals ---
            // Remote player meshes follow their kinematic bodies directly (Rapier handles interpolation)
            for (const id in players) { // Use global players map
                 if (id === localPlayerId || !players[id]?.mesh) continue; // Skip local or players without meshes

                 const remotePlayer = players[id];
                 const bodyHandle = this.playerRigidBodyHandles[id]; // Use instance map
                 if (bodyHandle !== undefined && bodyHandle !== null && rapierWorld) {
                      try {
                          const body = rapierWorld.getRigidBody(bodyHandle);
                          if (body) {
                              const position = body.translation(); // Get current interpolated physics position
                              const rotation = body.rotation(); // Get current interpolated physics rotation

                              // Position mesh origin (assumed feet) based on physics body center
                              const playerHeight = CONFIG.PLAYER_HEIGHT;
                              remotePlayer.mesh.position.set(position.x, position.y - playerHeight / 2.0, position.z);
                              remotePlayer.mesh.quaternion.copy(rotation); // Apply physics rotation directly

                              // Update debug mesh if enabled
                              if (this.DEBUG_SHOW_PLAYER_COLLIDERS && this.debugMeshes[id]) {
                                   this.debugMeshes[id].position.copy(position); // Debug mesh at body center
                                   this.debugMeshes[id].quaternion.copy(rotation);
                              }
                          }
                      } catch(e) { console.error(`Error updating remote player ${id} visuals:`, e); }
                 }
            } // End Remote Player Visual Update

            // --- Update Camera ---
            // Camera follows the LOCAL player's physics body smoothly
             const localPlayerBodyHandle = this.playerRigidBodyHandles[localPlayerId]; // Use instance map
             if (localPlayerBodyHandle !== undefined && localPlayerBodyHandle !== null && rapierWorld) {
                 try {
                     const localBody = rapierWorld.getRigidBody(localPlayerBodyHandle);
                     if (localBody) {
                         const bodyPos = localBody.translation(); // Physics body center position
                         // Target position slightly above the body center for eye level
                         const targetCameraPos = new THREE.Vector3(bodyPos.x, bodyPos.y + CONFIG.CAMERA_Y_OFFSET, bodyPos.z);
                         // Smoothly interpolate camera position towards the target
                         // Use global camera and THREE
                         camera.position.lerp(targetCameraPos, 0.7); // Adjust lerp factor (0.1 = smooth, 0.9 = snappy)

                         // Camera rotation is handled by PointerLockControls modifying the camera directly
                     }
                 } catch(e) { console.error("Error updating camera position:", e); }
             } // End Camera Update

             // Use global Effects object
             Effects?.update(deltaTime); // Update Effects System

        } // End if(stateMachine.is('playing'))

        // --- Render Scene ---
        this.renderer.render(this.scene, this.camera);
    } // End Update Loop

} // End Game Class

// --- Global Initialization Trigger ---
// Waits for DOMContentLoaded and the 'rapier-ready' event before starting the game
document.addEventListener('DOMContentLoaded', () => {
    const startGameInit = () => {
         console.log("DOM ready. Starting Game Initialization...");
         const game = new Game(); // Create the single game instance
         game.init().catch(error => { // Start initialization
             console.error("Unhandled error during Game Initialization:", error);
              // Attempt to display error via UIManager if it initialized, otherwise use basic message
              if(typeof UIManager !== 'undefined') {
                 UIManager.showLoading(`Initialization Error:<br/>${error.message}`, true);
              } else {
                 document.body.innerHTML = `<p style='color:red; font-size: 1.5em;'>FATAL INITIALIZATION ERROR: ${error.message}</p>`;
              }
         });
    };

    // Check if Rapier is already ready (e.g., script loaded quickly)
    if (window.isRapierReady) {
        startGameInit(); // Start immediately
    } else {
        // Otherwise, wait for the 'rapier-ready' event from rapier_init.js
        console.log("DOM Content Loaded, waiting for Rapier...");
        window.addEventListener('rapier-ready', startGameInit, { once: true });
        // Optional: Add listener for rapier errors as well
        window.addEventListener('rapier-error', () => {
             console.error("Rapier failed to load, cannot start game.");
             // Error message is already shown by rapier_init.js
        }, { once: true });
    }
});
console.log("game.js loaded (Uses Global Scope - v11 Complete)");
