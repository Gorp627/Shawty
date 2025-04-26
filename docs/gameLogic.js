// docs/gameLogic.js

// Depends on: config.js, stateMachine.js, entities.js, input.js, effects.js, network.js, uiManager.js, loadManager.js
// Accesses globals: scene, camera, controls, clock, players, bullets, velocityY, isOnGround, localPlayerId, CONFIG, THREE, ClientPlayer, Network, Effects, Input, UIManager, stateMachine, Bullet, loadManager

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
        // console.log(`UpdateLocalPlayer skipped: P${isPlaying} L${isLocked} D${!!localPlayerData} A${isAlive}`); // Debug skip reason
        return;
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
    // Use direction vectors relative to the camera's current orientation
    const forward = new THREE.Vector3();
    const right = new THREE.Vector3();
    camera.getWorldDirection(forward); // Get camera's forward direction (-Z in camera space)
    forward.y = 0; // Project onto XZ plane
    forward.normalize();
    right.crossVectors(camera.up, forward).normalize(); // Get camera's right direction (already normalized)

    let moveDirection = new THREE.Vector3(0, 0, 0);
    if (Input.keys['KeyW']) { moveDirection.add(forward); }
    if (Input.keys['KeyS']) { moveDirection.sub(forward); }
    if (Input.keys['KeyA']) { moveDirection.sub(right); }
    if (Input.keys['KeyD']) { moveDirection.add(right); }

    // Apply movement only if there's input, normalize for consistent diagonal speed
    if (moveDirection.lengthSq() > 0) {
        moveDirection.normalize();
        controlsObject.position.addScaledVector(moveDirection, deltaSpeed);
    }

    // --- Dash Movement (Based on Input module state) ---
    if (Input.isDashing) {
        // Apply dash force in the calculated direction (relative to player orientation)
        controlsObject.position.addScaledVector(Input.dashDirection, CONFIG.DASH_FORCE * deltaTime);
    }

    // --- Collision (Player-Player) ---
    // Basic cylinder-based collision detection against other visible players
    const currentPosition = controlsObject.position;
    const collisionRadius = CONFIG.PLAYER_COLLISION_RADIUS || CONFIG.PLAYER_RADIUS || 0.4;
    for (const id in players) {
        // Skip self and non-ClientPlayer instances
        if (id !== localPlayerId && players[id] instanceof ClientPlayer && players[id].mesh?.visible && players[id].mesh.position) {
            const otherMesh = players[id].mesh;
            // Ensure otherMesh position is valid before calculating distance
            const distanceXZ = new THREE.Vector2(
                currentPosition.x - otherMesh.position.x,
                currentPosition.z - otherMesh.position.z
            ).length();

            // If horizontal distance is less than the sum of radii
            if (distanceXZ < collisionRadius * 2) {
                // Revert horizontal position, keep vertical position change
                controlsObject.position.x = previousPosition.x;
                controlsObject.position.z = previousPosition.z;
                break; // Stop checking after one collision
            }
        }
    }

    // --- Ground Check (Basic - Assumes flat ground) ---
    // TODO: Implement raycasting downwards for better ground detection.
    const groundY = 0; // Assuming flat ground at Y=0
    if (controlsObject.position.y < groundY + CONFIG.PLAYER_HEIGHT) {
        controlsObject.position.y = groundY + CONFIG.PLAYER_HEIGHT;
        if (velocityY < 0) { velocityY = 0; } // Reset downward velocity only
        isOnGround = true;
    } else {
        isOnGround = false;
    }

    // --- Void Check ---
    if (controlsObject.position.y < CONFIG.VOID_Y_LEVEL && playerState.health > 0) {
        console.log("Player fell into void."); playerState.health = 0; // Update local state immediately
        if(UIManager){ UIManager.updateHealthBar(0); UIManager.showKillMessage("You fell out of the world."); }
        if(Network) Network.sendVoidDeath(); // Tell server
    }

    // --- Update View Model (Recoil Recovery / Bobbing etc) ---
    if (Effects?.updateViewModel) {
        Effects.updateViewModel(deltaTime); // Check if Effects and function exist
    }

    // --- Send Network Updates ---
    // Calculate current position at feet level for server state
    const logicalPosition = controlsObject.position.clone();
    logicalPosition.y -= CONFIG.PLAYER_HEIGHT;

    // Get current Y rotation (Yaw) from camera controls object
    const currentRotation = new THREE.Euler().setFromQuaternion(controlsObject.quaternion, 'YXZ');
    const currentRotationY = currentRotation.y;

    // Compare with last acknowledged/sent state stored locally
    const lastSentState = playerState; // Use local player state cache

    // Check if position or rotation changed significantly enough to warrant an update
    const posThresholdSq = CONFIG.PLAYER_MOVE_THRESHOLD_SQ || 0.0001;
    const positionChanged = logicalPosition.distanceToSquared(
        new THREE.Vector3(lastSentState?.x ?? 0, lastSentState?.y ?? 0, lastSentState?.z ?? 0)
    ) > posThresholdSq;

    const rotationThreshold = 0.01; // Radians threshold for rotation change
    const rotationChanged = Math.abs(currentRotationY - (lastSentState?.rotationY ?? 0)) > rotationThreshold;

    if (positionChanged || rotationChanged) {
        // Update the local cache *before* sending, assuming send succeeds conceptually
        if (lastSentState) {
             lastSentState.x = logicalPosition.x;
             lastSentState.y = logicalPosition.y;
             lastSentState.z = logicalPosition.z;
             lastSentState.rotationY = currentRotationY;
        }
        // Send update to server
        if(Network) Network.sendPlayerUpdate({
            x: logicalPosition.x,
            y: logicalPosition.y,
            z: logicalPosition.z,
            rotationY: currentRotationY
        });
    }
}

