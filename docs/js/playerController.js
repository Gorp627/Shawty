// docs/js/playerController.js
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.module.js'; // Using jsdelivr URL
import { PointerLockControls } from './PointerLockControls.js';
import { sendPlayerUpdate, sendShootEvent, sendPlayerDiedEvent } from './network.js';
import { getEnvironmentMeshes, getCamera, PLAYER_HEIGHT, FALL_DEATH_Y } from './scene.js';
import { showDeathScreen, hideDeathScreen, updateHealth } from './ui.js';

let controls = null;
let camera = null;
let isPointerLocked = false;
let localPlayerId = null;
let localPlayerState = {
    position: new THREE.Vector3(0, PLAYER_HEIGHT + 80, 0), // Start high, rely on server spawn + gravity
    velocity: new THREE.Vector3(),
    rotation: new THREE.Euler(0, 0, 0, 'YXZ'), // Use 'YXZ' order for FPS camera logic
    onGround: false,
    isDead: false,
    health: 100,
    lastUpdateTime: 0,
    canDash: true,
    canShoot: true,
    isPropulsionShot: false, // Flag for holding E while shooting
    canJump: true
};

const moveState = {
    forward: 0, // -1 (Backward), 0 (Still), 1 (Forward)
    right: 0,   // -1 (Left), 0 (Still), 1 (Right)
    jumping: false, // Is jump key currently held?
    dashing: false // Is dash currently active?
};

// Raycasters need to be initialized after THREE is ready
let collisionRaycaster = null;
let groundCheckRaycaster = null;

// Constants for tuning
const MOVE_SPEED = 5.0;
const DASH_SPEED_MULTIPLIER = 3.0;
const DASH_DURATION = 0.15; // seconds
const DASH_COOLDOWN = 1.0; // seconds
const JUMP_VELOCITY = 6.0; // Initial upward velocity on jump
const PROPULSION_FORCE = 25.0; // Force applied for E + Shoot
const SHOOT_COOLDOWN = 0.2; // seconds between shots
const GRAVITY = -15.0; // Acceleration due to gravity (units per second squared)
const NETWORK_UPDATE_INTERVAL = 100; // Send updates every 100ms (10 Hz)
const COLLISION_STEP_MAX_ITERATIONS = 5; // Max iterations for collision resolution (advanced)

export function initPlayerController(cam, canvas, playerId) {
    // Validate inputs
    if (!cam || !canvas || !playerId) {
        console.error("initPlayerController called with invalid arguments:", cam, canvas, playerId);
        return;
    }
    console.log("Initializing PlayerController for ID:", playerId);
    camera = cam;
    localPlayerId = playerId;

    // Initialize Raycasters (ensure THREE namespace is available)
    collisionRaycaster = new THREE.Raycaster();
    groundCheckRaycaster = new THREE.Raycaster(
        new THREE.Vector3(),        // Origin (will be updated each frame)
        new THREE.Vector3(0, -1, 0), // Direction (down)
        0,                          // Near plane
        PLAYER_HEIGHT * 0.6 + 0.1   // Far plane (check distance slightly below player center)
    );

    // Instantiate PointerLockControls safely
    try {
        controls = new PointerLockControls(camera, canvas);
        console.log("PointerLockControls instantiated.");
    } catch (e) {
        console.error("!!! Failed to instantiate PointerLockControls:", e);
        alert("Error initializing camera controls. Check console (F12).");
        // Prevent further execution if controls fail
        controls = null; // Ensure controls is null if it failed
        return;
    }

    // --- Event Listeners ---
    // Request pointer lock on canvas click
    canvas.addEventListener('click', () => {
        if (!localPlayerState.isDead && controls && !isPointerLocked) {
             console.log("Canvas clicked, requesting pointer lock.");
             controls.lock();
        } else if (localPlayerState.isDead) {
            console.log("Canvas clicked, but player is dead. Cannot lock pointer.");
        } else if(isPointerLocked){
             // Already locked, do nothing or maybe show message
        }
    });

    // Listen for pointer lock state changes
    controls.addEventListener('lock', () => { isPointerLocked = true; console.log("Pointer Locked"); });
    controls.addEventListener('unlock', () => { isPointerLocked = false; console.log("Pointer Unlocked"); });

    // Keyboard input
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    // Mouse input (shooting)
    canvas.addEventListener('mousedown', onMouseDown);

    // Set initial HUD health
    updateHealth(localPlayerState.health);
    console.log("PlayerController initialization complete.");
}

