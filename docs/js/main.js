import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

// --- Global Variables ---
let scene, camera, renderer, controls;
let localPlayer, localPlayerId;
const remotePlayers = {}; // { id: { mesh, nameTag } }
let gunModel;

const playerSpeed = 15.0; // Adjusted for potentially larger map scale
const playerHeight = 1.8; // Assumed player height for camera and raycasting
const playerRadius = 0.5; // For basic collision avoidance (not fully implemented)
const gravity = -30.0; // Stronger gravity
const jumpHeight = 10.0;
let playerVelocity = new THREE.Vector3();
let onGround = false;
const dashSpeed = 40.0;
const dashDuration = 150; // ms
let isDashing = false;
let lastDashTime = 0;
const dashCooldown = 1000; // ms

let keys = { w: false, a: false, s: false, d: false, space: false, shift: false, e: false };

const socket = io('https://gametest-psxl.onrender.com'); // YOUR RENDER SERVER URL
// For local dev: const socket = io();

const gltfLoader = new GLTFLoader();
const textureLoader = new THREE.TextureLoader();
const audioListener = new THREE.AudioListener();
let gunshotSound;

const raycaster = new THREE.Raycaster();
let mapMesh; // Will hold the loaded map for raycasting

const spawnPoints = [ // Keep in sync with server if not sent by server
    { x: -0.10692, y: 89.1166 + 1.5, z: 128.919 },
    { x: 25.3129,  y: 85.7254 + 1.5, z: 8.80901 },
    { x: 50.2203,  y: 39.8632 + 1.5, z: 203.312 },
];

// --- DOM Elements ---
const loadingScreen = document.getElementById('loading-screen');
const loadingStatus = document.getElementById('loading-status');
const progressBar = document.getElementById('progress-bar');
const homeMenu = document.getElementById('home-menu');
const playerNameInput = document.getElementById('playerNameInput');
const charSelectButtons = document.querySelectorAll('.char-select-btn');
const playButton = document.getElementById('playButton');
const playersOnlineHome = document.getElementById('playersOnlineHome');
const homeMenuMessage = document.getElementById('home-menu-message');

const gameContainer = document.getElementById('game-container');
const gameCanvas = document.getElementById('game-canvas');
const crosshair = document.getElementById('crosshair');
const chatDisplay = document.getElementById('chat-display');
const chatMessages = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');
const leaderboardUI = document.getElementById('leaderboard');
const leaderboardList = document.getElementById('leaderboard-list');
const timeLeftUI = document.getElementById('timeLeft');
const playerKillsUI = document.getElementById('playerKills');
const playersOnlineGame = document.getElementById('playersOnlineGame');
const announcementBar = document.getElementById('announcement-bar');
const currentMapNameUI = document.getElementById('currentMapName');

let selectedCharacter = 'Shawty'; // Default

// --- Initialization ---
function init() {
    // Scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87CEEB); // Sky blue
    scene.fog = new THREE.Fog(0x87CEEB, 100, 500); // Add fog for depth

    // Camera
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.y = playerHeight; // Start camera at player height
    camera.add(audioListener);

    // Renderer
    renderer = new THREE.WebGLRenderer({ canvas: gameCanvas, antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true; // Enable shadows

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(100, 100, 50);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    scene.add(directionalLight);

    // PointerLockControls
    controls = new PointerLockControls(camera, renderer.domElement);
    gameCanvas.addEventListener('click', () => {
        if (!document.pointerLockElement) { // Only lock if not already locked
            controls.lock();
        }
    });
    controls.addEventListener('lock', () => homeMenu.style.display = 'none'); // Hide menu on lock
    controls.addEventListener('unlock', () => {
        if(gameContainer.style.display !== 'none') { // Only show if game is active
             // homeMenu.style.display = 'flex'; // Could show a pause menu here
        }
    });


    // Load Assets
    loadAssets();

    // Event Listeners
    window.addEventListener('resize', onWindowResize);
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    document.addEventListener('mousedown', onMouseDown);

    playButton.addEventListener('click', joinGame);
    charSelectButtons.forEach(button => {
        button.addEventListener('click', () => {
            charSelectButtons.forEach(btn => btn.classList.remove('selected'));
            button.classList.add('selected');
            selectedCharacter = button.dataset.char;
        });
    });

    chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && chatInput.value.trim() !== '') {
            socket.emit('chatMessage', chatInput.value.trim());
            chatInput.value = '';
            chatInput.style.display = 'none';
            // Refocus on game
            if(!document.pointerLockElement) controls.lock();
        }
    });

    setupSocketEventHandlers();
    animate();
}

