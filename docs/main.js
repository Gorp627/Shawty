// docs/main.js

// --- Configuration ---
const SERVER_URL = 'https://gametest-psxl.onrender.com'; // Your specific Render server URL
const MAP_PATH = 'assets/maps/map.glb'; // Your specific map path
const SOUND_PATH_GUNSHOT = 'docs/assets/maps/gunshot.wav'; // Your specific sound path relative to index.html

const PLAYER_HEIGHT = 1.8;
const PLAYER_RADIUS = 0.4;
const MOVEMENT_SPEED = 5.0;
const MOVEMENT_SPEED_SPRINTING = 8.0;
const MOUSE_SENSITIVITY = 0.002; // Not directly used by PointerLockControls, but kept for reference
const BULLET_SPEED = 50;
const GRAVITY = 19.62;
const JUMP_FORCE = 8.0;
const VOID_Y_LEVEL = -20;
const PLAYER_COLLISION_RADIUS = PLAYER_RADIUS;

// --- Global Variables ---
let scene, camera, renderer, controls;
let socket;
let localPlayerId = null;
let players = {}; // Stores data for all players { id: { mesh, x, y, z, rotationY, health, targetPosition, targetRotationY } }
let bullets = []; // Stores active bullets { id, mesh, velocity, ownerId, spawnTime }
let keys = {}; // Tracks currently pressed keys { KeyW: true, ShiftLeft: false, ... }
const clock = new THREE.Clock();
const loader = new THREE.GLTFLoader();
const dracoLoader = new THREE.DRACOLoader();
let mapMesh = null;

// Player physics state (local player only)
let velocityY = 0;
let isOnGround = false;

// UI Elements
let healthBarFill, healthText;

// Sound
let gunshotSound; // Declare variable, load in init

// --- Initialization ---
function init() {
    // Basic Scene Setup
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87ceeb);
    scene.fog = new THREE.Fog(0x87ceeb, 0, 150);

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);

    renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('gameCanvas'), antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.9);
    directionalLight.position.set(10, 15, 10);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 1024;
    directionalLight.shadow.mapSize.height = 1024;
    scene.add(directionalLight);

    // Pointer Lock Controls
    controls = new THREE.PointerLockControls(camera, document.body);
    controls.getObject().position.y = PLAYER_HEIGHT; // Set initial height directly
    scene.add(controls.getObject());

    const canvas = document.getElementById('gameCanvas');
    canvas.addEventListener('click', () => { controls.lock(); });
    controls.addEventListener('lock', () => console.log('Pointer Locked'));
    controls.addEventListener('unlock', () => console.log('Pointer Unlocked'));

    // Get UI elements
    healthBarFill = document.getElementById('healthBarFill');
    healthText = document.getElementById('healthText');

    // Load Sound (handle potential errors)
    try {
        gunshotSound = new Audio(SOUND_PATH_GUNSHOT);
        gunshotSound.volume = 0.4; // Adjust volume as needed
        // Preload might help, but browsers handle this differently
        gunshotSound.preload = 'auto';
        gunshotSound.load(); // Attempt to load it
        console.log("Gunshot sound object created.");
    } catch(e) {
        console.error("Could not create Audio object for gunshot:", e);
        gunshotSound = null; // Ensure it's null if failed
    }


    // Load Map
    loadMap(MAP_PATH);

    // Event Listeners
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    document.addEventListener('mousedown', onMouseDown);
    window.addEventListener('resize', onWindowResize, false);

    // Connect & Start Loop
    setupSocketIO();
    animate();
}

// --- Input Handling ---
function onKeyDown(event) {
    keys[event.code] = true;
    // Handle jump only if grounded to prevent mid-air jumps
    if (event.code === 'Space' && isOnGround) {
        velocityY = JUMP_FORCE;
        isOnGround = false; // Player leaves the ground
    }
}

function onKeyUp(event) {
    keys[event.code] = false;
}

function onMouseDown(event) {
    // Shoot only if pointer is locked and left mouse button is clicked
    if (controls.isLocked && event.button === 0) {
        shoot();
    }
}

