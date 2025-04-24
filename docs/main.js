// docs/main.js

// --- Configuration ---
// IMPORTANT: Replace with your DEPLOYED server URL from Render
const SERVER_URL = 'https://gametest-psxl.onrender.com'; // <<< PASTE YOUR RENDER URL HERE
const MOVEMENT_SPEED = 5.0;
const MOUSE_SENSITIVITY = 0.002;
const BULLET_SPEED = 50;
const PLAYER_HEIGHT = 1.8; // Assumed height for camera

// --- Global Variables ---
let scene, camera, renderer, controls;
let socket;
let localPlayerId = null;
let players = {}; // Store local representation of players { id: { mesh, ...serverData } }
let bullets = []; // Store local representation of bullets { mesh, velocity, ownerId, id, spawnTime }
let keys = {}; // Track pressed keys
let lastUpdateTime = Date.now();
const clock = new THREE.Clock(); // Used for getting delta time in animation loop
const loader = new THREE.GLTFLoader(); // For loading maps/models
const dracoLoader = new THREE.DRACOLoader(); // <<< ADDED DRACO LOADER INSTANCE
let mapMesh = null; // To hold the loaded map mesh

// --- Initialization ---
function init() {
    // Scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87ceeb); // Sky blue background
    scene.fog = new THREE.Fog(0x87ceeb, 0, 100); // Add some distance fog

    // Camera (Perspective)
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);

    // Renderer
    renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('gameCanvas'), antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(5, 10, 7);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 1024;
    directionalLight.shadow.mapSize.height = 1024;
    directionalLight.shadow.camera.near = 0.5;
    directionalLight.shadow.camera.far = 50;
    scene.add(directionalLight);

    // Ground (Simple plane, your map might replace this)
    const groundGeometry = new THREE.PlaneGeometry(100, 100);
    const groundMaterial = new THREE.MeshStandardMaterial({ color: 0x556B2F });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    // Pointer Lock Controls
    controls = new THREE.PointerLockControls(camera, document.body);
    controls.getObject().position.y = PLAYER_HEIGHT;
    scene.add(controls.getObject());

    const canvas = document.getElementById('gameCanvas');
    canvas.addEventListener('click', () => {
        controls.lock();
    });
    controls.addEventListener('lock', () => console.log('Pointer Locked'));
    controls.addEventListener('unlock', () => console.log('Pointer Unlocked'));

    // Load your map - *** MAKE SURE THE PATH AND FILENAME ARE CORRECT ***
    loadMap('assets/maps/your_map.glb'); // <<< CHANGE 'your_map.glb' TO YOUR MAP FILENAME

    // Event Listeners
    document.addEventListener('keydown', (event) => { keys[event.code] = true; });
    document.addEventListener('keyup', (event) => { keys[event.code] = false; });
    document.addEventListener('mousedown', (event) => {
        if (controls.isLocked && event.button === 0) { shoot(); }
    });
    window.addEventListener('resize', onWindowResize, false);

    // Connect to Server
    setupSocketIO();

    // Start loop
    animate();
}

