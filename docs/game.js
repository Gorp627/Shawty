// docs/game.js - Main Game Orchestrator (v13 - Pre-Instance Check)

// --- Global Flags and Data ---
let networkIsInitialized = false;
let assetsAreReady = false;
let initializationData = null;
var currentGameInstance = null;
var RAPIER = window.RAPIER || null;
var rapierWorld = null;
var rapierEventQueue = null;
window.isRapierReady = window.isRapierReady || false;

// Debug flags
const USE_SIMPLE_GROUND = false;
const DEBUG_FORCE_SIMPLE_GROUND_COLLIDER = false; // <<< Set TRUE to test player physics without map collider
const DEBUG_FIXED_CAMERA = false;
const DEBUG_MINIMAL_RENDER_LOOP = false;
const DEBUG_FORCE_SPAWN_POS = false;
const DEBUG_FORCE_SPAWN_Y = 20.0;
const DEBUG_SHOW_PLAYER_COLLIDERS = false;

class Game {
    // Constructor remains the same
    constructor() {
        console.log("[Game Constructor] Running...");
        // ---> Check global state right at the start <---
        if (typeof window.players !== 'object' || window.players === null) {
             console.warn("[Game Constructor] window.players is invalid! Forcing {}. Check config.js load order.");
             window.players = {};
        }
        if (typeof window.keys !== 'object' || window.keys === null) {
             console.warn("[Game Constructor] window.keys is invalid! Forcing {}. Check config.js load order.");
             window.keys = {};
        }
        console.log("[Game Constructor] BEFORE assignment: this.players:", this.players, "window.players:", window.players, "window.ClientPlayer:", typeof window.ClientPlayer);

        this.scene = null; this.camera = null; this.renderer = null; this.controls = null;
        this.clock = null; this.cssRenderer = null;
        this.players = window.players; // Assign AFTER ensuring window.players is valid
        this.keys = window.keys;       // Assign AFTER ensuring window.keys is valid
        this.mapMesh = null; this.playerRigidBodyHandles = {}; this.debugMeshes = {};
        this.mapColliderCreated = false;

        console.log("[Game Constructor] AFTER assignment: this.players type:", typeof this.players, "Value:", this.players);
        console.log("[Game Constructor] FINISHED.");
    }

    // start() method remains the same
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

        if (!window.isRapierReady) {
            console.error("Rapier not initialized. Aborting.");
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

        this.scene.add(new THREE.AmbientLight(0x606060));
        const dirLight = new THREE.DirectionalLight(0xffffff, 0.9);
        dirLight.position.set(30, 40, 20);
        dirLight.castShadow = true;
        dirLight.shadow.mapSize.width = 2048; dirLight.shadow.mapSize.height = 2048;
        this.scene.add(dirLight);

        window.dracoLoader = new THREE.DRACOLoader();
        window.dracoLoader.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/libs/draco/');
        window.loader = new THREE.GLTFLoader();
        window.loader.setDRACOLoader(window.dracoLoader);
        console.log("[Game] Three.js Loaders initialized.");

        this.addEventListeners();
        Input.init(this.controls);
        this.initNetwork();

        try {
             await this.loadAssets();
             console.log("[Game] Asset loading phase finished.");
             if (assetsAreReady && !stateMachine.is('playing') && !stateMachine.is('homescreen')) {
                 console.log("[Game] Assets ready, transitioning to homescreen.");
                 stateMachine.transitionTo('homescreen');
             } else if (!assetsAreReady) {
                 console.error("[Game] Assets failed to load.");
             }
        } catch(error) {
             console.error("[Game] Error during asset loading phase:", error);
        }
        this.update();
    }