// --- Networking (Socket.IO) ---
function setupSocketIO() {
    console.log(`Attempting to connect to server: ${SERVER_URL}`);
    socket = io(SERVER_URL, { transports: ['websocket'] });

    socket.on('connect', () => {
        console.log('Connected to server! My socket ID:', socket.id);
        document.getElementById('info').textContent = 'Connected';
    });

    socket.on('disconnect', (reason) => {
        console.warn('Disconnected from server! Reason:', reason);
        document.getElementById('info').textContent = 'Disconnected. Refresh?';
        // Clear local game state
        for (const id in players) {
            if (players[id].mesh) scene.remove(players[id].mesh);
        }
        players = {};
    });

    socket.on('connect_error', (err) => {
        console.error('Connection Error:', err.message, err.stack);
        document.getElementById('info').textContent = `Connection Error! Check Server & Console (F12).`;
    });

    socket.on('initialize', (data) => {
        localPlayerId = data.id;
        console.log('Initialized with ID:', localPlayerId);
        // Clear existing players just in case of re-initialization
        for (const id in players) {
            if (players[id].mesh) scene.remove(players[id].mesh);
        }
        players = {};

        for (const id in data.players) {
            const playerData = data.players[id];
            if (id === localPlayerId) {
                // Set local player's initial state
                controls.getObject().position.set(playerData.x, playerData.y + PLAYER_HEIGHT, playerData.z); // Use server Y + height
                velocityY = 0;
                isOnGround = true; // Assume initial spawn is on ground
                players[id] = { ...playerData, mesh: null }; // Store local data
                updateHealthBar(playerData.health);
            } else {
                addPlayer(playerData); // Add remote players
            }
        }
        console.log("Initial players state:", players);
    });

    socket.on('playerJoined', (playerData) => {
        console.log('>>> Received playerJoined event:', playerData);
        if (playerData.id !== localPlayerId && !players[playerData.id]) {
            addPlayer(playerData);
        }
    });

    socket.on('playerLeft', (playerId) => {
        console.log('Player left:', playerId);
        if (players[playerId] && players[playerId].mesh) {
            scene.remove(players[playerId].mesh);
        }
        delete players[playerId];
    });

    socket.on('playerMoved', (playerData) => {
        if (playerData.id !== localPlayerId && players[playerData.id]) {
            const player = players[playerData.id];
            // Remote player's visual Y needs adjustment based on PLAYER_HEIGHT
            const visualY = playerData.y + (PLAYER_HEIGHT / 2);
            player.targetPosition = new THREE.Vector3(playerData.x, visualY, playerData.z);
            player.targetRotationY = playerData.rotationY;
            // Update internal data as well
            player.x = playerData.x;
            player.y = playerData.y; // Store logical Y from server
            player.z = playerData.z;
            player.rotationY = playerData.rotationY;
        }
    });

    socket.on('shotFired', (bulletData) => {
         spawnBullet(bulletData);
    });

    socket.on('healthUpdate', (data) => {
        if (players[data.id]) {
            players[data.id].health = data.health;
            console.log(`Player ${data.id} health updated to: ${data.health}`);
            if (data.id === localPlayerId) {
                updateHealthBar(data.health);
            }
        }
    });

    socket.on('playerDied', (data) => {
        console.log(`Player ${data.targetId} died. Killer: ${data.killerId || 'Environment'}`);
        if (players[data.targetId]) {
            players[data.targetId].health = 0;
            if (players[data.targetId].mesh) {
                players[data.targetId].mesh.visible = false; // Hide mesh on death
            }
        }
        if (data.targetId === localPlayerId) {
            updateHealthBar(0);
            document.getElementById('info').textContent = `YOU DIED | Waiting to respawn...`;
            // controls.unlock(); // Optional: unlock mouse on death
        }
    });

    socket.on('playerRespawned', (playerData) => {
        console.log(`Player ${playerData.id} respawned`);
        if (!players[playerData.id] && playerData.id !== localPlayerId) {
            // If player wasn't known (e.g., joined while we were dead), add them now
            console.log('Respawned player was not previously known, adding now.');
            addPlayer(playerData);
        } else if (players[playerData.id] || playerData.id === localPlayerId) {
            // Update known player data
            const player = players[playerData.id] || {}; // Get player data or empty obj for local player
            player.health = playerData.health;
            player.x = playerData.x;
            player.y = playerData.y;
            player.z = playerData.z;
            player.rotationY = playerData.rotationY;

            if (playerData.id === localPlayerId) {
                // Reset local player position and physics state
                controls.getObject().position.set(playerData.x, playerData.y + PLAYER_HEIGHT, playerData.z);
                velocityY = 0;
                isOnGround = true;
                updateHealthBar(playerData.health);
                document.getElementById('info').textContent = `RESPAWNED | Health: ${playerData.health}`;
                // if (!controls.isLocked) controls.lock(); // Re-lock if needed
            } else {
                // Reset remote player visuals
                if (player.mesh) {
                    player.mesh.visible = true;
                    const visualY = playerData.y + (PLAYER_HEIGHT / 2);
                    player.mesh.position.set(playerData.x, visualY, playerData.z);
                    player.targetPosition = new THREE.Vector3(playerData.x, visualY, playerData.z);
                    player.targetRotationY = playerData.rotationY;
                }
            }
        }
    });
}

