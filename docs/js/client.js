// /docs/js/client.js
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.module.js'; // Use CDN for module (r128)
// We'll need GLTFLoader later
// import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/jsm/loaders/GLTFLoader.js';

// --- Global Variables ---
let scene, camera, renderer;
let socket;
let localPlayerId = null; // This client's unique ID from the server
const players = {}; // Stores data about all players { id: { id, name, character, object, score, x, y, z, rotationY } }

// --- UI Elements Cache ---
const ui = {
    loadingScreen: document.getElementById('loading-screen'),
    loadingMessage: document.getElementById('loading-message'), // Reference the message element
    homeMenu: document.getElementById('home-menu'),
    playButton: document.getElementById('playButton'),
    playerNameInput: document.getElementById('playerNameInput'),
    connectionStatus: document.getElementById('connection-status'),
    characterButtons: document.querySelectorAll('.character-option'),
    gameUi: document.getElementById('game-ui'),
    chatContainer: document.getElementById('chat-container'),
    chatMessages: document.getElementById('chat-messages'),
    chatInput: document.getElementById('chat-input'),
    leaderboard: document.getElementById('leaderboard'),
    leaderboardList: document.getElementById('leaderboard-list'),
    gameCanvas: document.getElementById('gameCanvas'), // Reference the canvas
    crosshair: document.getElementById('crosshair'),
    deathMessage: document.getElementById('death-message'),
    roundOverMessage: document.getElementById('round-over-message'),
};

// --- Game State ---
let isChatting = false;
let showLeaderboard = false;
let selectedCharacter = 'Shawty1'; // Default character ID
let animationFrameId = null; // To store the requestAnimationFrame ID for cancellation
let isPointerLocked = false;

// --- Initialization ---
function init() {
    console.log("Initializing client...");

    // Connect to Socket.IO Server
    // Detect if running on Render or GitHub Pages (production) vs localhost (development)
    const isProduction = window.location.origin.includes('onrender.com') || window.location.origin.includes('github.io');
    const serverURL = isProduction
        ? 'https://gametest-psxl.onrender.com' // Production backend (Render)
        : 'http://localhost:3000';             // Local development backend
    console.log(`Connecting to server at: ${serverURL}`);

    // Configure Socket.IO
    // Ensure io function is available globally from the script loaded in index.html
    if (typeof io === 'undefined') {
        console.error("Socket.IO client library (io) not loaded. Check script tag in index.html.");
        showLoadingScreen("Error: Cannot load network library. Please refresh.", true);
        return; // Stop initialization if io is missing
    }
    socket = io(serverURL, {
        reconnectionAttempts: 5,
        reconnectionDelay: 2000,
        transports: ['websocket'],
    });

    setupSocketListeners();
    setupUIListeners();

    // Initial UI state
    showLoadingScreen("Connecting to server...");
    ui.playButton.disabled = true;
    validatePlayButtonState();
}

function initThree() {
    console.log("Initializing Three.js...");
    // Scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x7092be); // A slightly nicer sky blue
    scene.fog = new THREE.Fog(0x7092be, 50, 150); // Add fog for depth perception

    // Camera
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    // Camera position will be set based on the player's spawn point in initializeGame

    // Renderer
    renderer = new THREE.WebGLRenderer({
        canvas: ui.gameCanvas, // Use the existing canvas
        antialias: true // Enable anti-aliasing
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio); // Adjust for high DPI screens
    renderer.shadowMap.enabled = true; // Enable shadows
    renderer.shadowMap.type = THREE.PCFSoftShadowMap; // Softer shadows

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5); // Ambient light
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.9); // Directional light (sun)
    directionalLight.position.set(15, 30, 20);
    directionalLight.castShadow = true;
    // Configure shadow properties for better quality/performance
    directionalLight.shadow.mapSize.width = 2048; // Higher resolution shadows
    directionalLight.shadow.mapSize.height = 2048;
    directionalLight.shadow.camera.near = 0.5;
    directionalLight.shadow.camera.far = 100; // Adjust shadow distance
    const shadowCamSize = 30;
    directionalLight.shadow.camera.left = -shadowCamSize;
    directionalLight.shadow.camera.right = shadowCamSize;
    directionalLight.shadow.camera.top = shadowCamSize;
    directionalLight.shadow.camera.bottom = -shadowCamSize;
    directionalLight.shadow.bias = -0.0005; // Adjust shadow bias to prevent artifacts
    scene.add(directionalLight);
    scene.add(directionalLight.target); // Needed for positioning the light target if needed


    // Optional: Light Helpers (for debugging)
    // const dirLightHelper = new THREE.DirectionalLightHelper(directionalLight, 5);
    // scene.add(dirLightHelper);
    // const shadowHelper = new THREE.CameraHelper(directionalLight.shadow.camera);
    // scene.add(shadowHelper);

    // Basic Floor (Temporary - Replace with Map Model)
    const floorGeometry = new THREE.PlaneGeometry(200, 200); // Larger floor
    const floorMaterial = new THREE.MeshStandardMaterial({
        color: 0x888888, // Mid-grey floor
        metalness: 0.1, // Slightly metallic
        roughness: 0.8, // Quite rough
        side: THREE.DoubleSide
    });
    const floor = new THREE.Mesh(floorGeometry, floorMaterial);
    floor.rotation.x = -Math.PI / 2; // Rotate flat
    floor.position.y = 0; // Set floor at Y=0
    floor.receiveShadow = true; // Allow floor to receive shadows
    scene.add(floor);

    // Handle window resize
    window.addEventListener('resize', onWindowResize, false);

    console.log("Three.js initialized.");
}

