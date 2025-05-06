// /docs/js/client.js
import * as THREE from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.module.js';
// We'll import GLTFLoader later when we need it for models
// import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/jsm/loaders/GLTFLoader.js';

// --- Global Variables ---
let scene, camera, renderer;
let socket;
let localPlayerId = null; // This client's unique ID
const players = {}; // Store data about players in the game { id: { object, name, etc. } }

// --- UI Elements ---
const loadingScreen = document.getElementById('loading-screen');
const homeMenu = document.getElementById('home-menu');
const playButton = document.getElementById('playButton');
const playerNameInput = document.getElementById('playerNameInput');
const connectionStatus = document.getElementById('connection-status');
const gameUi = document.getElementById('game-ui');
const chatInput = document.getElementById('chat-input');
const chatMessages = document.getElementById('chat-messages');
const leaderboard = document.getElementById('leaderboard');
const leaderboardList = document.getElementById('leaderboard-list');
const gameCanvas = document.getElementById('gameCanvas'); // Get the canvas element

// --- Game State ---
let isChatting = false;
let showLeaderboard = false;
let selectedCharacter = 'Shawty1'; // Default character

// --- Initialization ---
function init() {
    console.log("Initializing client...");

    // Connect to Socket.IO Server
    // Use window.location.origin for Render deployment, or specify localhost for local dev
    const serverURL = window.location.origin.includes('onrender')
        ? 'https://gametest-psxl.onrender.com' // Your Render backend URL
        : 'http://localhost:3000';             // Your local backend URL
    console.log(`Connecting to server at: ${serverURL}`);
    socket = io(serverURL);

    setupSocketListeners();
    setupUIListeners();

    // Don't initialize Three.js until the player joins the game
    // initThree(); // Moved to after joining
    // animate(); // Moved to after joining

    // Initially, show loading screen, hide others
    showLoadingScreen("Connecting to server...");
}

