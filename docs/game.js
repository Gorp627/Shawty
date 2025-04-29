// docs/game.js - Main Game Orchestrator (CORRECTED Map Collider v8 - Robust Cleanup)

// --- Global Flags and Data ---
let networkIsInitialized = false; // Set true by Network.js on 'connect'
let assetsAreReady = false; // Set true by loadManager 'ready' callback
let initializationData = null; // Set by Network.js 'initialize' handler
var currentGameInstance = null; // Holds the single Game instance
var RAPIER = window.RAPIER || null; // Will be populated by rapier_init.js
var rapierWorld = null;
var rapierEventQueue = null;
window.isRapierReady = window.isRapierReady || false; // Flag set by rapier_init.js

// Debug flags (Set these for testing)
const USE_SIMPLE_GROUND = false; // <<< Keep false to use actual map VISUALLY
const DEBUG_FORCE_SIMPLE_GROUND_COLLIDER = false; // <<< SET TO false TO USE MAP COLLIDER, true TO DEBUG WITH FLAT PLANE
const DEBUG_FIXED_CAMERA = false; // <<< Use dynamic camera linked to player
const DEBUG_MINIMAL_RENDER_LOOP = false; // <<< Run full game loop
const DEBUG_FORCE_SPAWN_POS = false; // <<< Force specific spawn position (Use server default)
const DEBUG_FORCE_SPAWN_Y = 20.0; // <<< Additive Y value if DEBUG_FORCE_SPAWN_POS is true
const DEBUG_SHOW_PLAYER_COLLIDERS = false; // <<< Show wireframe colliders for players

class Game {
    // --- Constructor ---
    constructor() {
        // Core Three.js components
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        this.clock = null;
        this.cssRenderer = null; // For optional labels
        // Game state references (using globals defined in config.js)
        // Initialize the instance property, but always re-sync with global in critical functions
        this.players = window.players || {};
        this.keys = window.keys || {};
        this.mapMesh = null; // Reference to loaded map mesh
        this.playerRigidBodyHandles = {}; // Rapier rigid body handles
        this.debugMeshes = {}; // Debug meshes for rigid bodies
        this.mapColliderCreated = false; // Flag to ensure map collider is made only once
        console.log("[Game Constructor] Initializing game instance. Initial window.players type:", typeof window.players);
    }

    async start() {
        console.log("--- Game Start ---");
        currentGameInstance = this; // Assign the instance globally
        this.clock = new THREE.Clock();
        this.scene = new THREE.Scene();
        window.scene = this.scene; // Make scene global for entities etc.
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 200);
        window.camera = this.camera; // Make camera global
        this.renderer = new THREE.WebGLRenderer({
            canvas: document.getElementById('gameCanvas'),
            antialias: true // Enable antialiasing
        });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.shadowMap.enabled = true;
        window.renderer = this.renderer; // Make renderer global
        // Optional: Add CSS2DRenderer for labels
        // this.cssRenderer = new THREE.CSS2DRenderer();
        // this.cssRenderer.setSize(window.innerWidth, window.innerHeight);
        // this.cssRenderer.domElement.style.position = 'absolute';
        // this.cssRenderer.domElement.style.top = '0px';
        // document.getElementById('css2dContainer').appendChild(this.cssRenderer.domElement);


        // *** Physics World Init ***
        if (!window.isRapierReady) {
            console.error("Rapier not initialized. Aborting game start.");
            UIManager?.showError("Physics Engine Failed!", "loading");
             throw new Error("Rapier not initialized."); // Throw error to stop startup
        }
        try {
            this.rapierWorld = new RAPIER.World({ x: 0, y: CONFIG.GRAVITY, z: 0 });
            this.rapierEventQueue = new RAPIER.EventQueue(true); // Enable pre-step event queuing
            window.rapierWorld = this.rapierWorld; // Make world global
            window.rapierEventQueue = this.rapierEventQueue; // Make queue global
            console.log("[Game] Rapier World created.");
        } catch (e) {
             console.error("!!! FAILED to create Rapier World:", e);
             UIManager?.showError("Physics World Creation Failed!", "loading");
              throw new Error("Failed to create Rapier World."); // Throw error
        }

        this.controls = new THREE.PointerLockControls(this.camera, this.renderer.domElement);
        window.controls = this.controls; // Make controls globally available

        this.scene.add(new THREE.AmbientLight(0x404040, 0.8)); // Softer ambient
        const dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
        dirLight.position.set(30, 40, 20);
        dirLight.castShadow = true;
        dirLight.shadow.mapSize.width = 2048;
        dirLight.shadow.mapSize.height = 2048;
         // Optional: Adjust shadow camera bounds
         // dirLight.shadow.camera.left = -50;
         // dirLight.shadow.camera.right = 50;
         // dirLight.shadow.camera.top = 50;
         // dirLight.shadow.camera.bottom = -50;
         // dirLight.shadow.camera.near = 0.5;
         // dirLight.shadow.camera.far = 100;
        this.scene.add(dirLight);
        // const dirLightHelper = new THREE.DirectionalLightHelper(dirLight, 5); // Debug light
        // this.scene.add(dirLightHelper);
        // const shadowCamHelper = new THREE.CameraHelper(dirLight.shadow.camera); // Debug shadow frustum
        // this.scene.add(shadowCamHelper);


