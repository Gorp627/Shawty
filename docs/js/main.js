// docs/js/main.js
import * as THREE from 'three';
import * as CANNON from 'cannon-es'; // Keep for potential client-side effects or physics debug
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
// import { OrbitControls } from 'three/addons/controls/OrbitControls.js'; // Optional for debugging

import { UI } from './UI.js';
import { Player } from './Player.js';
import { CharacterControls } from './CharacterControls.js';

const SERVER_URL = 'https://gametest-psxl.onrender.com'; // Your Render server URL
// const SERVER_URL = 'http://localhost:3000'; // For local testing

class GameClient {
    constructor() {
        this.socket = null;
        this.ui = new UI(this);
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        // this.orbitControls = null; // For debugging
        // this.physicsWorld = null; // Client-side physics world for local effects - CANNON.World()

        this.player = null; // Local player instance (Player class)
        this.characterControls = null; // Local player controls
        this.otherPlayers = new Map(); // Map of other player IDs to Player instances

        this.mapMesh = null;
        // this.mapPhysicsBody = null; // For client-side map collision (if implemented)

        this.gunshotSound = null;
        this.audioListener = null;

        this.firstPersonGun = null; // Player's gun model in first person

        this.assetPaths = {
            character: 'assets/maps/Shawty1.glb',
            map: 'assets/maps/the first map!.glb',
            gun: 'assets/maps/gun2.glb',
            gunshot: 'assets/maps/gunshot.wav'
        };
        this.assetsLoaded = 0;
        this.totalAssets = Object.keys(this.assetPaths).length;

        this.isDead = false;
        this.isRoundOverUIActive = false;
        this.showingLeaderboard = false;

        this.lastServerUpdateTime = 0;
        this.serverUpdateRate = 1000 / 20; // Assuming server sends updates at 20Hz

        this.connectToServer();
        window.addEventListener('resize', this.onWindowResize.bind(this), false);
        document.addEventListener('keydown', this.handleGlobalKeyDown.bind(this));
    }

    connectToServer() {
        this.ui.setLoadingMessage('Connecting to server...');
        this.socket = io(SERVER_URL, {
            transports: ['websocket'], // Force websockets, good for Render
            reconnectionAttempts: 5
        });

        this.socket.on('connect', () => {
            console.log('Connected to server with ID:', this.socket.id);
            this.ui.setLoadingMessage('Loading assets...');
            this.loadAssets();
        });

        this.socket.on('connect_error', (err) => {
            console.error('Connection error:', err);
            this.ui.showErrorMessage(`Failed to connect to server: ${err.message}. Please try again later.`);
        });
        
        this.socket.on('disconnect', (reason) => {
            console.log('Disconnected from server:', reason);
            if (!this.isRoundOverUIActive) { // Don't show error if it's a normal disconnect after round end
                 this.ui.showErrorMessage('Disconnected from server. Please refresh.');
            }
            if (this.renderer) this.renderer.setAnimationLoop(null);
            this.cleanupScene();
        });

        this.socket.on('onlinePlayerCount', (count) => {
            this.ui.updateOnlinePlayers(count);
        });

        // Game related messages
        this.socket.on('gameJoined', (data) => this.onGameJoined(data));
        this.socket.on('gameStateUpdate', (data) => this.onGameStateUpdate(data));
        this.socket.on('playerJoined', (playerData) => this.onPlayerJoined(playerData));
        this.socket.on('playerLeft', (playerId) => this.onPlayerLeft(playerId));
        this.socket.on('playerShot', (data) => this.onPlayerShot(data));
        this.socket.on('playerHit', (data) => this.onPlayerHit(data));
        this.socket.on('playerDied', (data) => this.onPlayerDied(data));
        this.socket.on('respawn', (playerData) => this.onRespawn(playerData));
        this.socket.on('chatMessage', (messageData) => this.ui.addChatMessage(messageData));
        this.socket.on('leaderboardUpdate', (leaderboard) => this.onLeaderboardUpdate(leaderboard));
        this.socket.on('roundOver', (data) => this.onRoundOver(data));
        this.socket.on('newRoundStarting', (data) => this.onNewRoundStarting(data));
    }

