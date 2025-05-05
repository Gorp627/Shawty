// docs/js/playerController.js
import * as THREE from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.module.js';
import { PointerLockControls } from './PointerLockControls.js'; // Make sure this path is correct
import { sendPlayerUpdate, sendShootEvent, sendPlayerDiedEvent } from './network.js';
import { getEnvironmentMeshes, getCamera, PLAYER_HEIGHT, FALL_DEATH_Y } from './scene.js';
import { showDeathScreen, hideDeathScreen, updateHealth } from './ui.js';

let controls;
let camera;
let isPointerLocked = false;
let localPlayerId = null;
let localPlayerState = {
    position: new THREE.Vector3(0, PLAYER_HEIGHT + 80, 0), // Initial spawn guess, server overrides
    velocity: new THREE.Vector3(),
    rotation: new THREE.Euler(0, 0, 0, 'YXZ'), // Use YXZ order for FPS controls
    onGround: false,
    isDead: false,
    health: 100,
    lastUpdateTime: 0,
    canDash: true,
    canShoot: true,
    isPropulsionShot: false, // Flag for E key + shoot
    canJump: true
};

const moveState = {
    forward: 0, // -1, 0, 1
    right: 0,   // -1, 0, 1
    jumping: false,
    dashing: false
};

const clock = new THREE.Clock();
const collisionRaycaster = new THREE.Raycaster();
const groundCheckRaycaster = new THREE.Raycaster();
groundCheckRaycaster.far = PLAYER_HEIGHT * 0.6; // Check just below the player center

const MOVE_SPEED = 5.0;
const DASH_SPEED_MULTIPLIER = 3.0;
const DASH_DURATION = 0.15; // seconds
const DASH_COOLDOWN = 1.0; // seconds
const JUMP_VELOCITY = 6.0;
const PROPULSION_FORCE = 25.0;
const SHOOT_COOLDOWN = 0.2; // seconds
const GRAVITY = -15.0; // Adjust as needed
const NETWORK_UPDATE_INTERVAL = 100; // ms (10 times per second)

let activeEffects = []; // Store active particles/shockwaves

export function initPlayerController(cam, canvas, playerId) {
    camera = cam;
    localPlayerId = playerId;
    controls = new PointerLockControls(camera, canvas);

    // Pointer Lock API listeners
    canvas.addEventListener('click', () => {
        if (!localPlayerState.isDead) { // Don't lock pointer if dead
             controls.lock();
        }
    });

    controls.addEventListener('lock', () => {
        isPointerLocked = true;
        console.log("Pointer Locked");
        // Hide menu, show HUD elements if needed
    });

    controls.addEventListener('unlock', () => {
        isPointerLocked = false;
        console.log("Pointer Unlocked");
        // Show menu or pause screen?
    });

    // Keyboard input listeners
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    // Mouse input for shooting
    canvas.addEventListener('mousedown', onMouseDown);

     // Initial health update
    updateHealth(localPlayerState.health);
}

function onKeyDown(event) {
    if (!isPointerLocked) return;

    switch (event.code) {
        case 'KeyW':
        case 'ArrowUp':
            moveState.forward = 1;
            break;
        case 'KeyS':
        case 'ArrowDown':
            moveState.forward = -1;
            break;
        case 'KeyA':
        case 'ArrowLeft':
            moveState.right = -1;
            break;
        case 'KeyD':
        case 'ArrowRight':
            moveState.right = 1;
            break;
        case 'Space':
            if (localPlayerState.canJump && localPlayerState.onGround && !moveState.jumping) {
                localPlayerState.velocity.y = JUMP_VELOCITY;
                localPlayerState.onGround = false; // Immediately leave ground state
                moveState.jumping = true; // Prevent holding space for continuous jump impulse
                 localPlayerState.canJump = false; // Prevent double jump until key up
            }
            break;
        case 'ShiftLeft':
            if (localPlayerState.canDash && !moveState.dashing) {
                moveState.dashing = true;
                localPlayerState.canDash = false; // Start cooldown timer
                setTimeout(() => moveState.dashing = false, DASH_DURATION * 1000);
                setTimeout(() => localPlayerState.canDash = true, DASH_COOLDOWN * 1000);
            }
            break;
         case 'KeyE':
            localPlayerState.isPropulsionShot = true; // Flag that E is held for the next shot
            break;
    }
}