// --- Socket.IO Event Handlers ---
function setupSocketListeners() {
    socket.on('connect', () => {
        console.log('Connected to server!', socket.id);
        ui.connectionStatus.textContent = 'Connected!';
        ui.connectionStatus.className = 'connected'; // Use class for styling
        // Don't store localPlayerId here, wait for 'yourId'
        showHomeScreen(); // Show menu now that connection is established
        validatePlayButtonState(); // Re-check if play button should be enabled
    });

    socket.on('disconnect', (reason) => {
        console.warn(`Disconnected from server. Reason: ${reason}`);
        // Use a more user-friendly message, perhaps without the technical reason initially
        addChatMessage('System', 'You have been disconnected.', 'system');
        showHomeScreen(); // Go back to home screen
        ui.connectionStatus.textContent = 'Disconnected. Retrying...';
        ui.connectionStatus.className = 'error'; // Use class for styling
        // Clean up game state robustly
        cleanupGameState();
    });

    socket.on('reconnect_attempt', (attemptNumber) => {
        console.log(`Reconnect attempt ${attemptNumber}...`);
        ui.connectionStatus.textContent = `Reconnecting (${attemptNumber})...`;
        ui.connectionStatus.className = ''; // Neutral style
    });

    socket.on('reconnect_failed', () => {
        console.error('Failed to reconnect to the server.');
        addChatMessage('System', 'Could not reconnect to the server. Please refresh the page.', 'system');
        ui.connectionStatus.textContent = 'Connection failed. Refresh?';
        ui.connectionStatus.className = 'error';
         cleanupGameState(); // Ensure cleanup if reconnect fails permanently
    });


    socket.on('connect_error', (err) => {
        console.error('Connection Error:', err.message);
        ui.connectionStatus.textContent = 'Connection Error!';
        ui.connectionStatus.className = 'error';
        // Provide specific advice based on common errors if possible
        showLoadingScreen(`Connection failed: ${err.message}. Server might be down or check CORS.`, true);
        cleanupGameState();
    });

    // Server confirms the client's unique ID
    socket.on('yourId', (id) => {
        localPlayerId = id;
        console.log(`Server assigned ID: ${localPlayerId}`);
        // Now we know our ID, update UI state if needed
        validatePlayButtonState();
    });

    // Server sends initial game state upon successful join
    socket.on('initializeGame', (data) => {
        console.log("Received initializeGame data:", data);
        const { playerData, currentPlayers } = data;

        // Crucial check: Ensure we have our ID before processing
        if (!localPlayerId || localPlayerId !== playerData.id) {
            console.error("Received initialization data for wrong ID or before own ID known.", localPlayerId, playerData.id);
            return;
        }

        // Initialize Three.js scene if it hasn't been already
        if (!scene) {
            initThree();
        } else {
             // If scene exists (e.g., from previous game), clear old players/objects
             clearScene(); // Clear previous game elements
        }


        // --- Add the LOCAL player ---
        try {
            addPlayer(playerData); // Add self using server-provided data
        } catch (error) {
             console.error("Error adding local player:", error);
             // Handle error gracefully - maybe show error message, return to menu?
             addSystemMessage("Error loading player model. Cannot join game.");
             showHomeScreen();
             cleanupGameState(); // Clean up partially initialized state
             return; // Stop further processing
        }


        // Position the camera relative to the player AFTER the player object exists
        if (players[localPlayerId] && players[localPlayerId].object) {
             const playerObj = players[localPlayerId].object;
             // Make camera child of player object for FPS view
             playerObj.add(camera);
             camera.position.set(0, 1.6, 0.2); // x, y (eye height), z (slightly forward from center)
             camera.rotation.set(0, 0, 0); // Reset camera's local rotation
        } else {
             console.error("Local player object not found immediately after addPlayer in initializeGame");
             // Fallback camera position if player object isn't ready
             camera.position.set(playerData.x, playerData.y + 5, playerData.z + 5);
             camera.lookAt(new THREE.Vector3(playerData.x, playerData.y, playerData.z));
        }


        // --- Add all OTHER players already in the game ---
        Object.values(currentPlayers).forEach(playerInfo => {
            if (playerInfo.id !== localPlayerId && !players[playerInfo.id]) {
                 try {
                    addPlayer(playerInfo);
                 } catch (error) {
                     console.error(`Error adding other player ${playerInfo.id}:`, error);
                     // Decide how to handle - skip this player, show placeholder?
                     // For now, just log the error and continue.
                 }
            }
        });

        // --- Transition UI ---
        hideHomeScreen();
        hideLoadingScreen();
        showGameUI();
        document.body.classList.add('game-active'); // Apply game styles

        // Start the animation loop if not already running
        if (!animationFrameId) {
             animate();
        }

        // Request pointer lock after a short delay
        setTimeout(() => {
            requestPointerLock();
        }, 100);

        // Use server-sent join message via chat instead
        // addSystemMessage(`Welcome, ${playerData.name}! Joined the game.`);
        updateLeaderboard(); // Show initial leaderboard state
    });


    // Handles players joining *after* you are already in
    socket.on('playerJoined', (playerData) => {
        if (!localPlayerId || !scene || !players[localPlayerId] || playerData.id === localPlayerId) return;

        if (!players[playerData.id]) {
            console.log(`Player joined: ${playerData.name} (${playerData.id})`);
             try {
                addPlayer(playerData);
                updateLeaderboard();
             } catch (error) {
                 console.error(`Error adding joining player ${playerData.id}:`, error);
             }
        } else {
            console.warn(`Received playerJoined for existing player: ${playerData.id}. Updating data.`);
             // Update existing player data
             const existingPlayer = players[playerData.id];
             existingPlayer.name = playerData.name;
             existingPlayer.character = playerData.character;
             existingPlayer.score = playerData.score;
             if (existingPlayer.object) {
                 existingPlayer.object.position.set(playerData.x, playerData.y, playerData.z);
                 if (playerData.id !== localPlayerId) { // Only update rotation for others
                    existingPlayer.object.rotation.y = playerData.rotationY;
                 }
             }
            updateLeaderboard();
        }
    });

    // Handles player leaving
    socket.on('playerLeft', (playerId, playerName) => {
        if (players[playerId]) {
            console.log(`Player left event: ${playerName} (${playerId})`);
            removePlayer(playerId); // removePlayer handles scene removal and cleanup
            updateLeaderboard(); // Update leaderboard after removal
        } else {
            console.warn(`Received playerLeft for unknown or already removed player ID: ${playerId}`);
        }
    });

    // Handles chat messages broadcast by the server
    socket.on('chatMessage', (senderId, senderName, message) => {
        handleChatMessage(senderId, senderName, message);
    });

    // --- Placeholder Game State Update Listener ---
    // socket.on('gameStateUpdate', (stateUpdates) => {
    //      handleGameStateUpdate(stateUpdates); // Process position/rotation updates etc.
    // });
}

