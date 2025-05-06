// /docs/js/client.js
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.module.js'; // Use CDN for module
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

    // Connect to Socket.IO Server (Handles Render/Localhost automatically)
    const serverURL = window.location.origin.includes('onrender')
        ? 'https://gametest-psxl.onrender.com' // Your Render backend URL
        : `http://${window.location.hostname}:3000`; // Local backend URL (uses current hostname)
    console.log(`Connecting to server at: ${serverURL}`);

    // Configure Socket.IO
    socket = io(serverURL, {
        reconnectionAttempts: 5, // Try to reconnect a few times
        reconnectionDelay: 2000, // Wait 2 seconds between attempts
        transports: ['websocket'], // Prefer websockets
    });

    setupSocketListeners();
    setupUIListeners();

    // Initial UI state
    showLoadingScreen("Connecting to server...");
    ui.playButton.disabled = true; // Ensure play button is disabled initially
    validatePlayButtonState(); // Check if name/character allows enabling play button
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
        addSystemMessage(`Disconnected from server (${reason}). Attempting to reconnect...`);
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
        addSystemMessage('Could not reconnect to the server. Please refresh the page.');
        ui.connectionStatus.textContent = 'Connection failed. Refresh?';
        ui.connectionStatus.className = 'error';
         cleanupGameState(); // Ensure cleanup if reconnect fails permanently
    });


    socket.on('connect_error', (err) => {
        console.error('Connection Error:', err.message);
        ui.connectionStatus.textContent = 'Connection Error!';
        ui.connectionStatus.className = 'error';
        showLoadingScreen(`Connection failed: ${err.message}. Server might be down or check CORS settings.`, true);
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
            // Request ID again? Or reload?
            // socket.emit('requestMyId'); // Example - server would need to handle this
            return;
        }

        // Initialize Three.js scene if it hasn't been already
        if (!scene) {
            initThree();
        } else {
            // If scene exists (e.g., from previous game), clear old players/objects
            clearScene();
        }

        // --- Add the LOCAL player ---
        addPlayer(playerData); // Add self using server-provided data

        // Position the camera relative to the player AFTER the player object exists
        if (players[localPlayerId] && players[localPlayerId].object) {
             const playerObj = players[localPlayerId].object;
             // Place camera slightly behind and above the player model's head
             const camOffset = new THREE.Vector3(0, 1.6, 5); // x, y (height), z (distance)
             const worldOffset = camOffset.applyMatrix4(playerObj.matrixWorld); // Use world matrix if player is nested
             camera.position.copy(worldOffset);
             // Look slightly below the camera position towards the player model
             camera.lookAt(playerObj.position.x, playerObj.position.y + 1.0, playerObj.position.z);
        } else {
             // Fallback camera position if player object isn't ready (shouldn't happen ideally)
             console.error("Local player object not found immediately after addPlayer in initializeGame");
             camera.position.set(playerData.x, playerData.y + 5, playerData.z + 5); // Default offset
             camera.lookAt(new THREE.Vector3(playerData.x, playerData.y, playerData.z));
        }


        // --- Add all OTHER players already in the game ---
        Object.values(currentPlayers).forEach(playerInfo => {
            // Ensure not self and not already added (paranoid check)
            if (playerInfo.id !== localPlayerId && !players[playerInfo.id]) {
                addPlayer(playerInfo);
            }
        });

        // --- Transition UI ---
        hideHomeScreen();
        hideLoadingScreen();
        showGameUI();
        document.body.classList.add('game-active'); // Apply game styles (like background)

        // Start the animation loop if not already running
        if (!animationFrameId) {
             animate();
        }

        // Request pointer lock after a short delay to ensure UI transition is complete
        setTimeout(() => {
            requestPointerLock();
        }, 100); // 100ms delay, adjust if needed

        addSystemMessage(`Welcome, ${playerData.name}! Joined the game.`);
        updateLeaderboard(); // Show initial leaderboard state
    });


    // Handles players joining *after* you are already in
    socket.on('playerJoined', (playerData) => {
        // Only process if we are initialized, in game, and it's not us
        if (!localPlayerId || !scene || !players[localPlayerId] || playerData.id === localPlayerId) return;

        if (!players[playerData.id]) { // Only add if truly new to us
            console.log(`Player joined: ${playerData.name} (${playerData.id})`);
            addPlayer(playerData);
            // Don't add system message here, server sends it via chatMessage now
            // addSystemMessage(`${playerData.name || 'Someone'} joined the game.`);
            updateLeaderboard();
        } else {
            // This might happen if the server rebroadcasts for consistency or on player reconnect/update
            console.warn(`Received playerJoined for existing player: ${playerData.id}. Updating data.`);
            // Update existing player data just in case (name, character, position etc.)
             players[playerData.id].name = playerData.name;
             players[playerData.id].character = playerData.character;
             players[playerData.id].score = playerData.score;
             if (players[playerData.id].object) {
                 players[playerData.id].object.position.set(playerData.x, playerData.y, playerData.z);
                 players[playerData.id].object.rotation.y = playerData.rotationY;
             }
            updateLeaderboard(); // Update display name/score if needed
        }
    });

    // Handles player leaving
    socket.on('playerLeft', (playerId, playerName) => {
        if (players[playerId]) { // Check if the player exists locally
            console.log(`Player left event: ${playerName} (${playerId})`);
            removePlayer(playerId); // removePlayer handles scene removal and cleanup
            // Server now sends leave message via chat
            // addSystemMessage(`${playerName || 'Someone'} left the game.`);
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

    // --- Placeholder Death/Respawn Listeners ---
    // socket.on('playerDied', (victimId, killerId, victimName, killerName) => { /* ... */ });
    // socket.on('playerRespawn', (playerId, position) => { /* ... */ });

    // --- Placeholder Round/Map Listeners ---
    // socket.on('roundStart', (roundData) => { /* ... */ });
    // socket.on('roundOver', (roundResult) => { /* ... */ });
    // socket.on('mapVoteStart', (mapOptions) => { /* ... */ });
}

// --- UI Event Handlers ---
function setupUIListeners() {
    // Join Game Button
    ui.playButton.addEventListener('click', () => {
        if (ui.playButton.disabled) return; // Prevent action if disabled
        ui.playButton.disabled = true; // Disable immediately
        ui.playButton.textContent = 'Joining...';
        joinGame(); // Attempt to join
    });

    // Enable/Disable Play button based on Name Input
    ui.playerNameInput.addEventListener('input', validatePlayButtonState);

    // Allow joining by pressing Enter in the name input
    ui.playerNameInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !ui.playButton.disabled) {
            ui.playButton.click(); // Trigger the button click handler
        }
    });

    // Character Selection Buttons
    ui.characterButtons.forEach(button => {
        button.addEventListener('click', () => {
            if (button.disabled || button.classList.contains('disabled')) return; // Ignore clicks on disabled buttons

            ui.characterButtons.forEach(btn => btn.classList.remove('selected')); // Deselect others
            button.classList.add('selected'); // Select clicked button
            selectedCharacter = button.getAttribute('data-char');
            console.log("Selected character:", selectedCharacter);
            validatePlayButtonState(); // Re-check if play is possible
        });

         // Initialize button states (select default, disable others for now)
         if(button.getAttribute('data-char') === selectedCharacter) {
            button.classList.add('selected');
            // button.disabled = false; // Default is enabled unless marked disabled in HTML
         } else {
             // Keep disabled state from HTML, don't override here unless logic dictates
             // button.disabled = true;
         }
         // Add this check to prevent enabling explicitly disabled buttons
         if (button.classList.contains('disabled')) {
             button.disabled = true;
         }
    });


    // --- In-Game Input Listeners ---
    window.addEventListener('keydown', (event) => {
        // Ignore input if not connected, not in game, or if certain UI is active (e.g., future menus)
        if (!localPlayerId || !players[localPlayerId] || !socket?.connected) return;

        // Toggle Chat with 'T'
        if (event.key === 't' || event.key === 'T') {
            event.preventDefault(); // Prevent typing 't' into input
            if (!isChatting) {
                startChat();
            } else {
                // If input is empty when T is pressed again, cancel chat. Otherwise, do nothing (Enter sends).
                if (!ui.chatInput.value.trim()) {
                    cancelChat();
                }
            }
        }
        // Send Chat with Enter or Cancel with Escape (only when chatting)
        else if (isChatting) {
            if (event.key === 'Enter') {
                event.preventDefault();
                sendChat();
            } else if (event.key === 'Escape') {
                event.preventDefault();
                cancelChat();
            }
            // Don't process other game keys while chatting
            return;
        }
        // Toggle Leaderboard with 'L' (only when not chatting)
        else if (event.key === 'l' || event.key === 'L') {
             event.preventDefault();
             toggleLeaderboard();
        }
        // --- Movement / Action Keys (only when not chatting) ---
        else {
             handleGameKeyDown(event.key); // Pass key to separate handler
        }
    });

    window.addEventListener('keyup', (event) => {
         // Ignore if not in game or currently chatting
         if (!localPlayerId || !players[localPlayerId] || !socket?.connected || isChatting) return;
         handleGameKeyUp(event.key); // Pass key to separate handler
    });

     // Handle mouse clicks for shooting / interaction (only when pointer locked)
    ui.gameCanvas.addEventListener('click', () => {
        if (isPointerLocked && !isChatting) {
            // Handle shooting logic
            handleShoot();
        } else if (!isChatting) {
            // If not locked and not chatting, try to lock pointer
             requestPointerLock();
        }
    });

    // Handle pointer lock changes (browser events)
    document.addEventListener('pointerlockchange', handlePointerLockChange, false);
    document.addEventListener('mozpointerlockchange', handlePointerLockChange, false); // Firefox
    document.addEventListener('webkitpointerlockchange', handlePointerLockChange, false); // Chrome/Safari/Opera

    // Handle mouse movement for camera control (when pointer locked)
    document.addEventListener('mousemove', handleMouseMove, false);
}

