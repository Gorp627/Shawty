// docs/main.js

// --- Configuration ---
const SERVER_URL = 'https://gametest-psxl.onrender.com';
const MAP_PATH = 'assets/maps/map.glb';
const SOUND_PATH_GUNSHOT = 'assets/maps/gunshot.wav'; // Note: Sound in maps folder?
const PLAYER_MODEL_PATH = 'assets/maps/Shawty1.glb'; // Note: Model in maps folder?

const PLAYER_HEIGHT = 1.8;
const PLAYER_RADIUS = 0.4;
const MOVEMENT_SPEED = 5.0;
const MOVEMENT_SPEED_SPRINTING = 8.0;
const BULLET_SPEED = 50;
const GRAVITY = 19.62;
const JUMP_FORCE = 8.0;
const VOID_Y_LEVEL = -30;
const PLAYER_COLLISION_RADIUS = PLAYER_RADIUS;
const KILL_MESSAGE_DURATION = 4000;

// --- Global Variables ---
// Game State
let gameState = 'loading';
let assetsReady = false;
let mapLoadState = 'loading';
let playerModelLoadState = 'loading';
let socket;
let localPlayerId = null;
let localPlayerName = 'Anonymous';
let localPlayerPhrase = '...';
let players = {};
let bullets = [];
let keys = {};

// Three.js Core
let scene, camera, renderer, controls, clock, loader, dracoLoader;
let mapMesh = null;
let playerModel = null; // Template model