// --- UI Event Handlers ---
function setupUIListeners() {
    // Join Game Button
    ui.playButton.addEventListener('click', () => {
        if (ui.playButton.disabled) return;
        ui.playButton.disabled = true;
        ui.playButton.textContent = 'Joining...';
        joinGame();
    });

    // Enable/Disable Play button based on Name Input
    ui.playerNameInput.addEventListener('input', validatePlayButtonState);

    // Allow joining by pressing Enter in the name input
    ui.playerNameInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !ui.playButton.disabled) {
            ui.playButton.click();
        }
    });

    // Character Selection Buttons
    ui.characterButtons.forEach(button => {
        button.addEventListener('click', () => {
            if (button.disabled || button.classList.contains('disabled')) return;

            ui.characterButtons.forEach(btn => btn.classList.remove('selected'));
            button.classList.add('selected');
            selectedCharacter = button.getAttribute('data-char');
            console.log("Selected character:", selectedCharacter);
            validatePlayButtonState();
        });

         // Initialize button states
         if(button.getAttribute('data-char') === selectedCharacter) {
            button.classList.add('selected');
         }
         if (button.classList.contains('disabled')) {
             button.disabled = true;
         }
    });


    // --- In-Game Input Listeners ---
    window.addEventListener('keydown', (event) => {
        if (!localPlayerId || !players[localPlayerId] || !socket?.connected) return;

        // Chat toggle/send/cancel
        if (event.key === 't' || event.key === 'T') { /* ... as before ... */ }
        else if (isChatting) { /* ... as before ... */ return; } // Important: return prevents game keys while chatting
        // Leaderboard toggle
        else if (event.key === 'l' || event.key === 'L') { /* ... as before ... */ }
        // Game keys
        else { handleGameKeyDown(event.key); }
    });

     // Add the missing keydown logic back for T/Enter/Escape in chat
    window.addEventListener('keydown', (event) => {
        if (!localPlayerId || !players[localPlayerId] || !socket?.connected) return;

        if (event.key === 't' || event.key === 'T') {
            event.preventDefault();
            if (!isChatting) {
                startChat();
            } else {
                if (!ui.chatInput.value.trim()) {
                    cancelChat();
                }
            }
        } else if (isChatting) {
            if (event.key === 'Enter') {
                event.preventDefault();
                sendChat();
            } else if (event.key === 'Escape') {
                event.preventDefault();
                cancelChat();
            }
            return; // Prevent game keys while chatting
        } else if (event.key === 'l' || event.key === 'L') {
             event.preventDefault();
             toggleLeaderboard();
        } else {
             handleGameKeyDown(event.key);
        }
    });


    window.addEventListener('keyup', (event) => {
         if (!localPlayerId || !players[localPlayerId] || !socket?.connected || isChatting) return;
         handleGameKeyUp(event.key);
    });

    ui.gameCanvas.addEventListener('click', () => {
        if (isPointerLocked && !isChatting) {
            handleShoot();
        } else if (!isChatting) {
             requestPointerLock();
        }
    });

    // Pointer Lock Listeners
    document.addEventListener('pointerlockchange', handlePointerLockChange, false);
    document.addEventListener('mozpointerlockchange', handlePointerLockChange, false);
    document.addEventListener('webkitpointerlockchange', handlePointerLockChange, false);

    // Mouse Movement Listener
    document.addEventListener('mousemove', handleMouseMove, false);
}

