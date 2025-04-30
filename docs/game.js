// --- START OF FULL game.js FILE (Cannon.js Version 1 - Setup) ---
// docs/game.js - Main Game Orchestrator (Cannon.js v1 - Setup)

// --- Global variables ---
// ... (keep existing globals like players, keys, etc.) ...

// ** REMOVE Rapier specific globals **
// var RAPIER = window.RAPIER || null; // NO LONGER NEEDED
// var rapierWorld = null; // NO LONGER NEEDED
// var rapierEventQueue = null; // NO LONGER NEEDED

// ** ADD Cannon.js specific globals **
var cannonWorld = null; // Holds the Cannon.js physics world
const cannonTimeStep = 1 / 60; // Physics timestep
const cannonMaxSubSteps = 3; // Max physics substeps per frame

var currentGameInstance = null;

class Game {
    constructor() {
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        this.clock = null;
        this.players = window.players;
        this.keys = window.keys;
        this.localPlayerMesh = null;
        // ** REMOVE Rapier specific properties **
        // this.mapColliderHandle = null;
        // this.playerRigidBodyHandles = {};
        // this.physicsStepAccumulator = 0; // Cannon handles timestep internally

        // ** ADD Cannon.js specific properties **
        this.playerBodies = {}; // Map of playerId to Cannon.js Body objects
        this.mapBody = null; // Reference to the map/ground body

        this.lastNetworkSendTime = 0;
        this.debugMeshes = {};
        this.DEBUG_SHOW_PLAYER_COLLIDERS = false; // Can still use this for Three.js debug meshes
    }

    // --- Main Initialization Sequence ---
    async init() {
        console.log("--- Game Init Sequence (Cannon.js) ---");
        if (currentGameInstance) { console.warn("Game instance already exists!"); return; }
        currentGameInstance = this;

        if (typeof THREE === 'undefined') { /* ... THREE check ... */ return; }

        // 1. Setup State Machine & UI
        stateMachine.transitionTo('loading', { message: 'Initializing Core...' });
        if (!UIManager.initialize()) { /* ... UI Init check ... */ return; }
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
        if (typeof THREE.PointerLockControls === 'undefined') { /* ... Controls check ... */ return; }
        this.controls = new THREE.PointerLockControls(this.camera, this.renderer.domElement); window.controls = this.controls;
        this.controls.addEventListener('lock', () => { /* ... lock logic ... */ });
        this.controls.addEventListener('unlock', () => { /* ... unlock logic ... */ });
        this.scene.add(this.controls.getObject());

        // 4. Setup Scene Lighting
        this.scene.add(new THREE.AmbientLight(0x606070, 1.0));
        const dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
        dirLight.position.set(40, 50, 30);
        dirLight.castShadow = true; /* ... shadow setup ... */
        this.scene.add(dirLight);
        const hemisphereLight = new THREE.HemisphereLight( 0x87CEEB, 0x404020, 0.6 );
        this.scene.add( hemisphereLight );

        // 5. Initialize Input System
        if (!Input.init(this.controls)) { /* ... Input init check ... */ return; }

        // 6. Initialize Effects System
        if (!Effects.initialize(this.scene, this.camera)) { /* ... Effects init check ... */ return; }

        // 7. Initialize Physics (CANNON.js)
        stateMachine.transitionTo('loading', { message: 'Loading Physics Engine...' });
        // No async needed for Cannon.js usually, just check if CANNON object exists
        if (typeof CANNON === 'undefined') {
            console.error("!!! CRITICAL: CANNON.js library not loaded! Check index.html script order.");
            stateMachine.transitionTo('loading', { message: 'FATAL: Physics Library Failed!', error: true });
            return;
        }
        this.setupPhysics(); // Setup Cannon world

        // 8. Setup Asset Loaders
        stateMachine.transitionTo('loading', { message: 'Preparing Asset Loaders...' });
        this.setupLoaders(); // Keep this, still uses THREE loaders

        // 9. Start Loading Assets
        stateMachine.transitionTo('loading', { message: 'Loading Game Assets...' });
        loadManager.on('ready', this.onAssetsReady.bind(this));
        loadManager.on('error', this.onLoadError.bind(this));
        loadManager.startLoading(); // Still need assets

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
        // Gravity is a CANNON.Vec3 property
        cannonWorld.gravity.set(0, CONFIG.GRAVITY, 0); // Use GRAVITY from config
        cannonWorld.broadphase = new CANNON.NaiveBroadphase(); // Simple broadphase is often fine
        // Optional: Improve solver iterations for stability
        cannonWorld.solver.iterations = 10;

        window.cannonWorld = cannonWorld; // Assign to global scope (optional, but useful)
        physicsIsReady = true; // Set global flag
        console.log("[Game] Cannon.js Physics World Initialized.");

        // Create a simple ground plane immediately
        this.createMapCollider(); // We'll make this create a simple plane first

        this.attemptProceedToGame();
    }