function loadAssets() {
    const manager = new THREE.LoadingManager();
    manager.onStart = (url, itemsLoaded, itemsTotal) => {
        loadingStatus.textContent = `Loading assets... (${itemsLoaded}/${itemsTotal})`;
    };
    manager.onLoad = () => {
        console.log('All assets loaded!');
        loadingScreen.style.display = 'none';
        homeMenu.style.display = 'flex';
        // Pre-create gunshot sound buffer
        const soundLoader = new THREE.AudioLoader(manager);
        soundLoader.load('assets/maps/gunshot.wav', (buffer) => {
            gunshotSound = new THREE.Audio(audioListener);
            gunshotSound.setBuffer(buffer);
            gunshotSound.setVolume(0.3);
        });
    };
    manager.onProgress = (url, itemsLoaded, itemsTotal) => {
        loadingStatus.textContent = `Loading ${url.split('/').pop()}... (${itemsLoaded}/${itemsTotal})`;
        progressBar.style.width = (itemsLoaded / itemsTotal) * 100 + '%';
    };
    manager.onError = (url) => console.error('Error loading asset:', url);

    // Load Map
    gltfLoader.setPath('assets/maps/').load('the_first_map!.glb', (gltf) => {
        mapMesh = gltf.scene;
        mapMesh.traverse(child => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });
        scene.add(mapMesh);
        console.log("Map loaded");
    }, undefined, (error) => console.error("Error loading map:", error));

    // Load Player Model (placeholder - will be created dynamically for local player)
    gltfLoader.setPath('assets/maps/').load('Shawty1.glb', (gltf) => {
        // This is just to preload, actual player mesh created on join
        console.log("Player model preloaded (Shawty1.glb)");
    }, undefined, (error) => console.error("Error preloading player model:", error));

    // Load Gun Model
    gltfLoader.setPath('assets/maps/').load('gun2.glb', (gltf) => {
        gunModel = gltf.scene;
        gunModel.scale.set(0.1, 0.1, 0.1); // Adjust scale as needed
        gunModel.position.set(0.3, -0.3, -0.5); // Position relative to camera
        gunModel.rotation.y = Math.PI; // Point forward
        // Gun will be added to camera after player joins
        console.log("Gun model loaded");
    }, undefined, (error) => console.error("Error loading gun model:", error));
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// --- Player Movement & Controls ---
function onKeyDown(event) {
    if (chatInput === document.activeElement) return; // Don't process game keys if typing in chat

    switch (event.code) {
        case 'KeyW': keys.w = true; break;
        case 'KeyA': keys.a = true; break;
        case 'KeyS': keys.s = true; break;
        case 'KeyD': keys.d = true; break;
        case 'Space': keys.space = true; break;
        case 'ShiftLeft': case 'ShiftRight': keys.shift = true; break;
        case 'KeyE': keys.e = true; break; // For shooting with propulsion
        case 'KeyL': toggleLeaderboard(); break;
        case 'KeyT': 
            event.preventDefault(); // Prevent 't' from being typed
            if (chatInput.style.display === 'none') {
                chatInput.style.display = 'block';
                chatInput.focus();
                if(document.pointerLockElement) controls.unlock(); // Unlock mouse to type
            } else {
                chatInput.style.display = 'none';
                 if(!document.pointerLockElement) controls.lock(); // Relock if not typing
            }
            break;
    }
}