/**
 * Initiates the shooting action for the local player.
 */
function shoot() {
    // --- Guard Clauses ---
    const isPlaying = stateMachine.is('playing');
    const isLocked = controls?.isLocked;
    const localPlayerData = localPlayerId ? players[localPlayerId] : null;
    const isAlive = localPlayerData && localPlayerData.health > 0;
    const hasCamera = !!camera;
    if (!isPlaying || !isLocked || !localPlayerData || !isAlive || !hasCamera) {
        // console.warn("Shoot conditions not met."); // Less verbose
        return; // Prevent shooting
    }

    // --- Trigger Effects ---
    if (Effects) {
        Effects.triggerRecoil?.();      // Optional chaining for safety
        Effects.triggerMuzzleFlash?.(); // Optional chaining
        Effects.playSound?.('gunshotSound'); // Use the centralized sound method
    } else {
        console.warn("Effects module missing in shoot()");
    }

    // --- Calculate Bullet Origin and Direction ---
    const bulletPosition = new THREE.Vector3();
    const bulletDirection = new THREE.Vector3();
    camera.getWorldDirection(bulletDirection); // Aim direction from camera center

    // *** Get muzzle position from Effects helper ***
    const muzzleWorldPos = Effects?.getMuzzleWorldPosition?.(); // Use optional chaining

    // *** Log the result ***
    console.log(`[gameLogic] shoot(): Got muzzle position from Effects: ${muzzleWorldPos ? muzzleWorldPos.toArray().map(n=>n.toFixed(2)).join(',') : 'null/failed'}`);


    if (muzzleWorldPos) {
        // If we got a valid position from the gun model, use it
        bulletPosition.copy(muzzleWorldPos);
    } else {
        // Fallback if gun view model not ready or function fails
        console.warn("[gameLogic] shoot(): Using fallback bullet spawn origin.");
        camera.getWorldPosition(bulletPosition); // Get camera position
        // Offset slightly forward from camera
        bulletPosition.addScaledVector(bulletDirection, (CONFIG.PLAYER_RADIUS || 0.4) * 2);
    }
     console.log("[gameLogic] Final Bullet Origin:", bulletPosition.toArray().map(n=>n.toFixed(2)).join(','));


    // --- Send Network Event ---
    if (Network?.sendShoot) { // Check if Network and function exist
         Network.sendShoot({
             position: { x: bulletPosition.x, y: bulletPosition.y, z: bulletPosition.z },
             direction: { x: bulletDirection.x, y: bulletDirection.y, z: bulletDirection.z }
         });
    } else {
        console.error("Network.sendShoot missing!");
    }
}

/** Spawns a bullet instance visually on the client. */
function spawnBullet(data) {
    if (typeof Bullet !== 'undefined') {
        bullets.push(new Bullet(data));
    } else {
        console.error("Bullet class is missing! Cannot spawn bullet.");
    }
}

/** Updates all active bullets, handles movement, collision checks, and removal. */
function updateBullets(deltaTime) {
    // Iterate backwards for safe removal during loop
    for (let i = bullets.length - 1; i >= 0; i--) {
        const bullet = bullets[i];
        const isActive = bullet.update(deltaTime); // Update position, check lifetime/bounds

        if (!isActive) {
            bullet.remove(); // Remove visual representation
            bullets.splice(i, 1); // Remove from array
            continue; // Skip to next bullet
        }

        // --- Collision Check: Bullet vs Players ---
        const hitPlayerId = bullet.checkCollision(); // Check player collision (returns ID if hit)

        if (hitPlayerId) {
            // console.log(`Bullet ${bullet.id} hit player ${hitPlayerId}`); // Less verbose
            // If the local player's bullet hit someone, tell the server
            if (bullet.ownerId === localPlayerId) {
                if(Network) Network.sendHit(hitPlayerId, CONFIG.BULLET_DAMAGE); // Check Network exists
            }
            // Remove the bullet visually and logically regardless of owner
            bullet.remove();
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