// Separate handlers for game-specific key presses
function handleGameKeyDown(key) {
    // console.log("Game Key Down:", key); // Debugging
    switch (key.toLowerCase()) {
        case 'w': /* Start moving forward */ break;
        case 'a': /* Start moving left */ break;
        case 's': /* Start moving backward */ break;
        case 'd': /* Start moving right */ break;
        case ' ': /* Handle jump press */ break;
        case 'shift': /* Handle dash press/start */ break;
        case 'e': /* Mark E as held down for boost shot */ break;
        // Add more keys as needed (reload 'r', interact 'f', etc.)
    }
    // Send input state to server (will implement later)
    // sendInputState();
}

function handleGameKeyUp(key) {
     // console.log("Game Key Up:", key); // Debugging
    switch (key.toLowerCase()) {
        case 'w': /* Stop moving forward */ break;
        case 'a': /* Stop moving left */ break;
        case 's': /* Stop moving backward */ break;
        case 'd': /* Stop moving right */ break;
        case ' ': /* Handle jump release (if needed) */ break;
        case 'shift': /* Handle dash release/end */ break;
        case 'e': /* Mark E as released */ break;
    }
    // Send input state to server (will implement later)
    // sendInputState();
}

function handleShoot() {
     if (!isPointerLocked || !localPlayerId || !socket?.connected) return;
     console.log("Shoot Action Triggered!");
     // Check if 'E' is currently held (needs state tracking from keydown/keyup)
     // let isBoosting = keyState['e']; // Example state variable
     // socket.emit('playerShoot', { boost: isBoosting });
     socket.emit('playerShoot', { boost: false }); // Placeholder
}