function onKeyUp(event) {
    switch (event.code) {
        case 'KeyW': keys.w = false; break;
        case 'KeyA': keys.a = false; break;
        case 'KeyS': keys.s = false; break;
        case 'KeyD': keys.d = false; break;
        case 'Space': keys.space = false; break;
        case 'ShiftLeft': case 'ShiftRight': keys.shift = false; break;
        case 'KeyE': keys.e = false; break;
    }
}

function onMouseDown(event) {
    if (!controls.isLocked || chatInput === document.activeElement) return;
    if (event.button === 0) { // Left click
        shoot(keys.e); // Pass if E is also pressed
    }
}

function shoot(ePressed) {
    if (!localPlayer || !gunModel) return;

    if (gunshotSound && gunshotSound.isPlaying) gunshotSound.stop();
    if (gunshotSound) gunshotSound.play();

    // Create muzzle flash (simple sphere for now)
    const muzzleFlash = new THREE.Mesh(
        new THREE.SphereGeometry(0.05, 8, 8),
        new THREE.MeshBasicMaterial({ color: 0xffffee, transparent: true, opacity: 0.8 })
    );
    // Position flash at gun barrel end (approximate)
    const gunWorldPos = new THREE.Vector3();
    const gunBarrelOffset = new THREE.Vector3(0, 0.05, -0.5); // Relative to gun model
    gunModel.getWorldPosition(gunWorldPos);
    const flashPos = gunModel.localToWorld(gunBarrelOffset.clone());
    muzzleFlash.position.copy(flashPos);
    scene.add(muzzleFlash);
    setTimeout(() => scene.remove(muzzleFlash), 60);

    // Raycast for hit detection (client-side indication, server verifies)
    const raycasterShoot = new THREE.Raycaster();
    raycasterShoot.setFromCamera({ x: 0, y: 0 }, camera); // Shoot from center of screen

    let shotDirection = new THREE.Vector3();
    camera.getWorldDirection(shotDirection);
    
    socket.emit('shoot', { direction: shotDirection, ePressed: ePressed });

    const intersects = raycasterShoot.intersectObjects(Object.values(remotePlayers).map(p => p.mesh), true);
    if (intersects.length > 0) {
        let closestHit = null;
        for(const intersect of intersects){
            // Find the root object of the player if model is complex
            let hitObject = intersect.object;
            while(hitObject.parent && hitObject.parent !== scene && !hitObject.userData.playerId){
                hitObject = hitObject.parent;
            }
            if(hitObject.userData.playerId && hitObject.userData.playerId !== localPlayerId){
                if(!closestHit || intersect.distance < closestHit.distance){
                    closestHit = intersect;
                    closestHit.playerId = hitObject.userData.playerId;
                }
            }
        }
        if(closestHit && closestHit.playerId){
             // console.log('Client tentative hit on player:', closestHit.playerId);
             socket.emit('clientHitReport', closestHit.playerId);
        }
    }


    if (ePressed) {
        // Client-side visual recoil/propulsion (server confirms actual movement)
        const recoilForce = shotDirection.clone().multiplyScalar(-20); // Stronger recoil
        playerVelocity.add(recoilForce);
    }
}


