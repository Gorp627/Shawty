// docs/game.js - Main Game Orchestrator (CORRECTED Map Collider v6 - COMPLETE)

// --- Global Flags and Data ---
let networkIsInitialized = false;
let assetsAreReady = false;
let initializationData = null;
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
const DEBUG_FORCE_SPAWN_POS = true; // <<< Force spawn position
const DEBUG_FORCE_SPAWN_Y = 20.0; // <<< Spawn higher Y value
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
        // Game state references (using globals defined in config.js)
        this.players = window.players; // Reference global players object
        this.keys = window.keys; // Reference global keys object
        this.mapMesh = null; // Reference to loaded map mesh
        this.playerRigidBodyHandles = {}; // Rapier rigid body handles
        this.debugMeshes = {}; // Debug meshes for rigid bodies
        this.mapColliderCreated = false; // Flag to ensure map collider is made only once
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
            canvas: document.getElementById('gameCanvas')
        });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.shadowMap.enabled = true;
        window.renderer = this.renderer; // Make renderer global

        // *** Physics World Init ***
        if (!window.isRapierReady) {
            console.error("Rapier not initialized. Aborting game start.");
            UIManager?.showError("Physics Engine Failed!", "loading");
            return;
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
             return;
        }

        this.controls = new THREE.PointerLockControls(this.camera, this.renderer.domElement);
        window.controls = this.controls; // Make controls globally available

        this.scene.add(new THREE.AmbientLight(0x404040, 0.8));
        const dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
        dirLight.position.set(30, 40, 20);
        dirLight.castShadow = true;
        dirLight.shadow.mapSize.width = 2048;
        dirLight.shadow.mapSize.height = 2048;
        this.scene.add(dirLight);

        // --- Loaders Init (Global Scope) ---
        window.dracoLoader = new THREE.DRACOLoader();
        window.dracoLoader.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/libs/draco/'); // Use CDN path
        window.loader = new THREE.GLTFLoader();
        window.loader.setDRACOLoader(window.dracoLoader);
        console.log("[Game] Three.js Loaders initialized globally.");

        // --- Start Asset Loading (Uses global loaders) ---
        await this.loadAssets(); // Now waits for loadManager

        this.initNetwork();
        this.addEventListeners();
        Input.init(this.controls); // Initialize Input system
        this.update();
    }

    async loadAssets() {
        return new Promise((resolve, reject) => {
            console.log("[Game] Starting asset loading via loadManager...");
            loadManager.on('ready', () => {
                console.log("[Game] LoadManager signaled 'ready'. Assets loaded.");
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
                 UIManager?.showError(`Asset Load Failed!<br/>${errorData.message || 'Unknown error'}`, 'loading');
                 assetsAreReady = false;
                 reject(new Error(errorData.message || 'Asset loading failed')); // Reject the promise on error
            });

            loadManager.startLoading(); // Trigger the loading process
        });
    }


    initNetwork() {
        if (typeof Network?.init === 'function') {
            Network.init();
            networkIsInitialized = true;
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
            }
        }, false);
    }

    // *** Physics: Create Player Rigid Body ***
    createPlayerPhysicsBody(playerId, initialPosition) {
        if (!this.rapierWorld || !RAPIER) {
            console.error(`!!! Cannot create physics body for ${playerId}: Physics world or Rapier not initialized!`);
            return;
        }

        try {
            const h = CONFIG.PLAYER_HEIGHT || 1.8;
            const r = CONFIG.PLAYER_RADIUS || 0.4;
            const capsuleHalfHeight = Math.max(0.01, h / 2.0 - r); // Ensure non-negative height

            // Use dynamic body for the local player
            let bd = RAPIER.RigidBodyDesc.dynamic()
                .setTranslation(initialPosition.x, initialPosition.y + h / 2.0, initialPosition.z) // Set initial center position
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
            console.log(`[Game] Created DYNAMIC Rapier body for player ${playerId} (handle: ${body.handle}) at`, initialPosition);

            // Debug visualization
            if (DEBUG_SHOW_PLAYER_COLLIDERS) {
                const capsuleGeom = new THREE.CapsuleGeometry(r, h - 2 * r, 4, 8); // Use THREE's CapsuleGeometry params
                const wireframeMat = new THREE.MeshBasicMaterial({ color: 0xffff00, wireframe: true });
                const wireframeMesh = new THREE.Mesh(capsuleGeom, wireframeMat);
                this.scene.add(wireframeMesh);
                this.debugMeshes[playerId] = wireframeMesh;
                console.log(`[Game] Added debug wireframe for player ${playerId}`);
            }
        } catch(e) {
            console.error(`!!! FAILED to create Rapier body/collider for player ${playerId}:`, e);
        }
    }

    // *** Physics: Create Map Collider (CORRECTED with World Space Vertices) ***
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
            if (child.isMesh && child.name.toLowerCase().includes('collision')) {
                collisionObject = child;
                console.log(`[Game] Found potential collision mesh by name: '${child.name}'`);
                // Optional: break traversal if found? Depends if multiple 'collision' meshes exist
            }
        });

        // Fallback to the first mesh found if no "collision" tagged mesh
        if (!collisionObject) {
            mapSceneObject.traverse(child => {
                if (child.isMesh && !collisionObject) { // Take the first one encountered
                    collisionObject = child;
                    console.warn(`[Game] No mesh named 'collision' found. Using first mesh found: '${child.name}' as fallback.`);
                }
            });
        }

        if (!collisionObject) {
            console.error("!!! No suitable collision mesh found in map scene!");
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

            if (!vertices || !indices) {
                 console.error(`!!! Mesh '${collisionObject.name}' has index buffer but missing vertices or indices array!`);
                 this.createSimpleGroundCollider(); // Fallback
                 console.warn("!!! FALLBACK TO SIMPLE GROUND COLLIDER DUE TO MISSING VERTEX/INDEX DATA.");
                 return;
            }

            // --- Transform Vertices to World Space ---
            const rapierVertices = [];
            const tempVec = new THREE.Vector3(); // Reuse a temporary vector
            console.log(`[Game] Transforming ${vertices.length / 3} vertices to world space...`);
            for (let i = 0; i < vertices.length; i += 3) {
                tempVec.fromArray(vertices, i);     // Get local vertex coordinates
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

                const colliderDesc = RAPIER.ColliderDesc.trimesh(vertsF32, rapierIndices);
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
                      const colliderDesc = RAPIER.ColliderDesc.convexHull(pointsF32);
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


    // *** Physics: Simple Ground Collider (for testing) ***
    createSimpleGroundCollider() {
        if (!this.rapierWorld || !RAPIER) {
            console.error("!!! Cannot create simple ground: Physics world or Rapier not initialized!");
            return;
        }
        try {
            let groundSize = (CONFIG.MAP_BOUNDS_X || 100.0); // Use map bounds for size
            let groundHeight = 1.0;
            let groundY = -groundHeight; // Position it slightly below origin

            let cd = RAPIER.ColliderDesc.cuboid(groundSize, groundHeight / 2.0, groundSize); // Half extents
            let bd = RAPIER.RigidBodyDesc.fixed().setTranslation(0, groundY, 0);
            let body = this.rapierWorld.createRigidBody(bd);
            this.rapierWorld.createCollider(cd, body);
            console.warn("[Game] === CREATED SIMPLE GROUND COLLIDER (DEBUG) ===");
            // this.mapColliderHandle = body.handle; // Store handle if needed
        } catch (e) {
             console.error("!!! FAILED to create simple ground collider:", e);
        }
    }

    // Called by Network.js when 'initialize' event is received and assets are ready
    attemptProceedToGame() {
        console.log(`[Game] attemptProceedToGame called. AssetsReady: ${assetsAreReady}, NetworkInit: ${networkIsInitialized}, RapierReady: ${window.isRapierReady}, InitData: ${!!initializationData}`);
        if (assetsAreReady && networkIsInitialized && window.isRapierReady && initializationData) {
            console.log("[Game] All prerequisites met. Proceeding to start gameplay...");
            this.startGamePlay(initializationData);
            initializationData = null; // Consume the data
        } else {
             console.log("[Game] Prerequisites not yet met. Waiting...");
             // Optionally update loading message
             if (stateMachine?.is('joining') || stateMachine?.is('loading')) {
                 let status = [];
                 if (!assetsAreReady) status.push("Assets");
                 if (!networkIsInitialized) status.push("Network");
                 if (!window.isRapierReady) status.push("Physics");
                 if (!initializationData) status.push("Server Data");
                 UIManager?.showLoading(`Waiting for: ${status.join(', ')}...`);
             }
        }
    }

    // Setup game state based on server initialization data
     startGamePlay(initData) {
         console.log("[Game] startGamePlay with data:", initData);
         if (!initData || !initData.id || !initData.players) {
             console.error("!!! startGamePlay called with invalid initialization data!");
             stateMachine?.transitionTo('homescreen');
             UIManager?.showError("Invalid Game Data!", 'homescreen');
             return;
         }

         localPlayerId = initData.id;
         console.log(`[Game] Local player ID set to: ${localPlayerId}`);

         // Clear any existing players/bodies from previous sessions (important!)
         this.cleanupAllPlayers();

         // Process all players from the initialization data
         for (const playerId in initData.players) {
             const playerData = initData.players[playerId];
             if (!playerData) continue;

             console.log(`[Game] Processing init player: ${playerData.name} (${playerId})`);

             // 1. Create ClientPlayer instance (handles visual mesh)
             const newPlayer = Network._addPlayer(playerData); // Use Network helper

             // 2. Create Physics Body
             if (newPlayer && RAPIER && this.rapierWorld) {
                 const playerHeight = CONFIG.PLAYER_HEIGHT || 1.8;
                 // Server sends Y at feet, calculate center Y for physics body spawn
                 const initialPos = {
                     x: playerData.x,
                     y: playerData.y + (DEBUG_FORCE_SPAWN_POS ? DEBUG_FORCE_SPAWN_Y : 0), // Use feet Y + optional debug offset
                     z: playerData.z
                 };
                 // Adjust Y pos based on player height for center
                 initialPos.y += playerHeight / 2.0;

                 if (playerId === localPlayerId) {
                     // Create LOCAL player physics body (Dynamic)
                     this.createPlayerPhysicsBody(playerId, initialPos);
                     // Make sure local player object has position cache (server sends feet pos)
                     if(players[localPlayerId]) {
                          players[localPlayerId].x = playerData.x;
                          players[localPlayerId].y = playerData.y;
                          players[localPlayerId].z = playerData.z;
                          players[localPlayerId].rotationY = playerData.rotationY || 0;
                     }
                 } else {
                     // Create REMOTE player physics body (Kinematic) - Handled by Network.js on 'playerJoined' normally,
                     // but we need them now for init. We can call a similar creation logic here or rely
                     // on the fact that network.js will create kinematic bodies.
                     // For now, let's assume Network._addPlayer handles visuals and network updates will create physics.
                     // OR explicitly create kinematic here:
                     Network._createKinematicBody(playerData); // You'd need to add this helper in Network.js
                     console.log(`[Game] Created Kinematic body placeholder logic for remote player ${playerId}`);
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
     }

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
                    const body1 = this.rapierWorld.getRigidBody(handle1);
                    const body2 = this.rapierWorld.getRigidBody(handle2);

                    if (body1 && body2) {
                        const playerId1 = this.getPlayerIdByHandle(body1.handle);
                        const playerId2 = this.getPlayerIdByHandle(body2.handle);

                        // Example: Log player-player or player-map collisions
                        if (playerId1 && playerId2) {
                             // console.log(`[Physics Collision] Player ${playerId1} vs Player ${playerId2}`);
                        } else if (playerId1 && (body2.isFixed() || body2.isKinematic())) {
                             // Player vs Map/Kinematic
                             // console.log(`[Physics Collision] Player ${playerId1} vs Static/Kinematic`);
                        } else if (playerId2 && (body1.isFixed() || body1.isKinematic())) {
                             // Player vs Map/Kinematic
                             // console.log(`[Physics Collision] Player ${playerId2} vs Static/Kinematic`);
                        }
                    }
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
                const player = this.players[playerId];
                const bodyHandle = this.playerRigidBodyHandles[playerId];

                if (player?.mesh && bodyHandle !== undefined && bodyHandle !== null) {
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
             if (localPlayerId && this.players[localPlayerId] && this.camera && this.controls && this.controls.isLocked) {
                 try {
                     const localPlayerBody = this.rapierWorld.getRigidBody(this.playerRigidBodyHandles[localPlayerId]);
                     if (localPlayerBody) {
                          const bodyPosition = localPlayerBody.translation(); // Get physics body CENTER position
                          // Camera position is based on body center + offset
                          const cameraTargetPosition = new THREE.Vector3(bodyPosition.x, bodyPosition.y + CONFIG.CAMERA_Y_OFFSET, bodyPosition.z);

                          // Lerp for smoother camera follow (optional)
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

            // *** Minimal Render Loop (for debugging) ***
            if (DEBUG_MINIMAL_RENDER_LOOP) {
                if (this.renderer && this.scene && this.camera) {
                    this.renderer.render(this.scene, this.camera);
                }
                return; // Skip full loop
            }

            // *** Full Render Loop ***
            if (this.renderer && this.scene && this.camera) {
                this.renderer.render(this.scene, this.camera);
            }
        } else {
            // Render something even if not fully playing (e.g., loading/home screen background if canvas visible)
            if (this.renderer && this.scene && this.camera && (stateMachine?.is('loading') || stateMachine?.is('homescreen'))) {
                 // Optionally render a static scene or just clear
                 // this.renderer.render(this.scene, this.camera); // Might render empty scene if map not added
            }
        }
    }

    // *** Helper function to get player ID from Rapier body handle ***
    getPlayerIdByHandle(handle) {
        for (const id in this.playerRigidBodyHandles) {
            if (this.playerRigidBodyHandles[id] === handle) {
                return id;
            }
        }
        return null;
    }

     // Cleanup specific player (mesh and physics body)
     cleanupPlayer(playerId) {
         console.log(`[Game] Cleaning up player: ${playerId}`);
         // Remove visual mesh
         if (this.players[playerId]) {
             this.players[playerId].remove(); // Calls scene.remove and dispose
             delete this.players[playerId];
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
                      console.log(`[Game] Removed Rapier body for ${playerId} (handle: ${bodyHandle})`);
                  }
              } catch (e) {
                  console.error(`[Game] Error removing Rapier body for ${playerId} (handle: ${bodyHandle}):`, e);
              }
              delete this.playerRigidBodyHandles[playerId];
         }
     }

     // Cleanup all players (e.g., on disconnect, before initialization)
     cleanupAllPlayers() {
         console.log("[Game] Cleaning up ALL players...");
         // Iterate over a copy of keys to avoid issues while modifying the object
         const playerIds = Object.keys(this.players);
         playerIds.forEach(id => this.cleanupPlayer(id));
         // Ensure handles are also cleared if somehow out of sync
         this.playerRigidBodyHandles = {};
         this.debugMeshes = {};
         console.log("[Game] All players cleaned up.");
     }

} // End Game Class

// --- Global Initialization ---
document.addEventListener('DOMContentLoaded', async () => {
    // Initialize UI Manager first
    if (!UIManager.initialize()) {
         console.error("!!! UIManager initialization failed. Aborting game setup.");
         // UIManager should have displayed a fatal error message
         return;
    }
    UIManager.showLoading("Initializing..."); // Show initial loading screen

    // Setup State Machine and Listeners
    stateMachine.transitionTo('loading');
    UIManager.bindStateListeners(stateMachine);

    // Listen for Rapier readiness
    if (window.isRapierReady) {
         console.log("[DOM Ready] Rapier already initialized.");
         startGame();
    } else {
         console.log("[DOM Ready] Waiting for 'rapier-ready' event...");
         window.addEventListener('rapier-ready', () => {
             console.log("[DOM Ready] 'rapier-ready' event received.");
             if (stateMachine.is('loading')) { // Only start if still in loading state
                 startGame();
             }
         }, { once: true }); // Listen only once
         window.addEventListener('rapier-error', (event) => {
             console.error("[DOM Ready] 'rapier-error' event received:", event.detail);
             stateMachine.transitionTo('loading', {message:"Physics Engine Failed to Load!", error:true});
             // Game won't start
         }, { once: true });
    }
});

// Function to actually start the game class instance
async function startGame() {
    console.log("[startGame] Attempting to start Game instance...");
    if (!currentGameInstance) {
        stateMachine.transitionTo('loading', {message: "Loading Game..."});
        const game = new Game();
        try {
             await game.start(); // Calls loadAssets, network init etc.
             // Assets and network are now loading asynchronously within game.start/loadAssets
             // Game loop is running. Waiting for assets/network/init data now.
             console.log("[startGame] Game instance started successfully.");
        } catch (error) {
             console.error("!!! Game Initialization failed:", error);
             stateMachine.transitionTo('loading', {message:`Game Init Failed:<br/>${error.message}`, error:true});
        }
    } else {
        console.warn("[startGame] Game instance already exists.");
    }
}

// Add listener for state transitions to cleanup on disconnect/error
stateMachine.on('transition', (data) => {
    if (data.to === 'homescreen' || data.to === 'loading' && data.options?.error) {
        console.log(`[State Listener] Transitioning to ${data.to}, cleaning up game state.`);
        if (currentGameInstance) {
             currentGameInstance.cleanupAllPlayers();
        }
        if (controls?.isLocked) {
             controls.unlock();
        }
        // Reset local player ID etc.
        localPlayerId = null;
        initializationData = null;
        networkIsInitialized = false; // Reset network flag too on disconnect/error back to home/loading
    }
});
