// --- START OF FULL game.js FILE ---
// docs/game.js - Main Game Orchestrator (Uses Global Scope - v27 Camera Lerp Disabled)

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
            document.body.innerHTML = "<p style='color:red; text-align:center;'>FATAL ERROR: Graphics Library (THREE.js) failed to load. Check index.html script order.</p>";
            return;
        }

        // 1. Setup State Machine & UI Listeners
        stateMachine.transitionTo('loading', { message: 'Initializing Core...' });
        if (!UIManager.initialize()) {
             console.error("UIManager initialization failed!");
             document.body.innerHTML = "<p style='color:red; text-align:center;'>FATAL ERROR: UI System Failed to Initialize. Check console (F12).</p>";
             return;
        }
        UIManager.bindStateListeners(stateMachine);

        // 2. Setup Three.js Core Components
        stateMachine.transitionTo('loading', { message: 'Setting up Graphics...' });
        this.clock = new THREE.Clock();
        this.scene = new THREE.Scene(); window.scene = this.scene; // Assign to global AND instance
        this.scene.background = new THREE.Color(0x87CEEB); // Sky Blue
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 500); window.camera = this.camera; // Assign to global AND instance
        this.renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('gameCanvas'), antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight); this.renderer.shadowMap.enabled = true; window.renderer = this.renderer; // Assign to global AND instance

        // 3. Setup PointerLockControls
        if (typeof THREE.PointerLockControls === 'undefined') {
             console.error("!!! THREE.PointerLockControls not found! Check index.html script order.");
             stateMachine.transitionTo('loading', { message: 'FATAL: Controls Library Failed!', error: true }); return;
        }
        // Pass THIS camera instance to the controls
        this.controls = new THREE.PointerLockControls(this.camera, this.renderer.domElement); window.controls = this.controls; // Assign to global AND instance
        this.controls.addEventListener('lock', () => {
            if(stateMachine?.is('playing') && UIManager?.gameUI) { UIManager.gameUI.style.cursor = 'none'; }
        });
        this.controls.addEventListener('unlock', () => {
            if(stateMachine?.is('playing') && UIManager?.gameUI) { UIManager.gameUI.style.cursor = 'default'; }
        });
        // Add the controls' object (which CONTAINS the camera) to THIS scene instance
        this.scene.add(this.controls.getObject());

        // 4. Setup Scene Lighting (Add lights to THIS scene instance)
        this.scene.add(new THREE.AmbientLight(0x606070, 1.0));
        const dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
        dirLight.position.set(40, 50, 30);
        dirLight.castShadow = true;
        dirLight.shadow.mapSize.width = 2048; dirLight.shadow.mapSize.height = 2048;
        dirLight.shadow.camera.near = 0.5; dirLight.shadow.camera.far = 500;
        this.scene.add(dirLight);
        const hemisphereLight = new THREE.HemisphereLight( 0x87CEEB, 0x404020, 0.6 );
        this.scene.add( hemisphereLight );

        // 5. Initialize Input System
        if (!Input.init(this.controls)) {
            stateMachine.transitionTo('loading', { message: 'Input Init Failed!', error: true }); return;
        }

        // 6. Initialize Effects System (Pass THIS scene and camera instances)
        if (!Effects.initialize(this.scene, this.camera)) {
            stateMachine.transitionTo('loading', { message: 'Effects Init Failed!', error: true }); return;
        }

        // 7. Initialize Physics
        stateMachine.transitionTo('loading', { message: 'Loading Physics Engine...' });
        if (!window.isRapierReady) {
            console.log("Waiting for Rapier physics engine...");
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
        this.setupPhysics();

        // 8. Setup Asset Loaders
        stateMachine.transitionTo('loading', { message: 'Preparing Asset Loaders...' });
        this.setupLoaders();

        // 9. Start Loading Assets
        stateMachine.transitionTo('loading', { message: 'Loading Game Assets...' });
        loadManager.on('ready', this.onAssetsReady.bind(this));
        loadManager.on('error', this.onLoadError.bind(this));
        loadManager.startLoading();

        // 10. Initialize Networking
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
        if (!RAPIER) { console.error("!!! RAPIER global object is missing during physics setup!"); return; }
        rapierWorld = new RAPIER.World({ x: 0, y: CONFIG.GRAVITY, z: 0 });
        rapierEventQueue = new RAPIER.EventQueue(true);
        window.rapierWorld = rapierWorld;
        window.rapierEventQueue = rapierEventQueue;
        physicsIsReady = true;
        console.log("[Game] Rapier Physics World Initialized.");
        this.attemptProceedToGame();
    }

    setupLoaders() {
        if (!THREE) { console.error("!!! THREE missing during loader setup!"); return; }
        if (typeof THREE.DRACOLoader === 'undefined' || typeof THREE.GLTFLoader === 'undefined') {
             console.error("!!! THREE.DRACOLoader or THREE.GLTFLoader constructors not found! Check index.html script order."); return;
        }
        dracoLoader = new THREE.DRACOLoader();
        dracoLoader.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/libs/draco/');
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
        assetsAreReady = true;
        this.createMapCollider();
        this.attemptProceedToGame();
    }

    onLoadError(errorData) {
        console.error("[Game] Asset Load Manager reported 'error':", errorData.message);
        stateMachine.transitionTo('loading', { message: `Asset Load Failed!<br/>${errorData.message}`, error: true });
    }

    // --- Check Prerequisites & Transition Logic ---
    attemptProceedToGame() {
        console.log(`[Game] Checking prerequisites: Assets=${assetsAreReady}, Physics=${physicsIsReady}, Network=${networkIsInitialized}, InitData=${!!initializationData}`);
        if (assetsAreReady && physicsIsReady && networkIsInitialized && initializationData) {
            if (!stateMachine.is('playing')) {
                console.log("[Game] All prerequisites met! Starting gameplay...");
                this.startGamePlay(initializationData);
                initializationData = null;
            } else {
                 console.log("[Game] Already in playing state, ignoring redundant attemptProceedToGame for gameplay start.");
            }
        }
        else if (assetsAreReady && physicsIsReady && networkIsInitialized && !initializationData && stateMachine.is('loading')) {
            console.log("[Game] Core components ready, transitioning to Homescreen...");
            stateMachine.transitionTo('homescreen');
        }
        else {
            if (stateMachine.is('loading') && !stateMachine.options.error) {
                let waitMsg = "Initializing...";
                if (!assetsAreReady) waitMsg = "Loading Assets...";
                else if (!physicsIsReady) waitMsg = "Loading Physics...";
                else if (!networkIsInitialized) waitMsg = "Connecting...";
                stateMachine.transitionTo('loading', { message: waitMsg });
            }
        }
    }

    // --- Start Actual Gameplay Logic ---
    startGamePlay(initData) {
        console.log("[Game] --- Starting Gameplay ---");
        stateMachine.transitionTo('playing');
        this.cleanupAllPlayers();
        localPlayerId = initData.id;
        console.log(`[Game] Local Player ID set: ${localPlayerId}`);

        for (const id in initData.players) {
            const playerData = initData.players[id]; if (!playerData) continue;

            if (id === localPlayerId) {
                console.log("[Game] Creating LOCAL player objects...");
                players[id] = {
                    id: id, name: playerData.name, phrase: playerData.phrase,
                    health: playerData.health, isLocal: true, mesh: null,
                    x: playerData.x, y: playerData.y, z: playerData.z, rotationY: playerData.rotationY,
                };
                window.localPlayerName = playerData.name;
                window.localPlayerPhrase = playerData.phrase;
                UIManager.updateInfo(`Playing as ${playerData.name}`);
                UIManager.updateHealthBar(playerData.health);

                const playerHeight = CONFIG.PLAYER_HEIGHT; const bodyCenterY = playerData.y + playerHeight / 2.0;
                const startPos = { x: playerData.x, y: bodyCenterY, z: playerData.z };
                this.createPlayerPhysicsBody(id, startPos, playerData.rotationY, true);

                const playerModelAsset = window.playerModelData;
                if (playerModelAsset?.scene) {
                    try {
                        this.localPlayerMesh = playerModelAsset.scene.clone();
                        this.localPlayerMesh.scale.set(0.5, 0.5, 0.5);
                        this.localPlayerMesh.visible = false;
                        this.localPlayerMesh.userData = { entityId: id, isPlayer: true, isLocal: true };
                         this.localPlayerMesh.traverse(child => { if(child.isMesh){ child.castShadow=true; child.receiveShadow=true; child.visible=false; } });
                        this.scene.add(this.localPlayerMesh);
                        players[id].mesh = this.localPlayerMesh;
                        console.log("[Game] Created local player GLTF mesh (hidden).");
                    } catch(e) { console.error("Error cloning/adding local player mesh:", e); }
                } else { console.error("!!! Local player model asset not found! Cannot create mesh."); }

                 const gunModelAsset = window.gunModelData;
                 if(gunModelAsset?.scene && this.camera) {
                     gunMesh = gunModelAsset.scene.clone();
                     gunMesh.scale.set(0.3, 0.3, 0.3); // Adjusted scale
                     gunMesh.position.set(0.15, -0.15, -0.4);
                     gunMesh.rotation.set(0, Math.PI, 0);
                      gunMesh.traverse(child => { if (child.isMesh) child.castShadow = true; });
                     this.camera.add(gunMesh);
                     console.log("[Game] Attached gun model to camera.");
                 } else if (!this.camera) {
                     console.error("!!! Cannot attach gun model: Game camera not initialized.");
                 } else { console.warn("Gun model asset not ready, cannot attach gun."); }

            } else {
                console.log(`[Game] Creating REMOTE player objects for ${playerData.name || id}...`);
                const remotePlayer = new ClientPlayer(playerData);
                players[id] = remotePlayer;

                if (remotePlayer.mesh) {
                    const playerHeight = CONFIG.PLAYER_HEIGHT; const bodyCenterY = playerData.y + playerHeight / 2.0;
                    const startPos = { x: playerData.x, y: bodyCenterY, z: playerData.z };
                    this.createPlayerPhysicsBody(id, startPos, playerData.rotationY, false);
                } else {
                     console.warn(`Skipping physics body creation for remote player ${id}, mesh failed to load.`);
                }
            }
        }
         console.log("[Game] Finished initial player processing.");
    }

    // --- Physics Body Creation ---
    createPlayerPhysicsBody(playerId, initialPosition, initialRotationY, isLocal) {
        if (!rapierWorld || !RAPIER) { console.error("!!! Physics world/Rapier missing for body creation!"); return; }
        const h = CONFIG.PLAYER_HEIGHT; const r = CONFIG.PLAYER_RADIUS;
        const capsuleHalfHeight = Math.max(0.01, h / 2.0 - r);
        let rigidBodyDesc;
        let colliderDesc = RAPIER.ColliderDesc.capsule(capsuleHalfHeight, r)
            .setFriction(0.7).setRestitution(0.1).setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);
        let quaternion;
        try {
            const axis = { x: 0, y: 1, z: 0 }; const angle = initialRotationY;
            const halfAngle = angle * 0.5; const s = Math.sin(halfAngle);
            const qx = axis.x * s; const qy = axis.y * s; const qz = axis.z * s; const qw = Math.cos(halfAngle);
            quaternion = new RAPIER.Quaternion(qx, qy, qz, qw);
        } catch (e) {
             console.error(`!!! Failed to manually create Quaternion for ${playerId}:`, e);
             quaternion = RAPIER.Quaternion.identity();
        }
        if (!quaternion) { console.error(`Failed to create or fallback quaternion for player ${playerId}`); return; }
        colliderDesc.userData = { entityId: playerId, isLocal: isLocal, isPlayer: true };
        if (isLocal) {
            rigidBodyDesc = RAPIER.RigidBodyDesc.dynamic()
                .setTranslation(initialPosition.x, initialPosition.y, initialPosition.z)
                .setRotation(quaternion)
                .setLinearDamping(0.5).setAngularDamping(1.0).lockRotations().setCcdEnabled(true);
            colliderDesc.setDensity(1.0);
        } else {
            rigidBodyDesc = RAPIER.RigidBodyDesc.kinematicPositionBased()
                .setTranslation(initialPosition.x, initialPosition.y, initialPosition.z)
                .setRotation(quaternion);
        }
        try {
            const body = rapierWorld.createRigidBody(rigidBodyDesc);
            if (!body) throw new Error("Rapier RigidBody creation returned null.");
            rapierWorld.createCollider(colliderDesc, body.handle);
            this.playerRigidBodyHandles[playerId] = body.handle;
            console.log(`[Game] Created ${isLocal ? 'DYNAMIC' : 'KINEMATIC'} Rapier body for player ${playerId} (Handle: ${body.handle})`);
            if (this.DEBUG_SHOW_PLAYER_COLLIDERS) {
                this.addDebugMesh(playerId, r, h, initialPosition, quaternion);
            }
        } catch(e) {
             console.error(`!!! Failed to create physics body or collider for ${playerId} (isLocal=${isLocal}):`, e);
        }
    }

    // --- Map Collider Creation ---
    createMapCollider() {
        if (!rapierWorld || !RAPIER || !window.mapMesh) {
            console.warn("Map collider prerequisites (Rapier/World/MapMesh) not met, using simple ground.");
            this.createSimpleGroundCollider(); return;
        }
        console.log("[Game] Attempting to create map collider from loaded GLTF...");
        try {
            const geometries = [];
            window.mapMesh.traverse(child => { if (child.isMesh) { const g = child.geometry.clone(); g.applyMatrix4(child.matrixWorld); geometries.push(g); }});
            if (geometries.length === 0) throw new Error("No mesh geometries found within the loaded map asset.");
            const vertices = []; const indices = []; let currentIndexOffset = 0;
            geometries.forEach(geometry => {
                const pos = geometry.attributes.position; const idx = geometry.index; if (!pos) return;
                for (let i = 0; i < pos.count; i++) { vertices.push(pos.getX(i), pos.getY(i), pos.getZ(i)); }
                if (idx) { for (let i = 0; i < idx.count; i++) { indices.push(idx.getX(i) + currentIndexOffset); } }
                else { for (let i = 0; i < pos.count; i += 3) { indices.push(currentIndexOffset + i, currentIndexOffset + i + 1, currentIndexOffset + i + 2); } }
                currentIndexOffset += pos.count; geometry.dispose();
            });
            if (vertices.length > 0 && indices.length > 0) {
                 const vertsF32 = new Float32Array(vertices); const indsU32 = new Uint32Array(indices);
                 let colliderDesc = RAPIER.ColliderDesc.trimesh(vertsF32, indsU32).setFriction(1.0).setRestitution(0.1);
                 const mapCollider = rapierWorld.createCollider(colliderDesc); this.mapColliderHandle = mapCollider.handle;
                 console.log(`[Game] Trimesh map collider created successfully. Handle: ${this.mapColliderHandle}. Vertices: ${vertices.length / 3}, Triangles: ${indices.length / 3}`);
            } else { throw new Error("No valid vertices or indices could be extracted from map meshes."); }
        } catch (e) {
            console.error("!!! Error creating Trimesh map collider:", e);
            console.warn("Falling back to simple ground collider due to error.");
            this.createSimpleGroundCollider();
        }
    }

    createSimpleGroundCollider() {
        if (!rapierWorld || !RAPIER) { console.error("Cannot create simple ground, Rapier/World missing."); return; }
        let colliderDesc = RAPIER.ColliderDesc.cuboid(100.0, 0.5, 100.0).setTranslation(0, -0.5, 0).setFriction(1.0);
        const groundCollider = rapierWorld.createCollider(colliderDesc); this.mapColliderHandle = groundCollider.handle;
        console.warn("[Game] Using SIMPLE GROUND COLLIDER (DEBUG/FALLBACK).");
    }

    // --- Debug Mesh Creation ---
    addDebugMesh(playerId, radius, height, position, quaternion) {
         if (!this.scene || !THREE) return;
         const capsuleHeight = height - 2 * radius;
         const capsuleGeom = new THREE.CapsuleGeometry(radius, capsuleHeight, 4, 8);
         const wireframeMat = new THREE.MeshBasicMaterial({ color: playerId === localPlayerId ? 0x00ff00 : 0xffff00, wireframe: true });
         const wireframeMesh = new THREE.Mesh(capsuleGeom, wireframeMat);
         wireframeMesh.position.set(position.x, position.y, position.z);
         wireframeMesh.quaternion.set(quaternion.x, quaternion.y, quaternion.z, quaternion.w);
         this.scene.add(wireframeMesh);
         this.debugMeshes[playerId] = wireframeMesh;
    }

    // --- Player Cleanup ---
    cleanupPlayer(playerId) {
        const player = players[playerId];
        if (player && player.mesh && this.scene) { this.scene.remove(player.mesh); player.mesh = null; }
        if (players[playerId]) delete players[playerId];
        if(playerId === localPlayerId) { this.localPlayerMesh = null; }
        if (this.debugMeshes[playerId] && this.scene) { this.scene.remove(this.debugMeshes[playerId]); this.debugMeshes[playerId].geometry?.dispose(); this.debugMeshes[playerId].material?.dispose(); delete this.debugMeshes[playerId]; }
        const bodyHandle = this.playerRigidBodyHandles[playerId];
        if (bodyHandle !== undefined && bodyHandle !== null && rapierWorld) {
             try { let body = rapierWorld.getRigidBody(bodyHandle); if (body) rapierWorld.removeRigidBody(body); }
             catch (e) { console.error(`Error removing Rapier body handle ${bodyHandle}:`, e); }
             delete this.playerRigidBodyHandles[playerId];
         }
     }

     cleanupAllPlayers() {
         console.log("[Game] Cleaning up all player objects...");
         const playerIds = Object.keys(players);
         playerIds.forEach(id => this.cleanupPlayer(id));
         localPlayerId = null; this.localPlayerMesh = null;
         this.playerRigidBodyHandles = {}; players = {};
         console.log("[Game] Player cleanup finished.");
     }

    // --- Main Update Loop ---
    update() {
        requestAnimationFrame(this.update.bind(this));
        if (!this.clock || !this.renderer || !this.scene || !this.camera) return; // Check instance variables

        const deltaTime = this.clock.getDelta();

        if (stateMachine.is('playing')) {
            // --- Physics Simulation Step ---
            if (rapierWorld && RAPIER) {
                 const physicsTimestep = 1 / 60;
                 this.physicsStepAccumulator += deltaTime;

                 while (this.physicsStepAccumulator >= physicsTimestep) {
                     const localPlayerBodyHandle = this.playerRigidBodyHandles[localPlayerId];
                     if (localPlayerBodyHandle !== undefined && localPlayerBodyHandle !== null) {
                          try {
                              const localBody = rapierWorld.getRigidBody(localPlayerBodyHandle);
                              if (localBody) {
                                  updateLocalPlayer(physicsTimestep, localBody, this.camera, this.controls);
                              }
                          } catch(e) { console.error("Error getting/updating local player body:", e); }
                     }
                     rapierWorld.step(rapierEventQueue);
                     this.physicsStepAccumulator -= physicsTimestep;
                 } // End fixed timestep loop

                 rapierEventQueue.drainCollisionEvents((handle1, handle2, started) => { /* Collision logic */ });
            } // End Physics Step

            // --- Update Remote Player Visuals ---
            for (const id in players) {
                 if (id === localPlayerId || !players[id]?.mesh) continue;
                 const remotePlayer = players[id];
                 const bodyHandle = this.playerRigidBodyHandles[id];
                 if (bodyHandle !== undefined && bodyHandle !== null && rapierWorld) {
                      try {
                          const body = rapierWorld.getRigidBody(bodyHandle);
                          if (body) {
                              const position = body.translation();
                              const rotation = body.rotation();
                              const playerHeight = CONFIG.PLAYER_HEIGHT;
                              remotePlayer.mesh.position.set(position.x, position.y - playerHeight / 2.0, position.z);
                              remotePlayer.mesh.quaternion.copy(rotation);
                              if (this.DEBUG_SHOW_PLAYER_COLLIDERS && this.debugMeshes[id]) {
                                   this.debugMeshes[id].position.copy(position);
                                   this.debugMeshes[id].quaternion.copy(rotation);
                              }
                          }
                      } catch(e) { console.error(`Error updating remote player ${id} visuals:`, e); }
                 }
            } // End Remote Player Visual Update

            // --- Update Camera Position ---
             const localPlayerBodyHandle = this.playerRigidBodyHandles[localPlayerId];
             if (localPlayerBodyHandle !== undefined && localPlayerBodyHandle !== null && rapierWorld && this.camera) {
                 try {
                     const localBody = rapierWorld.getRigidBody(localPlayerBodyHandle);
                     if (localBody) {
                         const bodyPos = localBody.translation();
                         const targetCameraPos = new THREE.Vector3(bodyPos.x, bodyPos.y + CONFIG.CAMERA_Y_OFFSET, bodyPos.z);
                         // ***** CAMERA LERPING DISABLED FOR DEBUGGING *****
                         // this.camera.position.lerp(targetCameraPos, 0.7);
                         // Let PointerLockControls handle camera position/rotation for now
                         // ************************************************
                     }
                 } catch(e) { console.error("Error updating camera position:", e); }
             } // End Camera Update

             Effects?.update(deltaTime); // Effects uses globals ok

        } // End if(stateMachine.is('playing'))

        // --- Render Scene ---
        if (this.renderer && this.scene && this.camera) {
            this.renderer.render(this.scene, this.camera);
        }
    } // End Update Loop

} // End Game Class

// --- Global Initialization Trigger ---
document.addEventListener('DOMContentLoaded', () => {
    const startGameInit = () => {
         console.log("DOM ready. Starting Game Initialization...");
         const game = new Game();
         game.init().catch(error => {
             console.error("Unhandled error during Game Initialization:", error);
              if(typeof UIManager !== 'undefined') {
                 UIManager.showLoading(`Initialization Error:<br/>${error.message}`, true);
              } else {
                 document.body.innerHTML = `<p style='color:red; font-size: 1.5em;'>FATAL INITIALIZATION ERROR: ${error.message}</p>`;
              }
         });
    };
    if (window.isRapierReady) { startGameInit(); }
    else {
        console.log("DOM Content Loaded, waiting for Rapier...");
        window.addEventListener('rapier-ready', startGameInit, { once: true });
        window.addEventListener('rapier-error', () => { console.error("Rapier failed to load, cannot start game."); }, { once: true });
    }
});
console.log("game.js loaded (Uses Global Scope - v27 Camera Lerp Disabled)");
// --- END OF FULL game.js FILE ---
