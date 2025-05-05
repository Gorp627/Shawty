// docs/js/playerController.js
import * as THREE from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.module.js'; // Using CDN URL
import { PointerLockControls } from './PointerLockControls.js';
import { sendPlayerUpdate, sendShootEvent, sendPlayerDiedEvent } from './network.js';
import { getEnvironmentMeshes, getCamera, PLAYER_HEIGHT, FALL_DEATH_Y } from './scene.js';
import { showDeathScreen, hideDeathScreen, updateHealth } from './ui.js';

let controls = null; // Initialize as null
let camera = null;   // Initialize as null
let isPointerLocked = false;
let localPlayerId = null;
let localPlayerState = {
    position: new THREE.Vector3(0, PLAYER_HEIGHT + 80, 0), // Default start pos
    velocity: new THREE.Vector3(),
    rotation: new THREE.Euler(0, 0, 0, 'YXZ'), // Use 'YXZ' order for FPS controls
    onGround: false,
    isDead: false,
    health: 100,
    lastUpdateTime: 0,
    canDash: true,
    canShoot: true,
    isPropulsionShot: false,
    canJump: true
};

const moveState = {
    forward: 0, right: 0, jumping: false, dashing: false
};

// Raycasters setup moved inside init potentially, or ensure THREE is loaded
let collisionRaycaster = null;
let groundCheckRaycaster = null;

const MOVE_SPEED = 5.0;
const DASH_SPEED_MULTIPLIER = 3.0;
const DASH_DURATION = 0.15;
const DASH_COOLDOWN = 1.0;
const JUMP_VELOCITY = 6.0;
const PROPULSION_FORCE = 25.0;
const SHOOT_COOLDOWN = 0.2; // seconds
const GRAVITY = -15.0;
const NETWORK_UPDATE_INTERVAL = 100; // ms

export function initPlayerController(cam, canvas, playerId) {
    if (!cam || !canvas || !playerId) {
        console.error("initPlayerController called with invalid arguments:", cam, canvas, playerId);
        return;
    }
    console.log("Initializing PlayerController for ID:", playerId);
    camera = cam;
    localPlayerId = playerId;

    // Initialize Raycasters here now that THREE is definitely loaded
    collisionRaycaster = new THREE.Raycaster();
    groundCheckRaycaster = new THREE.Raycaster(
        new THREE.Vector3(),        // Origin (set later)
        new THREE.Vector3(0, -1, 0), // Direction
        0,                          // Near
        PLAYER_HEIGHT * 0.6 + 0.1   // Far (check slightly more than half height)
    );

    try {
        controls = new PointerLockControls(camera, canvas); // Use the imported controls
        console.log("PointerLockControls instantiated.");
    } catch (e) {
        console.error("!!! Failed to instantiate PointerLockControls:", e);
        alert("Error initializing controls. Check console.");
        return;
    }

    canvas.addEventListener('click', () => {
        if (!localPlayerState.isDead && controls && !isPointerLocked) { // Check controls exist
             console.log("Canvas clicked, requesting pointer lock.");
             controls.lock();
        } else if (localPlayerState.isDead) {
            console.log("Canvas clicked, but player is dead.");
        } else if(isPointerLocked){
             console.log("Canvas clicked, but pointer already locked.");
        }
    });

    controls.addEventListener('lock', () => { isPointerLocked = true; console.log("Pointer Locked"); });
    controls.addEventListener('unlock', () => { isPointerLocked = false; console.log("Pointer Unlocked"); });

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    canvas.addEventListener('mousedown', onMouseDown);

    updateHealth(localPlayerState.health); // Initial HUD update
    console.log("PlayerController initialization complete.");
}

