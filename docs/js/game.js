// docs/js/game.js
// Ensure THREE and CANNON are available (loaded via script tags in index.html)
/* global THREE, CANNON */

const game = {
    scene: null,
    camera: null,
    renderer: null,
    controls: null,
    world: null, // Cannon.js physics world
    // cannonDebugger: null, // Optional: for visualizing physics colliders

    assets: {
        map: null,
        playerModel: null,
        gunModel: null,
        gunshotSound: null,
        skyTexture: null
    },
    assetPaths: {
        map: 'assets/maps/the first map!.glb',
        playerModel: 'assets/maps/Shawty1.glb',
        gunModel: 'assets/maps/gun2.glb',
        gunshotSound: 'assets/maps/gunshot.wav',
        // Example skybox textures (replace with your own if you want a textured sky)
        // skyPosX: 'assets/textures/skybox/px.jpg', // etc. for py, pz, nx, ny, nz
    },
    assetLoadManager: null,

    players: {}, // { id: { model, physicsBody, name, character, health, isDead, gunMesh } }
    localPlayer: {
        id: null,
        name: null,
        character: null,
        kills: 0,
        deaths: 0,
        health: 100,
        physicsBody: null,
        model: null, // The visual representation of the local player (might not be shown in first person)
        input: { forward: 0, backward: 0, left: 0, right: 0, jump: false, dash: false },
        lastShotTime: 0,
        lastDashTime: 0,
        isDead: false,
        gunMesh: null, // Gun model attached to camera
        // Movement smoothing / interpolation
        serverPosition: new THREE.Vector3(),
        serverRotation: new THREE.Quaternion(),
        lastServerUpdateTime: 0,
    },
    
    spawnPoints: [], // Received from server

    animationMixers: [], // For animated models
    clock: new THREE.Clock(),
    listener: null, // For audio

    isInitialized: false,
    debugMode: false, // Set to true for physics debugger, console logs

    // Config (adjust as needed)
    PLAYER_HEIGHT: 1.8, // For camera offset if needed, and physics body
    PLAYER_RADIUS: 0.4, // For physics body
    MOUSE_SENSITIVITY: 0.002,
    MOVE_SPEED: 5.0, // Client-side prediction speed, should ideally match server if not reconciled
    JUMP_FORCE: 7.0,   // Client-side prediction jump force
    DASH_SPEED_MULTIPLIER: 2.5, // For visual dash effect
    DASH_DURATION: 150, //ms
    SHOT_COOLDOWN_MS: 300, // Should match server
    DASH_COOLDOWN_MS: 2000, // Should match server


    init: function(canvasElement, localPlayerName, localPlayerCharacter) {
        if (this.isInitialized) return;
        ui.updateLoadingProgress("Initializing game scene...", 10);

        this.localPlayer.name = localPlayerName;
        this.localPlayer.character = localPlayerCharacter;

        // Scene
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x87CEEB); // Blue sky

        // Camera (Perspective for 3D)
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.camera.position.set(0, this.PLAYER_HEIGHT, 0); // Initial camera height

        // Renderer
        this.renderer = new THREE.WebGLRenderer({ canvas: canvasElement, antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.shadowMap.enabled = true; // Enable shadows if lights cast them
        this.renderer.setPixelRatio(window.devicePixelRatio);


        // Lighting
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        this.scene.add(ambientLight);
        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(50, 100, 50);
        directionalLight.castShadow = true;
        directionalLight.shadow.mapSize.width = 2048;
        directionalLight.shadow.mapSize.height = 2048;
        this.scene.add(directionalLight);

        // Audio Listener
        this.listener = new THREE.AudioListener();
        this.camera.add(this.listener);

        // Physics World (Client-side for prediction and local effects)
        this.world = new CANNON.World();
        this.world.gravity.set(0, -25, 0); // Match server gravity
        this.world.broadphase = new CANNON.SAPBroadphase(this.world);
        this.world.solver.iterations = 10;
        // this.world.allowSleep = true; // Can improve performance

        // Physics Debugger (optional)
        if (this.debugMode && typeof cannonDebugger !== 'undefined') {
            // this.cannonDebugger = new cannonDebugger(this.scene, this.world, {
            //     color: 0x00ff00, // Green for wireframes
            //     scale: 1.0,
            // });
            console.warn("Cannon-es-debugger is not fully set up in this snippet. Uncomment and ensure it's loaded if needed.");
        }
        
        // Load assets
        this.loadAssets(() => {
            ui.updateLoadingProgress("Assets loaded. Finalizing...", 80);
            this.setupLocalPlayer();
            this.setupControls();
            this.isInitialized = true;
            this.animate(); // Start render loop
            console.log("Game initialized and first render loop started.");
             // Notify main.js or network.js that game is ready for join request
            if (window.main && window.main.onGameInitialized) {
                window.main.onGameInitialized();
            }
        });

        window.addEventListener('resize', this.onWindowResize.bind(this), false);
    },

    loadAssets: function(callback) {
        ui.updateLoadingProgress("Loading assets...", 20);
        this.assetLoadManager = new THREE.LoadingManager();
        const gltfLoader = new THREE.GLTFLoader(this.assetLoadManager);
        const audioLoader = new THREE.AudioLoader(this.assetLoadManager);
        // const textureLoader = new THREE.TextureLoader(this.assetLoadManager); // For skybox textures

        let assetsToLoad = 0;
        let assetsLoaded = 0;
        const checkAllLoaded = () => {
            assetsLoaded++;
            ui.updateLoadingProgress(`Loading assets... (${assetsLoaded}/${assetsToLoad})`, 20 + (assetsLoaded / assetsToLoad) * 60);
            if (assetsLoaded === assetsToLoad) {
                if (callback) callback();
            }
        };
        
        const loadAsset = (type, path, storage) => {
            assetsToLoad++;
            if (type === 'gltf') {
                gltfLoader.load(path, (gltf) => {
                    this.assets[storage] = gltf;
                    console.log(`${storage} loaded:`, gltf);
                    if (storage === 'map') this.setupMapCollision(gltf.scene);
                    checkAllLoaded();
                }, undefined, (error) => { console.error(`Error loading ${storage}:`, error); checkAllLoaded(); /* Count as loaded to not hang */ });
            } else if (type === 'audio') {
                audioLoader.load(path, (buffer) => {
                    this.assets[storage] = buffer;
                    console.log(`${storage} loaded`);
                    checkAllLoaded();
                }, undefined, (error) => { console.error(`Error loading ${storage}:`, error); checkAllLoaded(); });
            }
        };

        loadAsset('gltf', this.assetPaths.map, 'map');
        loadAsset('gltf', this.assetPaths.playerModel, 'playerModel');
        loadAsset('gltf', this.assetPaths.gunModel, 'gunModel');
        loadAsset('audio', this.assetPaths.gunshotSound, 'gunshotSound');

        // Example: Skybox loading (if you have textures)
        // assetsToLoad++; // For skybox itself
        // const skyboxPaths = [this.assetPaths.skyPosX, ..., this.assetPaths.skyNz];
        // new THREE.CubeTextureLoader(this.assetLoadManager).load(skyboxPaths, (texture) => {
        //     this.scene.background = texture;
        //     console.log("Skybox loaded");
        //     checkAllLoaded();
        // }, undefined, (error) => { console.error("Error loading skybox:", error); checkAllLoaded(); });

        if (assetsToLoad === 0) { // No assets specified (should not happen with paths defined)
            if (callback) callback();
        }
    },

    setupMapCollision: function(mapScene) {
        // THIS IS A CRITICAL AND COMPLEX PART.
        // For accurate physics, you need to create CANNON.Body instances for your map geometry.
        // Option 1: Iterate through mapScene.children, if they are THREE.Mesh, create CANNON.Shape from their geometry.
        // Option 2: Use a library like three-to-cannon or manually define simplified colliders.
        // Option 3: Export a separate, simplified collision mesh from Blender.

        mapScene.traverse((node) => {
            if (node.isMesh) {
                node.castShadow = true;
                node.receiveShadow = true;

                // Basic attempt: create Trimesh for complex static geometry.
                // Performance warning: Trimeshes can be slow. Better to use primitive shapes (Box, Sphere, Plane)
                // or convex polyhedra for parts of the map if possible.
                if (node.geometry) {
                    // Ensure geometry is non-indexed or convert it
                    let geometry = node.geometry;
                    if (geometry.index) {
                        geometry = geometry.toNonIndexed();
                    }

                    const vertices = geometry.attributes.position.array;
                    const indices = []; // For Trimesh, indices are just 0, 1, 2, 3, 4, 5, ...
                    for (let i = 0; i < vertices.length / 3; i++) {
                        indices.push(i);
                    }
                    
                    // Scale and position must be applied to vertices or the CANNON.Body
                    // node.updateMatrixWorld(); // Ensure world matrix is up to date

                    // const cannonVertices = [];
                    // for(let i=0; i < vertices.length; i+=3){
                    //     const vec = new THREE.Vector3(vertices[i], vertices[i+1], vertices[i+2]);
                    //     vec.applyMatrix4(node.matrixWorld); // Transform vertices to world space
                    //     cannonVertices.push(new CANNON.Vec3(vec.x, vec.y, vec.z));
                    // }
                    // This is still tricky. Easiest for static map is to add body at origin and position/rotate mesh inside it.
                    // Or, add many small static bodies.

                    // For now, let's assume the map GLB is at the origin and scaled correctly.
                    // And add a single, potentially complex Trimesh body.
                    // This is often NOT performant for large maps.
                    // The GLB loader already adds the mapScene to this.scene.

                    // We will rely on the server for authoritative physics.
                    // Client-side map collision is primarily for visual feedback and prediction.
                    // The server currently only has a ground plane.
                    // For a better experience, the client *should* have map physics.

                    // Simplified approach: Add a large static box under the map as a fallback
                    // This would be better done using actual map geometry.
                }
            }
        });
        this.scene.add(this.assets.map.scene); // Add the visual map to the scene
        console.log("Map model added to scene. Map collision setup is simplified.");

        // Fallback ground plane (visual only if cannon debugger is on, physics handled by server's ground)
        // const groundShape = new CANNON.Plane();
        // const groundBody = new CANNON.Body({ mass: 0 });
        // groundBody.addShape(groundShape);
        // groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
        // this.world.addBody(groundBody);
    },

    setupLocalPlayer: function() {
        // Physics body for local player (Capsule)
        const shape = new CANNON.Capsule(this.PLAYER_RADIUS, this.PLAYER_RADIUS, this.PLAYER_HEIGHT - 2 * this.PLAYER_RADIUS, 10);
        this.localPlayer.physicsBody = new CANNON.Body({
            mass: 70, // Matches server
            position: new CANNON.Vec3(0, 50, 0), // Initial temporary position before server state
            fixedRotation: true,
            linearDamping: 0.7, // Matches server
            angularDamping: 0.5 // Matches server
        });
        const q = new CANNON.Quaternion(); // Align capsule upright
        q.setFromAxisAngle(new CANNON.Vec3(1,0,0), Math.PI/2);
        this.localPlayer.physicsBody.addShape(shape, new CANNON.Vec3(), q);
        this.world.addBody(this.localPlayer.physicsBody);

        // Attach gun model to camera
        if (this.assets.gunModel) {
            this.localPlayer.gunMesh = this.assets.gunModel.scene.clone();
            this.localPlayer.gunMesh.scale.set(0.1, 0.1, 0.1); // Adjust scale as needed
            this.localPlayer.gunMesh.position.set(0.3, -0.3, -0.5); // Position relative to camera
            this.localPlayer.gunMesh.rotation.y = Math.PI; // Point forward
            this.camera.add(this.localPlayer.gunMesh);
            this.localPlayer.gunMesh.castShadow = true;
            this.localPlayer.gunMesh.receiveShadow = true;
            this.localPlayer.gunMesh.traverse(child => {
                 if(child.isMesh) {
                    child.castShadow = true;
                    // child.receiveShadow = true; // Gun usually doesn't receive shadows on itself
                 }
            });
        }
        console.log("Local player physics and gun model setup.");
    },
    
    setupControls: function() {
        this.controls = new THREE.PointerLockControls(this.camera, this.renderer.domElement);
        this.scene.add(this.controls.getObject()); // The PointerLockControls object is the player's "head"

        this.renderer.domElement.addEventListener('click', () => {
            if (!ui.isChatting && !ui.isLeaderboardVisible) {
                 this.controls.lock();
            }
        });

        this.controls.addEventListener('lock', () => { console.log('Pointer locked'); ui.hideLeaderboard(); /* Hide if open */ });
        this.controls.addEventListener('unlock', () => { console.log('Pointer unlocked'); });

        document.addEventListener('keydown', (event) => this.handleKeyDown(event), false);
        document.addEventListener('keyup', (event) => this.handleKeyUp(event), false);
        document.addEventListener('mousedown', (event) => this.handleMouseDown(event), false);
    },

    handleKeyDown: function(event) {
        if (ui.isChatting) return;
        switch (event.code) {
            case 'KeyW': case 'ArrowUp': this.localPlayer.input.forward = 1; break;
            case 'KeyS': case 'ArrowDown': this.localPlayer.input.backward = 1; break;
            case 'KeyA': case 'ArrowLeft': this.localPlayer.input.left = 1; break;
            case 'KeyD': case 'ArrowRight': this.localPlayer.input.right = 1; break;
            case 'Space': this.localPlayer.input.jump = true; break;
            case 'ShiftLeft': this.localPlayer.input.dash = true; break;
        }
    },

    handleKeyUp: function(event) {
        if (ui.isChatting) return;
        switch (event.code) {
            case 'KeyW': case 'ArrowUp': this.localPlayer.input.forward = 0; break;
            case 'KeyS': case 'ArrowDown': this.localPlayer.input.backward = 0; break;
            case 'KeyA': case 'ArrowLeft': this.localPlayer.input.left = 0; break;
            case 'KeyD': case 'ArrowRight': this.localPlayer.input.right = 0; break;
            // Jump and Dash are single actions, reset by server logic or after use client-side
            // For client prediction:
            // case 'Space': this.localPlayer.input.jump = false; break; 
            // case 'ShiftLeft': this.localPlayer.input.dash = false; break;
        }
    },

    handleMouseDown: function(event) {
        if (ui.isChatting || !this.controls.isLocked || this.localPlayer.isDead) return;
        if (event.button === 0) { // Left mouse button
            const now = Date.now();
            if (now - this.localPlayer.lastShotTime > this.SHOT_COOLDOWN_MS) {
                this.localPlayer.lastShotTime = now;
                this.shoot(event.ctrlKey || event.metaKey || (event.altKey && event.shiftKey) || event.key === 'e'); // Check for E key with shoot later (Shift+E etc.)
                                                                        // A simple way: assume 'E' key state is tracked elsewhere for combo.
                                                                        // For now, let's use a common modifier like Ctrl for gun propel test.
                                                                        // The "E" key interaction needs more robust state tracking if E is also for other things.
                                                                        // Let's assume server handles E key state via input flags.
                                                                        // For client, we can check if 'E' is pressed:
                const isEPressed = this.keysPressed && this.keysPressed['KeyE']; // Requires tracking keysPressed separately
                this.shoot(isEPressed); // Pass E key state to shoot function
            }
        }
    },

    shoot: function(isGunPropelActive) {
        if (!this.localPlayer.id || this.localPlayer.isDead) return;

        // Get aim direction from camera
        const aimDirection = new THREE.Vector3();
        this.camera.getWorldDirection(aimDirection);

        network.sendShoot(
            { x: aimDirection.x, y: aimDirection.y, z: aimDirection.z },
            isGunPropelActive
        );

        // Client-side visual/audio feedback
        this.playGunshotSound();
        if (this.localPlayer.gunMesh) { // Muzzle flash animation (simple)
            // Could add a light or sprite here, then remove it
        }

        // Client-side recoil (visual only, physics handled by server for gun propel)
        if (this.localPlayer.gunMesh && !isGunPropelActive) {
            // Small backward movement of gun model
            new THREE.Tween(this.localPlayer.gunMesh.position)
                .to({ z: this.localPlayer.gunMesh.position.z + 0.1 }, 50)
                .yoyo(true).repeat(1)
                .easing(THREE.Easing.Quadratic.Out)
                .start();
        }
    },
    
    playGunshotSound: function() {
        if (this.assets.gunshotSound && this.listener.context.state === 'running') {
            const sound = new THREE.Audio(this.listener);
            sound.setBuffer(this.assets.gunshotSound);
            sound.setVolume(0.3);
            sound.play();
        } else if (this.listener.context.state !== 'running') {
            console.warn("AudioContext not running. Click screen to enable audio.");
        }
    },

    // Called by network.js when initial gameState is received
    initializeGameState: function(data) {
        this.localPlayer.id = data.yourId;
        this.spawnPoints = data.spawnPoints || [];
        console.log("Game state initialized. My ID:", this.localPlayer.id);
        console.log("Spawn points:", this.spawnPoints);

        if (data.players && data.players[this.localPlayer.id]) {
            const myInitialState = data.players[this.localPlayer.id];
            this.localPlayer.physicsBody.position.set(myInitialState.position.x, myInitialState.position.y, myInitialState.position.z);
            this.localPlayer.health = myInitialState.health;
            this.localPlayer.kills = myInitialState.kills;
            this.localPlayer.deaths = myInitialState.deaths;
            this.localPlayer.isDead = myInitialState.isDead;
            // Initial camera rotation can be set if provided, or default forward
            if(myInitialState.rotation) {
                this.camera.quaternion.set(myInitialState.rotation.x, myInitialState.rotation.y, myInitialState.rotation.z, myInitialState.rotation.w);
            }
        } else { // Spawn at a random client-guessed point if not in initial player list (should be)
            const spawn = this.spawnPoints.length > 0 ? this.spawnPoints[Math.floor(Math.random() * this.spawnPoints.length)] : {x:0, y:10, z:0};
            this.localPlayer.physicsBody.position.set(spawn.x, spawn.y, spawn.z);
        }
        this.world.step(1/60); // Step physics once to settle body
        this.updateCameraAndGunPosition();


        for (const playerId in data.players) {
            if (playerId !== this.localPlayer.id) {
                this.addPlayer(data.players[playerId]);
            }
        }
        ui.updateGameStats(data.timeLeft, this.localPlayer.kills, this.localPlayer.deaths);
        ui.showLeaderboard(data.players); // Show initial leaderboard briefly
        setTimeout(() => { if(ui.isLeaderboardVisible) ui.hideLeaderboard() }, 3000);

        if (data.killLog) {
            data.killLog.forEach(entry => ui.addKillFeedEntry(entry.killer, entry.victim, entry.method));
        }
    },

    // Called by network.js for subsequent updates
    updateGameState: function(data) {
        if (!this.isInitialized || !this.localPlayer.id) return;

        for (const playerId in data.players) {
            const playerData = data.players[playerId];
            if (playerId === this.localPlayer.id) {
                // Apply server state to local player (reconciliation needed for smooth movement)
                // For now, just update stats. Physics body is moved by server's position for other players.
                // Local player physics is predicted client-side, server can correct it (more complex)
                this.localPlayer.health = playerData.health;
                if (this.localPlayer.kills !== playerData.kills || this.localPlayer.deaths !== playerData.deaths) {
                    this.localPlayer.kills = playerData.kills;
                    this.localPlayer.deaths = playerData.deaths;
                }
                this.localPlayer.isDead = playerData.isDead;

                // Store server position for smoothing/interpolation if not doing full reconciliation
                this.localPlayer.serverPosition.set(playerData.position.x, playerData.position.y, playerData.position.z);
                this.localPlayer.serverRotation.set(playerData.rotation.x, playerData.rotation.y, playerData.rotation.z, playerData.rotation.w);
                this.localPlayer.lastServerUpdateTime = Date.now();


            } else { // Other players
                if (this.players[playerId]) {
                    // Interpolate/extrapolate other players' movement
                    const player = this.players[playerId];
                    player.serverPosition = player.serverPosition || new THREE.Vector3();
                    player.serverRotation = player.serverRotation || new THREE.Quaternion();
                    player.clientPosition = player.clientPosition || new THREE.Vector3().copy(playerData.position);
                    player.clientRotation = player.clientRotation || new THREE.Quaternion().copy(playerData.rotation);

                    // Store the target state from the server
                    player.serverPosition.set(playerData.position.x, playerData.position.y, playerData.position.z);
                    player.serverRotation.set(playerData.rotation.x, playerData.rotation.y, playerData.rotation.z, playerData.rotation.w);
                    player.lastServerUpdateTime = Date.now();

                    player.health = playerData.health;
                    player.isDead = playerData.isDead;
                    if (player.model) player.model.visible = !player.isDead;

                } else {
                    this.addPlayer(playerData); // Player joined mid-game or was missed
                }
            }
        }
         // Update UI for local player
        ui.updateGameStats(data.timeLeft, this.localPlayer.kills, this.localPlayer.deaths);
        if (ui.isLeaderboardVisible) ui.showLeaderboard(data.players);
    },

    addPlayer: function(playerData) {
        if (this.players[playerData.id] || playerData.id === this.localPlayer.id) return;
        console.log("Adding remote player:", playerData.name, playerData.id);

        let playerModel;
        if (this.assets.playerModel) {
            playerModel = this.assets.playerModel.scene.clone();
            playerModel.scale.set(0.8, 0.8, 0.8); // Adjust scale
            this.scene.add(playerModel);
             playerModel.traverse(child => {
                 if(child.isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                 }
            });
        } else {
            // Placeholder if model not loaded
            const geometry = new THREE.CapsuleGeometry(this.PLAYER_RADIUS, this.PLAYER_HEIGHT - 2 * this.PLAYER_RADIUS, 4, 8);
            const material = new THREE.MeshStandardMaterial({ color: Math.random() * 0xffffff });
            playerModel = new THREE.Mesh(geometry, material);
            this.scene.add(playerModel);
        }
        playerModel.position.set(playerData.position.x, playerData.position.y, playerData.position.z);
        playerModel.quaternion.set(playerData.rotation.x, playerData.rotation.y, playerData.rotation.z, playerData.rotation.w);
        playerModel.visible = !playerData.isDead;

        this.players[playerData.id] = {
            model: playerModel,
            name: playerData.name,
            character: playerData.character,
            health: playerData.health,
            isDead: playerData.isDead,
            // For smoothing:
            serverPosition: new THREE.Vector3().copy(playerData.position),
            serverRotation: new THREE.Quaternion().copy(playerData.rotation),
            clientPosition: new THREE.Vector3().copy(playerData.position), // Start client at server pos
            clientRotation: new THREE.Quaternion().copy(playerData.rotation),
            lastServerUpdateTime: Date.now(),
        };
    },

    removePlayer: function(playerId) {
        if (this.players[playerId]) {
            console.log("Removing player:", this.players[playerId].name, playerId);
            if (this.players[playerId].model) {
                this.scene.remove(this.players[playerId].model);
                // Properly dispose of geometry/material if player models are unique and not reused
            }
            delete this.players[playerId];
        }
    },

    handlePlayerShotEffect: function(data) { // { shooterId, aimDir, hit, hitPoint, hitPlayerId }
        // Visual feedback for shots (tracers, impact effects)
        // Play gunshot sound for remote players if shooterId !== localPlayer.id
        if (data.shooterId !== this.localPlayer.id) {
            const shooter = this.players[data.shooterId];
            if (shooter && shooter.model && this.assets.gunshotSound && this.listener.context.state === 'running') {
                const sound = new THREE.PositionalAudio(this.listener);
                sound.setBuffer(this.assets.gunshotSound);
                sound.setRefDistance(20);
                sound.setRolloffFactor(2);
                sound.setVolume(0.2);
                shooter.model.add(sound); // Attach sound to shooter model
                sound.play();
            }
        }

        // Bullet tracer (simple line)
        let shooterPos;
        if (data.shooterId === this.localPlayer.id) {
            shooterPos = this.camera.getWorldPosition(new THREE.Vector3()); // From camera for local
             // Offset slightly forward to appear from gun barrel
            const forward = new THREE.Vector3();
            this.camera.getWorldDirection(forward);
            shooterPos.addScaledVector(forward, 0.5); // Adjust offset as needed
        } else if (this.players[data.shooterId] && this.players[data.shooterId].model) {
            shooterPos = this.players[data.shooterId].model.position.clone();
            shooterPos.y += this.PLAYER_HEIGHT * 0.8; // Approx eye/gun height for other players
        }

        if (shooterPos) {
            const endPoint = data.hit ? new THREE.Vector3(data.hitPoint.x, data.hitPoint.y, data.hitPoint.z)
                                       : shooterPos.clone().add(new THREE.Vector3(data.aimDir.x, data.aimDir.y, data.aimDir.z).multiplyScalar(100));
            const points = [shooterPos, endPoint];
            const material = new THREE.LineBasicMaterial({ color: 0xffef00, transparent: true, opacity: 0.8 });
            const geometry = new THREE.BufferGeometry().setFromPoints(points);
            const tracer = new THREE.Line(geometry, material);
            this.scene.add(tracer);
            setTimeout(() => { this.scene.remove(tracer); material.dispose(); geometry.dispose(); }, 100); // Tracer visible for 100ms
        }

        if (data.hit && data.hitPoint) { // Impact effect
            const impactSize = data.hitPlayerId ? 0.3 : 0.1;
            const impactColor = data.hitPlayerId ? 0xff0000 : 0xcccccc; // Red for player hit
            const impactGeo = new THREE.SphereGeometry(impactSize, 8, 8);
            const impactMat = new THREE.MeshBasicMaterial({ color: impactColor, transparent: true, opacity: 0.7 });
            const impactMesh = new THREE.Mesh(impactGeo, impactMat);
            impactMesh.position.set(data.hitPoint.x, data.hitPoint.y, data.hitPoint.z);
            this.scene.add(impactMesh);
            setTimeout(() => { this.scene.remove(impactMesh); impactMat.dispose(); impactGeo.dispose(); }, 200);
        }
    },

    handlePlayerDied: function(data) { // { victimId, attackerId, position, killLogEntry }
        ui.addKillFeedEntry(data.killLogEntry.killer, data.killLogEntry.victim, data.killLogEntry.method);

        if (data.victimId === this.localPlayer.id) {
            this.localPlayer.isDead = true;
            this.localPlayer.health = 0;
            ui.displayCenterEvent("YOU WERE ELIMINATED", 3000);
            // Show death screen / effects
            if(this.controls.isLocked) this.controls.unlock(); // Unlock mouse on death
        } else if (this.players[data.victimId]) {
            this.players[data.victimId].isDead = true;
            if (this.players[data.victimId].model) {
                this.players[data.victimId].model.visible = false; // Hide model
            }
        }

        // Death explosion visual effect
        const explosionPos = new THREE.Vector3(data.position.x, data.position.y, data.position.z);
        const explosionGeo = new THREE.SphereGeometry(1, 16, 16); // Start small
        const explosionMat = new THREE.MeshBasicMaterial({ color: 0xff8800, transparent: true, opacity: 0.8 });
        const explosionMesh = new THREE.Mesh(explosionGeo, explosionMat);
        explosionMesh.position.copy(explosionPos);
        this.scene.add(explosionMesh);

        // Animate explosion (scale up and fade out)
        let explosionTime = 0;
        const explosionDuration = 500; // ms
        const animateExplosion = () => {
            explosionTime += this.clock.getDelta() * 1000;
            const progress = explosionTime / explosionDuration;
            if (progress < 1) {
                explosionMesh.scale.setScalar(1 + progress * 10); // Grow to 11x size
                explosionMat.opacity = 0.8 * (1 - progress);
                requestAnimationFrame(animateExplosion);
            } else {
                this.scene.remove(explosionMesh);
                explosionMat.dispose();
                explosionGeo.dispose();
            }
        };
        // animateExplosion(); // This needs to be tied to main animation loop's delta time
        // Simple tween for explosion:
        new THREE.Tween(explosionMesh.scale)
            .to({ x: 15, y: 15, z: 15 }, explosionDuration)
            .easing(THREE.Easing.Quadratic.Out)
            .start();
        new THREE.Tween(explosionMat)
            .to({ opacity: 0 }, explosionDuration)
            .easing(THREE.Easing.Quadratic.Out)
            .onComplete(() => {
                this.scene.remove(explosionMesh);
                explosionMat.dispose();
                explosionGeo.dispose();
            })
            .start();
    },

    handlePlayerRespawn: function(data) { // { playerId, position, rotation, health }
        if (data.playerId === this.localPlayer.id) {
            this.localPlayer.isDead = false;
            this.localPlayer.health = data.health;
            this.localPlayer.physicsBody.position.set(data.position.x, data.position.y, data.position.z);
            this.localPlayer.physicsBody.velocity.set(0,0,0); // Reset velocity
            this.camera.quaternion.set(data.rotation.x, data.rotation.y, data.rotation.z, data.rotation.w);
            this.updateCameraAndGunPosition();
            ui.displayCenterEvent("RESPAWNED", 2000);
            if(!ui.isChatting && !ui.isLeaderboardVisible) this.controls.lock(); // Re-lock mouse
        } else if (this.players[data.playerId]) {
            const player = this.players[data.playerId];
            player.isDead = false;
            player.health = data.health;
            if (player.model) {
                player.model.position.set(data.position.x, data.position.y, data.position.z);
                player.model.quaternion.set(data.rotation.x, data.rotation.y, data.rotation.z, data.rotation.w);
                player.model.visible = true;
                 // Reset client-side interpolation targets
                player.clientPosition.copy(data.position);
                player.serverPosition.copy(data.position);
                player.clientRotation.copy(data.rotation);
                player.serverRotation.copy(data.rotation);
            }
        }
    },
    
    updatePlayerHealth: function(playerId, health) {
        if (playerId === this.localPlayer.id) {
            this.localPlayer.health = health;
            // Update health bar UI element if you have one
        } else if (this.players[playerId]) {
            this.players[playerId].health = health;
        }
    },
    
    resetLocalPlayerStats: function() { // Called on roundStart
        this.localPlayer.kills = 0;
        this.localPlayer.deaths = 0;
        // Health is usually reset by respawn or specific health update
    },


    onWindowResize: function() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    },
    
    updateCameraAndGunPosition: function() {
        if (!this.localPlayer.physicsBody || !this.controls) return;
        // Camera follows physics body
        this.controls.getObject().position.copy(this.localPlayer.physicsBody.position);
        this.controls.getObject().position.y += this.PLAYER_HEIGHT * 0.8; // Eye height relative to capsule center
                                                                        // Capsule center is PLAYER_HEIGHT/2. Eye height is PLAYER_HEIGHT * ~0.9.
                                                                        // So offset from center is (0.9 - 0.5) * PLAYER_HEIGHT. If PLAYER_HEIGHT is actual height of model.
                                                                        // If PLAYER_HEIGHT is capsule height, then offset is approx PLAYER_RADIUS.
                                                                        // Let's use a fixed offset for simplicity for now.
        
        // The PointerLockControls already handle camera rotation based on mouse.
        // The gun is a child of the camera, so it moves/rotates with it.
    },

    animate: function() {
        requestAnimationFrame(this.animate.bind(this));
        if (!this.isInitialized) return;

        const delta = this.clock.getDelta(); // Time since last frame in seconds
        const time = this.clock.elapsedTime;

        // Update physics world (client-side prediction)
        if (!this.localPlayer.isDead && this.localPlayer.physicsBody) {
            this.handleClientMovement(delta);
            this.world.step(1/60, delta, 3); // Recommended maxsubsteps = 3 for stability
            this.updateCameraAndGunPosition();

            // Send input to server (at a fixed rate, or on change)
            // For simplicity, sending every frame if controls are active. Can be optimized.
            if (this.controls.isLocked) {
                network.sendInput(this.localPlayer.input, this.camera.quaternion);
                // Reset single-action inputs after processing them client-side (and sending)
                // Server will also handle this, but client prediction benefits
                this.localPlayer.input.jump = false; 
                // this.localPlayer.input.dash = false; // Dash is cooldown based, server manages true state
            }
        } else if (this.localPlayer.isDead && this.localPlayer.physicsBody) {
             // If dead, but body exists (e.g. ragdoll or pre-removal), still step world
            this.world.step(1/60, delta, 3);
        }


        // Update player models (interpolation for remote players)
        const lerpFactor = 0.2; // Adjust for smoothness vs responsiveness
        for (const id in this.players) {
            const player = this.players[id];
            if (player.model && player.serverPosition && player.serverRotation) {
                // Interpolate position
                player.clientPosition.lerp(player.serverPosition, lerpFactor);
                player.model.position.copy(player.clientPosition);

                // Interpolate rotation (slerp for quaternions)
                player.clientRotation.slerp(player.serverRotation, lerpFactor);
                player.model.quaternion.copy(player.clientRotation);
            }
        }
        
        // Update animations
        this.animationMixers.forEach(mixer => mixer.update(delta));

        // Update Three.js Tweens
        TWEEN.update(time * 1000); // TWEEN usually expects ms

        // Physics debugger
        // if (this.debugMode && this.cannonDebugger) {
        //     this.cannonDebugger.update();
        // }

        this.renderer.render(this.scene, this.camera);
    },

    handleClientMovement: function(delta) {
        if (!this.localPlayer.physicsBody || !this.controls.isLocked) return;

        const body = this.localPlayer.physicsBody;
        const input = this.localPlayer.input;
        const speed = this.MOVE_SPEED * 50; // Scale factor for applying force

        const FWD = new THREE.Vector3();
        const RIGHT = new THREE.Vector3();
        this.controls.getDirection(FWD); // Camera's forward vector (includes pitch)
        FWD.y = 0; // Make it horizontal for movement
        FWD.normalize();
        RIGHT.crossVectors(this.camera.up, FWD).normalize().negate(); // Right vector

        let force = new CANNON.Vec3(0,0,0);

        if (input.forward) force.vadd(new CANNON.Vec3(FWD.x, FWD.y, FWD.z).scale(speed), force);
        if (input.backward) force.vsub(new CANNON.Vec3(FWD.x, FWD.y, FWD.z).scale(speed), force);
        if (input.left) force.vadd(new CANNON.Vec3(RIGHT.x, RIGHT.y, RIGHT.z).scale(speed), force); // Note: THREE.PointerLockControls might invert this, adjust if needed
        if (input.right) force.vsub(new CANNON.Vec3(RIGHT.x, RIGHT.y, RIGHT.z).scale(speed), force);


        // Apply forces for movement (client-side prediction)
        // Server will authoritatively move, but this makes client feel responsive.
        body.applyForce(new CANNON.Vec3(force.x, 0, force.z), body.position);


        // Client-side predicted jump
        // Ground check is important here for client prediction
        if (input.jump && this.isPlayerGroundedClient()) {
            body.velocity.y = 0; // Reset Y velocity for consistent jump
            body.applyImpulse(new CANNON.Vec3(0, 700, 0), body.position); // Match server impulse
        }

        // Client-side predicted dash (visual effect + slight nudge, server is authoritative)
        const now = Date.now();
        if (input.dash && (now - this.localPlayer.lastDashTime > this.DASH_COOLDOWN_MS)) {
            this.localPlayer.lastDashTime = now; // Update client dash time
            
            let dashDirection = new CANNON.Vec3(FWD.x, 0, FWD.z); // Default to forward
            if (input.forward) dashDirection.set(FWD.x, 0, FWD.z);
            else if (input.backward) dashDirection.set(-FWD.x, 0, -FWD.z);
            else if (input.left) dashDirection.set(RIGHT.x, 0, RIGHT.z);
            else if (input.right) dashDirection.set(-RIGHT.x, 0, -RIGHT.z);
            // else if no movement key, dash in looking direction (horizontal)
            dashDirection.normalize();
            
            // Apply a smaller client-side impulse for immediate feedback
            // body.applyImpulse(dashDirection.scale(PLAYER_DASH_IMPULSE * 0.5), body.position); // Half of server's force
            // Or rely purely on server for dash physics, client just sends input.dash = true
        }
        // input.jump = false; // Consume input after processing
        // input.dash = false; // Dash is more of a trigger
    },
    
    isPlayerGroundedClient: function() {
        if (!this.localPlayer.physicsBody) return false;
        const body = this.localPlayer.physicsBody;
        const start = body.position.clone();
        const end = body.position.clone();
        // Raycast slightly more than capsule radius + half cylinder height from center.
        // Capsule total height is (PLAYER_HEIGHT - 2 * PLAYER_RADIUS) + 2 * PLAYER_RADIUS = PLAYER_HEIGHT
        // Center of capsule is at body.position. Raycast from just above bottom sphere.
        // Offset start slightly up to avoid starting inside ground.
        start.y += 0.1; 
        end.y -= (this.PLAYER_HEIGHT / 2) + 0.2; // Ray length
        
        const ray = new CANNON.Ray(start, end);
        const result = new CANNON.RaycastResult();
        const options = { collisionFilterMask: ~0, skipBackfaces: true }; // Check against everything
        ray.intersectWorld(this.world, options, result);

        return result.hasHit && result.body !== body; // Ensure it's not hitting itself
    },

};
// Expose game to be callable from other scripts if needed (e.g. main.js)
window.game = game;

// Need to include TWEEN.js library if you use it.
// <script src="https://cdnjs.cloudflare.com/ajax/libs/tween.js/18.6.4/tween.umd.js"></script> in HTML
// and then use TWEEN.Tween