function updatePlayer(delta) {
    if (!controls.isLocked || !localPlayer) {
        // If controls not locked, apply damping to velocity to stop movement
        playerVelocity.x -= playerVelocity.x * 10.0 * delta;
        playerVelocity.z -= playerVelocity.z * 10.0 * delta;
        // Still apply gravity
        playerVelocity.y += gravity * delta;
        controls.moveRight(-playerVelocity.x * delta); // Inverted because moveRight takes positive for right
        controls.getObject().position.y += playerVelocity.y * delta;
        // Ground collision check even if not moving with keys
        checkGroundCollision();
        return;
    }
    
    const moveSpeed = isDashing ? dashSpeed : playerSpeed;
    const moveDirection = new THREE.Vector3();
    const forward = new THREE.Vector3();
    const right = new THREE.Vector3();

    camera.getWorldDirection(forward);
    right.crossVectors(camera.up, forward).normalize(); // Get right vector relative to camera's up and forward

    if (keys.w) moveDirection.sub(forward); // Move forward along camera's direction (sub because camera looks along -Z)
    if (keys.s) moveDirection.add(forward); // Move backward
    if (keys.a) moveDirection.sub(right);   // Strafe left
    if (keys.d) moveDirection.add(right);   // Strafe right

    moveDirection.normalize().multiplyScalar(moveSpeed * delta);
    
    // Apply movement directly to PointerLockControls object (which is the camera's parent)
    // This ensures movement is relative to where the camera is looking.
    if(keys.w || keys.s) controls.moveForward(-(keys.w ? 1 : -1) * moveSpeed * delta * (keys.s && keys.w ? 0 : 1) ); // moveForward is inverted
    if(keys.a || keys.d) controls.moveRight((keys.d ? 1 : -1) * moveSpeed * delta * (keys.a && keys.d ? 0 : 1));


    // Handle Jump
    if (keys.space && onGround) {
        playerVelocity.y = jumpHeight;
        onGround = false;
    }

    // Apply gravity
    if (!onGround) {
        playerVelocity.y += gravity * delta;
    }
    
    controls.getObject().position.y += playerVelocity.y * delta; // Apply vertical movement

    // Handle Dash
    if (keys.shift && !isDashing && (Date.now() - lastDashTime > dashCooldown)) {
        isDashing = true;
        lastDashTime = Date.now();
        
        let dashDirection = new THREE.Vector3();
        if (keys.w) dashDirection.sub(forward);
        else if (keys.s) dashDirection.add(forward);
        if (keys.a) dashDirection.sub(right);
        else if (keys.d) dashDirection.add(right);

        if (dashDirection.lengthSq() === 0) { // If no direction keys, dash forward
            dashDirection.sub(forward);
        }
        dashDirection.normalize();
        
        // Apply dash impulse directly to position for simplicity here
        // A more physics-based approach would add to velocity.
        const dashVector = dashDirection.multiplyScalar(dashSpeed * 0.1); // Smaller multiplier for direct pos change
        controls.getObject().position.add(dashVector);
        
        socket.emit('playerDash', {direction: dashDirection});

        setTimeout(() => isDashing = false, dashDuration);
    }
    
    checkGroundCollision();
    
    // Update localPlayer model position and rotation
    localPlayer.mesh.position.copy(controls.getObject().position);
    localPlayer.mesh.position.y -= playerHeight / 2; // Adjust model pivot
    localPlayer.mesh.quaternion.copy(camera.quaternion); // Align model with camera rotation

    // Send updates to server
    socket.emit('playerUpdate', {
        position: controls.getObject().position,
        rotation: camera.quaternion, // Send quaternion for full 3D rotation
        velocity: playerVelocity // Send velocity if server uses it for prediction/validation
    });
}

function checkGroundCollision() {
    // Raycast down to detect ground
    const playerPosition = controls.getObject().position;
    raycaster.set(playerPosition, new THREE.Vector3(0, -1, 0));
    if (!mapMesh) return; // Map not loaded yet

    const intersects = raycaster.intersectObject(mapMesh, true);

    if (intersects.length > 0) {
        const distanceToGround = intersects[0].distance;
        if (distanceToGround <= playerHeight / 2 + 0.1) { // Added small buffer
            if (playerVelocity.y <= 0) { // Only stop if falling or on ground
                playerPosition.y -= (distanceToGround - (playerHeight / 2));
                playerVelocity.y = 0;
                onGround = true;
            }
        } else {
            onGround = false;
        }
    } else {
        onGround = false; // No ground detected below
    }

    // Fall death check
    if (playerPosition.y < -20) { // Fall death Y threshold
        // socket.emit('playerFell'); // Server handles respawn
        // Client-side immediate effect (server will confirm)
        // showTemporaryAnnouncement("You fell out of the world!", "death");
        // respawnLocalPlayer(getRandomSpawnPoint()); // Client-side visual respawn
    }
}