// Separate handlers for game-specific key presses
function handleGameKeyDown(key) {
    // console.log("Game Key Down:", key);
    switch (key.toLowerCase()) {
        case 'w': /* Start moving forward */ break;
        case 'a': /* Start moving left */ break;
        case 's': /* Start moving backward */ break;
        case 'd': /* Start moving right */ break;
        case ' ': /* Handle jump press */ break;
        case 'shift': /* Handle dash press/start */ break;
        case 'e': /* Mark E as held down for boost shot */ break;
    }
    // sendInputState();
}

function handleGameKeyUp(key) {
     // console.log("Game Key Up:", key);
    switch (key.toLowerCase()) {
        case 'w': /* Stop moving forward */ break;
        case 'a': /* Stop moving left */ break;
        case 's': /* Stop moving backward */ break;
        case 'd': /* Stop moving right */ break;
        case ' ': /* Handle jump release (if needed) */ break;
        case 'shift': /* Handle dash release/end */ break;
        case 'e': /* Mark E as released */ break;
    }
    // sendInputState();
}

function handleShoot() {
     if (!isPointerLocked || !localPlayerId || !socket?.connected) return;
     console.log("Shoot Action Triggered!");
     socket.emit('playerShoot', { boost: false }); // Placeholder
}

// Handles mouse movement for camera rotation
function handleMouseMove(event) {
    if (!isPointerLocked || !camera || !players[localPlayerId]?.object) return;

    const movementX = event.movementX || event.mozMovementX || event.webkitMovementX || 0;
    const movementY = event.movementY || event.mozMovementY || event.webkitMovementY || 0;

    const playerObject = players[localPlayerId].object;
    const sensitivity = 0.002;

    // YAW (Horizontal - Rotate the whole player object)
    playerObject.rotation.y -= movementX * sensitivity;

    // PITCH (Vertical - Rotate the camera object relative to the player)
    const maxPitch = Math.PI / 2 - 0.1;
    const minPitch = -Math.PI / 2 + 0.1;
    camera.rotation.x -= movementY * sensitivity;
    camera.rotation.x = Math.max(minPitch, Math.min(maxPitch, camera.rotation.x));

    // Ensure rotation order is applied correctly
    playerObject.rotation.order = 'YXZ'; // Player primarily rotates in Y
    camera.rotation.order = 'YXZ'; // Camera primarily rotates in X relative to player's Y

    // throttleSendRotationUpdate(playerObject.rotation.y, camera.rotation.x);
}


