// client/main.js

// --- Configuration ---
// IMPORTANT: Replace with your DEPLOYED server URL AFTER deploying the server on Render
const SERVER_URL = 'http://localhost:3000'; // <<< YOU WILL CHANGE THIS LATER
const MOVEMENT_SPEED = 5.0;
const MOUSE_SENSITIVITY = 0.002; // Added for PointerLockControls adjustment if needed, though controls handle it
const BULLET_SPEED = 50;
const PLAYER_HEIGHT = 1.8; // Assumed height for camera, adjust if needed

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
let mapMesh = null; // To hold the loaded map mesh

// --- Initialization ---
function init() {
    // Scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87ceeb); // Sky blue background
    scene.fog = new THREE.Fog(0x87ceeb, 0, 100); // Add some distance fog

    // Camera (Perspective)
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    // We don't set camera.position.y here directly anymore, PointerLockControls handles it within its object

    // Renderer
    renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('gameCanvas'), antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true; // Enable shadows

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5); // Soft ambient light
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8); // Brighter directional light
    directionalLight.position.set(5, 10, 7); // Position the light source
    directionalLight.castShadow = true; // Allow this light to cast shadows
    // Configure shadow properties (optional, adjust for performance/quality)
    directionalLight.shadow.mapSize.width = 1024;
    directionalLight.shadow.mapSize.height = 1024;
    directionalLight.shadow.camera.near = 0.5;
    directionalLight.shadow.camera.far = 50;
    scene.add(directionalLight);

    // Ground (Simple plane for testing, your map should ideally include a ground)
    const groundGeometry = new THREE.PlaneGeometry(100, 100);
    // Use MeshStandardMaterial for realistic lighting interaction
    const groundMaterial = new THREE.MeshStandardMaterial({ color: 0x556B2F }); // Dark Olive Green
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2; // Rotate plane to be horizontal
    ground.receiveShadow = true; // Allow ground to receive shadows
    scene.add(ground);

    // Pointer Lock Controls (First Person Shooter style)
    controls = new THREE.PointerLockControls(camera, document.body);
    // Set the initial height of the controls object (which contains the camera)
    controls.getObject().position.y = PLAYER_HEIGHT;
    scene.add(controls.getObject()); // Add the controls object (camera rig) to the scene

    // Event listener to lock pointer on canvas click
    const canvas = document.getElementById('gameCanvas');
    canvas.addEventListener('click', () => {
        controls.lock();
    });

    controls.addEventListener('lock', () => console.log('Pointer Locked'));
    controls.addEventListener('unlock', () => console.log('Pointer Unlocked'));

    // Load your map - *** MAKE SURE THE PATH AND FILENAME ARE CORRECT ***
    loadMap('assets/maps/map.glb'); // <<< CHANGE 'your_map.glb' TO YOUR ACTUAL MAP FILENAME

    // Event Listeners for Keyboard Input
    document.addEventListener('keydown', (event) => { keys[event.code] = true; });
    document.addEventListener('keyup', (event) => { keys[event.code] = false; });

    // Event Listener for Shooting (Mouse Click)
    document.addEventListener('mousedown', (event) => {
        // Check if controls are locked and it's the left mouse button (button code 0)
        if (controls.isLocked && event.button === 0) {
            shoot();
        }
    });

    // Window Resize Handling
    window.addEventListener('resize', onWindowResize, false);

    // Connect to the WebSocket Server
    setupSocketIO();

    // Start the main game loop
    animate();
}

