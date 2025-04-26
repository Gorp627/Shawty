// docs/gameLogic.js

// Depends on: config.js, stateMachine.js, entities.js, input.js, network.js, uiManager.js
// NO LONGER depends on: effects.js (directly)
// Accesses globals: scene, camera, controls, clock, players, velocityY, isOnGround, localPlayerId, CONFIG, THREE, ClientPlayer, Network, Input, UIManager, stateMachine, mapMesh (NOW EXPECTED TO BE GLOBAL)

// Create a reusable Raycaster instance for ground checks
const groundRaycaster = new THREE.Raycaster();
const downwardVector = new THREE.Vector3(0, -1, 0); // Reusable vector for down direction
const rayOriginOffset = 0.1; // How far above the theoretical feet position to start the ray
const groundCheckDistance = (CONFIG?.PLAYER_HEIGHT || 1.8) + rayOriginOffset + 0.2; // Ray distance: height + offset + buffer

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
    if (!isPlaying || !isLocked || !localPlayerData || !isAlive) return;

    // --- Get Objects ---
    const controlsObject = controls.getObject();
    const playerState = localPlayerData;

    // --- Movement Calculation ---
    const moveSpeed = Input.keys['ShiftLeft'] ? CONFIG.MOVEMENT_SPEED_SPRINTING : CONFIG.MOVEMENT_SPEED;
    const deltaSpeed = moveSpeed * deltaTime;
    const previousPosition = controlsObject.position.clone();

    // --- Vertical Movement & Raycasting Ground Check ---
    let appliedGravity = true; // Assume gravity will be applied
    let onValidGround = false; // Start assuming not on ground

    if (mapMesh && mapMesh.children.length > 0) { // Check if mapMesh is loaded and has children to intersect
        // Set ray origin slightly above the player's feet position
        const rayOrigin = controlsObject.position.clone();
        rayOrigin.y -= (CONFIG.PLAYER_HEIGHT - rayOriginOffset); // Adjust Y to be near feet

        groundRaycaster.set(rayOrigin, downwardVector);
        groundRaycaster.far = groundCheckDistance; // Set max distance

        // Intersect with the map mesh (recursive check)
        const intersects = groundRaycaster.intersectObject(mapMesh, true);

        if (intersects.length > 0) {
            // Find the closest valid intersection point below the ray origin
            let closestDistance = Infinity;
            let groundPointY = -Infinity;

            for (const intersect of intersects) {
                if (intersect.point.y < rayOrigin.y && intersect.distance < closestDistance) {
                    closestDistance = intersect.distance;
                    groundPointY = intersect.point.y;
                }
            }

            // If a valid ground point was found close enough
            if (closestDistance < groundCheckDistance - 0.1) { // Use a slightly smaller check distance here to avoid floating
                 actualGroundY = groundPointY;
                 onValidGround = true;

                 // If player is penetrating or exactly on the detected ground
                 const playerFeetY = controlsObject.position.y - CONFIG.PLAYER_HEIGHT;
                 if (playerFeetY <= actualGroundY + 0.01) { // Allow tiny tolerance
                     controlsObject.position.y = actualGroundY + CONFIG.PLAYER_HEIGHT; // Snap player feet to ground
                     if (velocityY < 0) velocityY = 0; // Reset downward velocity if landing
                     appliedGravity = false; // Gravity is countered by ground force
                 }
            }
        }
    } else {
         // Fallback or warning if map mesh isn't ready for raycasting
         // console.warn("Ground check skipped: mapMesh not ready."); // Can be spammy
         // Simple ground check could be put here if needed, but may allow walking on air
         onValidGround = false;
    }

    // Apply Gravity if not snapped to ground
    if (appliedGravity) {
         velocityY -= CONFIG.GRAVITY * deltaTime;
    }
    // Apply vertical velocity (gravity or jump arc)
    controlsObject.position.y += velocityY * deltaTime;

    // Update global isOnGround flag based on raycast result
    isOnGround = onValidGround;

    // --- Horizontal Movement (Based on Input & Camera Direction) ---
    const forward = new THREE.Vector3(); const right = new THREE.Vector3();
    camera.getWorldDirection(forward); forward.y = 0; forward.normalize();
    right.crossVectors(camera.up, forward).normalize();

    let moveDirection = new THREE.Vector3(0, 0, 0);
    // *** INVERTED A/D ***
    if (Input.keys['KeyW']) { moveDirection.add(forward); }
    if (Input.keys['KeyS']) { moveDirection.sub(forward); }
    if (Input.keys['KeyA']) { moveDirection.add(right); } // A now moves right
    if (Input.keys['KeyD']) { moveDirection.sub(right); } // D now moves left

    if (moveDirection.lengthSq() > 0) {
        moveDirection.normalize();
        // TODO: Implement horizontal collision check with map/obstacles before applying movement
        controlsObject.position.addScaledVector(moveDirection, deltaSpeed);
    }

    // --- Dash Movement ---
    if (Input.isDashing) { controlsObject.position.addScaledVector(Input.dashDirection, CONFIG.DASH_FORCE * deltaTime); }

    // --- Collision (Player-Player - Basic Horizontal) ---
    const currentPosition = controlsObject.position;
    const collisionRadius = CONFIG.PLAYER_COLLISION_RADIUS || CONFIG.PLAYER_RADIUS || 0.4;
    for (const id in players) { if (id!==localPlayerId&&players[id]instanceof ClientPlayer&&players[id].mesh?.visible&&players[id].mesh.position){ const oM=players[id].mesh; const dXZ=new THREE.Vector2(currentPosition.x-oM.position.x, currentPosition.z-oM.position.z).length(); if(dXZ<collisionRadius*2){ controlsObject.position.x=previousPosition.x; controlsObject.position.z=previousPosition.z; break; } } }


    // --- Void Check (Final safety net after all movement) ---
    if (controlsObject.position.y < CONFIG.VOID_Y_LEVEL && playerState.health > 0) {
        console.log("Player fell into void."); playerState.health = 0;
        if(UIManager){ UIManager.updateHealthBar(0); UIManager.showKillMessage("Fell."); }
        if(Network) Network.sendVoidDeath();
    }


    // --- Network Updates ---
    const logicalPosition = controlsObject.position.clone(); logicalPosition.y -= CONFIG.PLAYER_HEIGHT;
    const currentRotation = new THREE.Euler().setFromQuaternion(controlsObject.quaternion, 'YXZ');
    const currentRotationY = currentRotation.y; const lastSentState = playerState;
    const posThresholdSq = CONFIG.PLAYER_MOVE_THRESHOLD_SQ || 0.0001; const rotThreshold = 0.01;
    const posChanged = logicalPosition.distanceToSquared(new THREE.Vector3(lastSentState?.x??0, lastSentState?.y??0, lastSentState?.z??0)) > posThresholdSq;
    const rotChanged = Math.abs(currentRotationY - (lastSentState?.rotationY ?? 0)) > rotThreshold;
    if (posChanged || rotChanged) { if(lastSentState){lastSentState.x=logicalPosition.x; lastSentState.y=logicalPosition.y; lastSentState.z=logicalPosition.z; lastSentState.rotationY=currentRotationY;} if(Network)Network.sendPlayerUpdate({x:logicalPosition.x, y:logicalPosition.y, z:logicalPosition.z, rotationY:currentRotationY}); }
}


// --- REMOVED SHOOTING RELATED FUNCTIONS ---
// function shoot() { ... }
// function spawnBullet(data) { ... }
// function updateBullets(deltaTime) { ... }


/** Updates remote players */
function updateRemotePlayers(deltaTime) {
    for (const id in players) {
        if (id !== localPlayerId && players[id] instanceof ClientPlayer) {
            players[id].interpolate(deltaTime); // Pass deltaTime
        }
    }
}


console.log("gameLogic.js loaded (Simplified - No Shooting, Raycast Ground)");