// --- Input Handlers ---
function onKeyDown(event) {
    if (!isPointerLocked || localPlayerState.isDead) return;
    switch (event.code) {
        case 'KeyW': case 'ArrowUp': moveState.forward = 1; break;
        case 'KeyS': case 'ArrowDown': moveState.forward = -1; break;
        case 'KeyA': case 'ArrowLeft': moveState.right = -1; break;
        case 'KeyD': case 'ArrowRight': moveState.right = 1; break;
        case 'Space':
            if (localPlayerState.canJump && localPlayerState.onGround && !moveState.jumping) {
                localPlayerState.velocity.y = JUMP_VELOCITY;
                localPlayerState.onGround = false; // Assume airborne immediately
                moveState.jumping = true;          // Prevent holding space
                localPlayerState.canJump = false;  // Prevent double jump until released
                 console.log("Jump initiated.");
            }
            break;
        case 'ShiftLeft':
            if (localPlayerState.canDash && !moveState.dashing) {
                moveState.dashing = true;
                localPlayerState.canDash = false;
                setTimeout(() => { moveState.dashing = false; console.log("Dash finished."); }, DASH_DURATION * 1000);
                setTimeout(() => { localPlayerState.canDash = true; console.log("Dash cooldown finished."); }, DASH_COOLDOWN * 1000);
                console.log("Dash initiated.");
            }
            break;
         case 'KeyE': localPlayerState.isPropulsionShot = true; break;
    }
}
function onKeyUp(event) {
     switch (event.code) {
        case 'KeyW': case 'ArrowUp': if (moveState.forward > 0) moveState.forward = 0; break;
        case 'KeyS': case 'ArrowDown': if (moveState.forward < 0) moveState.forward = 0; break;
        case 'KeyA': case 'ArrowLeft': if (moveState.right < 0) moveState.right = 0; break;
        case 'KeyD': case 'ArrowRight': if (moveState.right > 0) moveState.right = 0; break;
         case 'Space': moveState.jumping = false; localPlayerState.canJump = true; break;
         case 'KeyE': localPlayerState.isPropulsionShot = false; break;
    }
}
function onMouseDown(event) {
    if (!isPointerLocked || localPlayerState.isDead || !localPlayerState.canShoot) return;
    if (event.button === 0) { // Left mouse button
        // console.log("Shoot initiated."); // Can be spammy
        localPlayerState.canShoot = false;
        setTimeout(() => localPlayerState.canShoot = true, SHOOT_COOLDOWN * 1000);

        if (!camera) { console.error("Camera not available for shooting direction."); return; }
        const direction = new THREE.Vector3();
        camera.getWorldDirection(direction);

        // Send shoot event (pass plain object for direction)
        sendShootEvent({
            propulsion: localPlayerState.isPropulsionShot,
            direction: {x: direction.x, y: direction.y, z: direction.z}
        });

        // Apply propulsion immediately on client for responsiveness
        if (localPlayerState.isPropulsionShot) {
             applyPropulsion(direction);
        }
    }
}

// --- Movement & Physics ---
function applyPropulsion(shootDirection) {
     const propulsionVector = shootDirection.clone().negate().multiplyScalar(PROPULSION_FORCE);
     propulsionVector.y += PROPULSION_FORCE * 0.2; // Add some upward kick
     localPlayerState.velocity.add(propulsionVector);
     localPlayerState.onGround = false; // Player is likely airborne
     console.log("Applied client-side propulsion force.");
}

export function handleServerPropulsion(data) {
    // Server confirms propulsion - mainly for logging or potential correction
    console.log("Received server confirmation for propulsion.");
    // If NOT predicting client-side, apply force here instead of onMouseDown
}

export function applyKnockback(knockbackVector) {
    if (localPlayerState.isDead) return; // No knockback if dead
    if (!knockbackVector) { console.warn("applyKnockback called with invalid vector"); return; }
    const force = new THREE.Vector3(knockbackVector.x, knockbackVector.y, knockbackVector.z);
    localPlayerState.velocity.add(force);
    localPlayerState.onGround = false; // Knockback sends player airborne
    console.log("Applied server knockback force:", force);
}