        // --- Loaders Init (Global Scope) ---
        window.dracoLoader = new THREE.DRACOLoader();
        window.dracoLoader.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/libs/draco/'); // Use CDN path
        window.loader = new THREE.GLTFLoader();
        window.loader.setDRACOLoader(window.dracoLoader);
        console.log("[Game] Three.js Loaders initialized globally.");

        // --- Add Event Listeners Early ---
        this.addEventListeners(); // Window resize etc.
        Input.init(this.controls); // Initialize Input system AFTER controls are created

        // --- Start Network Connection ---
        this.initNetwork(); // Initiates connection attempt

        // --- Start Asset Loading (Uses global loaders) ---
        // Wrap loading and initial state transition in a try/catch
        try {
             await this.loadAssets(); // Waits for loadManager 'ready' or 'error'
             console.log("[Game] Asset loading finished (or failed).");

             // --- !!! CHANGE HERE !!! ---
             // After assets are ready, transition to HOMESCREEN, not playing
             // Network connection might still be in progress, UIManager handles button state
             if (assetsAreReady && !stateMachine.is('playing') && !stateMachine.is('homescreen')) { // Check if assets succeeded
                 console.log("[Game] Assets ready, transitioning to homescreen.");
                 stateMachine.transitionTo('homescreen'); // Let UIManager show the screen and handle join button
             } else if (!assetsAreReady) {
                 console.error("[Game] Assets failed to load, cannot proceed to homescreen.");
                 // LoadManager should have triggered an error state transition already
             }

        } catch(error) {
             console.error("[Game] Error during asset loading phase:", error);
             // State machine should already be in error state via loadManager signal
        }