// Physics
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
    // Prevent browser default action for Escape if needed (though unlock handles it)
    // if (event.code === 'Escape' && gameState === 'playing') {
    //     event.preventDefault();
    // }
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
                requestAnimationFrame(() => { homeScreen.classList.add('visible'); });
                playerCountSpan = playerCountSpan || document.getElementById('playerCount');
                if(playerCountSpan) playerCountSpan.textContent = options.playerCount ?? playerCountSpan.textContent ?? '?';
                if (controls?.isLocked) controls.unlock();
                const playerControlsObject = scene?.getObjectByName("PlayerControls");
                if (playerControlsObject) scene.remove(playerControlsObject);
                joinButton = joinButton || document.getElementById('joinButton');
                if(joinButton) {
                    joinButton.disabled = false;
                    joinButton.textContent = "Join Game";
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
                 setGameState('loading', { message: "Loading Assets...", assets: true });
             }
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
                 setTimeout(() => { if(gameState === 'playing' && !controls.isLocked) controls.lock(); }, 100); // Attempt lock after short delay
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
        checkAssetsReady();
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

            // <<< --- ADD/ADJUST SCALING HERE --- >>>
            const desiredScale = 0.8; // ADJUST THIS VALUE until size looks right
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
    const moveDirection = new THREE.Vector3();
    if (keys['KeyW']) { moveDirection.z = -1; } // Forward intention
    if (keys['KeyS']) { moveDirection.z = 1; }  // Backward intention
    if (keys['KeyA']) { moveDirection.x = -1; } // Strafe Left intention
    if (keys['KeyD']) { moveDirection.x = 1; }  // Strafe Right intention
    const isMovingHorizontal = moveDirection.x !== 0 || moveDirection.z !== 0;

    const previousPosition = playerObject.position.clone();

    // Apply Gravity first
    velocityY -= GRAVITY * deltaTime;
    playerObject.position.y += velocityY * deltaTime;

    // Apply Horizontal Movement using controls methods
    if (isMovingHorizontal) {
        // W/S control forward/backward movement amount
        controls.moveForward(moveDirection.z * speed);
        // A/D control right/left strafe amount
        controls.moveRight(moveDirection.x * speed);
    }

    // Collision Detection (Player-Player) - Check position *after* controls have moved it
    const currentPosition = playerObject.position;
    let collisionReverted = false;
    for (const id in players) {
        if (id !== localPlayerId && players[id].mesh && players[id].mesh.visible) {
            const otherPlayerMesh = players[id].mesh;
            const distanceXZ = new THREE.Vector2(currentPosition.x - otherPlayerMesh.position.x, currentPosition.z - otherPlayerMesh.position.z).length();
            if (distanceXZ < PLAYER_COLLISION_RADIUS * 2) {
                console.log("Player collision - reverting horizontal move");
                // Revert X and Z based on previous position, keep calculated Y
                playerObject.position.x = previousPosition.x;
                playerObject.position.z = previousPosition.z;
                // Keep the Y position that included gravity application BEFORE reverting XZ
                playerObject.position.y = currentPosition.y; // Keep the Y after gravity was applied
                collisionReverted = true;
                break;
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
    // Ensure lastSentState exists before accessing properties
    const positionChanged = logicalPosition.distanceToSquared(new THREE.Vector3(lastSentState?.x ?? 0, lastSentState?.y ?? 0, lastSentState?.z ?? 0)) > 0.001;
    const cameraRotation = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ');
    const currentRotationY = cameraRotation.y;
    const rotationChanged = Math.abs(currentRotationY - (lastSentState?.rotationY ?? 0)) > 0.01;

    if (positionChanged || rotationChanged) {
        // Update local cache only if playerState exists
        if (lastSentState) {
            lastSentState.x = logicalPosition.x; lastSentState.y = logicalPosition.y; lastSentState.z = logicalPosition.z;
            lastSentState.rotationY = currentRotationY;
        }
        // Send logical position to server
        socket.emit('playerUpdate', { x: logicalPosition.x, y: logicalPosition.y, z: logicalPosition.z, rotationY: currentRotationY });
    }
}


// --- Shoot, Bullet, Interpolation, UI, Event Handlers ---
function shoot() {
    console.log("Attempting to shoot..."); // Log start
    if (gameState !== 'playing' || !socket || !localPlayerId || !controls?.isLocked || !players[localPlayerId] || players[localPlayerId].health <= 0) {
         console.log(`Shoot conditions not met: State=${gameState}, Socket=${!!socket}, ID=${localPlayerId}, Locked=${controls?.isLocked}, PlayerData=${!!players[localPlayerId]}, Health=${players[localPlayerId]?.health}`);
         return;
    }

    // Play sound locally
    if (gunshotSound) {
        try {
            // Simple play for now, can get more complex with pooling later
            gunshotSound.currentTime = 0; // Reset sound if playing
            gunshotSound.play().catch(e => console.warn("Sound play interrupted or failed:", e)); // Catch potential errors
            console.log("Gunshot sound played (or attempted).");
        } catch (e) { console.error("Error playing gunshot sound:", e); }
    } else { console.warn("Gunshot sound not available."); }

    // Get position/direction
    const bulletPosition = new THREE.Vector3();
    const bulletDirection = new THREE.Vector3();
    if (!camera) { console.error("Camera not found for shooting!"); return; }
    camera.getWorldPosition(bulletPosition);
    camera.getWorldDirection(bulletDirection);
    // bulletPosition.addScaledVector(bulletDirection, PLAYER_RADIUS * 1.1); // Optional offset

    // Send to server
    console.log("Emitting 'shoot' event to server.");
    socket.emit('shoot', {
        position: { x: bulletPosition.x, y: bulletPosition.y, z: bulletPosition.z },
        direction: { x: bulletDirection.x, y: bulletDirection.y, z: bulletDirection.z }
    });
    console.log("Shoot event emitted.");
}

function spawnBullet(bulletData) { /* ... Same as previous ... */ }
function updateBullets(deltaTime) { /* ... Same as previous ... */ }
function updateOtherPlayers(deltaTime) { /* ... Same as previous ... */ }
function updateHealthBar(health) { /* ... Same as previous ... */ }
function showKillMessage(message) { /* ... Same as previous ... */ }
function handlePlayerJoined(playerData) { /* ... Same as previous ... */ }
function handlePlayerLeft(playerId) { /* ... Same as previous ... */ }
function handleHealthUpdate(data) { /* ... Same as previous ... */ }
function handlePlayerDied(data) { /* ... Same as previous ... */ }
function handlePlayerRespawned(playerData) { /* ... Same as previous ... */ }


// --- Animation Loop ---
function animate() {
    requestAnimationFrame(animate);
    const deltaTime = clock ? clock.getDelta() : 0.016;

    // console.log(`Animate loop running. State: ${gameState}`); // Noisy log

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
function onWindowResize() {
    if (camera) {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
    }
    if (renderer) {
        renderer.setSize(window.innerWidth, window.innerHeight);
    }
}

// ========================================================
// INITIALIZATION FUNCTION DEFINITION
// ========================================================
function init() {
    console.log("Initializing Shawty...");
    // Get UI Elements
    loadingScreen = document.getElementById('loadingScreen');
    homeScreen = document.getElementById('homeScreen');
    gameUI = document.getElementById('gameUI');
    playerCountSpan = document.getElementById('playerCount');
    playerNameInput = document.getElementById('playerNameInput');
    playerPhraseInput = document.getElementById('playerPhraseInput');
    joinButton = document.getElementById('joinButton');
    homeScreenError = document.getElementById('homeScreenError');
    infoDiv = document.getElementById('info');
    healthBarFill = document.getElementById('healthBarFill');
    healthText = document.getElementById('healthText');
    killMessageDiv = document.getElementById('killMessage');

    // Set Initial UI State
    setGameState('loading');

    // Basic Three.js Scene Setup
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87ceeb);
    scene.fog = new THREE.Fog(0x87ceeb, 0, 150);
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('gameCanvas'), antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    clock = new THREE.Clock();
    loader = new THREE.GLTFLoader();
    dracoLoader = new THREE.DRACOLoader();
    dracoLoader.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/libs/draco/');
    dracoLoader.setDecoderConfig({ type: 'js' });
    loader.setDRACOLoader(dracoLoader);

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.9);
    directionalLight.position.set(10, 15, 10);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 1024;
    directionalLight.shadow.mapSize.height = 1024;
    scene.add(directionalLight);

    // Controls
    controls = new THREE.PointerLockControls(camera, document.body);
    controls.addEventListener('lock', () => console.log('Pointer Locked'));
    // --- ADJUSTED UNLOCK LISTENER ---
    controls.addEventListener('unlock', () => {
        console.log('Pointer Unlocked (Escape pressed?)');
        // Only go back home if we are *currently* playing.
        // Avoids going home if lock fails initially or on homescreen.
        // if (gameState === 'playing') {
        //     setGameState('homescreen', { playerCount: playerCountSpan?.textContent ?? '?' });
        // }
        // Let's just log for now, don't change state on unlock automatically
    });
    // --------------------------------

    // Start Loading Assets & Connecting
    loadSound();
    loadPlayerModel();
    loadMap(MAP_PATH);
    setupSocketIO(); // Safe now

    // Add Event Listeners (Safe now)
    joinButton?.addEventListener('click', attemptJoinGame);
    window.addEventListener('resize', onWindowResize);
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    document.addEventListener('mousedown', onMouseDown);

    // Start animation loop
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