export function updatePlayer(deltaTime) {
    // Crucial checks: Ensure controls and camera are initialized
    if (!controls || !camera || !collisionRaycaster || !groundCheckRaycaster) {
        // console.warn("PlayerController.updatePlayer skipped: controls/camera/raycasters not ready.");
        return;
    }
    if (!localPlayerId) {
         console.warn("PlayerController.updatePlayer skipped: localPlayerId not set.");
        return;
    }

    const delta = Math.min(deltaTime, 0.05); // Clamp delta time
    const time = performance.now();

    // --- Handle Dead State ---
    if (localPlayerState.isDead) {
         // Apply minimal gravity, maybe stop XZ movement
         localPlayerState.velocity.x = 0;
         localPlayerState.velocity.z = 0;
         localPlayerState.velocity.y += GRAVITY * delta * 0.5; // Slower gravity when dead
         localPlayerState.position.addScaledVector(localPlayerState.velocity, delta);
         // Keep camera position updated even when dead
         camera.position.copy(localPlayerState.position);
         camera.position.y += PLAYER_HEIGHT * 0.8; // Maintain camera height relative to body
         return; // Stop further processing if dead
    }

    // --- Apply Gravity ---
    if (!localPlayerState.onGround) {
        localPlayerState.velocity.y += GRAVITY * delta;
    } else {
        // Prevent gravity build-up when on ground & prevent slight bouncing
        localPlayerState.velocity.y = Math.max(0, localPlayerState.velocity.y);
    }

    // --- Calculate Movement Direction ---
    const speed = moveState.dashing ? MOVE_SPEED * DASH_SPEED_MULTIPLIER : MOVE_SPEED;
    const moveDirection = new THREE.Vector3(moveState.right, 0, moveState.forward);
    moveDirection.normalize(); // Prevent faster diagonal movement

    // Apply camera Y rotation to movement direction
    if (controls && controls.isLocked) { // Only apply rotation if locked
        // Use camera's quaternion directly for more robust rotation application
        const cameraQuaternion = camera.quaternion;
         // We only want the Y rotation component. Create a quaternion with only Y rotation.
         const yRotation = new THREE.Euler().setFromQuaternion(cameraQuaternion, 'YXZ').y;
         const rotationQuaternion = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yRotation);
         moveDirection.applyQuaternion(rotationQuaternion);
    } // else: don't rotate movement if pointer isn't locked

    // --- Update Velocity ---
    localPlayerState.velocity.x = moveDirection.x * speed;
    localPlayerState.velocity.z = moveDirection.z * speed;

    // --- Collision Detection & Resolution ---
    const environment = getEnvironmentMeshes();
    if (environment.length > 0) {
        handleCollisions(delta, environment);
    } else {
         // No environment loaded yet? Apply velocity directly (will likely fall)
         localPlayerState.position.addScaledVector(localPlayerState.velocity, delta);
         // Manually check ground if needed, or assume airborne
         localPlayerState.onGround = false;
    }

    // --- Check Fall Death ---
    if (localPlayerState.position.y < FALL_DEATH_Y) {
        console.log("Player fell below death threshold!");
        handleDeath();
        return; // Stop this frame's update
    }

    // --- Update Camera Position ---
    // Camera position should strictly follow the final calculated player position
    camera.position.copy(localPlayerState.position);
    camera.position.y += PLAYER_HEIGHT * 0.8; // Eye level offset

    // --- Network Update ---
    if (time - localPlayerState.lastUpdateTime > NETWORK_UPDATE_INTERVAL) {
        if (controls) { // Make sure controls exist before accessing camera rotation
            // Get current camera rotation to send to server
             localPlayerState.rotation.setFromQuaternion(camera.quaternion, 'YXZ');
        } else {
            // Use last known rotation if controls are somehow missing
             console.warn("Controls missing during network update, using last known rotation.");
        }

        // Send update to server
        sendPlayerUpdate({
            position: { x: localPlayerState.position.x, y: localPlayerState.position.y, z: localPlayerState.position.z },
            rotation: { x: localPlayerState.rotation.x, y: localPlayerState.rotation.y, z: localPlayerState.rotation.z },
        });
        localPlayerState.lastUpdateTime = time;
    }
}