        // --- Start the Update Loop ---
        this.update(); // Game loop starts running, rendering whatever state we are in

    } // End start()

    async loadAssets() {
        return new Promise((resolve, reject) => {
            console.log("[Game] Starting asset loading via loadManager...");
            loadManager.on('ready', () => {
                console.log("[Game] LoadManager signaled 'ready'. Required assets loaded.");
                this.mapMesh = loadManager.getAssetData('map'); // Get processed map scene object
                if (this.mapMesh) {
                    this.scene.add(this.mapMesh); // Add visual map to the scene
                    console.log("[Game] Added visual map mesh to the scene.");
                    // Create collider AFTER visual mesh is added
                    if (!this.mapColliderCreated) { // Prevent double creation
                        if (DEBUG_FORCE_SIMPLE_GROUND_COLLIDER) {
                            console.log("[Game] DEBUG: Forcing simple ground collider.");
                            this.createSimpleGroundCollider();
                        } else {
                            console.log("[Game] Attempting to create map collider from GLTF...");
                            this.createMapCollider(this.mapMesh); // Use the processed scene object
                        }
                        this.mapColliderCreated = true;
                    }
                } else {
                     console.error("!!! Map asset data ('map') is null after loading!");
                     // Critical error, maybe force simple ground?
                     if (!this.mapColliderCreated) {
                         console.warn("!!! Forcing simple ground collider due to map asset load failure.");
                         this.createSimpleGroundCollider();
                         this.mapColliderCreated = true;
                     }
                }
                assetsAreReady = true;
                resolve(); // Resolve the promise when assets are ready
            });

            loadManager.on('error', (errorData) => {
                 console.error("[Game] LoadManager signaled 'error':", errorData);
                 // UIManager?.showError(`Asset Load Failed!<br/>${errorData.message || 'Unknown error'}`, 'loading'); // UIManager might not be ready
                 assetsAreReady = false;
                 reject(new Error(errorData.message || 'Asset loading failed')); // Reject the promise on error
            });

            // Start loading, loadManager.startLoading now returns a promise
            loadManager.startLoading().catch(err => {
                // Catch potential errors from loader availability checks inside startLoading
                console.error("[Game] Error during loadManager.startLoading() execution:", err);
                // Ensure the main promise is rejected if startLoading fails immediately
                if (!assetsAreReady) { // Avoid rejecting if 'error' event was already handled
                   reject(err);
                }
            });
        });
    }


    initNetwork() {
        if (typeof Network?.init === 'function') {
            Network.init();
            // networkIsInitialized flag is set internally by Network.js on 'connect'
        } else {
            console.error("Network.init is not a function!");
        }
    }

    addEventListeners() {
        window.addEventListener('resize', () => {
            if (this.camera && this.renderer) {
                this.camera.aspect = window.innerWidth / window.innerHeight;
                this.camera.updateProjectionMatrix();
                this.renderer.setSize(window.innerWidth, window.innerHeight);
                // Resize CSS2DRenderer if used
                // if(this.cssRenderer) this.cssRenderer.setSize(window.innerWidth, window.innerHeight);
            }
        }, false);
    }

    createPlayerPhysicsBody(playerId, initialFeetPos) { // Takes FEET position now
        if (!this.rapierWorld || !RAPIER) {
            console.error(`!!! Cannot create physics body for ${playerId}: Physics world or Rapier not initialized!`);
            return;
        }

        try {
            const h = CONFIG.PLAYER_HEIGHT || 1.8;
            const r = CONFIG.PLAYER_RADIUS || 0.4;
            const capsuleHalfHeight = Math.max(0.01, h / 2.0 - r); // Ensure non-negative height

            // Calculate center position from feet position
            const initialCenterPos = {
                 x: initialFeetPos.x,
                 y: initialFeetPos.y + h / 2.0,
                 z: initialFeetPos.z
            };

            // Use dynamic body for the local player
            let bd = RAPIER.RigidBodyDesc.dynamic()
                .setTranslation(initialCenterPos.x, initialCenterPos.y, initialCenterPos.z) // Set initial center position
                .setLinearDamping(0.5) // Add some damping to prevent sliding forever
                .setAngularDamping(1.0) // Prevent excessive spinning
                .lockRotations(); // Lock rotations for capsule player
            let body = this.rapierWorld.createRigidBody(bd);

            let cd = RAPIER.ColliderDesc.capsuleY(capsuleHalfHeight, r) // Use capsuleY convenience method
                 .setFriction(0.7)
                 .setRestitution(0.1) // Low bounce
                 .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS); // Enable collision events
            this.rapierWorld.createCollider(cd, body);

            this.playerRigidBodyHandles[playerId] = body.handle;
            console.log(`[Game] Created DYNAMIC Rapier body for player ${playerId} (handle: ${body.handle}) at center`, initialCenterPos);

            // Debug visualization
            if (DEBUG_SHOW_PLAYER_COLLIDERS) {
                const capsuleGeom = new THREE.CapsuleGeometry(r, h - 2 * r, 4, 8); // Use THREE's CapsuleGeometry params
                const wireframeMat = new THREE.MeshBasicMaterial({ color: 0xffff00, wireframe: true });
                const wireframeMesh = new THREE.Mesh(capsuleGeom, wireframeMat);
                 // Position debug mesh at the CENTER of the physics body
                wireframeMesh.position.set(initialCenterPos.x, initialCenterPos.y, initialCenterPos.z);
                this.scene.add(wireframeMesh);
                this.debugMeshes[playerId] = wireframeMesh;
                console.log(`[Game] Added debug wireframe for player ${playerId}`);
            }
        } catch(e) {
            console.error(`!!! FAILED to create Rapier body/collider for player ${playerId}:`, e);
        }
    }


    createMapCollider(mapSceneObject) {
        if (!this.rapierWorld || !RAPIER || !mapSceneObject) {
            console.error("!!! Cannot create map collider: Physics, Rapier, or Map Scene Object missing!");
            this.createSimpleGroundCollider(); // Fallback
            console.warn("!!! FALLBACK TO SIMPLE GROUND COLLIDER due to missing prerequisites.");
            return;
        }
        console.log("[Game] Starting map collider creation process...");

        let collisionObject = null;
        mapSceneObject.traverse(child => {
             // Find FIRST mesh named 'collision' (case insensitive)
            if (!collisionObject && child.isMesh && child.name.toLowerCase().includes('collision')) {
                collisionObject = child;
                console.log(`[Game] Found potential collision mesh by name: '${child.name}'`);
            }
        });

        // Fallback to the first mesh found if no "collision" tagged mesh
        if (!collisionObject) {
            mapSceneObject.traverse(child => {
                if (!collisionObject && child.isMesh) { // Take the first one encountered
                    collisionObject = child;
                    console.warn(`[Game] No mesh named 'collision' found. Using first mesh found: '${child.name}' as fallback.`);
                }
            });
        }

        if (!collisionObject) {
            console.error("!!! No suitable mesh found in map scene for collision!");
            this.createSimpleGroundCollider(); // Fallback to simple ground on error
            console.warn("!!! FALLBACK TO SIMPLE GROUND COLLIDER DUE TO MISSING MAP COLLISION MESH.");
            return;
        }

        // --- Ensure World Matrix is Up-to-Date ---
        collisionObject.updateMatrixWorld(true); // Crucial! Force update.
        const worldMatrix = collisionObject.matrixWorld;
        const geometry = collisionObject.geometry;

        if (!geometry) {
             console.error(`!!! Collision mesh '${collisionObject.name}' has no geometry!`);
             this.createSimpleGroundCollider(); // Fallback
             console.warn("!!! FALLBACK TO SIMPLE GROUND COLLIDER DUE TO MESH MISSING GEOMETRY.");
             return;
        }

        // --- Indexed Geometry (TriMesh - Preferred) ---
        if (geometry.index) {
            console.log(`[Game] Processing indexed geometry for Trimesh: ${collisionObject.name}`);
            const vertices = geometry.attributes.position.array;
            const indices = geometry.index.array;

            if (!vertices || !indices || !geometry.attributes.position) {
                 console.error(`!!! Mesh '${collisionObject.name}' indexed but missing vertices, indices, or position attribute!`);
                 this.createSimpleGroundCollider(); // Fallback
                 console.warn("!!! FALLBACK TO SIMPLE GROUND COLLIDER DUE TO MISSING VERTEX/INDEX DATA.");
                 return;
            }

            // --- Transform Vertices to World Space ---
            const rapierVertices = [];
            const tempVec = new THREE.Vector3(); // Reuse a temporary vector
            const positionAttribute = geometry.attributes.position;
            console.log(`[Game] Transforming ${positionAttribute.count} vertices to world space...`);
            for (let i = 0; i < positionAttribute.count; i++) {
                tempVec.fromBufferAttribute(positionAttribute, i); // Use fromBufferAttribute for safety
                tempVec.applyMatrix4(worldMatrix);  // Apply the mesh's world transformation
                rapierVertices.push(tempVec.x, tempVec.y, tempVec.z); // Add world vertex coords (Rapier prefers flat array)
            }
            console.log(`[Game] Transformed vertices. Rapier vertices array length: ${rapierVertices.length}`);

            // --- Use original indices (Rapier expects flat array of indices) ---
             const rapierIndices = new Uint32Array(indices.length); // Use appropriate type
             for(let i = 0; i < indices.length; ++i){
                  rapierIndices[i] = indices[i];
             }
            console.log(`[Game] Prepared indices. Rapier indices array length: ${rapierIndices.length}`);

            // --- Create Rapier TriMesh ---
            try {
                // Rapier expects flat Float32Array for vertices and Uint32Array for indices
                const vertsF32 = new Float32Array(rapierVertices);

                const colliderDesc = RAPIER.ColliderDesc.trimesh(vertsF32, rapierIndices)
                    .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS); // Also enable events for map? Optional.
                if (!colliderDesc) throw new Error("Rapier.ColliderDesc.trimesh returned null/undefined.");

                // Make sure the map body is FIXED
                const bodyDesc = RAPIER.RigidBodyDesc.fixed();
                const mapBody = this.rapierWorld.createRigidBody(bodyDesc);
                this.rapierWorld.createCollider(colliderDesc, mapBody); // Attach collider to fixed body

                console.log(`[Game] === Successfully created Trimesh map collider from: ${collisionObject.name} ===`);
                // Optional: Store the map body handle if needed later
                // this.mapColliderHandle = mapBody.handle;

            } catch (e) {
                 console.error(`!!! FAILED to create Rapier TriMesh collider for ${collisionObject.name}:`, e);
                 this.createSimpleGroundCollider(); // Fallback
                 console.warn("!!! FALLBACK TO SIMPLE GROUND COLLIDER DUE TO TRIMESH CREATION ERROR.");
            }

        }
        // --- Non-Indexed Geometry (Convex Hull - Fallback, Less Accurate for Maps) ---
        else if (geometry.attributes.position) {
             console.warn(`[Game] Collision mesh '${collisionObject.name}' has no indices. Attempting Convex Hull (less accurate for complex maps).`);
             const positionAttribute = geometry.attributes.position;
             const points = []; // Array to hold world-space vertex coordinates as {x,y,z}
             const tempVec = new THREE.Vector3();

             console.log(`[Game] Transforming ${positionAttribute.count} vertices for Convex Hull...`);
             for (let i = 0; i < positionAttribute.count; i++) {
                 tempVec.fromBufferAttribute(positionAttribute, i);
                 tempVec.applyMatrix4(worldMatrix); // Apply world transform
                 points.push(tempVec.x, tempVec.y, tempVec.z); // Add world coords (Rapier prefers flat array)
             }
             console.log(`[Game] Transformed vertices for hull. Points array length: ${points.length}`);

             if (points.length >= 12) { // Need at least 4 vertices (12 coords) for a 3D hull
                 try {
                      // Rapier expects flat Float32Array for convexHull points
                      const pointsF32 = new Float32Array(points);
                      const colliderDesc = RAPIER.ColliderDesc.convexHull(pointsF32)
                          .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS); // Optional
                      if (!colliderDesc) throw new Error("Rapier.ColliderDesc.convexHull returned null/undefined.");

                      const bodyDesc = RAPIER.RigidBodyDesc.fixed();
                      const mapBody = this.rapierWorld.createRigidBody(bodyDesc);
                      this.rapierWorld.createCollider(colliderDesc, mapBody);
                      console.warn(`[Game] === Successfully created Convex hull map collider from: ${collisionObject.name} ===`);
                      // this.mapColliderHandle = mapBody.handle;
                 } catch (e) {
                      console.error(`!!! FAILED to create Rapier Convex Hull collider for ${collisionObject.name}:`, e);
                      this.createSimpleGroundCollider(); // Fallback
                      console.warn("!!! FALLBACK TO SIMPLE GROUND COLLIDER DUE TO CONVEX HULL CREATION ERROR.");
                 }
             } else {
                 console.error(`[Game] Not enough vertices (<4) for Convex Hull map collider from '${collisionObject.name}'.`);
                 this.createSimpleGroundCollider(); // Fallback
                 console.warn("!!! FALLBACK TO SIMPLE GROUND COLLIDER DUE TO INSUFFICIENT VERTICES FOR HULL.");
             }
        } else {
            console.error(`!!! Selected collision mesh '${collisionObject.name}' has no position attribute!`);
            this.createSimpleGroundCollider(); // Fallback
            console.warn("!!! FALLBACK TO SIMPLE GROUND COLLIDER DUE TO MESH MISSING POSITION ATTRIBUTE.");
        }
    }

    createSimpleGroundCollider() {
        if (!this.rapierWorld || !RAPIER) {
            console.error("!!! Cannot create simple ground: Physics world or Rapier not initialized!");
            return;
        }
        try {
            let groundSize = (CONFIG.MAP_BOUNDS_X || 100.0); // Use map bounds for size
            let groundHeight = 1.0;
            let groundY = -groundHeight; // Position it slightly below origin

            let cd = RAPIER.ColliderDesc.cuboid(groundSize, groundHeight / 2.0, groundSize) // Half extents
                 .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS); // Optional
            let bd = RAPIER.RigidBodyDesc.fixed().setTranslation(0, groundY, 0);
            let body = this.rapierWorld.createRigidBody(bd);
            this.rapierWorld.createCollider(cd, body);
            console.warn("[Game] === CREATED SIMPLE GROUND COLLIDER (DEBUG) ===");
            // this.mapColliderHandle = body.handle; // Store handle if needed
        } catch (e) {
             console.error("!!! FAILED to create simple ground collider:", e);
        }
    }


    // Called by Network.js when 'initialize' event is received
    attemptProceedToGame() {
        console.log(`[Game] attemptProceedToGame called. AssetsReady: ${assetsAreReady}, NetworkInit: ${networkIsInitialized}, RapierReady: ${window.isRapierReady}, InitData: ${!!initializationData}`);
        // Check all prerequisites INCLUDING initializationData
        if (assetsAreReady && networkIsInitialized && window.isRapierReady && initializationData) {
            console.log("[Game] All prerequisites met (including InitData). Proceeding to start gameplay...");
            this.startGamePlay(initializationData);
            initializationData = null; // Consume the data
        } else {
             console.log("[Game] Prerequisites not yet met for gameplay start. Waiting...");
             // Update loading message if still in joining state
             if (stateMachine?.is('joining')) {
                 let status = [];
                 if (!assetsAreReady) status.push("Assets");
                 if (!networkIsInitialized) status.push("Network"); // Should be true if handleInitialize called
                 if (!window.isRapierReady) status.push("Physics");
                 if (!initializationData) status.push("Server Data"); // Should be true here!
                 UIManager?.showLoading(`Finalizing: ${status.join(', ')}...`);
             } else {
                 // This case shouldn't normally be hit if flow is correct, but log it
                 console.warn("[Game] attemptProceedToGame called but not all prerequisites met and not in 'joining' state.");
             }
        }
    }

    // Setup game state based on server initialization data
     startGamePlay(initData) {
         console.log("[Game] startGamePlay with data:", initData);
         if (!initData || !initData.id || !initData.players) {
             console.error("!!! startGamePlay called with invalid initialization data!");
             stateMachine?.transitionTo('homescreen', {errorMessage: "Invalid Game Data!"});
             return;
         }

         localPlayerId = initData.id;
         console.log(`[Game] Local player ID set to: ${localPlayerId}`);

         // --- Call cleanup *before* processing new players ---
         this.cleanupAllPlayers(); // <<< Moved before the loop

         // Process all players from the initialization data
         for (const playerId in initData.players) {
             const playerData = initData.players[playerId];
             if (!playerData) {
                 console.warn(`[Game Init] Skipping invalid player data for ID: ${playerId}`);
                 continue;
             };

             console.log(`[Game] Processing init player: ${playerData.name} (${playerId})`);

             // 1. Create ClientPlayer instance (handles visual mesh)
             const newPlayer = Network._addPlayer(playerData); // Use Network helper

             // 2. Create Physics Body
             if (newPlayer && RAPIER && this.rapierWorld) {
                 const initialFeetPos = { // Server sends feet position
                     x: playerData.x,
                     y: playerData.y,
                     z: playerData.z
                 };
                 // Add optional debug Y offset ONLY for forced spawn testing
                 if(DEBUG_FORCE_SPAWN_POS && playerId === localPlayerId) {
                     initialFeetPos.y += DEBUG_FORCE_SPAWN_Y;
                     console.log(`[Game Debug] Applying forced spawn Y offset. New feet Y: ${initialFeetPos.y}`);
                 }


                 if (playerId === localPlayerId) {
                     // Create LOCAL player physics body (Dynamic) - Pass FEET position
                     this.createPlayerPhysicsBody(playerId, initialFeetPos);
                     // Make sure local player object has position cache (server sends feet pos)
                     if(players[localPlayerId]) {
                          players[localPlayerId].x = playerData.x;
                          players[localPlayerId].y = playerData.y;
                          players[localPlayerId].z = playerData.z;
                          players[localPlayerId].rotationY = playerData.rotationY || 0;
                          // Reset last sent data
                          players[localPlayerId].lastSentX = null;
                          players[localPlayerId].lastSentY = null;
                          players[localPlayerId].lastSentZ = null;
                          players[localPlayerId].lastSentRotationY = null;
                     }
                 } else {
                     // Create REMOTE player physics body (Kinematic)
                     Network._createKinematicBody(playerData); // Creates body and stores handle
                 }
             } else {
                  console.warn(`[Game] Skipping physics body for init player ${playerId}. Missing player instance, Rapier, or World.`);
             }
         }

         // Initial health update for local player
         if (players[localPlayerId] && UIManager) {
            UIManager.updateHealthBar(players[localPlayerId].health);
         }

         // Transition UI state
         stateMachine?.transitionTo('playing'); // UIManager listens for this
         console.log("[Game] Transitioned to 'playing' state.");
     } // End startGamePlay


    // --- Update Loop ---
    update() {
        requestAnimationFrame(this.update.bind(this));
        const deltaTime = this.clock.getDelta();

        // Only run main game loop if Rapier is ready and we are in 'playing' state
        if (window.isRapierReady && this.rapierWorld && stateMachine?.is('playing')) {

            // *** Physics Step ***
            try {
                this.rapierWorld.step(this.rapierEventQueue);
            } catch (e) {
                 console.error("!!! Rapier World Step Error:", e);
                 // Potentially pause game or handle error state
            }

            // *** Handle Collision Events ***
            try {
                this.rapierEventQueue.drainCollisionEvents((handle1, handle2, started) => {
                    // Collision logging (optional)
                    // console.log(`[Physics Collision] Handle1: ${handle1}, Handle2: ${handle2}, Started: ${started}`);
                    // You could add logic here for collision sounds, effects, or game rules (e.g., detecting ground contact more reliably)
                });
            } catch (e) {
                 console.error("!!! Error draining collision events:", e);
            }


            // *** Update Local Player Physics based on Input ***
            if (localPlayerId && this.playerRigidBodyHandles[localPlayerId]) {
                try {
                    const localPlayerBody = this.rapierWorld.getRigidBody(this.playerRigidBodyHandles[localPlayerId]);
                    if (localPlayerBody) {
                        updateLocalPlayer(deltaTime, localPlayerBody); // Call logic from gameLogic.js
                    } else {
                         // This could happen if the body was removed unexpectedly
                         console.warn(`[Game Update] Local player body (handle: ${this.playerRigidBodyHandles[localPlayerId]}) not found!`);
                         // Maybe trigger a respawn or reconnect?
                    }
                } catch (e) {
                    console.error(`!!! Error getting/updating local player body:`, e);
                }
            }


            // *** Synchronize THREE.js Meshes with Rapier Bodies ***
            for (const playerId in this.players) {
                 // Ensure player exists before accessing mesh/handle
                 const player = this.players[playerId];
                 if (!player) continue;

                 const bodyHandle = this.playerRigidBodyHandles[playerId];

                 if (player.mesh && bodyHandle !== undefined && bodyHandle !== null) {
                     try {
                         const body = this.rapierWorld.getRigidBody(bodyHandle);
                         if (body) {
                             const position = body.translation(); // This is the CENTER of the Rapier body
                             const rotation = body.rotation(); // This is a Quaternion

                             // Adjust position for THREE mesh based on capsule height
                             // THREE mesh origin should be at the base/feet typically
                             const playerHeight = CONFIG.PLAYER_HEIGHT || 1.8;
                             player.mesh.position.set(position.x, position.y - playerHeight / 2.0, position.z);

                             // Apply Rapier rotation quaternion directly to THREE mesh
                             player.mesh.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w);

                             // Update debug mesh if it exists
                             if (DEBUG_SHOW_PLAYER_COLLIDERS && this.debugMeshes[playerId]) {
                                 // Debug mesh center should match Rapier body center
                                 this.debugMeshes[playerId].position.set(position.x, position.y, position.z);
                                 this.debugMeshes[playerId].quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w);
                             }
                         } else {
                              // console.warn(`[Game Sync] Rapier body not found for player ${playerId} (handle ${bodyHandle}) during sync.`);
                         }
                     } catch (e) {
                         console.error(`[Game Sync] Error updating mesh for player ${playerId}:`, e);
                     }
                 }
             }


            // *** Camera Update (Follow Local Player) ***
             if (localPlayerId && this.playerRigidBodyHandles[localPlayerId] && this.camera && this.controls && this.controls.isLocked) {
                 try {
                     const localPlayerBody = this.rapierWorld.getRigidBody(this.playerRigidBodyHandles[localPlayerId]);
                     if (localPlayerBody) {
                          const bodyPosition = localPlayerBody.translation(); // Get physics body CENTER position
                          // Camera position is based on body center + offset
                          const cameraTargetPosition = new THREE.Vector3(bodyPosition.x, bodyPosition.y + CONFIG.CAMERA_Y_OFFSET, bodyPosition.z);

                          // Lerp for smoother camera follow (optional, adjust factor 0.0-1.0)
                          // this.camera.position.lerp(cameraTargetPosition, 0.2);
                          this.camera.position.copy(cameraTargetPosition); // Direct copy is simpler

                          // PointerLockControls target remains the camera position (it handles rotation internally)
                     }
                 } catch (e) {
                     console.error("[Game] Camera sync error:", e);
                 }
             } else if (this.controls && !this.controls.isLocked && stateMachine?.is('playing')) {
                 // If playing but controls become unlocked (e.g., died, menu)
                 // Optional: Reset camera slightly or just leave it where it was
             }

            // *** Render Scene ***
            if (this.renderer && this.scene && this.camera) {
                this.renderer.render(this.scene, this.camera);
                 // Render CSS2D labels if used
                 // if(this.cssRenderer) this.cssRenderer.render(this.scene, this.camera);
            }
        } else {
            // Render something even if not fully playing (e.g., loading/home screen background if canvas visible)
            // This might be needed if you have a background scene element visible before joining
            if (this.renderer && this.scene && this.camera) {
                 // Render a minimal scene or clear the buffer
                  this.renderer.render(this.scene, this.camera);
                 // if(this.cssRenderer) this.cssRenderer.render(this.scene, this.camera);
            }
        }
    } // End update()

    getPlayerIdByHandle(handle) {
        for (const id in this.playerRigidBodyHandles) {
            if (this.playerRigidBodyHandles[id] === handle) {
                return id;
            }
        }
        return null;
    }

     cleanupPlayer(playerId) {
         console.log(`[Game] Cleaning up player: ${playerId}`);
         // Remove visual mesh
         const player = this.players[playerId]; // Get reference from instance property
         if (player) {
             player.remove(); // Calls scene.remove and dispose
             // Delete from the global object that this.players references
             if (window.players && window.players[playerId]) {
                  delete window.players[playerId];
             } else {
                  console.warn(`[Game cleanupPlayer] window.players[${playerId}] was already missing?`);
             }
         } else {
              console.warn(`[Game cleanupPlayer] Player object for ${playerId} not found in this.players`);
         }

         // Remove debug mesh
         if (this.debugMeshes[playerId]) {
             this.scene.remove(this.debugMeshes[playerId]);
             this.debugMeshes[playerId].geometry?.dispose();
             this.debugMeshes[playerId].material?.dispose();
             delete this.debugMeshes[playerId];
         }
         // Remove physics body
         const bodyHandle = this.playerRigidBodyHandles[playerId];
         if (bodyHandle !== undefined && bodyHandle !== null && this.rapierWorld) {
              try {
                  const body = this.rapierWorld.getRigidBody(bodyHandle);
                  if (body) {
                      this.rapierWorld.removeRigidBody(body);
                      // console.log(`[Game] Removed Rapier body for ${playerId} (handle: ${bodyHandle})`);
                  }
              } catch (e) {
                  // Log error but continue cleanup
                  console.error(`[Game] Error removing Rapier body for ${playerId} (handle: ${bodyHandle}):`, e);
              }
              // Still delete the handle reference even if removal failed
              delete this.playerRigidBodyHandles[playerId];
         }
     } // End cleanupPlayer

     // *** MODIFIED cleanupAllPlayers ***
     cleanupAllPlayers() {
         console.log("[Game] Cleaning up ALL players...");

         // ---> Ensure window.players is an object <---
         if (typeof window.players !== 'object' || window.players === null) {
             console.warn("[Game] Global window.players was invalid during cleanup. Resetting to {}. Value was:", window.players);
             window.players = {};
         }
         // ---> Always re-link this.players to the global object within this function's scope <---
         this.players = window.players;

         // Optional Debug Log:
         console.log("[Game] cleanupAllPlayers: typeof this.players is now:", typeof this.players, "Value:", this.players);

         // Now, this check should be redundant if the above worked, but keep for safety:
         if (!this.players) { // Simplified check now, just needs to not be null/undefined
              console.error("!!! [Game] CRITICAL: Failed to ensure this.players is an object in cleanupAllPlayers!");
              // Avoid proceeding if it's still broken
              this.playerRigidBodyHandles = {}; // Clear handles anyway
              this.debugMeshes = {}; // Clear meshes anyway
              return; // Exit early
         }

         // Iterate over a copy of keys to avoid issues while modifying the object
         const playerIds = Object.keys(this.players); // Line 706 - should be safe now
         console.log(`[Game cleanupAllPlayers] Found player IDs to clean: [${playerIds.join(', ')}]`);
         playerIds.forEach(id => {
              // Add extra check inside the loop too? Paranoia level high.
              if (this.players && this.players[id]) {
                 this.cleanupPlayer(id); // Call the cleanup function for each player
              } else {
                 console.warn(`[Game] cleanupAllPlayers: Player ID ${id} became invalid during iteration? Skipping cleanupPlayer.`);
              }
         });

         // Ensure handles and debug meshes are also cleared if somehow out of sync
         this.playerRigidBodyHandles = {};
         this.debugMeshes = {};
         console.log("[Game] All players and related data cleaned up.");
     } // End cleanupAllPlayers


} // End Game Class

