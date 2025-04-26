// docs/gameLogic.js

// Depends on: config.js, stateMachine.js, entities.js, input.js, effects.js, network.js, uiManager.js, loadManager.js
// Accesses globals: scene, camera, controls, clock, players, bullets, velocityY, isOnGround, localPlayerId, CONFIG, THREE, ClientPlayer, Network, Effects, Input, UIManager, stateMachine, Bullet, loadManager

/**
 * Updates the state of the local player based on input, physics, and collisions.
 * Sends updates to the server if necessary.
 * @param {number} deltaTime - Time elapsed since the last frame in seconds.
 */
function updateLocalPlayer(deltaTime) {
    // Guard clause checks
    const isPlaying = stateMachine.is('playing');
    const isLocked = controls?.isLocked;
    const hasLocalPlayer = localPlayerId && players[localPlayerId];
    const isAlive = hasLocalPlayer && players[localPlayerId].health > 0;
    if (!isPlaying || !isLocked || !hasLocalPlayer || !isAlive) return; // Skip if conditions not met

    const controlsObject = controls.getObject();
    const localPlayerState = players[localPlayerId];
    const moveSpeed = Input.keys['ShiftLeft'] ? CONFIG.MOVEMENT_SPEED_SPRINTING : CONFIG.MOVEMENT_SPEED;
    const deltaSpeed = moveSpeed * deltaTime;
    const previousPosition = controlsObject.position.clone();

    // Vertical Movement
    velocityY -= CONFIG.GRAVITY * deltaTime;
    controlsObject.position.y += velocityY * deltaTime;

    // Horizontal Movement
    if (Input.keys['KeyW']) { controls.moveForward(deltaSpeed); }
    if (Input.keys['KeyS']) { controls.moveForward(-deltaSpeed); }
    if (Input.keys['KeyA']) { controls.moveRight(-deltaSpeed); }
    if (Input.keys['KeyD']) { controls.moveRight(deltaSpeed); }

    // Dash Movement
    if (Input.isDashing) { controlsObject.position.addScaledVector(Input.dashDirection, CONFIG.DASH_FORCE * deltaTime); }

    // Player-Player Collision
    const currentPosition = controlsObject.position;
    const collisionRadius = CONFIG.PLAYER_COLLISION_RADIUS || CONFIG.PLAYER_RADIUS || 0.4;
    for (const id in players) {
        if (id !== localPlayerId && players[id] instanceof ClientPlayer && players[id].mesh?.visible && players[id].mesh.position) {
            const otherMesh = players[id].mesh;
            const distanceXZ = new THREE.Vector2(currentPosition.x - otherMesh.position.x, currentPosition.z - otherMesh.position.z).length();
            if (distanceXZ < collisionRadius * 2) {
                controlsObject.position.x = previousPosition.x;
                controlsObject.position.z = previousPosition.z;
                break;
            }
        }
    }

    // Ground Check
    const groundY = 0; // Assuming flat ground at Y=0 for now
    if (controlsObject.position.y < groundY + CONFIG.PLAYER_HEIGHT) {
        controlsObject.position.y = groundY + CONFIG.PLAYER_HEIGHT;
        if (velocityY < 0) { velocityY = 0; }
        isOnGround = true;
    } else { isOnGround = false; }

    // Void Check
    if (controlsObject.position.y < CONFIG.VOID_Y_LEVEL && localPlayerState.health > 0) {
        console.log("Player fell into void."); localPlayerState.health = 0;
        if(UIManager){ UIManager.updateHealthBar(0); UIManager.showKillMessage("You fell out of the world."); }
        if(Network) Network.sendVoidDeath(); // Check if Network exists
    }

    // Update View Model (position/recoil recovery)
    if (Effects?.updateViewModel) Effects.updateViewModel(deltaTime); // Check if Effects and function exist

    // Send Network Updates if player moved significantly
    const logicalPosition = controlsObject.position.clone(); logicalPosition.y -= CONFIG.PLAYER_HEIGHT; // Position at feet level
    const currentRotation = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ'); // Get current Y rotation
    const currentRotationY = currentRotation.y;
    const lastSentState = localPlayerState; // Use local player state cache

    // Calculate change thresholds
    const positionChanged = logicalPosition.distanceToSquared(
        new THREE.Vector3(lastSentState?.x ?? 0, lastSentState?.y ?? 0, lastSentState?.z ?? 0)
    ) > (CONFIG.PLAYER_MOVE_THRESHOLD_SQ || 0.0001); // Use config threshold or default

    const rotationChanged = Math.abs(currentRotationY - (lastSentState?.rotationY ?? 0)) > 0.01; // Fixed rotation threshold

    if (positionChanged || rotationChanged) {
        // Update local cache of last sent state
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
    // Guard clauses
    const isPlaying = stateMachine.is('playing');
    const isLocked = controls?.isLocked;
    const hasLocalPlayer = localPlayerId && players[localPlayerId];
    const isAlive = hasLocalPlayer && players[localPlayerId].health > 0;
    const hasCamera = !!camera;
    if (!isPlaying || !isLocked || !hasLocalPlayer || !isAlive || !hasCamera) {
        console.warn("Shoot called but conditions not met.");
        return; // Prevent shooting
    }

    // Trigger effects managed by the Effects module
    if (Effects) {
        Effects.triggerRecoil?.();      // Optional chaining for safety
        Effects.triggerMuzzleFlash?.(); // Optional chaining
        Effects.playSound?.('gunshotSound'); // Use the new sound method
    } else {
        console.warn("Effects module missing in shoot()");
    }

    // Calculate bullet origin and direction
    const bulletPosition = new THREE.Vector3();
    const bulletDirection = new THREE.Vector3();
    camera.getWorldDirection(bulletDirection); // Aim direction from camera center

    // *** Get muzzle position from Effects helper ***
    const muzzleWorldPos = Effects?.getMuzzleWorldPosition?.(); // Use optional chaining

    if (muzzleWorldPos) {
        // If we got a valid position from the gun model, use it
        bulletPosition.copy(muzzleWorldPos);
        // console.log("[gameLogic] Bullet Spawn Origin (from Effects Muzzle):", bulletPosition.toArray());
    } else {
        // Fallback if gun view model not ready or function fails
        console.warn("[gameLogic] Using fallback bullet spawn origin (Effects.getMuzzleWorldPosition failed).");
        camera.getWorldPosition(bulletPosition); // Get camera position
        // Offset slightly forward from camera
        bulletPosition.addScaledVector(bulletDirection, (CONFIG.PLAYER_RADIUS || 0.4) * 2);
        // console.log("[gameLogic] Bullet Spawn Origin (Fallback):", bulletPosition.toArray());
    }
     // console.log("[gameLogic] Bullet Direction:", bulletDirection.toArray()); // Less verbose


    // Send shoot event to server
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
            // console.log(`Bullet ${bullet.id} hit player ${hitPlayerId}`);
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