// --- Networking (Socket.IO) ---
function setupSocketIO() {
    // Connect to the server URL defined at the top
    // Using { transports: ['websocket'] } can sometimes help bypass proxy issues
    socket = io(SERVER_URL, { transports: ['websocket'] });

    socket.on('connect', () => {
        console.log('Connected to server! My socket ID:', socket.id);
        document.getElementById('info').textContent = 'Connected';
        // Note: We get the final player ID from the 'initialize' event
    });

    socket.on('disconnect', (reason) => {
        console.warn('Disconnected from server! Reason:', reason);
        document.getElementById('info').textContent = 'Disconnected. Refresh?';
        // Clean up local game state when disconnected
        for (const id in players) {
            if (players[id].mesh) scene.remove(players[id].mesh);
        }
        players = {};
        // Maybe disable controls or show a reconnect button
    });

    socket.on('connect_error', (err) => {
        console.error('Connection Error:', err.message, err.stack);
        document.getElementById('info').textContent = `Error connecting. Check server URL/status & console (F12).`;
        // Display more details about the error if available
    });

    // Receive initial game state from server upon connection
    socket.on('initialize', (data) => {
        localPlayerId = data.id; // Store our own ID
        console.log('Initialized with ID:', localPlayerId);

        // Add all players currently in the game state received from server
        for (const id in data.players) {
            const playerData = data.players[id];
            if (id === localPlayerId) {
                // This is us! Set our initial position based on server data
                // (Server might assign a spawn point)
                controls.getObject().position.set(playerData.x, PLAYER_HEIGHT, playerData.z);
                // Store our own server data locally (without a mesh for ourselves)
                players[id] = { ...playerData, mesh: null };
                // Update UI with initial health
                document.getElementById('info').textContent = `Connected | Health: ${playerData.health}`;
            } else {
                // This is another player, add them to the scene
                addPlayer(playerData);
            }
        }
        console.log("Initial players state:", players);
    });

    // Handle a new player joining after we've already connected
    socket.on('playerJoined', (playerData) => {
        // Make sure not to add ourselves again if server sends redundant join event
        if (playerData.id !== localPlayerId && !players[playerData.id]) {
            console.log('Player joined:', playerData.id);
            addPlayer(playerData);
        }
    });

    // Handle a player leaving the game
    socket.on('playerLeft', (playerId) => {
        console.log('Player left:', playerId);
        if (players[playerId] && players[playerId].mesh) {
            scene.remove(players[playerId].mesh); // Remove their 3D model
        }
        delete players[playerId]; // Remove their data from our local store
    });

    // Handle movement/rotation updates for other players
    socket.on('playerMoved', (playerData) => {
        // Update only if it's another player and we know about them
        if (playerData.id !== localPlayerId && players[playerData.id]) {
            const player = players[playerData.id];
            // Store the target state for smooth interpolation in the animate loop
            player.targetPosition = new THREE.Vector3(playerData.x, playerData.y, playerData.z);
            player.targetRotationY = playerData.rotationY;
            // Also update the raw data
            player.x = playerData.x;
            player.y = playerData.y;
            player.z = playerData.z;
            player.rotationY = playerData.rotationY;
        }
    });

    // Handle shots fired by other players (or our own relayed back)
    socket.on('shotFired', (bulletData) => {
        // Spawn a visual representation of the bullet
        // We don't need to spawn our *own* bullet again here usually,
        // because we spawn it locally in shoot() for responsiveness.
        // However, spawning it here ensures synchronization if needed.
        // Let's spawn all bullets received from server for simplicity now.
         spawnBullet(bulletData);
    });

    // Handle health updates for any player
    socket.on('healthUpdate', (data) => {
        if (players[data.id]) {
            players[data.id].health = data.health;
            console.log(`Player ${data.id} health updated to: ${data.health}`);
            // Update our own health display if it's us
            if(data.id === localPlayerId) {
                document.getElementById('info').textContent = `Connected | Health: ${data.health}`;
            }
            // Optionally change player mesh color or show damage indicator
            if (players[data.id].mesh) {
                // Example: Flash red briefly (more complex effect needed for real game)
                // players[data.id].mesh.material.color.set(0xff0000);
                // setTimeout(() => { if(players[data.id] && players[data.id].mesh) players[data.id].mesh.material.color.set(0x00ff00); }, 100);
            }
        }
    });

    // Handle a player being defeated
    socket.on('playerDied', (data) => {
        console.log(`Player ${data.targetId} was defeated by ${data.killerId}`);
        if (players[data.targetId]) {
             // Update local health state even if healthUpdate didn't arrive first
            players[data.targetId].health = 0;
            // If it's another player, maybe make their mesh disappear or play death effect
            if (players[data.targetId].mesh) {
                players[data.targetId].mesh.visible = false; // Hide mesh on death
                 // You could replace this with a death animation or effect later
            }
        }
        // Update our UI if we died
        if (data.targetId === localPlayerId) {
            document.getElementById('info').textContent = `YOU WERE DEFEATED | Waiting to respawn...`;
            // Optionally disable controls, show a death screen overlay, etc.
            // controls.unlock(); // Example: unlock mouse pointer on death
        }
    });

    // Handle a player respawning
    socket.on('playerRespawned', (playerData) => {
        console.log(`Player ${playerData.id} respawned`);
        if (players[playerData.id]) {
            // Update data for the respawned player
            players[playerData.id].health = playerData.health;
            players[playerData.id].x = playerData.x;
            players[playerData.id].y = playerData.y;
            players[playerData.id].z = playerData.z;
            players[playerData.id].rotationY = playerData.rotationY;

            // If it's another player, make their mesh visible again and move it
            if (players[playerData.id].mesh) {
                players[playerData.id].mesh.visible = true;
                players[playerData.id].mesh.position.set(playerData.x, playerData.y, playerData.z);
                // Set interpolation targets to the new spawn point
                players[playerData.id].targetPosition = new THREE.Vector3(playerData.x, playerData.y, playerData.z);
                players[playerData.id].targetRotationY = playerData.rotationY;
                 // Reset color if changed on hit/death
                // players[playerData.id].mesh.material.color.set(0x00ff00);
            }
            // If it's our local player respawning
            if (playerData.id === localPlayerId) {
                controls.getObject().position.set(playerData.x, PLAYER_HEIGHT, playerData.z);
                document.getElementById('info').textContent = `RESPAWNED | Health: ${playerData.health}`;
                // Re-enable controls if they were disabled, potentially lock pointer again
                // if (!controls.isLocked) controls.lock();
            }
        } else {
            // If the player wasn't known before (e.g., joined while we were dead), add them now
             console.log('Respawned player was not previously known, adding now.');
             addPlayer(playerData);
        }
    });
}