function onKeyUp(event) {
    // No need to check isPointerLocked here, release keys regardless
     switch (event.code) {
        case 'KeyW':
        case 'ArrowUp':
            if (moveState.forward > 0) moveState.forward = 0;
            break;
        case 'KeyS':
        case 'ArrowDown':
            if (moveState.forward < 0) moveState.forward = 0;
            break;
        case 'KeyA':
        case 'ArrowLeft':
            if (moveState.right < 0) moveState.right = 0;
            break;
        case 'KeyD':
        case 'ArrowRight':
            if (moveState.right > 0) moveState.right = 0;
            break;
         case 'Space':
            moveState.jumping = false; // Allow jumping again if on ground
            localPlayerState.canJump = true; // Allow jump on next press
            break;
         case 'KeyE':
            localPlayerState.isPropulsionShot = false; // E key released
            break;
    }
}

function onMouseDown(event) {
    if (!isPointerLocked || localPlayerState.isDead || !localPlayerState.canShoot) return;

    if (event.button === 0) { // Left mouse button
        localPlayerState.canShoot = false; // Start cooldown
        setTimeout(() => localPlayerState.canShoot = true, SHOOT_COOLDOWN * 1000);

        // Get shooting direction from camera
        const direction = new THREE.Vector3();
        camera.getWorldDirection(direction);

        // Send shoot event to server
        sendShootEvent({
            propulsion: localPlayerState.isPropulsionShot,
            direction: direction // Send direction for propulsion calculation
        });

        // Apply propulsion immediately on client for responsiveness
        if (localPlayerState.isPropulsionShot) {
             applyPropulsion(direction); // Apply locally
        }

         // Reset E key flag after shooting
        // localPlayerState.isPropulsionShot = false; // Keep E state based on keyup/keydown
    }
}

function applyPropulsion(shootDirection) {
     // Apply force opposite to shooting direction
     const propulsionVector = shootDirection.clone().negate().multiplyScalar(PROPULSION_FORCE);
     // Add upward bias to propulsion
     propulsionVector.y += PROPULSION_FORCE * 0.2;
     localPlayerState.velocity.add(propulsionVector);
     localPlayerState.onGround = false; // Player is likely airborne after propulsion
     console.log("Applied propulsion force");
}

// Called from network.js when server confirms propulsion shot
export function handleServerPropulsion(data) {
    // Note: We might already apply this client-side in onMouseDown for responsiveness.
    // This server confirmation could be used for correction or ignored if client-side prediction is reliable enough.
    // OR, only apply propulsion *here* if you want server authority.
    // Let's assume we applied it client-side for now.
    console.log("Received server confirmation for propulsion (can be ignored if predicted)");
     // If *not* predicting client-side, apply it here:
     // const direction = new THREE.Vector3(data.direction.x, data.direction.y, data.direction.z);
     // applyPropulsion(direction);
}

// Apply knockback received from server (e.g., death explosion)
export function applyKnockback(knockbackVector) {
    if (localPlayerState.isDead) return; // Don't knockback dead players

    const force = new THREE.Vector3(knockbackVector.x, knockbackVector.y, knockbackVector.z);
     // Maybe scale force based on distance or other factors?
    localPlayerState.velocity.add(force);
    localPlayerState.onGround = false; // Knockback likely sends player airborne
    console.log("Applied knockback force:", force);
}


