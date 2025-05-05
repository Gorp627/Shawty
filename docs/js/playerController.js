// docs/js/playerController.js
import * as THREE from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.module.js'; // Using CDN URL
import { PointerLockControls } from './PointerLockControls.js'; // This file imports PointerLockControls
import { sendPlayerUpdate, sendShootEvent, sendPlayerDiedEvent } from './network.js';
import { getEnvironmentMeshes, getCamera, PLAYER_HEIGHT, FALL_DEATH_Y } from './scene.js';
import { showDeathScreen, hideDeathScreen, updateHealth } from './ui.js';

let controls;
let camera;
let isPointerLocked = false;
let localPlayerId = null;
let localPlayerState = {
    position: new THREE.Vector3(0, PLAYER_HEIGHT + 80, 0),
    velocity: new THREE.Vector3(),
    rotation: new THREE.Euler(0, 0, 0, 'YXZ'),
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

const clock = new THREE.Clock();
const collisionRaycaster = new THREE.Raycaster();
const groundCheckRaycaster = new THREE.Raycaster();
groundCheckRaycaster.far = PLAYER_HEIGHT * 0.6;

const MOVE_SPEED = 5.0;
const DASH_SPEED_MULTIPLIER = 3.0;
const DASH_DURATION = 0.15;
const DASH_COOLDOWN = 1.0;
const JUMP_VELOCITY = 6.0;
const PROPULSION_FORCE = 25.0;
const SHOOT_COOLDOWN = 0.2;
const GRAVITY = -15.0;
const NETWORK_UPDATE_INTERVAL = 100;

let activeEffects = []; // Unused here, managed in main.js

export function initPlayerController(cam, canvas, playerId) {
    camera = cam;
    localPlayerId = playerId;
    controls = new PointerLockControls(camera, canvas); // Use the imported controls

    canvas.addEventListener('click', () => {
        if (!localPlayerState.isDead) {
             controls.lock();
        }
    });

    controls.addEventListener('lock', () => { isPointerLocked = true; console.log("Pointer Locked"); });
    controls.addEventListener('unlock', () => { isPointerLocked = false; console.log("Pointer Unlocked"); });

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    canvas.addEventListener('mousedown', onMouseDown);

    updateHealth(localPlayerState.health);
}

function onKeyDown(event) {
    if (!isPointerLocked || localPlayerState.isDead) return; // Ignore input if not locked or dead
    switch (event.code) {
        case 'KeyW': case 'ArrowUp': moveState.forward = 1; break;
        case 'KeyS': case 'ArrowDown': moveState.forward = -1; break;
        case 'KeyA': case 'ArrowLeft': moveState.right = -1; break;
        case 'KeyD': case 'ArrowRight': moveState.right = 1; break;
        case 'Space':
            if (localPlayerState.canJump && localPlayerState.onGround && !moveState.jumping) {
                localPlayerState.velocity.y = JUMP_VELOCITY;
                localPlayerState.onGround = false;
                moveState.jumping = true;
                localPlayerState.canJump = false;
            }
            break;
        case 'ShiftLeft':
            if (localPlayerState.canDash && !moveState.dashing) {
                moveState.dashing = true;
                localPlayerState.canDash = false;
                setTimeout(() => moveState.dashing = false, DASH_DURATION * 1000);
                setTimeout(() => localPlayerState.canDash = true, DASH_COOLDOWN * 1000);
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
        localPlayerState.canShoot = false;
        setTimeout(() => localPlayerState.canShoot = true, SHOOT_COOLDOWN * 1000);

        const direction = new THREE.Vector3();
        camera.getWorldDirection(direction);

        sendShootEvent({
            propulsion: localPlayerState.isPropulsionShot,
            direction: {x: direction.x, y: direction.y, z: direction.z} // Send plain object
        });

        if (localPlayerState.isPropulsionShot) {
             applyPropulsion(direction); // Apply locally
        }
    }
}

function applyPropulsion(shootDirection) {
     const propulsionVector = shootDirection.clone().negate().multiplyScalar(PROPULSION_FORCE);
     propulsionVector.y += PROPULSION_FORCE * 0.2;
     localPlayerState.velocity.add(propulsionVector);
     localPlayerState.onGround = false;
     console.log("Applied propulsion force");
}

export function handleServerPropulsion(data) {
    // Can be ignored if predicting client-side, or used for correction
    console.log("Received server confirmation for propulsion");
    // If NOT predicting, uncomment below:
    // const direction = new THREE.Vector3(data.direction.x, data.direction.y, data.direction.z);
    // applyPropulsion(direction);
}

export function applyKnockback(knockbackVector) {
    if (localPlayerState.isDead) return;
    const force = new THREE.Vector3(knockbackVector.x, knockbackVector.y, knockbackVector.z);
    localPlayerState.velocity.add(force);
    localPlayerState.onGround = false;
    console.log("Applied knockback force:", force);
}

export function updatePlayer(deltaTime) {
    if (!controls) return; // Don't update if controls not initialized

    const delta = Math.min(deltaTime, 0.05); // Use clamped delta
    const time = performance.now();

    if (localPlayerState.isDead) {
         localPlayerState.velocity.x = 0;
         localPlayerState.velocity.z = 0;
         localPlayerState.velocity.y += GRAVITY * delta * 0.5;
         localPlayerState.position.addScaledVector(localPlayerState.velocity, delta);
         camera.position.copy(localPlayerState.position);
         camera.position.y += PLAYER_HEIGHT * 0.8;
         return; // Stop processing if dead
    }

    // Apply gravity
    if (!localPlayerState.onGround) {
        localPlayerState.velocity.y += GRAVITY * delta;
    } else {
        localPlayerState.velocity.y = Math.max(0, localPlayerState.velocity.y);
    }

    // Calculate movement direction
    const speed = moveState.dashing ? MOVE_SPEED * DASH_SPEED_MULTIPLIER : MOVE_SPEED;
    const moveDirection = new THREE.Vector3(moveState.right, 0, moveState.forward);
    moveDirection.normalize();
    // Apply camera rotation (Y-axis only) to movement direction
    const cameraDirection = new THREE.Vector3();
    camera.getWorldDirection(cameraDirection);
    const angleY = Math.atan2(cameraDirection.x, cameraDirection.z); // Get camera's Y rotation
    moveDirection.applyAxisAngle(new THREE.Vector3(0, 1, 0), angleY);

    // Update velocity (direct change)
    localPlayerState.velocity.x = moveDirection.x * speed;
    localPlayerState.velocity.z = moveDirection.z * speed;

    // Collision Detection & Resolution
    const environment = getEnvironmentMeshes();
    if (environment.length > 0) {
        handleCollisions(delta, environment);
    } else {
         // No environment loaded, just apply velocity directly
         localPlayerState.position.addScaledVector(localPlayerState.velocity, delta);
    }

    // Check fall death
    if (localPlayerState.position.y < FALL_DEATH_Y) {
        console.log("Player fell off map!");
        handleDeath();
        return; // Stop further processing this frame if dead
    }

    // Update camera position
    camera.position.copy(localPlayerState.position);
    camera.position.y += PLAYER_HEIGHT * 0.8;

    // Network Update
    if (time - localPlayerState.lastUpdateTime > NETWORK_UPDATE_INTERVAL) {
        // Get current camera rotation for sending
        localPlayerState.rotation.setFromQuaternion(camera.quaternion, 'YXZ');

        sendPlayerUpdate({
            position: { x: localPlayerState.position.x, y: localPlayerState.position.y, z: localPlayerState.position.z },
            rotation: { x: localPlayerState.rotation.x, y: localPlayerState.rotation.y, z: localPlayerState.rotation.z }, // Send Euler angles
        });
        localPlayerState.lastUpdateTime = time;
    }
}


function handleCollisions(deltaTime, environment) {
    const currentPos = localPlayerState.position;
    const velocity = localPlayerState.velocity;
    const capsuleRadius = 0.4;
    const capsuleHeight = PLAYER_HEIGHT;
    const stepDelta = deltaTime;

    // --- Ground Check ---
    const groundCheckOrigin = currentPos.clone().add(new THREE.Vector3(0, capsuleRadius, 0)); // Start slightly above feet
    groundCheckRaycaster.set(groundCheckOrigin, new THREE.Vector3(0, -1, 0));
    const groundIntersects = groundCheckRaycaster.intersectObjects(environment, true);
    let foundGround = false;
    const groundThreshold = capsuleRadius + 0.1;

    if (groundIntersects.length > 0 && groundIntersects[0].distance <= groundThreshold) {
         if (velocity.y <= 0) {
             currentPos.y -= (groundIntersects[0].distance - capsuleRadius);
             velocity.y = 0;
             foundGround = true;
         }
    }
     localPlayerState.onGround = foundGround;
     if (foundGround && !moveState.jumping) {
         localPlayerState.canJump = true;
     }

    // --- Wall/Ceiling Collision (Simplified Iterative) ---
    const tempPosition = currentPos.clone();

    // Apply X move
    tempPosition.x += velocity.x * stepDelta;
    if (checkWallCollision(tempPosition, environment, capsuleRadius, capsuleHeight)) {
        tempPosition.x = currentPos.x; velocity.x = 0;
    }
    // Apply Z move
    tempPosition.z += velocity.z * stepDelta;
     if (checkWallCollision(tempPosition, environment, capsuleRadius, capsuleHeight)) {
        tempPosition.z = currentPos.z; velocity.z = 0;
    }
    // Apply Y move
    tempPosition.y += velocity.y * stepDelta;
     if (checkWallCollision(tempPosition, environment, capsuleRadius, capsuleHeight)) {
         if (velocity.y > 0) { // Hit ceiling
             tempPosition.y = currentPos.y; velocity.y = 0;
         } else { // Hit floor while falling (ground check might have missed)
              if (!localPlayerState.onGround) { // Only revert if not already grounded
                  tempPosition.y = currentPos.y; velocity.y = 0;
                  // Maybe force ground check again? Or set onGround = true?
                  // Setting onGround = true might be simplest here
                  localPlayerState.onGround = true;
                   if (!moveState.jumping) localPlayerState.canJump = true;
              }
         }
     }

    // Update final position
    currentPos.copy(tempPosition);

    // Apply ground friction
     if (localPlayerState.onGround && moveState.forward === 0 && moveState.right === 0) {
        velocity.x *= 0.85; velocity.z *= 0.85;
        if (Math.abs(velocity.x) < 0.01) velocity.x = 0;
        if (Math.abs(velocity.z) < 0.01) velocity.z = 0;
    }
}

function checkWallCollision(testPosition, environment, radius, height) {
    // Simple capsule collision check (using points)
    const checkPoints = [
        testPosition.clone().add(new THREE.Vector3(0, height * 0.45 - radius, 0)), // Near top sphere center
        testPosition.clone().sub(new THREE.Vector3(0, height * 0.45 - radius, 0)), // Near bottom sphere center
        testPosition.clone() // Middle point (optional)
    ];
    const directions = [ new THREE.Vector3(1, 0, 0), new THREE.Vector3(-1, 0, 0),
                         new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, -1) ];
    const collisionThreshold = radius; // Check distance equal to radius

    for (const point of checkPoints) {
        for (const dir of directions) {
            collisionRaycaster.set(point, dir);
            collisionRaycaster.far = collisionThreshold;
            const intersects = collisionRaycaster.intersectObjects(environment, true);
            if (intersects.length > 0) return true; // Collision detected
        }
        // Optional: Check up/down for ceilings/floors from mid-points if needed
        // collisionRaycaster.set(point, new THREE.Vector3(0, 1, 0)); ...
        // collisionRaycaster.set(point, new THREE.Vector3(0, -1, 0)); ...
    }
    return false; // No collision
}


function handleDeath() {
    if (localPlayerState.isDead) return;
    console.log("Local player died.");
    localPlayerState.isDead = true;
    localPlayerState.health = 0;
    localPlayerState.velocity.set(0, 0, 0);
    updateHealth(localPlayerState.health);
    showDeathScreen();
    if (isPointerLocked) controls.unlock();
    sendPlayerDiedEvent({ position: {x: localPlayerState.position.x, y: localPlayerState.position.y, z: localPlayerState.position.z} });
}

export function handleRespawn(data) {
     console.log("Local player respawning.");
     localPlayerState.isDead = false;
     localPlayerState.health = 100; // Assuming server resets health
     localPlayerState.position.set(data.position.x, data.position.y, data.position.z);
     localPlayerState.velocity.set(0, 0, 0);
     localPlayerState.onGround = false;
     updateHealth(localPlayerState.health);
     hideDeathScreen();
     // Player needs to click again to lock pointer
}

export function takeDamage(amount) { // Called externally (e.g., from network on hit)
    if (localPlayerState.isDead) return;
    localPlayerState.health -= amount;
    updateHealth(localPlayerState.health);
    console.log(`Took ${amount} damage, health: ${localPlayerState.health}`);
    // TODO: Add visual feedback (red flash?)
    if (localPlayerState.health <= 0) {
        handleDeath();
    }
}

export function getPlayerState() {
    return { ...localPlayerState, position: localPlayerState.position.clone(), velocity: localPlayerState.velocity.clone(), rotation: localPlayerState.rotation.clone() };
}
export function getControls() { return controls; }
export function isLocked() { return isPointerLocked; }
