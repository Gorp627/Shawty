// docs/gameLogic.js

// Depends on: config.js, stateMachine.js, entities.js, input.js, effects.js, network.js, uiManager.js, loadManager.js
// Accesses globals: scene, camera, controls, clock, players, bullets, velocityY, isOnGround, localPlayerId, CONFIG, THREE, ClientPlayer, Network, Effects, Input, UIManager, stateMachine, Bullet, loadManager, currentRecoilOffset

/**
 * Updates the state of the local player based on input, physics, and collisions.
 * Sends updates to the server if necessary.
 * @param {number} deltaTime - Time elapsed since the last frame in seconds.
 */
function updateLocalPlayer(deltaTime) {
    // --- Guard Clause ---
    const isPlaying = stateMachine.is('playing');
    const isLocked = controls?.isLocked;
    const localPlayerData = localPlayerId ? players[localPlayerId] : null;
    const isAlive = localPlayerData && localPlayerData.health > 0;
    if (!isPlaying || !isLocked || !localPlayerData || !isAlive) {
        return; // Skip update if conditions not met
    }

    // --- Get Objects ---
    const controlsObject = controls.getObject(); // The camera rig / player controller object
    const playerState = localPlayerData; // Local player's state data store

    // --- Movement Calculation ---
    const moveSpeed = Input.keys['ShiftLeft'] ? CONFIG.MOVEMENT_SPEED_SPRINTING : CONFIG.MOVEMENT_SPEED;
    const deltaSpeed = moveSpeed * deltaTime;
    const previousPosition = controlsObject.position.clone(); // Store position before movement

    // --- Vertical Movement (Gravity/Jump) ---
    velocityY -= CONFIG.GRAVITY * deltaTime;
    controlsObject.position.y += velocityY * deltaTime;

    // --- Horizontal Movement (Based on Input module state & camera direction) ---
    const forward = new THREE.Vector3(); const right = new THREE.Vector3();
    camera.getWorldDirection(forward); forward.y = 0; forward.normalize();
    right.crossVectors(camera.up, forward).normalize(); // Get perpendicular vector for strafing

    let moveDirection = new THREE.Vector3(0, 0, 0);
    if (Input.keys['KeyW']) { moveDirection.add(forward); }
    if (Input.keys['KeyS']) { moveDirection.sub(forward); }
    if (Input.keys['KeyA']) { moveDirection.sub(right); }
    if (Input.keys['KeyD']) { moveDirection.add(right); }

    if (moveDirection.lengthSq() > 0) {
        moveDirection.normalize();
        controlsObject.position.addScaledVector(moveDirection, deltaSpeed);
    }

    // --- Dash Movement (Based on Input module state) ---
    if (Input.isDashing) {
        controlsObject.position.addScaledVector(Input.dashDirection, CONFIG.DASH_FORCE * deltaTime);
    }

    // --- Collision (Player-Player) ---
    const currentPosition = controlsObject.position;
    const collisionRadius = CONFIG.PLAYER_COLLISION_RADIUS || CONFIG.PLAYER_RADIUS || 0.4;
    for (const id in players) {
        if (id !== localPlayerId && players[id] instanceof ClientPlayer && players[id].mesh?.visible && players[id].mesh.position) {
            const otherMesh = players[id].mesh;
            const distanceXZ = new THREE.Vector2(currentPosition.x - otherMesh.position.x, currentPosition.z - otherMesh.position.z).length();
            if (distanceXZ < collisionRadius * 2) {
                controlsObject.position.x = previousPosition.x;
                controlsObject.position.z = previousPosition.z;
                // Optional: Add a small push-back force here instead of just stopping
                break; // Stop checking after one collision
            }
        }
    }

    // --- Ground Check (Basic - Assumes flat ground) ---
    const groundY = 0;
    if (controlsObject.position.y < groundY + CONFIG.PLAYER_HEIGHT) {
        controlsObject.position.y = groundY + CONFIG.PLAYER_HEIGHT;
        if (velocityY < 0) { velocityY = 0; }
        isOnGround = true;
    } else {
        isOnGround = false;
    }

    // --- Void Check ---
    if (controlsObject.position.y < CONFIG.VOID_Y_LEVEL && playerState.health > 0) {
        console.log("Player fell into void."); playerState.health = 0;
        if(UIManager){ UIManager.updateHealthBar(0); UIManager.showKillMessage("Fell."); }
        if(Network) Network.sendVoidDeath();
    }

    // --- Apply Recoil Effect to Camera Rotation ---
    // The recoil offset value is managed by Effects.updateViewModel
    // We apply it here to the camera's rotation for the visual "kick"
    if (camera && currentRecoilOffset && (currentRecoilOffset.x !== 0 || currentRecoilOffset.y !== 0)) {
        // Apply recoil as rotation adjustments to the camera (Pitch and Yaw)
        // Note: This directly rotates the camera, PointerLockControls will fight this a bit.
        // A better approach involves rotating a camera "rig" group instead.
        // For now, a simple direct rotation:
        camera.rotation.x -= currentRecoilOffset.y * 0.1; // Recoil Y affects Pitch (X rotation)
        // Applying yaw (Y rotation) directly can be problematic with PointerLockControls
        // controlsObject.rotation.y -= currentRecoilOffset.x * 0.1; // Recoil X affects Yaw (Y rotation) - DISABLED FOR NOW
    }
    // We still call Effects.updateViewModel to handle the recovery interpolation of currentRecoilOffset
    if (Effects?.updateViewModel) Effects.updateViewModel(deltaTime);


    // --- Send Network Updates ---
    const logicalPosition = controlsObject.position.clone(); logicalPosition.y -= CONFIG.PLAYER_HEIGHT;
    // Get camera rotation for sending (PointerLockControls manages this)
    const currentRotation = new THREE.Euler().setFromQuaternion(controlsObject.quaternion, 'YXZ'); // Use controlsObject quaternion
    const currentRotationY = currentRotation.y;
    const lastSentState = playerState;

    const posThresholdSq = CONFIG.PLAYER_MOVE_THRESHOLD_SQ || 0.0001;
    const positionChanged = logicalPosition.distanceToSquared(
        new THREE.Vector3(lastSentState?.x ?? 0, lastSentState?.y ?? 0, lastSentState?.z ?? 0)
    ) > posThresholdSq;
    const rotationThreshold = 0.01;
    const rotationChanged = Math.abs(currentRotationY - (lastSentState?.rotationY ?? 0)) > rotationThreshold;

    if (positionChanged || rotationChanged) {
        // Update local cache before sending
        if (lastSentState) {
             lastSentState.x = logicalPosition.x; lastSentState.y = logicalPosition.y; lastSentState.z = logicalPosition.z; lastSentState.rotationY = currentRotationY;
        }
        // Send update
        if(Network) Network.sendPlayerUpdate({ x:logicalPosition.x, y:logicalPosition.y, z:logicalPosition.z, rotationY:currentRotationY });
    }
}