// Handles mouse movement for camera rotation
function handleMouseMove(event) {
    if (!isPointerLocked || !camera || !players[localPlayerId]?.object) return;

    const movementX = event.movementX || event.mozMovementX || event.webkitMovementX || 0;
    const movementY = event.movementY || event.mozMovementY || event.webkitMovementY || 0;

    const playerObject = players[localPlayerId].object;

    // Horizontal rotation (around the Y axis) - applied to the player object itself
    const sensitivity = 0.002;
    playerObject.rotation.y -= movementX * sensitivity;

    // Vertical rotation (around the X axis) - applied to the camera object relative to the player
    // Clamp vertical rotation to prevent looking straight up/down or flipping over
    const maxPitch = Math.PI / 2 - 0.1; // Slightly less than 90 degrees
    const minPitch = -Math.PI / 2 + 0.1;
    camera.rotation.x -= movementY * sensitivity;
    camera.rotation.x = Math.max(minPitch, Math.min(maxPitch, camera.rotation.x));

    // Ensure camera rotation order is correct if needed (usually YXZ for FPS)
    camera.rotation.order = 'YXZ'; // Might need playerObject.rotation.order too? Test this.
    playerObject.rotation.order = 'YXZ';

     // We need to send rotation updates to the server
     // throttleSendRotationUpdate(playerObject.rotation.y, camera.rotation.x);
}


