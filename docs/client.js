// docs/client.js
import * as THREE from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.module.js';
import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/jsm/loaders/GLTFLoader.js';
import RAPIER from 'https://cdn.jsdelivr.net/npm/@dimforge/rapier3d-compat@0.11.2/rapier.es.js';

// --- Configuration ---
const SERVER_URL = 'https://gametest-psxl.onrender.com'; // Your Render server URL
const PLAYER_HEIGHT = 1.8;
const PLAYER_RADIUS = 0.4;
const PLAYER_MOVE_SPEED = 6.0;
const PLAYER_DASH_SPEED = 15.0;
const PLAYER_DASH_DURATION = 0.15; // seconds
const PLAYER_JUMP_VELOCITY = 8.0;
const ROCKET_JUMP_FORCE = 15.0;
const GRAVITY = -19.62; // Heavier gravity
const SHOOT_COOLDOWN = 150; // milliseconds
const BULLET_DAMAGE = 25;
const VOID_Y_LIMIT = -50; // Y-coordinate below which player dies
const DEATH_EXPLOSION_FORCE = 30.0;
const DEATH_EXPLOSION_RADIUS = 15.0;

// --- Global Variables ---
let scene, camera, renderer, clock, listener, gunSoundBuffer;
let physicsWorld, eventQueue;
let localPlayer = null; // Stores local player data (mesh, body, controls)
let otherPlayers = {}; // Stores remote player data { id: { mesh, body, targetPosition, targetRotation } }
let mapMesh, mapBody;
let gunMesh; // Player's gun model
let socket;
let input = { forward: 0, backward: 0, left: 0, right: 0, jump: false, dash: false, shoot: false, rocketJump: false };
let lastShootTime = 0;
let isPointerLocked = false;
let dashTimeout = null;
let isDashing = false;
const loader = new GLTFLoader();
const infoElement = document.getElementById('info');
const canvas = document.getElementById('gameCanvas');

// --- Initialization ---
async function init() {
    // Basic Three.js setup
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, PLAYER_HEIGHT, 0); // Initial camera position relative to player later

    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;

    clock = new THREE.Clock();

    // Audio Listener
    listener = new THREE.AudioListener();
    camera.add(listener); // Attach listener to camera

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(10, 20, 5);
    directionalLight.castShadow = true;
    scene.add(directionalLight);

    // Physics (Needs to load WASM)
    await RAPIER.init();
    physicsWorld = new RAPIER.World({ x: 0.0, y: GRAVITY, z: 0.0 });
    eventQueue = new RAPIER.EventQueue(true); // For collision events

    // Load Assets
    infoElement.textContent = 'Loading assets...';
    await loadAssets();
    infoElement.textContent = 'Assets loaded. Connecting...';


    // Setup Input Listeners
    setupInput();
    setupPointerLock();

    // Connect to Server
    connectToServer();

    // Start the game loop
    animate();
}

// --- Asset Loading ---
async function loadAssets() {
    const loadingManager = new THREE.LoadingManager();
    const gltfLoader = new GLTFLoader(loadingManager);
    const audioLoader = new THREE.AudioLoader(loadingManager);

    const loadPromises = [];

    // Load Map
    loadPromises.push(new Promise((resolve, reject) => {
        gltfLoader.load('assets/maps/map.glb', (gltf) => {
            mapMesh = gltf.scene;
            mapMesh.traverse(child => { // Enable shadows for map objects
                if (child.isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                }
            });
            scene.add(mapMesh);

            // Create map physics body (Trimesh for complex geometry)
            const vertices = [];
            const indices = [];
            mapMesh.traverse(child => {
                if (child.isMesh) {
                    const geometry = child.geometry;
                    const position = geometry.attributes.position.array;
                    const index = geometry.index ? geometry.index.array : null;
                    const vertexOffset = vertices.length / 3;

                    for (let i = 0; i < position.length; i += 3) {
                        const worldPos = new THREE.Vector3(position[i], position[i+1], position[i+2]);
                        child.localToWorld(worldPos); // Convert vertex to world space
                        vertices.push(worldPos.x, worldPos.y, worldPos.z);
                    }

                    if (index) {
                        for (let i = 0; i < index.length; i++) {
                            indices.push(index[i] + vertexOffset);
                        }
                    } else {
                        // Handle non-indexed geometry (create indices)
                        for (let i = 0; i < position.length / 3; i += 3) {
                            indices.push(vertexOffset + i, vertexOffset + i + 1, vertexOffset + i + 2);
                        }
                    }
                }
            });

            if (vertices.length > 0 && indices.length > 0) {
                let colliderDesc = RAPIER.ColliderDesc.trimesh(new Float32Array(vertices), new Uint32Array(indices));
                 colliderDesc.setFriction(0.9); // Adjust friction
                 colliderDesc.setRestitution(0.1); // Adjust bounciness
                mapBody = physicsWorld.createCollider(colliderDesc);
                console.log("Map physics body created.");
            } else {
                 console.error("Map geometry could not be processed for physics.");
                 // Maybe add a simple ground plane as fallback?
                 let groundColliderDesc = RAPIER.ColliderDesc.cuboid(100.0, 0.1, 100.0).setTranslation(0, -0.1, 0);
                 mapBody = physicsWorld.createCollider(groundColliderDesc);
                 console.warn("Using fallback ground plane for physics.");
            }

            resolve();
        }, undefined, reject);
    }));

    // Pre-load Player and Gun models (don't add to scene yet)
    loadPromises.push(new Promise((resolve, reject) => {
         gltfLoader.load('assets/maps/Shawty1.glb', resolve, undefined, reject);
    }));
    loadPromises.push(new Promise((resolve, reject) => {
         gltfLoader.load('assets/maps/gun2.glb', resolve, undefined, reject);
    }));

    // Load Gun Sound
    loadPromises.push(new Promise((resolve, reject) => {
        audioLoader.load('assets/maps/gunshot.wav', (buffer) => {
            gunSoundBuffer = buffer;
            resolve();
        }, undefined, reject);
    }));

    await Promise.all(loadPromises);
    console.log("All assets loaded.");
}