/**
 * Initiates the shooting action for the local player.
 * Spawns bullet near camera center.
 */
function shoot() {
    // --- Guard Clauses ---
    const isPlaying = stateMachine.is('playing'); const isLocked = controls?.isLocked;
    const p = localPlayerId ? players[localPlayerId] : null; const isAlive = p && p.health > 0;
    const hasCamera = !!camera;
    if (!isPlaying || !isLocked || !p || !isAlive || !hasCamera) return;

    // --- Trigger Effects (Sound, Recoil Offset, Muzzle Flash near camera) ---
    if (Effects) {
        Effects.triggerRecoil?.();      // Calculates recoil offset for camera kick
        // Play sound instantly
        Effects.playSound?.('gunshotSound');

        // Calculate simple flash position near camera
        const flashPos = new THREE.Vector3();
        const shootDir = new THREE.Vector3();
        camera.getWorldPosition(flashPos);
        camera.getWorldDirection(shootDir);
        flashPos.addScaledVector(shootDir, 1.0); // Position flash slightly in front of camera center

        Effects.triggerMuzzleFlash?.(flashPos); // Trigger flash at this position
    } else { console.warn("Effects module missing in shoot()"); }

    // --- Calculate Bullet Origin and Direction (Simplified) ---
    const bulletPosition = new THREE.Vector3();
    const bulletDirection = new THREE.Vector3();
    camera.getWorldDirection(bulletDirection); // Aim direction from camera center

    // Origin slightly in front of the camera to avoid hitting self
    camera.getWorldPosition(bulletPosition);
    bulletPosition.addScaledVector(bulletDirection, (CONFIG.PLAYER_RADIUS || 0.4) * 2 + 0.1); // Offset by radius + a little extra

    console.log("[gameLogic] Final Bullet Origin:", bulletPosition.toArray().map(n=>n.toFixed(2)).join(','));

    // --- Send Network Event ---
    if (Network?.sendShoot) { // Check if Network and function exist
         Network.sendShoot({
             position: { x: bulletPosition.x, y: bulletPosition.y, z: bulletPosition.z },
             direction: { x: bulletDirection.x, y: bulletDirection.y, z: bulletDirection.z }
         });
    } else { console.error("Network.sendShoot missing!"); }
}