// --- Player Management ---
function addPlayer(playerData) {
    if (!scene) {
        throw new Error("Scene not initialized, cannot add player."); // Throw error if scene invalid
    }
    // If player already exists, update data instead of recreating
     if (players[playerData.id]) {
        console.warn(`Player ${playerData.id} already exists. Updating data.`);
        const existingPlayer = players[playerData.id];
        existingPlayer.name = playerData.name;
        existingPlayer.character = playerData.character;
        existingPlayer.score = playerData.score;
        existingPlayer.x = playerData.x;
        existingPlayer.y = playerData.y;
        existingPlayer.z = playerData.z;
        existingPlayer.rotationY = playerData.rotationY;

        if (existingPlayer.object) {
             existingPlayer.object.position.set(playerData.x, playerData.y, playerData.z);
             if (playerData.id !== localPlayerId) {
                existingPlayer.object.rotation.y = playerData.rotationY;
             }
        }
        if(showLeaderboard) updateLeaderboard();
        return;
    }

    console.log(`Creating visual for player: ${playerData.name} (${playerData.id}) at ${playerData.x.toFixed(2)}, ${playerData.y.toFixed(2)}, ${playerData.z.toFixed(2)}`);

    // --- Placeholder Model ---
    const isLocal = playerData.id === localPlayerId;
    // Use BoxGeometry as CapsuleGeometry is not in r128 core
    const geometry = new THREE.BoxGeometry(0.8, 1.8, 0.8); // Width, Height, Depth <<<< THIS LINE CHANGED
    // No translation needed for BoxGeometry as it's centered by default

    const material = new THREE.MeshStandardMaterial({
        color: isLocal ? 0x5599ff : 0xff8855,
        roughness: 0.7,
        metalness: 0.1
    });
    const playerMesh = new THREE.Mesh(geometry, material);
    playerMesh.position.set(playerData.x, playerData.y + 0.9, playerData.z); // Adjust Y position since box origin is center (0.9 = half height)
    playerMesh.rotation.y = playerData.rotationY;
    playerMesh.castShadow = true;
    playerMesh.receiveShadow = true;

    scene.add(playerMesh);
    // --- End Placeholder ---


    // Store player data locally
    players[playerData.id] = {
        id: playerData.id,
        name: playerData.name || 'Unknown',
        character: playerData.character || 'Shawty1',
        object: playerMesh,
        score: playerData.score || 0,
        x: playerData.x,
        y: playerData.y,
        z: playerData.z,
        rotationY: playerData.rotationY,
    };

    if (isLocal && playerMesh) {
         // Make the camera a child of the player mesh
         playerMesh.add(camera);
         // Adjust camera position relative to the BOX center (Y needs adjustment)
         camera.position.set(0, 1.6 - 0.9, 0.2); // Y pos = desired eye height - half box height
         camera.rotation.set(0, 0, 0);
     }

    console.log("Client players count:", Object.keys(players).length);
}