    setupLoaders() { /* ... keep existing loader setup ... */ }
    addEventListeners() { /* ... keep existing event listeners ... */ }
    onWindowResize() { /* ... keep existing resize logic ... */ }
    onAssetsReady() {
        console.log("[Game] Asset Load Manager reported 'ready'.");
        assetsAreReady = true;
        // Map collider (simple plane) is created during setupPhysics now
        // We might create a *Trimesh* map collider here later if needed
        this.attemptProceedToGame(); // Check prerequisites again
    }
    onLoadError(errorData) { /* ... keep existing error handling ... */ }
    attemptProceedToGame() { /* ... keep existing logic ... */ }

    // --- Start Actual Gameplay Logic ---
    startGamePlay(initData) {
        console.log("[Game] --- Starting Gameplay (Cannon.js) ---");
        stateMachine.transitionTo('playing');
        this.cleanupAllPlayers(); // Important to clean up old state
        localPlayerId = initData.id;
        console.log(`[Game] Local Player ID set: ${localPlayerId}`);

        for (const id in initData.players) {
            const playerData = initData.players[id]; if (!playerData) continue;

            if (id === localPlayerId) {
                // --- Create LOCAL Player ---
                console.log("[Game] Creating LOCAL player objects...");
                players[id] = { /* ... store player data as before ... */ };
                window.localPlayerName = playerData.name; window.localPlayerPhrase = playerData.phrase;
                UIManager.updateInfo(`Playing as ${playerData.name}`); UIManager.updateHealthBar(playerData.health);

                // Create Physics Body (Cannon.js)
                // Server sends Y at feet, Cannon bodies usually positioned at center of mass
                const playerHeight = CONFIG.PLAYER_HEIGHT;
                const startPos = new CANNON.Vec3(playerData.x, playerData.y + playerHeight / 2.0, playerData.z); // Use CANNON.Vec3
                this.createPlayerPhysicsBody(id, startPos, playerData.rotationY, true); // true = isLocal

                // Create Visual Mesh (Same as before)
                const playerModelAsset = window.playerModelData;
                if (playerModelAsset?.scene) { /* ... create localPlayerMesh ... */ }
                else { console.error("!!! Local player model asset not found!"); }

                // Attach Gun Model (Same as before)
                 const gunModelAsset = window.gunModelData;
                 if(gunModelAsset?.scene && this.camera) { /* ... attach gunMesh ... */ }
                 else { /* ... gun warnings/errors ... */ }

            } else {
                // --- Create REMOTE Player ---
                console.log(`[Game] Creating REMOTE player objects for ${playerData.name || id}...`);
                const remotePlayer = new ClientPlayer(playerData); // ClientPlayer handles mesh
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

        const playerMass = CONFIG.PLAYER_MASS || 70; // Get mass from config
        const playerRadius = CONFIG.PLAYER_RADIUS || 0.4;
        const playerHeight = CONFIG.PLAYER_HEIGHT || 1.8;

        // ** Simple Sphere Shape for now ** (Easier to start with)
        const playerShape = new CANNON.Sphere(playerRadius);
        // ** OR Use a Capsule (More complex setup) **
        // const playerShape = new CANNON.Capsule(playerRadius, playerHeight - 2 * playerRadius); // Cannon capsule might need different params

        // Define a physics material
        const physicsMaterial = new CANNON.Material("playerMaterial"); // Name is optional
        physicsMaterial.friction = 0.4; // Adjust friction
        physicsMaterial.restitution = 0.0; // No bounce

        // Create the Cannon.js Body
        const playerBody = new CANNON.Body({
            mass: isLocal ? playerMass : 0, // Dynamic local player, static/kinematic remote players (mass 0)
            position: initialPositionVec3, // Set initial position (already center mass)
            shape: playerShape,
            material: physicsMaterial,
            type: isLocal ? CANNON.Body.DYNAMIC : CANNON.Body.KINEMATIC, // Set body type
            angularDamping: 0.9, // Prevent excessive spinning
            linearDamping: 0.1, // Air resistance/friction feel
            // fixedRotation: true, // Simpler than locking axes - prevents all rotation
        });

        // Lock rotation around X and Z axes for capsule-like behavior if NOT using fixedRotation
        playerBody.angularFactor.set(0, 1, 0); // Allow rotation only around Y axis
        playerBody.updateAngularFactor(); // Important after changing angularFactor

        // Set initial rotation (Cannon uses Quaternions)
        playerBody.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), initialRotationY);

        // Add userData for identification
        playerBody.userData = { entityId: playerId, isLocal: isLocal, isPlayer: true };

        cannonWorld.addBody(playerBody); // Add body to the world
        this.playerBodies[playerId] = playerBody; // Store reference

        console.log(`[Game] Created ${isLocal ? 'DYNAMIC' : 'KINEMATIC'} Cannon.js body for player ${playerId}`);

        // Add debug mesh if enabled (using THREE.js still)
        if (this.DEBUG_SHOW_PLAYER_COLLIDERS) {
            this.addDebugMesh(playerId, playerRadius, playerHeight, initialPositionVec3, playerBody.quaternion); // Pass Cannon pos/quat
        }
    }