// --- Player Creation ---
function createPlayer(id, initialState, isLocal) {
    const player = {};
    player.id = id;
    player.isLocal = isLocal;
    player.health = initialState.health || 100; // Use initial health from server

    // Physics Body (Capsule Shape)
    let rbDesc = RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(initialState.position.x, initialState.position.y, initialState.position.z)
        .setLinearDamping(0.5) // Air resistance
        .setAngularDamping(1.0) // Prevent spinning
        .lockRotations(); // Prevent capsule falling over
        // .setCcdEnabled(true); // Enable CCD for fast movement

    player.rigidBody = physicsWorld.createRigidBody(rbDesc);

    let colliderDesc = RAPIER.ColliderDesc.capsuleY(PLAYER_HEIGHT / 2 - PLAYER_RADIUS, PLAYER_RADIUS)
        .setDensity(1.0) // Affects mass -> influences forces
        .setFriction(0.7)
        .setRestitution(0.0); // No bouncing
    player.collider = physicsWorld.createCollider(colliderDesc, player.rigidBody);

    // 3D Model (Placeholder or loaded model)
    // For simplicity, use a Box for now. Replace with loaded GLB later.
    loader.load('assets/maps/Shawty1.glb', (gltf) => {
         player.mesh = gltf.scene;
         player.mesh.scale.set(0.5, 0.5, 0.5); // Adjust scale as needed
         player.mesh.traverse(child => { if (child.isMesh) child.castShadow = true; });
         player.mesh.userData.playerId = id; // Link mesh to player ID for raycasting
         scene.add(player.mesh);
         console.log(`Loaded character model for ${id}`);

         if (isLocal) {
            // Attach gun model to local player's camera AFTER character model loads
            loader.load('assets/maps/gun2.glb', (gunGltf) => {
                gunMesh = gunGltf.scene;
                gunMesh.scale.set(0.1, 0.1, 0.1); // Adjust scale
                gunMesh.position.set(0.2, -0.2, -0.5); // Position relative to camera
                gunMesh.rotation.set(0, Math.PI, 0); // Adjust rotation
                gunMesh.traverse(child => { if (child.isMesh) child.castShadow = true; });
                camera.add(gunMesh); // Attach gun to camera
                console.log("Loaded and attached gun model.");
            });
         }
    });


    if (isLocal) {
        localPlayer = player;
        localPlayer.controls = { // Add controls structure for local player
             velocity: new THREE.Vector3(),
             canJump: false,
             isGrounded: false,
             dashCooldown: 0,
             rocketJumpActive: false,
         };
        // Move camera to player start position
        camera.position.copy(initialState.position);
        camera.position.y += PLAYER_HEIGHT * 0.8; // Adjust camera height offset

        // Set initial rotation from server if available
         if (initialState.rotation) {
             camera.rotation.set(initialState.rotation.x, initialState.rotation.y, initialState.rotation.z);
         }

    } else {
        otherPlayers[id] = player;
        player.targetPosition = new THREE.Vector3().copy(initialState.position);
        player.targetRotation = new THREE.Quaternion(); // Use Quaternions for smooth rotation lerp
        // Set initial rotation
        if(initialState.rotation) {
            player.targetRotation.setFromEuler(new THREE.Euler(initialState.rotation.x, initialState.rotation.y, initialState.rotation.z));
        }
    }

    return player;
}