function removePlayer(playerId) {
    const player = players[playerId];
    if (player) {
        if (player.object) {
            if (player.object === camera.parent) {
                 // Detach camera properly before removing parent
                 player.object.getWorldPosition(camera.position);
                 player.object.getWorldQuaternion(camera.quaternion);
                 scene.add(camera); // Re-attach to scene
                 console.log("Camera detached from local player object.");
            }
            scene.remove(player.object);
            // Dispose resources
            if (player.object.geometry) player.object.geometry.dispose();
            if (player.object.material) {
                 if (Array.isArray(player.object.material)) {
                     player.object.material.forEach(mat => mat.dispose());
                 } else {
                     player.object.material.dispose();
                 }
            }
        }
        const playerName = player.name || 'Someone';
        delete players[playerId];
        console.log(`Removed player ${playerName} (${playerId}). Remaining:`, Object.keys(players).length);
    } else {
         console.warn(`Tried to remove non-existent player: ${playerId}`);
    }
}

function clearScene() {
    console.log("Clearing existing player objects from scene...");
    const idsToRemove = Object.keys(players);
    idsToRemove.forEach(id => {
         removePlayer(id); // Use existing logic including camera detach
    });
    // Reset players object
    // players = {}; // This might cause issues if called during disconnect cleanup? Test needed.
    console.log("Scene cleared of players.");
}


function cleanupGameState() {
     console.log("Cleaning up game state...");
     clearScene(); // Remove player objects and detach camera

     if (animationFrameId) {
         cancelAnimationFrame(animationFrameId);
         animationFrameId = null;
         console.log("Animation loop stopped.");
     }

     if (renderer) {
         console.log("Disposing Three.js renderer and scene...");
         window.removeEventListener('resize', onWindowResize);
         document.removeEventListener('pointerlockchange', handlePointerLockChange);
         document.removeEventListener('mozpointerlockchange', handlePointerLockChange);
         document.removeEventListener('webkitpointerlockchange', handlePointerLockChange);
         document.removeEventListener('mousemove', handleMouseMove);

         scene = null;
         camera = null;

         renderer.dispose();
         renderer.forceContextLoss();
         renderer = null;

         console.log("Three.js cleanup attempted.");
     }

     // Reset game state variables
     isChatting = false;
     showLeaderboard = false;
     isPointerLocked = false;
     localPlayerId = null; // Ensure ID is cleared

     // Reset UI elements
     ui.chatInput.value = '';
     ui.chatInput.disabled = true;
     ui.chatMessages.innerHTML = '';
     ui.leaderboardList.innerHTML = '';
     ui.leaderboard.classList.add('hidden');
     ui.gameUi.classList.add('hidden');
     document.body.classList.remove('game-active');
     if (document.pointerLockElement) {
         document.exitPointerLock();
     }
     validatePlayButtonState();
     console.log("Game state cleanup finished.");
}


// --- Game Logic ---
function joinGame() {
    const playerName = ui.playerNameInput.value.trim();

    // Validate inputs
    if (!playerName || !selectedCharacter || !localPlayerId || !socket || !socket.connected) {
        console.error("Join validation failed:", { playerName, selectedCharacter, localPlayerId, connected: socket?.connected });
        // Provide specific feedback
        if (!playerName) alert("Please enter a name!");
        else if (!selectedCharacter) alert("Character selection error!");
        else if (!localPlayerId) alert("Connecting to server... please wait for ID.");
        else if (!socket?.connected) alert("Not connected to server. Please wait or refresh.");
        // Re-enable button after short delay to prevent spamming
        setTimeout(() => {
            ui.playButton.disabled = false;
            validatePlayButtonState(); // Reset button text based on state
        }, 500);
        return;
    }

    console.log(`Sending join request as '${playerName}' (ID: ${localPlayerId}) with character '${selectedCharacter}'...`);
    socket.emit('playerJoinRequest', { name: playerName, character: selectedCharacter });
}

// --- Animation Loop ---
function animate() {
    animationFrameId = requestAnimationFrame(animate);

    if (renderer && scene && camera) {
        // Update logic (movement, interpolation etc.) would go here
        renderer.render(scene, camera);
    } else {
         // Only log warning once to avoid spamming console
         if (!animate.warned) {
             console.warn("Skipping frame render: Renderer, Scene or Camera not ready.");
             animate.warned = true;
         }
    }
}
animate.warned = false; // Initialize warning flag