    assetLoaded() {
        this.assetsLoaded++;
        const progress = (this.assetsLoaded / this.totalAssets) * 100;
        this.ui.updateProgressBar(progress);
        if (this.assetsLoaded === this.totalAssets) {
            this.ui.setLoadingMessage('Assets loaded. Ready to play!');
            this.ui.showHomeMenu();
        }
    }

    loadAssets() {
        const gltfLoader = new GLTFLoader();
        const audioLoader = new THREE.AudioLoader();
        const loadingManager = new THREE.LoadingManager(
            () => { // All assets in manager loaded
                this.assetLoaded(); // This assumes one manager per asset type or manual counting
            },
            (itemUrl, itemsLoaded, itemsTotal) => { // Progress
                // For individual asset progress if needed, otherwise use assetLoaded()
                // console.log(`Loading ${itemUrl}: ${itemsLoaded}/${itemsTotal}`);
            }
        );
        // For now, we'll call assetLoaded manually after each top-level asset.

        gltfLoader.load(this.assetPaths.map, (gltf) => {
            this.mapMesh = gltf.scene;
            this.mapMesh.traverse(child => {
                if (child.isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                }
            });
            this.assetLoaded();
        }, undefined, err => { console.error('Error loading map:', err); this.assetLoaded(); /* count as loaded to not hang */});

        gltfLoader.load(this.assetPaths.character, 
            () => this.assetLoaded(), 
            undefined, 
            err => { console.error('Error pre-loading character:', err); this.assetLoaded(); }
        );

        gltfLoader.load(this.assetPaths.gun, (gltf) => {
            this.firstPersonGun = gltf.scene;
            this.firstPersonGun.scale.setScalar(0.1);
            this.firstPersonGun.position.set(0.15, -0.20, -0.35); // FP Gun Position: X, Y, Z from camera center
            this.firstPersonGun.rotation.set(0, Math.PI, 0); // Adjust if gun model faces wrong way
             this.firstPersonGun.traverse(child => {
                if (child.isMesh) {
                    child.castShadow = true; // FP gun can cast shadow
                    // child.receiveShadow = false; // Usually FP gun doesn't receive shadows on itself
                    child.material = child.material.clone(); // Avoid sharing material with other instances
                    child.material.depthTest = true; // Standard depth test
                    child.material.depthWrite = true;
                }
            });
            this.assetLoaded();
        }, undefined, err => { console.error('Error loading FP gun:', err); this.assetLoaded(); });
        
        this.audioListener = new THREE.AudioListener(); // Create listener before loading sound
        audioLoader.load(this.assetPaths.gunshot, (buffer) => {
            this.gunshotSound = new THREE.PositionalAudio(this.audioListener); // Use PositionalAudio
            this.gunshotSound.setBuffer(buffer);
            this.gunshotSound.setRefDistance(20); // Reference distance for rolloff
            this.gunshotSound.setRolloffFactor(1.5);
            this.gunshotSound.setVolume(0.5); // Adjust volume
            this.assetLoaded();
        }, undefined, err => { console.error('Error loading gunshot sound:', err); this.assetLoaded(); });
    }

    initThreeScene(mapInfo) {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x87CEEB); // Blue sky
        this.scene.fog = new THREE.Fog(0x87CEEB, 100, 500); // Add fog for distance


        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        if (this.audioListener) this.camera.add(this.audioListener);

        const canvas = document.getElementById('game-canvas');
        this.renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping; // Better color
        this.renderer.toneMappingExposure = 1.0;


        // Lights
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
        // const helper = new THREE.CameraHelper( directionalLight.shadow.camera );
        // this.scene.add( helper ); // For debugging shadow camera

        // Add map to scene
        if (this.mapMesh) {
            this.scene.add(this.mapMesh);
        } else {
            console.error("Map mesh not loaded before initThreeScene call!");
        }