// --- Input Handlers ---
function onKeyDown(event) {
    // Ignore input if pointer isn't locked or player is dead
    if (!isPointerLocked || localPlayerState.isDead) return;

    switch (event.code) {
        // Movement
        case 'KeyW': case 'ArrowUp': moveState.forward = 1; break;
        case 'KeyS': case 'ArrowDown': moveState.forward = -1; break;
        case 'KeyA': case 'ArrowLeft': moveState.right = -1; break;
        case 'KeyD': case 'ArrowRight': moveState.right = 1; break;

        // Jumping
        case 'Space':
            if (localPlayerState.canJump && localPlayerState.onGround && !moveState.jumping) {
                localPlayerState.velocity.y = JUMP_VELOCITY; // Apply upward velocity
                localPlayerState.onGround = false; // Assume airborne immediately
                moveState.jumping = true;          // Prevent continuous jump impulse from holding key
                localPlayerState.canJump = false;  // Prevent re-jump until key is released
                 console.log("Jump initiated.");
            }
            break;

        // Dashing
        case 'ShiftLeft':
            if (localPlayerState.canDash && !moveState.dashing) {
                moveState.dashing = true; // Activate dash state
                localPlayerState.canDash = false; // Put dash on cooldown
                // Set timers to end dash state and cooldown
                setTimeout(() => { moveState.dashing = false; console.log("Dash state finished."); }, DASH_DURATION * 1000);
                setTimeout(() => { localPlayerState.canDash = true; console.log("Dash cooldown finished."); }, DASH_COOLDOWN * 1000);
                console.log("Dash initiated.");
            }
            break;

        // Propulsion Shot Modifier
         case 'KeyE':
            localPlayerState.isPropulsionShot = true; // Set flag when E is held
            break;
    }
}
function onKeyUp(event) {
     // Key up events should always register to stop movement/actions
     switch (event.code) {
        // Movement
        case 'KeyW': case 'ArrowUp': if (moveState.forward > 0) moveState.forward = 0; break;
        case 'KeyS': case 'ArrowDown': if (moveState.forward < 0) moveState.forward = 0; break;
        case 'KeyA': case 'ArrowLeft': if (moveState.right < 0) moveState.right = 0; break;
        case 'KeyD': case 'ArrowRight': if (moveState.right > 0) moveState.right = 0; break;

        // Jumping
         case 'Space':
            moveState.jumping = false; // Reset jump key hold state
            localPlayerState.canJump = true; // Allow jumping again (if on ground)
            break;

        // Propulsion Shot Modifier
         case 'KeyE':
            localPlayerState.isPropulsionShot = false; // Clear flag when E is released
            break;
    }
}
function onMouseDown(event) {
    // Ignore clicks if pointer isn't locked, player is dead, or shoot is on cooldown
    if (!isPointerLocked || localPlayerState.isDead || !localPlayerState.canShoot) return;

    if (event.button === 0) { // Left mouse button for shooting
        // console.log("Shoot initiated."); // Log can be spammy
        localPlayerState.canShoot = false; // Start shoot cooldown
        setTimeout(() => localPlayerState.canShoot = true, SHOOT_COOLDOWN * 1000);

        // Ensure camera exists before getting direction
        if (!camera) {
            console.error("Camera object not available for shooting direction.");
            return;
        }
        const direction = new THREE.Vector3();
        camera.getWorldDirection(direction); // Get camera's forward direction

        // Send shoot event to server
        // Pass direction as a plain object for JSON serialization
        sendShootEvent({
            propulsion: localPlayerState.isPropulsionShot,
            direction: {x: direction.x, y: direction.y, z: direction.z}
        });

        // Apply propulsion immediately on client for responsiveness if E is held
        if (localPlayerState.isPropulsionShot) {
             applyPropulsion(direction);
        }
    }
}

// --- Movement & Physics Logic ---
function applyPropulsion(shootDirection) {
     // Calculate force opposite to shooting direction
     const propulsionVector = shootDirection.clone().negate().multiplyScalar(PROPULSION_FORCE);
     // Add some upward kick for better feel
     propulsionVector.y += PROPULSION_FORCE * 0.2;
     // Add force to player's velocity
     localPlayerState.velocity.add(propulsionVector);
     // Player is likely airborne after propulsion
     localPlayerState.onGround = false;
     console.log("Applied client-side propulsion force.");
}