// --- Game Loop ---
let lastTime = performance.now();
function animate() {
    requestAnimationFrame(animate);
    const currentTime = performance.now();
    const delta = Math.min(0.1, (currentTime - lastTime) / 1000); // Cap delta to prevent large jumps
    lastTime = currentTime;

    if (controls.isLocked && localPlayer) {
        updatePlayer(delta);
    }

    // Update remote player name tags to face camera
    for (const id in remotePlayers) {
        if (remotePlayers[id].nameTag) {
            remotePlayers[id].nameTag.lookAt(camera.position);
        }
        // Interpolate remote player movement for smoothness (optional, basic lerp here)
        if(remotePlayers[id].targetPosition && remotePlayers[id].mesh) {
            remotePlayers[id].mesh.position.lerp(remotePlayers[id].targetPosition, 0.2);
            remotePlayers[id].mesh.quaternion.slerp(remotePlayers[id].targetQuaternion, 0.2);
        }
    }
    
    renderer.render(scene, camera);
}

// --- Socket.IO Event Handlers ---
function setupSocketEventHandlers() {
    socket.on('connect', () => {
        console.log('Connected to server with ID:', socket.id);
        // homeMenuMessage.textContent = "";
    });

    socket.on('disconnect', () => {
        console.log('Disconnected from server');
        showTemporaryAnnouncement("Disconnected from server. Attempting to reconnect...", "system");
        // Potentially try to hide game and show a "disconnected" message on home menu
        // gameContainer.style.display = 'none';
        // homeMenu.style.display = 'flex';
        // homeMenuMessage.textContent = "Disconnected. Please refresh or wait.";
    });

    socket.on('playerCount', (count) => {
        playersOnlineHome.textContent = count;
        playersOnlineGame.textContent = count;
    });

    socket.on('gameJoined', (data) => {
        localPlayerId = data.id;
        console.log('Game joined! My ID:', localPlayerId);
        console.log('Initial players:', data.players);
        homeMenu.style.display = 'none';
        gameContainer.style.display = 'block';
        controls.lock();

        // Set current map name
        if (data.mapName) currentMapNameUI.textContent = data.mapName;

        // Create local player
        createLocalPlayer(data.spawnPoint, data.players[localPlayerId].name, data.players[localPlayerId].character);
        updateScores(data.initialScores);
        updateTimer(data.currentRoundTime);

        // Create other existing players
        for (const id in data.players) {
            if (id !== localPlayerId) {
                addRemotePlayer(data.players[id]);
            }
        }
        // Add gun to camera
        if (gunModel) {
            camera.add(gunModel);
        }
    });

    socket.on('playerJoined', (data) => {
        if (data.playerInfo.id === localPlayerId) return;
        console.log('Player joined:', data.playerInfo.name);
        addRemotePlayer(data.playerInfo);
        showTemporaryAnnouncement(`${data.playerInfo.name} joined the game.`, "join");
        updateScores([{id: data.playerInfo.id, name: data.playerInfo.name, score: data.score || 0}]); // Add to leaderboard
    });

    socket.on('playerLeft', (playerId) => {
        const playerName = remotePlayers[playerId]?.name || "A player";
        removeRemotePlayer(playerId);
        showTemporaryAnnouncement(`${playerName} left the game.`, "system");
    });

    socket.on('playerMoved', (data) => {
        if (data.id === localPlayerId || !remotePlayers[data.id]) return;
        const player = remotePlayers[data.id];
        // Store target for interpolation
        player.targetPosition = new THREE.Vector3().copy(data.position);
        player.targetPosition.y -= playerHeight / 2; // Adjust model pivot
        player.targetQuaternion = new THREE.Quaternion().copy(data.rotation);
        
        if (player.nameTag) {
            player.nameTag.position.copy(data.position).y += 1.0; // Position above model
        }
    });
    
    socket.on('playerDashed', (data) => {
        if (data.id === localPlayerId || !remotePlayers[data.id]) return;
        // Play dash effect for remote player (e.g., particles)
        // console.log(`Player ${data.id} dashed`);
        // You might want to add a visual effect here for remote player dashes
    });

    socket.on('chatMessage', (data) => {
        displayChatMessage(data.name, data.message);
    });

    socket.on('leaderboardUpdate', (leaderboard) => {
        updateLeaderboard(leaderboard);
    });
    
    socket.on('roundStart', (data) => {
        showTemporaryAnnouncement("New Round Started!", "system");
        updateTimer(data.duration);
        updateScores(data.scores); // Reset scores display
        playerKillsUI.textContent = 0; // Reset local player's displayed kills
    });

    socket.on('roundTimerUpdate', (time) => {
        updateTimer(time);
    });

    socket.on('roundOver', (finalScores) => {
        showTemporaryAnnouncement("Round Over!", "system");
        updateLeaderboard(finalScores);
        toggleLeaderboard(true); // Show leaderboard at round end
        // TODO: Implement map voting UI if desired
    });

    socket.on('deathLog', (message) => {
        showTemporaryAnnouncement(message, "death");
        // If local player died, this is handled by 'respawn' event
        // If another player died, their score is updated via leaderboardUpdate
    });

    socket.on('respawn', (data) => {
        respawnLocalPlayer(data.spawnPoint);
        showTemporaryAnnouncement("You were eliminated! Respawning...", "death");
    });

    socket.on('playerRespawned', (playerData) => { // When another player respawns
        if (playerData.id === localPlayerId || !remotePlayers[playerData.id]) return;
        const player = remotePlayers[playerData.id];
        player.mesh.position.copy(playerData.position);
        player.mesh.position.y -= playerHeight/2;
        player.mesh.quaternion.copy(playerData.rotation);
        // console.log(`${playerData.name} respawned.`);
    });


    socket.on('playerDiedEffect', (data) => {
        const targetPlayer = (data.playerId === localPlayerId) ? localPlayer : remotePlayers[data.playerId];
        if (targetPlayer && targetPlayer.mesh) {
            createExplosion(targetPlayer.mesh.position, data.shockwave);
        }
    });
    
    socket.on('applyGunPropulsion', (data) => {
        // This is for client-side visual effect if server confirms propulsion
        const recoilForce = new THREE.Vector3().copy(data.direction).multiplyScalar(-30); // Stronger recoil visual
        playerVelocity.add(recoilForce);
    });

    socket.on('systemMessage', (message) => {
        displaySystemMessage(message);
        showTemporaryAnnouncement(message, "system");
    });

    socket.on('currentRoundTime', (time) => {
        updateTimer(time);
    });
}

