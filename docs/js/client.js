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
    loadingMessage: document.getElementById('loading-message'),
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
    gameCanvas: document.getElementById('gameCanvas'),
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
    const isProduction = window.location.origin.includes('onrender.com') || window.location.origin.includes('github.io');
    const serverURL = isProduction
        ? 'https://gametest-psxl.onrender.com' // Production backend (Render)
        : 'http://localhost:3000';             // Local development backend
    console.log(`Connecting to server at: ${serverURL}`);

    if (typeof io === 'undefined') {
        console.error("Socket.IO client library (io) not loaded. Check script tag in index.html.");
        showLoadingScreen("Error: Cannot load network library. Please refresh.", true);
        return;
    }
    socket = io(serverURL, {
        reconnectionAttempts: 5,
        reconnectionDelay: 2000,
        transports: ['websocket'],
    });

    setupSocketListeners();
    setupUIListeners();

    showLoadingScreen("Connecting to server...");
    ui.playButton.disabled = true;
    validatePlayButtonState();
}

function initThree() {
    console.log("Initializing Three.js...");
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87CEEB); // Classic Sky Blue
    scene.fog = new THREE.Fog(0x87CEEB, 50, 150); // Fog matches background

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);

    renderer = new THREE.WebGLRenderer({
        canvas: ui.gameCanvas,
        antialias: true
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // --- Lighting Adjustments ---
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7); // Increased ambient intensity
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.5); // Increased directional intensity
    directionalLight.position.set(20, 35, 25); // Adjusted position slightly
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    directionalLight.shadow.camera.near = 0.5;
    directionalLight.shadow.camera.far = 100;
    const shadowCamSize = 35;
    directionalLight.shadow.camera.left = -shadowCamSize;
    directionalLight.shadow.camera.right = shadowCamSize;
    directionalLight.shadow.camera.top = shadowCamSize;
    directionalLight.shadow.camera.bottom = -shadowCamSize;
    directionalLight.shadow.bias = -0.0005;
    scene.add(directionalLight);
    scene.add(directionalLight.target);


    const floorGeometry = new THREE.PlaneGeometry(200, 200);
    const floorMaterial = new THREE.MeshStandardMaterial({
        color: 0x778899, // Slate grey floor
        metalness: 0.1,
        roughness: 0.8,
        side: THREE.DoubleSide
    });
    const floor = new THREE.Mesh(floorGeometry, floorMaterial);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0;
    floor.receiveShadow = true;
    scene.add(floor);

    window.addEventListener('resize', onWindowResize, false);
    console.log("Three.js initialized.");
}