        // Optional: OrbitControls for debugging camera without pointer lock
        // this.orbitControls = new OrbitControls(this.camera, this.renderer.domElement);
        // this.orbitControls.target.set(0, 1, 0);
        // this.orbitControls.enablePan = false;
        // this.orbitControls.enableZoom = true;
        // this.orbitControls.update();
    }

    joinGame(name, character) {
        if (this.socket && this.socket.connected) {
            this.socket.emit('joinGame', { name, character });
            this.ui.hideHomeMenu();
            this.ui.setLoadingMessage("Joining game..."); // Show brief joining message
            // Game UI will be shown on 'gameJoined'
        } else {
            this.ui.showErrorMessage("Not connected to server. Please wait or refresh.");
        }
    }

    onGameJoined(data) {
        console.log('Game joined!', data);
        this.ui.hideLoadingScreen(); // Hide any "Joining game..." message
        this.initThreeScene(data.mapInfo);

        // Create local player
        const initialPlayerState = data.initialState;
        this.player = new Player(initialPlayerState.id, initialPlayerState.name, initialPlayerState.character, this.scene, true, this.assetPaths, this.camera);
        this.player.setState(initialPlayerState);
        this.ui.updateHUD(initialPlayerState);

        // Setup character controls for local player
        const spawnPos = new THREE.Vector3(initialPlayerState.position.x, initialPlayerState.position.y, initialPlayerState.position.z);
        this.characterControls = new CharacterControls(this.camera, this.renderer.domElement, spawnPos, this.socket, this.ui);
        this.scene.add(this.characterControls.sceneObject); // Add yawObject to scene
        this.characterControls.teleport(spawnPos); // Ensure camera is at spawn

        // Attach first-person gun to camera (pitchObject)
        if (this.firstPersonGun && this.characterControls.pitchObject) {
            this.characterControls.pitchObject.add(this.firstPersonGun);
        }

        // Create other existing players
        data.allPlayers.forEach(playerData => {
            if (playerData.id !== this.player.id) {
                const otherPlayer = new Player(playerData.id, playerData.name, playerData.character, this.scene, false, this.assetPaths, this.camera);
                otherPlayer.setState(playerData);
                this.otherPlayers.set(playerData.id, otherPlayer);
            }
        });
        
        this.ui.showGameUI();
        if (!this.renderer.getAnimationLoop()) {
            this.renderer.setAnimationLoop(this.animate.bind(this));
        }
        this.isDead = false;
        this.isRoundOverUIActive = false;
        this.ui.hideDeathMessage();
        this.ui.hideRoundOver();
    }

    onGameStateUpdate(data) {
        if (!this.player || !this.characterControls) return;

        this.lastServerUpdateTime = Date.now();

        // Update local player's authoritative state (health, score, etc.)
        // Position is tricky: server is authoritative, but we want smooth client camera.
        // We let CharacterControls handle its own position based on input for smoothness,
        // but the server's position for the player's *physics body* is the truth.
        // The visual model of the local player (if visible) should match server.
        const localPlayerData = data.players.find(p => p.id === this.player.id);
        if (localPlayerData) {
            this.player.setState(localPlayerData); // Updates health, score, and target pos/rot for the *model*
            this.ui.updateHUD(localPlayerData);

            // If there's significant divergence between client predicted pos and server pos,
            // you might want to gently snap or correct. For now, we assume CharacterControls
            // keeps the camera relatively in sync with where the server *thinks* the player is.
            // this.characterControls.serverPositionUpdate(new THREE.Vector3(localPlayerData.position.x, localPlayerData.position.y, localPlayerData.position.z));
        }

        // Update other players
        data.players.forEach(playerData => {
            if (playerData.id === this.player.id) return; // Skip local player

            let otherPlayer = this.otherPlayers.get(playerData.id);
            if (otherPlayer) {
                otherPlayer.setState(playerData);
            } else {
                // Player might have joined between gameJoined and first gameStateUpdate
                this.onPlayerJoined(playerData);
            }
        });

        // Check for players in our list that are no longer in server's list (rare, but good practice)
        const serverPlayerIds = new Set(data.players.map(p => p.id));
        this.otherPlayers.forEach((p, id) => {
            if (!serverPlayerIds.has(id)) {
                this.onPlayerLeft(id);
            }
        });
        
        if (data.roundTime !== undefined) {
            this.ui.updateRoundTime(data.roundTime);
        }
    }

    onPlayerJoined(playerData) {
        if (!this.scene || (this.player && playerData.id === this.player.id)) return; // Don't add self again
        console.log('Player joined:', playerData.name);
        if (this.otherPlayers.has(playerData.id)) { // Already exists? Update it.
            this.otherPlayers.get(playerData.id).setState(playerData);
            return;
        }
        const newPlayer = new Player(playerData.id, playerData.name, playerData.character, this.scene, false, this.assetPaths, this.camera);
        newPlayer.setState(playerData);
        this.otherPlayers.set(playerData.id, newPlayer);
    }

    onPlayerLeft(playerId) {
        console.log('Player left:', playerId);
        const otherPlayer = this.otherPlayers.get(playerId);
        if (otherPlayer) {
            otherPlayer.dispose();
            this.otherPlayers.delete(playerId);
        }
    }

    onPlayerShot({ shooterId, position, direction, isPropelShot }) {
        // Visual/Audio feedback for a shot
        // Position is where the shot originated (e.g., gun barrel)
        // Direction is a normalized vector
        
        // Play gunshot sound from the shooter's position
        if (this.gunshotSound) {
            let soundSourcePlayer = null;
            if (this.player && shooterId === this.player.id) {
                // If local player shot, play sound from their camera/gun
                // this.firstPersonGun.add(this.gunshotSound); // Attach to gun if not already
                // this.gunshotSound.play(); 
                // For simplicity if FP gun is child of camera, audio listener on camera works well
                // No, positional sound needs an object in the world.
                // Let's play it from player model even for local player, or from camera.
                const tempSoundEmitter = new THREE.Object3D();
                tempSoundEmitter.position.copy(this.camera.getWorldPosition(new THREE.Vector3()));
                this.scene.add(tempSoundEmitter);
                tempSoundEmitter.add(this.gunshotSound);
                if (this.gunshotSound.isPlaying) this.gunshotSound.stop();
                this.gunshotSound.play();
                this.scene.remove(tempSoundEmitter); // Clean up

            } else {
                soundSourcePlayer = this.otherPlayers.get(shooterId);
                if (soundSourcePlayer && soundSourcePlayer.model) {
                    // Add the sound to the player model and play it
                    soundSourcePlayer.model.add(this.gunshotSound);
                     if (this.gunshotSound.isPlaying) this.gunshotSound.stop(); // Ensure only one plays
                    this.gunshotSound.play();
                }
            }
        }

        // Create a bullet tracer effect (optional)
        const tracerMaterial = new THREE.LineBasicMaterial({ color: 0xffff00, transparent: true, opacity: 0.7 });
        const endPoint = new THREE.Vector3().copy(position).add(new THREE.Vector3().copy(direction).multiplyScalar(100)); // 100 units long
        const points = [position, endPoint];
        const tracerGeometry = new THREE.BufferGeometry().setFromPoints(points);
        const tracerLine = new THREE.Line(tracerGeometry, tracerMaterial);
        this.scene.add(tracerLine);
        setTimeout(() => {
            this.scene.remove(tracerLine);
            tracerMaterial.dispose();
            tracerGeometry.dispose();
        }, 100); // Tracer visible for 100ms
    }

    onPlayerHit({ targetId, newHealth, hitPosition }) {
        // Visual feedback on the player who was hit
        let targetPlayer = null;
        if (this.player && targetId === this.player.id) {
            targetPlayer = this.player;
            this.ui.updateHUD({ health: newHealth });
            // Screen shake or red flash effect for local player
            document.body.style.animation = 'hitShake 0.2s ease-out';
            setTimeout(() => document.body.style.animation = '', 200);
        } else {
            targetPlayer = this.otherPlayers.get(targetId);
        }

        if (targetPlayer) {
            targetPlayer.onHitEffect(); // e.g., tint red
        }
        
        // Particle effect at hitPosition (optional)
        // For now, simple console log
        // console.log(`Player ${targetId} hit at`, hitPosition, `new health: ${newHealth}`);
    }

    onPlayerDied({ playerId, killerName, position }) {
        this.ui.addChatMessage({ system: true, message: `${this.otherPlayers.get(playerId)?.name || (this.player.id === playerId ? this.player.name : 'Someone')} was killed by ${killerName}.` });

        if (this.player && playerId === this.player.id) {
            this.isDead = true;
            this.ui.showDeathMessage(killerName);
            // Disable controls, show respawn message, etc.
            if (this.characterControls) this.characterControls.enabled = false; // Add an 'enabled' flag to controls
        } else {
            const deadPlayer = this.otherPlayers.get(playerId);
            if (deadPlayer) {
                // Could play a death animation or remove model temporarily
                // For now, they just stay until server stops sending them or respawns
            }
        }

        // Explosion/Shockwave visual effect at 'position'
        const shockwaveGeometry = new THREE.SphereGeometry(0.5, 16, 8); // Start small
        const shockwaveMaterial = new THREE.MeshBasicMaterial({ 
            color: 0xff8800, 
            transparent: true, 
            opacity: 0.8 
        });
        const shockwaveMesh = new THREE.Mesh(shockwaveGeometry, shockwaveMaterial);
        shockwaveMesh.position.set(position.x, position.y, position.z);
        this.scene.add(shockwaveMesh);

        let expansionRate = 0;
        const maxRadius = 15;
        const duration = 500; // ms
        const startTime = Date.now();

        const animateShockwave = () => {
            const elapsedTime = Date.now() - startTime;
            if (elapsedTime < duration) {
                const progress = elapsedTime / duration;
                const currentRadius = maxRadius * progress;
                shockwaveMesh.scale.set(currentRadius, currentRadius, currentRadius);
                shockwaveMaterial.opacity = 0.8 * (1 - progress); // Fade out
                requestAnimationFrame(animateShockwave);
            } else {
                this.scene.remove(shockwaveMesh);
                shockwaveGeometry.dispose();
                shockwaveMaterial.dispose();
            }
        };
        animateShockwave();
    }

    onRespawn(playerData) {
        if (!this.player || !this.characterControls) return;
        
        if (playerData.id === this.player.id) {
            this.isDead = false;
            this.ui.hideDeathMessage();
            this.player.setState(playerData); // Update health, etc.
            this.ui.updateHUD(playerData);
            const respawnPosition = new THREE.Vector3(playerData.position.x, playerData.position.y, playerData.position.z);
            this.characterControls.teleport(respawnPosition);
            if (this.characterControls) this.characterControls.enabled = true; // Re-enable controls
            console.log("Respawned at", respawnPosition);
        } else {
            // If another player respawns, their GameStateUpdate will handle new position.
            const otherPlayer = this.otherPlayers.get(playerData.id);
            if (otherPlayer) {
                otherPlayer.setState(playerData); // Ensure their state is fresh
            }
        }
    }
    
    onLeaderboardUpdate(leaderboardData) {
        // This is received continuously. We only update the UI if it's visible.
        if (this.showingLeaderboard && !this.isRoundOverUIActive) {
            this.ui.toggleLeaderboard(true, leaderboardData);
        }
        this.currentLeaderboardData = leaderboardData; // Store for when 'L' is pressed
    }

    onRoundOver(data) {
        console.log("Round Over:", data);
        this.isRoundOverUIActive = true;
        this.ui.showRoundOver(data); // data includes winner and final leaderboard
        if (this.characterControls) {
            this.characterControls.enabled = false; // Disable controls during round over
            if (document.pointerLockElement) document.exitPointerLock();
        }
    }

    onNewRoundStarting(data) {
        console.log("New Round Starting:", data.mapInfo.name);
        this.isRoundOverUIActive = false;
        this.ui.hideRoundOver();
        this.ui.addChatMessage({ system: true, message: `New round starting on ${data.mapInfo.name}!` });

        // Players will be respawned by server (via 'respawn' or 'gameStateUpdate')
        // Reset local player state just in case
        if (this.player && this.characterControls) {
            this.isDead = false;
            this.ui.hideDeathMessage();
            this.characterControls.enabled = true;
            this.characterControls.requestPointerLock(); // Re-acquire pointer lock
        }
        this.ui.updateRoundTime(5 * 60); // Reset client display immediately
    }


    handleShoot(isPropelShot = false) {
        if (!this.player || !this.characterControls || this.isDead || this.ui.isChatting()) return;

        const cameraDirection = new THREE.Vector3();
        this.camera.getWorldDirection(cameraDirection);

        // Calculate shot origin (e.g., from camera or gun model tip)
        // For simplicity, let's use camera position + small offset forward
        const shotOrigin = new THREE.Vector3();
        this.camera.getWorldPosition(shotOrigin);
        shotOrigin.add(cameraDirection.clone().multiplyScalar(0.2)); // थोड़ा आगे से

        this.socket.emit('shoot', {
            direction: { x: cameraDirection.x, y: cameraDirection.y, z: cameraDirection.z },
            position: { x: shotOrigin.x, y: shotOrigin.y, z: shotOrigin.z },
            isPropelShot: isPropelShot
        });

        // Client-side recoil/animation for FP gun (optional)
        if (this.firstPersonGun && !isPropelShot) {
            // Simple recoil: briefly move gun back and up
            const originalPos = this.firstPersonGun.position.clone();
            const recoilAmount = 0.05;
            this.firstPersonGun.position.z += recoilAmount; // Move back
            this.firstPersonGun.position.y -= recoilAmount * 0.2; // slight dip for kick
            setTimeout(() => {
                if (this.firstPersonGun) this.firstPersonGun.position.copy(originalPos);
            }, 80);
        }
         if (this.firstPersonGun && isPropelShot) { // Different recoil for propel shot
            const originalPos = this.firstPersonGun.position.clone();
            const recoilAmount = 0.15;
            this.firstPersonGun.position.z += recoilAmount; // Move back more
            this.firstPersonGun.position.x += (Math.random() - 0.5) * 0.05; // Bit of sideways kick
            setTimeout(() => {
                if (this.firstPersonGun) this.firstPersonGun.position.copy(originalPos);
            }, 150);
        }
    }

    handleGlobalKeyDown(event) {
        if (this.ui.isChatting()) return;

        if (event.key.toLowerCase() === 'l') {
            if (this.isRoundOverUIActive) return; // Don't toggle if round over screen is up
            this.showingLeaderboard = !this.showingLeaderboard;
            this.ui.toggleLeaderboard(this.showingLeaderboard, this.currentLeaderboardData);
        }
        if (event.code === 'KeyE') { // E key for propel shot
            this.handleShoot(true); // true for propel shot
        }
    }

    animate(time) {
        // time is provided by requestAnimationFrame, can be used for deltaTime calculation
        const deltaTime = Math.min(0.05, (time - (this.lastFrameTime || 0)) / 1000); // Clamp delta
        this.lastFrameTime = time;

        if (this.player && this.characterControls && !this.isDead && !this.isRoundOverUIActive) {
            // Update character controls (which updates camera position/rotation)
            // Pass the local player's server-authoritative model position for the camera to follow
            this.characterControls.update(deltaTime, this.player.model.position); 
            this.characterControls.sendInputToServer(); // Send input at render rate or a fixed interval
        }
        
        // Update other player models
        this.otherPlayers.forEach(p => p.update(deltaTime));

        // Update local player model (if it's a separate 3rd person model)
        if (this.player) {
            this.player.update(deltaTime); 
            // If local player model is visible, ensure its rotation matches camera yaw.
            // Pitch is usually not applied to full body model, but to an upper body bone.
            if(this.player.playerMesh && this.characterControls) {
                this.player.model.rotation.y = this.characterControls.yawObject.rotation.y;
                // If you have a head bone and want it to follow pitch:
                // const headBone = this.player.playerMesh.getObjectByName('HeadBoneName'); // Find your head bone
                // if(headBone) headBone.rotation.x = this.characterControls.pitchObject.rotation.x;
            }
        }

        // if (this.orbitControls) this.orbitControls.update(); // If using orbit controls for debug

        if (this.scene && this.camera) {
             this.renderer.render(this.scene, this.camera);
        }
    }
    
    onWindowResize() {
        if (this.camera && this.renderer) {
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(window.innerWidth, window.innerHeight);
        }
    }

    cleanupScene() {
        if (this.renderer) this.renderer.setAnimationLoop(null);

        this.otherPlayers.forEach(player => player.dispose());
        this.otherPlayers.clear();

        if (this.player) {
            this.player.dispose();
            this.player = null;
        }
        if (this.characterControls) {
            this.characterControls.dispose();
            this.characterControls = null;
        }
        if (this.firstPersonGun && this.firstPersonGun.parent) {
            this.firstPersonGun.parent.remove(this.firstPersonGun);
            // TODO: traverse and dispose geometry/material of FP gun
        }
        this.firstPersonGun = null;

        if (this.mapMesh && this.mapMesh.parent) {
            this.scene.remove(this.mapMesh);
            // TODO: traverse and dispose geometry/material of map
        }
        this.mapMesh = null;

        if (this.scene) {
            // Remove lights, etc.
            while(this.scene.children.length > 0){
                const child = this.scene.children[0];
                this.scene.remove(child);
                // TODO: If child is Mesh, dispose geometry and material
                // if (child instanceof THREE.Mesh) {
                //     if (child.geometry) child.geometry.dispose();
                //     if (child.material) {
                //         if (Array.isArray(child.material)) {
                //             child.material.forEach(m => m.dispose());
                //         } else {
                //             child.material.dispose();
                //         }
                //     }
                // }
            }
        }
        // this.scene = null; // Don't null out scene, camera, renderer if you intend to rejoin
        // this.camera = null;
        // if (this.renderer) {
        //     this.renderer.dispose(); // Full cleanup of WebGL context
        //     this.renderer = null;
        // }
        this.ui.hideGameUI();
        this.ui.showHomeMenu(); // Or a disconnect screen
        console.log("Client scene cleaned up.");
    }

}