function initThree() {
    console.log("Initializing Three.js...");
    // Scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xaaaaaa); // Light grey background for now

    // Camera
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.z = 5; // Move camera back a bit
    camera.position.y = 2;

    // Renderer
    renderer = new THREE.WebGLRenderer({ canvas: gameCanvas, antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    // document.body.appendChild(renderer.domElement); // We are using the existing canvas

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6); // Soft white light
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(5, 10, 7.5);
    scene.add(directionalLight);

    // Basic Floor (Temporary)
    const floorGeometry = new THREE.PlaneGeometry(100, 100);
    const floorMaterial = new THREE.MeshStandardMaterial({ color: 0x888888, side: THREE.DoubleSide });
    const floor = new THREE.Mesh(floorGeometry, floorMaterial);
    floor.rotation.x = -Math.PI / 2; // Rotate flat
    floor.position.y = -0.5; // Position slightly below origin
    scene.add(floor);

    // Handle window resize
    window.addEventListener('resize', onWindowResize, false);

    console.log("Three.js initialized.");
}

// --- Socket.IO Event Handlers ---
function setupSocketListeners() {
    socket.on('connect', () => {
        console.log('Connected to server!', socket.id);
        connectionStatus.textContent = 'Connected!';
        connectionStatus.style.color = '#4CAF50';
        // Now that we are connected, show the home menu
        showHomeScreen();
    });

    socket.on('disconnect', () => {
        console.log('Disconnected from server.');
        connectionStatus.textContent = 'Disconnected. Refresh to retry.';
        connectionStatus.style.color = '#ff6b6b';
        // Handle disconnection - maybe show menu again or an error message
        showHomeScreen(); // Or a specific disconnection screen
        // Clean up game state
        Object.keys(players).forEach(id => removePlayer(id));
        if (renderer) {
             // Maybe stop the animation loop
        }
        addSystemMessage("You have been disconnected.");
    });

    socket.on('connect_error', (err) => {
        console.error('Connection failed:', err.message);
        connectionStatus.textContent = `Connection failed: ${err.message}`;
        connectionStatus.style.color = '#ff6b6b';
        showLoadingScreen(`Connection failed. Check server or refresh.`, true); // Show error on loading screen
    });

    socket.on('yourId', (id) => {
        localPlayerId = id;
        console.log(`Server assigned ID: ${localPlayerId}`);
        // We wait for the player to click "Join Game" before adding them to the scene
    });

    socket.on('currentPlayers', (serverPlayers) => {
        console.log('Received current players:', serverPlayers);
        if (!localPlayerId || !players[localPlayerId]) {
            console.warn("Received currentPlayers before local player ID is set or local player joined");
            return; // Don't process if the local player isn't ready
        }
        Object.values(serverPlayers).forEach(playerData => {
            // Don't add self again, and only add if not already present
            if (playerData.id !== localPlayerId && !players[playerData.id]) {
                 console.log(`Adding existing player ${playerData.id} (${playerData.name || '...'})`);
                addPlayer(playerData);
            } else if (playerData.id === localPlayerId && players[localPlayerId]) {
                // Update local player's name if received from server (e.g., on rejoin)
                players[localPlayerId].name = playerData.name;
                updateLeaderboard();
            }
        });
    });

    socket.on('playerJoined', (playerData) => {
        if (!localPlayerId || !players[localPlayerId]) return; // Don't process if the local player isn't ready
        if (playerData.id === localPlayerId) return; // Don't add self
        console.log(`Player joined: ${playerData.id} (${playerData.name || 'Unknown'})`);
        if (!players[playerData.id]) {
            addPlayer(playerData);
            addSystemMessage(`${playerData.name || 'Someone'} joined the game.`);
            updateLeaderboard(); // Add new player to leaderboard
        } else {
            console.warn(`Player ${playerData.id} already exists.`);
            // Optionally update existing player data if needed
            players[playerData.id].name = playerData.name;
            updateLeaderboard();
        }
    });

    socket.on('playerLeft', (playerId, playerName) => {
        console.log(`Player left: ${playerId} (${playerName || 'Someone'})`);
        removePlayer(playerId);
        addSystemMessage(`${playerName || 'Someone'} left the game.`);
        updateLeaderboard(); // Remove player from leaderboard
    });

    // --- Placeholder Listeners ---
    // socket.on('gameState', (gameState) => { /* Update player positions etc. */ });
    // socket.on('chatMessage', (senderId, senderName, message) => { /* Display chat */ });
    // socket.on('playerDied', (victimId, victimName, killerName, reason) => { /* Show death log */ });
    // socket.on('playerRespawn', (playerId, position) => { /* Handle respawn */ });
    // socket.on('roundStart', (roundTime, mapName) => { /* Start round timer, show map */ });
    // socket.on('roundOver', (winnerName, leaderboardData) => { /* Show winner, final scores */ });
    // socket.on('nextRoundCountdown', (time) => { /* Update next round timer */ });
    // socket.on('mapVoteStart', (mapOptions) => { /* Show map vote UI */ });

}

// --- UI Event Handlers ---
function setupUIListeners() {
    playButton.addEventListener('click', joinGame);

    // Allow joining by pressing Enter in the name input
    playerNameInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            joinGame();
        }
    });

    // Placeholder for character selection later
    document.querySelectorAll('.character-option').forEach(button => {
        button.addEventListener('click', () => {
            // Remove selected class from others
            document.querySelectorAll('.character-option').forEach(btn => btn.classList.remove('selected'));
            // Add selected class to clicked button
            button.classList.add('selected');
            selectedCharacter = button.getAttribute('data-char');
            console.log("Selected character:", selectedCharacter);
            // Enable play button if name is also entered
             playButton.disabled = !playerNameInput.value.trim();
        });
        // Initially disable character buttons until we load previews/options
         button.disabled = true; // Re-enable when ready
         // Select the default one visually for now
         if(button.getAttribute('data-char') === selectedCharacter) {
            button.classList.add('selected');
            button.disabled = false; // Enable the default one
         }
    });

    // Enable play button only when a name is entered
    playerNameInput.addEventListener('input', () => {
        playButton.disabled = !playerNameInput.value.trim() || !selectedCharacter;
    });

    // --- In-Game Input Listeners ---
    window.addEventListener('keydown', (event) => {
        if (!localPlayerId || !players[localPlayerId]) return; // Only handle input if in game

        // Toggle Chat
        if (event.key === 't' || event.key === 'T') {
            event.preventDefault(); // Prevent typing 't' into the input
            if (!isChatting) {
                startChat();
            } else {
                // If input is empty, cancel chat. Otherwise, Enter sends.
                if (!chatInput.value) {
                    cancelChat();
                }
            }
        }
        // Send Chat Message
        else if (event.key === 'Enter' && isChatting) {
            event.preventDefault();
            sendChat();
        }
        // Cancel Chat
        else if (event.key === 'Escape' && isChatting) {
            event.preventDefault();
            cancelChat();
        }
        // Toggle Leaderboard
        else if (event.key === 'l' || event.key === 'L') {
             if (!isChatting) { // Don't toggle if typing in chat
                event.preventDefault();
                toggleLeaderboard();
             }
        }
        // --- Movement/Action keys (only if not chatting) ---
        else if (!isChatting) {
            switch (event.key.toLowerCase()) {
                case 'w': /* Handle forward */ break;
                case 'a': /* Handle left */ break;
                case 's': /* Handle backward */ break;
                case 'd': /* Handle right */ break;
                case ' ': /* Handle jump */ break;
                case 'shift': /* Handle dash start */ break;
                case 'e': /* Handle E key down (for boost shot) */ break;
            }
        }
    });

    window.addEventListener('keyup', (event) => {
         if (!localPlayerId || !players[localPlayerId] || isChatting) return; // Only handle input if in game and not chatting

         switch (event.key.toLowerCase()) {
            case 'w': /* Stop forward */ break;
            case 'a': /* Stop left */ break;
            case 's': /* Stop backward */ break;
            case 'd': /* Stop right */ break;
            case 'shift': /* Handle dash end */ break;
            case 'e': /* Handle E key up */ break;
        }
    });

    // Handle mouse clicks for shooting (only when pointer is locked)
    // gameCanvas.addEventListener('click', () => {
    //     if (document.pointerLockElement === gameCanvas && !isChatting) {
    //         // Handle shooting logic
    //         // Check if E is held down for boost shot
    //     } else if (!isChatting) {
    //         // Request pointer lock if not already chatting or locked
    //          gameCanvas.requestPointerLock();
    //     }
    // });

    // Handle pointer lock changes
    // document.addEventListener('pointerlockchange', handlePointerLockChange, false);
}