    // loadAssets() method remains the same
    async loadAssets() {
        return new Promise((resolve, reject) => {
            console.log("[Game] Starting asset loading...");
            loadManager.on('ready', () => {
                console.log("[Game] LoadManager 'ready'.");
                this.mapMesh = loadManager.getAssetData('map');
                if (this.mapMesh) {
                    this.scene.add(this.mapMesh);
                    console.log("[Game] Added visual map mesh.");
                    if (!this.mapColliderCreated) {
                        if (DEBUG_FORCE_SIMPLE_GROUND_COLLIDER) {
                            console.log("[Game] DEBUG: Forcing simple ground collider.");
                            this.createSimpleGroundCollider();
                        } else {
                            console.log("[Game] Attempting map collider from GLTF...");
                            this.createMapCollider(this.mapMesh);
                        }
                        this.mapColliderCreated = true;
                    }
                } else {
                     console.error("!!! Map asset data ('map') null!");
                     if (!this.mapColliderCreated) {
                         console.warn("!!! Forcing simple ground collider.");
                         this.createSimpleGroundCollider();
                         this.mapColliderCreated = true;
                     }
                }
                assetsAreReady = true;
                resolve();
            });
            loadManager.on('error', (errorData) => {
                 console.error("[Game] LoadManager 'error':", errorData);
                 assetsAreReady = false;
                 reject(new Error(errorData.message || 'Asset loading failed'));
            });
            loadManager.startLoading().catch(err => {
                console.error("[Game] loadManager.startLoading() error:", err);
                if (!assetsAreReady) { reject(err); }
            });
        });
    }

    // initNetwork() method remains the same
    initNetwork() {
        if (typeof Network?.init === 'function') { Network.init(); }
        else { console.error("Network.init is not a function!"); }
    }

    // addEventListeners() method remains the same
    addEventListeners() {
        window.addEventListener('resize', () => {
            if (this.camera && this.renderer) {
                this.camera.aspect = window.innerWidth / window.innerHeight;
                this.camera.updateProjectionMatrix();
                this.renderer.setSize(window.innerWidth, window.innerHeight);
            }
        }, false);
    }