// --- Networking ---
function connectToServer() {
    socket = io(SERVER_URL);

    socket.on('connect', () => {
        infoElement.textContent = `Connected as ${socket.id}`;
        console.log('Connected to server!');
    });

    socket.on('disconnect', () => {
        infoElement.textContent = 'Disconnected!';
        // Handle disconnection (e.g., show message, remove players)
        for (const id in otherPlayers) {
            removePlayer(id);
        }
        if(localPlayer?.mesh) scene.remove(localPlayer.mesh);
        if(localPlayer?.rigidBody) physicsWorld.removeRigidBody(localPlayer.rigidBody);
        localPlayer = null;

    });

    // Initialize local player and receive data about others
    socket.on('initialize', ({ id, initialState, allPlayers }) => {
        console.log("Received initialization data:", id, initialState, allPlayers);
        createPlayer(id, initialState, true);

        // Create representations for other players already in the game
        for (const playerId in allPlayers) {
            if (playerId !== id) {
                 if (!otherPlayers[playerId]) { // Avoid duplicates
                    createPlayer(playerId, allPlayers[playerId], false);
                 }
            }
        }
    });

    // Handle new players joining
    socket.on('playerJoined', (playerData) => {
        console.log('Player joined:', playerData.id);
        if (playerData.id !== localPlayer?.id && !otherPlayers[playerData.id]) {
            createPlayer(playerData.id, playerData, false);
        }
    });

    // Handle players leaving
    socket.on('playerLeft', ({id, position}) => {
        console.log('Player left:', id);
        if (otherPlayers[id]) {
             // Optional: Trigger an effect at the leave 'position'
            removePlayer(id);
        }
    });

    // Update remote player positions and rotations
    socket.on('playerMoved', (data) => {
        const player = otherPlayers[data.id];
        if (player) {
            player.targetPosition.copy(data.position);
             // Use Quaternion for smoother rotation interpolation
             if (data.rotation) {
                const euler = new THREE.Euler(data.rotation.x, data.rotation.y, data.rotation.z, 'YXZ'); // Use 'YXZ' order common for FPS
                player.targetRotation.setFromEuler(euler);
            }
        }
    });

    // Handle shooting effects from others
    socket.on('playerShot', ({ shooterId, origin, direction }) => {
        if (shooterId !== localPlayer?.id) {
            // Play gunshot sound from the shooter's position
             const shooter = otherPlayers[shooterId];
             if (shooter?.mesh) {
                playSound(gunSoundBuffer, shooter.mesh, false); // Play positional audio
             }
            // Optional: Create a tracer visual effect
            // createTracer(origin, direction);
        }
    });

     // Handle actions from others (e.g., play dash/jump sound/animation)
    socket.on('playerAction', ({ id, type }) => {
         if (id !== localPlayer?.id) {
            const player = otherPlayers[id];
            if (player) {
                 console.log(`Player ${id} performed ${type}`);
                 // Trigger visual/audio cues for the action (e.g., dash particles, jump sound)
                 // playSound(..., player.mesh, false);
             }
        }
    });


    // Handle player death notification
    socket.on('playerDied', ({ victimId, killerId, position }) => {
        console.log(`Player ${victimId} killed by ${killerId}`);
        const victim = (victimId === localPlayer?.id) ? localPlayer : otherPlayers[victimId];

        if (victim) {
            // --- Death Explosion & Shockwave ---
            createExplosionEffect(position); // Visual effect
            applyShockwave(position, victimId); // Physics effect

            if (victim.isLocal) {
                console.log("You died!");
                handleLocalPlayerDeath();
                 infoElement.textContent = `Killed by ${killerId}. Respawning...`;
            } else {
                // Handle remote player death (e.g., fade out model, remove after delay)
                if (victim.mesh) victim.mesh.visible = false;
                 // Don't remove physics body immediately if shockwave needs it
                 setTimeout(() => removePlayer(victimId), 500); // Remove after short delay
                 infoElement.textContent = `Player ${victimId} was killed by ${killerId || 'the void'}`;

            }
        }
    });

    // Handle player respawn notification
    socket.on('playerRespawned', ({ id, position }) => {
        console.log(`Player ${id} respawned at`, position);
        const player = (id === localPlayer?.id) ? localPlayer : otherPlayers[id];

        if (player) {
            // Reset physics state and position
             player.rigidBody.setTranslation({ x: position.x, y: position.y, z: position.z }, true);
             player.rigidBody.setLinvel({ x: 0, y: 0, z: 0 }, true); // Reset velocity
             player.rigidBody.setAngvel({ x: 0, y: 0, z: 0 }, true); // Reset angular velocity

            if (player.isLocal) {
                player.health = 100;
                player.controls.rocketJumpActive = false;
                // Reset camera position as well
                camera.position.set(position.x, position.y + PLAYER_HEIGHT * 0.8, position.z);
                 // Potentially reset camera rotation too, or keep last look direction
                 infoElement.textContent = `Respawned!`;
            } else {
                // Make remote player visible again and reset target positions
                if (player.mesh) player.mesh.visible = true;
                player.targetPosition.copy(position);
                // If player didn't exist (e.g. late join during respawn), create them
                if (!otherPlayers[id]) {
                    // Need initial state here, request from server? Or use basic state
                     createPlayer(id, { id: id, position: position, rotation: {x:0,y:0,z:0}, health: 100 }, false);
                }
            }
        } else if (id === localPlayer?.id) {
            // Rare case: local player object doesn't exist but server sends respawn
             console.warn("Received respawn event for non-existent local player. Requesting re-init?");
             // socket.emit('requestReInitialization'); // Or similar logic
        } else if (!otherPlayers[id]){
             // Player respawned but wasn't known before (e.g., joined, died, then respawned before client got 'join')
              console.log(`Respawn for unknown player ${id}. Creating basic representation.`);
              createPlayer(id, { id: id, position: position, rotation: {x:0,y:0,z:0}, health: 100 }, false);
        }

    });

}