    // --- Map Collider Creation (CANNON.js - Simple Plane) ---
    createMapCollider() {
        if (!cannonWorld) { console.error("!!! Cannon world missing for map creation!"); return; }

        console.log("[Game] Creating simple Cannon.js ground plane...");

        // Define ground material
        const groundMaterial = new CANNON.Material("groundMaterial");
        groundMaterial.friction = 0.6;
        groundMaterial.restitution = 0.1;

        // Create an infinite plane shape
        const groundShape = new CANNON.Plane();
        const groundBody = new CANNON.Body({
            mass: 0, // Static body
            shape: groundShape,
            material: groundMaterial,
        });
        // Rotate the plane to be horizontal (it defaults to XZ plane facing +Y)
        groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0); // Rotate -90 degrees around X axis
        groundBody.position.set(0, 0, 0); // Position at Y=0

        cannonWorld.addBody(groundBody);
        this.mapBody = groundBody; // Store reference if needed later
        console.log("[Game] Added Cannon.js ground plane.");

        // Optional: Define contact material between player and ground
        const playerGroundContactMaterial = new CANNON.ContactMaterial(
            groundMaterial, // Material defined above for ground
            this.playerBodies[localPlayerId]?.material, // Get local player material (might need default if created before player)
            // Or create a default player material reference here: new CANNON.Material("playerMaterial"),
            {
                friction: 0.5, // Friction between player and ground
                restitution: 0.0, // How much bounce
                // contactEquationStiffness: 1e8,
                // contactEquationRelaxation: 3,
            }
        );
        // cannonWorld.addContactMaterial(playerGroundContactMaterial); // Add custom contact behavior
    }

    // --- Debug Mesh Creation (Adjusted for Cannon Vec3/Quaternion) ---
    addDebugMesh(playerId, radius, height, cannonPosition, cannonQuaternion) {
         if (!this.scene || !THREE) return;
         const capsuleHeight = height - 2 * radius; // Height of cylinder part
         // Use simple Sphere for debugging if player shape is Sphere
         // const capsuleGeom = new THREE.SphereGeometry(radius, 8, 8);
         // Or use Capsule if player shape is Capsule
          const capsuleGeom = new THREE.CapsuleGeometry(radius, capsuleHeight, 4, 8);

         const wireframeMat = new THREE.MeshBasicMaterial({ color: playerId === localPlayerId ? 0x00ff00 : 0xffff00, wireframe: true });
         const wireframeMesh = new THREE.Mesh(capsuleGeom, wireframeMat);

         // Set position and rotation based on the physics body's state
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
        if (this.debugMeshes[playerId] && this.scene) { this.scene.remove(this.debugMeshes[playerId]); /* ... dispose ... */ delete this.debugMeshes[playerId]; }

        // Remove Cannon.js body
        const body = this.playerBodies[playerId];
        if (body && cannonWorld) {
             cannonWorld.removeBody(body);
             delete this.playerBodies[playerId];
        }
     }

     cleanupAllPlayers() {
         console.log("[Game] Cleaning up all player objects (Cannon.js)...");
         const playerIds = Object.keys(players); // Use players, not playerBodies, as source of truth
         playerIds.forEach(id => this.cleanupPlayer(id));
         localPlayerId = null; this.localPlayerMesh = null;
         this.playerBodies = {}; // Clear Cannon bodies map
         players = {};
         console.log("[Game] Player cleanup finished.");
     }

    // --- Main Update Loop (CANNON.js) ---
    update() {
        requestAnimationFrame(this.update.bind(this));
        if (!this.clock || !this.renderer || !this.scene || !this.camera || !cannonWorld) return; // Check Cannon world too

        const deltaTime = this.clock.getDelta();

        if (stateMachine.is('playing')) {
            // --- Physics Simulation Step (Cannon.js) ---
            // Cannon integrates timestep handling
            cannonWorld.step(cannonTimeStep, deltaTime, cannonMaxSubSteps);
            // console.log("Stepped Cannon World"); // Debug

            // --- Update Local Player Logic (Needs Cannon adaptations) ---
            const localPlayerBody = this.playerBodies[localPlayerId];
            if (localPlayerBody) {
                 // updateLocalPlayer needs to be rewritten for Cannon.js API
                 updateLocalPlayer(deltaTime, localPlayerBody, this.camera, this.controls);
            }

            // --- Synchronize THREE.js Meshes with Cannon.js Bodies ---
            for (const id in this.playerBodies) {
                const body = this.playerBodies[id];
                const player = players[id]; // Get corresponding player data/mesh holder

                if (player && player.mesh) {
                    // Copy position and quaternion from Cannon body to Three mesh
                    player.mesh.position.copy(body.position);
                    // Adjust Y if mesh origin is at feet but body is at center mass
                    player.mesh.position.y -= CONFIG.PLAYER_HEIGHT / 2.0; // Assuming sphere body center = player center

                    player.mesh.quaternion.copy(body.quaternion);

                    // Update debug mesh if enabled
                    if (this.DEBUG_SHOW_PLAYER_COLLIDERS && this.debugMeshes[id]) {
                        this.debugMeshes[id].position.copy(body.position);
                        this.debugMeshes[id].quaternion.copy(body.quaternion);
                    }
                }
            }

            // --- Update Camera Position (Relative to Physics Body) ---
            if (localPlayerBody && this.camera) {
                 const targetCameraPos = new THREE.Vector3();
                 // Copy body position (center mass)
                 targetCameraPos.copy(localPlayerBody.position);
                 // Add offset for eye level
                 targetCameraPos.y += CONFIG.CAMERA_Y_OFFSET;

                 // Lerping disabled for now, let controls handle it mostly
                 // this.camera.position.lerp(targetCameraPos, 0.7);
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
    // ** No longer wait for Rapier **
    // Check if CANNON exists (it should if script loaded)
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
    startGameInit(); // Start immediately after DOM load and CANNON check

});
console.log("game.js loaded (Cannon.js v1 - Setup)");
// --- END OF FULL game.js FILE ---