/** Spawns a bullet instance visually on the client. */
function spawnBullet(data) {
    // Add a small delay before spawning locally to somewhat mimic network latency
    // This is a crude approximation. Real lag compensation is complex.
    // Remove setTimeout if instant local bullet is preferred.
    // setTimeout(() => {
        if (typeof Bullet !== 'undefined') {
            // Ensure bullet isn't spawned if the shooter isn't known locally (edge case)
            if (players[data.shooterId] || data.shooterId === localPlayerId) {
                 bullets.push(new Bullet(data));
            } else {
                 console.warn(`Received shotFired from unknown shooter ${data.shooterId}, not spawning bullet.`);
            }
        } else {
            console.error("Bullet class is missing! Cannot spawn bullet.");
        }
    // }, 50); // Example 50ms delay

}

/** Updates all active bullets, handles movement, collision checks, and removal. */
function updateBullets(deltaTime) {
    // Iterate backwards for safe removal during loop
    for (let i = bullets.length - 1; i >= 0; i--) {
        const bullet = bullets[i];
        if (!bullet || !bullet.update) { // Add safety check for bullet object
             console.warn("Invalid bullet object in array at index", i);
             bullets.splice(i, 1); // Remove invalid entry
             continue;
        }
        const isActive = bullet.update(deltaTime); // Update position, check lifetime/bounds

        if (!isActive) {
            bullet.remove?.(); // Use optional chaining for remove method
            bullets.splice(i, 1); // Remove from array
            continue; // Skip to next bullet
        }

        // --- Collision Check: Bullet vs Players ---
        const hitPlayerId = bullet.checkCollision?.(); // Use optional chaining

        if (hitPlayerId) {
            // console.log(`Bullet ${bullet.id} hit player ${hitPlayerId}`); // Less verbose
            // If the local player's bullet hit someone, tell the server
            if (bullet.ownerId === localPlayerId) {
                if(Network) Network.sendHit(hitPlayerId, CONFIG.BULLET_DAMAGE); // Check Network exists
            }
            // Remove the bullet visually and logically regardless of owner
            bullet.remove?.();
            bullets.splice(i, 1);
            continue; // Stop processing this bullet after hit
        }

         // --- TODO: Collision Check: Bullet vs Map ---
         // Implement map collision detection here if needed
    }
}

/** Updates the interpolation for remote players' visual representations. */
function updateRemotePlayers(deltaTime) {
    for (const id in players) {
        // Only update remote players that are instances of ClientPlayer
        if (id !== localPlayerId && players[id] instanceof ClientPlayer) { // Ensure it's the correct type
            players[id].interpolate(deltaTime);
        }
    }
}

console.log("gameLogic.js loaded");