function handleCollisions(deltaTime, environment) {
    const currentPos = localPlayerState.position;
    const velocity = localPlayerState.velocity;
    const capsuleRadius = 0.4;
    const capsuleHeight = PLAYER_HEIGHT;
    const stepDelta = deltaTime; // Use the frame delta for collision steps

    // --- Ground Check ---
    groundCheckRaycaster.ray.origin.copy(currentPos).y += capsuleRadius; // Start ray slightly above feet
    const groundIntersects = groundCheckRaycaster.intersectObjects(environment, true);
    let foundGround = false;

    if (groundIntersects.length > 0) {
         const groundDist = groundIntersects[0].distance;
         if (velocity.y <= 0) { // Only ground if moving down or still
             // Snap position to ground surface
             currentPos.y -= (groundDist - capsuleRadius);
             velocity.y = 0; // Stop downward velocity
             foundGround = true;
         }
    }
    localPlayerState.onGround = foundGround;
    // Allow jumping again if grounded and not holding jump key
    if (foundGround && !moveState.jumping) {
         localPlayerState.canJump = true;
     }

    // --- Wall/Ceiling Collision (Iterative approach) ---
    const tempPosition = currentPos.clone(); // Use temporary position for checks

    // 1. Apply X movement & check collision
    tempPosition.x += velocity.x * stepDelta;
    if (checkWallCollision(tempPosition, environment, capsuleRadius, capsuleHeight)) {
        tempPosition.x = currentPos.x; // Revert X move
        velocity.x = 0; // Stop X velocity
    }

    // 2. Apply Z movement & check collision (using potentially updated X)
    tempPosition.z += velocity.z * stepDelta;
     if (checkWallCollision(tempPosition, environment, capsuleRadius, capsuleHeight)) {
        tempPosition.z = currentPos.z; // Revert Z move
        velocity.z = 0; // Stop Z velocity
    }

    // 3. Apply Y movement & check collision (using potentially updated X/Z)
    tempPosition.y += velocity.y * stepDelta;
     if (checkWallCollision(tempPosition, environment, capsuleRadius, capsuleHeight)) {
         if (velocity.y > 0) { // Hit ceiling
             tempPosition.y = currentPos.y; // Revert Y move
             velocity.y = 0; // Stop upward velocity
         } else { // Hit floor while falling (might happen if ground check missed)
             // Only revert/stop if we weren't already considered grounded
              if (!localPlayerState.onGround) {
                  tempPosition.y = currentPos.y; // Revert Y move
                  velocity.y = 0; // Stop downward velocity
                  // Force ground state since we hit something below
                  localPlayerState.onGround = true;
                   if (!moveState.jumping) localPlayerState.canJump = true;
              } else {
                 // Already grounded, likely just landed precisely this frame.
                 // The ground check should have handled the snapping.
                 // No need to revert tempPosition.y here as it's likely correct.
              }
         }
     }

    // Update the actual player position with the collision-resolved temporary position
    currentPos.copy(tempPosition);

    // --- Apply Ground Friction ---
     if (localPlayerState.onGround && moveState.forward === 0 && moveState.right === 0) {
        // Apply damping factor to slow down horizontal movement
        const dampingFactor = Math.pow(0.1, deltaTime); // Frame-rate independent damping
        velocity.x *= dampingFactor;
        velocity.z *= dampingFactor;
        // Stop completely if velocity is very small
        if (Math.abs(velocity.x) < 0.01) velocity.x = 0;
        if (Math.abs(velocity.z) < 0.01) velocity.z = 0;
    }
}