export function handleServerPropulsion(data) {
    // This function is called when the server confirms a propulsion shot event.
    // Currently, we apply propulsion client-side immediately for responsiveness.
    // This server confirmation can be used for logging, correction logic (if prediction is off),
    // or if you *only* wanted the server to trigger the propulsion (less responsive).
    console.log("Received server confirmation/command for propulsion.");
    // Example: If NOT predicting client-side, apply force here:
    // if (data?.direction) {
    //     const direction = new THREE.Vector3(data.direction.x, data.direction.y, data.direction.z);
    //     applyPropulsion(direction);
    // }
}

export function applyKnockback(knockbackVector) {
    // Apply force received from the server (e.g., death explosion shockwave)
    if (localPlayerState.isDead) return; // Cannot knockback dead players
    if (!knockbackVector) { console.warn("applyKnockback called with invalid vector"); return; }

    const force = new THREE.Vector3(knockbackVector.x, knockbackVector.y, knockbackVector.z);
    localPlayerState.velocity.add(force); // Add knockback force to velocity
    localPlayerState.onGround = false; // Knockback likely sends player airborne
    console.log("Applied server knockback force:", force);
}

// Main update loop for the local player, called every frame by main.js
export function updatePlayer(deltaTime) {
    // Essential checks before proceeding
    if (!controls || !camera || !collisionRaycaster || !groundCheckRaycaster || !localPlayerId) {
        // Avoid errors if controller isn't fully initialized
        return;
    }

    const delta = Math.min(deltaTime, 0.05); // Clamp delta time to prevent physics issues on lag spikes
    const time = performance.now(); // For network update timing

    // --- Handle Dead State ---
    if (localPlayerState.isDead) {
         // Simple dead physics: Stop horizontal movement, apply slow gravity
         localPlayerState.velocity.x = 0;
         localPlayerState.velocity.z = 0;
         localPlayerState.velocity.y += GRAVITY * delta * 0.5; // Slower gravity
         // Update position based on velocity
         localPlayerState.position.addScaledVector(localPlayerState.velocity, delta);
         // Keep camera attached to the body
         camera.position.copy(localPlayerState.position);
         camera.position.y += PLAYER_HEIGHT * 0.8; // Maintain relative eye height
         return; // Don't process movement/input if dead
    }

    // --- Apply Gravity ---
    // Only apply gravity if the player is not considered grounded
    if (!localPlayerState.onGround) {
        localPlayerState.velocity.y += GRAVITY * delta;
    } else {
        // If on ground, prevent further downward velocity accumulation
        // This stops the player from sinking into the ground slightly
        localPlayerState.velocity.y = Math.max(0, localPlayerState.velocity.y);
    }

    // --- Calculate Movement Direction based on Input ---
    const speed = moveState.dashing ? MOVE_SPEED * DASH_SPEED_MULTIPLIER : MOVE_SPEED; // Use dash speed if active
    const moveDirection = new THREE.Vector3(moveState.right, 0, moveState.forward); // Input direction relative to axes
    moveDirection.normalize(); // Ensure consistent speed regardless of diagonal input

    // Apply camera's Y-axis rotation to the movement direction
    // This makes 'forward' move where the camera is looking horizontally
    if (controls && controls.isLocked) { // Only rotate movement if pointer is locked
        // Get camera's current rotation as a quaternion
        const cameraQuaternion = camera.quaternion;
         // Extract just the Y rotation component to avoid tilting movement up/down
         const yRotation = new THREE.Euler().setFromQuaternion(cameraQuaternion, 'YXZ').y;
         const rotationQuaternion = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yRotation);
         // Apply the Y rotation to the input movement direction
         moveDirection.applyQuaternion(rotationQuaternion);
    }

    // --- Update Velocity based on Movement Direction ---
    // Directly set horizontal velocity based on calculated direction and speed
    localPlayerState.velocity.x = moveDirection.x * speed;
    localPlayerState.velocity.z = moveDirection.z * speed;

    // --- Collision Detection & Resolution ---
    const environment = getEnvironmentMeshes(); // Get collidable objects from scene.js
    if (environment.length > 0) {
        // Call separate function to handle physics interactions
        handleCollisions(delta, environment);
    } else {
         // No environment loaded? Apply velocity directly (player will likely fall)
         localPlayerState.position.addScaledVector(localPlayerState.velocity, delta);
         // Assume airborne if no environment to check against
         localPlayerState.onGround = false;
    }

    // --- Check Fall Death ---
    // Check if player has fallen below the death plane
    if (localPlayerState.position.y < FALL_DEATH_Y) {
        console.log("Player fell below death threshold! Triggering death.");
        handleDeath(); // Handle death sequence
        return; // Stop this frame's update after death
    }

    // --- Update Camera Position ---
    // Camera's position should match the final, collision-resolved player position
    camera.position.copy(localPlayerState.position);
    // Add offset for eye-level height
    camera.position.y += PLAYER_HEIGHT * 0.8;

    // --- Network Update ---
    // Send player state to the server periodically
    if (time - localPlayerState.lastUpdateTime > NETWORK_UPDATE_INTERVAL) {
        if (controls) { // Ensure controls exist
            // Update internal rotation state based on current camera quaternion
             localPlayerState.rotation.setFromQuaternion(camera.quaternion, 'YXZ');
        }

        // Send position and rotation data
        sendPlayerUpdate({
            position: { x: localPlayerState.position.x, y: localPlayerState.position.y, z: localPlayerState.position.z },
            rotation: { x: localPlayerState.rotation.x, y: localPlayerState.rotation.y, z: localPlayerState.rotation.z },
        });
        localPlayerState.lastUpdateTime = time; // Reset timer
    }
}


