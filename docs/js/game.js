import * as THREE from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
import { PlayerController, RemotePlayer } from './playerController.js';
import { AssetLoader } from './assetLoader.js';

const SHOCKWAVE_RADIUS = 15;
const SHOCKWAVE_STRENGTH = 30.0; // For local player physics impulse

export class GameManager {
    constructor(uiManager, networkManager, assetLoader) {
        this.uiManager = uiManager;
        this.networkManager = networkManager;
        this.assetLoader = assetLoader; // AssetLoader instance
        this.RAPIER = window.RAPIER; // Rapier instance from global scope

        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.physicsWorld = null;
        this.mapModel = null;
        this.mapCollider = null;

        this.localPlayer = null;
        this.remotePlayers = {};

        this.clock = new THREE.Clock();
        this.controlsActive = false;
        
        this.currentMapInfo = null; // { name, assetPath, spawnPoints }
        this.gameSettings = {}; // { VOID_Y_THRESHOLD }
        this.leaderboardData = {}; // Store data for leaderboard: {playerId: {name, kills, deaths}}

        this.debugGraphics = false; // Set to true to see Rapier colliders if renderer supports it
        
        this.animationFrameId = null;
    }

    async init() {
        // Rapier world setup
        const gravity = { x: 0.0, y: -9.81 * 2, z: 0.0 }; // Stronger gravity
        this.physicsWorld = new this.RAPIER.World(gravity);

        // Three.js Scene Setup
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x87CEEB); // Sky blue

        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 2000);
        
        this.renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('gameCanvas'), antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.shadowMap.enabled = true; // Enable shadows

        // Lighting
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        this.scene.add(ambientLight);
        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(50, 100, 50);
        directionalLight.castShadow = true;
        directionalLight.shadow.mapSize.width = 2048;
        directionalLight.shadow.mapSize.height = 2048;
        directionalLight.shadow.camera.near = 0.5;
        directionalLight.shadow.camera.far = 500;
        directionalLight.shadow.camera.left = -150;
        directionalLight.shadow.camera.right = 150;
        directionalLight.shadow.camera.top = 150;
        directionalLight.shadow.camera.bottom = -150;
        this.scene.add(directionalLight);


        window.addEventListener('resize', this.onWindowResize.bind(this), false);
        this.setupGameControls();
    }
    
    setCurrentMapInfo(mapInfo) {
        this.currentMapInfo = mapInfo;
        // If game is already running and map changes, this would trigger loading new map assets
        // For now, map is loaded on gameJoined
    }
    
    setGameSettings(settings) {
        this.gameSettings = settings;
        if (settings.MAPS && settings.MAPS.length > 0 && !this.currentMapInfo) {
            this.setCurrentMapInfo(settings.MAPS[0]); // Default to first map if not set
        }
    }

    async initGameScene(localPlayerId, initialPlayersData, spawnPoint) {
        if (!this.currentMapInfo) {
            console.error("Map info not set before initializing game scene!");
            // Potentially request map info or use a default
            // For now, this relies on server sending `currentMap` event before `gameJoined`
            // or `currentMap` being part of `gameJoined` data.
            // Let's assume `gameJoined` includes `currentMap`.
            if (initialPlayersData.currentMap) { // Check if it's passed in initial data
                 this.setCurrentMapInfo(initialPlayersData.currentMap);
            } else {
                 // Fallback or error
                 this.uiManager.showHomeMenuWithMessage("Error: Map data missing. Cannot start game.");
                 return;
            }
        }

        // Load current map model
        try {
            const mapAsset = await this.assetLoader.loadMapAsset(this.currentMapInfo.name, this.currentMapInfo.assetPath);
            this.setupMap(mapAsset);
        } catch (error) {
            console.error("Failed to load map for game scene:", error);
            this.uiManager.showHomeMenuWithMessage("Error: Could not load map. Please try again.");
            // Potentially disconnect or allow user to refresh.
            return;
        }
        
        // Initialize Local Player
        const localPlayerData = initialPlayersData[localPlayerId];
        this.localPlayer = new PlayerController(this.camera, this.scene, this.physicsWorld, this.uiManager, this.networkManager, this.assetLoader.assets);
        this.localPlayer.init(localPlayerId, localPlayerData.name, localPlayerData.character, spawnPoint); // Pass character name/data if needed
        this.localPlayer.setupControls(); // Enable input listeners
        this.leaderboardData[localPlayerId] = { id: localPlayerId, name: localPlayerData.name, kills: 0, deaths: 0 };

        // Initialize Remote Players
        for (const playerId in initialPlayersData) {
            if (playerId !== localPlayerId) {
                const playerData = initialPlayersData[playerId];
                this.addPlayer(playerData);
            }
        }

        this.controlsActive = true;
        document.body.requestPointerLock();
        this.startGameLoop();
    }
    
    setupMap(mapAsset) {
        if (this.mapModel) {
            this.scene.remove(this.mapModel);
            // Dispose old geometry/materials if necessary
        }
        if (this.mapCollider) {
            this.physicsWorld.removeCollider(this.mapCollider, false); // false = don't wake up island
        }

        this.mapModel = mapAsset.scene;
        this.mapModel.traverse(child => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });
        this.scene.add(this.mapModel);

        // Create Rapier collider for the map (Trimesh)
        // This requires vertices and indices from the GLB model.
        // It's complex if the model has multiple meshes.
        // For simplicity, let's assume a single mesh or combine them.
        const mapMeshes = [];
        this.mapModel.traverse(child => {
            if (child.isMesh) {
                mapMeshes.push(child);
            }
        });

        if (mapMeshes.length > 0) {
            // Combine geometry for a single trimesh, or create multiple static colliders
            // For now, using the first mesh found. This is a simplification.
            // A robust solution would iterate all meshes and create trimesh for each, or merge them.
            const firstMesh = mapMeshes[0];
            const vertices = firstMesh.geometry.attributes.position.array;
            const indices = firstMesh.geometry.index ? firstMesh.geometry.index.array : undefined;

            if (indices) {
                // Apply world transformation to vertices before creating trimesh
                firstMesh.updateWorldMatrix(true, true); // Ensure world matrix is up-to-date
                const transformedVertices = [];
                const tempVec = new THREE.Vector3();
                for (let i = 0; i < vertices.length; i += 3) {
                    tempVec.set(vertices[i], vertices[i+1], vertices[i+2]);
                    tempVec.applyMatrix4(firstMesh.matrixWorld);
                    transformedVertices.push(tempVec.x, tempVec.y, tempVec.z);
                }

                const trimeshDesc = this.RAPIER.ColliderDesc.trimesh(new Float32Array(transformedVertices), new Uint32Array(indices))
                    .setFriction(1.0) // High friction for ground
                    .setRestitution(0.1); // Low bounciness
                this.mapCollider = this.physicsWorld.createCollider(trimeshDesc);
                this.mapCollider.userData = { type: 'map' };
                console.log("Map trimesh collider created.");
            } else {
                console.warn("Map mesh has no indices, cannot create trimesh collider. Consider non-indexed trimesh or convex hull.");
                // Fallback: Create a large static ground plane if map collider fails
                const groundSize = 500;
                const groundDesc = this.RAPIER.ColliderDesc.cuboid(groundSize, 0.5, groundSize)
                    .setTranslation(0, -1, 0); // Position it below typical spawn
                this.mapCollider = this.physicsWorld.createCollider(groundDesc);
                this.mapCollider.userData = { type: 'map_fallback_plane' };
            }
        } else {
            console.error("No meshes found in map GLB for physics collider.");
        }
    }

    setupGameControls() {
        document.addEventListener('keydown', (event) => {
            if (!this.controlsActive || !this.localPlayer) return;
            if (this.localPlayer.isChatting) return;

            if (event.key.toLowerCase() === 't' && !this.localPlayer.isChatting) {
                event.preventDefault();
                this.uiManager.toggleChatInput(true, this.localPlayer);
                document.exitPointerLock();
            }
            if (event.key.toLowerCase() === 'l') {
                event.preventDefault();
                this.uiManager.toggleLeaderboard(!this.uiManager.isLeaderboardVisible(), this.getLeaderboard());
            }
        });

        this.uiManager.onChatSubmit = (message) => {
            if (message.trim() !== '') {
                this.networkManager.sendChatMessage(message);
            }
            this.uiManager.toggleChatInput(false, this.localPlayer); // Hide input
             if(this.controlsActive) document.body.requestPointerLock(); // Re-acquire pointer lock
        };
        
        // Handle pointer lock changes
        document.addEventListener('pointerlockchange', () => {
            if (document.pointerLockElement === document.body) {
                this.controlsActive = true;
                if (this.localPlayer) this.localPlayer.isChatting = false; // Ensure not in chat mode
            } else {
                this.controlsActive = false;
                // If not intentionally exiting for chat, could show a "paused" or "click to resume"
            }
        }, false);
    }

    addPlayer(playerData) {
        if (playerData.id === this.localPlayer?.id) return; // Don't re-add local player

        if (this.remotePlayers[playerData.id]) { // If player reconnects or data is re-sent
            this.remotePlayers[playerData.id].dispose();
        }
        
        const remotePlayer = new RemotePlayer(playerData.id, playerData.name, playerData.character, this.scene, this.assetLoader.assets, this.physicsWorld, this.RAPIER);
        remotePlayer.model.position.set(playerData.position.x, playerData.position.y, playerData.position.z);
        if (playerData.rotation) {
            remotePlayer.model.quaternion.set(playerData.rotation.x, playerData.rotation.y, playerData.rotation.z, playerData.rotation.w);
        }
        remotePlayer.updateState(playerData); // Initialize target positions
        this.remotePlayers[playerData.id] = remotePlayer;
        this.leaderboardData[playerData.id] = { id: playerData.id, name: playerData.name, kills: playerData.kills || 0, deaths: playerData.deaths || 0 };
        console.log(`Added remote player: ${playerData.name} (${playerData.id})`);
    }

    removePlayer(playerId) {
        if (this.remotePlayers[playerId]) {
            this.remotePlayers[playerId].dispose();
            delete this.remotePlayers[playerId];
            delete this.leaderboardData[playerId];
            console.log(`Removed remote player: ${playerId}`);
        }
         if (this.uiManager.isLeaderboardVisible()) {
            this.uiManager.updateLeaderboard(this.getLeaderboard());
        }
    }

    updateRemotePlayer(data) { // data: { id, position, rotation, velocity, isDashing, isShooting }
        const player = this.remotePlayers[data.id];
        if (player) {
            player.updateState(data);
        }
    }
    
    updateAllPlayersState(playersData) { // Typically called on round start
        // Update local player scores
        if (this.localPlayer && playersData[this.localPlayer.id]) {
            const localData = playersData[this.localPlayer.id];
            this.leaderboardData[this.localPlayer.id].kills = localData.kills;
            this.leaderboardData[this.localPlayer.id].deaths = localData.deaths;
            // Note: Local player health/position is managed by playerRespawn event
        }

        // Update remote players scores and existence
        const currentRemoteIds = Object.keys(this.remotePlayers);
        const serverPlayerIds = Object.keys(playersData).filter(id => id !== this.localPlayer?.id);

        // Add new or update existing remote players
        for (const playerId of serverPlayerIds) {
            const playerData = playersData[playerId];
            if (this.remotePlayers[playerId]) {
                this.remotePlayers[playerId].updateState(playerData); // Sync position/rotation
                this.leaderboardData[playerId].kills = playerData.kills;
                this.leaderboardData[playerId].deaths = playerData.deaths;
            } else {
                this.addPlayer(playerData); // New player mid-round (e.g. reconnect)
            }
        }
        // Remove players that are no longer in the server's list
        for (const existingId of currentRemoteIds) {
            if (!serverPlayerIds.includes(existingId)) {
                this.removePlayer(existingId);
            }
        }
        
        if (this.uiManager.isLeaderboardVisible()) {
            this.uiManager.updateLeaderboard(this.getLeaderboard());
        }
    }

    handleRemoteShot(data) { // { shooterId, origin, direction, E_pressed }
        const shooter = this.remotePlayers[data.shooterId];
        if (shooter && shooter.gunModel) {
            // Play sound effect at shooter's gun position
            const listener = this.camera.children.find(c => c.type === "AudioListener") || this.localPlayer?.gunshotSound.listener; // Find the listener
            if (listener) {
                const sound = new THREE.PositionalAudio(listener);
                sound.setBuffer(this.assetLoader.getAsset('gunshotSound'));
                sound.setRefDistance(20);
                sound.setRolloffFactor(2); 
                sound.setVolume(0.2);
                shooter.gunModel.add(sound); // Attach to gun model for 3D sound
                sound.play();
                // Clean up sound object after it finishes playing
                sound.onEnded = () => {
                    shooter.gunModel.remove(sound);
                    sound.disconnect();
                };
            }

            // Optional: Show muzzle flash or tracer line
            // Muzzle flash
            // const muzzleFlash = new THREE.PointLight(0xffcc00, 1, 5, 2);
            // muzzleFlash.position.copy(shooter.gunModel.getWorldPosition(new THREE.Vector3())); // Position at gun tip
            // this.scene.add(muzzleFlash);
            // setTimeout(() => this.scene.remove(muzzleFlash), 50);

            // Tracer Line
            // const startPoint = shooter.gunModel.getWorldPosition(new THREE.Vector3());
            // const endPoint = new THREE.Vector3().copy(startPoint).add(new THREE.Vector3(data.direction.x,data.direction.y,data.direction.z).multiplyScalar(100));
            // const geometry = new THREE.BufferGeometry().setFromPoints([startPoint, endPoint]);
            // const material = new THREE.LineBasicMaterial({ color: 0xffff00, transparent: true, opacity: 0.5 });
            // const tracer = new THREE.Line(geometry, material);
            // this.scene.add(tracer);
            // setTimeout(() => this.scene.remove(tracer), 100);
        }
    }
    
    handlePlayerDamage(data) { // { victimId, attackerId, health }
        if (this.localPlayer && data.victimId === this.localPlayer.id) {
            this.localPlayer.takeDamage(this.localPlayer.health - data.health); // Damage is implied by new health
            // Could show damage indicator vignette
        } else if (this.remotePlayers[data.victimId]) {
            this.remotePlayers[data.victimId].health = data.health;
            // Could show damage effect on remote player model
        }
    }

    handlePlayerDeath(data) { // { victimId, killerId, deathPosition, victimName, killerName, updatedScores }
        const victimObject = (this.localPlayer && data.victimId === this.localPlayer.id) ? this.localPlayer : this.remotePlayers[data.victimId];
        
        if (victimObject) {
            // Play death "explosion" effect at deathPosition
            this.createExplosionEffect(data.deathPosition);

            // Apply shockwave to local player if they are close enough and not the victim
            if (this.localPlayer && data.victimId !== this.localPlayer.id && this.localPlayer.health > 0) {
                const shockwaveOrigin = new THREE.Vector3(data.deathPosition.x, data.deathPosition.y, data.deathPosition.z);
                this.localPlayer.applyShockwave(shockwaveOrigin, SHOCKWAVE_STRENGTH);
            }
            
            if (data.victimId === this.localPlayer?.id) {
                this.localPlayer.health = 0;
                this.uiManager.updateHealth(0);
                // Local player controls will be disabled until respawn
                if(document.pointerLockElement) document.exitPointerLock();
                this.controlsActive = false; // Disable controls further
                // The player model for local player is usually invisible or parts are, so "explosion" might be simpler
            } else if (this.remotePlayers[data.victimId]) {
                // Make remote player model "disappear" or play death animation
                // For now, just hide it until server respawns them (or remove and re-add)
                 this.remotePlayers[data.victimId].model.visible = false; // Hide until respawn
                 this.remotePlayers[data.victimId].health = 0;
            }
        }
        // Update leaderboard scores from data.updatedScores
        this.networkManager.updateLeaderboardScores(data.updatedScores);
    }

    createExplosionEffect(position) {
        // Simple particle explosion
        const particleCount = 100;
        const particles = new THREE.BufferGeometry();
        const pMaterial = new THREE.PointsMaterial({
            color: 0xFF8800, // Orange/Red
            size: 0.3,
            blending: THREE.AdditiveBlending,
            transparent: true,
            opacity: 0.8,
            depthWrite: false // So particles don't clip weirdly
        });

        const pPositions = [];
        for (let i = 0; i < particleCount; i++) {
            pPositions.push(
                (Math.random() - 0.5) * 0.1, // Small initial spread
                (Math.random() - 0.5) * 0.1,
                (Math.random() - 0.5) * 0.1
            );
        }
        particles.setAttribute('position', new THREE.Float32BufferAttribute(pPositions, 3));
        const particleSystem = new THREE.Points(particles, pMaterial);
        particleSystem.position.set(position.x, position.y, position.z);
        this.scene.add(particleSystem);

        // Animate particles outwards and fade
        const initialVelocities = [];
        for (let i = 0; i < particleCount; i++) {
            initialVelocities.push(
                (Math.random() - 0.5) * 5, // Speed
                (Math.random() - 0.5) * 5,
                (Math.random() - 0.5) * 5
            );
        }

        const explosionDuration = 1000; // ms
        const startTime = Date.now();

        const animateExplosion = () => {
            const elapsedTime = Date.now() - startTime;
            const progress = elapsedTime / explosionDuration;

            if (progress >= 1) {
                this.scene.remove(particleSystem);
                particles.dispose();
                pMaterial.dispose();
                return;
            }

            const positions = particleSystem.geometry.attributes.position.array;
            for (let i = 0; i < particleCount; i++) {
                positions[i * 3] += initialVelocities[i * 3] * 0.016; // Assume approx 60FPS delta
                positions[i * 3 + 1] += initialVelocities[i * 3 + 1] * 0.016;
                positions[i * 3 + 2] += initialVelocities[i * 3 + 2] * 0.016;
            }
            particleSystem.geometry.attributes.position.needsUpdate = true;
            pMaterial.opacity = 0.8 * (1 - progress);
            requestAnimationFrame(animateExplosion);
        };
        animateExplosion();
    }
    
    handlePlayerRespawn(data) { // { playerId, position, health }
        if (this.localPlayer && data.playerId === this.localPlayer.id) {
            this.localPlayer.resetToSpawn(data.position);
            this.localPlayer.health = data.health;
            this.uiManager.updateHealth(data.health);
            this.controlsActive = true; // Re-enable controls
            if(!this.localPlayer.isChatting) document.body.requestPointerLock();
        } else if (this.remotePlayers[data.playerId]) {
            const player = this.remotePlayers[data.playerId];
            player.model.position.set(data.position.x, data.position.y - (player.playerHeight/2 - player.playerRadius), data.position.z);
            player.targetPosition.copy(data.position);
            player.model.quaternion.identity(); // Reset rotation
            player.targetQuaternion.identity();
            player.model.visible = true; // Make visible again
            player.health = data.health;
        } else { // Player might have disconnected and reconnected, or joined mid-game
             // Server's 'playerJoined' should handle adding them if they are new to client
             console.warn(`Received respawn for unknown or not-yet-added player: ${data.playerId}`);
        }
    }
    
    getLeaderboard() {
        // Collate data from localPlayer and remotePlayers for leaderboard display
        const allPlayerData = [];
        if (this.localPlayer && this.leaderboardData[this.localPlayer.id]) {
            allPlayerData.push(this.leaderboardData[this.localPlayer.id]);
        }
        Object.values(this.remotePlayers).forEach(rp => {
            if (this.leaderboardData[rp.id]) {
                allPlayerData.push(this.leaderboardData[rp.id]);
            }
        });
        return allPlayerData;
    }
    
    getAllPlayers() {
        const all = {};
        if(this.localPlayer) all[this.localPlayer.id] = this.localPlayer;
        Object.assign(all, this.remotePlayers);
        return all;
    }


    startGameLoop() {
        if (this.animationFrameId) cancelAnimationFrame(this.animationFrameId); // Cancel any existing loop
        
        const gameLoop = () => {
            const deltaTime = this.clock.getDelta();

            // Step physics world
            this.physicsWorld.step();

            // Update local player
            if (this.localPlayer && this.localPlayer.health > 0 && this.controlsActive && !this.localPlayer.isChatting) {
                this.localPlayer.update(deltaTime);
            } else if (this.localPlayer && this.localPlayer.health <= 0) {
                // If dead, still update physics body to fall, but no input processing
                 this.localPlayer.update(deltaTime); // Let it process physics sync
            }


            // Update remote players (interpolation)
            for (const id in this.remotePlayers) {
                this.remotePlayers[id].interpolate(deltaTime);
            }

            this.renderer.render(this.scene, this.camera);
            this.animationFrameId = requestAnimationFrame(gameLoop);
        };
        gameLoop();
    }

    onWindowResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }
    
    cleanup() {
        console.log("Cleaning up game resources...");
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
        
        if (this.localPlayer) {
            this.localPlayer.dispose();
            this.localPlayer = null;
        }
        for (const id in this.remotePlayers) {
            this.remotePlayers[id].dispose();
        }
        this.remotePlayers = {};
        
        if (this.mapModel) {
            this.scene.remove(this.mapModel);
            // Proper disposal of mapModel's geometries/materials if complex
            this.mapModel = null;
        }
        if (this.mapCollider && this.physicsWorld) {
            this.physicsWorld.removeCollider(this.mapCollider, false);
            this.mapCollider = null;
        }
        
        // Clear scene children more thoroughly if needed
        while(this.scene.children.length > 0){ 
            const child = this.scene.children[0];
            this.scene.remove(child); 
            // If child has dispose method (like geometries, materials, textures), call it.
            if (child.geometry) child.geometry.dispose();
            if (child.material) {
                if (Array.isArray(child.material)) {
                    child.material.forEach(material => material.dispose());
                } else {
                    child.material.dispose();
                }
            }
        }

        if (this.physicsWorld) {
            // Rapier world doesn't have an explicit dispose method in JS bindings usually.
            // Setting to null should allow garbage collection.
            this.physicsWorld = null; 
        }

        this.leaderboardData = {};
        this.controlsActive = false;
        if(document.pointerLockElement) document.exitPointerLock();
        
        // UI cleanup handled by UIManager showing home screen
        this.uiManager.hideGameUI(); // This might be needed if not covered by showHomeMenu
        this.uiManager.showHomeMenuWithMessage("Disconnected or game ended.");
    }
}