function checkWallCollision(testPosition, environment, radius, height) {
    if (!collisionRaycaster) return false; // Raycaster not initialized yet

    // Simplified Capsule Collision: Check points around the capsule cylinder
    // Check slightly inside the radius to avoid minor surface penetrations causing false positives
    const checkRadius = radius * 0.9;
    const halfHeight = height * 0.45; // Slightly less than half height for top/bottom checks

    const checkPoints = [
        testPosition.clone().add(new THREE.Vector3(0, halfHeight, 0)), // Near top
        testPosition.clone(),                                          // Center
        testPosition.clone().sub(new THREE.Vector3(0, halfHeight, 0))  // Near bottom
    ];
    // Check 4 horizontal directions (+X, -X, +Z, -Z)
    const directions = [ new THREE.Vector3(1, 0, 0), new THREE.Vector3(-1, 0, 0),
                         new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, -1) ];

    for (const point of checkPoints) {
        for (const dir of directions) {
            collisionRaycaster.set(point, dir);
            collisionRaycaster.far = checkRadius; // Check distance just up to the radius
            const intersects = collisionRaycaster.intersectObjects(environment, true);
            if (intersects.length > 0) {
                 // console.log("Wall collision detected", point, dir); // Debug log
                return true; // Collision detected
            }
        }
    }
    // Optional: Check up/down for precise ceiling/floor collisions if needed
    // collisionRaycaster.set(testPosition, new THREE.Vector3(0, 1, 0)); collisionRaycaster.far = halfHeight + radius; ...
    // collisionRaycaster.set(testPosition, new THREE.Vector3(0, -1, 0)); collisionRaycaster.far = halfHeight + radius; ...

    return false; // No collision detected
}

// --- State Management ---
function handleDeath() {
    if (localPlayerState.isDead) return; // Prevent multiple death triggers
    console.log("Local player death sequence started.");
    localPlayerState.isDead = true;
    localPlayerState.health = 0;
    localPlayerState.velocity.set(0, 0, 0); // Stop movement immediately
    updateHealth(localPlayerState.health);
    showDeathScreen(); // Show "You Died" UI
    if (isPointerLocked && controls) {
         console.log("Unlocking pointer due to death.");
         controls.unlock(); // Release pointer lock
    }
    // Send death event to server
    console.log("Sending playerDied event to server.");
    sendPlayerDiedEvent({ position: {x: localPlayerState.position.x, y: localPlayerState.position.y, z: localPlayerState.position.z} });
}

export function handleRespawn(data) {
     if (!data || !data.position) {
         console.error("handleRespawn called with invalid data:", data);
         return;
     }
     console.log("Local player respawning at:", data.position);
     localPlayerState.isDead = false;
     localPlayerState.health = 100; // Reset health (server state might override)
     localPlayerState.position.set(data.position.x, data.position.y, data.position.z);
     localPlayerState.velocity.set(0, 0, 0); // Reset velocity
     localPlayerState.onGround = false; // Assume spawning slightly airborne
     updateHealth(localPlayerState.health);
     hideDeathScreen();
     // Player needs to click again to re-lock pointer, don't lock automatically
}

export function takeDamage(amount) {
    if (localPlayerState.isDead) return; // Can't take damage if already dead
    const damageAmount = Math.max(0, amount); // Ensure damage isn't negative
    localPlayerState.health -= damageAmount;
    localPlayerState.health = Math.max(0, localPlayerState.health); // Clamp health at 0
    updateHealth(localPlayerState.health);
    console.log(`Local player took ${damageAmount} damage, health: ${localPlayerState.health}`);
    // TODO: Add visual feedback (red flash, screen shake?)
    if (localPlayerState.health <= 0) {
        handleDeath(); // Trigger death sequence if health reaches 0
    }
}

// --- Getters ---
export function getPlayerState() {
    // Return a copy to prevent external modification of internal state
    return {
        ...localPlayerState,
        position: localPlayerState.position.clone(),
        velocity: localPlayerState.velocity.clone(),
        rotation: localPlayerState.rotation.clone(), // Make sure Euler angles are up-to-date if needed
    };
}
export function getControls() { return controls; }
export function isLocked() { return isPointerLocked; }