// --- Player Removal ---
function removePlayer(id) {
    const player = otherPlayers[id];
    if (player) {
        if (player.mesh) scene.remove(player.mesh);
        if (player.rigidBody) physicsWorld.removeRigidBody(player.rigidBody);
        // Make sure collider is removed too if managed separately
        // if (player.collider) physicsWorld.removeCollider(player.collider, true);
        delete otherPlayers[id];
    }
}

// --- Input Handling ---
function setupInput() {
    window.addEventListener('keydown', (event) => {
        switch (event.code) {
            case 'KeyW': input.forward = 1; break;
            case 'KeyS': input.backward = 1; break;
            case 'KeyA': input.left = 1; break;
            case 'KeyD': input.right = 1; break;
            case 'Space': input.jump = true; break;
            case 'ShiftLeft':
                if (!isDashing && localPlayer?.controls.dashCooldown <= 0) {
                    input.dash = true;
                }
                break;
            case 'KeyC': input.rocketJump = true; break; // Hold C for rocket jump check
        }
    });

    window.addEventListener('keyup', (event) => {
        switch (event.code) {
            case 'KeyW': input.forward = 0; break;
            case 'KeyS': input.backward = 0; break;
            case 'KeyA': input.left = 0; break;
            case 'KeyD': input.right = 0; break;
            case 'Space': input.jump = false; break;
            case 'ShiftLeft': input.dash = false; break; // Release doesn't trigger dash
            case 'KeyC': input.rocketJump = false; break;
        }
    });

    canvas.addEventListener('mousedown', (event) => {
        if (isPointerLocked && event.button === 0) { // Left mouse button
            input.shoot = true;
        }
    });

     // No mouseup needed for input.shoot as it's handled by cooldown/single fire logic
}

function setupPointerLock() {
    canvas.addEventListener('click', () => {
        if (!isPointerLocked) {
            canvas.requestPointerLock = canvas.requestPointerLock || canvas.mozRequestPointerLock || canvas.webkitRequestPointerLock;
            canvas.requestPointerLock();
        }
    });

    document.addEventListener('pointerlockchange', lockChangeAlert, false);
    document.addEventListener('mozpointerlockchange', lockChangeAlert, false);
    document.addEventListener('webkitpointerlockchange', lockChangeAlert, false);

    function lockChangeAlert() {
        if (document.pointerLockElement === canvas ||
            document.mozPointerLockElement === canvas ||
            document.webkitPointerLockElement === canvas) {
            console.log('Pointer Lock active');
            isPointerLocked = true;
            document.addEventListener("mousemove", updateCameraRotation, false);
        } else {
            console.log('Pointer Lock deactivated');
            isPointerLocked = false;
            document.removeEventListener("mousemove", updateCameraRotation, false);
        }
    }
}