    // createPlayerPhysicsBody() method remains the same
    createPlayerPhysicsBody(playerId, initialFeetPos) {
        if (!this.rapierWorld || !RAPIER) {
            console.error(`!!! Cannot create physics body for ${playerId}: Physics missing!`);
            return;
        }
        try {
            const h = CONFIG.PLAYER_HEIGHT || 1.8;
            const r = CONFIG.PLAYER_RADIUS || 0.4;
            const capsuleHalfHeight = Math.max(0.01, h / 2.0 - r); // Cylinder part half-height

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

            // Use RAPIER.ColliderDesc.capsule(halfHeight, radius)
            let cd = RAPIER.ColliderDesc.capsule(capsuleHalfHeight, r)
                 .setFriction(0.7)
                 .setRestitution(0.1)
                 .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);

            this.rapierWorld.createCollider(cd, body);
            this.playerRigidBodyHandles[playerId] = body.handle;
            console.log(`[Game] Created DYNAMIC Rapier body for player ${playerId} (handle: ${body.handle}) at center`, initialCenterPos);

            if (DEBUG_SHOW_PLAYER_COLLIDERS) {
                // Use Cylinder for debug mesh
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

    // createMapCollider() method remains the same
    createMapCollider(mapSceneObject) {
        if (!this.rapierWorld || !RAPIER || !mapSceneObject) {
            console.error("!!! Cannot create map collider: Physics/Map missing!");
            this.createSimpleGroundCollider();
            console.warn("!!! FALLBACK TO SIMPLE GROUND COLLIDER.");
            return;
        }
        console.log("[Game] Starting map collider creation...");

        let collisionObject = null;
        mapSceneObject.traverse(child => {
            if (!collisionObject && child.isMesh && child.name.toLowerCase().includes('collision')) {
                collisionObject = child;
                console.log(`[Game] Found 'collision' mesh: '${child.name}'`);
            }
        });
        if (!collisionObject) {
            mapSceneObject.traverse(child => {
                if (!collisionObject && child.isMesh) {
                    collisionObject = child;
                    console.warn(`[Game] Using first mesh as fallback: '${child.name}'`);
                }
            });
        }
        if (!collisionObject) {
            console.error("!!! No mesh found for map collision!");
            this.createSimpleGroundCollider();
            console.warn("!!! FALLBACK TO SIMPLE GROUND COLLIDER.");
            return;
        }

        collisionObject.updateMatrixWorld(true);
        const worldMatrix = collisionObject.matrixWorld;
        const geometry = collisionObject.geometry;

        if (!geometry) {
             console.error(`!!! Collision mesh '${collisionObject.name}' has no geometry!`);
             this.createSimpleGroundCollider();
             console.warn("!!! FALLBACK TO SIMPLE GROUND COLLIDER.");
             return;
        }

        if (geometry.index && geometry.attributes.position) {
            console.log(`[Game] Processing indexed Trimesh: ${collisionObject.name}`);
            const vertices = geometry.attributes.position.array;
            const indices = geometry.index.array;
            if (!vertices || !indices) {
                 console.error(`!!! Mesh '${collisionObject.name}' missing vertices or indices!`);
                 this.createSimpleGroundCollider();
                 console.warn("!!! FALLBACK TO SIMPLE GROUND COLLIDER.");
                 return;
            }
            const rapierVertices = [];
            const tempVec = new THREE.Vector3();
            const positionAttribute = geometry.attributes.position;
            console.log(`[Game] Transforming ${positionAttribute.count} vertices...`);
            for (let i = 0; i < positionAttribute.count; i++) {
                tempVec.fromBufferAttribute(positionAttribute, i);
                tempVec.applyMatrix4(worldMatrix);
                rapierVertices.push(tempVec.x, tempVec.y, tempVec.z);
            }
             const rapierIndices = new Uint32Array(indices.length);
             for(let i = 0; i < indices.length; ++i){ rapierIndices[i] = indices[i]; }
            console.log(`[Game] Vertices: ${rapierVertices.length/3}, Indices: ${rapierIndices.length/3}`);
            try {
                const vertsF32 = new Float32Array(rapierVertices);
                const colliderDesc = RAPIER.ColliderDesc.trimesh(vertsF32, rapierIndices)
                    .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);
                const bodyDesc = RAPIER.RigidBodyDesc.fixed();
                const mapBody = this.rapierWorld.createRigidBody(bodyDesc);
                this.rapierWorld.createCollider(colliderDesc, mapBody);
                console.log(`[Game] === Successfully created Trimesh map collider: ${collisionObject.name} ===`);
            } catch (e) {
                 console.error(`!!! FAILED Trimesh creation: ${collisionObject.name}:`, e);
                 this.createSimpleGroundCollider();
                 console.warn("!!! FALLBACK TO SIMPLE GROUND COLLIDER.");
            }
        } else if (geometry.attributes.position) {
             console.warn(`[Game] Non-indexed mesh '${collisionObject.name}'. Attempting Convex Hull...`);
             const positionAttribute = geometry.attributes.position;
             const points = [];
             const tempVec = new THREE.Vector3();
             console.log(`[Game] Transforming ${positionAttribute.count} vertices for hull...`);
             for (let i = 0; i < positionAttribute.count; i++) {
                 tempVec.fromBufferAttribute(positionAttribute, i);
                 tempVec.applyMatrix4(worldMatrix);
                 points.push(tempVec.x, tempVec.y, tempVec.z);
             }
             if (points.length >= 12) {
                 try {
                      const pointsF32 = new Float32Array(points);
                      const colliderDesc = RAPIER.ColliderDesc.convexHull(pointsF32)
                          .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);
                      if (!colliderDesc) throw new Error("Convex hull creation failed.");
                      const bodyDesc = RAPIER.RigidBodyDesc.fixed();
                      const mapBody = this.rapierWorld.createRigidBody(bodyDesc);
                      this.rapierWorld.createCollider(colliderDesc, mapBody);
                      console.warn(`[Game] === Successfully created Convex hull collider: ${collisionObject.name} ===`);
                 } catch (e) {
                      console.error(`!!! FAILED Convex Hull creation: ${collisionObject.name}:`, e);
                      this.createSimpleGroundCollider();
                      console.warn("!!! FALLBACK TO SIMPLE GROUND COLLIDER.");
                 }
             } else {
                 console.error(`[Game] Not enough vertices (<4) for Convex Hull: '${collisionObject.name}'.`);
                 this.createSimpleGroundCollider();
                 console.warn("!!! FALLBACK TO SIMPLE GROUND COLLIDER.");
             }
        } else {
            console.error(`!!! Mesh '${collisionObject.name}' has no position attribute!`);
            this.createSimpleGroundCollider();
            console.warn("!!! FALLBACK TO SIMPLE GROUND COLLIDER.");
        }
    }