// --- Player Management ---
function addPlayer(playerData) {
    if (!scene) {
        console.error("Scene not initialized, cannot add player:", playerData.id);
        return;
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
        existingPlayer.rotationY = playerData.rotationY; // Server dictates rotation mainly

        if (existingPlayer.object) {
             existingPlayer.object.position.set(playerData.x, playerData.y, playerData.z);
             // Only update visual rotation for OTHERS, local player rotation driven by mouse
             if (playerData.id !== localPlayerId) {
                existingPlayer.object.rotation.y = playerData.rotationY;
             }
        }
        // Update leaderboard if needed (e.g., name change)
        if(showLeaderboard) updateLeaderboard();
        return; // Stop here, don't recreate mesh
    }

    console.log(`Creating visual for player: ${playerData.name} (${playerData.id}) at ${playerData.x.toFixed(2)}, ${playerData.y.toFixed(2)}, ${playerData.z.toFixed(2)}`);

    // --- Character Model Loading Placeholder ---
    // This is where you would load the GLB model based on playerData.character
    // const loader = new GLTFLoader();
    // loader.load(`assets/maps/${playerData.character}.glb`, (gltf) => { ... });
    // For now, use a placeholder mesh:

    const isLocal = playerData.id === localPlayerId;
    const geometry = new THREE.CapsuleGeometry(0.5, 0.8, 4, 8); // Radius, Height (excluding caps)
    geometry.translate(0, 0.4 + 0.5, 0); // Move pivot to base of capsule (half height + radius)
    const material = new THREE.MeshStandardMaterial({
        color: isLocal ? 0x5599ff : 0xff8855, // Blueish for self, Orangeish for others
        roughness: 0.7,
        metalness: 0.1
    });
    const playerMesh = new THREE.Mesh(geometry, material);
    playerMesh.position.set(playerData.x, playerData.y, playerData.z); // Set position from server
    playerMesh.rotation.y = playerData.rotationY; // Set initial rotation from server
    playerMesh.castShadow = true;
    playerMesh.receiveShadow = true; // Capsules can receive shadows too

    scene.add(playerMesh);
    // --- End Placeholder ---


    // Store player data locally
    players[playerData.id] = {
        id: playerData.id,
        name: playerData.name || 'Unknown',
        character: playerData.character || 'Shawty1',
        object: playerMesh, // Reference to the Three.js object
        score: playerData.score || 0,
        // Store position/rotation locally for reference / potential interpolation
        x: playerData.x,
        y: playerData.y,
        z: playerData.z,
        rotationY: playerData.rotationY,
    };

     // If adding the local player, attach the camera to its object
     if (isLocal && playerMesh) {
         // Make the camera a child of the player mesh for easier relative positioning/rotation
         playerMesh.add(camera);
         // Set camera's local position relative to the player model's origin (e.g., head height)
         camera.position.set(0, 1.6, 0.2); // x, y (eye height), z (slightly forward from center)
         // Camera's world position is now controlled by the playerMesh's position.
         // We already set the initial lookAt in initializeGame, vertical rotation is handled by mousemove.
     }


    console.log("Client players count:", Object.keys(players).length);
}