function updateCameraRotation(event) {
    if (!isPointerLocked || !localPlayer) return;

    const movementX = event.movementX || event.mozMovementX || event.webkitMovementX || 0;
    const movementY = event.movementY || event.mozMovementY || event.webkitMovementY || 0;

    const euler = new THREE.Euler(0, 0, 0, 'YXZ'); // Use YXZ order for FPS camera
    euler.setFromQuaternion(camera.quaternion);

    euler.y -= movementX * 0.002;
    euler.x -= movementY * 0.002;

    // Clamp vertical rotation to prevent camera flipping
    euler.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, euler.x));

    camera.quaternion.setFromEuler(euler);
}


// --- Player Movement Logic ---
function updatePlayerMovement(delta) {
    if (!localPlayer || !localPlayer.rigidBody || localPlayer.health <= 0) return;

    const body = localPlayer.rigidBody;
    const controls = localPlayer.controls;

    // Calculate movement direction based on camera look direction
    const moveDirection = new THREE.Vector3();
    const cameraDirection = new THREE.Vector3();
    camera.getWorldDirection(cameraDirection);
    cameraDirection.y = 0; // Project onto XZ plane
    cameraDirection.normalize();

    const rightDirection = new THREE.Vector3();
    rightDirection.crossVectors(camera.up, cameraDirection).normalize(); // Get right vector

    if (input.forward) moveDirection.add(cameraDirection);
    if (input.backward) moveDirection.sub(cameraDirection);
    if (input.left) moveDirection.sub(rightDirection); // A moves left
    if (input.right) moveDirection.add(rightDirection); // D moves right

    moveDirection.normalize(); // Ensure consistent speed regardless of direction keys pressed

    // Apply movement forces/velocity
    const currentVelocity = body.linvel();
    const desiredVelocity = new THREE.Vector3(
        moveDirection.x * PLAYER_MOVE_SPEED,
        currentVelocity.y, // Preserve vertical velocity (gravity, jump)
        moveDirection.z * PLAYER_MOVE_SPEED
    );

     // Use impulse for snappier movement control, or set velocity directly
     // Impulse approach: Calculate needed change and apply impulse
     const velocityChange = new THREE.Vector3(
         desiredVelocity.x - currentVelocity.x,
         0, // Don't apply impulse vertically for regular movement
         desiredVelocity.z - currentVelocity.z
     );
     // Scale impulse by mass if needed, Rapier's applyImpulse often works well directly
     body.applyImpulse({ x: velocityChange.x, y: velocityChange.y, z: velocityChange.z }, true);


    // --- Ground Check ---
    // Cast a ray downwards to see if the player is on the ground
    const rayOrigin = body.translation();
    rayOrigin.y -= (PLAYER_HEIGHT / 2 - PLAYER_RADIUS) + 0.1; // Start slightly below capsule bottom center
    const rayDirection = { x: 0, y: -1, z: 0 };
    const maxDistance = 0.2; // How far down to check
    const ray = new RAPIER.Ray(rayOrigin, rayDirection);
    const hit = physicsWorld.castRay(ray, maxDistance, true, undefined, undefined, localPlayer.collider); // Exclude player's own collider

    controls.isGrounded = hit !== null;

    // --- Jumping ---
    if (input.jump && controls.isGrounded && !controls.jumpActive) {
         body.applyImpulse({ x: 0, y: PLAYER_JUMP_VELOCITY, z: 0 }, true); // Apply upward impulse for jump
         controls.jumpActive = true; // Prevent holding space for continuous jump impulse
         socket.emit('action', { type: 'jump' });
    }
    // Reset jump flag when jump key released or player leaves ground
    if (!input.jump || !controls.isGrounded) {
        controls.jumpActive = false;
    }

    // --- Dashing ---
     controls.dashCooldown = Math.max(0, controls.dashCooldown - delta);

     if (input.dash && !isDashing && controls.dashCooldown <= 0) {
         isDashing = true;
         controls.dashCooldown = 1.0; // 1 second cooldown after dash ends

         // Determine dash direction (movement keys or camera forward if no movement)
         let dashDirection = moveDirection.lengthSq() > 0 ? moveDirection.clone() : cameraDirection.clone();
         dashDirection.y = 0; // Keep dash horizontal for now
         dashDirection.normalize();

         // Apply strong impulse for dash
         const dashImpulse = dashDirection.multiplyScalar(PLAYER_DASH_SPEED);
         body.applyImpulse({ x: dashImpulse.x, y: 0, z: dashImpulse.z }, true); // Horizontal dash impulse

         // Reset dash input flag
         input.dash = false;
          socket.emit('action', { type: 'dash' });


         // End dash after duration (remove extra velocity or let damping handle it)
         clearTimeout(dashTimeout); // Clear previous timeout if any
         dashTimeout = setTimeout(() => {
             isDashing = false;
             // Optional: Could apply a counter-impulse or simply let damping take over
         }, PLAYER_DASH_DURATION * 1000);
     }


    // --- Shooting & Rocket Jump ---
    const now = performance.now();
    if (input.shoot && now > lastShootTime + SHOOT_COOLDOWN) {
        lastShootTime = now;
        performShoot();
         input.shoot = false; // Handle single shot per click/hold interval
    }


    // --- Void Death Check ---
    const playerPos = body.translation();
    if (playerPos.y < VOID_Y_LIMIT) {
        console.log("Player fell into the void.");
        // Instantly kill the player - server will handle respawn
        localPlayer.health = 0; // Set health to 0 locally
        // No need to emit 'playerHit' for self-inflicted void death, server should handle this
         // Let server know player died (e.g., specific event or rely on server-side check)
         // For simplicity here, we assume the 'playerDied' event triggered by 'playerHit' covers this
         // OR add a dedicated 'fellInVoid' emit:
         socket.emit('fellInVoid'); // Server needs to handle this event to trigger death/respawn
         handleLocalPlayerDeath(); // Trigger local death effects immediately

    }
}