// --- Player Management ---
function addPlayer(playerData) {
    // Avoid adding if player already exists or is the local player
    if (players[playerData.id] || playerData.id === localPlayerId) return;

    console.log("Adding player model to scene:", playerData.id);
    // Use a simple capsule or cylinder to represent other players for now
    const geometry = new THREE.CapsuleGeometry(0.4, 1.0, 4, 8); // Radius, Height
    // Use MeshStandardMaterial so they react to scene lighting
    const material = new THREE.MeshStandardMaterial({ color: 0x00ff00 }); // Green
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true; // Player models should cast shadows
    mesh.position.set(playerData.x, playerData.y, playerData.z); // Set initial position from server data
    mesh.rotation.y = playerData.rotationY; // Set initial rotation
    scene.add(mesh);

    // Store the player data along with their mesh and target state for interpolation
    players[playerData.id] = {
        ...playerData, // Include all data received from server (id, x, y, z, rotY, health)
        mesh: mesh,
        targetPosition: new THREE.Vector3(playerData.x, playerData.y, playerData.z), // Initial interpolation target
        targetRotationY: playerData.rotationY
    };
}

// --- Map Loading ---
function loadMap(mapPath) {
    console.log(`Attempting to load map: ${mapPath}`);
    loader.load(
        mapPath,
        // Success callback
        (gltf) => {
            console.log("Map loaded successfully!");
            mapMesh = gltf.scene;
            // Iterate through all objects in the loaded map model
            mapMesh.traverse((child) => {
                // Check if the child object is a Mesh
                if (child.isMesh) {
                    child.castShadow = true;    // Allow map parts to cast shadows
                    child.receiveShadow = true; // Allow map parts to receive shadows
                    // IMPORTANT: For collision detection later, you might store these meshes
                    // in an array or assign user data for identification.
                    // Example: child.userData.isCollidable = true;
                }
            });
            scene.add(mapMesh); // Add the entire loaded map scene to our main scene
            // Optional: Adjust lighting, player spawn logic based on map size/features
        },
        // Progress callback (optional)
        (xhr) => {
            const percentLoaded = Math.round(xhr.loaded / xhr.total * 100);
            console.log(`Map loading progress: ${percentLoaded}%`);
            // You could update a loading bar UI element here
        },
        // Error callback
        (error) => {
            console.error('Error loading map:', error);
            document.getElementById('info').textContent = `Error loading map: ${mapPath}. Check console (F12).`;
            // Maybe load a default fallback map or show a persistent error message
        }
    );
}