function removePlayer(playerId) {
    const player = players[playerId];
    if (player) {
        if (player.object) {
            // If camera was attached (local player), detach it first
            if (player.object === camera.parent) {
                 scene.attach(camera); // Re-attach camera to the main scene before removing player
            }
            scene.remove(player.object);
            // Proper disposal of resources
            if (player.object.geometry) player.object.geometry.dispose();
            if (player.object.material) {
                 // Handle array of materials if necessary
                 if (Array.isArray(player.object.material)) {
                     player.object.material.forEach(mat => mat.dispose());
                 } else {
                     player.object.material.dispose();
                 }
            }
        }
        const playerName = player.name || 'Someone';
        delete players[playerId]; // Remove from local store
        console.log(`Removed player ${playerName} (${playerId}). Remaining:`, Object.keys(players).length);
        // Server sends leave message via chat now
    } else {
         console.warn(`Tried to remove non-existent player: ${playerId}`);
    }
}

// Clear all player objects from the scene
function clearScene() {
    console.log("Clearing existing player objects from scene...");
    const idsToRemove = Object.keys(players);
    idsToRemove.forEach(id => {
         // Use the existing removePlayer logic, but don't show chat message
         removePlayer(id);
    });
    // Ensure local player reference is also cleared if somehow missed
    if (localPlayerId && players[localPlayerId]) {
        delete players[localPlayerId];
    }
    localPlayerId = null; // Reset local player ID reference as well during full clear
    console.log("Scene cleared of players.");
}

// Cleanup game state on disconnect or error
function cleanupGameState() {
     console.log("Cleaning up game state...");
     clearScene(); // Remove player objects

     // Stop animation loop
     if (animationFrameId) {
         cancelAnimationFrame(animationFrameId);
         animationFrameId = null;
         console.log("Animation loop stopped.");
     }

     // Clean up Three.js resources if renderer exists
     if (renderer) {
         console.log("Disposing Three.js renderer and scene...");
         // Remove event listeners? (Resize is main one)
         window.removeEventListener('resize', onWindowResize);
         document.removeEventListener('pointerlockchange', handlePointerLockChange);
         document.removeEventListener('mozpointerlockchange', handlePointerLockChange);
         document.removeEventListener('webkitpointerlockchange', handlePointerLockChange);
         document.removeEventListener('mousemove', handleMouseMove);

         // Dispose of scene resources (geometries, materials, textures)
         // This is complex; a simple approach is just letting go of references
         scene = null;
         camera = null; // Camera is part of scene graph, should be handled by scene disposal if done right

         renderer.dispose(); // Release WebGL context and resources
         renderer.forceContextLoss(); // Force context loss
         // Remove canvas from DOM or clear it? Optional.
         // ui.gameCanvas.parentNode.removeChild(ui.gameCanvas); // If dynamically added
         renderer = null; // Let garbage collector claim it

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
         document.exitPointerLock(); // Ensure pointer lock is released
     }
     validatePlayButtonState(); // Update play button state for menu
     console.log("Game state cleanup finished.");
}