// --- Shooting Logic ---
function performShoot() {
    if (!localPlayer || localPlayer.health <= 0) return;

    // Play sound locally immediately
    playSound(gunSoundBuffer, camera, true); // Attach to camera for non-positional

    // Raycast from camera center
    const raycaster = new THREE.Raycaster();
    const origin = new THREE.Vector3();
    const direction = new THREE.Vector3();

    camera.getWorldPosition(origin);
    camera.getWorldDirection(direction);

    raycaster.set(origin, direction);
    raycaster.far = 300; // Max bullet range

    // Check intersections with other players' meshes
    const otherPlayerMeshes = Object.values(otherPlayers).map(p => p.mesh).filter(m => m); // Get only existing meshes
    const intersects = raycaster.intersectObjects(otherPlayerMeshes, true); // Check descendants

    let hitTargetId = null;
    if (intersects.length > 0) {
        // Find the closest hit player that isn't self (shouldn't be possible anyway)
        let closestHit = null;
        for(const hit of intersects) {
            // Traverse up to find the parent mesh with the player ID
            let parentMesh = hit.object;
            while(parentMesh && !parentMesh.userData.playerId) {
                parentMesh = parentMesh.parent;
            }

            if(parentMesh && parentMesh.userData.playerId !== localPlayer.id) {
                 if(!closestHit || hit.distance < closestHit.distance) {
                    closestHit = hit;
                    hitTargetId = parentMesh.userData.playerId;
                 }
            }
        }

        if (hitTargetId) {
            console.log(`Hit player ${hitTargetId}`);
            // Tell the server we hit someone
            socket.emit('playerHit', { targetId: hitTargetId, damage: BULLET_DAMAGE });
        }
    }

    // Tell the server we fired a shot (for others' effects) regardless of hit
    socket.emit('shoot', { origin: origin.toArray(), direction: direction.toArray() }); // Send as arrays


    // --- Rocket Jump Logic ---
    // Check if 'C' is held AND shooting downwards
    if (input.rocketJump) {
         const downThreshold = -0.8; // How much 'down' counts (dot product with -Y axis)
         const worldDown = new THREE.Vector3(0, -1, 0);
         if (direction.dot(worldDown) > (1 + downThreshold)) { // Dot product > ~0.2 means pointing somewhat down
             console.log("Rocket Jump Triggered!");
             // Apply upward impulse
             localPlayer.rigidBody.applyImpulse({ x: 0, y: ROCKET_JUMP_FORCE, z: 0 }, true);
             // Notify server (optional, for effects)
             socket.emit('action', { type: 'rocketJump' });
             input.rocketJump = false; // Consume the input
         }
     }
}


// --- Death Handling ---
function handleLocalPlayerDeath() {
    if (!localPlayer) return;
    console.log("Handling local player death...");
    localPlayer.health = 0; // Ensure health is 0

    // Disable controls, maybe show death screen effect
     isPointerLocked = false; // Release pointer lock maybe? Or just disable input processing

    // Server will handle respawn via 'playerRespawned' event
}