// --- Game Logic ---
function handleInput(deltaTime) {
    // Only process input if the PointerLockControls are active and we have our ID
    if (!controls.isLocked || !localPlayerId || !players[localPlayerId]) return;

    // Check if player is alive (basic check)
    if (players[localPlayerId].health <= 0) return; // Don't allow movement if dead

    const speed = MOVEMENT_SPEED * deltaTime; // Calculate distance moved this frame
    const moveDirection = new THREE.Vector3(); // Store intended movement direction

    // Get forward/backward and strafe directions based on pressed keys
    if (keys['KeyW'] || keys['ArrowUp']) { moveDirection.z = -1; }
    if (keys['KeyS'] || keys['ArrowDown']) { moveDirection.z = 1; }
    if (keys['KeyA'] || keys['ArrowLeft']) { moveDirection.x = -1; }
    if (keys['KeyD'] || keys['ArrowRight']) { moveDirection.x = 1; }

    // If moving diagonally, normalize the direction vector to prevent faster diagonal speed
    if (moveDirection.lengthSq() > 1) { // Use lengthSq for efficiency (sqrt is slow)
         moveDirection.normalize();
    }

    let moved = false; // Flag to check if position changed

    // Apply movement using PointerLockControls' built-in methods
    // These move the player relative to the camera's current direction
    if (moveDirection.z !== 0) {
         controls.moveForward(moveDirection.z * speed);
         moved = true;
    }
    if (moveDirection.x !== 0) {
         controls.moveRight(moveDirection.x * speed);
         moved = true;
    }


    // --- Basic Collision Detection Placeholder ---
    // This is extremely basic and only prevents falling through the y=0 plane.
    // Real collision requires checking against the map geometry (using Raycasting or a Physics Engine).
    if (controls.getObject().position.y < PLAYER_HEIGHT) {
        controls.getObject().position.y = PLAYER_HEIGHT;
        // Add logic here later to stop movement if colliding with walls/obstacles
    }
    // --- End Placeholder ---


    // Get current position and rotation to send to server
    const currentPosition = controls.getObject().position;
    // Get camera rotation (specifically the Y rotation for facing direction)
    const cameraRotation = new THREE.Euler();
    // Extract Euler angles from the camera's quaternion, order 'YXZ' is typical for FPS
    cameraRotation.setFromQuaternion(camera.quaternion, 'YXZ');
    const currentRotationY = cameraRotation.y;

    // Send updated state to server periodically or if a significant change occurred
    // Compare current state with the last known state *we* had locally
    const lastState = players[localPlayerId];
    const positionChanged = currentPosition.distanceToSquared(new THREE.Vector3(lastState.x, lastState.y, lastState.z)) > 0.001; // Check squared distance threshold
    const rotationChanged = Math.abs(currentRotationY - lastState.rotationY) > 0.01; // Check rotation threshold (radians)

    if (moved || rotationChanged) { // Send if position changed OR rotation changed
        // Update our local cache immediately for responsiveness (client-side prediction)
        lastState.x = currentPosition.x;
        // Only update Y if you have vertical movement/jumping, otherwise keep it fixed or use server value
        lastState.y = currentPosition.y; // Update Y position based on controls object
        lastState.z = currentPosition.z;
        lastState.rotationY = currentRotationY;

        // Throttle updates slightly? Or send every frame change occurs?
        // Sending too often can overload server/network, too slow causes lag.
        // A common approach is ~10-20 times per second, or on significant changes.
        // For now, send whenever changed.
        socket.emit('playerUpdate', {
            x: currentPosition.x,
            y: currentPosition.y, // Send current Y position
            z: currentPosition.z,
            rotationY: currentRotationY
        });
    }
}