// --- Game Logic ---
function joinGame() {
    const playerName = ui.playerNameInput.value.trim();

    // Validate inputs before sending request
    if (!playerName) {
        console.error("Player name is empty.");
        alert("Please enter a name!");
        ui.playButton.disabled = false; // Re-enable button
        ui.playButton.textContent = 'Join Game';
        return;
    }
    if (!selectedCharacter) {
        console.error("No character selected.");
        alert("Character selection error!"); // Should not happen if UI logic is correct
        ui.playButton.disabled = false;
        ui.playButton.textContent = 'Join Game';
        return;
    }
     if (!localPlayerId) {
         console.error("Cannot join: No local player ID assigned by server yet.");
        alert("Connecting to server... please wait.");
        ui.playButton.disabled = false; // Re-enable button
        ui.playButton.textContent = 'Join Game';
        ui.connectionStatus.textContent = 'Waiting for server ID...';
        ui.connectionStatus.className = '';
        return;
    }
     if (!socket || !socket.connected) {
         console.error("Cannot join: Socket not connected.");
         alert("Not connected to server. Please wait or refresh.");
         ui.playButton.disabled = false;
         ui.playButton.textContent = 'Join Game';
         ui.connectionStatus.textContent = 'Disconnected. Refresh?';
         ui.connectionStatus.className = 'error';
         return;
     }

    console.log(`Sending join request as '${playerName}' (ID: ${localPlayerId}) with character '${selectedCharacter}'...`);

    // --- Send join request to server ---
    // Server will validate and respond with 'initializeGame' if successful
    socket.emit('playerJoinRequest', { name: playerName, character: selectedCharacter });

    // Note: UI transition now happens inside the 'initializeGame' handler after server confirmation
}

// --- Animation Loop ---
function animate() {
    // Schedule next frame immediately
    animationFrameId = requestAnimationFrame(animate);

    // --- Delta Time Calculation (for smooth/framerate independent movement/physics) ---
    // const now = performance.now();
    // const delta = (now - lastTimestamp) / 1000; // Time since last frame in seconds
    // lastTimestamp = now;

    // --- Game Logic Updates Per Frame ---
    // updateMovement(delta); // Handle local player movement based on input state
    // updateCamera(); // Update camera position/rotation smoothly?
    // updatePlayerInterpolation(delta); // Smoothly move other players towards their latest known server position

    // Render the scene if everything is ready
    if (renderer && scene && camera) {
        renderer.render(scene, camera);
    } else {
         console.warn("Skipping frame render: Renderer, Scene or Camera not ready.");
         // Consider stopping the loop if essential components are missing after setup
         // cancelAnimationFrame(animationFrameId);
         // animationFrameId = null;
    }
}

// --- UI Management Functions ---
function showLoadingScreen(message = "Loading...", showPermanently = false) {
    ui.loadingMessage.textContent = message; // Update message
    ui.loadingScreen.classList.remove('hidden');
    if (!showPermanently) {
        ui.homeMenu.classList.add('hidden');
        ui.gameUi.classList.add('hidden');
    }
}

function hideLoadingScreen() {
    ui.loadingScreen.classList.add('hidden');
}

function showHomeScreen() {
    ui.homeMenu.classList.remove('hidden');
    hideLoadingScreen();
    hideGameUI();
    document.body.classList.remove('game-active');
    validatePlayButtonState(); // Re-evaluate button state
    ui.playButton.textContent = 'Join Game'; // Reset button text
    if (isPointerLocked) {
        document.exitPointerLock(); // Ensure cursor is unlocked when returning to menu
    }
}

function hideHomeScreen() {
    ui.homeMenu.classList.add('hidden');
}

function showGameUI() {
    ui.gameUi.classList.remove('hidden');
    // Reset UI states within the game UI if needed
    ui.chatInput.disabled = true; // Chat starts disabled
    isChatting = false;
    ui.leaderboard.classList.add('hidden'); // Leaderboard starts hidden
    showLeaderboard = false;
    ui.crosshair.style.display = 'block'; // Show crosshair
}

function hideGameUI() {
    ui.gameUi.classList.add('hidden');
     ui.crosshair.style.display = 'none'; // Hide crosshair when UI is hidden
}