// --- Effects ---
function createExplosionEffect(position) {
    // Simple particle effect placeholder
    const geometry = new THREE.SphereGeometry(0.5, 8, 8);
    const material = new THREE.MeshBasicMaterial({ color: 0xffaa00, transparent: true, opacity: 0.8 });
    const count = 20;
    for (let i = 0; i < count; i++) {
        const particle = new THREE.Mesh(geometry, material.clone());
        particle.position.copy(position);
        const velocity = new THREE.Vector3(
            (Math.random() - 0.5) * 15,
            (Math.random() - 0.5) * 15,
            (Math.random() - 0.5) * 15
        );
        scene.add(particle);
        // Animate particle outwards and fade out
        let life = 1.0; // 1 second life
        function animateParticle() {
            if (life <= 0) {
                scene.remove(particle);
                return;
            }
            life -= 0.02; // Corresponds roughly to 50fps -> 1 sec
            particle.position.addScaledVector(velocity, 0.02);
            particle.material.opacity = life;
            requestAnimationFrame(animateParticle);
        }
        animateParticle();
    }
     // Play explosion sound?
     // playSound(explosionSoundBuffer, position); // Need to load sound
}

function applyShockwave(originPosition, deadPlayerId) {
    const origin = new THREE.Vector3(originPosition.x, originPosition.y, originPosition.z);

    // Apply force to local player if nearby
    if (localPlayer && localPlayer.health > 0 && localPlayer.id !== deadPlayerId) {
        const playerBody = localPlayer.rigidBody;
        const playerPos = playerBody.translation();
        const direction = new THREE.Vector3().subVectors(playerPos, origin);
        const distance = direction.length();

        if (distance < DEATH_EXPLOSION_RADIUS && distance > 0.1) { // Avoid division by zero
            const forceMagnitude = DEATH_EXPLOSION_FORCE * (1 - distance / DEATH_EXPLOSION_RADIUS); // Force decreases with distance
            direction.normalize();
             // Apply impulse for immediate effect
             playerBody.applyImpulse({ x: direction.x * forceMagnitude, y: direction.y * forceMagnitude + forceMagnitude*0.3, z: direction.z * forceMagnitude }, true); // Add some upward boost
             console.log(`Applying shockwave to local player from ${deadPlayerId}`);

        }
    }

    // Apply force to other players if nearby
    for (const id in otherPlayers) {
        if (id === deadPlayerId) continue; // Don't apply to the dead player

        const player = otherPlayers[id];
        if (player && player.rigidBody) {
            const playerBody = player.rigidBody;
            const playerPos = playerBody.translation(); // Rapier physics position
            const direction = new THREE.Vector3().subVectors(playerPos, origin);
            const distance = direction.length();

             if (distance < DEATH_EXPLOSION_RADIUS && distance > 0.1) {
                 const forceMagnitude = DEATH_EXPLOSION_FORCE * (1 - distance / DEATH_EXPLOSION_RADIUS);
                 direction.normalize();
                  // Apply impulse - NOTE: Applying forces to remote players can cause desync if not server-authoritative.
                  // This is a client-side visual/physics effect. Server doesn't know about this impulse.
                  playerBody.applyImpulse({ x: direction.x * forceMagnitude, y: direction.y * forceMagnitude + forceMagnitude*0.3, z: direction.z * forceMagnitude }, true);
                 console.log(`Applying shockwave to ${id} from ${deadPlayerId}`);

             }
        }
    }
}


// --- Sound Utility ---
function playSound(buffer, sourceObject, loop = false) {
    if (!buffer || !listener) return;

    let sound;
    if (sourceObject instanceof THREE.Object3D && sourceObject !== camera) {
        // Positional Audio
        sound = new THREE.PositionalAudio(listener);
        sourceObject.add(sound); // Attach sound to the source object (e.g., other player's mesh)
        sound.setRefDistance(5); // Adjust reference distance for falloff
        sound.setRolloffFactor(1);
    } else {
        // Non-positional Audio (e.g., local player shooting sound)
        sound = new THREE.Audio(listener);
    }

    sound.setBuffer(buffer);
    sound.setLoop(loop);
    sound.setVolume(0.5); // Adjust volume
    sound.play();

    // Clean up non-looping sounds automatically
    if (!loop && !(sound instanceof THREE.PositionalAudio)) {
        // For non-positional, THREE.Audio handles cleanup ok
    } else if (!loop && sound instanceof THREE.PositionalAudio) {
        // For positional, remove from parent when finished
         sound.addEventListener('ended', () => {
             sourceObject.remove(sound);
         });
    }
}

