// docs/main.js

// --- Configuration ---
const SERVER_URL = 'https://gametest-psxl.onrender.com'; // USER PROVIDED SERVER URL
const MAP_PATH = 'assets/maps/map.glb'; // USER PROVIDED MAP PATH
const SOUND_PATH_GUNSHOT = 'assets/maps/gunshot.wav'; // USER PROVIDED SOUND PATH (in maps folder?)
const PLAYER_MODEL_PATH = 'assets/maps/Shawty1.glb'; // USER PROVIDED MODEL PATH (in maps folder?)

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
    // Prevent page scroll on space when canvas/body has focus
    if (event.code === 'Space') {
        event.preventDefault();
        if (isOnGround && gameState === 'playing') { // Only jump when playing and grounded
            velocityY = JUMP_FORCE;
            isOnGround = false;
        }
    }
}

function onKeyUp(event) {
    keys[event.code] = false;
}

function onMouseDown(event) {
    // Shoot only if playing, locked, and left mouse
    if (gameState === 'playing' && controls?.isLocked && event.button === 0) {
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
        // console.warn(`Already in state: ${newState}. Ignoring redundant call.`); // Can be noisy
        return;
    }
    gameState = newState;

    // Hide all sections first
    if(loadingScreen) { loadingScreen.style.display = 'none'; loadingScreen.classList.remove('assets', 'error'); if(loadingScreen.querySelector('p')) loadingScreen.querySelector('p').style.color = ''; }
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
                 // Re-use 'loading' state visually
                 setGameState('loading', { message: "Loading Assets...", assets: true });
             }
             // Otherwise, stay visually on homescreen (button disabled)
            break;
        case 'playing':
            // *** DEBUGGING FOR WHITE SCREEN ***
            console.log(">>> Setting state to PLAYING");
            const canvasElem = document.getElementById('gameCanvas'); // Use different var name

            if(gameUI) {
                gameUI.style.display = 'block';
                requestAnimationFrame(() => { gameUI.classList.add('visible'); });
                console.log(">>> Game UI display set to block, visibility triggered.");
            } else { console.error(">>> gameUI element not found!"); }

            if(canvasElem) {
                 canvasElem.style.display = 'block';
                 console.log(">>> Canvas display set to block.");
            } else { console.error(">>> gameCanvas element not found!"); }

            // Add controls object IF NOT ALREADY THERE
            if (scene && controls) {
                if (!scene.getObjectByName("PlayerControls")) {
                    console.log(">>> Adding player controls object to scene.");
                    controls.getObject().name = "PlayerControls";
                    scene.add(controls.getObject());
                } else {
                     console.log(">>> Player controls object already in scene.");
                }
                // Log camera and controls position AFTER initialize should have set them
                 console.log(">>> Position Check - Camera:", camera?.position.toArray()); // Log array form
                 console.log(">>> Position Check - Controls Object:", controls?.getObject()?.position.toArray()); // Log array form

                console.log(">>> Attempting controls.lock()...");
                // Use timeout to ensure canvas is rendered before lock attempt? Might help some browsers.
                // setTimeout(() => {
                    controls.lock();
                // }, 100); // Short delay
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
            // Now that assets are ready, if socket is also connected, proceed to homescreen.
            // If socket is not yet connected, the 'connect' handler will call this again.
            if (socket?.connected && gameState === 'loading') { // Check if still in initial loading state
                console.log("Assets ready and socket connected. Showing homescreen.");
                setGameState('homescreen', { playerCount: playerCountSpan?.textContent ?? '?' });
            } else if (gameState === 'joining') {
                 // If we were waiting for assets after clicking Join
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
        console.log('Socket connected! ID:', socket.id);
        // Socket is ready, check if assets are also ready to show homescreen
        checkAssetsReady();
        // It's possible playerCountUpdate arrives *before* connect sometimes.
        // If homescreen is already shown, let's ensure the count is updated if available.
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
        mapLoadState = 'error'; // Assume assets can't load
        playerModelLoadState = 'error';
        assetsReady = false;
        setGameState('loading', { message: `Connection Failed!<br/>${err.message}`, error: true});
    });

    socket.on('playerCountUpdate', (count) => {
        console.log("Player count update received:", count); // Add log
        playerCountSpan = playerCountSpan || document.getElementById('playerCount');
        if (playerCountSpan) {
            playerCountSpan.textContent = count; // Update the text
            console.log("Updated playerCountSpan text content.");
        } else {
            console.warn("playerCountSpan element not found when trying to update count.");
        }
        // If assets are ready and we are connected, ensure homescreen is shown
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
                initialPlayerPosX = playerData.x;
                initialPlayerPosY = playerData.y; // Logical Y
                initialPlayerPosZ = playerData.z;
                const visualY = initialPlayerPosY + PLAYER_HEIGHT;
                // Ensure controls object exists before setting position
                if (controls?.getObject()) {
                    controls.getObject().position.set(initialPlayerPosX, visualY, initialPlayerPosZ);
                    console.log(`Set controls position based on server: X=${initialPlayerPosX}, Y=${visualY}, Z=${initialPlayerPosZ}`);
                } else {
                    console.error("Controls object not found when trying to set initial position!");
                }
                velocityY = 0; isOnGround = true;
                updateHealthBar(playerData.health);
                infoDiv.textContent = `Playing as ${localPlayerName}`;
            } else {
                addPlayer(playerData);
            }
        }
        console.log("Game initialized with players:", players);
        // NOW set the game state AFTER positions are potentially set
        setGameState('playing');
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
        // Remain visually in 'joining' state until server 'initialize'
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
        try { // Add try-catch around cloning/adding
            const modelInstance = playerModel.clone();
            console.log(`Cloned model for player ${playerData.id}`);
            const visualY = playerData.y; // Assume model origin at feet
            modelInstance.position.set(playerData.x, visualY, playerData.z);
            modelInstance.rotation.y = playerData.rotationY;
            scene.add(modelInstance);
            players[playerData.id].mesh = modelInstance;
            players[playerData.id].targetPosition = modelInstance.position.clone();
            players[playerData.id].targetRotationY = modelInstance.rotation.y;
        } catch (e) {
            console.error(`Error cloning/adding model for ${playerData.id}:`, e);
            addPlayerFallbackMesh(playerData); // Use fallback on error
        }
    } else {
        console.warn(`Player model not ready/failed, using fallback for ${playerData.id}`);
        addPlayerFallbackMesh(playerData);
    }
}