// Checks conditions and enables/disables the Play button
function validatePlayButtonState() {
    const nameEntered = ui.playerNameInput.value.trim().length > 0;
    const characterSelected = selectedCharacter !== null; // Assuming selectedCharacter holds the ID or null
    const isConnected = socket && socket.connected && localPlayerId; // Ensure connected AND have received ID

    if (nameEntered && characterSelected && isConnected) {
        ui.playButton.disabled = false;
         ui.playButton.textContent = 'Join Game'; // Ensure text is correct when enabled
    } else {
        ui.playButton.disabled = true;
        // Optionally provide feedback why it's disabled
        if (!isConnected && ui.homeMenu && !ui.homeMenu.classList.contains('hidden')) {
             ui.playButton.textContent = 'Connecting...';
        } else if (!nameEntered) {
             ui.playButton.textContent = 'Enter Name';
        } else {
             ui.playButton.textContent = 'Select Character';
        }
    }
}


// --- Chat Functions ---
function addChatMessage(senderName, message, type = 'player') { // type: 'player', 'system', 'death', 'join-leave'
    const item = document.createElement('li');
    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); // HH:MM format

    // Add timestamp span (optional)
    // const timeSpan = document.createElement('span');
    // timeSpan.className = 'chat-timestamp';
    // timeSpan.textContent = `[${timestamp}] `;
    // item.appendChild(timeSpan);

    switch (type) {
        case 'system':
            item.classList.add('system-message');
            item.textContent = message;
            break;
        case 'death':
            item.classList.add('death-message');
            item.textContent = message; // e.g., "PlayerA eliminated PlayerB"
            break;
        case 'join-leave':
             item.classList.add('join-leave-message');
             item.textContent = message; // e.g., "PlayerC joined the game."
             break;
        case 'player':
        default:
            item.classList.add('player-message');
            const nameStrong = document.createElement('strong');
            nameStrong.textContent = `${senderName}: `;
            // Optional: Add class if it's the local player's message
            // if (isMyMessage) { item.classList.add('my-message'); }
            item.appendChild(nameStrong);
            item.appendChild(document.createTextNode(message)); // Use text node for safety
            break;
    }

    const shouldScroll = ui.chatMessages.scrollTop + ui.chatMessages.clientHeight >= ui.chatMessages.scrollHeight - 30; // Check if near bottom before adding

    ui.chatMessages.appendChild(item);

    // Auto-scroll to bottom only if user was already near the bottom
    if (shouldScroll) {
        ui.chatMessages.scrollTop = ui.chatMessages.scrollHeight;
    }
}

function addSystemMessage(message) {
    // Use the server's broadcast for system messages now
    // addChatMessage('System', message, 'system');
    // Client-side only messages if needed:
    console.info("System Message (Client):", message); // Log locally
}

// Handles messages received from the server broadcast
function handleChatMessage(senderId, senderName, message) {
     console.log(`Chat received: ${senderName} (${senderId}): ${message}`);
     let type = 'player';
     if (senderId === 'server') { // Identify system messages from server
         // Determine subtype based on content?
         if (message.includes('joined') || message.includes('left')) {
             type = 'join-leave';
         } else if (message.includes('eliminated') || message.includes('died')) { // Example keywords for death
             type = 'death';
         } else {
            type = 'system'; // Generic system message
         }
         senderName = ''; // Don't show sender name for system messages
     } else if (senderId === localPlayerId) {
         // Optional: Style own messages differently? Could use 'my-message' class here
         // senderName = 'You'; // Or keep own name
     }
     addChatMessage(senderName, message, type);
}


function startChat() {
    if (!localPlayerId || !players[localPlayerId]) return; // Only if in game
    isChatting = true;
    ui.chatInput.disabled = false;
    ui.chatInput.focus();
    ui.chatContainer.style.opacity = '1'; // Make chat more prominent?
    // Exit pointer lock if active
    if (isPointerLocked) {
        document.exitPointerLock();
    }
}