// --- Game Loop ---
let lastUpdateTime = performance.now();
const PHYSICS_TIMESTEP = 1 / 60; // Run physics at 60Hz
let physicsAccumulator = 0;

function animate() {
    requestAnimationFrame(animate);

    const delta = clock.getDelta();
    const now = performance.now();

    // --- Physics Update (Fixed Timestep) ---
    physicsAccumulator += delta;
    while (physicsAccumulator >= PHYSICS_TIMESTEP) {
         // Step physics world
         if (physicsWorld) {
            physicsWorld.step(eventQueue); // Step the simulation
            // Handle collision events from eventQueue if needed
             eventQueue.drainCollisionEvents((handle1, handle2, started) => {
                 /* Handle collisions if necessary (e.g., impact sounds) */
             });
         }

        // Update local player physics based on input
        if(localPlayer && localPlayer.health > 0) {
             updatePlayerMovement(PHYSICS_TIMESTEP); // Use fixed timestep for physics updates
        }

        physicsAccumulator -= PHYSICS_TIMESTEP;
    }


    // --- Update Graphics ---
    // Update local player mesh position and camera
    if (localPlayer?.rigidBody && localPlayer.mesh) {
        const bodyPosition = localPlayer.rigidBody.translation();
        localPlayer.mesh.position.set(bodyPosition.x, bodyPosition.y - PLAYER_HEIGHT / 2, bodyPosition.z); // Adjust mesh position based on capsule center

        // Update camera smoothly - Lerp towards target position slightly above body center
        const targetCameraPos = new THREE.Vector3(bodyPosition.x, bodyPosition.y + PLAYER_HEIGHT * 0.4, bodyPosition.z); // Adjust Y offset for eye level
        camera.position.lerp(targetCameraPos, 0.9); // Adjust lerp factor for smoothness

        // Player mesh rotation should follow camera's horizontal rotation
        const cameraEuler = new THREE.Euler(0,0,0, 'YXZ');
        cameraEuler.setFromQuaternion(camera.quaternion);
        localPlayer.mesh.rotation.y = cameraEuler.y; // Only rotate around Y axis
    }

    // Update other players (interpolate graphics towards target state)
    for (const id in otherPlayers) {
        const player = otherPlayers[id];
        if (player.mesh && player.rigidBody) {
            // Lerp mesh position towards targetPosition received from network
            const currentMeshPos = player.mesh.position;
            currentMeshPos.lerp(player.targetPosition, 0.2); // Adjust lerp factor for smoothness

             // Adjust mesh position based on capsule height if needed (similar to local player)
             player.mesh.position.y = player.targetPosition.y - PLAYER_HEIGHT / 2;


            // Slerp (spherical lerp) mesh rotation towards targetRotation
            const currentMeshQuat = player.mesh.quaternion;
             currentMeshQuat.slerp(player.targetRotation, 0.2);


             // OPTIONAL: Update the *physics* body position slightly for better collision accuracy
             // This can cause jitter if network updates are infrequent or lerping is too slow.
             // Be careful with directly setting remote player physics states.
             // player.rigidBody.setTranslation(player.targetPosition, true);
             // Or lerp physics body as well?
             // const currentBodyPos = player.rigidBody.translation();
             // const lerpedBodyPos = new THREE.Vector3(currentBodyPos.x, currentBodyPos.y, currentBodyPos.z).lerp(player.targetPosition, 0.5);
             // player.rigidBody.setTranslation(lerpedBodyPos, true);


        }
    }

    // --- Networking Update ---
    // Send local player state to server (throttled)
    if (localPlayer && socket?.connected && now > lastUpdateTime + 50) { // Send updates roughly 20 times/sec
        const bodyPosition = localPlayer.rigidBody.translation();
        const cameraEuler = new THREE.Euler(0,0,0, 'YXZ');
        cameraEuler.setFromQuaternion(camera.quaternion);

        socket.emit('playerUpdate', {
            position: { x: bodyPosition.x, y: bodyPosition.y, z: bodyPosition.z },
            rotation: { x: cameraEuler.x, y: cameraEuler.y, z: cameraEuler.z } // Send camera rotation
        });
        lastUpdateTime = now;
    }

    // --- Render ---
    renderer.render(scene, camera);
}

// --- Window Resize ---
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- Start ---
init().catch(err => {
    console.error("Initialization failed:", err);
    infoElement.textContent = `Error: ${err.message}. Check console.`;
});