function shoot() {
    // Can only shoot if connected, have ID, controls are locked, and alive
    if (!socket || !localPlayerId || !controls.isLocked || !players[localPlayerId] || players[localPlayerId].health <= 0) return;

    const bulletPosition = new THREE.Vector3();
    const bulletDirection = new THREE.Vector3();

    // Get camera's current world position and direction
    camera.getWorldPosition(bulletPosition);
    camera.getWorldDirection(bulletDirection);

    // Optional: Offset the bullet start position slightly forward from the camera
    // to prevent it spawning inside the player model/camera near plane.
    bulletPosition.addScaledVector(bulletDirection, 1.0); // Move 1 unit forward

    console.log("Client attempting to shoot");

    // --- Client-Side Prediction for Bullets ---
    // Spawn the bullet locally immediately for responsiveness.
    // The server will send a 'shotFired' event back, potentially with a server-authoritative ID.
    const localBulletData = {
        shooterId: localPlayerId,
        position: { x: bulletPosition.x, y: bulletPosition.y, z: bulletPosition.z },
        direction: { x: bulletDirection.x, y: bulletDirection.y, z: bulletDirection.z },
        bulletId: 'local_' + Date.now() + Math.random() // Temporary local ID
    };
    // spawnBullet(localBulletData); // We let the server's shotFired event handle spawning now

    // --- Send shoot event to server ---
    // The server will process this, validate it, and broadcast 'shotFired' to all clients.
    socket.emit('shoot', {
        // Send the calculated position and direction
        position: localBulletData.position,
        direction: localBulletData.direction
    });
}

function spawnBullet(bulletData) {
    // console.log(`Spawning bullet ${bulletData.bulletId} from ${bulletData.shooterId}`);
    const geometry = new THREE.SphereGeometry(0.1, 8, 8); // Small sphere for bullet
    const material = new THREE.MeshBasicMaterial({ color: 0xffff00 }); // Bright yellow, no lighting needed
    const mesh = new THREE.Mesh(geometry, material);

    // Set initial position based on server data
    mesh.position.set(bulletData.position.x, bulletData.position.y, bulletData.position.z);

    // Calculate velocity vector
    const velocity = new THREE.Vector3(
        bulletData.direction.x,
        bulletData.direction.y,
        bulletData.direction.z
    ).normalize().multiplyScalar(BULLET_SPEED); // Normalize direction and apply speed

    // Add the bullet to our local tracking array
    bullets.push({
        id: bulletData.bulletId, // Use ID from server/data
        mesh: mesh,
        velocity: velocity,
        ownerId: bulletData.shooterId,
        spawnTime: Date.now() // Track when it was spawned for lifetime or debugging
    });

    scene.add(mesh); // Add the bullet mesh to the scene
}