export function updatePlayer(deltaTime) {
    if (localPlayerState.isDead) {
         // If dead, player might slowly sink or just stay put until respawn
         // Apply minimal gravity to sink slightly?
         localPlayerState.velocity.x = 0;
         localPlayerState.velocity.z = 0;
         localPlayerState.velocity.y += GRAVITY * deltaTime * 0.5; // Slower gravity when dead?
         localPlayerState.position.addScaledVector(localPlayerState.velocity, deltaTime);
        // Ensure camera is updated even when dead
        camera.position.copy(localPlayerState.position);
        camera.position.y += PLAYER_HEIGHT * 0.8; // Slightly lower view when dead? Or keep normal height?

        return; // No movement input processing if dead
    }

    const speed = moveState.dashing ? MOVE_SPEED * DASH_SPEED_MULTIPLIER : MOVE_SPEED;
    const time = performance.now();
    const delta = deltaTime; // Use the accurate deltaTime passed in

    // Apply gravity
    if (!localPlayerState.onGround) {
        localPlayerState.velocity.y += GRAVITY * delta;
    } else {
        localPlayerState.velocity.y = Math.max(0, localPlayerState.velocity.y); // Prevent gravity buildup on ground
    }

    // Calculate movement direction based on camera look direction
    const moveDirection = new THREE.Vector3(moveState.right, 0, moveState.forward);
    moveDirection.normalize(); // Ensure consistent speed diagonally
    moveDirection.applyEuler(camera.rotation); // Rotate based on camera's Y rotation
    moveDirection.y = 0; // Don't allow flying by looking up/down while moving

    // Update velocity based on input
    const currentXZVelocity = new THREE.Vector3(localPlayerState.velocity.x, 0, localPlayerState.velocity.z);
    const targetXZVelocity = moveDirection.multiplyScalar(speed);

    // Smoothly interpolate velocity (optional, gives smoother starts/stops)
    // currentXZVelocity.lerp(targetXZVelocity, 0.2);
    // localPlayerState.velocity.x = currentXZVelocity.x;
    // localPlayerState.velocity.z = currentXZVelocity.z;

    // Direct velocity change (more responsive)
    localPlayerState.velocity.x = targetXZVelocity.x;
    localPlayerState.velocity.z = targetXZVelocity.z;


    // --- Collision Detection & Resolution ---
    const environment = getEnvironmentMeshes();
    if (environment.length > 0) {
        handleCollisions(delta, environment);
    } else {
         // No environment loaded yet, just apply velocity directly
         localPlayerState.position.addScaledVector(localPlayerState.velocity, delta);
    }


    // Check if fallen off map
    if (localPlayerState.position.y < FALL_DEATH_Y) {
        console.log("Player fell off map!");
        handleDeath();
    }


    // Update camera position to match the resolved player position
    camera.position.copy(localPlayerState.position);
    camera.position.y += PLAYER_HEIGHT * 0.8; // Position camera near top of player height


    // Send updates to server periodically
    if (time - localPlayerState.lastUpdateTime > NETWORK_UPDATE_INTERVAL) {
        // Update local rotation state based on camera
        // We only need yaw (Y rotation) for the player model usually
        localPlayerState.rotation.y = camera.rotation.y;
        // Pitch (X rotation) might be needed for aiming logic server-side later
        localPlayerState.rotation.x = camera.rotation.x;

        sendPlayerUpdate({
            position: { x: localPlayerState.position.x, y: localPlayerState.position.y, z: localPlayerState.position.z },
            rotation: { x: localPlayerState.rotation.x, y: localPlayerState.rotation.y, z: localPlayerState.rotation.z }, // Send Euler angles
            // velocity: { x: localPlayerState.velocity.x, y: localPlayerState.velocity.y, z: localPlayerState.velocity.z }, // Optional
            // isGrounded: localPlayerState.onGround // Optional
        });
        localPlayerState.lastUpdateTime = time;
    }

    // Update active effects (particles, shockwaves)
    activeEffects = activeEffects.filter(effect => {
         const stillActive = effect.update(deltaTime); // Assuming effects have an update method
         if (!stillActive) effect.dispose(); // Assuming effects have a dispose method
         return stillActive;
    });
}