// --- Global Initialization (Revised Flow) ---
document.addEventListener('DOMContentLoaded', async () => {
    console.log("[DOM Ready] Initializing...")
    // Initialize UI Manager first
    if (!UIManager.initialize()) {
         console.error("!!! UIManager initialization failed. Aborting game setup.");
         return;
    }
    UIManager.showLoading("Initializing Core Systems..."); // Show initial loading screen

    // Setup State Machine and Listeners
    stateMachine.transitionTo('loading');
    UIManager.bindStateListeners(stateMachine);
    addStateCleanupListener(); // Add listener for cleaning up on state transitions

    // Wait for Rapier (async)
    try {
        await waitForRapier();
        console.log("[DOM Ready] Rapier is ready.");
        // Rapier ready, now start the main game setup
        await startGame(); // Start game instance, load assets, connect network
        console.log("[DOM Ready] Game startup process initiated.");
        // The game flow now handles transitioning to homescreen after assets/network are ready

    } catch (error) {
         console.error("[DOM Ready] Initialization failed:", error);
         stateMachine.transitionTo('loading', {message: `Initialization Error:<br/>${error.message || 'Unknown error'}`, error:true});
    }
});

// Promisified Rapier initialization wait
function waitForRapier() {
    return new Promise((resolve, reject) => {
        if (window.isRapierReady) {
             console.log("[waitForRapier] Rapier already initialized.");
             resolve();
        } else {
             console.log("[waitForRapier] Waiting for 'rapier-ready' event...");
             const readyListener = () => {
                 console.log("[waitForRapier] 'rapier-ready' event received.");
                 window.removeEventListener('rapier-error', errorListener); // Clean up error listener
                 resolve();
             };
             const errorListener = (event) => {
                 console.error("[waitForRapier] 'rapier-error' event received:", event.detail);
                 window.removeEventListener('rapier-ready', readyListener); // Clean up ready listener
                 reject(event.detail || new Error("Rapier failed to load"));
             };
             window.addEventListener('rapier-ready', readyListener, { once: true });
             window.addEventListener('rapier-error', errorListener, { once: true });
        }
    });
}