function cancelChat() {
    isChatting = false;
    ui.chatInput.disabled = true;
    ui.chatInput.value = '';
    ui.chatInput.blur(); // Remove focus
    ui.chatContainer.style.opacity = ''; // Reset opacity
    // Attempt to re-lock pointer immediately after cancelling chat
    // This might fail depending on browser, requiring another click
    requestPointerLock();
}

function sendChat() {
    const message = ui.chatInput.value.trim();
    if (message && socket && localPlayerId && socket.connected) {
        console.log("Sending chat:", message);
        // Send raw message to server, server handles formatting and broadcast
        socket.emit('chatMessage', message);
        cancelChat(); // Clear input and exit chat mode (which re-requests pointer lock)
    } else {
        // If message is empty, just cancel chat mode
        cancelChat();
    }
}

// --- Leaderboard Functions ---
function toggleLeaderboard() {
    showLeaderboard = !showLeaderboard;
    if (showLeaderboard) {
        updateLeaderboard(); // Update content when showing
        ui.leaderboard.classList.remove('hidden');
    } else {
        ui.leaderboard.classList.add('hidden');
    }
}

function updateLeaderboard() {
     // Don't update DOM if the leaderboard isn't visible
     if (!showLeaderboard) return;

     ui.leaderboardList.innerHTML = ''; // Clear existing list

     // Get player data from the local 'players' object
     const sortedPlayers = Object.values(players)
        .sort((a, b) => {
            // Sort by score descending first
            const scoreA = a.score || 0;
            const scoreB = b.score || 0;
            if (scoreB !== scoreA) {
                return scoreB - scoreA;
            }
            // If scores are equal, sort by name ascending (case-insensitive)
            return (a.name || '').localeCompare(b.name || '');
        });

    // Populate the list
    sortedPlayers.forEach(player => {
         const item = document.createElement('li');
         if (player.id === localPlayerId) {
             item.classList.add('is-local-player'); // Add class to highlight local player
         }

         const nameSpan = document.createElement('span');
         nameSpan.className = 'leaderboard-name';
         nameSpan.textContent = player.name || 'Unnamed';
         nameSpan.title = player.name || 'Unnamed'; // Tooltip for long names

         const scoreSpan = document.createElement('span');
         scoreSpan.className = 'leaderboard-score';
         scoreSpan.textContent = player.score || 0;

         item.appendChild(nameSpan);
         item.appendChild(scoreSpan);
         ui.leaderboardList.appendChild(item);
     });
}

// --- Pointer Lock ---
function requestPointerLock() {
    if (!document.pointerLockElement && ui.gameCanvas.requestPointerLock) {
         console.log("Requesting pointer lock...");
         ui.gameCanvas.requestPointerLock()
            .catch(err => console.error("Cannot request pointer lock:", err)); // Catch potential errors
    }
}

function handlePointerLockChange() {
     if (document.pointerLockElement === ui.gameCanvas) {
        console.log('Pointer Locked');
        isPointerLocked = true;
        ui.crosshair.style.display = 'block'; // Show crosshair when locked
        // Optional: Add a class to body for cursor hiding via CSS?
        // document.body.classList.add('pointer-locked');
    } else {
        console.log('Pointer Unlocked');
        isPointerLocked = false;
        ui.crosshair.style.display = 'none'; // Hide crosshair when unlocked
        // document.body.classList.remove('pointer-locked');
        // If we unlocked and were not intending to chat, maybe bring up a pause menu?
        if (!isChatting && players[localPlayerId]) { // Check if in game
            console.log("Pointer unlocked unexpectedly (e.g. Esc key).");
            // showPauseMenu(); // Implement pause menu later
        }
    }
}


// --- Utility Functions ---
function onWindowResize() {
    // Only resize if renderer and camera are initialized
    if (!camera || !renderer) return;

    const width = window.innerWidth;
    const height = window.innerHeight;

    camera.aspect = width / height;
    camera.updateProjectionMatrix();

    renderer.setSize(width, height);
    // No need to set pixel ratio again unless it changes
    console.log("Window resized.");
}

// --- Start the application ---
init();