    // createSimpleGroundCollider() method remains the same
    createSimpleGroundCollider() {
        if (!this.rapierWorld || !RAPIER) { console.error("!!! Physics missing for simple ground!"); return; }
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
        } catch (e) { console.error("!!! FAILED simple ground creation:", e); }
    }

    // attemptProceedToGame() method remains the same
    attemptProceedToGame() {
        console.log(`[Game] attemptProceedToGame called.`);
        console.log(` - AssetsReady: ${assetsAreReady}, NetworkInit: ${networkIsInitialized}, RapierReady: ${window.isRapierReady}, InitData received: ${!!initializationData}`);
        if (assetsAreReady && networkIsInitialized && window.isRapierReady && initializationData) {
            console.log("[Game] Prerequisites met. Starting gameplay...");
            this.startGamePlay(initializationData);
            initializationData = null;
        } else {
             console.log("[Game] Prerequisites not met. Waiting...");
             if (stateMachine?.is('joining')) {
                 let status = [];
                 if (!assetsAreReady) status.push("Assets");
                 if (!networkIsInitialized) status.push("Network");
                 if (!window.isRapierReady) status.push("Physics");
                 if (!initializationData) status.push("Server Data");
                 UIManager?.showLoading(`Finalizing: ${status.join(', ')}...`);
             }
        }
    }

    // startGamePlay() method remains the same
     startGamePlay(initData) {
         console.log("[startGamePlay] Start. window.players type:", typeof window.players, "window.ClientPlayer type:", typeof window.ClientPlayer);
         if (!initData || !initData.id || !initData.players) {
             console.error("!!! Invalid initialization data!", initData);
             stateMachine?.transitionTo('homescreen', {errorMessage: "Invalid Game Data!"});
             return;
         }
         localPlayerId = initData.id;
         console.log(`[Game] Local player ID: ${localPlayerId}`);
         this.cleanupAllPlayers();

         for (const playerId in initData.players) {
             const playerData = initData.players[playerId];
             if (!playerData) { console.warn(`Skipping invalid player data for ID: ${playerId}`); continue; };
             console.log(`[Game] Processing init player: ${playerData.name} (${playerId})`);

             const newPlayer = Network._addPlayer(playerData); // Creates ClientPlayer visual

             if (newPlayer && RAPIER && this.rapierWorld) {
                 const initialFeetPos = { x: playerData.x, y: playerData.y, z: playerData.z };
                 if(DEBUG_FORCE_SPAWN_POS && playerId === localPlayerId) {
                     initialFeetPos.y += DEBUG_FORCE_SPAWN_Y;
                     console.log(`[Game Debug] Applied spawn Y offset. New feet Y: ${initialFeetPos.y}`);
                 }
                 if (playerId === localPlayerId) {
                     this.createPlayerPhysicsBody(playerId, initialFeetPos); // Creates dynamic body
                     if(players[localPlayerId]) { // Update cache
                          players[localPlayerId].x = playerData.x;
                          players[localPlayerId].y = playerData.y;
                          players[localPlayerId].z = playerData.z;
                          players[localPlayerId].rotationY = playerData.rotationY || 0;
                          players[localPlayerId].lastSentX = null; // Reset send cache
                          players[localPlayerId].lastSentY = null;
                          players[localPlayerId].lastSentZ = null;
                          players[localPlayerId].lastSentRotationY = null;
                     }
                 } else {
                     Network._createKinematicBody(playerData); // Creates kinematic body
                 }
             } else {
                  console.warn(`[Game] Skipping physics body for ${playerId}. newPlayer: ${!!newPlayer}, Rapier: ${!!RAPIER}, World: ${!!this.rapierWorld}`);
             }
         }

         if (players[localPlayerId] && UIManager) {
            UIManager.updateHealthBar(players[localPlayerId].health);
         }
         stateMachine?.transitionTo('playing');
         console.log("[Game] Transitioned to 'playing' state.");
     }

    // update() method remains the same
    update() {
        requestAnimationFrame(this.update.bind(this));
        const deltaTime = this.clock.getDelta();

        if (window.isRapierReady && this.rapierWorld && stateMachine?.is('playing')) {
            try { this.rapierWorld.step(this.rapierEventQueue); }
            catch (e) { console.error("!!! Rapier Step Error:", e); }

            try { this.rapierEventQueue.drainCollisionEvents((h1, h2, started) => {}); }
            catch (e) { console.error("!!! Collision Event Error:", e); }

            if (localPlayerId && this.playerRigidBodyHandles[localPlayerId]) {
                try {
                    const body = this.rapierWorld.getRigidBody(this.playerRigidBodyHandles[localPlayerId]);
                    if (body) { updateLocalPlayer(deltaTime, body); }
                    else { console.warn(`Local player body missing! Handle: ${this.playerRigidBodyHandles[localPlayerId]}`); }
                } catch (e) { console.error(`Error updating local player:`, e); }
            }

            for (const playerId in this.players) {
                 const player = this.players[playerId];
                 if (!player || !player.mesh) continue;
                 const bodyHandle = this.playerRigidBodyHandles[playerId];
                 if (bodyHandle === undefined || bodyHandle === null) continue;

                 try {
                     const body = this.rapierWorld.getRigidBody(bodyHandle);
                     if (body) {
                         const pos = body.translation(); // Rapier body center
                         const rot = body.rotation();
                         const h = CONFIG.PLAYER_HEIGHT || 1.8;

                         // Sync Visual Mesh - Assuming mesh origin is center
                         player.mesh.position.set(pos.x, pos.y, pos.z);
                         // If mesh origin is at FEET, use:
                         // player.mesh.position.set(pos.x, pos.y - h / 2.0, pos.z);

                         player.mesh.quaternion.set(rot.x, rot.y, rot.z, rot.w);

                         if (DEBUG_SHOW_PLAYER_COLLIDERS && this.debugMeshes[playerId]) {
                             this.debugMeshes[playerId].position.set(pos.x, pos.y, pos.z);
                             this.debugMeshes[playerId].quaternion.set(rot.x, rot.y, rot.z, rot.w);
                         }
                     }
                 } catch (e) { console.error(`Error syncing mesh ${playerId}:`, e); }
             }

             if (localPlayerId && this.playerRigidBodyHandles[localPlayerId] && this.camera && this.controls?.isLocked) {
                 try {
                     const body = this.rapierWorld.getRigidBody(this.playerRigidBodyHandles[localPlayerId]);
                     if (body) {
                          const pos = body.translation();
                          const camPos = new THREE.Vector3(pos.x, pos.y + CONFIG.CAMERA_Y_OFFSET, pos.z);
                          this.camera.position.copy(camPos);
                     }
                 } catch (e) { console.error("Camera sync error:", e); }
             }

            if (this.renderer && this.scene && this.camera) {
                this.renderer.render(this.scene, this.camera);
            }
        } else { // Render even if not playing
            if (this.renderer && this.scene && this.camera) {
                  this.renderer.render(this.scene, this.camera);
            }
        }
    }

    // getPlayerIdByHandle() method remains the same
    getPlayerIdByHandle(handle) {
        for (const id in this.playerRigidBodyHandles) {
            if (this.playerRigidBodyHandles[id] === handle) { return id; }
        }
        return null;
    }

     // cleanupPlayer() method remains the same
     cleanupPlayer(playerId) {
         console.log(`[Game] Cleaning up player: ${playerId}`);
         const player = this.players[playerId];
         if (player) {
             player.remove();
             if (window.players && window.players[playerId]) { delete window.players[playerId]; }
         } else { console.warn(`[Game cleanupPlayer] Player obj ${playerId} not found.`); }
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
              } catch (e) { console.error(`Error removing body ${playerId} (h: ${bodyHandle}):`, e); }
              delete this.playerRigidBodyHandles[playerId];
         }
     }

     // cleanupAllPlayers() method remains the same
     cleanupAllPlayers() {
         console.log("[cleanupAllPlayers] Start. window.players type:", typeof window.players, "this.players type:", typeof this.players, "window.ClientPlayer type:", typeof window.ClientPlayer);
         if (typeof window.players !== 'object' || window.players === null) {
             console.warn("Global window.players invalid during cleanup. Resetting to {}. Value was:", window.players);
             window.players = {};
         }
         this.players = window.players;
         console.log("[Game] cleanupAllPlayers: typeof this.players now:", typeof this.players, "Value:", this.players);
         if (!this.players) {
              console.error("!!! CRITICAL: this.players still invalid!");
              this.playerRigidBodyHandles = {}; this.debugMeshes = {}; return;
         }
         const playerIds = Object.keys(this.players);
         console.log(`[Game cleanupAllPlayers] IDs to clean: [${playerIds.join(', ')}]`);
         playerIds.forEach(id => {
              if (this.players && this.players[id]) { this.cleanupPlayer(id); }
              else { console.warn(`Player ${id} invalid during cleanup iteration.`); }
         });
         this.playerRigidBodyHandles = {};
         this.debugMeshes = {};
         console.log("[Game] All players/data cleaned up.");
     }
} // End Game Class

