// docs/main.js

// --- Configuration ---
const SERVER_URL = 'https://gametest-psxl.onrender.com';
const MAP_PATH = 'assets/maps/map.glb';
const SOUND_PATH_GUNSHOT = 'assets/maps/gunshot.wav'; // User specified path
const PLAYER_MODEL_PATH = 'assets/maps/Shawty1.glb'; // User specified path

const PLAYER_HEIGHT = 1.8;
const PLAYER_RADIUS = 0.4;
const MOVEMENT_SPEED = 5.0;
const MOVEMENT_SPEED_SPRINTING = 8.0;
const BULLET_SPEED = 50;
const GRAVITY = 19.62; // meters per second squared
const JUMP_FORCE = 8.0; // Initial upward velocity
const VOID_Y_LEVEL = -30; // Y level below which player dies
const PLAYER_COLLISION_RADIUS = PLAYER_RADIUS;
const KILL_MESSAGE_DURATION = 4000; // milliseconds
const BULLET_LIFETIME = 3000; // ms for bullet to exist

// --- Global Variables ---
// Game State
let gameState = 'loading'; // 'loading', 'homescreen', 'joining', 'playing'
let assetsReady = false; // Flag for map and player model loaded status
let mapLoadState = 'loading'; // 'loading', 'loaded', 'error'
let playerModelLoadState = 'loading'; // 'loading', 'loaded', 'error'
let socket;
let localPlayerId = null;
let localPlayerName = 'Anonymous';
let localPlayerPhrase = '...';
let players = {}; // Stores data for all players { id: { mesh, x, y, z, rotationY, health, name, phrase, targetPosition, targetRotationY } }
let bullets = []; // Stores active bullets { id, mesh, velocity, ownerId, spawnTime }
let keys = {}; // Tracks currently pressed keys { KeyW: true, ShiftLeft: false, ... }

// Three.js Core
let scene, camera, renderer, controls, clock, loader, dracoLoader;
let mapMesh = null;
let playerModel = null; // Store the template player model

// Physics (local player only)
let velocityY = 0;
let isOnGround = false;

// UI Elements (Declare vars, get references in init)
let loadingScreen, homeScreen, gameUI, playerCountSpan, playerNameInput, playerPhraseInput, joinButton, homeScreenError, infoDiv, healthBarFill, healthText, killMessageDiv;
let killMessageTimeout = null;

// Sound
let gunshotSound;

// ========================================================
// FUNCTION DEFINITIONS (Define ALL before init)
// ========================================================

// --- Input Handling ---
function onKeyDown(event) {
    keys[event.code] = true;
    if (event.code === 'Space') {
        event.preventDefault(); // Prevent page scroll
        if (isOnGround && gameState === 'playing') {
            velocityY = JUMP_FORCE;
            isOnGround = false;
        }
    }
}

function onKeyUp(event) {
    keys[event.code] = false;
}

function onMouseDown(event) {
    console.log(`Mouse down event. State: ${gameState}, Locked: ${controls?.isLocked}, Button: ${event.button}`); // Debug log
    if (gameState === 'playing' && controls?.isLocked && event.button === 0) {
        shoot();
    }
}