// --- Player Management ---
function addPlayer(playerData) {
    if (!scene) {
        console.error("Scene not initialized, cannot add player");
        return;
    }
     if (players[playerData.id]) {
        console.warn(`Attempted to add existing player: ${playerData.id}`);
        // Optionally update data instead of adding again
        players[playerData.id].name = playerData.name;
        // players[playerData.id].character = playerData.character; // Update character if needed
        return; // Exit, don't recreate the object
    }

    console.log(`Creating visual for player: ${playerData.id} (${playerData.name || 'Joining...'})`);
    // Simple cube placeholder for now
    const geometry = new THREE.BoxGeometry(1, 1.8, 1); // Approx human size
    const material = new THREE.MeshStandardMaterial({ color: Math.random() * 0xffffff }); // Random color
    const playerMesh = new THREE.Mesh(geometry, material);

    // Set initial position (Server should provide this, default for now)
    playerMesh.position.set(playerData.x || 0, playerData.y || 1, playerData.z || 0);
    // Set initial rotation (Server should provide this)
    // playerMesh.rotation.y = playerData.rotationY || 0;

    scene.add(playerMesh);

    players[playerData.id] = {
        id: playerData.id,
        name: playerData.name || 'Unknown',
        character: playerData.character || 'Shawty1', // Store selected character
        object: playerMesh, // Reference to the Three.js object
        // Add score later: score: playerData.score || 0
    };
    console.log("Current client players:", players);
}

function removePlayer(playerId) {
    if (players[playerId] && players[playerId].object) {
        scene.remove(players[playerId].object);
        // Dispose geometry/material later if needed
    }
    delete players[playerId];
    console.log(`Removed player ${playerId}. Current client players:`, players);
}

// --- Game Logic ---
function joinGame() {
    const playerName = playerNameInput.value.trim();
    if (!playerName) {
        alert("Please enter a name!");
        return;
    }
    if (!selectedCharacter) {
        alert("Character selection error!"); // Should not happen if UI logic is correct
        return;
    }

    console.log(`Attempting to join game as '${playerName}' with character '${selectedCharacter}'...`);
    playButton.disabled = true;
    playButton.textContent = 'Joining...';

    // Initialize Three.js scene now
    if (!scene) {
        initThree();
    }
     if (!renderer) {
        console.error("Renderer not initialized before joinGame");
        return;
    }

    // Add the local player visually (will be updated by server state later)
    // We create it client-side first for immediate feedback
     addPlayer({
        id: localPlayerId, // Use the ID we got from the server
        name: playerName,
        character: selectedCharacter,
        // Initial position might be overridden by server spawn point
        x: 0, y: 1, z: 0
     });


    // --- Send join request to server ---
    socket.emit('playerJoinRequest', { name: playerName, character: selectedCharacter });

    // --- Transition UI ---
    hideHomeScreen();
    hideLoadingScreen();
    showGameUI();
    document.body.classList.add('game-active'); // Apply game styles

    // Start the animation loop
    animate();

    // Lock pointer - requires user interaction (click) typically,
    // but we can try after the button click that initiated joinGame
    // gameCanvas.requestPointerLock();

    // Add initial join message to chat
    addSystemMessage(`Welcome, ${playerName}! Game starting...`);
    updateLeaderboard(); // Show initial leaderboard state
}

// --- Animation Loop ---
function animate() {
    if (!renderer) return; // Stop if renderer isn't available (e.g., after disconnect)
    requestAnimationFrame(animate);

    // --- Game Logic Updates (Client-side prediction, interpolation etc. will go here later) ---

    // Example: Make other players' cubes spin slowly
    Object.values(players).forEach(player => {
        if (player.id !== localPlayerId && player.object) {
            // player.object.rotation.y += 0.01; // Temporary visual feedback
        }
    });

    // Render the scene
    renderer.render(scene, camera);
}