function handleCollisions(deltaTime, environment) {
    const currentPos = localPlayerState.position;
    const velocity = localPlayerState.velocity;
    const capsuleRadius = 0.4; // Approximate player width/depth radius
    const capsuleHeight = PLAYER_HEIGHT;
    const capsuleHalfHeight = capsuleHeight / 2;

    // Store original velocity for separation logic
    const originalVelocity = velocity.clone();

    // --- Ground Check ---
    const groundCheckOrigin = currentPos.clone();
    groundCheckOrigin.y += capsuleRadius; // Start slightly above feet position
    groundCheckRaycaster.set(groundCheckOrigin, new THREE.Vector3(0, -1, 0));
    const groundIntersects = groundCheckRaycaster.intersectObjects(environment, true); // Recursive check

    let foundGround = false;
    let groundNormal = new THREE.Vector3(0, 1, 0); // Assume flat ground initially
    const groundThreshold = capsuleRadius + 0.1; // How close to ground counts as grounded

    if (groundIntersects.length > 0 && groundIntersects[0].distance <= groundThreshold) {
         const groundPoint = groundIntersects[0].point;
         const groundDist = groundIntersects[0].distance;

        // Snap to ground if slightly penetrating or very close
        if (velocity.y <= 0) { // Only snap if moving down or stationary
            currentPos.y -= (groundDist - capsuleRadius); // Adjust position to be exactly on ground
             velocity.y = 0; // Stop downward movement
             foundGround = true;
             groundNormal = groundIntersects[0].face.normal.clone();
             // Debug: Draw ground normal
             // const arrowHelper = new THREE.ArrowHelper(groundNormal, groundPoint, 1, 0x00ff00);
            // scene.add(arrowHelper); // Need scene access or a debug module
            // setTimeout(() => scene.remove(arrowHelper), 100);
        }
    }
     localPlayerState.onGround = foundGround;
     if (!moveState.jumping && foundGround) { // Reset jump flag if grounded and not holding space
         localPlayerState.canJump = true;
     }


    // --- Wall/Ceiling Collision (Simplified using sweeps or iterative checks) ---
    // This is complex. A simple approach: Check movement along each axis iteratively.
    // More robust: Capsule sweep tests (requires more math or a physics library).

    // Simplified Iterative Check:
    const tempPosition = currentPos.clone();
    const stepDelta = deltaTime; // Or smaller substeps for accuracy

    // 1. Apply X movement
    tempPosition.x += velocity.x * stepDelta;
    if (checkWallCollision(tempPosition, environment, capsuleRadius, capsuleHeight)) {
        tempPosition.x = currentPos.x; // Revert X move
        velocity.x = 0; // Stop X velocity
    }

    // 2. Apply Z movement
    tempPosition.z += velocity.z * stepDelta;
     if (checkWallCollision(tempPosition, environment, capsuleRadius, capsuleHeight)) {
        tempPosition.z = currentPos.z; // Revert Z move
        velocity.z = 0; // Stop Z velocity
    }

     // 3. Apply Y movement (already partially handled by ground check)
    tempPosition.y += velocity.y * stepDelta;
     if (checkWallCollision(tempPosition, environment, capsuleRadius, capsuleHeight)) {
         // Check if collision was ceiling (velocity > 0) or floor (velocity < 0)
         if (velocity.y > 0) { // Hit ceiling
             tempPosition.y = currentPos.y; // Revert Y
             velocity.y = 0;
         } else { // Hit floor (might happen if falling fast)
             // Ground check should ideally handle this snap already
             // If still colliding, revert and stop Y velocity
              if (!localPlayerState.onGround) {
                  tempPosition.y = currentPos.y;
                  velocity.y = 0;
                  // Force ground state? Or let next frame's ground check handle it.
              }
         }
     }


    // Project remaining velocity along slopes if grounded (optional, adds realism)
    if (localPlayerState.onGround && groundNormal.y < 0.999) { // If on a slope
         // Project intended XZ movement onto the slope plane
         const intendedXZ = new THREE.Vector3(velocity.x, 0, velocity.z);
         const projectedVelocity = intendedXZ.clone().projectOnPlane(groundNormal);
         velocity.x = projectedVelocity.x;
         velocity.z = projectedVelocity.z;

         // Add downward force component due to slope (helps stick to slopes)
         const slopeDownForce = groundNormal.clone().multiplyScalar(GRAVITY * stepDelta * (1.0 - groundNormal.y));
         // velocity.add(slopeDownForce); // Careful not to accelerate infinitely downhill
    }


    // Update final position based on resolved collisions
    currentPos.copy(tempPosition);

    // Apply small friction/damping to XZ velocity when on ground and not actively moving
     if (localPlayerState.onGround && moveState.forward === 0 && moveState.right === 0) {
        const dampingFactor = 0.85; // Lower = more friction
        velocity.x *= dampingFactor;
        velocity.z *= dampingFactor;
        if (Math.abs(velocity.x) < 0.01) velocity.x = 0;
        if (Math.abs(velocity.z) < 0.01) velocity.z = 0;
    }

}


