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

// Frame counter for throttled logging
let frameCount = 0;


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
    // If not playing or pointer isn't locked, attempt to lock pointer on click
    if (gameState === 'playing' && !controls?.isLocked) {
        controls?.lock();
    }
    // Shoot only if playing, locked, and left mouse
    else if (gameState === 'playing' && controls?.isLocked && event.button === 0) {
        shoot();
    }
}

// --- UI State Management ---
function setGameState(newState, options = {}) {
    console.log(`Setting game state to: ${newState}`, options);
    const previousState = gameState;

    // Ensure UI elements refs are available
    loadingScreen = loadingScreen || document.getElementById('loadingScreen');
    homeScreen = homeScreen || document.getElementById('homeScreen');
    gameUI = gameUI || document.getElementById('gameUI');
    const canvas = document.getElementById('gameCanvas');

    // Prevent redundant state changes unless it's an error update for loading screen
    if (gameState === newState && !(newState === 'loading' && options.error)) {
        // console.warn(`Already in state: ${newState}. Ignoring redundant call.`);
        return;
    }
    gameState = newState;

    // Hide all sections first
    if(loadingScreen) { loadingScreen.style.display = 'none'; loadingScreen.classList.remove('assets', 'error'); const p = loadingScreen.querySelector('p'); if(p) p.style.color = ''; }
    if(homeScreen) { homeScreen.style.display = 'none'; homeScreen.classList.remove('visible'); }
    if(gameUI) { gameUI.style.display = 'none'; gameUI.classList.remove('visible'); }
    if(canvas) canvas.style.display = 'none';

    // Show the target section
    switch (newState) {
        case 'loading':
            if(loadingScreen) {
                loadingScreen.style.display = 'flex';
                const p = loadingScreen.querySelector('p');
                if (p) p.innerHTML = options.message || 'Loading...';
                if (options.assets) loadingScreen.classList.add('assets');
                if (options.error && p) {
                     p.style.color = '#e74c3c'; // Red error text
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
                    console.log("Unlocking controls explicitly for homescreen state.");
                    controls.unlock(); // This should NOT trigger the state change now
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
            // *** DEBUGGING LOGS from previous step (can be removed if working) ***
            console.log(">>> Setting state to PLAYING");
            const canvasElem = document.getElementById('gameCanvas');

            if(gameUI) {
                gameUI.style.display = 'block'; // Make UI container visible
                requestAnimationFrame(() => { gameUI.classList.add('visible'); }); // Fade in
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
                 console.log(">>> Position Check - Camera:", camera?.position.toArray()); // Log array form
                 console.log(">>> Position Check - Controls Object:", controls?.getObject()?.position.toArray()); // Log array form

                console.log(">>> Attempting controls.lock()...");
                 // Use timeout to help ensure browser is ready for lock after state change/render
                 setTimeout(() => { if(gameState === 'playing' && !controls.isLocked) controls.lock(); }, 100); // 100ms delay
            } else { console.error(">>> Scene or Controls not ready when setting state to playing!");}

            onWindowResize(); // Ensure size is correct
            console.log(">>> Game state set to PLAYING complete.");
            // *** END DEBUGGING SECTION ***
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
    loader.load(PLAYER_MODEL_PATH,
    (gltf) => { // SUCCESS CALLBACK
        console.log(">>> Player model SUCCESS callback entered."); // <--- DETAILED LOG
        playerModel = gltf.scene;
        playerModel.traverse((child) => { if (child.isMesh) { child.castShadow = true; } });
        playerModelLoadState = 'loaded';
        checkAssetsReady();
    },
    undefined, // Progress callback (optional)
    (error) => { // ERROR CALLBACK
        console.error("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
        console.error("!!! >>> Player model ERROR callback entered."); // <--- DETAILED LOG
        console.error("!!! FATAL: Error loading player model:", error);
        console.error("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
        if (error instanceof ErrorEvent) { console.error("Network/ErrorEvent details:", error.message); }
        else if (error instanceof ProgressEvent) { console.error("ProgressEvent indicates likely network failure (e.g., 404). Check Network tab!"); }
        playerModelLoadState = 'error';
        checkAssetsReady(); // Important to call checkAssetsReady even on error
    });
}

function loadMap(mapPath) {
    mapLoadState = 'loading';
    console.log(`Loading map from: ${mapPath}`);
    loader.load(
        mapPath,
        (gltf) => { // SUCCESS CALLBACK
            console.log(">>> Map SUCCESS callback entered."); // <--- DETAILED LOG
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
        (error) => { // ERROR CALLBACK
            console.error("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
            console.error(`!!! >>> Map ERROR callback entered (${mapPath}):`); // <--- DETAILED LOG
            console.error(`!!! FATAL: Error loading map (${mapPath}):`, error);
            console.error("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
            if (error instanceof ErrorEvent) { console.error("Network/ErrorEvent details:", error.message); }
            else if (error instanceof ProgressEvent) { console.error("ProgressEvent indicates likely network failure (e.g., 404). Check Network tab!"); }
            mapLoadState = 'error';
            checkAssetsReady(); // Important to call checkAssetsReady even on error
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
        assetsReady = false; // Still waiting
    }
}

// --- Network & Joining ---
function setupSocketIO() {
    console.log(`Attempting to connect to server: ${SERVER_URL}`);
    socket = io(SERVER_URL, { transports: ['websocket'], autoConnect: true });

    socket.on('connect', () => {
        console.log(">>> Socket CONNECT callback entered!"); // <--- DETAILED LOG
        console.log('Socket connected! ID:', socket.id);
        checkAssetsReady(); // Check if assets ready now that socket is connected
        if (gameState === 'homescreen' && playerCountSpan && playerCountSpan.textContent === '?') {
            console.log("Connected, on homescreen, but count is still '?'. Waiting for update.");
        }
    });

    socket.on('disconnect', (reason) => {
        console.warn('Disconnected from server! Reason:', reason);
        setGameState('homescreen', {playerCount: 0});
        infoDiv.textContent = 'Disconnected';
        for (const id in players) { removePlayerMesh(id); }
        players = {}; bullets = [];
    });

     socket.on('connect_error', (err) => {
        console.error(">>> Socket CONNECT_ERROR callback entered."); // <--- DETAILED LOG
        console.error('Connection Error:', err.message);
        mapLoadState = 'error'; playerModelLoadState = 'error'; assetsReady = false;
        setGameState('loading', { message: `Connection Failed!<br/>${err.message}`, error: true});
    });

    socket.on('playerCountUpdate', (count) => {
        console.log("Player count update received:", count);
        playerCountSpan = playerCountSpan || document.getElementById('playerCount');
        if (playerCountSpan) {
            playerCountSpan.textContent = count;
            // console.log("Updated playerCountSpan text content."); // Reduce noise
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
            const desiredScale = 0.3; // <<< ADJUST THIS AS NEEDED
            modelInstance.scale.set(desiredScale, desiredScale, desiredScale);
            modelInstance.traverse((child) => { if (child.isMesh) { child.castShadow = true; } });
            const visualY = playerData.y;
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

function addPlayerFallbackMesh(playerData) { /* ... Same ... */ }
function removePlayerMesh(playerId) { /* ... Same ... */ }
function updateRemotePlayerPosition(playerData) { /* ... Same ... */ }

// --- Game Logic Update Loop ---
function updatePlayer(deltaTime) {
    if (gameState !== 'playing' || !controls?.isLocked || !localPlayerId || !players[localPlayerId]) return;
    const playerObject = controls.getObject();
    const playerState = players[localPlayerId];
    if (!playerState || playerState.health <= 0) return;

    const currentSpeed = keys['ShiftLeft'] ? MOVEMENT_SPEED_SPRINTING : MOVEMENT_SPEED;
    const speed = currentSpeed * deltaTime;

    const previousPosition = playerObject.position.clone();

    velocityY -= GRAVITY * deltaTime;
    playerObject.position.y += velocityY * deltaTime;

    if (keys['KeyW']) { controls.moveForward(speed); }
    if (keys['KeyS']) { controls.moveForward(-speed); }
    if (keys['KeyA']) { controls.moveRight(-speed); }
    if (keys['KeyD']) { controls.moveRight(speed); }

    const currentPosition = playerObject.position;
    for (const id in players) {
        if (id !== localPlayerId && players[id].mesh && players[id].mesh.visible) {
            const otherPlayerMesh = players[id].mesh;
            const distanceXZ = new THREE.Vector2(currentPosition.x - otherPlayerMesh.position.x, currentPosition.z - otherPlayerMesh.position.z).length();
            if (distanceXZ < PLAYER_COLLISION_RADIUS * 2) {
                playerObject.position.x = previousPosition.x;
                playerObject.position.z = previousPosition.z;
                playerObject.position.y = currentPosition.y;
                break;
            }
        }
    }

    let groundY = 0; // TODO: Replace with map raycasting
    if (playerObject.position.y < groundY + PLAYER_HEIGHT) {
        playerObject.position.y = groundY + PLAYER_HEIGHT;
        if (velocityY < 0) velocityY = 0;
        isOnGround = true;
    } else {
        isOnGround = false;
    }

    if (playerObject.position.y < VOID_Y_LEVEL && playerState.health > 0) {
        socket.emit('fellIntoVoid');
        playerState.health = 0;
        updateHealthBar(0);
        showKillMessage("You fell into the void.");
    }

    const logicalPosition = playerObject.position.clone();
    logicalPosition.y -= PLAYER_HEIGHT;
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
    camera.getWorldPosition(bulletPosition);
    camera.getWorldDirection(bulletDirection);
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
    const material = new THREE.MeshBasicMaterial({ color: 0xffff00 });
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
    scene.add(mesh);
    console.log(`  Bullet mesh added to scene.`);
}

function updateBullets(deltaTime) {
    const bulletsToRemoveIndexes = [];
    for (let i = bullets.length - 1; i >= 0; i--) {
        const bullet = bullets[i];
        if (!bullet || !bullet.mesh) {
             if (!bulletsToRemoveIndexes.includes(i)) bulletsToRemoveIndexes.push(i);
             continue;
        }
        bullet.mesh.position.addScaledVector(bullet.velocity, deltaTime);
        let hitDetected = false;
        for (const playerId in players) {
            if (playerId !== bullet.ownerId && players[playerId].mesh && players[playerId].mesh.visible) {
                const playerMesh = players[playerId].mesh;
                const playerWorldPos = new THREE.Vector3();
                playerMesh.getWorldPosition(playerWorldPos);
                const distance = bullet.mesh.position.distanceTo(playerWorldPos);
                const scaledPlayerRadius = (playerMesh.scale?.x || 1) * PLAYER_RADIUS;
                const collisionThreshold = scaledPlayerRadius + 0.1;
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
        if (Date.now() - bullet.spawnTime > BULLET_LIFETIME) {
            if (!bulletsToRemoveIndexes.includes(i)) bulletsToRemoveIndexes.push(i);
            scene.remove(bullet.mesh);
        }
    }
    if (bulletsToRemoveIndexes.length > 0) {
         bulletsToRemoveIndexes.sort((a, b) => b - a);
         for (const index of bulletsToRemoveIndexes) {
             if (bullets[index]?.mesh) { /* Mesh already removed */ }
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

    // Log every ~5 seconds to confirm loop is running
    if (frameCount++ % 300 === 0) {
         console.log(`Animate running (Frame ${frameCount}). State: ${gameState}`);
    }

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
    loadingScreen = document.getElementById('loadingScreen'); if (!loadingScreen) { console.error("CRITICAL ERROR: Cannot find element with ID 'loadingScreen'"); return; }
    homeScreen = document.getElementById('homeScreen'); if (!homeScreen) { console.error("CRITICAL ERROR: Cannot find element with ID 'homeScreen'"); return; }
    gameUI = document.getElementById('gameUI'); if (!gameUI) { console.error("CRITICAL ERROR: Cannot find element with ID 'gameUI'"); return; }
    playerCountSpan = document.getElementById('playerCount'); if (!playerCountSpan) { console.error("CRITICAL ERROR: Cannot find element with ID 'playerCount'"); return; }
    playerNameInput = document.getElementById('playerNameInput'); if (!playerNameInput) { console.error("CRITICAL ERROR: Cannot find element with ID 'playerNameInput'"); return; }
    playerPhraseInput = document.getElementById('playerPhraseInput'); if (!playerPhraseInput) { console.error("CRITICAL ERROR: Cannot find element with ID 'playerPhraseInput'"); return; }
    joinButton = document.getElementById('joinButton'); if (!joinButton) { console.error("CRITICAL ERROR: Cannot find element with ID 'joinButton'"); return; }
    homeScreenError = document.getElementById('homeScreenError'); if (!homeScreenError) { console.error("CRITICAL ERROR: Cannot find element with ID 'homeScreenError'"); return; }
    infoDiv = document.getElementById('info'); if (!infoDiv) { console.error("CRITICAL ERROR: Cannot find element with ID 'info'"); return; }
    healthBarFill = document.getElementById('healthBarFill'); if (!healthBarFill) { console.error("CRITICAL ERROR: Cannot find element with ID 'healthBarFill'"); return; }
    healthText = document.getElementById('healthText'); if (!healthText) { console.error("CRITICAL ERROR: Cannot find element with ID 'healthText'"); return; }
    killMessageDiv = document.getElementById('killMessage'); if (!killMessageDiv) { console.error("CRITICAL ERROR: Cannot find element with ID 'killMessage'"); return; }
    const canvas = document.getElementById('gameCanvas'); if (!canvas) { console.error("CRITICAL ERROR: Cannot find element with ID 'gameCanvas'"); return; }
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
    } catch (e) { /* ... error handling ... */ return; }

    // Lighting
    try {
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6); scene.add(ambientLight);
        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.9); directionalLight.position.set(10, 15, 10); directionalLight.castShadow = true; directionalLight.shadow.mapSize.width = 1024; directionalLight.shadow.mapSize.height = 1024; scene.add(directionalLight);
        console.log("Lighting added.");
    } catch(e) { /* ... error handling ... */ return; }

    // Controls
    try {
        controls = new THREE.PointerLockControls(camera, document.body);
        controls.addEventListener('lock', () => console.log('Pointer Locked'));
        // --- REVISED UNLOCK LISTENER ---
        controls.addEventListener('unlock', () => {
            console.log('Pointer Unlocked (Escape pressed or focus lost)');
            // No automatic state change on unlock. Player must click canvas to re-lock.
        });
        // -----------------------------
        console.log("PointerLockControls initialized.");
    } catch (e) { /* ... error handling ... */ return; }

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
