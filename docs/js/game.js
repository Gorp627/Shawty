// docs/js/game.js
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import * as CANNON from 'cannon-es';
// TWEEN is loaded globally via UMD script tag in index.html, so it should be available as global `TWEEN`
// import CannonDebugger from 'cannon-es-debugger'; // Uncomment if you want to use the physics debugger

const game = {
    scene: null,
    camera: null,
    renderer: null,
    controls: null,
    world: null, // Cannon.js physics world
    // cannonDebugger: null, // For visualizing physics colliders

    assets: {
        map: null,
        playerModel: null,
        gunModel: null,
        gunshotSound: null,
    },
    assetPaths: {
        map: 'assets/maps/the first map!.glb',
        playerModel: 'assets/maps/Shawty1.glb',
        gunModel: 'assets/maps/gun2.glb',
        gunshotSound: 'assets/maps/gunshot.wav',
    },
    assetLoadManager: null,

    players: {}, // { id: { model, physicsBody, name, character, health, isDead, gunMesh, serverPosition, serverRotation, clientPosition, clientRotation, lastServerUpdateTime } }
    localPlayer: {
        id: null,
        name: null,
        character: null,
        kills: 0,
        deaths: 0,
        health: 100,
        physicsBody: null,
        model: null,
        input: { forward: 0, backward: 0, left: 0, right: 0, jump: false, dash: false },
        lastShotTime: 0,
        lastDashTime: 0,
        isDead: false,
        gunMesh: null,
        serverPosition: new THREE.Vector3(),
        serverRotation: new THREE.Quaternion(),
        lastServerUpdateTime: 0,
    },
    
    spawnPoints: [],
    animationMixers: [],
    clock: new THREE.Clock(),
    listener: null,
    keysPressed: {}, // To track key states for combos like E+Shoot

    isInitialized: false,
    debugMode: false, 

    PLAYER_HEIGHT: 1.8,
    PLAYER_RADIUS: 0.4,
    MOUSE_SENSITIVITY: 0.002, // PointerLockControls handles this internally mostly
    MOVE_SPEED: 5.0,
    JUMP_FORCE: 700, // Impulse matching server
    DASH_IMPULSE: 1200, // Impulse matching server
    SHOT_COOLDOWN_MS: 300,
    DASH_COOLDOWN_MS: 2000,


    init: function(canvasElement, localPlayerName, localPlayerCharacter) {
        if (this.isInitialized) return;
        if (!window.ui) { console.error("UI not available in game.init"); return; }
        window.ui.updateLoadingProgress("Initializing game scene...", 10);

        this.localPlayer.name = localPlayerName;
        this.localPlayer.character = localPlayerCharacter;

        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x87CEEB); 

        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        // Initial position will be set by physics body later

        this.renderer = new THREE.WebGLRenderer({ canvas: canvasElement, antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.shadowMap.enabled = true;
        this.renderer.setPixelRatio(window.devicePixelRatio);

        const ambientLight = new THREE.AmbientLight(0xffffff, 0.7); // Slightly brighter ambient
        this.scene.add(ambientLight);
        const directionalLight = new THREE.DirectionalLight(0xffffff, 1.0); // Slightly brighter directional
        directionalLight.position.set(50, 100, 50);
        directionalLight.castShadow = true;
        directionalLight.shadow.mapSize.width = 2048;
        directionalLight.shadow.mapSize.height = 2048;
        directionalLight.shadow.camera.near = 0.5;
        directionalLight.shadow.camera.far = 500;
        directionalLight.shadow.camera.left = -100;
        directionalLight.shadow.camera.right = 100;
        directionalLight.shadow.camera.top = 100;
        directionalLight.shadow.camera.bottom = -100;
        this.scene.add(directionalLight);
        // const dlHelper = new THREE.CameraHelper(directionalLight.shadow.camera); // Debug shadows
        // this.scene.add(dlHelper);


        this.listener = new THREE.AudioListener();
        this.camera.add(this.listener); // Attach listener to camera

        this.world = new CANNON.World();
        this.world.gravity.set(0, -25, 0);
        this.world.broadphase = new CANNON.SAPBroadphase(this.world);
        this.world.solver.iterations = 10;
        
        // if (this.debugMode && typeof CannonDebugger !== 'undefined') { // Ensure CannonDebugger is imported
        //     this.cannonDebugger = new CannonDebugger(this.scene, this.world, { color: 0x00ff00 });
        // }
        
        this.loadAssets(() => {
            window.ui.updateLoadingProgress("Assets loaded. Finalizing...", 80);
            this.setupLocalPlayerPhysics(); // Renamed for clarity
            this.setupControls();
            this.isInitialized = true;
            this.animate();
            console.log("Game initialized and first render loop started.");
            if (window.mainController && window.mainController.onGameInitialized) {
                window.mainController.onGameInitialized();
            } else {
                console.error("mainController or onGameInitialized not found!");
            }
        });

        window.addEventListener('resize', this.onWindowResize.bind(this), false);
    },

    loadAssets: function(callback) {
        if (!window.ui) { console.error("UI not available in game.loadAssets"); return; }
        window.ui.updateLoadingProgress("Loading assets...", 20);
        this.assetLoadManager = new THREE.LoadingManager(
            () => { // All loaded
                if (callback) callback();
            },
            (url, itemsLoaded, itemsTotal) => { // Progress
                const progress = (itemsLoaded / itemsTotal) * 60 + 20; // Scale to 20-80% range
                window.ui.updateLoadingProgress(`Loading ${url.split('/').pop()}... (${itemsLoaded}/${itemsTotal})`, progress);
            },
            (url) => { // Error
                console.error(`Error loading asset: ${url}`);
                // Potentially handle error more gracefully, e.g., use a placeholder
            }
        );
        const gltfLoader = new GLTFLoader(this.assetLoadManager);
        const audioLoader = new THREE.AudioLoader(this.assetLoadManager);
        
        gltfLoader.load(this.assetPaths.map, (gltf) => {
            this.assets.map = gltf;
            console.log(`Map loaded:`, gltf);
            this.scene.add(gltf.scene);
            this.setupMapCollision(gltf.scene);
        });
        gltfLoader.load(this.assetPaths.playerModel, (gltf) => {
            this.assets.playerModel = gltf;
            console.log(`Player model loaded:`, gltf);
        });
        gltfLoader.load(this.assetPaths.gunModel, (gltf) => {
            this.assets.gunModel = gltf;
            console.log(`Gun model loaded:`, gltf);
            this.attachGunToLocalPlayer(); // Attach gun once model is loaded
        });
        audioLoader.load(this.assetPaths.gunshotSound, (buffer) => {
            this.assets.gunshotSound = buffer;
            console.log(`Gunshot sound loaded`);
        });
    },

    setupMapCollision: function(mapScene) {
        mapScene.traverse((node) => {
            if (node.isMesh) {
                node.castShadow = true;
                node.receiveShadow = true;
                // More robust map collision setup needed here.
                // For now, client physics relies on server's simplified world or local prediction against basic shapes.
            }
        });
        console.log("Map visual model added to scene. Client-side map collision is basic.");
        // Add a fallback ground plane for client-side prediction if server is slow or no map collision is set up
        const groundMaterial = new CANNON.Material('groundMaterial');
        const groundShapeClient = new CANNON.Plane();
        const groundBodyClient = new CANNON.Body({ mass: 0, material: groundMaterial });
        groundBodyClient.addShape(groundShapeClient);
        groundBodyClient.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
        groundBodyClient.position.set(0,0,0); // Adjust Y if your map "floor" is significantly different
        this.world.addBody(groundBodyClient);

        const playerGroundContactMaterial = new CANNON.ContactMaterial(
            this.localPlayer.physicsBody ? this.localPlayer.physicsBody.material : new CANNON.Material(), // Use player material if body exists
            groundMaterial,
            {
                friction: 0.1, // Low friction against ground
                restitution: 0.1, // Little bounce
            }
        );
        this.world.addContactMaterial(playerGroundContactMaterial);
    },

    setupLocalPlayerPhysics: function() {
        const playerMaterial = new CANNON.Material("playerMaterial"); // For client-side body
        playerMaterial.friction = 0.1; // Low friction
        playerMaterial.restitution = 0.0; // No bounce

        const shape = new CANNON.Capsule(this.PLAYER_RADIUS, this.PLAYER_RADIUS, this.PLAYER_HEIGHT - 2 * this.PLAYER_RADIUS, 10);
        this.localPlayer.physicsBody = new CANNON.Body({
            mass: 70,
            position: new CANNON.Vec3(0, 50, 0), // Temporary spawn, server will correct
            fixedRotation: true,
            material: playerMaterial, // Use the defined material
            linearDamping: 0.7, 
            angularDamping: 0.5 
        });
        const q = new CANNON.Quaternion();
        q.setFromAxisAngle(new CANNON.Vec3(1,0,0), Math.PI/2);
        this.localPlayer.physicsBody.addShape(shape, new CANNON.Vec3(), q);
        this.world.addBody(this.localPlayer.physicsBody);
        
        // Set initial camera position based on physics body AFTER it's created
        this.camera.position.copy(this.localPlayer.physicsBody.position);
        this.camera.position.y += this.PLAYER_HEIGHT * 0.4; // Eye height offset from capsule center
    },
    
    attachGunToLocalPlayer: function() {
        if (this.assets.gunModel && this.camera && !this.localPlayer.gunMesh) { // Ensure camera exists and gun not already attached
            this.localPlayer.gunMesh = this.assets.gunModel.scene.clone();
            this.localPlayer.gunMesh.scale.set(0.1, 0.1, 0.1);
            this.localPlayer.gunMesh.position.set(0.35, -0.35, -0.7); // Adjusted position
            this.localPlayer.gunMesh.rotation.set(0, Math.PI, 0); // Point forward correctly
            
            this.localPlayer.gunMesh.traverse(child => {
                 if(child.isMesh) {
                    child.castShadow = true;
                 }
            });
            this.camera.add(this.localPlayer.gunMesh); // Add gun as child of camera
            console.log("Gun model attached to local player camera.");
        }
    },
    
    setupControls: function() {
        this.controls = new PointerLockControls(this.camera, this.renderer.domElement);
        // The camera is ALREADY PART of PointerLockControls object, so we add the controls object to the scene
        // if we want the controls object to be the "player head" that moves.
        // However, we are moving the physics body and then updating the camera to the physics body.
        // The PointerLockControls will then orient the camera based on mouse.
        // So, we don't add this.controls.getObject() to the scene IF the camera itself is being moved.
        // Let's stick to the common pattern where PointerLockControls directly manipulates the camera it's given.

        const onPointerLockChange = () => {
            if (document.pointerLockElement === this.renderer.domElement) {
                this.controls.isLocked = true; // Explicitly track lock state if needed
                console.log('Pointer locked');
            } else {
                this.controls.isLocked = false;
                console.log('Pointer unlocked');
                // If UI is not active (chat/leaderboard), and game is active, it means user pressed Esc
                // No need to do anything extra, ui.js handles Esc key for chat/leaderboard
            }
        };
        const onPointerLockError = () => console.error('PointerLockError');

        document.addEventListener('pointerlockchange', onPointerLockChange, false);
        document.addEventListener('pointerlockerror', onPointerLockError, false);

        this.renderer.domElement.addEventListener('click', () => {
            if (window.ui && !window.ui.isChatting && !window.ui.isLeaderboardVisible && !this.controls.isLocked) {
                 this.controls.lock();
            }
        });

        document.addEventListener('keydown', (event) => this.handleKeyDown(event), false);
        document.addEventListener('keyup', (event) => this.handleKeyUp(event), false);
        document.addEventListener('mousedown', (event) => this.handleMouseDown(event), false);
    },

    handleKeyDown: function(event) {
        this.keysPressed[event.code] = true; // Track all pressed keys
        if (window.ui && window.ui.isChatting) return; // Don't process game keys if chatting
        switch (event.code) {
            case 'KeyW': case 'ArrowUp': this.localPlayer.input.forward = 1; break;
            case 'KeyS': case 'ArrowDown': this.localPlayer.input.backward = 1; break;
            case 'KeyA': case 'ArrowLeft': this.localPlayer.input.left = 1; break;
            case 'KeyD': case 'ArrowRight': this.localPlayer.input.right = 1; break;
            case 'Space': if (!this.localPlayer.input.jump) this.localPlayer.input.jump = true; break; // Prevent holding jump
            case 'ShiftLeft': this.localPlayer.input.dash = true; break;
        }
    },

    handleKeyUp: function(event) {
        delete this.keysPressed[event.code]; // Remove key from tracking
        // No need to check for chatting here, as key up should always register for game state
        switch (event.code) {
            case 'KeyW': case 'ArrowUp': this.localPlayer.input.forward = 0; break;
            case 'KeyS': case 'ArrowDown': this.localPlayer.input.backward = 0; break;
            case 'KeyA': case 'ArrowLeft': this.localPlayer.input.left = 0; break;
            case 'KeyD': case 'ArrowRight': this.localPlayer.input.right = 0; break;
            // case 'Space': this.localPlayer.input.jump = false; break; // Jump is consumed
            // case 'ShiftLeft': this.localPlayer.input.dash = false; break; // Dash is consumed
        }
    },

    handleMouseDown: function(event) {
        if (!this.controls || !this.controls.isLocked || (window.ui && window.ui.isChatting) || this.localPlayer.isDead) return;
        
        if (event.button === 0) { // Left mouse button
            const now = Date.now();
            if (now - this.localPlayer.lastShotTime > this.SHOT_COOLDOWN_MS) {
                this.localPlayer.lastShotTime = now;
                const isEPressed = this.keysPressed['KeyE'] === true;
                this.shoot(isEPressed);
            }
        }
    },

    shoot: function(isGunPropelActive) {
        if (!this.localPlayer.id || this.localPlayer.isDead) return;

        const aimDirection = new THREE.Vector3();
        this.camera.getWorldDirection(aimDirection); // Gets the direction camera is facing

        if(window.network) {
            window.network.sendShoot(
                { x: aimDirection.x, y: aimDirection.y, z: aimDirection.z },
                isGunPropelActive
            );
        }

        this.playGunshotSound();
        if (this.localPlayer.gunMesh && typeof TWEEN !== 'undefined') { 
            const originalZ = -0.7; // Store original Z position of gun
            if (!isGunPropelActive) { // Simple recoil if not propelling
                new TWEEN.Tween(this.localPlayer.gunMesh.position)
                    .to({ z: originalZ + 0.1 }, 50)
                    .easing(TWEEN.Easing.Quadratic.Out)
                    .yoyo(true)
                    .repeat(1)
                    .onComplete(() => { this.localPlayer.gunMesh.position.z = originalZ; }) // Ensure reset
                    .start();
            }
        }
    },
    
    playGunshotSound: function() {
        if (this.assets.gunshotSound && this.listener && this.listener.context.state === 'running') {
            const sound = new THREE.Audio(this.listener); // Create new audio source for each shot
            sound.setBuffer(this.assets.gunshotSound);
            sound.setVolume(0.25); // Reduced volume
            sound.play();
        } else if (this.listener && this.listener.context.state !== 'running') {
            console.warn("AudioContext not running. Click screen to enable audio.");
        }
    },

    initializeGameState: function(data) {
        if (!this.isInitialized) {
            console.warn("Game not fully initialized when receiving gameState.");
            // Potentially queue this data or wait. For now, proceed cautiously.
        }
        this.localPlayer.id = data.yourId;
        this.spawnPoints = data.spawnPoints || [];
        console.log("Game state initialized. My ID:", this.localPlayer.id);

        if (data.players && data.players[this.localPlayer.id]) {
            const myState = data.players[this.localPlayer.id];
            this.localPlayer.physicsBody.position.set(myState.position.x, myState.position.y, myState.position.z);
            this.localPlayer.physicsBody.velocity.set(0,0,0); // Reset velocity
            if (myState.rotation) this.camera.quaternion.set(myState.rotation.x, myState.rotation.y, myState.rotation.z, myState.rotation.w);
            this.localPlayer.health = myState.health;
            this.localPlayer.kills = myState.kills;
            this.localPlayer.deaths = myState.deaths;
            this.localPlayer.isDead = myState.isDead;
        } else {
            const spawn = this.spawnPoints.length > 0 ? this.spawnPoints[Math.floor(Math.random() * this.spawnPoints.length)] : {x:0, y:10, z:0};
            this.localPlayer.physicsBody.position.set(spawn.x, spawn.y, spawn.z);
        }
        this.updateCameraToPhysicsBody(); // Sync camera to new physics pos

        for (const playerId in data.players) {
            if (playerId !== this.localPlayer.id) {
                this.addPlayer(data.players[playerId]);
            }
        }
        if(window.ui) {
            window.ui.updateGameStats(data.timeLeft, this.localPlayer.kills, this.localPlayer.deaths);
            window.ui.showLeaderboard(data.players); 
            setTimeout(() => { if(window.ui.isLeaderboardVisible) window.ui.hideLeaderboard() }, 3000);
            if (data.killLog) {
                data.killLog.forEach(entry => window.ui.addKillFeedEntry(entry.killer, entry.victim, entry.method));
            }
        }
    },

    updateGameState: function(data) {
        if (!this.isInitialized || !this.localPlayer.id) return;

        for (const playerId in data.players) {
            const playerData = data.players[playerId];
            if (playerId === this.localPlayer.id) {
                this.localPlayer.health = playerData.health;
                this.localPlayer.kills = playerData.kills;
                this.localPlayer.deaths = playerData.deaths;
                this.localPlayer.isDead = playerData.isDead;
                // Server's position for local player is for reconciliation (advanced)
                // For now, we mostly rely on client prediction for local player's body
                this.localPlayer.serverPosition.set(playerData.position.x, playerData.position.y, playerData.position.z);
                // Don't directly set local player's camera rotation from server unless reconciling view.
                // this.localPlayer.serverRotation.set(playerData.rotation.x, playerData.rotation.y, playerData.rotation.z, playerData.rotation.w);
                this.localPlayer.lastServerUpdateTime = Date.now();
            } else { 
                if (this.players[playerId]) {
                    const p = this.players[playerId];
                    p.serverPosition.set(playerData.position.x, playerData.position.y, playerData.position.z);
                    p.serverRotation.set(playerData.rotation.x, playerData.rotation.y, playerData.rotation.z, playerData.rotation.w);
                    p.lastServerUpdateTime = Date.now();
                    p.health = playerData.health;
                    p.isDead = playerData.isDead;
                    if (p.model) p.model.visible = !p.isDead;
                } else {
                    this.addPlayer(playerData);
                }
            }
        }
        if(window.ui) {
            window.ui.updateGameStats(data.timeLeft, this.localPlayer.kills, this.localPlayer.deaths);
            if (window.ui.isLeaderboardVisible) window.ui.showLeaderboard(data.players);
        }
    },

    addPlayer: function(playerData) {
        if (!this.assets.playerModel) {
            console.warn("Player model asset not loaded, cannot add player:", playerData.name);
            return;
        }
        if (this.players[playerData.id] || playerData.id === this.localPlayer.id) return;
        console.log("Adding remote player:", playerData.name, playerData.id);

        const playerModel = this.assets.playerModel.scene.clone();
        playerModel.scale.set(0.8, 0.8, 0.8);
        playerModel.traverse(child => { if(child.isMesh) { child.castShadow = true; child.receiveShadow = true; }});
        this.scene.add(playerModel);
        
        playerModel.position.set(playerData.position.x, playerData.position.y, playerData.position.z);
        if(playerData.rotation) playerModel.quaternion.set(playerData.rotation.x, playerData.rotation.y, playerData.rotation.z, playerData.rotation.w);
        playerModel.visible = !playerData.isDead;

        this.players[playerData.id] = {
            model: playerModel,
            name: playerData.name,
            character: playerData.character,
            health: playerData.health,
            isDead: playerData.isDead,
            serverPosition: new THREE.Vector3().copy(playerData.position),
            serverRotation: playerData.rotation ? new THREE.Quaternion().copy(playerData.rotation) : new THREE.Quaternion(),
            clientPosition: new THREE.Vector3().copy(playerData.position),
            clientRotation: playerData.rotation ? new THREE.Quaternion().copy(playerData.rotation) : new THREE.Quaternion(),
            lastServerUpdateTime: Date.now(),
        };
    },

    removePlayer: function(playerId) {
        if (this.players[playerId]) {
            console.log("Removing player:", this.players[playerId].name, playerId);
            if (this.players[playerId].model) {
                this.scene.remove(this.players[playerId].model);
                // TODO: Properly dispose of geometries/materials if they are unique and not cloned
            }
            delete this.players[playerId];
        }
    },

    handlePlayerShotEffect: function(data) {
        if (data.shooterId !== this.localPlayer.id) {
            const shooter = this.players[data.shooterId];
            if (shooter && shooter.model && this.assets.gunshotSound && this.listener && this.listener.context.state === 'running') {
                const sound = new THREE.PositionalAudio(this.listener);
                sound.setBuffer(this.assets.gunshotSound);
                sound.setRefDistance(15); // Hear shots from closer
                sound.setRolloffFactor(2.5);
                sound.setVolume(0.2);
                shooter.model.add(sound); 
                sound.play();
                // Detach sound after playing to prevent buildup on model
                sound.onEnded = () => { shooter.model.remove(sound); sound.disconnect(); };

            }
        }

        let shooterPos;
        const aimDir = new THREE.Vector3(data.aimDir.x, data.aimDir.y, data.aimDir.z).normalize();
        if (data.shooterId === this.localPlayer.id) {
            shooterPos = new THREE.Vector3();
            this.camera.getWorldPosition(shooterPos);
            shooterPos.addScaledVector(aimDir, 0.2); // Offset from camera center along aim direction
        } else if (this.players[data.shooterId] && this.players[data.shooterId].model) {
            shooterPos = this.players[data.shooterId].model.position.clone();
            shooterPos.y += this.PLAYER_HEIGHT * 0.4; // Approx gun height for other players from model's base
        }

        if (shooterPos) {
            const endPoint = data.hit ? new THREE.Vector3(data.hitPoint.x, data.hitPoint.y, data.hitPoint.z)
                                       : shooterPos.clone().add(aimDir.multiplyScalar(100));
            const points = [shooterPos, endPoint];
            const material = new THREE.LineBasicMaterial({ color: 0xffef00, transparent: true, opacity: 0.6, depthWrite: false });
            const geometry = new THREE.BufferGeometry().setFromPoints(points);
            const tracer = new THREE.Line(geometry, material);
            this.scene.add(tracer);
            setTimeout(() => { this.scene.remove(tracer); material.dispose(); geometry.dispose(); }, 120);
        }

        if (data.hit && data.hitPoint && typeof TWEEN !== 'undefined') {
            const impactSize = data.hitPlayerId ? 0.3 : 0.1;
            const impactColor = data.hitPlayerId ? 0xff3333 : 0xcccccc;
            const impactGeo = new THREE.SphereGeometry(impactSize, 6, 6);
            const impactMat = new THREE.MeshBasicMaterial({ color: impactColor, transparent: true, opacity: 1 });
            const impactMesh = new THREE.Mesh(impactGeo, impactMat);
            impactMesh.position.set(data.hitPoint.x, data.hitPoint.y, data.hitPoint.z);
            this.scene.add(impactMesh);
            new TWEEN.Tween(impactMat)
                .to({ opacity: 0 }, 300)
                .easing(TWEEN.Easing.Quadratic.Out)
                .onComplete(() => { this.scene.remove(impactMesh); impactMat.dispose(); impactGeo.dispose(); })
                .start();
        }
    },

    handlePlayerDied: function(data) {
        if(window.ui) window.ui.addKillFeedEntry(data.killLogEntry.killer, data.killLogEntry.victim, data.killLogEntry.method);

        if (data.victimId === this.localPlayer.id) {
            this.localPlayer.isDead = true;
            this.localPlayer.health = 0;
            if(window.ui) window.ui.displayCenterEvent("YOU WERE ELIMINATED", 3000);
            if(this.controls.isLocked) this.controls.unlock();
        } else if (this.players[data.victimId]) {
            this.players[data.victimId].isDead = true;
            if (this.players[data.victimId].model) {
                this.players[data.victimId].model.visible = false;
            }
        }

        if (data.position && typeof TWEEN !== 'undefined') {
            const explosionPos = new THREE.Vector3(data.position.x, data.position.y, data.position.z);
            const explosionGeo = new THREE.SphereGeometry(0.5, 16, 16);
            const explosionMat = new THREE.MeshBasicMaterial({ color: 0xffA500, transparent: true, opacity: 0.9 }); // Orange
            const explosionMesh = new THREE.Mesh(explosionGeo, explosionMat);
            explosionMesh.position.copy(explosionPos);
            this.scene.add(explosionMesh);

            new TWEEN.Tween(explosionMesh.scale)
                .to({ x: 12, y: 12, z: 12 }, 500)
                .easing(TWEEN.Easing.Exponential.Out)
                .start();
            new TWEEN.Tween(explosionMat)
                .to({ opacity: 0 }, 500)
                .easing(TWEEN.Easing.Quadratic.Out)
                .onComplete(() => {
                    this.scene.remove(explosionMesh);
                    explosionMat.dispose();
                    explosionGeo.dispose();
                })
                .start();
        }
    },

    handlePlayerRespawn: function(data) {
        if (data.playerId === this.localPlayer.id) {
            this.localPlayer.isDead = false;
            this.localPlayer.health = data.health;
            this.localPlayer.physicsBody.position.set(data.position.x, data.position.y, data.position.z);
            this.localPlayer.physicsBody.velocity.set(0,0,0);
            this.camera.quaternion.set(data.rotation.x, data.rotation.y, data.rotation.z, data.rotation.w);
            this.updateCameraToPhysicsBody();
            if(window.ui) window.ui.displayCenterEvent("RESPAWNED", 2000);
            // Don't auto-relock, let user click.
        } else if (this.players[data.playerId]) {
            const player = this.players[data.playerId];
            player.isDead = false;
            player.health = data.health;
            if (player.model) {
                player.model.position.set(data.position.x, data.position.y, data.position.z);
                player.model.quaternion.set(data.rotation.x, data.rotation.y, data.rotation.z, data.rotation.w);
                player.model.visible = true;
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
        } else if (this.players[playerId]) {
            this.players[playerId].health = health;
        }
        // TODO: Update UI health display if you add one
    },
    
    resetLocalPlayerStats: function() {
        this.localPlayer.kills = 0;
        this.localPlayer.deaths = 0;
    },

    onWindowResize: function() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    },
    
    updateCameraToPhysicsBody: function() {
        if (!this.localPlayer.physicsBody || !this.camera) return;
        this.camera.position.copy(this.localPlayer.physicsBody.position);
        this.camera.position.y += this.PLAYER_HEIGHT * 0.4; // Eye height offset from capsule center (0.5 for capsule radius - 0.1 buffer)
    },

    animate: function() {
        requestAnimationFrame(this.animate.bind(this));
        if (!this.isInitialized) return;

        const delta = this.clock.getDelta();
        const now = Date.now();

        if (this.localPlayer.physicsBody && !this.localPlayer.isDead && this.controls && this.controls.isLocked) {
            this.handleClientMovement(delta);
        }
        
        this.world.step(1/60, delta, 3); // Fixed timestep for physics, with variable delta and max sub-steps
        
        if (this.localPlayer.physicsBody) {
            this.updateCameraToPhysicsBody(); // Camera follows physics body, PointerLockControls orients it
        }
        
        if (this.controls && this.controls.isLocked && this.localPlayer.id && window.network) {
            // Send input frequently if locked, but can be optimized (e.g., on change or fixed interval)
            window.network.sendInput(this.localPlayer.input, this.camera.quaternion);
            this.localPlayer.input.jump = false; // Consume jump after sending
            // Dash input is also consumed on client and server
        }

        const lerpFactor = 0.25; // Smoother interpolation
        for (const id in this.players) {
            const player = this.players[id];
            if (player.model && player.serverPosition && player.serverRotation) {
                const timeSinceLastUpdate = (now - player.lastServerUpdateTime) / 1000; // seconds
                // Basic extrapolation based on last known velocity (if server sent it)
                // let predictedPos = player.serverPosition.clone();
                // if(player.serverVelocity) predictedPos.addScaledVector(player.serverVelocity, timeSinceLastUpdate);
                // player.clientPosition.lerp(predictedPos, lerpFactor);

                player.clientPosition.lerp(player.serverPosition, lerpFactor); // Simple lerp
                player.model.position.copy(player.clientPosition);
                player.clientRotation.slerp(player.serverRotation, lerpFactor);
                player.model.quaternion.copy(player.clientRotation);
            }
        }
        
        this.animationMixers.forEach(mixer => mixer.update(delta));

        if (typeof TWEEN !== 'undefined') TWEEN.update(); // TWEEN updates itself if you call TWEEN.update() globally
        
        // if (this.debugMode && this.cannonDebugger) {
        //     this.cannonDebugger.update();
        // }

        this.renderer.render(this.scene, this.camera);
    },

    handleClientMovement: function(delta) {
        if (!this.localPlayer.physicsBody || !this.controls || !this.controls.isLocked) return;

        const body = this.localPlayer.physicsBody;
        const input = this.localPlayer.input;
        const speedFactor = 3500; // Applied as force, scales with delta in world.step

        const FWD = new THREE.Vector3();
        const RIGHT = new THREE.Vector3();
        this.camera.getWorldDirection(FWD);
        FWD.y = 0; 
        FWD.normalize();
        RIGHT.crossVectors(new THREE.Vector3(0,1,0), FWD).normalize().negate(); // Use world UP for horizontal right

        let force = new CANNON.Vec3(0,0,0);
        const currentSpeed = speedFactor * delta; // Scale force by delta time for consistency

        if (input.forward) force.vadd(new CANNON.Vec3(FWD.x, 0, FWD.z).scale(currentSpeed), force);
        if (input.backward) force.vsub(new CANNON.Vec3(FWD.x, 0, FWD.z).scale(currentSpeed), force);
        if (input.left) force.vadd(new CANNON.Vec3(RIGHT.x, 0, RIGHT.z).scale(currentSpeed), force);
        if (input.right) force.vsub(new CANNON.Vec3(RIGHT.x, 0, RIGHT.z).scale(currentSpeed), force);
        
        body.applyForce(new CANNON.Vec3(force.x, 0, force.z), body.position);

        if (input.jump && this.isPlayerGroundedClient()) {
            body.velocity.y = 0; 
            body.applyImpulse(new CANNON.Vec3(0, this.JUMP_FORCE, 0), body.position);
            input.jump = false; // Consume jump client-side
        }

        const now = Date.now();
        if (input.dash && (now - this.localPlayer.lastDashTime > this.DASH_COOLDOWN_MS)) {
            this.localPlayer.lastDashTime = now;
            let dashDirectionCAN = new CANNON.Vec3(FWD.x, 0, FWD.z); 
            if (input.forward) dashDirectionCAN.set(FWD.x, 0, FWD.z);
            else if (input.backward) dashDirectionCAN.set(-FWD.x, 0, -FWD.z);
            else if (input.left) dashDirectionCAN.set(RIGHT.x, 0, RIGHT.z);
            else if (input.right) dashDirectionCAN.set(-RIGHT.x, 0, -RIGHT.z);
            else { // If no direction key, dash where looking (horizontally)
                dashDirectionCAN.set(FWD.x,0,FWD.z);
            }
            dashDirectionCAN.normalize();
            body.applyImpulse(dashDirectionCAN.scale(this.DASH_IMPULSE), body.position);
            input.dash = false; // Consume dash client-side
        }
    },
    
    isPlayerGroundedClient: function() {
        if (!this.localPlayer.physicsBody) return false;
        const body = this.localPlayer.physicsBody;
        const start = body.position.clone();
        const end = body.position.clone();
        // Raycast from slightly above bottom of capsule to slightly below
        const rayLength = (this.PLAYER_HEIGHT / 2) + 0.15; // Half capsule height + small buffer
        start.y -= (this.PLAYER_HEIGHT / 2) - 0.1; // Start ray just inside bottom sphere
        end.y -= rayLength; 
        
        const ray = new CANNON.Ray(start, end);
        const result = new CANNON.RaycastResult();
        // Raycast options: check against all, skip backfaces
        const options = { collisionFilterGroup: 1, collisionFilterMask: -1, skipBackfaces: true }; 
        ray.intersectWorld(this.world, options, result);

        return result.hasHit && result.body !== body;
    },
};

window.game = game; // Make game object globally accessible
