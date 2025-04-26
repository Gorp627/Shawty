// docs/gameLogic.js

// Depends on: config.js, stateMachine.js, entities.js, input.js, effects.js, network.js, uiManager.js
// Accesses globals: scene, camera, controls, clock, players, bullets, velocityY, isOnGround, localPlayerId, gunshotSound, gunViewModel, CONFIG, THREE

/**
 * Updates the state of the local player based on input, physics, and collisions.
 * Sends updates to the server if necessary.
 * @param {number} deltaTime - Time elapsed since the last frame in seconds.
 */
function updateLocalPlayer(deltaTime) {
    // --- Guard Clause Checks ---
    const isPlaying = stateMachine.is('playing');
    const isLocked = controls?.isLocked;
    const hasLocalPlayer = localPlayerId && players[localPlayerId];
    const isAlive = hasLocalPlayer && players[localPlayerId].health > 0;

    // Combined Guard Clause: Ensure we are in the correct state and have necessary objects/data
    if (!isPlaying || !isLocked || !hasLocalPlayer || !isAlive) {
        // Optional: Log why updates are skipped if debugging
        // if (!isPlaying) console.log("Skip update: Not playing");
        // if (!isLocked) console.log("Skip update: Controls not locked");
        // if (!hasLocalPlayer) console.log("Skip update: Local player data missing");
        // if (hasLocalPlayer && !isAlive) console.log("Skip update: Local player dead");
        return;
    }

    // --- Access needed objects/data (safe now after guard clause) ---
    const controlsObject = controls.getObject(); // The camera rig / player controller object
    const localPlayerState = players[localPlayerId]; // Local player's data store

    // --- Movement Speed ---
    const moveSpeed = Input.keys['ShiftLeft'] ? CONFIG.MOVEMENT_SPEED_SPRINTING : CONFIG.MOVEMENT_SPEED;
    const deltaSpeed = moveSpeed * deltaTime;
    const previousPosition = controlsObject.position.clone(); // Store position before movement for collision checks

    // --- Vertical Movement (Gravity/Jump) ---
    velocityY -= CONFIG.GRAVITY * deltaTime;
    controlsObject.position.y += velocityY * deltaTime;

    // --- Horizontal Movement (Based on Input module state) ---
    if (Input.keys['KeyW']) { controls.moveForward(deltaSpeed); }
    if (Input.keys['KeyS']) { controls.moveForward(-deltaSpeed); }
    if (Input.keys['KeyA']) { controls.moveRight(-deltaSpeed); }
    if (Input.keys['KeyD']) { controls.moveRight(deltaSpeed); }

    // --- Dash Movement (Based on Input module state) ---
    if (Input.isDashing) {
        // Apply dash force in the calculated direction (relative to player orientation)
        controlsObject.position.addScaledVector(Input.dashDirection, CONFIG.DASH_FORCE * deltaTime);
    }

    // --- Collision (Player-Player) ---
    // Basic cylinder-based collision detection against other visible players
    const currentPosition = controlsObject.position;
    for (const id in players) {
        // Skip self and players without a visible mesh
        if (id !== localPlayerId && players[id] instanceof ClientPlayer && players[id].mesh && players[id].mesh.visible) {
            const otherMesh = players[id].mesh;
            // Ensure otherMesh position is valid before calculating distance
            if (otherMesh.position) {
                 const distanceXZ = new THREE.Vector2(
                    currentPosition.x - otherMesh.position.x,
                    currentPosition.z - otherMesh.position.z
                 ).length();

                 // If horizontal distance is less than the sum of radii
                 // Use CONFIG.PLAYER_COLLISION_RADIUS or fallback CONFIG.PLAYER_RADIUS
                 const collisionRadius = CONFIG.PLAYER_COLLISION_RADIUS || CONFIG.PLAYER_RADIUS || 0.4;
                 if (distanceXZ < collisionRadius * 2) {
                    // Revert horizontal position, keep vertical position change
                    controlsObject.position.x = previousPosition.x;
                    controlsObject.position.z = previousPosition.z;
                    // console.log(`Collision with ${id}`);
                    break; // Stop checking after one collision
                 }
            } else {
                 console.warn(`Player ${id} mesh has no position for collision check.`);
            }
        }
    }

    // --- Ground Check (Basic - Needs Raycasting for slopes/stairs) ---
    // TODO: Implement raycasting downwards for proper ground detection on uneven terrain.
    const groundY = 0; // Assuming flat ground at Y=0 for now
    // ** FIX: Use CONFIG.PLAYER_HEIGHT **
    if (controlsObject.position.y < groundY + CONFIG.PLAYER_HEIGHT) {
        controlsObject.position.y = groundY + CONFIG.PLAYER_HEIGHT;
        if (velocityY < 0) { // Only reset velocity if moving downwards onto the ground
            velocityY = 0;
        }
        isOnGround = true;
    } else {
        isOnGround = false;
    }

    // --- Void Check ---
    if (controlsObject.position.y < CONFIG.VOID_Y_LEVEL && localPlayerState.health > 0) {
        console.log("Player fell into void.");
        localPlayerState.health = 0; // Update local state immediately
        if(typeof UIManager !== 'undefined') {
            UIManager.updateHealthBar(0);
            UIManager.showKillMessage("You fell out of the world."); // Specific message
        }
        Network.sendVoidDeath(); // Tell server
        // State change (e.g., disable input) might happen via server 'playerDied' event
    }

    // --- Update View Model ---
    // Ensure Effects module and function exist
    if (typeof Effects !== 'undefined' && typeof Effects.updateViewModel === 'function') {
         Effects.updateViewModel(deltaTime);
    }

    // --- Send Updates via Network module ---
    // Calculate current position at feet level for comparison
    const logicalPosition = controlsObject.position.clone();
    // ** FIX: Use CONFIG.PLAYER_HEIGHT **
    logicalPosition.y -= CONFIG.PLAYER_HEIGHT;

    // Get current rotation (Yaw only) from camera
    const currentRotation = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ'); // Ensure camera is updated
    const currentRotationY = currentRotation.y;

    // Compare with last sent state (localPlayerState should store the last ACKNOWLEDGED state from server, or last sent state)
    // For simplicity, we often compare against the last *sent* state stored locally.
    const lastSentState = localPlayerState; // Assuming localPlayerState holds x, y, z, rotationY of last update

    // Check if position changed significantly
    const positionChanged = logicalPosition.distanceToSquared(
        new THREE.Vector3(lastSentState?.x ?? 0, lastSentState?.y ?? 0, lastSentState?.z ?? 0)
    ) > CONFIG.PLAYER_MOVE_THRESHOLD_SQ;

    // Check if rotation changed significantly
    // Normalize angles or use a robust comparison if needed, simple diff for now
    const rotationChanged = Math.abs(currentRotationY - (lastSentState?.rotationY ?? 0)) > 0.01; // Small threshold for rotation change

    if (positionChanged || rotationChanged) {
        // Update the local cache of the last sent state
        if (lastSentState) {
            lastSentState.x = logicalPosition.x;
            lastSentState.y = logicalPosition.y;
            lastSentState.z = logicalPosition.z;
            lastSentState.rotationY = currentRotationY;
        }
        // Send update to server
        Network.sendPlayerUpdate({
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
    // --- Guard Clause Checks ---
    const isPlaying = stateMachine.is('playing');
    const isLocked = controls?.isLocked;
    const hasLocalPlayer = localPlayerId && players[localPlayerId];
    const isAlive = hasLocalPlayer && players[localPlayerId].health > 0;
    const hasCamera = typeof camera !== 'undefined' && camera;

    if (!isPlaying || !isLocked || !hasLocalPlayer || !isAlive || !hasCamera) {
         console.warn("Shoot called but conditions not met:", {isPlaying, isLocked, hasLocalPlayer, isAlive, hasCamera});
         return; // Prevent shooting if conditions aren't met
    }

    // Trigger visual/audio effects
    if (typeof Effects !== 'undefined' && typeof Effects.triggerRecoil === 'function') {
        Effects.triggerRecoil();
        Effects.triggerMuzzleFlash(); // Also trigger muzzle flash
    }
    if (gunshotSound) {
        try {
             // Create a clone to allow overlapping sounds
             const sound = gunshotSound.cloneNode();
             sound.play().catch(function(e) {
                 // Ignore errors often caused by rapid firing before previous sound finished loading metadata
                 // console.warn("Gunshot sound play error (ignorable):", e);
             });
        } catch(e) {
             console.error("Error playing gunshot sound:", e);
        }
    }

    // Calculate bullet origin and direction
    const bulletPosition = new THREE.Vector3();
    const bulletDirection = new THREE.Vector3();

    camera.getWorldDirection(bulletDirection); // Aim direction from camera

    // Calculate bullet origin: Prefer muzzle position if gunViewModel exists and is attached
    if (gunViewModel && gunViewModel.parent === camera && typeof gunViewModel.localToWorld === 'function') {
         // Get world position of the muzzle offset relative to the gunViewModel
         // MUZZLE_LOCAL_OFFSET should be relative to the gun model's origin
         const worldMuzzlePosition = gunViewModel.localToWorld(CONFIG.MUZZLE_LOCAL_OFFSET.clone());
         bulletPosition.copy(worldMuzzlePosition);
    } else {
         // Fallback: Origin near the camera if gun view model isn't available/attached
         camera.getWorldPosition(bulletPosition);
         // Move origin slightly forward from camera to avoid hitting self
         // ** FIX: Use CONFIG.PLAYER_RADIUS **
         bulletPosition.addScaledVector(bulletDirection, (CONFIG.PLAYER_RADIUS || 0.4) * 2);
         if (!gunViewModel || gunViewModel.parent !== camera) {
            // console.warn("Shoot: Gun view model not attached to camera, using fallback origin.");
         }
    }

    // Send shoot information to the server via Network module
    if (typeof Network !== 'undefined' && typeof Network.sendShoot === 'function') {
         Network.sendShoot({
             position: { x: bulletPosition.x, y: bulletPosition.y, z: bulletPosition.z },
             direction: { x: bulletDirection.x, y: bulletDirection.y, z: bulletDirection.z }
         });
    } else {
        console.error("Network.sendShoot function is missing!");
    }
}

/**
 * Spawns a bullet instance visually on the client.
 * @param {object} bulletData - Data for the bullet (ownerId, position, direction, bulletId).
 */
function spawnBullet(data) {
    // Check if Bullet class is defined
    if (typeof Bullet !== 'undefined') {
         bullets.push(new Bullet(data));
    } else {
         console.error("Bullet class is missing! Cannot spawn bullet.");
    }
}

/**
 * Updates all active bullets, handles movement, collision checks, and removal.
 * @param {number} deltaTime - Time elapsed since the last frame in seconds.
 */
function updateBullets(deltaTime) {
    // Iterate backwards for safe removal
    for (let i = bullets.length - 1; i >= 0; i--) {
        const bullet = bullets[i];

        // Update bullet position and check lifetime/bounds
        const isActive = bullet.update(deltaTime);

        if (!isActive) {
             bullet.remove(); // Remove visual representation
             bullets.splice(i, 1); // Remove from array
             continue; // Skip to next bullet
        }

        // --- Collision Check: Bullet vs Players ---
        const hitPlayerId = bullet.checkCollision(); // Check player collision (returns ID if hit)

        if (hitPlayerId) {
             console.log(`Bullet ${bullet.id} hit player ${hitPlayerId}`);
             // If the local player's bullet hit someone, tell the server
             if (bullet.ownerId === localPlayerId) {
                  Network.sendHit(hitPlayerId, CONFIG.BULLET_DAMAGE); // Use Network object
             }
             // Remove the bullet visually and logically regardless of owner
             bullet.remove();
             bullets.splice(i, 1);
             continue; // Stop processing this bullet
        }

         // --- Collision Check: Bullet vs Map (TODO) ---
         // TODO: Implement map collision detection (e.g., using raycasting or octree)
         // const didHitMap = checkMapCollision(bullet.mesh.position); // Placeholder
         // if (didHitMap) {
         //     console.log(`Bullet ${bullet.id} hit map.`);
         //     // Optional: Create impact effect
         //     if (typeof Effects !== 'undefined' && typeof Effects.createImpact === 'function') {
         //         Effects.createImpact(bullet.mesh.position);
         //     }
         //     bullet.remove();
         //     bullets.splice(i, 1);
         //     continue;
         // }
    }
}

/**
 * Updates the interpolation for remote players' visual representations.
 * @param {number} deltaTime - Time elapsed since the last frame in seconds.
 */
function updateRemotePlayers(deltaTime) {
     for (const id in players) {
        // Only update remote players that are instances of ClientPlayer
        if (id !== localPlayerId && players[id] instanceof ClientPlayer) {
            players[id].interpolate(deltaTime);
        }
     }
 }

 // --- Placeholder for Map Collision ---
 // function checkMapCollision(position) {
 //    // Implement actual map collision logic here
 //    // Raycast from bullet's previous position to current position against map mesh/geometry
 //    return false; // Placeholder
 // }


console.log("gameLogic.js loaded");