// --- Player Management ---
function addPlayer(playerData) {
    console.log('>>> addPlayer function called with:', playerData);
    if (players[playerData.id] || playerData.id === localPlayerId) return; // Don't add self or duplicates

    console.log("Adding player model to scene:", playerData.id);
    const geometry = new THREE.CylinderGeometry(PLAYER_RADIUS, PLAYER_RADIUS, PLAYER_HEIGHT, 8);
    const material = new THREE.MeshStandardMaterial({ color: 0x00ff00 }); // Green cylinder
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    // Position the center of the cylinder mesh correctly based on server's logical Y
    const visualY = playerData.y + (PLAYER_HEIGHT / 2);
    mesh.position.set(playerData.x, visualY, playerData.z);
    mesh.rotation.y = playerData.rotationY;
    scene.add(mesh);
    console.log('>>> addPlayer: Added mesh to scene:', mesh);

    players[playerData.id] = {
        ...playerData, // server data (id, x, y, z, rotY, health)
        mesh: mesh,
        targetPosition: new THREE.Vector3(playerData.x, visualY, playerData.z), // Target visual pos
        targetRotationY: playerData.rotationY
    };
    console.log('>>> addPlayer: Updated local players object:', players);
}

// --- Map Loading ---
function loadMap(mapPath) {
    console.log(`Attempting to load map: ${mapPath}`);
    // Configure DracoLoader (assuming map might be compressed)
    dracoLoader.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/libs/draco/');
    dracoLoader.setDecoderConfig({ type: 'js' });
    loader.setDRACOLoader(dracoLoader);

    loader.load(
        mapPath,
        (gltf) => {
            console.log("Map loaded successfully!");
            mapMesh = gltf.scene;
            mapMesh.traverse((child) => {
                if (child.isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                    // TODO: Add collision data/flags if needed for raycasting
                }
            });
            scene.add(mapMesh);
        },
        (xhr) => {
            if(xhr.lengthComputable) { // Avoid NaN if total is 0 initially
                const percentLoaded = Math.round(xhr.loaded / xhr.total * 100);
                console.log(`Map loading progress: ${percentLoaded}%`);
            }
        },
        (error) => {
            console.error('Error loading map:', error);
            document.getElementById('info').textContent = `Map Load Error! Check Console (F12).`;
            // Optionally remove the fallback ground if map fails
            // scene.remove(ground); // If you have 'ground' variable accessible
        }
    );
}