// Handles ground checks and simple iterative wall collisions
function handleCollisions(deltaTime, environment) {
    const currentPos = localPlayerState.position;
    const velocity = localPlayerState.velocity;
    const capsuleRadius = 0.4; // Player's approximate horizontal radius
    const capsuleHeight = PLAYER_HEIGHT; // Player's height
    const stepDelta = deltaTime; // Time step for collision checks

    // --- Ground Check Raycast ---
    // Update ray origin based on current position, slightly above the feet
    groundCheckRaycaster.ray.origin.copy(currentPos).y += capsuleRadius;
    const groundIntersects = groundCheckRaycaster.intersectObjects(environment, true); // Check recursively
    let foundGround = false;

    if (groundIntersects.length > 0) {
         const groundDist = groundIntersects[0].distance;
         // Consider grounded only if moving downwards or still, and close enough
         if (velocity.y <= 0) {
             // Snap player position vertically to be exactly on the ground surface
             currentPos.y -= (groundDist - capsuleRadius);
             velocity.y = 0; // Stop downward movement
             foundGround = true;
         }
    }
    localPlayerState.onGround = foundGround; // Update grounded state
    // Allow jumping again if player is grounded and not holding the jump key
    if (foundGround && !moveState.jumping) {
         localPlayerState.canJump = true;
     }

    // --- Wall/Ceiling Collision (Simplified Iterative Method) ---
    // Check movement along each axis separately and revert if collision occurs
    const tempPosition = currentPos.clone(); // Use a temporary position for checks

    // 1. Check X-axis movement
    tempPosition.x += velocity.x * stepDelta;
    if (checkWallCollision(tempPosition, environment, capsuleRadius, capsuleHeight)) {
        tempPosition.x = currentPos.x; // Revert X position
        velocity.x = 0; // Stop X velocity
    }

    // 2. Check Z-axis movement (using potentially corrected X position)
    tempPosition.z += velocity.z * stepDelta;
     if (checkWallCollision(tempPosition, environment, capsuleRadius, capsuleHeight)) {
        tempPosition.z = currentPos.z; // Revert Z position
        velocity.z = 0; // Stop Z velocity
    }

    // 3. Check Y-axis movement (using potentially corrected X/Z position)
    tempPosition.y += velocity.y * stepDelta;
     if (checkWallCollision(tempPosition, environment, capsuleRadius, capsuleHeight)) {
         if (velocity.y > 0) { // Moving up - Hit ceiling
             tempPosition.y = currentPos.y; // Revert Y position
             velocity.y = 0; // Stop upward velocity
         } else { // Moving down - Hit floor/obstacle below
             // Only revert/stop if we weren't already considered grounded by the raycast
              if (!localPlayerState.onGround) {
                  tempPosition.y = currentPos.y; // Revert Y position
                  velocity.y = 0; // Stop downward velocity
                  // Force ground state since we collided with something below
                  localPlayerState.onGround = true;
                   if (!moveState.jumping) localPlayerState.canJump = true; // Allow jumping again
              }
             // If already grounded, the ground check should handle snapping,
             // so we likely don't need to revert Y here in that specific case.
         }
     }

    // Update the actual player position with the collision-resolved temporary position
    currentPos.copy(tempPosition);

    // --- Apply Ground Friction ---
    // Slow down horizontal movement when on ground and not actively moving
     if (localPlayerState.onGround && moveState.forward === 0 && moveState.right === 0) {
        // Frame-rate independent damping (adjust base factor 0.0-1.0)
        const dampingFactor = Math.pow(0.1, deltaTime); // e.g., 0.1 slows down quickly
        velocity.x *= dampingFactor;
        velocity.z *= dampingFactor;
        // Stop movement completely if velocity is very small
        if (Math.abs(velocity.x) < 0.01) velocity.x = 0;
        if (Math.abs(velocity.z) < 0.01) velocity.z = 0;
    }
}