// --- UI Management Functions ---
function showLoadingScreen(message = "Loading...", showPermanently = false) { /* ... as before ... */ }
function hideLoadingScreen() { /* ... as before ... */ }
function showHomeScreen() { /* ... as before ... */ }
function hideHomeScreen() { /* ... as before ... */ }
function showGameUI() { /* ... as before ... */ }
function hideGameUI() { /* ... as before ... */ }
function validatePlayButtonState() { /* ... as before ... */ }
// Re-add implementations for brevity
function showLoadingScreen(message = "Loading...", showPermanently = false) {
    ui.loadingMessage.textContent = message;
    ui.loadingScreen.classList.remove('hidden');
    if (!showPermanently) {
        ui.homeMenu.classList.add('hidden');
        ui.gameUi.classList.add('hidden');
    }
}
function hideLoadingScreen() { ui.loadingScreen.classList.add('hidden'); }
function showHomeScreen() {
    ui.homeMenu.classList.remove('hidden');
    hideLoadingScreen();
    hideGameUI();
    document.body.classList.remove('game-active');
    validatePlayButtonState();
    ui.playButton.textContent = 'Join Game'; // Reset button text potentially overridden by validatePlayButtonState
    if (isPointerLocked) { document.exitPointerLock(); }
}
function hideHomeScreen() { ui.homeMenu.classList.add('hidden'); }
function showGameUI() {
    ui.gameUi.classList.remove('hidden');
    ui.chatInput.disabled = true;
    isChatting = false;
    ui.leaderboard.classList.add('hidden');
    showLeaderboard = false;
    ui.crosshair.style.display = 'none'; // Hide initially, show on lock
}
function hideGameUI() {
    ui.gameUi.classList.add('hidden');
    ui.crosshair.style.display = 'none';
}
function validatePlayButtonState() {
    const nameEntered = ui.playerNameInput.value.trim().length > 0;
    const characterSelected = selectedCharacter !== null;
    const isConnectedAndHasId = socket && socket.connected && localPlayerId;

    ui.playButton.disabled = !(nameEntered && characterSelected && isConnectedAndHasId);

    // Update button text based on why it's disabled
    if (!ui.playButton.disabled) {
        ui.playButton.textContent = 'Join Game';
    } else if (!isConnectedAndHasId) {
        if (socket && socket.connected) { ui.playButton.textContent = 'Getting ID...'; }
        else { ui.playButton.textContent = 'Connecting...'; }
    } else if (!nameEntered) {
        ui.playButton.textContent = 'Enter Name';
    } else if (!characterSelected) {
        ui.playButton.textContent = 'Select Character';
    } else {
        ui.playButton.textContent = 'Join Game'; // Should not happen if logic is correct
    }
}