// Function to actually start the game class instance
async function startGame() {
    console.log("[startGame] Attempting to start Game instance...");
    if (!currentGameInstance) {
        stateMachine.transitionTo('loading', {message: "Loading Game Components..."});
        const game = new Game();
        // No need for try-catch here as errors in game.start() should be caught by the caller in DOMContentLoaded
        await game.start(); // Calls loadAssets, network init etc.
        console.log("[startGame] Game instance start() method finished.");
    } else {
        console.warn("[startGame] Game instance already exists.");
    }
}

// Add listener for state transitions to cleanup on disconnect/error
function addStateCleanupListener() {
    stateMachine.on('transition', (data) => {
        // Cleanup when going back to homescreen or loading (with error) from playing/joining
        if ((data.to === 'homescreen' || (data.to === 'loading' && data.options?.error)) &&
            (data.from === 'playing' || data.from === 'joining'))
        {
            console.log(`[State Listener] Transitioning from ${data.from} -> ${data.to}, cleaning up game state.`);
            if (currentGameInstance) {
                 currentGameInstance.cleanupAllPlayers();
            }
            if (controls?.isLocked) {
                 controls.unlock(); // Ensure controls are unlocked
            }
            // Reset local player ID etc.
            localPlayerId = null;
            initializationData = null; // Clear server data
            // networkIsInitialized flag is handled by network.js connect/disconnect handlers
            console.log("[State Listener] Game state cleaned up.");
        }
    });
}