// --- Global Initialization (Revised Flow) ---
document.addEventListener('DOMContentLoaded', async () => {
    console.log("[DOM Ready] Initializing...")
    if (!UIManager.initialize()) { console.error("!!! UIManager init failed."); return; }
    UIManager.showLoading("Initializing Core Systems...");
    stateMachine.transitionTo('loading');
    UIManager.bindStateListeners(stateMachine);
    addStateCleanupListener();
    try {
        // ---> ADD Check for globals from config.js before Rapier/Game init <---
        if (typeof window.players === 'undefined' || typeof window.keys === 'undefined') {
             console.error("!!! Globals 'players' or 'keys' from config.js not defined BEFORE DOMContentLoaded! Check script order/defer attributes.");
             throw new Error("Core config globals missing.");
        } else {
             console.log("[DOM Ready] Core globals 'players' and 'keys' seem to be defined.");
        }

        await waitForRapier();
        console.log("[DOM Ready] Rapier ready.");
        await startGame();
        console.log("[DOM Ready] Game startup initiated.");
    } catch (error) {
         console.error("[DOM Ready] Init failed:", error);
         stateMachine.transitionTo('loading', {message: `Init Error:<br/>${error.message || 'Unknown'}`, error:true});
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
    console.log("[startGame] Attempting Game start...");
    // ---> Add check for globals again right before creating Game instance <---
     if (typeof window.players !== 'object' || window.players === null) {
         console.error("!!! window.players invalid RIGHT BEFORE new Game()!");
         window.players = {}; // Force fix
     }
     if (typeof window.keys !== 'object' || window.keys === null) {
         console.error("!!! window.keys invalid RIGHT BEFORE new Game()!");
         window.keys = {}; // Force fix
     }

    if (!currentGameInstance) {
        stateMachine.transitionTo('loading', {message: "Loading Game..."});
        const game = new Game(); // <<< This relies on global players/keys
        await game.start();
        console.log("[startGame] Game instance start() finished.");
    } else { console.warn("[startGame] Instance exists."); }
}

// Add listener for state transitions to cleanup on disconnect/error
function addStateCleanupListener() {
    stateMachine.on('transition', (data) => {
        // Cleanup when going back to homescreen or loading (with error) from playing/joining
        if ((data.to === 'homescreen' || (data.to === 'loading' && data.options?.error)) &&
            (data.from === 'playing' || data.from === 'joining'))
        {
            console.log(`[State Listener] Cleanup on ${data.from} -> ${data.to}`);
            if (currentGameInstance) { currentGameInstance.cleanupAllPlayers(); }
            if (controls?.isLocked) { controls.unlock(); }
            localPlayerId = null; initializationData = null;
            console.log("[State Listener] Cleanup done.");
        }
    });
}