// --- Chat Functions ---
function addChatMessage(senderName, message, type = 'player') { /* ... as before ... */ }
function addSystemMessage(message) { /* ... as before ... */ }
function handleChatMessage(senderId, senderName, message) { /* ... as before ... */ }
function startChat() { /* ... as before ... */ }
function cancelChat() { /* ... as before ... */ }
function sendChat() { /* ... as before ... */ }
// Re-add implementations for brevity
function addChatMessage(senderName, message, type = 'player') {
    const item = document.createElement('li');
    let prefix = '';
     switch (type) {
        case 'system': item.classList.add('system-message'); break;
        case 'death': item.classList.add('death-message'); break;
        case 'join-leave': item.classList.add('join-leave-message'); break;
        case 'player':
        default:
            item.classList.add('player-message');
            if (senderName) { // Check if senderName is provided
                 const nameStrong = document.createElement('strong');
                 nameStrong.textContent = `${senderName}: `;
                 item.appendChild(nameStrong);
            }
            break;
    }
    item.appendChild(document.createTextNode(message)); // Append message content

    const shouldScroll = ui.chatMessages.scrollTop + ui.chatMessages.clientHeight >= ui.chatMessages.scrollHeight - 30;
    ui.chatMessages.appendChild(item);
    if (shouldScroll) { ui.chatMessages.scrollTop = ui.chatMessages.scrollHeight; }
}
function addSystemMessage(message) { console.info("System Message (Client Only):", message); }
function handleChatMessage(senderId, senderName, message) {
     console.log(`Chat received: ${senderName} (${senderId}): ${message}`);
     let type = 'player';
     let displayName = senderName;
     if (senderId === 'server') {
         if (message.includes('joined') || message.includes('left')) type = 'join-leave';
         else if (message.includes('eliminated') || message.includes('died')) type = 'death';
         else type = 'system';
         displayName = ''; // No name for server messages
     } else if (senderId === localPlayerId) {
         displayName = 'You'; // Use 'You' for self
     }
     addChatMessage(displayName, message, type);
}
function startChat() {
    if (!localPlayerId || !players[localPlayerId]) return;
    isChatting = true;
    ui.chatInput.disabled = false;
    ui.chatInput.focus();
    ui.chatContainer.style.opacity = '1';
    if (isPointerLocked) { document.exitPointerLock(); }
}
function cancelChat() {
    isChatting = false;
    ui.chatInput.disabled = true;
    ui.chatInput.value = '';
    ui.chatInput.blur();
    ui.chatContainer.style.opacity = '';
    requestPointerLock();
}
function sendChat() {
    const message = ui.chatInput.value.trim();
    if (message && socket?.connected && localPlayerId) {
        console.log("Sending chat:", message);
        socket.emit('chatMessage', message);
        cancelChat();
    } else {
        cancelChat(); // Cancel if message empty or not connected
    }
}


// --- Leaderboard Functions ---
function toggleLeaderboard() { /* ... as before ... */ }
function updateLeaderboard() { /* ... as before ... */ }
// Re-add implementations for brevity
function toggleLeaderboard() {
    showLeaderboard = !showLeaderboard;
    if (showLeaderboard) {
        updateLeaderboard();
        ui.leaderboard.classList.remove('hidden');
    } else {
        ui.leaderboard.classList.add('hidden');
    }
}
function updateLeaderboard() {
     if (!showLeaderboard || !ui.leaderboard || ui.leaderboard.classList.contains('hidden')) return;
     ui.leaderboardList.innerHTML = '';
     const sortedPlayers = Object.values(players)
        .sort((a, b) => (b.score || 0) - (a.score || 0) || (a.name || '').localeCompare(b.name || ''));
     sortedPlayers.forEach(player => {
         const item = document.createElement('li');
         if (player.id === localPlayerId) item.classList.add('is-local-player');
         const nameSpan = document.createElement('span');
         nameSpan.className = 'leaderboard-name';
         nameSpan.textContent = player.name || 'Unnamed';
         nameSpan.title = player.name || 'Unnamed';
         const scoreSpan = document.createElement('span');
         scoreSpan.className = 'leaderboard-score';
         scoreSpan.textContent = player.score || 0;
         item.appendChild(nameSpan);
         item.appendChild(scoreSpan);
         ui.leaderboardList.appendChild(item);
     });
}


// --- Pointer Lock ---
function requestPointerLock() { /* ... as before ... */ }
function handlePointerLockChange() { /* ... as before ... */ }
// Re-add implementations for brevity
function requestPointerLock() {
    if (socket?.connected && localPlayerId && players[localPlayerId] && !document.pointerLockElement && ui.gameCanvas.requestPointerLock) {
         console.log("Requesting pointer lock...");
         ui.gameCanvas.requestPointerLock().catch(err => console.error("Cannot request pointer lock:", err));
    }
}
function handlePointerLockChange() {
     if (document.pointerLockElement === ui.gameCanvas) {
        console.log('Pointer Locked');
        isPointerLocked = true;
        ui.crosshair.style.display = 'block';
    } else {
        console.log('Pointer Unlocked');
        isPointerLocked = false;
        ui.crosshair.style.display = 'none';
        if (!isChatting && players[localPlayerId]) {
            console.log("Pointer unlocked unexpectedly (e.g. Esc key).");
            // showPauseMenu();
        }
    }
}


// --- Utility Functions ---
function onWindowResize() { /* ... as before ... */ }
// Re-add implementation for brevity
function onWindowResize() {
    if (!camera || !renderer) return;
    const width = window.innerWidth;
    const height = window.innerHeight;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
    console.log("Window resized.");
}


// --- Start the application ---
init();