// Initialize the game client when the script loads
window.addEventListener('DOMContentLoaded', () => {
    const game = new GameClient();

    // Mouse click listener for shooting (only when pointer is locked and not chatting)
    document.addEventListener('mousedown', (event) => {
        if (event.button === 0 && // Left mouse button
            game.characterControls && 
            game.characterControls.isPointerLocked && 
            !game.ui.isChatting() &&
            !game.isDead &&
            !game.isRoundOverUIActive) {
            game.handleShoot(false); // false for normal shot
        }
    });
});

// CSS for screen shake on hit
const style = document.createElement('style');
style.innerHTML = `
@keyframes hitShake {
  0% { transform: translate(0, 0) rotate(0deg); }
  10% { transform: translate(-1px, -2px) rotate(-0.5deg); }
  20% { transform: translate(-3px, 0px) rotate(0.5deg); }
  30% { transform: translate(3px, 2px) rotate(0deg); }
  40% { transform: translate(1px, -1px) rotate(0.5deg); }
  50% { transform: translate(-1px, 2px) rotate(-0.5deg); }
  60% { transform: translate(-3px, 1px) rotate(0deg); }
  70% { transform: translate(3px, 1px) rotate(-0.5deg); }
  80% { transform: translate(-1px, -1px) rotate(0.5deg); }
  90% { transform: translate(1px, 2px) rotate(0deg); }
  100% { transform: translate(0, 0) rotate(0deg); }
}
body.hit { /* You could add a class to body on hit instead of direct style.animation */
    /* background-color: rgba(255,0,0,0.2) !important; */ /* Red flash idea */
}
`;
document.head.appendChild(style);