// --- UI State Management ---
function setGameState(newState, options = {}) {
    console.log(`Setting game state to: ${newState}`, options);
    const previousState = gameState;

    loadingScreen = loadingScreen || document.getElementById('loadingScreen');
    homeScreen = homeScreen || document.getElementById('homeScreen');
    gameUI = gameUI || document.getElementById('gameUI');
    const canvas = document.getElementById('gameCanvas');

    if (gameState === newState && !(newState === 'loading' && options.error)) {
        // console.warn(`Already in state: ${newState}. Ignoring redundant call.`);
        return;
    }
    gameState = newState;

    if(loadingScreen) { loadingScreen.style.display = 'none'; loadingScreen.classList.remove('assets', 'error'); const p = loadingScreen.querySelector('p'); if(p) p.style.color = ''; }
    if(homeScreen) { homeScreen.style.display = 'none'; homeScreen.classList.remove('visible'); }
    if(gameUI) { gameUI.style.display = 'none'; gameUI.classList.remove('visible'); }
    if(canvas) canvas.style.display = 'none';

    switch (newState) {
        case 'loading':
            if(loadingScreen) {
                loadingScreen.style.display = 'flex';
                const p = loadingScreen.querySelector('p');
                if (p) p.innerHTML = options.message || 'Loading...';
                if (options.assets) loadingScreen.classList.add('assets');
                if (options.error && p) {
                     p.style.color = '#e74c3c';
                     loadingScreen.classList.add('error');
                }
            }
            break;
        case 'homescreen':
             if(homeScreen) {
                homeScreen.style.display = 'flex';
                requestAnimationFrame(() => { homeScreen.classList.add('visible'); }); // Fade in
                playerCountSpan = playerCountSpan || document.getElementById('playerCount');
                if(playerCountSpan) playerCountSpan.textContent = options.playerCount ?? playerCountSpan.textContent ?? '?'; // Update count safely
                if (controls?.isLocked) {
                    console.log("Unlocking controls for homescreen state.");
                    controls.unlock();
                }
                const playerControlsObject = scene?.getObjectByName("PlayerControls");
                if (playerControlsObject) {
                    console.log("Removing player controls from scene for homescreen.");
                    scene.remove(playerControlsObject);
                }
                joinButton = joinButton || document.getElementById('joinButton');
                if(joinButton) {
                    // Ensure Join button is re-enabled
                    joinButton.disabled = false;
                    joinButton.textContent = "Join Game";
                    console.log("Join button re-enabled for homescreen.");
                }
            }
            break;
        case 'joining':
             joinButton = joinButton || document.getElementById('joinButton');
             if(joinButton) {
                joinButton.disabled = true;
                joinButton.textContent = "Joining...";
             }
             if(options.waitingForAssets) {
                 // Re-use 'loading' state visually
                 setGameState('loading', { message: "Loading Assets...", assets: true });
             }
             // Otherwise, stay visually on homescreen (button disabled)
            break;
        case 'playing':
            console.log(">>> Setting state to PLAYING");
            const canvasElem = document.getElementById('gameCanvas');

            if(gameUI) {
                gameUI.style.display = 'block';
                requestAnimationFrame(() => { gameUI.classList.add('visible'); });
                console.log(">>> Game UI display set to block, visibility triggered.");
            } else { console.error(">>> gameUI element not found!"); }

            if(canvasElem) {
                 canvasElem.style.display = 'block';
                 console.log(">>> Canvas display set to block.");
            } else { console.error(">>> gameCanvas element not found!"); }

            if (scene && controls) {
                if (!scene.getObjectByName("PlayerControls")) {
                    console.log(">>> Adding player controls object to scene.");
                    controls.getObject().name = "PlayerControls";
                    scene.add(controls.getObject());
                } else {
                     console.log(">>> Player controls object already in scene.");
                }
                 console.log(">>> Position Check - Camera:", camera?.position.toArray());
                 console.log(">>> Position Check - Controls Object:", controls?.getObject()?.position.toArray());

                console.log(">>> Attempting controls.lock()...");
                 setTimeout(() => { if(gameState === 'playing' && !controls.isLocked) controls.lock(); }, 100);
            } else { console.error(">>> Scene or Controls not ready when setting state to playing!");}

            onWindowResize();
            console.log(">>> Game state set to PLAYING complete.");
            break;
    }
     console.log(`Switched state from ${previousState} to ${gameState}`);
}


// --- Asset Loading ---
function loadSound() {
     try {
        gunshotSound = new Audio(SOUND_PATH_GUNSHOT);
        gunshotSound.volume = 0.4;
        gunshotSound.preload = 'auto';
        gunshotSound.load();
        console.log("Gunshot sound object created.");
    } catch(e) {
        console.error("Could not create Audio object for gunshot:", e);
        gunshotSound = null;
    }
}

