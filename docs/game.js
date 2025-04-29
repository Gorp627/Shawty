// docs/game.js - Main Game Orchestrator (v10 - Fix Rapier CapsuleDesc, Fix Entity Mesh Sync)

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
        console.log("[Game Constructor] Running...");
        console.log("[Game Constructor] BEFORE assignment: this.players:", this.players, "window.players:", window.players, "window.ClientPlayer:", typeof window.ClientPlayer);

        // Core Three.js components
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        this.clock = null;
        this.cssRenderer = null; // For optional labels
        // Game state references (using globals defined in config.js)
        this.players = window.players || {};
        this.keys = window.keys || {};
        this.mapMesh = null; // Reference to loaded map mesh
        this.playerRigidBodyHandles = {}; // Rapier rigid body handles
        this.debugMeshes = {}; // Debug meshes for rigid bodies
        this.mapColliderCreated = false; // Flag to ensure map collider is made only once

        console.log("[Game Constructor] AFTER assignment: this.players type:", typeof this.players, "Value:", this.players);
        console.log("[Game Constructor] FINISHED.");
    }

    async start() {
        console.log("--- Game Start ---");
        currentGameInstance = this;
        this.clock = new THREE.Clock();
        this.scene = new THREE.Scene();
        window.scene = this.scene;
        this.scene.background = new THREE.Color(0x87CEEB); // Sky blue color

        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 200);
        window.camera = this.camera;
        this.renderer = new THREE.WebGLRenderer({
            canvas: document.getElementById('gameCanvas'),
            antialias: true
        });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.shadowMap.enabled = true;
        window.renderer = this.renderer;


        // *** Physics World Init ***
        if (!window.isRapierReady) {
            console.error("Rapier not initialized. Aborting game start.");
            UIManager?.showError("Physics Engine Failed!", "loading");
             throw new Error("Rapier not initialized.");
        }
        try {
            this.rapierWorld = new RAPIER.World({ x: 0, y: CONFIG.GRAVITY, z: 0 });
            this.rapierEventQueue = new RAPIER.EventQueue(true);
            window.rapierWorld = this.rapierWorld;
            window.rapierEventQueue = this.rapierEventQueue;
            console.log("[Game] Rapier World created.");
        } catch (e) {
             console.error("!!! FAILED to create Rapier World:", e);
             UIManager?.showError("Physics World Creation Failed!", "loading");
              throw new Error("Failed to create Rapier World.");
        }

        this.controls = new THREE.PointerLockControls(this.camera, this.renderer.domElement);
        window.controls = this.controls;

        this.scene.add(new THREE.AmbientLight(0x404040, 0.8));
        const dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
        dirLight.position.set(30, 40, 20);
        dirLight.castShadow = true;
        dirLight.shadow.mapSize.width = 2048;
        dirLight.shadow.mapSize.height = 2048;
        this.scene.add(dirLight);


        // --- Loaders Init (Global Scope) ---
        window.dracoLoader = new THREE.DRACOLoader();
        window.dracoLoader.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/libs/draco/');
        window.loader = new THREE.GLTFLoader();
        window.loader.setDRACOLoader(window.dracoLoader);
        console.log("[Game] Three.js Loaders initialized globally.");

        // --- Add Event Listeners Early ---
        this.addEventListeners();
        Input.init(this.controls);

        // --- Start Network Connection ---
        this.initNetwork();

        // --- Start Asset Loading ---
        try {
             await this.loadAssets();
             console.log("[Game] Asset loading finished (or failed).");

             if (assetsAreReady && !stateMachine.is('playing') && !stateMachine.is('homescreen')) {
                 console.log("[Game] Assets ready, transitioning to homescreen.");
                 stateMachine.transitionTo('homescreen');
             } else if (!assetsAreReady) {
                 console.error("[Game] Assets failed to load, cannot proceed to homescreen.");
             }

        } catch(error) {
             console.error("[Game] Error during asset loading phase:", error);
        }

        // --- Start the Update Loop ---
        this.update();

    } // End start()

    async loadAssets() {
        return new Promise((resolve, reject) => {
            console.log("[Game] Starting asset loading via loadManager...");
            loadManager.on('ready', () => {
                console.log("[Game] LoadManager signaled 'ready'. Required assets loaded.");
                this.mapMesh = loadManager.getAssetData('map'); // Get processed map scene object
                if (this.mapMesh) {
                    this.scene.add(this.mapMesh);
                    console.log("[Game] Added visual map mesh to the scene.");
                    if (!this.mapColliderCreated) {
                        if (DEBUG_FORCE_SIMPLE_GROUND_COLLIDER) {
                            console.log("[Game] DEBUG: Forcing simple ground collider.");
                            this.createSimpleGroundCollider();
                        } else {
                            console.log("[Game] Attempting to create map collider from GLTF...");
                            this.createMapCollider(this.mapMesh);
                        }
                        this.mapColliderCreated = true;
                    }
                } else {
                     console.error("!!! Map asset data ('map') is null after loading!");
                     if (!this.mapColliderCreated) {
                         console.warn("!!! Forcing simple ground collider due to map asset load failure.");
                         this.createSimpleGroundCollider();
                         this.mapColliderCreated = true;
                     }
                }
                assetsAreReady = true;
                resolve();
            });

            loadManager.on('error', (errorData) => {
                 console.error("[Game] LoadManager signaled 'error':", errorData);
                 assetsAreReady = false;
                 reject(new Error(errorData.message || 'Asset loading failed'));
            });

            loadManager.startLoading().catch(err => {
                console.error("[Game] Error during loadManager.startLoading() execution:", err);
                if (!assetsAreReady) {
                   reject(err);
                }
            });
        });
    }


    initNetwork() {
        if (typeof Network?.init === 'function') {
            Network.init();
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

    createPlayerPhysicsBody(playerId, initialFeetPos) {
        if (!this.rapierWorld || !RAPIER) {
            console.error(`!!! Cannot create physics body for ${playerId}: Physics world or Rapier not initialized!`);
            return;
        }

        try {
            const h = CONFIG.PLAYER_HEIGHT || 1.8;
            const r = CONFIG.PLAYER_RADIUS || 0.4;
            const capsuleHalfHeight = Math.max(0.01, h / 2.0 - r); // Rapier capsule halfHeight is cylinder part

            const initialCenterPos = {
                 x: initialFeetPos.x,
                 y: initialFeetPos.y + h / 2.0, // Calculate center Y from feet Y
                 z: initialFeetPos.z
            };

            let bd = RAPIER.RigidBodyDesc.dynamic()
                .setTranslation(initialCenterPos.x, initialCenterPos.y, initialCenterPos.z)
                .setLinearDamping(0.5)
                .setAngularDamping(1.0)
                .lockRotations();
            let body = this.rapierWorld.createRigidBody(bd);

            // ---> Use RAPIER.ColliderDesc.capsule() <---
            let cd = RAPIER.ColliderDesc.capsule(capsuleHalfHeight, r) // Takes half_height, radius
                 .setFriction(0.7)
                 .setRestitution(0.1)
                 .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);
            // ---> END CHANGE <---

            this.rapierWorld.createCollider(cd, body);

            this.playerRigidBodyHandles[playerId] = body.handle;
            console.log(`[Game] Created DYNAMIC Rapier body for player ${playerId} (handle: ${body.handle}) at center`, initialCenterPos);

            if (DEBUG_SHOW_PLAYER_COLLIDERS) {
                // Use Cylinder for debug mesh since THREE.Capsule isn't available in r128
                const debugGeo = new THREE.CylinderGeometry(r, r, h, 8);
                const wireframeMat = new THREE.MeshBasicMaterial({ color: 0xffff00, wireframe: true });
                const wireframeMesh = new THREE.Mesh(debugGeo, wireframeMat);
                wireframeMesh.position.set(initialCenterPos.x, initialCenterPos.y, initialCenterPos.z); // Position center
                this.scene.add(wireframeMesh);
                this.debugMeshes[playerId] = wireframeMesh;
                console.log(`[Game] Added debug CYLINDER wireframe for player ${playerId}`);
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
            if (!collisionObject && child.isMesh && child.name.toLowerCase().includes('collision')) {
                collisionObject = child;
                console.log(`[Game] Found potential collision mesh by name: '${child.name}'`);
            }
        });

        if (!collisionObject) {
            mapSceneObject.traverse(child => {
                if (!collisionObject && child.isMesh) {
                    collisionObject = child;
                    console.warn(`[Game] No mesh named 'collision' found. Using first mesh found: '${child.name}' as fallback.`);
                }
            });
        }

        if (!collisionObject) {
            console.error("!!! No suitable mesh found in map scene for collision!");
            this.createSimpleGroundCollider(); // Fallback
            console.warn("!!! FALLBACK TO SIMPLE GROUND COLLIDER DUE TO MISSING MAP COLLISION MESH.");
            return;
        }

        collisionObject.updateMatrixWorld(true); // Crucial!
        const worldMatrix = collisionObject.matrixWorld;
        const geometry = collisionObject.geometry;

        if (!geometry) {
             console.error(`!!! Collision mesh '${collisionObject.name}' has no geometry!`);
             this.createSimpleGroundCollider(); // Fallback
             console.warn("!!! FALLBACK TO SIMPLE GROUND COLLIDER DUE TO MESH MISSING GEOMETRY.");
             return;
        }

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

            const rapierVertices = [];
            const tempVec = new THREE.Vector3();
            const positionAttribute = geometry.attributes.position;
            console.log(`[Game] Transforming ${positionAttribute.count} vertices to world space...`);
            for (let i = 0; i < positionAttribute.count; i++) {
                tempVec.fromBufferAttribute(positionAttribute, i);
                tempVec.applyMatrix4(worldMatrix);
                rapierVertices.push(tempVec.x, tempVec.y, tempVec.z);
            }
            console.log(`[Game] Transformed vertices. Rapier vertices array length: ${rapierVertices.length}`);

             const rapierIndices = new Uint32Array(indices.length);
             for(let i = 0; i < indices.length; ++i){
                  rapierIndices[i] = indices[i];
             }
            console.log(`[Game] Prepared indices. Rapier indices array length: ${rapierIndices.length}`);

            try {
                const vertsF32 = new Float32Array(rapierVertices);
                const colliderDesc = RAPIER.ColliderDesc.trimesh(vertsF32, rapierIndices)
                    .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);
                if (!colliderDesc) throw new Error("Rapier.ColliderDesc.trimesh returned null/undefined.");

                const bodyDesc = RAPIER.RigidBodyDesc.fixed();
                const mapBody = this.rapierWorld.createRigidBody(bodyDesc);
                this.rapierWorld.createCollider(colliderDesc, mapBody);

                console.log(`[Game] === Successfully created Trimesh map collider from: ${collisionObject.name} ===`);

            } catch (e) {
                 console.error(`!!! FAILED to create Rapier TriMesh collider for ${collisionObject.name}:`, e);
                 this.createSimpleGroundCollider(); // Fallback
                 console.warn("!!! FALLBACK TO SIMPLE GROUND COLLIDER DUE TO TRIMESH CREATION ERROR.");
            }

        }
        else if (geometry.attributes.position) {
             console.warn(`[Game] Collision mesh '${collisionObject.name}' has no indices. Attempting Convex Hull...`);
             const positionAttribute = geometry.attributes.position;
             const points = [];
             const tempVec = new THREE.Vector3();

             console.log(`[Game] Transforming ${positionAttribute.count} vertices for Convex Hull...`);
             for (let i = 0; i < positionAttribute.count; i++) {
                 tempVec.fromBufferAttribute(positionAttribute, i);
                 tempVec.applyMatrix4(worldMatrix);
                 points.push(tempVec.x, tempVec.y, tempVec.z);
             }
             console.log(`[Game] Transformed vertices for hull. Points array length: ${points.length}`);

             if (points.length >= 12) {
                 try {
                      const pointsF32 = new Float32Array(points);
                      const colliderDesc = RAPIER.ColliderDesc.convexHull(pointsF32)
                          .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);
                      if (!colliderDesc) throw new Error("Rapier.ColliderDesc.convexHull returned null/undefined.");

                      const bodyDesc = RAPIER.RigidBodyDesc.fixed();
                      const mapBody = this.rapierWorld.createRigidBody(bodyDesc);
                      this.rapierWorld.createCollider(colliderDesc, mapBody);
                      console.warn(`[Game] === Successfully created Convex hull map collider from: ${collisionObject.name} ===`);
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
            let groundSize = (CONFIG.MAP_BOUNDS_X || 100.0);
            let groundHeight = 1.0;
            let groundY = -groundHeight;

            let cd = RAPIER.ColliderDesc.cuboid(groundSize, groundHeight / 2.0, groundSize)
                 .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);
            let bd = RAPIER.RigidBodyDesc.fixed().setTranslation(0, groundY, 0);
            let body = this.rapierWorld.createRigidBody(bd);
            this.rapierWorld.createCollider(cd, body);
            console.warn("[Game] === CREATED SIMPLE GROUND COLLIDER (DEBUG) ===");
        } catch (e) {
             console.error("!!! FAILED to create simple ground collider:", e);
        }
    }


    // Called by Network.js when 'initialize' event is received
    attemptProceedToGame() {
        console.log(`[Game] attemptProceedToGame called.`);
        console.log(` - AssetsReady: ${assetsAreReady}`);
        console.log(` - NetworkInit: ${networkIsInitialized}`);
        console.log(` - RapierReady: ${window.isRapierReady}`);
        console.log(` - InitData received: ${!!initializationData}`);

        if (assetsAreReady && networkIsInitialized && window.isRapierReady && initializationData) {
            console.log("[Game] All prerequisites met (including InitData). Proceeding to start gameplay...");
            this.startGamePlay(initializationData);
            initializationData = null; // Consume the data
        } else {
             console.log("[Game] Prerequisites not yet met for gameplay start. Waiting...");
             if (stateMachine?.is('joining')) {
                 let status = [];
                 if (!assetsAreReady) status.push("Assets");
                 if (!networkIsInitialized) status.push("Network");
                 if (!window.isRapierReady) status.push("Physics");
                 if (!initializationData) status.push("Server Data");
                 UIManager?.showLoading(`Finalizing: ${status.join(', ')}...`);
             } else {
                 console.warn("[Game] attemptProceedToGame called but not all prerequisites met and not in 'joining' state.");
             }
        }
    }

    // Setup game state based on server initialization data
     startGamePlay(initData) {
         console.log("[startGamePlay] Start. window.players type:", typeof window.players, "window.ClientPlayer type:", typeof window.ClientPlayer);

         if (!initData || !initData.id || !initData.players) {
             console.error("!!! startGamePlay called with invalid initialization data!");
             stateMachine?.transitionTo('homescreen', {errorMessage: "Invalid Game Data!"});
             return;
         }

         localPlayerId = initData.id;
         console.log(`[Game] Local player ID set to: ${localPlayerId}`);

         this.cleanupAllPlayers(); // Call cleanup *before* processing new players

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
                 const initialFeetPos = {
                     x: playerData.x,
                     y: playerData.y,
                     z: playerData.z
                 };
                 if(DEBUG_FORCE_SPAWN_POS && playerId === localPlayerId) {
                     initialFeetPos.y += DEBUG_FORCE_SPAWN_Y;
                     console.log(`[Game Debug] Applying forced spawn Y offset. New feet Y: ${initialFeetPos.y}`);
                 }

                 if (playerId === localPlayerId) {
                     this.createPlayerPhysicsBody(playerId, initialFeetPos);
                     if(players[localPlayerId]) {
                          players[localPlayerId].x = playerData.x;
                          players[localPlayerId].y = playerData.y;
                          players[localPlayerId].z = playerData.z;
                          players[localPlayerId].rotationY = playerData.rotationY || 0;
                          players[localPlayerId].lastSentX = null;
                          players[localPlayerId].lastSentY = null;
                          players[localPlayerId].lastSentZ = null;
                          players[localPlayerId].lastSentRotationY = null;
                     }
                 } else {
                     Network._createKinematicBody(playerData);
                 }
             } else {
                  console.warn(`[Game] Skipping physics body for init player ${playerId}. Missing player instance (${!!newPlayer}), Rapier, or World.`);
             }
         }

         if (players[localPlayerId] && UIManager) {
            UIManager.updateHealthBar(players[localPlayerId].health);
         }

         stateMachine?.transitionTo('playing');
         console.log("[Game] Transitioned to 'playing' state.");
     } // End startGamePlay


    // --- Update Loop ---
    update() {
        requestAnimationFrame(this.update.bind(this));
        const deltaTime = this.clock.getDelta();

        if (window.isRapierReady && this.rapierWorld && stateMachine?.is('playing')) {

            // *** Physics Step ***
            try { this.rapierWorld.step(this.rapierEventQueue); }
            catch (e) { console.error("!!! Rapier World Step Error:", e); }

            // *** Handle Collision Events ***
            try { this.rapierEventQueue.drainCollisionEvents((h1, h2, started) => {}); }
            catch (e) { console.error("!!! Error draining collision events:", e); }

            // *** Update Local Player Physics based on Input ***
            if (localPlayerId && this.playerRigidBodyHandles[localPlayerId]) {
                try {
                    const localPlayerBody = this.rapierWorld.getRigidBody(this.playerRigidBodyHandles[localPlayerId]);
                    if (localPlayerBody) {
                        updateLocalPlayer(deltaTime, localPlayerBody);
                    } else {
                         console.warn(`[Game Update] Local player body (handle: ${this.playerRigidBodyHandles[localPlayerId]}) not found!`);
                    }
                } catch (e) { console.error(`!!! Error getting/updating local player body:`, e); }
            }

            // *** Synchronize THREE.js Meshes with Rapier Bodies ***
            for (const playerId in this.players) {
                 const player = this.players[playerId];
                 if (!player) continue;
                 const bodyHandle = this.playerRigidBodyHandles[playerId];

                 if (player.mesh && bodyHandle !== undefined && bodyHandle !== null) {
                     try {
                         const body = this.rapierWorld.getRigidBody(bodyHandle);
                         if (body) {
                             const position = body.translation(); // Rapier body center
                             const rotation = body.rotation();
                             const playerHeight = CONFIG.PLAYER_HEIGHT || 1.8;

                             // --- Sync Visual Mesh ---
                             // Set mesh position based on Rapier body center, adjusting for mesh origin (feet vs center)
                             // If using fallback Cylinder, its origin is center, so no Y adjustment needed here.
                             // If using a custom model where origin is at feet, adjust Y: position.y - playerHeight / 2.0
                             player.mesh.position.set(position.x, position.y, position.z); // Assuming mesh origin is center like cylinder/capsule
                             // player.mesh.position.set(position.x, position.y - playerHeight / 2.0, position.z); // Use if mesh origin is at feet

                             player.mesh.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w);

                             // Update debug mesh (origin is center)
                             if (DEBUG_SHOW_PLAYER_COLLIDERS && this.debugMeshes[playerId]) {
                                 this.debugMeshes[playerId].position.set(position.x, position.y, position.z);
                                 this.debugMeshes[playerId].quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w);
                             }
                         }
                     } catch (e) { console.error(`[Game Sync] Error updating mesh for player ${playerId}:`, e); }
                 }
             }

            // *** Camera Update (Follow Local Player) ***
             if (localPlayerId && this.playerRigidBodyHandles[localPlayerId] && this.camera && this.controls && this.controls.isLocked) {
                 try {
                     const localPlayerBody = this.rapierWorld.getRigidBody(this.playerRigidBodyHandles[localPlayerId]);
                     if (localPlayerBody) {
                          const bodyPosition = localPlayerBody.translation();
                          const cameraTargetPosition = new THREE.Vector3(bodyPosition.x, bodyPosition.y + CONFIG.CAMERA_Y_OFFSET, bodyPosition.z);
                          this.camera.position.copy(cameraTargetPosition);
                     }
                 } catch (e) { console.error("[Game] Camera sync error:", e); }
             }

            // *** Render Scene ***
            if (this.renderer && this.scene && this.camera) {
                this.renderer.render(this.scene, this.camera);
                 // if(this.cssRenderer) this.cssRenderer.render(this.scene, this.camera);
            }
        } else {
            // Render something even if not fully playing
            if (this.renderer && this.scene && this.camera) {
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
         const player = this.players[playerId];
         if (player) {
             player.remove();
             if (window.players && window.players[playerId]) {
                  delete window.players[playerId];
             }
         } else {
              console.warn(`[Game cleanupPlayer] Player object for ${playerId} not found in this.players`);
         }

         if (this.debugMeshes[playerId]) {
             this.scene.remove(this.debugMeshes[playerId]);
             this.debugMeshes[playerId].geometry?.dispose();
             this.debugMeshes[playerId].material?.dispose();
             delete this.debugMeshes[playerId];
         }
         const bodyHandle = this.playerRigidBodyHandles[playerId];
         if (bodyHandle !== undefined && bodyHandle !== null && this.rapierWorld) {
              try {
                  const body = this.rapierWorld.getRigidBody(bodyHandle);
                  if (body) { this.rapierWorld.removeRigidBody(body); }
              } catch (e) { console.error(`[Game] Error removing Rapier body for ${playerId} (handle: ${bodyHandle}):`, e); }
              delete this.playerRigidBodyHandles[playerId];
         }
     } // End cleanupPlayer

     cleanupAllPlayers() {
         console.log("[cleanupAllPlayers] Start. window.players type:", typeof window.players, "this.players type:", typeof this.players, "window.ClientPlayer type:", typeof window.ClientPlayer);

         if (typeof window.players !== 'object' || window.players === null) {
             console.warn("[Game] Global window.players was invalid during cleanup. Resetting to {}. Value was:", window.players);
             window.players = {};
         }
         this.players = window.players; // Re-sync instance property

         console.log("[Game] cleanupAllPlayers: typeof this.players is now:", typeof this.players, "Value:", this.players);

         if (!this.players) {
              console.error("!!! [Game] CRITICAL: Failed to ensure this.players is an object in cleanupAllPlayers!");
              this.playerRigidBodyHandles = {};
              this.debugMeshes = {};
              return;
         }

         const playerIds = Object.keys(this.players);
         console.log(`[Game cleanupAllPlayers] Found player IDs to clean: [${playerIds.join(', ')}]`);
         playerIds.forEach(id => {
              if (this.players && this.players[id]) {
                 this.cleanupPlayer(id);
              } else {
                 console.warn(`[Game] cleanupAllPlayers: Player ID ${id} became invalid during iteration? Skipping cleanupPlayer.`);
              }
         });

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