// --- Socket.IO Event Handlers ---
function setupSocketListeners() {
    socket.on('connect', () => {
        console.log('Connected to server!', socket.id);
        ui.connectionStatus.textContent = 'Connected!';
        ui.connectionStatus.className = 'connected';
        showHomeScreen();
        validatePlayButtonState();
    });

    socket.on('disconnect', (reason) => {
        console.warn(`Disconnected from server. Reason: ${reason}`);
        addChatMessage('System', 'You have been disconnected.', 'system');
        showHomeScreen();
        ui.connectionStatus.textContent = 'Disconnected. Retrying...';
        ui.connectionStatus.className = 'error';
        cleanupGameState();
    });

    socket.on('reconnect_attempt', (attemptNumber) => {
        console.log(`Reconnect attempt ${attemptNumber}...`);
        ui.connectionStatus.textContent = `Reconnecting (${attemptNumber})...`;
        ui.connectionStatus.className = '';
    });

    socket.on('reconnect_failed', () => {
        console.error('Failed to reconnect to the server.');
        addChatMessage('System', 'Could not reconnect to the server. Please refresh the page.', 'system');
        ui.connectionStatus.textContent = 'Connection failed. Refresh?';
        ui.connectionStatus.className = 'error';
         cleanupGameState();
    });

    socket.on('connect_error', (err) => {
        console.error('Connection Error:', err.message);
        ui.connectionStatus.textContent = 'Connection Error!';
        ui.connectionStatus.className = 'error';
        showLoadingScreen(`Connection failed: ${err.message}. Server might be down or check CORS.`, true);
        cleanupGameState();
    });

    socket.on('yourId', (id) => {
        localPlayerId = id;
        console.log(`Server assigned ID: ${localPlayerId}`);
        validatePlayButtonState();
    });

    socket.on('initializeGame', (data) => {
        console.log("Received initializeGame data:", data);
        const { playerData, currentPlayers } = data;
        if (!localPlayerId || localPlayerId !== playerData.id) { console.error("Init data ID mismatch."); return; }
        if (!scene) { initThree(); } else { clearScene(); }

        try { addPlayer(playerData); }
        catch (error) { console.error("Error adding local player:", error); addChatMessage('System',"Error loading player.", 'system'); showHomeScreen(); cleanupGameState(); return; }

        if (players[localPlayerId] && players[localPlayerId].object) {
             const playerObj = players[localPlayerId].object;
             playerObj.add(camera);
             camera.position.set(0, 1.6 - 0.9, 0.2); camera.rotation.set(0, 0, 0);
        } else { console.error("Local player object missing after addPlayer."); camera.position.set(playerData.x, playerData.y + 5, playerData.z + 5); camera.lookAt(new THREE.Vector3(playerData.x, playerData.y, playerData.z)); }

        Object.values(currentPlayers).forEach(playerInfo => {
            if (playerInfo.id !== localPlayerId && !players[playerInfo.id]) {
                 try { addPlayer(playerInfo); } catch (error) { console.error(`Error adding other player ${playerInfo.id}:`, error); }
            }
        });
        hideHomeScreen(); hideLoadingScreen(); showGameUI(); document.body.classList.add('game-active');
        if (!animationFrameId) { animate(); }
        setTimeout(() => { requestPointerLock(); }, 100);
        updateLeaderboard();
    });

    socket.on('playerJoined', (playerData) => {
        if (!localPlayerId || !scene || !players[localPlayerId] || playerData.id === localPlayerId) return;
        if (!players[playerData.id]) {
            console.log(`Player joined: ${playerData.name} (${playerData.id})`);
             try { addPlayer(playerData); updateLeaderboard(); } catch (error) { console.error(`Error adding joining player ${playerData.id}:`, error); }
        } else {
            console.warn(`playerJoined for existing player: ${playerData.id}. Updating.`);
             const p = players[playerData.id]; p.name = playerData.name; p.character = playerData.character; p.score = playerData.score;
             if (p.object) { p.object.position.set(playerData.x, playerData.y + 0.9, playerData.z); if (playerData.id !== localPlayerId) { p.object.rotation.y = playerData.rotationY; } }
             updateLeaderboard();
        }
    });

    socket.on('playerLeft', (playerId, playerName) => {
        if (players[playerId]) { console.log(`Player left: ${playerName} (${playerId})`); removePlayer(playerId); updateLeaderboard(); }
        else { console.warn(`playerLeft for unknown ID: ${playerId}`); }
    });

    socket.on('chatMessage', (senderId, senderName, message) => { handleChatMessage(senderId, senderName, message); });
    // socket.on('gameStateUpdate', (stateUpdates) => { /* process updates */ });
}

// --- UI Event Handlers ---
function setupUIListeners() {
    ui.playButton.addEventListener('click', () => { if (ui.playButton.disabled) return; ui.playButton.disabled = true; ui.playButton.textContent = 'Joining...'; joinGame(); });
    ui.playerNameInput.addEventListener('input', validatePlayButtonState);
    ui.playerNameInput.addEventListener('keypress', (e) => { if (e.key === 'Enter' && !ui.playButton.disabled) { ui.playButton.click(); } });
    ui.characterButtons.forEach(button => {
        button.addEventListener('click', () => {
            if (button.disabled || button.classList.contains('disabled')) return;
            ui.characterButtons.forEach(btn => btn.classList.remove('selected')); button.classList.add('selected'); selectedCharacter = button.getAttribute('data-char'); console.log("Selected char:", selectedCharacter); validatePlayButtonState();
        });
         if(button.getAttribute('data-char') === selectedCharacter) { button.classList.add('selected'); } if (button.classList.contains('disabled')) { button.disabled = true; }
    });

    window.addEventListener('keydown', (event) => {
        if (!localPlayerId || !players[localPlayerId] || !socket?.connected) return;
        if (event.key === 't' || event.key === 'T') { event.preventDefault(); if (!isChatting) { startChat(); } else { if (!ui.chatInput.value.trim()) { cancelChat(); } } }
        else if (isChatting) { if (event.key === 'Enter') { event.preventDefault(); sendChat(); } else if (event.key === 'Escape') { event.preventDefault(); cancelChat(); } return; }
        else if (event.key === 'l' || event.key === 'L') { event.preventDefault(); toggleLeaderboard(); }
        else { handleGameKeyDown(event.key); }
    });
    window.addEventListener('keyup', (event) => { if (!localPlayerId || !players[localPlayerId] || !socket?.connected || isChatting) return; handleGameKeyUp(event.key); });

    ui.gameCanvas.addEventListener('click', () => {
        if (isPointerLocked && !isChatting) { handleShoot(); }
        else if (!isChatting) { console.log("Canvas clicked, not locked, not chatting. Attempting lock..."); requestPointerLock(); } // Added log
        else { ui.chatInput.focus(); }
    });

    document.addEventListener('pointerlockchange', handlePointerLockChange, false); document.addEventListener('mozpointerlockchange', handlePointerLockChange, false); document.addEventListener('webkitpointerlockchange', handlePointerLockChange, false);
    document.addEventListener('mousemove', handleMouseMove, false);
}

