// docs/game.js - Main Game Orchestrator (FORCE Simple Ground Collider, Spawn Higher, Log Dims - FULL FILE v5)

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
const USE_SIMPLE_GROUND = false; // <<< Use the actual map VISUALLY
const DEBUG_FORCE_SIMPLE_GROUND_COLLIDER = true; // <<< FORCE Simple Physics Collider
const DEBUG_FIXED_CAMERA = false; // <<< Use dynamic camera linked to player
const DEBUG_MINIMAL_RENDER_LOOP = false; // <<< Run full game loop
const DEBUG_FORCE_SPAWN_POS = true; // <<< Force spawn position
const DEBUG_FORCE_SPAWN_Y = 20.0; // <<< Spawn higher Y value

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
    }

    async start() {
        console.log("--- Game Start ---");
        this.clock = new THREE.Clock();
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 200);
        this.renderer = new THREE.WebGLRenderer({
            canvas: document.getElementById('gameCanvas')
        });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.shadowMap.enabled = true;

        // *** Physics World Init ***
        if (!window.isRapierReady) {
            console.error("Rapier not initialized. Aborting game start.");
            return;
        }
        this.rapierWorld = new RAPIER.World({
            x: 0,
            y: CONFIG.GRAVITY,
            z: 0
        });
        this.rapierEventQueue = new RAPIER.EventQueue(true); // Enable pre-step event queuing

        this.controls = new THREE.PointerLockControls(this.camera, this.renderer.domElement);
        window.controls = this.controls; // Make controls globally available

        this.scene.add(new THREE.AmbientLight(0x404040, 0.8));
        const dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
        dirLight.position.set(30, 40, 20);
        dirLight.castShadow = true;
        dirLight.shadow.mapSize.width = 2048;
        dirLight.shadow.mapSize.height = 2048;
        this.scene.add(dirLight);

        await this.loadAssets();
        this.initNetwork();
        this.addEventListeners();
        this.update();
    }

    async loadAssets() {
        try {
            await loadManager.startLoading();
            this.mapMesh = loadManager.getAssetData('map');
            if (this.mapMesh) {
                this.scene.add(this.mapMesh.scene);
                if (DEBUG_FORCE_SIMPLE_GROUND_COLLIDER) {
                    this.createSimpleGroundCollider();
                } else {
                    this.createMapCollider(this.mapMesh.scene); // Create Rapier collider from map
                }
            }
            const playerModel = loadManager.getAssetData('playerModel');
            if (playerModel) {
                // Player model loaded, but not directly used here
            }
            assetsAreReady = true;
        } catch (error) {
            console.error("Asset loading failed:", error);
        }
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
            console.error("Physics world or Rapier not initialized!");
            return;
        }

        const h = CONFIG.PLAYER_HEIGHT || 1.8;
        const r = CONFIG.PLAYER_RADIUS || 0.4;
        let t = new RAPIER.Capsule(r, h - 2 * r);
        let bd = RAPIER.RigidBodyDesc.dynamic().setTranslation(initialPosition.x, initialPosition.y + h / 2, initialPosition.z);
        let body = this.rapierWorld.createRigidBody(bd);
        let cd = RAPIER.ColliderDesc.capsule(r, h - 2 * r);
        this.rapierWorld.createCollider(cd, body);

        this.playerRigidBodyHandles[playerId] = body.handle;
        console.log(`[Game] Created Rapier body for player ${playerId} (handle: ${body.handle})`, initialPosition);

        // *** Debug: Add a simple visual representation (e.g., a wireframe capsule) ***
        if (DEBUG_SHOW_PLAYER_COLLIDERS) {
            const capsuleGeom = new THREE.CapsuleGeometry(r, h - 2 * r, 4, 8);
            const wireframeMat = new THREE.WireframeGeometry(capsuleGeom);
            const wireframeMesh = new THREE.LineSegments(wireframeMat);
            this.scene.add(wireframeMesh);
            this.debugMeshes[playerId] = wireframeMesh;
        }
    }

    // *** Physics: Create Map Collider ***
    createMapCollider(scene) {
        if (!this.rapierWorld || !RAPIER || !scene) {
            console.error("Physics or scene not initialized for map collider!");
            return;
        }

        // *** This is highly dependent on your map's structure ***
        // *** You'll need to adapt this to extract the collision mesh(es) ***
        let collisionMesh;
        scene.traverse(child => {
            if (child.isMesh) {
                collisionMesh = child; // ASSUMPTION: First mesh is the ground
            }
        });

        if (!collisionMesh) {
            console.error("No collision mesh found in map scene!");
            return;
        }

        // *** Simplified Convex Hull (for testing) - Replace with Trimesh for complex maps ***
        const vertices = [];
        const positionAttribute = collisionMesh.geometry.attributes.position;
        for (let i = 0; i < positionAttribute.count; i++) {
            const vertex = new THREE.Vector3().fromBufferAttribute(positionAttribute, i);
            vertices.push({
                x: vertex.x,
                y: vertex.y,
                z: vertex.z
            });
        }
        let trimesh = RAPIER.triMesh(vertices);
        let cd = RAPIER.ColliderDesc.trimesh(trimesh);
        this.rapierWorld.createCollider(cd, this.rapierWorld.createRigidBody(RAPIER.RigidBodyDesc.fixed()), );

        console.log("[Game] Map collider created.");
    }

    // *** Physics: Simple Ground Collider (for testing) ***
    createSimpleGroundCollider() {
        if (!this.rapierWorld || !RAPIER) {
            console.error("Physics world or Rapier not initialized!");
            return;
        }
        let cd = RAPIER.ColliderDesc.cuboid(50, 1, 50);
        this.rapierWorld.createCollider(cd, this.rapierWorld.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -2, 0)));
        console.warn("[Game] Using SIMPLE GROUND COLLIDER (DEBUG).");
    }

    update() {
        requestAnimationFrame(this.update.bind(this));
        const deltaTime = this.clock.getDelta();

        if (assetsAreReady && networkIsInitialized && window.isRapierReady) {
            // *** Physics Step ***
            this.rapierWorld.step(this.rapierEventQueue);

            // *** Handle Collision Events ***
            this.rapierEventQueue.drainCollisionEvents((handle1, handle2, started) => {
                // *** Basic collision logging (expand as needed) ***
                console.log(`[Game] Collision: ${handle1} vs ${handle2} (Started: ${started})`);
            });

            // *** Update Player Positions/Rotations ***
            for (const playerId in this.players) {
                const player = this.players[playerId];
                const bodyHandle = this.playerRigidBodyHandles[playerId];
                if (player && bodyHandle !== undefined && this.rapierWorld) {
                    try {
                        const body = this.rapierWorld.getRigidBody(bodyHandle);
                        if (body) {
                            const position = body.translation();
                            const rotation = body.rotation(); // Quaternion
                            player.mesh.position.set(position.x, position.y, position.z);
                            player.mesh.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w);

                            // *** Debug: Update debug mesh ***
                            if (DEBUG_SHOW_PLAYER_COLLIDERS && this.debugMeshes[playerId]) {
                                this.debugMeshes[playerId].position.copy(position);
                                this.debugMeshes[playerId].quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w);
                            }
                        } else {
                            console.warn(`[Game] No Rapier body found for player ${playerId}`);
                        }
                    } catch (e) {
                        console.error(`[Game] Error updating player ${playerId}:`, e);
                    }
                }
            }

            // *** Camera Update ***
            if (localPlayerId && this.players[localPlayerId] && this.camera && this.controls) {
                try {
                    const localPlayer = this.players[localPlayerId];
                    if (localPlayer && localPlayer.mesh) {
                        const targetCameraPosition = localPlayer.mesh.position.clone();
                        targetCameraPosition.y += CONFIG.CAMERA_Y_OFFSET;
                        this.camera.position.copy(targetCameraPosition);
                        this.controls.target.copy(localPlayer.mesh.position);
                    } else {
                        console.warn("[Game] Local player or mesh not available for camera sync.");
                    }
                } catch (e) {
                    console.error("[Game] Camera sync error:", e);
                }
            }

            // *** Void Check (Simple Y-position check) ***
            for (const playerId in this.players) {
                const player = this.players[playerId];
                if (player && player.mesh && player.mesh.position.y < CONFIG.VOID_Y_LEVEL) {
                    console.log(`[Game] Player ${playerId} fell into the void!`);
                    if (playerId === localPlayerId) {
                        Network.sendVoidDeath(); // Notify server
                    }
                    this.cleanupPlayer(playerId); // Basic cleanup
                }
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
            // Basic early-stage rendering (e.g., loading screen)
            if (this.renderer && this.scene && this.camera) {
                this.renderer.render(this.scene, this.camera);
            }
        }
    }

    // *** Physics: Raycast for Safe Spawn Position ***
    findSafeSpawnPosition() {
        if (!this.rapierWorld || !RAPIER) {
            console.error("Physics world not initialized for spawn check!");
            return new THREE.Vector3(0, 10, 0); // Default, but should be handled better
        }

        const origin = new RAPIER.Ray(
            {
                x: randomFloat(-CONFIG.MAP_BOUNDS_X, CONFIG.MAP_BOUNDS_X),
                y: 100, // Start high above the map
                z: randomFloat(-CONFIG.MAP_BOUNDS_Z, CONFIG.MAP_BOUNDS_Z)
            },
            {
                x: 0,
                y: -1,
                z: 0
            } // Downward direction
        );
        const maxToi = 200; // Max distance to check
        const hit = this.rapierWorld.castRay(origin, maxToi, true, null, null, null);

        if (hit) {
            return new THREE.Vector3(origin.origin.x, origin.origin.y + hit.toi, origin.origin.z);
        } else {
            console.warn("[Game] No safe spawn found, using default.");
            return new THREE.Vector3(0, 10, 0); // Default, but handle better
        }
    }

    // --- Server Initialization/Spawn ---
    initializePlayer(initData) {
        if (!initData || typeof initData !== 'object') {
            console.error("Invalid player initialization data:", initData);
            return;
        }

        localPlayerId = initData.id; // Store local player's ID
        window.localPlayerId = localPlayerId; // Make it globally accessible (if needed)

        // *** Physics: Create Player Rigid Body ***
        const spawnPos = DEBUG_FORCE_SPAWN_POS ?
            new THREE.Vector3(0, DEBUG_FORCE_SPAWN_Y, 0) :
            this.findSafeSpawnPosition();
        this.createPlayerPhysicsBody(localPlayerId, spawnPos);

        // Create player object (local or remote)
        for (const id in initData.players) {
            const playerData = initData.players[id];
            if (id === localPlayerId) {
                // *** Local Player Setup (if needed) ***
            } else {
                this.players[id] = new ClientPlayer(playerData);
            }
        }
        console.log("[Game] Player initialization complete.");
    }

    // --- Server Spawn ---
    spawnPlayer(spawnData) {
        if (!spawnData || typeof spawnData !== 'object' || !spawnData.id) {
            console.error("Invalid spawn data:", spawnData);
            return;
        }

        // *** Physics: Create Player Rigid Body ***
        const spawnPos = DEBUG_FORCE_SPAWN_POS ?
            new THREE.Vector3(0, DEBUG_FORCE_SPAWN_Y, 0) :
            this.findSafeSpawnPosition();
        this.createPlayerPhysicsBody(spawnData.id, spawnPos);

        // Create player object (local or remote)
        if (spawnData.id === localPlayerId) {
            // *** Local Player Spawn (if needed) ***
        } else {
            this.players[spawnData.id] = new ClientPlayer(spawnData);
        }
        console.log(`[Game] Player spawned: ${spawnData.id}`);
    }

    // --- Server Despawn ---
    despawnPlayer(despawnId) {
        if (!despawnId) {
            console.error("Invalid despawn ID:", despawnId);
            return;
        }
        this.cleanupPlayer(despawnId);
        console.log(`[Game] Player despawned: ${despawnId}`);
    }

    // --- Clear All Players ---
    cleanupAllPlayers() {
        console.warn("[Game Cleanup] Cleaning up all players...");
        for (const playerId in this.players) {
            this.cleanupPlayer(playerId);
        }
        this.players = {};
        localPlayerId