// --- Game Logic Update Loop ---
function updatePlayer(deltaTime) {
    if (!controls.isLocked || !localPlayerId || !players[localPlayerId]) return;

    const playerObject = controls.getObject();
    const playerState = players[localPlayerId];

    // Don't update if dead
    if (playerState.health <= 0) {
        // Optional: Apply gravity even when dead so body falls?
        // velocityY -= GRAVITY * deltaTime;
        // playerObject.position.y += velocityY * deltaTime;
        return;
    }

    // --- Determine Speed ---
    const currentSpeed = keys['ShiftLeft'] ? MOVEMENT_SPEED_SPRINTING : MOVEMENT_SPEED;
    const speed = currentSpeed * deltaTime;

    // --- Calculate Movement Direction ---
    const moveDirection = new THREE.Vector3(); // Based on input keys
    if (keys['KeyW']) { moveDirection.z = -1; }
    if (keys['KeyS']) { moveDirection.z = 1; }
    if (keys['KeyA']) { moveDirection.x = -1; }
    if (keys['KeyD']) { moveDirection.x = 1; }
    moveDirection.normalize(); // Ensure consistent speed diagonally

    // --- Calculate Displacement Vector ---
    const displacement = new THREE.Vector3();
    // Apply gravity
    velocityY -= GRAVITY * deltaTime;
    displacement.y = velocityY * deltaTime;

    // Apply horizontal movement relative to camera direction
    if (moveDirection.lengthSq() > 0) { // Only apply if there's input
        const forwardVector = new THREE.Vector3();
        controls.getDirection(forwardVector);
        const rightVector = new THREE.Vector3().crossVectors(playerObject.up, forwardVector); // Use player object's up

        // Apply Z movement (forward/backward)
        displacement.addScaledVector(forwardVector, moveDirection.z * speed);
        // Apply X movement (strafe)
        displacement.addScaledVector(rightVector, moveDirection.x * speed);
    }

    // --- Collision Detection ---
    const potentialPosition = playerObject.position.clone().add(displacement);

    // Player-Player Collision
    let blockedByPlayer = false;
    for (const id in players) {
        if (id !== localPlayerId && players[id].mesh && players[id].mesh.visible) {
            const otherPlayerMesh = players[id].mesh;
            // Use XZ distance for player collision check (ignore height difference)
            const distanceXZ = new THREE.Vector2(potentialPosition.x - otherPlayerMesh.position.x, potentialPosition.z - otherPlayerMesh.position.z).length();
            if (distanceXZ < PLAYER_COLLISION_RADIUS * 2) {
                console.log("Player collision detected!");
                blockedByPlayer = true;
                break;
            }
        }
    }

    // --- Apply Movement ---
    if (!blockedByPlayer) {
        playerObject.position.add(displacement); // Apply full movement if not blocked
    } else {
        // If blocked horizontally, still apply vertical movement (gravity/jump)
        playerObject.position.y += displacement.y;
        // Optional: Try applying only non-colliding horizontal component? (more complex)
    }

    // --- Ground Check & Correction ---
    // TODO: Replace with raycasting against mapMesh for accurate ground detection
    let groundY = 0; // Assume ground is at 0 for now if no map collision
    if (playerObject.position.y - PLAYER_HEIGHT < groundY) {
         playerObject.position.y = groundY + PLAYER_HEIGHT;
         velocityY = 0;
         isOnGround = true;
    } else {
         isOnGround = false;
    }

    // --- Void Check ---
    if (playerObject.position.y < VOID_Y_LEVEL) {
        if (playerState.health > 0) { // Only trigger if currently alive
            console.log("Player fell into void");
            socket.emit('fellIntoVoid'); // Tell server
            playerState.health = 0; // Update local state immediately
            updateHealthBar(0);
            document.getElementById('info').textContent = `YOU DIED | Waiting to respawn...`;
        }
    }

    // --- Send Updates ---
    // Send logical position (feet position) to server
    const logicalPosition = playerObject.position.clone();
    logicalPosition.y -= PLAYER_HEIGHT; // Adjust Y to represent feet level

    const positionChanged = logicalPosition.distanceToSquared(new THREE.Vector3(playerState.x, playerState.y, playerState.z)) > 0.001; // Check vs logical Y
    const cameraRotation = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ');
    const currentRotationY = cameraRotation.y;
    const rotationChanged = Math.abs(currentRotationY - playerState.rotationY) > 0.01;

    // Send updates less frequently? Throttling might be needed for performance.
    // For now, send if changed significantly.
    if (positionChanged || rotationChanged) {
        playerState.x = logicalPosition.x;
        playerState.y = logicalPosition.y; // Store logical Y locally too
        playerState.z = logicalPosition.z;
        playerState.rotationY = currentRotationY;

        socket.emit('playerUpdate', {
            x: playerState.x,
            y: playerState.y, // Send logical Y
            z: playerState.z,
            rotationY: currentRotationY
        });
    }
}

function shoot() {
    // Check conditions
    if (!socket || !localPlayerId || !controls.isLocked || !players[localPlayerId] || players[localPlayerId].health <= 0) {
        return;
    }

    // Play sound locally
    if (gunshotSound) { // Check if sound loaded successfully
        try {
            // Don't clone if sound is already playing to avoid excessive overlap/errors?
            // Or manage a pool of sounds? Simple play for now.
            // gunshotSound.currentTime = 0; // Reset playback if needed
            // gunshotSound.play();

            // Cloning allows overlap but can consume resources
            const sound = gunshotSound.cloneNode();
            sound.volume = gunshotSound.volume;
            sound.play();
        } catch (e) {
            console.error("Error playing gunshot sound:", e);
        }
    } else {
        console.warn("Gunshot sound not available.");
    }


    // Get bullet origin and direction
    const bulletPosition = new THREE.Vector3();
    const bulletDirection = new THREE.Vector3();
    camera.getWorldPosition(bulletPosition);
    camera.getWorldDirection(bulletDirection);
    // Offset start position slightly in front of camera
    bulletPosition.addScaledVector(bulletDirection, PLAYER_RADIUS * 1.1); // Offset by player radius

    // Send shoot event to server
    socket.emit('shoot', {
        position: { x: bulletPosition.x, y: bulletPosition.y, z: bulletPosition.z },
        direction: { x: bulletDirection.x, y: bulletDirection.y, z: bulletDirection.z }
    });
}