// --- Helper Functions ---
function joinGame() {
    const name = playerNameInput.value.trim() || `Player${Math.floor(Math.random()*1000)}`;
    if (name.length > 0) {
        socket.emit('joinGame', { name: name, character: selectedCharacter });
    }
}

function createLocalPlayer(spawnPoint, name, characterType) {
    // For now, all characters use Shawty1.glb. Extend this for characterType.
    gltfLoader.load('assets/maps/Shawty1.glb', (gltf) => {
        const playerMesh = gltf.scene;
        playerMesh.scale.set(0.8, 0.8, 0.8); // Adjust scale if needed
        playerMesh.traverse(child => { if (child.isMesh) child.castShadow = true; });

        // Set player initial position and add to scene (controls object handles camera pos)
        controls.getObject().position.copy(spawnPoint);
        playerMesh.position.copy(spawnPoint);
        playerMesh.position.y -= playerHeight / 2; // Model pivot point adjustment
        
        scene.add(playerMesh);
        localPlayer = { mesh: playerMesh, name: name, character: characterType };
        
        // Hide local player's mesh from their own first-person view
        // localPlayer.mesh.visible = false; // Or render on a different layer
        // A common technique is to not render the full body for local player in FPS
        // or use a separate "arms" model. For now, we'll see our body.
    });
}