function addPlayerFallbackMesh(playerData) {
     if (!players[playerData.id] || players[playerData.id].mesh) return;
     console.warn(`Using fallback mesh for player ${playerData.id}`);
     try { // Add try-catch for fallback mesh creation
         const geometry = new THREE.CylinderGeometry(PLAYER_RADIUS, PLAYER_RADIUS, PLAYER_HEIGHT, 8);
         const material = new THREE.MeshStandardMaterial({ color: 0xff00ff }); // Magenta fallback
         const mesh = new THREE.Mesh(geometry, material);
         mesh.castShadow = true;
         const visualY = playerData.y + (PLAYER_HEIGHT / 2); // Cylinder origin is center
         mesh.position.set(playerData.x, visualY, playerData.z);
         mesh.rotation.y = playerData.rotationY;
         scene.add(mesh);
         players[playerData.id].mesh = mesh;
         players[playerData.id].targetPosition = mesh.position.clone();
         players[playerData.id].targetRotationY = mesh.rotation.y;
     } catch(e) {
         console.error(`Error creating fallback mesh for ${playerData.id}:`, e);
         // Player will be invisible if fallback also fails
     }
}

function removePlayerMesh(playerId) {
    if (players[playerId] && players[playerId].mesh) {
        try {
            scene.remove(players[playerId].mesh);
            // Dispose geometry/material to prevent memory leaks
            if (players[playerId].mesh.geometry) players[playerId].mesh.geometry.dispose();
            if (players[playerId].mesh.material) {
                 // Handle potential array of materials
                 if (Array.isArray(players[playerId].mesh.material)) {
                     players[playerId].mesh.material.forEach(m => m.dispose());
                 } else {
                     players[playerId].mesh.material.dispose();
                 }
            }
            console.log(`Removed mesh for player ${playerId}`);
        } catch (e) {
            console.error(`Error removing mesh for ${playerId}:`, e);
        }
        players[playerId].mesh = null; // Clear reference
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
    if (gameState !== 'playing' || !controls?.isLocked || !localPlayerId || !players[localPlayerId]) return; // Optional chaining for controls
    const playerObject = controls.getObject();
    const playerState = players[localPlayerId];
    if (!playerState || playerState.health <= 0) return;

    const currentSpeed = keys['ShiftLeft'] ? MOVEMENT_SPEED_SPRINTING : MOVEMENT_SPEED;
    const speed = currentSpeed * deltaTime;
    const moveDirection = new THREE.Vector3();
    if (keys['KeyW']) { moveDirection.z = -1; }
    if (keys['KeyS']) { moveDirection.z = 1; }
    if (keys['KeyA']) { moveDirection.x = -1; }
    if (keys['KeyD']) { moveDirection.x = 1; }
    const isMovingHorizontal = moveDirection.x !== 0 || moveDirection.z !== 0;

    const previousPosition = playerObject.position.clone(); // Store before any movement

    // Apply Gravity first
    velocityY -= GRAVITY * deltaTime;
    playerObject.position.y += velocityY * deltaTime;

    // Apply Horizontal Movement if needed
    if (isMovingHorizontal) {
        controls.moveForward(moveDirection.z * speed);
        controls.moveRight(moveDirection.x * speed);
    }

    // Collision Detection (Player-Player)
    const currentPosition = playerObject.position; // Position after potentially moving
    let collisionReverted = false;
    for (const id in players) {
        if (id !== localPlayerId && players[id].mesh && players[id].mesh.visible) {
            const otherPlayerMesh = players[id].mesh;
            const distanceXZ = new THREE.Vector2(currentPosition.x - otherPlayerMesh.position.x, currentPosition.z - otherPlayerMesh.position.z).length();
            if (distanceXZ < PLAYER_COLLISION_RADIUS * 2) {
                console.log("Player collision - reverting horizontal move");
                // Revert X and Z, keep new Y (gravity applied)
                playerObject.position.x = previousPosition.x;
                playerObject.position.z = previousPosition.z;
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
        if (velocityY < 0) velocityY = 0; // Stop downward velocity only
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
    const positionChanged = logicalPosition.distanceToSquared(new THREE.Vector3(lastSentState.x ?? 0, lastSentState.y ?? 0, lastSentState.z ?? 0)) > 0.001;
    const cameraRotation = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ');
    const currentRotationY = cameraRotation.y;
    const rotationChanged = Math.abs(currentRotationY - (lastSentState.rotationY ?? 0)) > 0.01;

    if (positionChanged || rotationChanged) {
        lastSentState.x = logicalPosition.x; lastSentState.y = logicalPosition.y; lastSentState.z = logicalPosition.z;
        lastSentState.rotationY = currentRotationY;
        socket.emit('playerUpdate', { x: logicalPosition.x, y: logicalPosition.y, z: logicalPosition.z, rotationY: currentRotationY });
    }
}


// --- Shoot, Bullet, Interpolation, UI, Event Handlers ---
function shoot() { /* ... Same ... */ }
function spawnBullet(bulletData) { /* ... Same ... */ }
function updateBullets(deltaTime) { /* ... Same ... */ }
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
    const deltaTime = clock.getDelta(); // Use uncapped delta

    // Update logic only when playing
    if (gameState === 'playing') {
        if (players[localPlayerId]) {
             updatePlayer(deltaTime);
        }
        updateBullets(deltaTime);
        updateOtherPlayers(deltaTime);
    }

    // Always render
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


// --- Start ---
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