// --- Game Key Handlers ---
function handleGameKeyDown(key) {
    switch (key.toLowerCase()) {
        case 'w': /* Start forward */ break; case 'a': /* Start left */ break; case 's': /* Start backward */ break; case 'd': /* Start right */ break;
        case ' ': /* Jump press */ break; case 'shift': /* Dash press */ break; case 'e': /* E held down */ break;
    }
    // sendInputState();
}
function handleGameKeyUp(key) {
    switch (key.toLowerCase()) {
        case 'w': /* Stop forward */ break; case 'a': /* Stop left */ break; case 's': /* Stop backward */ break; case 'd': /* Stop right */ break;
        case ' ': /* Jump release */ break; case 'shift': /* Dash release */ break; case 'e': /* E released */ break;
    }
    // sendInputState();
}
function handleShoot() { if (!isPointerLocked || !localPlayerId || !socket?.connected) return; console.log("Shoot!"); socket.emit('playerShoot', { boost: false }); }
function handleMouseMove(event) {
    if (!isPointerLocked || !camera || !players[localPlayerId]?.object) return; const movementX = event.movementX || 0; const movementY = event.movementY || 0;
    const playerObject = players[localPlayerId].object; const sensitivity = 0.002; playerObject.rotation.y -= movementX * sensitivity;
    const maxPitch = Math.PI / 2 - 0.1; const minPitch = -Math.PI / 2 + 0.1; camera.rotation.x -= movementY * sensitivity;
    camera.rotation.x = Math.max(minPitch, Math.min(maxPitch, camera.rotation.x)); playerObject.rotation.order = 'YXZ'; camera.rotation.order = 'YXZ';
    // throttleSendRotationUpdate(playerObject.rotation.y, camera.rotation.x);
}

// --- Player Management ---
function addPlayer(playerData) {
    if (!scene) { throw new Error("Scene not initialized."); }
     if (players[playerData.id]) { console.warn(`Player ${playerData.id} exists. Updating.`); const p = players[playerData.id]; p.name = playerData.name; p.character = playerData.character; p.score = playerData.score; p.x = playerData.x; p.y = playerData.y; p.z = playerData.z; p.rotationY = playerData.rotationY; if (p.object) { p.object.position.set(p.x, p.y + 0.9, p.z); if (p.id !== localPlayerId) { p.object.rotation.y = p.rotationY; } } if(showLeaderboard) updateLeaderboard(); return; }
    console.log(`Creating visual for player: ${playerData.name} (${playerData.id})`); const isLocal = playerData.id === localPlayerId; const geometry = new THREE.BoxGeometry(0.8, 1.8, 0.8); const material = new THREE.MeshStandardMaterial({ color: isLocal ? 0x5599ff : 0xff8855, roughness: 0.7, metalness: 0.1 }); const playerMesh = new THREE.Mesh(geometry, material); playerMesh.position.set(playerData.x, playerData.y + 0.9, playerData.z); playerMesh.rotation.y = playerData.rotationY; playerMesh.castShadow = true; playerMesh.receiveShadow = true; scene.add(playerMesh);
    players[playerData.id] = { id: playerData.id, name: playerData.name || 'Unknown', character: playerData.character || 'Shawty1', object: playerMesh, score: playerData.score || 0, x: playerData.x, y: playerData.y, z: playerData.z, rotationY: playerData.rotationY, };
    if (isLocal && playerMesh) { playerMesh.add(camera); camera.position.set(0, 1.6 - 0.9, 0.2); camera.rotation.set(0, 0, 0); }
    console.log("Player count:", Object.keys(players).length);
}
function removePlayer(playerId) {
    const player = players[playerId]; if (player) { if (player.object) { if (player.object === camera.parent) { player.object.getWorldPosition(camera.position); player.object.getWorldQuaternion(camera.quaternion); scene.add(camera); console.log("Camera detached."); } scene.remove(player.object); if (player.object.geometry) player.object.geometry.dispose(); if (player.object.material) { if (Array.isArray(player.object.material)) { player.object.material.forEach(mat => mat.dispose()); } else { player.object.material.dispose(); } } } const playerName = player.name || 'Someone'; delete players[playerId]; console.log(`Removed ${playerName} (${playerId}). Remaining:`, Object.keys(players).length); } else { console.warn(`Remove non-existent player: ${playerId}`); }
}
function clearScene() { console.log("Clearing scene..."); const ids = Object.keys(players); ids.forEach(id => { removePlayer(id); }); console.log("Scene cleared."); }
function cleanupGameState() {
     console.log("Cleaning up game state..."); clearScene(); if (animationFrameId) { cancelAnimationFrame(animationFrameId); animationFrameId = null; console.log("Anim loop stopped."); }
     if (renderer) { console.log("Disposing Three.js..."); window.removeEventListener('resize', onWindowResize); document.removeEventListener('pointerlockchange', handlePointerLockChange); document.removeEventListener('mozpointerlockchange', handlePointerLockChange); document.removeEventListener('webkitpointerlockchange', handlePointerLockChange); document.removeEventListener('mousemove', handleMouseMove); scene = null; camera = null; renderer.dispose(); renderer.forceContextLoss(); renderer = null; console.log("Three.js cleanup done."); }
     isChatting = false; showLeaderboard = false; isPointerLocked = false; localPlayerId = null; ui.chatInput.value = ''; ui.chatInput.disabled = true; ui.chatMessages.innerHTML = ''; ui.leaderboardList.innerHTML = ''; ui.leaderboard.classList.add('hidden'); ui.gameUi.classList.add('hidden'); document.body.classList.remove('game-active'); if (document.pointerLockElement) { document.exitPointerLock(); } validatePlayButtonState(); console.log("Cleanup finished.");
}