function updateBullets(deltaTime) {
    const bulletsToRemoveIndexes = []; // Store indexes of bullets to remove this frame

    // Loop through bullets backwards is safer when removing elements
    for (let i = bullets.length - 1; i >= 0; i--) {
        const bullet = bullets[i];

        // --- Move the bullet ---
        bullet.mesh.position.addScaledVector(bullet.velocity, deltaTime);

        // --- Client-Side Hit Detection (Less Secure, but simpler for now) ---
        // Check for collision against other players (not the owner)
        let hitDetected = false;
        for (const playerId in players) {
            // Check if it's another player, they have a mesh, and they are currently visible/alive
            if (playerId !== bullet.ownerId && players[playerId].mesh && players[playerId].mesh.visible) {
                const playerMesh = players[playerId].mesh;
                const distance = bullet.mesh.position.distanceTo(playerMesh.position);

                // Simple distance check (approximating player as a sphere)
                // Use capsule radius (0.4) + bullet radius (0.1) + a little buffer
                const collisionThreshold = 0.5;
                if (distance < collisionThreshold) {
                    console.log(`Client-side hit detected: Bullet ${bullet.id} hit Player ${playerId}`);
                    hitDetected = true;

                    // If *this* client fired the bullet, tell the server about the hit.
                    // This is the insecure part - the server should ideally verify this.
                    if (bullet.ownerId === localPlayerId) {
                        socket.emit('hit', { targetId: playerId, damage: 10 }); // Send hit report to server
                    }

                    // Mark bullet for removal after processing hits this frame
                    if (!bulletsToRemoveIndexes.includes(i)) {
                        bulletsToRemoveIndexes.push(i);
                    }
                    scene.remove(bullet.mesh); // Immediately remove visual representation
                    break; // Bullet hit someone, stop checking this bullet against other players
                }
            }
        }

         // If hit detected, continue to next bullet
         if (hitDetected) continue;


        // --- Map Collision Placeholder ---
        // TODO: Implement bullet collision with the mapMesh
        // This typically involves raycasting from the bullet's previous position
        // to its current position against the map geometry.
        // If a hit occurs, remove the bullet.
        // Example (pseudo-code):
        // raycaster.set(prevPosition, direction);
        // const intersects = raycaster.intersectObject(mapMesh, true); // true for recursive check
        // if (intersects.length > 0 && intersects[0].distance < distanceTravelledThisFrame) {
        //     bulletsToRemoveIndexes.push(i);
        //     scene.remove(bullet.mesh);
        //     continue; // Go to next bullet
        // }


        // --- Bullet Lifetime ---
        // Remove bullets that have traveled too long (e.g., 3 seconds)
        const lifetime = 3000; // milliseconds
        if (Date.now() - bullet.spawnTime > lifetime) {
            if (!bulletsToRemoveIndexes.includes(i)) { // Avoid adding duplicates
                 bulletsToRemoveIndexes.push(i);
            }
            scene.remove(bullet.mesh); // Remove visual
        }
    } // End bullet loop

    // --- Remove bullets marked for deletion ---
    // Sort indexes descending to avoid messing up array order during splice
    bulletsToRemoveIndexes.sort((a, b) => b - a);
    for (const index of bulletsToRemoveIndexes) {
        bullets.splice(index, 1); // Remove from the tracking array
    }
}

function updateOtherPlayers(deltaTime) {
    // Interpolate movement for smoother visuals of other players
    for (const id in players) {
        // Only interpolate players who are not us and have a mesh
        if (id !== localPlayerId && players[id].mesh) {
            const player = players[id];
            const mesh = player.mesh;

            // If the player has a target position/rotation set by network updates
            if (player.targetPosition && player.targetRotationY !== undefined) {
                // Interpolate position using Vector3.lerp
                // Lerp factor (e.g., deltaTime * 10) controls smoothness vs responsiveness
                mesh.position.lerp(player.targetPosition, deltaTime * 15);

                // Interpolate Y rotation smoothly
                // Calculate the shortest angle difference to avoid spinning the long way around
                let angleDiff = player.targetRotationY - mesh.rotation.y;
                while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
                while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
                mesh.rotation.y += angleDiff * deltaTime * 15; // Adjust speed (15) as needed
            }
             // If no target (e.g., just joined), snap to position? Handled by lerp from initial state.
        }
    }
}

// --- Animation Loop (The Heartbeat of the Game) ---
function animate() {
    // Request the next frame from the browser
    requestAnimationFrame(animate);

    // Calculate time elapsed since the last frame (delta time)
    const deltaTime = clock.getDelta(); // Gets time in seconds

    // 1. Process Local Player Input & Send Updates
    handleInput(deltaTime);

    // 2. Update Bullet Positions & Check Collisions
    updateBullets(deltaTime);

    // 3. Smoothly Update Other Players' Positions/Rotations
    updateOtherPlayers(deltaTime);

    // 4. Render the Scene
    // Make sure renderer and camera exist before trying to render
    if (renderer && scene && camera) {
        renderer.render(scene, camera);
    }
}

// --- Utility Functions ---
function onWindowResize() {
    // Update camera aspect ratio and projection matrix on window resize
    if (camera) {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
    }
    // Update renderer size
    if (renderer) {
        renderer.setSize(window.innerWidth, window.innerHeight);
    }
}

// --- Start the game initialization process ---
init();