function addRemotePlayer(playerInfo) {
    if (remotePlayers[playerInfo.id]) return; // Already exists

    gltfLoader.load('assets/maps/Shawty1.glb', (gltf) => { // Use character from playerInfo.character if available
        const mesh = gltf.scene;
        mesh.scale.set(0.8, 0.8, 0.8);
        mesh.traverse(child => { if (child.isMesh) child.receiveShadow = true; child.castShadow = true;});
        mesh.position.copy(playerInfo.position);
        mesh.position.y -= playerHeight / 2; // Adjust for model pivot
        mesh.quaternion.copy(playerInfo.rotation);
        mesh.userData.playerId = playerInfo.id; // For raycasting hits
        scene.add(mesh);

        // Add nametag
        const nameTag = createNameTag(playerInfo.name);
        nameTag.position.copy(playerInfo.position).y += 1.0; // Above player model
        scene.add(nameTag);

        remotePlayers[playerInfo.id] = { 
            mesh: mesh, 
            name: playerInfo.name, 
            nameTag: nameTag,
            targetPosition: new THREE.Vector3().copy(mesh.position), // For interpolation
            targetQuaternion: new THREE.Quaternion().copy(mesh.quaternion) // For interpolation
        };
    });
}

function removeRemotePlayer(id) {
    if (remotePlayers[id]) {
        scene.remove(remotePlayers[id].mesh);
        if (remotePlayers[id].nameTag) scene.remove(remotePlayers[id].nameTag);
        delete remotePlayers[id];
    }
}

function respawnLocalPlayer(spawnPoint) {
    controls.getObject().position.copy(spawnPoint);
    playerVelocity.set(0, 0, 0); // Reset velocity
    onGround = false; // Recheck ground after respawn
    if (localPlayer && localPlayer.mesh) {
        localPlayer.mesh.position.copy(spawnPoint);
        localPlayer.mesh.position.y -= playerHeight / 2;
        localPlayer.mesh.quaternion.identity(); // Reset rotation visually
        camera.quaternion.identity(); // Reset camera rotation directly
    }
}

function createNameTag(name) {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    context.font = 'Bold 20px Arial';
    const textWidth = context.measureText(name).width;

    canvas.width = textWidth + 10; // Add some padding
    canvas.height = 30; // Fixed height

    // Re-apply font after canvas resize
    context.font = 'Bold 20px Arial';
    context.fillStyle = 'rgba(0, 0, 0, 0.5)'; // Semi-transparent background
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = 'white';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(name, canvas.width / 2, canvas.height / 2);

    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({ map: texture, transparent: true });
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(canvas.width * 0.01, canvas.height * 0.01, 1); // Adjust scale as needed
    return sprite;
}

function createExplosion(position, createShockwave) {
    // Simple particle explosion
    const particleCount = 100;
    const particles = new THREE.BufferGeometry();
    const pMaterial = new THREE.PointsMaterial({
        color: 0xFF8800,
        size: 0.3,
        transparent: true,
        opacity: 0.8,
        blending: THREE.AdditiveBlending
    });

    const pPositions = [];
    for (let i = 0; i < particleCount; i++) {
        pPositions.push(
            (Math.random() - 0.5) * 0.1,
            (Math.random() - 0.5) * 0.1,
            (Math.random() - 0.5) * 0.1
        );
    }
    particles.setAttribute('position', new THREE.Float32BufferAttribute(pPositions, 3));
    const particleSystem = new THREE.Points(particles, pMaterial);
    particleSystem.position.copy(position);
    scene.add(particleSystem);

    // Animate particles outward and fade
    let life = 0;
    const explosionAnim = () => {
        if (life > 1) {
            scene.remove(particleSystem);
            pMaterial.dispose();
            particles.dispose();
            return;
        }
        particleSystem.material.opacity = 1 - life;
        particleSystem.scale.addScalar(life * 0.2); // Expand
        life += 0.02;
        requestAnimationFrame(explosionAnim);
    };
    explosionAnim();

    if (createShockwave) {
        const shockwaveGeo = new THREE.TorusGeometry(0.1, 0.05, 8, 32);
        const shockwaveMat = new THREE.MeshBasicMaterial({ color: 0xffff00, transparent: true, opacity: 0.7, side: THREE.DoubleSide });
        const shockwaveMesh = new THREE.Mesh(shockwaveGeo, shockwaveMat);
        shockwaveMesh.position.copy(position);
        shockwaveMesh.rotation.x = Math.PI / 2; // Make it flat on ground
        scene.add(shockwaveMesh);

        let shockLife = 0;
        const shockwaveAnim = () => {
            if (shockLife > 1) {
                scene.remove(shockwaveMesh);
                shockwaveMat.dispose();
                shockwaveGeo.dispose();
                return;
            }
            shockwaveMesh.scale.set(1 + shockLife * 20, 1 + shockLife * 20, 1); // Expand radius
            shockwaveMesh.material.opacity = 0.7 * (1 - shockLife);
            shockLife += 0.02;
            requestAnimationFrame(shockwaveAnim);
        };
        shockwaveAnim();
    }
}