function spawnBullet(bulletData) {
    // Basic bullet mesh
    const geometry = new THREE.SphereGeometry(0.1, 8, 8);
    const material = new THREE.MeshBasicMaterial({ color: 0xffff00 }); // Yellow, ignore lighting
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(bulletData.position.x, bulletData.position.y, bulletData.position.z);

    // Calculate velocity
    const velocity = new THREE.Vector3(
        bulletData.direction.x, bulletData.direction.y, bulletData.direction.z
    ).normalize().multiplyScalar(BULLET_SPEED);

    // Add to tracking array
    bullets.push({
        id: bulletData.bulletId,
        mesh: mesh,
        velocity: velocity,
        ownerId: bulletData.shooterId,
        spawnTime: Date.now()
    });
    scene.add(mesh);
}

function updateBullets(deltaTime) {
    const bulletsToRemoveIndexes = [];
    for (let i = bullets.length - 1; i >= 0; i--) {
        const bullet = bullets[i];
        // Move bullet
        bullet.mesh.position.addScaledVector(bullet.velocity, deltaTime);

        // Client-Side Hit Detection (for immediate feedback, server should verify)
        let hitDetected = false;
        for (const playerId in players) {
            if (playerId !== bullet.ownerId && players[playerId].mesh && players[playerId].mesh.visible) {
                const playerMesh = players[playerId].mesh;
                const distance = bullet.mesh.position.distanceTo(playerMesh.position);
                // Check distance against combined radii (player cylinder + bullet sphere)
                if (distance < PLAYER_RADIUS + 0.1) {
                    console.log(`Client hit: Bullet ${bullet.id} hit Player ${playerId}`);
                    hitDetected = true;
                    // If this client fired, report hit to server
                    if (bullet.ownerId === localPlayerId) {
                        socket.emit('hit', { targetId: playerId, damage: 10 }); // Example damage
                    }
                    // Mark for removal
                    if (!bulletsToRemoveIndexes.includes(i)) bulletsToRemoveIndexes.push(i);
                    scene.remove(bullet.mesh);
                    break; // Bullet is gone
                }
            }
        }
        if (hitDetected) continue; // Skip further checks if hit

        // TODO: Map collision check for bullets (raycast from prev pos to current pos)

        // Bullet lifetime check
        const lifetime = 3000; // 3 seconds
        if (Date.now() - bullet.spawnTime > lifetime) {
            if (!bulletsToRemoveIndexes.includes(i)) bulletsToRemoveIndexes.push(i);
            scene.remove(bullet.mesh);
        }
    }

    // Remove bullets marked for deletion
    bulletsToRemoveIndexes.sort((a, b) => b - a); // Sort descending for safe splice
    for (const index of bulletsToRemoveIndexes) {
        bullets.splice(index, 1);
    }
}

function updateOtherPlayers(deltaTime) {
    // Interpolate remote player positions for smooth movement
    for (const id in players) {
        if (id !== localPlayerId && players[id].mesh) {
            const player = players[id];
            const mesh = player.mesh;
            // Interpolate position (Lerp)
            if (player.targetPosition) {
                mesh.position.lerp(player.targetPosition, deltaTime * 10); // Adjust interpolation speed (10)
            }
            // Interpolate rotation (Slerp or Lerp)
            if (player.targetRotationY !== undefined) {
                // Lerp Y rotation (simpler)
                let angleDiff = player.targetRotationY - mesh.rotation.y;
                // Ensure shortest path for rotation
                while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
                while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
                mesh.rotation.y += angleDiff * deltaTime * 10; // Adjust speed (10)
            }
        }
    }
}

// --- UI Update ---
function updateHealthBar(health) {
    const healthPercentage = Math.max(0, Math.min(100, health)); // Clamp 0-100
    if (healthBarFill && healthText) {
        const fillWidth = `${healthPercentage}%`;
        const backgroundPosition = `${100 - healthPercentage}% 0%`; // Map health to gradient

        healthBarFill.style.width = fillWidth;
        healthBarFill.style.backgroundPosition = backgroundPosition;
        healthText.textContent = `${Math.round(healthPercentage)}%`;
    }
}

// --- Animation Loop ---
function animate() {
    requestAnimationFrame(animate); // Request next frame
    const deltaTime = Math.min(0.05, clock.getDelta()); // Delta time, capped to prevent large jumps if tab loses focus

    // Order of updates matters
    updatePlayer(deltaTime);    // Handle local input, physics, collisions, send updates
    updateBullets(deltaTime);   // Move bullets, check hits
    updateOtherPlayers(deltaTime); // Interpolate remote players

    // Render scene
    if (renderer && scene && camera) {
        renderer.render(scene, camera);
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

// --- Start the initialization process ---
init();