// Helper function for wall collision checks using raycasting
function checkWallCollision(testPosition, environment, radius, height) {
    if (!collisionRaycaster) return false; // Safety check

    // Check points around the player capsule against the environment
    const checkRadius = radius * 0.9; // Check slightly inside the capsule radius
    const halfHeight = height * 0.45; // Check points near top/bottom spheres of capsule

    // Points to cast rays from (adjust Y offsets based on player model origin)
    const checkPoints = [
        testPosition.clone().add(new THREE.Vector3(0, halfHeight, 0)), // Near top
        testPosition.clone(),                                          // Center
        testPosition.clone().sub(new THREE.Vector3(0, halfHeight, 0))  // Near bottom
    ];
    // Directions to check horizontally
    const directions = [ new THREE.Vector3(1, 0, 0), new THREE.Vector3(-1, 0, 0),
                         new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, -1) ];

    // Cast rays from each point in each direction
    for (const point of checkPoints) {
        for (const dir of directions) {
            collisionRaycaster.set(point, dir);
            collisionRaycaster.far = checkRadius; // Check only up to the capsule radius
            const intersects = collisionRaycaster.intersectObjects(environment, true); // Check recursively
            // If any ray intersects, we have a collision
            if (intersects.length > 0) {
                return true;
            }
        }
    }

    // No collisions detected
    return false;
}

// --- State Management Callbacks ---
function handleDeath() {
    // Ensure death sequence only runs once
    if (localPlayerState.isDead) return;
    console.log("Local player death sequence started.");
    localPlayerState.isDead = true;
    localPlayerState.health = 0;
    localPlayerState.velocity.set(0, 0, 0); // Stop movement
    updateHealth(localPlayerState.health); // Update HUD
    showDeathScreen(); // Show "You Died" UI

    // Unlock pointer if it was locked
    if (isPointerLocked && controls) {
         console.log("Unlocking pointer due to death.");
         controls.unlock();
    }

    // Notify the server about the death
    console.log("Sending playerDied event to server.");
    sendPlayerDiedEvent({ position: {x: localPlayerState.position.x, y: localPlayerState.position.y, z: localPlayerState.position.z} });
}

export function handleRespawn(data) {
    // Called by main.js when server sends 'respawn' event
    if (!data || !data.position) {
         console.error("handleRespawn called with invalid data:", data);
         return;
     }
     console.log("Local player respawning at:", data.position);
     // Reset player state
     localPlayerState.isDead = false;
     localPlayerState.health = 100; // Assume full health on respawn (server confirms ideally)
     localPlayerState.position.set(data.position.x, data.position.y, data.position.z); // Set new position
     localPlayerState.velocity.set(0, 0, 0); // Reset velocity
     localPlayerState.onGround = false; // Assume airborne initially
     // Reset timers/cooldowns? (optional)
     localPlayerState.canDash = true;
     localPlayerState.canShoot = true;
     localPlayerState.canJump = true;
     // Update UI
     updateHealth(localPlayerState.health);
     hideDeathScreen();
     // Note: Player needs to click again to re-lock pointer controls
}

export function takeDamage(amount) {
    // Called externally when player takes damage (e.g., from network hit confirmation)
    if (localPlayerState.isDead) return; // Cannot take damage if already dead

    const damageAmount = Math.max(0, amount); // Ensure damage isn't negative
    localPlayerState.health -= damageAmount;
    localPlayerState.health = Math.max(0, localPlayerState.health); // Clamp health at 0 minimum

    updateHealth(localPlayerState.health); // Update HUD
    console.log(`Local player took ${damageAmount} damage, health remaining: ${localPlayerState.health}`);

    // Add visual/audio feedback for taking damage (e.g., red screen flash)
    // TODO: Implement damage feedback effect

    // Check if health has reached zero
    if (localPlayerState.health <= 0) {
        handleDeath(); // Trigger the death sequence
    }
}

// --- Getters for external access ---
export function getPlayerState() {
    // Return a *copy* of the state to prevent accidental external modification
    return {
        ...localPlayerState, // Copy primitive values
        position: localPlayerState.position.clone(), // Clone vectors/objects
        velocity: localPlayerState.velocity.clone(),
        rotation: localPlayerState.rotation.clone(), // Clone Euler angles
    };
}
export function getControls() { return controls; }
export function isLocked() { return isPointerLocked; }