function displayChatMessage(name, message) {
    const item = document.createElement('li');
    item.innerHTML = `<b class="player-name">${escapeHtml(name)}:</b> ${escapeHtml(message)}`;
    chatMessages.appendChild(item);
    chatDisplay.scrollTop = chatDisplay.scrollHeight; // Scroll to bottom
}
function displaySystemMessage(message) {
    const item = document.createElement('li');
    item.className = 'system';
    item.textContent = escapeHtml(message);
    chatMessages.appendChild(item);
    chatDisplay.scrollTop = chatDisplay.scrollHeight;
}

function escapeHtml(unsafe) {
    return unsafe
         .replace(/&/g, "&")      // Corrected
         .replace(/</g, "<")       // Corrected
         .replace(/>/g, ">")       // Corrected
         .replace(/"/g, """)    // Corrected - THIS WAS THE SYNTAX ERROR
         .replace(/'/g, "'");   // Corrected
}

let leaderboardVisible = false;
function toggleLeaderboard(forceShow = null) {
    if (forceShow !== null) {
        leaderboardVisible = forceShow;
    } else {
        leaderboardVisible = !leaderboardVisible;
    }
    leaderboardUI.style.display = leaderboardVisible ? 'block' : 'none';
}

function updateLeaderboard(scoresData) { // scoresData is an array from server
    leaderboardList.innerHTML = ''; // Clear existing
    scoresData.forEach(player => {
        const item = document.createElement('li');
        const nameSpan = document.createElement('span');
        nameSpan.className = 'player-name';
        nameSpan.textContent = escapeHtml(player.name);
        const scoreSpan = document.createElement('span');
        scoreSpan.className = 'player-score';
        scoreSpan.textContent = player.score;
        
        item.appendChild(nameSpan);
        item.appendChild(scoreSpan);
        leaderboardList.appendChild(item);

        if(player.id === localPlayerId) {
            playerKillsUI.textContent = player.score;
        }
    });
}
function updateScores(scoresData){ // Can be array or object
    if(Array.isArray(scoresData)){
        updateLeaderboard(scoresData);
    } else { // Is object {socket.id: score}
        const scoreArray = Object.entries(scoresData).map(([id, score]) => ({
            id: id,
            name: (localPlayerId === id ? localPlayer.name : remotePlayers[id]?.name) || 'Unknown',
            score: score
        })).sort((a,b) => b.score - a.score);
        updateLeaderboard(scoreArray);
    }
}


function updateTimer(ms) {
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    timeLeftUI.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function showTemporaryAnnouncement(message, type = "system") { // type: "system", "join", "death"
    const announcement = document.createElement('div');
    announcement.className = `announcement-message ${type}`;
    announcement.textContent = escapeHtml(message);
    announcementBar.appendChild(announcement);

    // Automatically remove after animation (5s total: 0.5s fade in, 4s visible, 0.5s fade out)
    setTimeout(() => {
        if (announcement.parentNode) {
            announcement.parentNode.removeChild(announcement);
        }
    }, 5000);
}

// --- Start ---
init();
