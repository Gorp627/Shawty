// docs/game.js - Main Game Orchestrator (FORCE Simple Ground Collider, Spawn Higher, Log Dims - FULL FILE v5 - COMPLETE)

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
            const wireframeMat = new THREE.WireframeBasicMaterial({ color: 0xffff00, wireframe: true });
            const wireframeMesh = new THREE.Mesh(capsuleGeom, wireframeMat);
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

        let collisionObject;
        scene.traverse(child => {
            if (child.isMesh && child.name.toLowerCase().includes('collision')) {
                collisionObject = child;
            } else if (child.isMesh && !collisionObject) {
                collisionObject = child; // Fallback to the first mesh if no "collision" tagged mesh
            }
        });

        if (!collisionObject) {
            console.error("No suitable collision mesh found in map scene!");
            return;
        }

        const geometry = collisionObject.geometry;
        if (geometry.index) {
            const vertices = geometry.attributes.position.array;
            const indices = geometry.index.array;

            const rapierVertices = [];
            for (let i = 0; i < vertices.length; i += 3) {
                rapierVertices.push({ x: vertices[i], y: vertices[i + 1], z: vertices[i + 2] });
            }

            const rapierIndices = [];
            for (let i = 0; i < indices.length; i += 3) {
                rapierIndices.push([indices[i], indices[i + 1], indices[i + 2]]);
            }

            const trimesh = new RAPIER.TriMesh(rapierVertices, rapierIndices);
            const colliderDesc = RAPIER.ColliderDesc.trimesh(trimesh);
            this.rapierWorld.createCollider(colliderDesc, this.rapierWorld.createRigidBody(RAPIER.RigidBodyDesc.fixed()));
            console.log("[Game] Trimesh map collider created from:", collisionObject.name);
        } else if (geometry.attributes.position) {
            // Fallback to convex hull if no index buffer (less performant for complex shapes)
            const points = [];
            const positionAttribute = geometry.attributes.position;
            for (let i = 0; i < positionAttribute.count; i++) {
                points.push({ x: positionAttribute.getX(i), y: positionAttribute.getY(i), z: positionAttribute.getZ(i) });
            }
            if (points.length > 0) {
                const convexHull = RAPIER.convexHull(points);
                const colliderDesc = RAPIER.ColliderDesc.convexHull(convexHull);
                this.rapierWorld.createCollider(colliderDesc, this.rapierWorld.createRigidBody(RAPIER.RigidBodyDesc.fixed()));
                console.warn("[Game] Convex hull map collider created (consider providing indexed geometry).");
            } else {
                console.error("[Game] No vertices found for map collider.");
            }
        }
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
                // console.log(`[Game] Collision: ${handle1} vs ${handle2} (Started: ${started})`);
                const body1 = this.rapierWorld.getRigidBody(handle1);
                const body2 = this.rapierWorld.getRigidBody(handle2);

                if (body1 && body2) {
                    const playerId1 = this.getPlayerIdByHandle(body1.handle);
                    const playerId2 = this.getPlayerIdByHandle(body2.handle);

                    if (playerId1 && playerId2) {
                        // Player-player collision
                        // console.log(`[Game] Player ${playerId1} collided with Player ${playerId2}`);
                    } else if (playerId1 && body2.isFixed()) {
                        // Player-map collision
                        // console.log(`[Game] Player ${playerId1} collided with the map`);
                    } else if (playerId2 && body1.isFixed()) {
                        // Player-map collision
                        // console.log(`[Game] Player ${playerId2} collided with the map`);
                    }
                }
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

    // *** Helper function to get player ID from Rapier body handle ***
    getPlayerIdByHandle(handle) {
        for (const id in this.playerRigidBodyHandles) {
            if (this.playerRigidBodyHandles[id] === handle) {
                return id;
            }
        }
        return null;
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

        if (hit