// --- Game Logic ---
function joinGame() {
    const playerName = ui.playerNameInput.value.trim(); if (!playerName || !selectedCharacter || !localPlayerId || !socket || !socket.connected) { console.error("Join validation failed:", { playerName, selectedCharacter, localPlayerId, connected: socket?.connected }); if (!playerName) alert("Enter name!"); else if (!selectedCharacter) alert("Select char!"); else if (!localPlayerId) alert("Wait for ID."); else if (!socket?.connected) alert("Not connected."); setTimeout(() => { ui.playButton.disabled = false; validatePlayButtonState(); }, 500); return; }
    console.log(`Join request: '${playerName}' (${localPlayerId}) char '${selectedCharacter}'`); socket.emit('playerJoinRequest', { name: playerName, character: selectedCharacter });
}

// --- Animation Loop ---
function animate() {
    animationFrameId = requestAnimationFrame(animate); if (renderer && scene && camera) { renderer.render(scene, camera); } else { if (!animate.warned) { console.warn("Render skip: Components not ready."); animate.warned = true; } }
}
animate.warned = false;

// --- UI Management Functions ---
function showLoadingScreen(message = "Loading...", showPermanently = false) { ui.loadingMessage.textContent = message; ui.loadingScreen.classList.remove('hidden'); if (!showPermanently) { ui.homeMenu.classList.add('hidden'); ui.gameUi.classList.add('hidden'); } }
function hideLoadingScreen() { ui.loadingScreen.classList.add('hidden'); }
function showHomeScreen() { ui.homeMenu.classList.remove('hidden'); hideLoadingScreen(); hideGameUI(); document.body.classList.remove('game-active'); validatePlayButtonState(); ui.playButton.textContent = 'Join Game'; if (isPointerLocked) { document.exitPointerLock(); } }
function hideHomeScreen() { ui.homeMenu.classList.add('hidden'); }
function showGameUI() { ui.gameUi.classList.remove('hidden'); ui.chatInput.disabled = true; isChatting = false; ui.leaderboard.classList.add('hidden'); showLeaderboard = false; ui.crosshair.style.display = 'none'; }
function hideGameUI() { ui.gameUi.classList.add('hidden'); ui.crosshair.style.display = 'none'; }
function validatePlayButtonState() {
    const nameEntered = ui.playerNameInput.value.trim().length > 0; const characterSelected = selectedCharacter !== null; const isConnectedAndHasId = socket && socket.connected && localPlayerId; ui.playButton.disabled = !(nameEntered && characterSelected && isConnectedAndHasId);
    if (!ui.playButton.disabled) { ui.playButton.textContent = 'Join Game'; } else if (!isConnectedAndHasId) { if (socket && socket.connected) { ui.playButton.textContent = 'Getting ID...'; } else { ui.playButton.textContent = 'Connecting...'; } } else if (!nameEntered) { ui.playButton.textContent = 'Enter Name'; } else if (!characterSelected) { ui.playButton.textContent = 'Select Character'; } else { ui.playButton.textContent = 'Join Game'; }
}