function checkWallCollision(testPosition, environment, radius, height) {
    // Simplified: Check points around the capsule against the environment
    // Center point, top point, bottom point
    const checkPoints = [
        testPosition.clone(), // Center (approx)
        testPosition.clone().add(new THREE.Vector3(0, height * 0.45, 0)), // Near top
        testPosition.clone().sub(new THREE.Vector3(0, height * 0.45, 0)), // Near bottom
    ];
    const collisionThreshold = radius; // How close counts as collision

    for (const point of checkPoints) {
         // Check in 4 horizontal directions from each point
         const directions = [
            new THREE.Vector3(1, 0, 0), new THREE.Vector3(-1, 0, 0),
            new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, -1)
         ];

        for (const dir of directions) {
            collisionRaycaster.set(point, dir);
            collisionRaycaster.far = collisionThreshold;
            const intersects = collisionRaycaster.intersectObjects(environment, true);
            if (intersects.length > 0) {
                // Collision detected in this direction
                return true;
            }
        }
         // Optional: Check directly below/above for ceilings/complex floors
         // collisionRaycaster.set(point, new THREE.Vector3(0, 1, 0)); ...
         // collisionRaycaster.set(point, new THREE.Vector3(0, -1, 0)); ...
    }

    return false; // No collision detected
}


function handleDeath() {
    if (localPlayerState.isDead) return; // Already dead

    console.log("Local player died.");
    localPlayerState.isDead = true;
    localPlayerState.health = 0;
    localPlayerState.velocity.set(0, 0, 0); // Stop movement
    updateHealth(localPlayerState.health);
    showDeathScreen(); // Show "You Died" message
    if (isPointerLocked) {
        controls.unlock(); // Release pointer lock on death
    }

    // Send death event to server, including position for shockwave origin
    sendPlayerDiedEvent({ position: localPlayerState.position });

    // Trigger local visual/audio death effects (handled by scene via network event is better)
    // import { createDeathExplosion } from './scene.js';
    // const effects = createDeathExplosion(localPlayerState.position);
    // activeEffects.push(...effects);
}

export function handleRespawn(data) {
     console.log("Local player respawning.");
     localPlayerState.isDead = false;
     localPlayerState.health = 100; // Reset health (server should confirm this really)
     localPlayerState.position.set(data.position.x, data.position.y, data.position.z);
     localPlayerState.velocity.set(0, 0, 0);
     localPlayerState.onGround = false; // Assume spawning slightly airborne
     updateHealth(localPlayerState.health);
     hideDeathScreen();
     // Re-enable controls (user needs to click to lock pointer again)
}

// Call this function when the server indicates this player took damage
export function takeDamage(amount) {
    if (localPlayerState.isDead) return;

    localPlayerState.health -= amount;
    updateHealth(localPlayerState.health);
    console.log(`Took ${amount} damage, health: ${localPlayerState.health}`);

    // TODO: Add visual feedback (red flash, screen shake?)

    if (localPlayerState.health <= 0) {
        handleDeath();
    }
}

export function getPlayerState() {
    // Return a copy to prevent external modification
    return {
        ...localPlayerState,
        position: localPlayerState.position.clone(),
        velocity: localPlayerState.velocity.clone(),
        rotation: localPlayerState.rotation.clone(),
    };
}

export function getControls() {
    return controls;
}

export function isLocked() {
    return isPointerLocked;
}