// --- UI Management Functions ---
function showLoadingScreen(message = "Loading Assets...", showPermanently = false) {
    loadingScreen.classList.remove('hidden');
    const progressText = document.getElementById('loading-progress');
    if (progressText) progressText.textContent = message;
    if (!showPermanently) {
        homeMenu.classList.add('hidden');
        gameUi.classList.add('hidden');
    }
}

function hideLoadingScreen() {
    loadingScreen.classList.add('hidden');
}

function showHomeScreen() {
    homeMenu.classList.remove('hidden');
    hideLoadingScreen();
    gameUi.classList.add('hidden');
    document.body.classList.remove('game-active');
    playButton.disabled = !playerNameInput.value.trim() || !selectedCharacter; // Re-evaluate button state
    playButton.textContent = 'Join Game';
    if (document.pointerLockElement === gameCanvas) {
        document.exitPointerLock(); // Unlock cursor if coming back to menu
    }
}

function hideHomeScreen() {
    homeMenu.classList.add('hidden');
}

function showGameUI() {
    gameUi.classList.remove('hidden');
}

function hideGameUI() {
    gameUi.classList.add('hidden');
}

// --- Chat Functions ---
function addChatMessage(senderName, message, isSystem = false, isDeath = false) {
    const item = document.createElement('li');
    if (isSystem) {
        item.classList.add('system-message');
        item.textContent = message;
    } else if (isDeath) {
         item.classList.add('death-message');
         item.textContent = message; // e.g., "PlayerA was killed by PlayerB"
    }
     else {
        item.classList.add('player-message');
        const nameSpan = document.createElement('strong');
        nameSpan.textContent = `${senderName}: `;
        item.appendChild(nameSpan);
        item.appendChild(document.createTextNode(message));
    }
    chatMessages.appendChild(item);
    // Auto-scroll to bottom
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function addSystemMessage(message) {
    addChatMessage(null, message, true);
}

function startChat() {
    isChatting = true;
    chatInput.disabled = false;
    chatInput.focus();
    // Maybe show chat input more prominently or add a backdrop
    // Exit pointer lock if active
    if (document.pointerLockElement === gameCanvas) {
        document.exitPointerLock();
    }
}

function cancelChat() {
    isChatting = false;
    chatInput.disabled = true;
    chatInput.value = '';
    chatInput.blur(); // Remove focus
    // Request pointer lock again if needed (usually requires a click)
    // gameCanvas.requestPointerLock(); // Might not work without direct user action
}

function sendChat() {
    const message = chatInput.value.trim();
    if (message && socket && localPlayerId) {
        console.log("Sending chat:", message);
        // socket.emit('chatMessage', message); // Send to server (implement server handler later)

        // --- Client-side prediction (display immediately) ---
        // This will be replaced by server confirmation later for consistency
        const localPlayerName = players[localPlayerId]?.name || 'You';
        addChatMessage(localPlayerName, message);
        // ----------------------------------------------------

        cancelChat(); // Clear input and exit chat mode
    } else {
        cancelChat(); // Cancel if message is empty
    }
}

// --- Leaderboard Functions ---
function toggleLeaderboard() {
    showLeaderboard = !showLeaderboard;
    if (showLeaderboard) {
        updateLeaderboard(); // Update content when showing
        leaderboard.classList.remove('hidden');
    } else {
        leaderboard.classList.add('hidden');
    }
}

function updateLeaderboard() {
     if (!showLeaderboard) return; // Don't update if hidden

     leaderboardList.innerHTML = ''; // Clear existing list

     // Get players, sort by score (descending), then name (ascending)
    const sortedPlayers = Object.values(players)
        .sort((a, b) => {
            // Sort by score descending first (add score property later)
            // const scoreA = a.score || 0;
            // const scoreB = b.score || 0;
            // if (scoreB !== scoreA) {
            //     return scoreB - scoreA;
            // }
            // If scores are equal, sort by name ascending
            return a.name.localeCompare(b.name);
        });

    sortedPlayers.forEach(player => {
         const item = document.createElement('li');
         const nameSpan = document.createElement('span');
         nameSpan.className = 'leaderboard-name';
         nameSpan.textContent = player.name;
         // Highlight local player?
         if (player.id === localPlayerId) {
            nameSpan.style.fontWeight = 'bold';
            nameSpan.style.color = '#6fa8dc'; // Example highlight color
         }

         const scoreSpan = document.createElement('span');
         scoreSpan.className = 'leaderboard-score';
         scoreSpan.textContent = player.score || 0; // Use 0 if score is missing

         item.appendChild(nameSpan);
         item.appendChild(scoreSpan);
         leaderboardList.appendChild(item);
     });
}


// --- Utility Functions ---
function onWindowResize() {
    if (!camera || !renderer) return;
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// --- Start the application ---
init();