// --- Networking (Socket.IO) ---
function setupSocketIO() {
    socket = io(SERVER_URL, { transports: ['websocket'] });

    socket.on('connect', () => {
        console.log('Connected to server! My socket ID:', socket.id);
        document.getElementById('info').textContent = 'Connected';
    });

    socket.on('disconnect', (reason) => {
        console.warn('Disconnected from server! Reason:', reason);
        document.getElementById('info').textContent = 'Disconnected. Refresh?';
        for (const id in players) {
            if (players[id].mesh) scene.remove(players[id].mesh);
        }
        players = {};
    });

    socket.on('connect_error', (err) => {
        console.error('Connection Error:', err.message, err.stack);
        document.getElementById('info').textContent = `Error connecting. Check server URL/status & console (F12).`;
    });

    socket.on('initialize', (data) => {
        localPlayerId = data.id;
        console.log('Initialized with ID:', localPlayerId);
        for (const id in data.players) {
            const playerData = data.players[id];
            if (id === localPlayerId) {
                controls.getObject().position.set(playerData.x, PLAYER_HEIGHT, playerData.z);
                players[id] = { ...playerData, mesh: null };
                document.getElementById('info').textContent = `Connected | Health: ${playerData.health}`;
            } else {
                addPlayer(playerData);
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
            player.targetPosition = new THREE.Vector3(playerData.x, playerData.y, playerData.z);
            player.targetRotationY = playerData.rotationY;
            player.x = playerData.x;
            player.y = playerData.y;
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
            if(data.id === localPlayerId) {
                document.getElementById('info').textContent = `Connected | Health: ${data.health}`;
            }
        }
    });

    socket.on('playerDied', (data) => {
        console.log(`Player ${data.targetId} was defeated by ${data.killerId}`);
        if (players[data.targetId]) {
            players[data.targetId].health = 0;
            if (players[data.targetId].mesh) {
                players[data.targetId].mesh.visible = false;
            }
        }
        if (data.targetId === localPlayerId) {
            document.getElementById('info').textContent = `YOU WERE DEFEATED | Waiting to respawn...`;
        }
    });

    socket.on('playerRespawned', (playerData) => {
        console.log(`Player ${playerData.id} respawned`);
        if (players[playerData.id]) {
            players[playerData.id].health = playerData.health;
            players[playerData.id].x = playerData.x;
            players[playerData.id].y = playerData.y;
            players[playerData.id].z = playerData.z;
            players[playerData.id].rotationY = playerData.rotationY;

            if (players[playerData.id].mesh) {
                players[playerData.id].mesh.visible = true;
                players[playerData.id].mesh.position.set(playerData.x, playerData.y, playerData.z);
                players[playerData.id].targetPosition = new THREE.Vector3(playerData.x, playerData.y, playerData.z);
                players[playerData.id].targetRotationY = playerData.rotationY;
            }
            if (playerData.id === localPlayerId) {
                controls.getObject().position.set(playerData.x, PLAYER_HEIGHT, playerData.z);
                document.getElementById('info').textContent = `RESPAWNED | Health: ${playerData.health}`;
            }
        } else {
             console.log('Respawned player was not previously known, adding now.');
             addPlayer(playerData);
        }
    });
}

// --- Player Management ---
function addPlayer(playerData) {
    console.log('>>> addPlayer function called with:', playerData);
    if (players[playerData.id] || playerData.id === localPlayerId) {
         console.log(`>>> addPlayer: Skipping add for ${playerData.id} (already exists or is local)`);
         return;
    }

    console.log("Adding player model to scene:", playerData.id);
    // Use CylinderGeometry instead of CapsuleGeometry
    const geometry = new THREE.CylinderGeometry(0.4, 0.4, 1.8, 8); // (radiusTop, radiusBottom, height, radialSegments)
    const material = new THREE.MeshStandardMaterial({ color: 0x00ff00 });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    // Position the base of the cylinder near y=0, assuming height is 1.8, offset by height/2
    mesh.position.set(playerData.x, playerData.y + (1.8 / 2), playerData.z); // Adjust Y position based on geometry origin
    mesh.rotation.y = playerData.rotationY;
    scene.add(mesh);
    console.log('>>> addPlayer: Added mesh to scene:', mesh);

    players[playerData.id] = {
        ...playerData,
        mesh: mesh,
        // Adjust target position Y based on geometry origin if needed, maybe just use server Y?
        targetPosition: new THREE.Vector3(playerData.x, playerData.y + (1.8 / 2), playerData.z), // Adjusted Y
        targetRotationY: playerData.rotationY
    };
     console.log('>>> addPlayer: Updated local players object:', players);
}

// --- Map Loading ---
function loadMap(mapPath) {
    console.log(`Attempting to load map: ${mapPath}`);

    // --- Configure DracoLoader --- <<< ADDED THIS BLOCK ---
    // Specify path to the folder containing the decoder files (relative to index.html or absolute URL)
    // Using the CDN path directly is easiest here.
    dracoLoader.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/libs/draco/');
    dracoLoader.setDecoderConfig({ type: 'js' }); // Use the JS decoder
    loader.setDRACOLoader(dracoLoader); // Attach the configured Draco loader to the main GLTF loader
    // ------------------------------------------------------

    loader.load(
        mapPath,
        // Success callback
        (gltf) => {
            console.log("Map loaded successfully!");
            mapMesh = gltf.scene;
            mapMesh.traverse((child) => {
                if (child.isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                }
            });
            scene.add(mapMesh);
        },
        // Progress callback
        (xhr) => {
            const percentLoaded = Math.round(xhr.loaded / xhr.total * 100);
            console.log(`Map loading progress: ${percentLoaded}%`);
        },
        // Error callback
        (error) => {
            // Log the detailed error object
            console.error('Error loading map:', error);
            // Display a more informative message, including the error type if possible
            document.getElementById('info').textContent = `Error loading map: ${error.message || error}. Check console (F12).`;
        }
    );
}

// --- Game Logic ---
function handleInput(deltaTime) {
    if (!controls.isLocked || !localPlayerId || !players[localPlayerId]) return;
    if (players[localPlayerId].health <= 0) return;

    const speed = MOVEMENT_SPEED * deltaTime;
    const moveDirection = new THREE.Vector3();

    if (keys['KeyW'] || keys['ArrowUp']) { moveDirection.z = -1; }
    if (keys['KeyS'] || keys['ArrowDown']) { moveDirection.z = 1; }
    if (keys['KeyA'] || keys['ArrowLeft']) { moveDirection.x = -1; }
    if (keys['KeyD'] || keys['ArrowRight']) { moveDirection.x = 1; }

    if (moveDirection.lengthSq() > 1) {
         moveDirection.normalize();
    }

    let moved = false;
    if (moveDirection.z !== 0) { controls.moveForward(moveDirection.z * speed); moved = true; }
    if (moveDirection.x !== 0) { controls.moveRight(moveDirection.x * speed); moved = true; }

    // Basic floor collision
    if (controls.getObject().position.y < PLAYER_HEIGHT) {
        controls.getObject().position.y = PLAYER_HEIGHT;
    }

    const currentPosition = controls.getObject().position;
    const cameraRotation = new THREE.Euler();
    cameraRotation.setFromQuaternion(camera.quaternion, 'YXZ');
    const currentRotationY = cameraRotation.y;

    const lastState = players[localPlayerId];
    // Use a slightly larger threshold for sending updates to avoid spamming
    const positionChanged = currentPosition.distanceToSquared(new THREE.Vector3(lastState.x, lastState.y, lastState.z)) > 0.01;
    const rotationChanged = Math.abs(currentRotationY - lastState.rotationY) > 0.05; // Increased threshold slightly

    if (moved || rotationChanged) {
        lastState.x = currentPosition.x;
        lastState.y = currentPosition.y;
        lastState.z = currentPosition.z;
        lastState.rotationY = currentRotationY;

        socket.emit('playerUpdate', {
            x: currentPosition.x,
            y: currentPosition.y,
            z: currentPosition.z,
            rotationY: currentRotationY
        });
    }
}

function shoot() {
    if (!socket || !localPlayerId || !controls.isLocked || !players[localPlayerId] || players[localPlayerId].health <= 0) return;

    const bulletPosition = new THREE.Vector3();
    const bulletDirection = new THREE.Vector3();

    camera.getWorldPosition(bulletPosition);
    camera.getWorldDirection(bulletDirection);
    bulletPosition.addScaledVector(bulletDirection, 1.0);

    // console.log("Client attempting to shoot"); // Reduce logging noise

    socket.emit('shoot', {
        position: { x: bulletPosition.x, y: bulletPosition.y, z: bulletPosition.z },
        direction: { x: bulletDirection.x, y: bulletDirection.y, z: bulletDirection.z }
    });
}

function spawnBullet(bulletData) {
    const geometry = new THREE.SphereGeometry(0.1, 8, 8);
    const material = new THREE.MeshBasicMaterial({ color: 0xffff00 });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(bulletData.position.x, bulletData.position.y, bulletData.position.z);
    const velocity = new THREE.Vector3(
        bulletData.direction.x, bulletData.direction.y, bulletData.direction.z
    ).normalize().multiplyScalar(BULLET_SPEED);

    bullets.push({
        id: bulletData.bulletId, mesh: mesh, velocity: velocity,
        ownerId: bulletData.shooterId, spawnTime: Date.now()
    });
    scene.add(mesh);
}

function updateBullets(deltaTime) {
    const bulletsToRemoveIndexes = [];
    for (let i = bullets.length - 1; i >= 0; i--) {
        const bullet = bullets[i];
        bullet.mesh.position.addScaledVector(bullet.velocity, deltaTime);
        let hitDetected = false;

        for (const playerId in players) {
            if (playerId !== bullet.ownerId && players[playerId].mesh && players[playerId].mesh.visible) {
                const playerMesh = players[playerId].mesh;
                // Adjust distance check based on Cylinder height/radius
                const distance = bullet.mesh.position.distanceTo(playerMesh.position);
                const collisionThreshold = 0.5 + 0.1; // Player radius + bullet radius
                if (distance < collisionThreshold) {
                     // More accurate check might involve capsule/cylinder intersection
                    console.log(`Client-side hit detected: Bullet ${bullet.id} hit Player ${playerId}`);
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

        // TODO: Add map collision check for bullets

        const lifetime = 3000;
        if (Date.now() - bullet.spawnTime > lifetime) {
            if (!bulletsToRemoveIndexes.includes(i)) bulletsToRemoveIndexes.push(i);
            scene.remove(bullet.mesh);
        }
    }

    bulletsToRemoveIndexes.sort((a, b) => b - a);
    for (const index of bulletsToRemoveIndexes) {
        bullets.splice(index, 1);
    }
}

function updateOtherPlayers(deltaTime) {
    for (const id in players) {
        if (id !== localPlayerId && players[id].mesh) {
            const player = players[id];
            const mesh = player.mesh;
            if (player.targetPosition && player.targetRotationY !== undefined) {
                mesh.position.lerp(player.targetPosition, deltaTime * 15);
                let angleDiff = player.targetRotationY - mesh.rotation.y;
                while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
                while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
                mesh.rotation.y += angleDiff * deltaTime * 15;
            }
        }
    }
}

// --- Animation Loop ---
function animate() {
    requestAnimationFrame(animate);
    const deltaTime = clock.getDelta();
    handleInput(deltaTime);
    updateBullets(deltaTime);
    updateOtherPlayers(deltaTime);
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

// --- Start ---
init();
