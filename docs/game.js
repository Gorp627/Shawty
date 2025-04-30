// --- START OF FULL game.js FILE (Cannon.js Version 1 - Setup) ---
// docs/game.js - Main Game Orchestrator (Cannon.js v1 - Setup)

// ** ADD Cannon.js specific globals **
var cannonWorld = null; // Holds the Cannon.js physics world
const cannonTimeStep = 1 / 60; // Physics timestep
const cannonMaxSubSteps = 3; // Max physics substeps per frame

var currentGameInstance = null;

class Game {
    constructor() {
        // Core components to be initialized
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        this.clock = null;
        // Game state references
        this.players = window.players;
        this.keys = window.keys;
        this.localPlayerMesh = null;

        // ** ADD Cannon.js specific properties **
        this.playerBodies = {}; // Map of playerId to Cannon.js Body objects
        this.mapBody = null; // Reference to the map/ground body

        this.lastNetworkSendTime = 0;
        this.debugMeshes = {};
        this.DEBUG_SHOW_PLAYER_COLLIDERS = false; // Set true to show collision shapes
    }

    // --- Main Initialization Sequence ---
    async init() {
        console.log("--- Game Init Sequence (Cannon.js) ---");
        if (currentGameInstance) { console.warn("Game instance already exists!"); return; }
        currentGameInstance = this;

        if (typeof THREE === 'undefined') {
            console.error("!!! CRITICAL: THREE.js library not loaded!");
            document.body.innerHTML = "<p style='color:red; text-align:center;'>FATAL ERROR: Graphics Library (THREE.js) failed to load. Check index.html script order.</p>";
            return;
        }

        // 1. Setup State Machine & UI
        stateMachine.transitionTo('loading', { message: 'Initializing Core...' });
        if (!UIManager.initialize()) {
             console.error("UIManager initialization failed!");
             document.body.innerHTML = "<p style='color:red; text-align:center;'>FATAL ERROR: UI System Failed to Initialize. Check console (F12).</p>";
             return;
        }
        UIManager.bindStateListeners(stateMachine);

        // 2. Setup Three.js Core
        stateMachine.transitionTo('loading', { message: 'Setting up Graphics...' });
        this.clock = new THREE.Clock();
        this.scene = new THREE.Scene(); window.scene = this.scene;
        this.scene.background = new THREE.Color(0x87CEEB); // Sky Blue
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 500); window.camera = this.camera;
        this.renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('gameCanvas'), antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight); this.renderer.shadowMap.enabled = true; window.renderer = this.renderer;

        // 3. Setup PointerLockControls
        if (typeof THREE.PointerLockControls === 'undefined') {
             console.error("!!! THREE.PointerLockControls not found! Check index.html script order.");
             stateMachine.transitionTo('loading', { message: 'FATAL: Controls Library Failed!', error: true }); return;
        }
        this.controls = new THREE.PointerLockControls(this.camera, this.renderer.domElement); window.controls = this.controls;
        this.controls.addEventListener('lock', () => { if(stateMachine?.is('playing') && UIManager?.gameUI) { UIManager.gameUI.style.cursor = 'none'; } });
        this.controls.addEventListener('unlock', () => { if(stateMachine?.is('playing') && UIManager?.gameUI) { UIManager.gameUI.style.cursor = 'default'; } });
        this.scene.add(this.controls.getObject());

        // 4. Setup Scene Lighting
        this.scene.add(new THREE.AmbientLight(0x606070, 1.0));
        const dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
        dirLight.position.set(40, 50, 30);
        dirLight.castShadow = true;
        dirLight.shadow.mapSize.width = 2048; dirLight.shadow.mapSize.height = 2048;
        dirLight.shadow.camera.near = 0.5; dirLight.shadow.camera.far = 500;
        // Optional shadow camera adjustment
        // dirLight.shadow.camera.left = -100; dirLight.shadow.camera.right = 100;
        // dirLight.shadow.camera.top = 100; dirLight.shadow.camera.bottom = -100;
        this.scene.add(dirLight);
        const hemisphereLight = new THREE.HemisphereLight( 0x87CEEB, 0x404020, 0.6 );
        this.scene.add( hemisphereLight );

        // 5. Initialize Input System
        if (!Input.init(this.controls)) { stateMachine.transitionTo('loading', { message: 'Input Init Failed!', error: true }); return; }

        // 6. Initialize Effects System
        if (!Effects.initialize(this.scene, this.camera)) { stateMachine.transitionTo('loading', { message: 'Effects Init Failed!', error: true }); return; }

        // 7. Initialize Physics (CANNON.js)
        stateMachine.transitionTo('loading', { message: 'Loading Physics Engine...' });
        if (typeof CANNON === 'undefined') {
            console.error("!!! CRITICAL: CANNON.js library not loaded! Check index.html script order.");
            stateMachine.transitionTo('loading', { message: 'FATAL: Physics Library Failed!', error: true });
            return;
        }
        this.setupPhysics(); // Setup Cannon world

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
        // Setup CANNON.js World
        cannonWorld = new CANNON.World();
        cannonWorld.gravity.set(0, CONFIG.GRAVITY, 0);
        cannonWorld.broadphase = new CANNON.NaiveBroadphase();
        cannonWorld.solver.iterations = 10;

        window.cannonWorld = cannonWorld; // Assign to global scope
        physicsIsReady = true; // Set global flag
        console.log("[Game] Cannon.js Physics World Initialized.");

        // Create a simple ground plane immediately
        this.createMapCollider();

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
        // Map collider (simple plane) created during setupPhysics
        // If using Trimesh, might create it here instead:
        // this.createTrimeshMapCollider();
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
        console.log("[Game] --- Starting Gameplay (Cannon.js) ---");
        stateMachine.transitionTo('playing');
        this.cleanupAllPlayers();
        localPlayerId = initData.id;
        console.log(`[Game] Local Player ID set: ${localPlayerId}`);

        for (const id in initData.players) {
            const playerData = initData.players[id]; if (!playerData) continue;

            if (id === localPlayerId) {
                // --- Create LOCAL Player ---
                console.log("[Game] Creating LOCAL player objects...");
                players[id] = {
                    id: id, name: playerData.name, phrase: playerData.phrase,
                    health: playerData.health, isLocal: true, mesh: null,
                    x: playerData.x, y: playerData.y, z: playerData.z, rotationY: playerData.rotationY,
                };
                window.localPlayerName = playerData.name; window.localPlayerPhrase = playerData.phrase;
                UIManager.updateInfo(`Playing as ${playerData.name}`); UIManager.updateHealthBar(playerData.health);

                // Create Physics Body (Cannon.js)
                const playerHeight = CONFIG.PLAYER_HEIGHT;
                const startPos = new CANNON.Vec3(playerData.x, playerData.y + playerHeight / 2.0, playerData.z);
                this.createPlayerPhysicsBody(id, startPos, playerData.rotationY, true); // true = isLocal

                // Create Visual Mesh
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
                } else { console.error("!!! Local player model asset not found!"); }

                // Attach Gun Model
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
                // --- Create REMOTE Player ---
                console.log(`[Game] Creating REMOTE player objects for ${playerData.name || id}...`);
                const remotePlayer = new ClientPlayer(playerData);
                players[id] = remotePlayer;

                if (remotePlayer.mesh) {
                    const playerHeight = CONFIG.PLAYER_HEIGHT;
                    const startPos = new CANNON.Vec3(playerData.x, playerData.y + playerHeight / 2.0, playerData.z);
                    this.createPlayerPhysicsBody(id, startPos, playerData.rotationY, false); // false = remote player
                } else { console.warn(`Skipping physics body for remote player ${id}, mesh failed.`); }
            }
        }
         console.log("[Game] Finished initial player processing.");
    }

    // --- Physics Body Creation (CANNON.js) ---
    createPlayerPhysicsBody(playerId, initialPositionVec3, initialRotationY, isLocal) {
        if (!cannonWorld) { console.error("!!! Cannon world missing for body creation!"); return; }

        const playerMass = CONFIG.PLAYER_MASS || 70;
        const playerRadius = CONFIG.PLAYER_RADIUS || 0.4;
        const playerHeight = CONFIG.PLAYER_HEIGHT || 1.8;

        // Using Sphere shape for simplicity initially
        const playerShape = new CANNON.Sphere(playerRadius);

        const physicsMaterial = new CANNON.Material("playerMaterial");
        physicsMaterial.friction = 0.4;
        physicsMaterial.restitution = 0.0;

        const playerBody = new CANNON.Body({
            mass: isLocal ? playerMass : 0,
            position: initialPositionVec3,
            shape: playerShape,
            material: physicsMaterial,
            type: isLocal ? CANNON.Body.DYNAMIC : CANNON.Body.KINEMATIC,
            angularDamping: 0.95, // Increased damping to prevent spin
            linearDamping: 0.1,
        });

        playerBody.angularFactor.set(0, 1, 0); // Allow rotation only around Y
        playerBody.updateAngularFactor();

        playerBody.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), initialRotationY);

        playerBody.userData = { entityId: playerId, isLocal: isLocal, isPlayer: true };

        cannonWorld.addBody(playerBody);
        this.playerBodies[playerId] = playerBody;

        console.log(`[Game] Created ${isLocal ? 'DYNAMIC' : 'KINEMATIC'} Cannon.js body for player ${playerId}`);

        if (this.DEBUG_SHOW_PLAYER_COLLIDERS) {
            // Pass Cannon Vec3 and Quaternion
            this.addDebugMesh(playerId, playerRadius, playerHeight, playerBody.position, playerBody.quaternion);
        }
    }

    // --- Map Collider Creation (CANNON.js - Simple Plane) ---
    createMapCollider() {
        if (!cannonWorld) { console.error("!!! Cannon world missing for map creation!"); return; }
        console.log("[Game] Creating simple Cannon.js ground plane...");
        const groundMaterial = new CANNON.Material("groundMaterial");
        groundMaterial.friction = 0.6;
        groundMaterial.restitution = 0.1;
        const groundShape = new CANNON.Plane();
        const groundBody = new CANNON.Body({ mass: 0, shape: groundShape, material: groundMaterial });
        groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
        groundBody.position.set(0, 0, 0); // Position plane at Y=0
        cannonWorld.addBody(groundBody);
        this.mapBody = groundBody;
        console.log("[Game] Added Cannon.js ground plane.");

        // Setup default contact material (adjust friction/restitution between everything)
        const defaultMaterial = new CANNON.Material("default");
        const defaultContactMaterial = new CANNON.ContactMaterial(
            defaultMaterial, defaultMaterial,
            { friction: 0.4, restitution: 0.1 }
        );
        cannonWorld.defaultContactMaterial = defaultContactMaterial;

        // Specific contact for player/ground (optional override)
        // Need a default player material defined or get it from player body after creation
        // const playerMat = new CANNON.Material("playerMaterial"); // Or reference existing one
        // const playerGroundContact = new CANNON.ContactMaterial(groundMaterial, playerMat, { friction: 0.5, restitution: 0.0 });
        // cannonWorld.addContactMaterial(playerGroundContact);
    }

    // Optional: Trimesh Map Collider (More complex, use if simple plane isn't enough)
    /*
    createTrimeshMapCollider() {
        if (!cannonWorld || !window.mapMesh) {
            console.warn("Cannon world or map mesh missing for Trimesh creation.");
            return;
        }
        console.log("[Game] Attempting to create Cannon.js Trimesh map collider...");
        try {
            const vertices = [];
            const indices = [];
            let indexOffset = 0;

            window.mapMesh.traverse(child => {
                if (child.isMesh) {
                    const geometry = child.geometry;
                    const positionAttribute = geometry.attributes.position;
                    const indexAttribute = geometry.index;

                    if (!positionAttribute) return;

                    // Apply world matrix manually to vertices before adding
                    const worldMatrix = child.matrixWorld;
                    const tempVec = new THREE.Vector3();

                    for (let i = 0; i < positionAttribute.count; i++) {
                        tempVec.fromBufferAttribute(positionAttribute, i);
                        tempVec.applyMatrix4(worldMatrix);
                        vertices.push(tempVec.x, tempVec.y, tempVec.z);
                    }

                    if (indexAttribute) {
                        for (let i = 0; i < indexAttribute.count; i++) {
                            indices.push(indexAttribute.getX(i) + indexOffset);
                        }
                    } else {
                        for (let i = 0; i < positionAttribute.count; i += 3) {
                            indices.push(indexOffset + i, indexOffset + i + 1, indexOffset + i + 2);
                        }
                    }
                    indexOffset += positionAttribute.count;
                }
            });

            if (vertices.length > 0 && indices.length > 0) {
                const trimeshShape = new CANNON.Trimesh(vertices, indices);
                const trimeshBody = new CANNON.Body({ mass: 0 }); // Static
                trimeshBody.addShape(trimeshShape);
                // Position/rotate trimesh body if needed (usually not if vertices are world space)
                // trimeshBody.position.set(0, 0, 0);
                // trimeshBody.quaternion.set(0, 0, 0, 1);
                cannonWorld.addBody(trimeshBody);
                this.mapBody = trimeshBody; // Store reference
                console.log(`[Game] Cannon.js Trimesh map collider created. Vertices: ${vertices.length / 3}, Triangles: ${indices.length / 3}`);
            } else {
                throw new Error("No valid vertices/indices for Trimesh.");
            }
        } catch (e) {
            console.error("!!! Error creating Cannon.js Trimesh map collider:", e);
            console.warn("Falling back to simple ground plane.");
            this.createMapCollider(); // Create plane as fallback
        }
    }
    */


    // --- Debug Mesh Creation ---
    addDebugMesh(playerId, radius, height, cannonPosition, cannonQuaternion) {
         if (!this.scene || !THREE) return;
         const capsuleHeight = height - 2 * radius;
         const shapeGeom = new THREE.SphereGeometry(radius, 8, 8); // Match simple sphere shape
         // const shapeGeom = new THREE.CapsuleGeometry(radius, capsuleHeight, 4, 8); // If using capsule
         const wireframeMat = new THREE.MeshBasicMaterial({ color: playerId === localPlayerId ? 0x00ff00 : 0xffff00, wireframe: true });
         const wireframeMesh = new THREE.Mesh(shapeGeom, wireframeMat);
         wireframeMesh.position.copy(cannonPosition); // Copy Cannon Vec3
         wireframeMesh.quaternion.copy(cannonQuaternion); // Copy Cannon Quaternion
         this.scene.add(wireframeMesh);
         this.debugMeshes[playerId] = wireframeMesh;
    }

    // --- Player Cleanup (CANNON.js) ---
    cleanupPlayer(playerId) {
        const player = players[playerId];
        if (player && player.mesh && this.scene) { this.scene.remove(player.mesh); player.mesh = null; }
        if (players[playerId]) delete players[playerId];
        if(playerId === localPlayerId) { this.localPlayerMesh = null; }
        if (this.debugMeshes[playerId] && this.scene) { this.scene.remove(this.debugMeshes[playerId]); this.debugMeshes[playerId].geometry?.dispose(); this.debugMeshes[playerId].material?.dispose(); delete this.debugMeshes[playerId]; }
        const body = this.playerBodies[playerId];
        if (body && cannonWorld) { cannonWorld.removeBody(body); delete this.playerBodies[playerId]; }
     }

     cleanupAllPlayers() {
         console.log("[Game] Cleaning up all player objects (Cannon.js)...");
         const playerIds = Object.keys(players);
         playerIds.forEach(id => this.cleanupPlayer(id));
         localPlayerId = null; this.localPlayerMesh = null;
         this.playerBodies = {}; players = {};
         console.log("[Game] Player cleanup finished.");
     }

    // --- Main Update Loop (CANNON.js) ---
    update() {
        requestAnimationFrame(this.update.bind(this));
        if (!this.clock || !this.renderer || !this.scene || !this.camera || !cannonWorld) return;

        const deltaTime = this.clock.getDelta();

        if (stateMachine.is('playing')) {
            // --- Physics Simulation Step (Cannon.js) ---
            try {
                cannonWorld.step(cannonTimeStep, deltaTime, cannonMaxSubSteps);
            } catch (e) {
                console.error("!!! Cannon.js world step error:", e);
                 // Consider pausing or handling the error state
            }

            // --- Update Local Player Logic ---
            const localPlayerBody = this.playerBodies[localPlayerId];
            if (localPlayerBody) {
                 updateLocalPlayer(deltaTime, localPlayerBody, this.camera, this.controls);
            }

            // --- Synchronize THREE.js Meshes with Cannon.js Bodies ---
            for (const id in this.playerBodies) {
                const body = this.playerBodies[id];
                const player = players[id]; // Could be local or remote

                if (player && player.mesh) {
                    try {
                        player.mesh.position.copy(body.position);
                        // Adjust Y pos based on shape origin (center for sphere/capsule) vs mesh origin (feet)
                        player.mesh.position.y -= CONFIG.PLAYER_HEIGHT / 2.0;

                        // Only sync local player mesh Y rotation with camera
                        if (id === localPlayerId) {
                            const cameraEuler = new THREE.Euler().setFromQuaternion(this.camera.quaternion, 'YXZ');
                            player.mesh.rotation.y = cameraEuler.y;
                            // Cannon body rotation is handled by physics, no need to copy body.quaternion to local mesh
                        } else {
                            // Sync remote player mesh rotation directly with physics body
                            player.mesh.quaternion.copy(body.quaternion);
                        }


                        // Update debug mesh if enabled
                        if (this.DEBUG_SHOW_PLAYER_COLLIDERS && this.debugMeshes[id]) {
                            this.debugMeshes[id].position.copy(body.position);
                            this.debugMeshes[id].quaternion.copy(body.quaternion);
                        }
                    } catch(e) { console.error(`Error syncing mesh for player ${id}:`, e); }
                }
            }

            // --- Update Camera Position (Relative to Physics Body) ---
            if (localPlayerBody && this.camera) {
                 try {
                     const targetCameraPos = new THREE.Vector3();
                     targetCameraPos.copy(localPlayerBody.position); // Copy body center position
                     targetCameraPos.y += CONFIG.CAMERA_Y_OFFSET; // Add eye height offset
                     // Camera position is directly controlled by PointerLockControls now
                     // Only copy if NOT using PointerLockControls, or maybe lerp very gently?
                     // this.camera.position.copy(targetCameraPos); // Snapping example
                 } catch(e) { console.error("Error updating camera position:", e); }
            }

            Effects?.update(deltaTime);

        } // End if(stateMachine.is('playing'))

        // --- Render Scene ---
        if (this.renderer && this.scene && this.camera) {
            this.renderer.render(this.scene, this.camera);
        }
    } // End Update Loop

} // End Game Class

// --- Global Initialization Trigger ---
document.addEventListener('DOMContentLoaded', () => {
    if (typeof CANNON === 'undefined') {
        console.error("!!! CANNON.js not loaded before DOMContentLoaded!");
        document.body.innerHTML = `<p style='color:red; font-size: 1.5em;'>FATAL ERROR: Physics Engine (Cannon.js) failed to load!</p>`;
        return;
    }
    const startGameInit = () => {
         console.log("DOM ready. Starting Game Initialization...");
         const game = new Game();
         game.init().catch(error => {
             console.error("Unhandled error during Game Initialization:", error);
              if(typeof UIManager !== 'undefined') { UIManager.showLoading(`Initialization Error:<br/>${error.message}`, true); }
              else { document.body.innerHTML = `<p style='color:red; font-size: 1.5em;'>FATAL INITIALIZATION ERROR: ${error.message}</p>`; }
         });
    };
    startGameInit();
});
console.log("game.js loaded (Cannon.js v1 - Setup)");
// --- END OF FULL game.js FILE ---