// --- Chat Functions ---
function addChatMessage(senderName, message, type = 'player') {
    const item = document.createElement('li'); switch (type) { case 'system': item.classList.add('system-message'); break; case 'death': item.classList.add('death-message'); break; case 'join-leave': item.classList.add('join-leave-message'); break; case 'player': default: item.classList.add('player-message'); if (senderName) { const nameStrong = document.createElement('strong'); nameStrong.textContent = `${senderName}: `; item.appendChild(nameStrong); } break; } item.appendChild(document.createTextNode(message));
    const shouldScroll = ui.chatMessages.scrollTop + ui.chatMessages.clientHeight >= ui.chatMessages.scrollHeight - 30; ui.chatMessages.appendChild(item); if (shouldScroll) { ui.chatMessages.scrollTop = ui.chatMessages.scrollHeight; }
}
function addSystemMessage(message) { console.info("System Message (Client Only):", message); }
function handleChatMessage(senderId, senderName, message) {
     console.log(`Chat: ${senderName}(${senderId}): ${message}`); let type = 'player', displayName = senderName; if (senderId === 'server') { if (message.includes('joined') || message.includes('left')) type = 'join-leave'; else if (message.includes('eliminated') || message.includes('died')) type = 'death'; else type = 'system'; displayName = ''; } else if (senderId === localPlayerId) { displayName = 'You'; } addChatMessage(displayName, message, type);
}
function startChat() { if (!localPlayerId || !players[localPlayerId]) return; isChatting = true; ui.chatInput.disabled = false; ui.chatInput.focus(); ui.chatContainer.style.opacity = '1'; if (isPointerLocked) { document.exitPointerLock(); } }
function cancelChat() { isChatting = false; ui.chatInput.disabled = true; ui.chatInput.value = ''; ui.chatInput.blur(); ui.chatContainer.style.opacity = ''; requestPointerLock(); }
function sendChat() { const message = ui.chatInput.value.trim(); if (message && socket?.connected && localPlayerId) { console.log("Send chat:", message); socket.emit('chatMessage', message); cancelChat(); } else { cancelChat(); } }

// --- Leaderboard Functions ---
function toggleLeaderboard() { showLeaderboard = !showLeaderboard; if (showLeaderboard) { updateLeaderboard(); ui.leaderboard.classList.remove('hidden'); } else { ui.leaderboard.classList.add('hidden'); } }
function updateLeaderboard() {
     if (!showLeaderboard || !ui.leaderboard || ui.leaderboard.classList.contains('hidden')) return; ui.leaderboardList.innerHTML = ''; const sortedPlayers = Object.values(players).sort((a, b) => (b.score || 0) - (a.score || 0) || (a.name || '').localeCompare(b.name || ''));
     sortedPlayers.forEach(player => { const item = document.createElement('li'); if (player.id === localPlayerId) item.classList.add('is-local-player'); const nameSpan = document.createElement('span'); nameSpan.className = 'leaderboard-name'; nameSpan.textContent = player.name || 'Unnamed'; nameSpan.title = player.name || 'Unnamed'; const scoreSpan = document.createElement('span'); scoreSpan.className = 'leaderboard-score'; scoreSpan.textContent = player.score || 0; item.appendChild(nameSpan); item.appendChild(scoreSpan); ui.leaderboardList.appendChild(item); });
}

// --- Pointer Lock ---
function requestPointerLock() { if (socket?.connected && localPlayerId && players[localPlayerId] && !document.pointerLockElement && ui.gameCanvas.requestPointerLock) { console.log("Requesting pointer lock..."); ui.gameCanvas.requestPointerLock().catch(err => console.error("Lock request failed:", err)); } }
function handlePointerLockChange() { if (document.pointerLockElement === ui.gameCanvas) { console.log('Pointer Locked'); isPointerLocked = true; ui.crosshair.style.display = 'block'; } else { console.log('Pointer Unlocked'); isPointerLocked = false; ui.crosshair.style.display = 'none'; if (!isChatting && players[localPlayerId]) { console.log("Pointer unlocked unexpectedly."); /* showPauseMenu(); */ } } }

// --- Utility Functions ---
function onWindowResize() { if (!camera || !renderer) return; const width = window.innerWidth; const height = window.innerHeight; camera.aspect = width / height; camera.updateProjectionMatrix(); renderer.setSize(width, height); console.log("Resized."); }

// --- Start the application ---
init();