function loadPlayerModel() {
    playerModelLoadState = 'loading';
    console.log(`Loading player model from: ${PLAYER_MODEL_PATH}`);
    loader.load(PLAYER_MODEL_PATH, (gltf) => {
        console.log("Player model loaded successfully!");
        playerModel = gltf.scene;
        playerModel.traverse((child) => { if (child.isMesh) { child.castShadow = true; } });
        playerModelLoadState = 'loaded';
        checkAssetsReady();
    }, undefined, (error) => {
        console.error("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
        console.error("!!! FATAL: Error loading player model:", error);
        console.error("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
        if (error instanceof ErrorEvent) { console.error("Network/ErrorEvent details:", error.message); }
        else if (error instanceof ProgressEvent) { console.error("ProgressEvent indicates likely network failure (e.g., 404). Check Network tab!"); }
        playerModelLoadState = 'error';
        checkAssetsReady();
    });
}

function loadMap(mapPath) {
    mapLoadState = 'loading';
    console.log(`Loading map from: ${mapPath}`);
    loader.load(
        mapPath,
        (gltf) => {
            console.log("Map loaded successfully!");
            mapMesh = gltf.scene;
            mapMesh.traverse((child) => {
                if (child.isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                    child.userData.isCollidable = true;
                }
            });
            scene.add(mapMesh);
            mapLoadState = 'loaded';
            checkAssetsReady();
        },
        (xhr) => { /* Progress */ },
        (error) => {
            console.error("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
            console.error(`!!! FATAL: Error loading map (${mapPath}):`, error);
            console.error("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
            if (error instanceof ErrorEvent) { console.error("Network/ErrorEvent details:", error.message); }
            else if (error instanceof ProgressEvent) { console.error("ProgressEvent indicates likely network failure (e.g., 404). Check Network tab!"); }
            mapLoadState = 'error';
            checkAssetsReady();
        }
    );
}

function checkAssetsReady() {
    console.log(`checkAssetsReady: Map=${mapLoadState}, Model=${playerModelLoadState}`);
    if ((mapLoadState === 'loaded' || mapLoadState === 'error') &&
        (playerModelLoadState === 'loaded' || playerModelLoadState === 'error'))
    {
        if (mapLoadState === 'error' || playerModelLoadState === 'error') {
            assetsReady = false;
            console.error("Critical asset loading failed. Setting permanent error state.");
            setGameState('loading', { message: "FATAL: Asset Load Error!<br/>Check Console (F12).", error: true });
        } else {
            assetsReady = true;
            console.log("Assets ready.");
            if (socket?.connected && gameState === 'loading') {
                console.log("Assets ready and socket connected. Showing homescreen.");
                setGameState('homescreen', { playerCount: playerCountSpan?.textContent ?? '?' });
            } else if (gameState === 'joining') {
                 console.log("Assets finished loading while joining, sending details to server.");
                 sendJoinDetails();
            }
        }
    } else {
        assetsReady = false;
    }
}

// --- Network & Joining ---
function setupSocketIO() {
    console.log(`Attempting to connect to server: ${SERVER_URL}`);
    socket = io(SERVER_URL, { transports: ['websocket'], autoConnect: true });

    socket.on('connect', () => {
        console.log('Socket connected! ID:', socket.id);
        checkAssetsReady(); // Check if assets ready now that socket is connected
    });

    socket.on('disconnect', (reason) => {
        console.warn('Disconnected from server! Reason:', reason);
        setGameState('homescreen', {playerCount: 0});
        infoDiv.textContent = 'Disconnected';
        for (const id in players) { removePlayerMesh(id); }
        players = {}; bullets = [];
    });

     socket.on('connect_error', (err) => {
        console.error('Connection Error:', err.message);
        mapLoadState = 'error'; playerModelLoadState = 'error'; assetsReady = false;
        setGameState('loading', { message: `Connection Failed!<br/>${err.message}`, error: true});
    });

    socket.on('playerCountUpdate', (count) => {
        console.log("Player count update received:", count);
        playerCountSpan = playerCountSpan || document.getElementById('playerCount');
        if (playerCountSpan) {
            playerCountSpan.textContent = count;
            console.log("Updated playerCountSpan text content.");
        } else { console.warn("playerCountSpan element not found when trying to update count."); }
        if (assetsReady && socket.connected && gameState === 'loading') {
            console.log("Assets ready and socket connected via playerCountUpdate. Showing homescreen.");
            setGameState('homescreen', { playerCount: count });
        }
    });

    socket.on('initialize', (data) => {
        console.log('Initialize received from server. Setting up local player...');
        localPlayerId = data.id;
        for (const id in players) { removePlayerMesh(id); }
        players = {}; bullets = [];

        let initialPlayerPosX = 0, initialPlayerPosY = 0, initialPlayerPosZ = 0;

        for (const id in data.players) {
            const playerData = data.players[id];
            if (id === localPlayerId) {
                players[id] = { ...playerData, name: localPlayerName, phrase: localPlayerPhrase, mesh: null };
                initialPlayerPosX = playerData.x; initialPlayerPosY = playerData.y; initialPlayerPosZ = playerData.z;
                const visualY = initialPlayerPosY + PLAYER_HEIGHT;
                if (controls?.getObject()) {
                    controls.getObject().position.set(initialPlayerPosX, visualY, initialPlayerPosZ);
                    console.log(`Set controls position based on server: X=${initialPlayerPosX}, Y=${visualY}, Z=${initialPlayerPosZ}`);
                } else { console.error("Controls object not found when trying to set initial position!"); }
                velocityY = 0; isOnGround = true;
                updateHealthBar(playerData.health);
                infoDiv.textContent = `Playing as ${localPlayerName}`;
            } else {
                addPlayer(playerData);
            }
        }
        console.log("Game initialized with players:", players);
        setGameState('playing'); // Transition state AFTER setup
    });

    // --- Standard Event Handlers ---
    socket.on('playerJoined', (playerData) => { handlePlayerJoined(playerData); });
    socket.on('playerLeft', (playerId) => { handlePlayerLeft(playerId); });
    socket.on('playerMoved', (playerData) => { updateRemotePlayerPosition(playerData); });
    socket.on('shotFired', (bulletData) => { spawnBullet(bulletData); });
    socket.on('healthUpdate', (data) => { handleHealthUpdate(data); });
    socket.on('playerDied', (data) => { handlePlayerDied(data); });
    socket.on('playerRespawned', (playerData) => { handlePlayerRespawned(playerData); });
}

function attemptJoinGame() {
    localPlayerName = playerNameInput.value.trim() || 'Anonymous';
    localPlayerPhrase = playerPhraseInput.value.trim() || '...';
    if (!localPlayerName) { homeScreenError.textContent = 'Please enter a name.'; return; }
    if (localPlayerPhrase.length > 20) { homeScreenError.textContent = 'Catchphrase too long (max 20 chars).'; return; }
    homeScreenError.textContent = '';

    console.log(`Attempting to join as "${localPlayerName}"`);
    setGameState('joining', { waitingForAssets: !assetsReady });

    if (assetsReady) {
        sendJoinDetails();
    } else {
        console.log("Waiting for assets to load before sending join details...");
    }
}

function sendJoinDetails() {
    if (socket?.connected && gameState === 'joining') {
        console.log("Sending player details to server.");
        socket.emit('setPlayerDetails', { name: localPlayerName, phrase: localPlayerPhrase });
    } else if (gameState !== 'joining') {
         console.warn("Attempted to send join details but no longer in 'joining' state.");
         setGameState('homescreen', {playerCount: playerCountSpan?.textContent ?? '?'});
    } else {
        console.error("Cannot send join details: Socket not connected.");
        homeScreenError.textContent = 'Connection issue. Cannot join.';
        setGameState('homescreen', {playerCount: playerCountSpan?.textContent ?? '?'});
    }
}


// --- Player Management & Model Loading ---
function addPlayer(playerData) {
    console.log(`Adding player ${playerData.id} (${playerData.name})`);
    if (players[playerData.id] || playerData.id === localPlayerId) return;

    players[playerData.id] = { ...playerData, mesh: null, targetPosition: null, targetRotationY: null };

    if (playerModel && playerModel !== 'error') {
        try {
            const modelInstance = playerModel.clone();
            console.log(`Cloned model for player ${playerData.id}`);

            // <<< --- ADJUST SCALING HERE --- >>>
            const desiredScale = 0.08; // START SMALL - ADJUST THIS VALUE
            modelInstance.scale.set(desiredScale, desiredScale, desiredScale);
            console.log(`Scaled model instance to ${desiredScale}`);
            // <<< ----------------------------- >>>

            modelInstance.traverse((child) => { if (child.isMesh) { child.castShadow = true; } });

            const visualY = playerData.y; // Assume model origin at feet
            modelInstance.position.set(playerData.x, visualY, playerData.z);
            modelInstance.rotation.y = playerData.rotationY;
            scene.add(modelInstance);
            players[playerData.id].mesh = modelInstance;
            players[playerData.id].targetPosition = modelInstance.position.clone();
            players[playerData.id].targetRotationY = modelInstance.rotation.y;
        } catch (e) {
            console.error(`Error cloning/adding model for ${playerData.id}:`, e);
            addPlayerFallbackMesh(playerData);
        }
    } else {
        console.warn(`Player model not ready/failed, using fallback for ${playerData.id}`);
        addPlayerFallbackMesh(playerData);
    }
}

function addPlayerFallbackMesh(playerData) {
     if (!players[playerData.id] || players[playerData.id].mesh) return;
     console.warn(`Using fallback mesh for player ${playerData.id}`);
     try {
         const geometry = new THREE.CylinderGeometry(PLAYER_RADIUS, PLAYER_RADIUS, PLAYER_HEIGHT, 8);
         const material = new THREE.MeshStandardMaterial({ color: 0xff00ff }); // Magenta fallback
         const mesh = new THREE.Mesh(geometry, material);
         mesh.castShadow = true;
         const visualY = playerData.y + (PLAYER_HEIGHT / 2);
         mesh.position.set(playerData.x, visualY, playerData.z);
         mesh.rotation.y = playerData.rotationY;
         scene.add(mesh);
         players[playerData.id].mesh = mesh;
         players[playerData.id].targetPosition = mesh.position.clone();
         players[playerData.id].targetRotationY = mesh.rotation.y;
     } catch(e) { console.error(`Error creating fallback mesh for ${playerData.id}:`, e); }
}

function removePlayerMesh(playerId) {
    if (players[playerId] && players[playerId].mesh) {
        try {
            scene.remove(players[playerId].mesh);
            if (players[playerId].mesh.geometry) players[playerId].mesh.geometry.dispose();
            if (players[playerId].mesh.material) {
                 if (Array.isArray(players[playerId].mesh.material)) {
                     players[playerId].mesh.material.forEach(m => m.dispose());
                 } else {
                     players[playerId].mesh.material.dispose();
                 }
            }
            console.log(`Removed mesh for player ${playerId}`);
        } catch (e) { console.error(`Error removing mesh for ${playerId}:`, e); }
        players[playerId].mesh = null;
    }
}

function updateRemotePlayerPosition(playerData) {
     if (playerData.id !== localPlayerId && players[playerData.id]) {
            const player = players[playerData.id];
            let visualY;
            if (player.mesh && player.mesh.geometry instanceof THREE.CylinderGeometry) {
                visualY = playerData.y + (PLAYER_HEIGHT / 2);
            } else {
                visualY = playerData.y; // Assume model origin at feet
            }
            player.targetPosition = new THREE.Vector3(playerData.x, visualY, playerData.z);
            player.targetRotationY = playerData.rotationY;
            player.x = playerData.x; player.y = playerData.y; player.z = playerData.z; player.rotationY = playerData.rotationY;
            player.name = playerData.name; player.phrase = playerData.phrase;
        }
}

// --- Game Logic Update Loop ---
function updatePlayer(deltaTime) {
    if (gameState !== 'playing' || !controls?.isLocked || !localPlayerId || !players[localPlayerId]) return;
    const playerObject = controls.getObject();
    const playerState = players[localPlayerId];
    if (!playerState || playerState.health <= 0) return;

    const currentSpeed = keys['ShiftLeft'] ? MOVEMENT_SPEED_SPRINTING : MOVEMENT_SPEED;
    const speed = currentSpeed * deltaTime;

    // Store previous position for collision checks/reversion
    const previousPosition = playerObject.position.clone();

    // Apply Gravity first
    velocityY -= GRAVITY * deltaTime;
    playerObject.position.y += velocityY * deltaTime;

    // Apply Horizontal Movement based on keys
    if (keys['KeyW']) { controls.moveForward(speed); } // Forward
    if (keys['KeyS']) { controls.moveForward(-speed); } // Backward
    if (keys['KeyA']) { controls.moveRight(-speed); } // Strafe Left
    if (keys['KeyD']) { controls.moveRight(speed); }  // Strafe Right

    // Collision Detection (Player-Player)
    const currentPosition = playerObject.position;
    for (const id in players) {
        if (id !== localPlayerId && players[id].mesh && players[id].mesh.visible) {
            const otherPlayerMesh = players[id].mesh;
            const distanceXZ = new THREE.Vector2(currentPosition.x - otherPlayerMesh.position.x, currentPosition.z - otherPlayerMesh.position.z).length();
            if (distanceXZ < PLAYER_COLLISION_RADIUS * 2) {
                console.log("Player collision - reverting horizontal move");
                playerObject.position.x = previousPosition.x;
                playerObject.position.z = previousPosition.z;
                playerObject.position.y = currentPosition.y; // Keep the Y after gravity/jump
                break; // Stop checking after first collision
            }
        }
    }

    // Ground Check & Correction
    // TODO: Replace with map raycasting
    let groundY = 0;
    if (playerObject.position.y < groundY + PLAYER_HEIGHT) {
        playerObject.position.y = groundY + PLAYER_HEIGHT;
        if (velocityY < 0) velocityY = 0;
        isOnGround = true;
    } else {
        isOnGround = false;
    }

    // Void Check
    if (playerObject.position.y < VOID_Y_LEVEL && playerState.health > 0) {
        console.log("Player fell into void");
        socket.emit('fellIntoVoid');
        playerState.health = 0;
        updateHealthBar(0);
        showKillMessage("You fell into the void.");
    }

    // Send Updates
    const logicalPosition = playerObject.position.clone();
    logicalPosition.y -= PLAYER_HEIGHT; // Feet position

    const lastSentState = players[localPlayerId];
    const positionChanged = logicalPosition.distanceToSquared(new THREE.Vector3(lastSentState?.x ?? 0, lastSentState?.y ?? 0, lastSentState?.z ?? 0)) > 0.001;
    const cameraRotation = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ');
    const currentRotationY = cameraRotation.y;
    const rotationChanged = Math.abs(currentRotationY - (lastSentState?.rotationY ?? 0)) > 0.01;

    if (positionChanged || rotationChanged) {
        if (lastSentState) {
            lastSentState.x = logicalPosition.x; lastSentState.y = logicalPosition.y; lastSentState.z = logicalPosition.z;
            lastSentState.rotationY = currentRotationY;
        }
        socket.emit('playerUpdate', { x: logicalPosition.x, y: logicalPosition.y, z: logicalPosition.z, rotationY: currentRotationY });
    }
}


// --- Shoot, Bullet, Interpolation, UI, Event Handlers ---
function shoot() {
    console.log("Attempting to shoot...");
    if (gameState !== 'playing' || !socket || !localPlayerId || !controls?.isLocked || !players[localPlayerId] || players[localPlayerId].health <= 0) {
         console.log(`Shoot conditions not met: State=${gameState}, Socket=${!!socket}, ID=${localPlayerId}, Locked=${controls?.isLocked}, PlayerData=${!!players[localPlayerId]}, Health=${players[localPlayerId]?.health}`);
         return;
    }

    if (gunshotSound) {
        try {
            const sound = gunshotSound.cloneNode();
            sound.volume = gunshotSound.volume;
            sound.play().catch(e => console.warn("Sound play failed:", e));
            console.log("Gunshot sound played (or attempted).");
        } catch (e) { console.error("Error playing gunshot sound:", e); }
    } else { console.warn("Gunshot sound not available."); }

    const bulletPosition = new THREE.Vector3();
    const bulletDirection = new THREE.Vector3();
    if (!camera) { console.error("Camera not found for shooting!"); return; }
    camera.getWorldPosition(bulletPosition); // Originates from camera position
    camera.getWorldDirection(bulletDirection);
    // bulletPosition.addScaledVector(bulletDirection, PLAYER_RADIUS * 1.1); // Optional offset

    console.log("Emitting 'shoot' event to server.");
    socket.emit('shoot', {
        position: { x: bulletPosition.x, y: bulletPosition.y, z: bulletPosition.z },
        direction: { x: bulletDirection.x, y: bulletDirection.y, z: bulletDirection.z }
    });
    console.log("Shoot event emitted.");
}

function spawnBullet(bulletData) {
    console.log(`Spawning bullet ${bulletData.bulletId} from ${bulletData.shooterId}`);
    const geometry = new THREE.SphereGeometry(0.1, 6, 6);
    const material = new THREE.MeshBasicMaterial({ color: 0xffff00 }); // Bright yellow
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(bulletData.position.x, bulletData.position.y, bulletData.position.z);
    console.log(`  Initial position: ${mesh.position.x.toFixed(2)}, ${mesh.position.y.toFixed(2)}, ${mesh.position.z.toFixed(2)}`);

    const velocity = new THREE.Vector3(
        bulletData.direction.x, bulletData.direction.y, bulletData.direction.z
    ).normalize().multiplyScalar(BULLET_SPEED);

    bullets.push({
        id: bulletData.bulletId, mesh: mesh, velocity: velocity,
        ownerId: bulletData.shooterId, spawnTime: Date.now()
    });
    scene.add(mesh); // Add bullet to the scene
    console.log(`  Bullet mesh added to scene.`);
}

function updateBullets(deltaTime) {
    const bulletsToRemoveIndexes = [];
    for (let i = bullets.length - 1; i >= 0; i--) {
        const bullet = bullets[i];
        if (!bullet || !bullet.mesh) { // Safety check
             if (!bulletsToRemoveIndexes.includes(i)) bulletsToRemoveIndexes.push(i); // Mark invalid entry for removal
             continue;
        }

        bullet.mesh.position.addScaledVector(bullet.velocity, deltaTime);
        let hitDetected = false;

        for (const playerId in players) {
            if (playerId !== bullet.ownerId && players[playerId].mesh && players[playerId].mesh.visible) {
                const playerMesh = players[playerId].mesh;
                // Use bounding sphere for simple check (adjust radius if model isn't centered well)
                const playerWorldPos = new THREE.Vector3();
                playerMesh.getWorldPosition(playerWorldPos); // Get world position of mesh center
                const distance = bullet.mesh.position.distanceTo(playerWorldPos);
                // Estimate player radius based on scale (use PLAYER_RADIUS as base)
                 const scaledPlayerRadius = (playerMesh.scale?.x || 1) * PLAYER_RADIUS;
                const collisionThreshold = scaledPlayerRadius + 0.1; // Scaled Player radius + bullet radius

                if (distance < collisionThreshold) {
                    console.log(`Client hit: Bullet ${bullet.id} hit Player ${playerId}`);
                    hitDetected = true;
                    if (bullet.ownerId === localPlayerId) {
                        socket.emit('hit', { targetId: playerId, damage: 10 });
                    }
                    if (!bulletsToRemoveIndexes.includes(i)) bulletsToRemoveIndexes.push(i);
                    scene.remove(bullet.mesh);
                    break;
                }
            }
        }
        if (hitDetected) continue;

        // TODO: Map collision check

        if (Date.now() - bullet.spawnTime > BULLET_LIFETIME) {
            if (!bulletsToRemoveIndexes.includes(i)) bulletsToRemoveIndexes.push(i);
            scene.remove(bullet.mesh);
        }
    }

    if (bulletsToRemoveIndexes.length > 0) {
         bulletsToRemoveIndexes.sort((a, b) => b - a);
         for (const index of bulletsToRemoveIndexes) {
             if (bullets[index]?.mesh) {
                 // scene.remove(bullets[index].mesh); // Already removed when hit/expired
             }
             bullets.splice(index, 1);
         }
    }
}

function updateOtherPlayers(deltaTime) { /* ... Same ... */ }
function updateHealthBar(health) { /* ... Same ... */ }
function showKillMessage(message) { /* ... Same ... */ }
function handlePlayerJoined(playerData) { /* ... Same ... */ }
function handlePlayerLeft(playerId) { /* ... Same ... */ }
function handleHealthUpdate(data) { /* ... Same ... */ }
function handlePlayerDied(data) { /* ... Same ... */ }
function handlePlayerRespawned(playerData) { /* ... Same ... */ }


// --- Animation Loop ---
function animate() {
    requestAnimationFrame(animate);
    const deltaTime = clock ? clock.getDelta() : 0.016;

    if (gameState === 'playing') {
        if (players[localPlayerId]) {
             updatePlayer(deltaTime);
        }
        updateBullets(deltaTime);
        updateOtherPlayers(deltaTime);
    }

    if (renderer && scene && camera) {
        try {
            renderer.render(scene, camera);
        } catch (e) { console.error("Render error:", e); }
    }
}


// --- Utility Functions ---
function onWindowResize() { /* ... Same ... */ }


// ========================================================
// INITIALIZATION FUNCTION DEFINITION
// ========================================================
function init() {
    console.log("Initializing Shawty...");
    // Get UI Elements & ADD NULL CHECKS
    loadingScreen = document.getElementById('loadingScreen');
    if (!loadingScreen) { console.error("CRITICAL ERROR: Cannot find element with ID 'loadingScreen'"); return; }

    homeScreen = document.getElementById('homeScreen');
     if (!homeScreen) { console.error("CRITICAL ERROR: Cannot find element with ID 'homeScreen'"); return; }

    gameUI = document.getElementById('gameUI');
     if (!gameUI) { console.error("CRITICAL ERROR: Cannot find element with ID 'gameUI'"); return; }

    playerCountSpan = document.getElementById('playerCount');
     if (!playerCountSpan) { console.error("CRITICAL ERROR: Cannot find element with ID 'playerCount'"); return; }

    playerNameInput = document.getElementById('playerNameInput');
     if (!playerNameInput) { console.error("CRITICAL ERROR: Cannot find element with ID 'playerNameInput'"); return; }

    playerPhraseInput = document.getElementById('playerPhraseInput');
     if (!playerPhraseInput) { console.error("CRITICAL ERROR: Cannot find element with ID 'playerPhraseInput'"); return; }

    joinButton = document.getElementById('joinButton');
     if (!joinButton) { console.error("CRITICAL ERROR: Cannot find element with ID 'joinButton'"); return; }

    homeScreenError = document.getElementById('homeScreenError');
     if (!homeScreenError) { console.error("CRITICAL ERROR: Cannot find element with ID 'homeScreenError'"); return; }

    infoDiv = document.getElementById('info');
     if (!infoDiv) { console.error("CRITICAL ERROR: Cannot find element with ID 'info'"); return; }

    healthBarFill = document.getElementById('healthBarFill');
     if (!healthBarFill) { console.error("CRITICAL ERROR: Cannot find element with ID 'healthBarFill'"); return; }

    healthText = document.getElementById('healthText');
     if (!healthText) { console.error("CRITICAL ERROR: Cannot find element with ID 'healthText'"); return; }

    killMessageDiv = document.getElementById('killMessage');
     if (!killMessageDiv) { console.error("CRITICAL ERROR: Cannot find element with ID 'killMessage'"); return; }

    const canvas = document.getElementById('gameCanvas');
     if (!canvas) { console.error("CRITICAL ERROR: Cannot find element with ID 'gameCanvas'"); return; }
     console.log("All required UI elements found.");

    // Set Initial UI State
    setGameState('loading');

    // Basic Three.js Scene Setup
    try {
        scene = new THREE.Scene();
        scene.background = new THREE.Color(0x87ceeb);
        scene.fog = new THREE.Fog(0x87ceeb, 0, 150);
        camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.shadowMap.enabled = true;
        clock = new THREE.Clock();
        loader = new THREE.GLTFLoader();
        dracoLoader = new THREE.DRACOLoader();
        dracoLoader.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/libs/draco/');
        dracoLoader.setDecoderConfig({ type: 'js' });
        loader.setDRACOLoader(dracoLoader);
        console.log("Three.js core initialized.");
    } catch (e) {
        console.error("CRITICAL ERROR during Three.js initialization:", e);
        setGameState('loading', {message: "FATAL: Graphics Init Error!<br/>Check Console.", error: true});
        return;
    }

    // Lighting
    try {
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        scene.add(ambientLight);
        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.9);
        directionalLight.position.set(10, 15, 10);
        directionalLight.castShadow = true;
        directionalLight.shadow.mapSize.width = 1024;
        directionalLight.shadow.mapSize.height = 1024;
        scene.add(directionalLight);
        console.log("Lighting added.");
    } catch(e) {
        console.error("Error adding lighting:", e);
         setGameState('loading', {message: "FATAL: Graphics Init Error (Light)!<br/>Check Console.", error: true});
        return;
    }

    // Controls
    try {
        controls = new THREE.PointerLockControls(camera, document.body);
        controls.addEventListener('lock', () => console.log('Pointer Locked'));
        // --- ADJUSTED UNLOCK LISTENER ---
        controls.addEventListener('unlock', () => {
            console.log('Pointer Unlocked (Escape pressed?)');
            // If playing, go back to the homescreen state cleanly
            if (gameState === 'playing') {
                console.log("Pointer unlocked during play, returning to homescreen.");
                setGameState('homescreen', { playerCount: playerCountSpan?.textContent ?? '?' });
            }
        });
        // --------------------------------
        console.log("PointerLockControls initialized.");
    } catch (e) {
         console.error("CRITICAL ERROR initializing PointerLockControls:", e);
         setGameState('loading', {message: "FATAL: Controls Init Error!<br/>Check Console.", error: true});
        return;
    }

    // Start Loading Assets & Connecting
    console.log("Starting asset loading and socket connection...");
    loadSound();
    loadPlayerModel();
    loadMap(MAP_PATH);
    setupSocketIO();

    // Add Event Listeners
    console.log("Adding event listeners...");
    joinButton?.addEventListener('click', attemptJoinGame);
    window.addEventListener('resize', onWindowResize);
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    document.addEventListener('mousedown', onMouseDown);
    console.log("Event listeners added.");

    // Start animation loop
    console.log("Starting animation loop.");
    animate();
}

// ========================================================
// --- START THE APPLICATION (Call init) ---
// ========================================================
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
