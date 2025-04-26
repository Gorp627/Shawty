// docs/gameLogic.js

// Depends on: config.js, stateMachine.js, entities.js, input.js, network.js, uiManager.js
// Accesses globals: scene, camera, controls, clock, players, velocityY, isOnGround, localPlayerId, CONFIG, THREE, ClientPlayer, Network, Input, UIManager, stateMachine, mapMesh (Expected global)

// Create a reusable Raycaster instance for ground checks
const groundRaycaster = new THREE.Raycaster();
const downwardVector = new THREE.Vector3(0, -1, 0); // Reusable vector for down direction
const rayOriginOffset = 0.1; // How far above the theoretical feet position to start the ray
const groundCheckDistance = (CONFIG?.PLAYER_HEIGHT || 1.8) + rayOriginOffset + 0.3; // Increased buffer slightly

/**
 * Updates the local player's state, movement, and network synchronization.
 * @param {number} deltaTime Time since last frame.
 */
function updateLocalPlayer(deltaTime) {
    // --- Guard Clause: Ensure active play state and locked controls ---
    const isPlaying = stateMachine.is('playing');
    const isLocked = controls?.isLocked; // Crucial: Only update physics/movement when locked
    const localPlayerData = localPlayerId ? players[localPlayerId] : null;
    const isAlive = localPlayerData && localPlayerData.health > 0;

    // ** IMPORTANT: Stop processing if controls are not locked **
    if (!isPlaying || !isLocked || !localPlayerData || !isAlive) {
        // Reset vertical velocity when unlocked to prevent accumulating speed and sudden drop on re-lock.
        if (!isLocked) velocityY = 0;
        return;
    }

    // --- Get References ---
    const controlsObject = controls.getObject(); // Camera / Player Rig
    const playerState = localPlayerData; // Local data cache

    // --- Store Previous Position for Collision Revert ---
    const previousPosition = controlsObject.position.clone();

    // --- Vertical Physics & Ground Check ---
    let appliedGravity = true; // Assume gravity will be applied
    let onValidGround = false; // Start assuming not on ground
    const playerHeight = CONFIG.PLAYER_HEIGHT || 1.8;

    // 1. Check if mapMesh is ready for raycasting
    const isMapReady = mapMesh && mapMesh instanceof THREE.Object3D && mapMesh.children.length > 0 && mapMesh.parent === scene;
    if (isMapReady) {
        // Set raycaster origin slightly above player's feet position.
        const rayOrigin = controlsObject.position.clone();
        rayOrigin.y -= (playerHeight - rayOriginOffset);

        groundRaycaster.set(rayOrigin, downwardVector);
        groundRaycaster.far = groundCheckDistance;

        try {
            const intersects = groundRaycaster.intersectObject(mapMesh, true); // Recursive check
            // console.log("Intersects:", intersects.length > 0 ? intersects[0].distance : 'None'); // Debug intersections

            if (intersects.length > 0) {
                let closestDistance = Infinity;
                let groundPointY = -Infinity;
                let foundHitBelow = false;

                for (const intersect of intersects) {
                    // Find closest hit strictly below the ray origin
                    if (intersect.point && intersect.distance < closestDistance && intersect.point.y < rayOrigin.y) {
                        closestDistance = intersect.distance;
                        groundPointY = intersect.point.y;
                        foundHitBelow = true;
                    }
                }

                // Log intersection results
                // console.log(`Raycast Hits: ${intersects.length}, Found Below: ${foundHitBelow}, Closest Dist: ${closestDistance.toFixed(2)}, Ground Y: ${groundPointY.toFixed(2)}`);

                // Check if the closest valid hit is within tolerance
                if (foundHitBelow && closestDistance < groundCheckDistance - 0.1) { // Use slight buffer
                     onValidGround = true;
                     const actualGroundY = groundPointY;
                     const playerFeetY = controlsObject.position.y - playerHeight; // Where the player's feet currently are

                     // Snap to ground if currently at or below ground level
                     if (playerFeetY <= actualGroundY + 0.05) { // Increased tolerance slightly for snapping
                         // console.log(`Snapping to ground. Current Base Y: ${playerFeetY.toFixed(2)}, Ground Y: ${actualGroundY.toFixed(2)}`);
                         controlsObject.position.y = actualGroundY + playerHeight; // Snap player base to ground level
                         if (velocityY < 0) velocityY = 0; // Stop downward momentum on landing
                         appliedGravity = false; // Ground provides support, counteracting gravity
                     } else {
                         // console.log(`Above ground. Current Base Y: ${playerFeetY.toFixed(2)}, Ground Y: ${actualGroundY.toFixed(2)}`);
                     }
                }
                 // Else: No intersection close enough below was found
            } else {
                 // console.log("Raycast hit nothing within range.");
            }
        } catch(e) { console.error("Raycast error:", e); onValidGround = false; }
    } else {
        // console.warn("Ground check skipped: mapMesh not ready or invalid."); // Can be spammy
        onValidGround = false; // Cannot be on valid ground if map isn't ready
    }

    // 2. Apply Gravity if airborne
    if (appliedGravity) {
        velocityY -= CONFIG.GRAVITY * deltaTime;
    }

    // 3. Apply resulting vertical velocity to CONTROLS OBJECT (camera rig) position
    controlsObject.position.y += velocityY * deltaTime;

    // 4. Update global ground state flag
    isOnGround = onValidGround; // Set global flag AFTER calculations for this frame


    // --- Horizontal Movement (Based on Input & Camera Direction) ---
    const moveSpeed = Input.keys['ShiftLeft'] ? CONFIG.MOVEMENT_SPEED_SPRINTING : CONFIG.MOVEMENT_SPEED;
    const deltaSpeed = moveSpeed * deltaTime;
    const forward = new THREE.Vector3(); const right = new THREE.Vector3();
    camera.getWorldDirection(forward); forward.y=0; forward.normalize();
    right.crossVectors(camera.up, forward).normalize();
    let moveDirection = new THREE.Vector3(0,0,0);

    // *** Apply INVERTED A/D ***
    if (Input.keys['KeyW']) { moveDirection.add(forward); }
    if (Input.keys['KeyS']) { moveDirection.sub(forward); }
    if (Input.keys['KeyA']) { moveDirection.add(right); } // A moves Right
    if (Input.keys['KeyD']) { moveDirection.sub(right); } // D moves Left

    if (moveDirection.lengthSq() > 0) {
        moveDirection.normalize();
        // TODO: Implement horizontal collision detection (e.g., raycast sideways, spherecast, or simple revert)
        controlsObject.position.addScaledVector(moveDirection, deltaSpeed);
    }

    // --- Dash Movement ---
    if (Input.isDashing) { controlsObject.position.addScaledVector(Input.dashDirection, CONFIG.DASH_FORCE * deltaTime); }


    // --- Collision (Player-Player - Basic Horizontal Revert) ---
    const currentPosition = controlsObject.position;
    const collisionRadius = CONFIG.PLAYER_COLLISION_RADIUS || CONFIG.PLAYER_RADIUS || 0.4;
    for (const id in players) { if (id!==localPlayerId&&players[id]instanceof ClientPlayer&&players[id].mesh?.visible&&players[id].mesh.position){ const oM=players[id].mesh; const dXZ=new THREE.Vector2(currentPosition.x-oM.position.x, currentPosition.z-oM.position.z).length(); if(dXZ<collisionRadius*2){ controlsObject.position.x=previousPosition.x; controlsObject.position.z=previousPosition.z; break; } } }


    // --- Void Check (Final safety net after all movement applied) ---
    if (controlsObject.position.y < CONFIG.VOID_Y_LEVEL && playerState.health > 0) {
        console.log("Player fell into void."); playerState.health = 0;
        if(UIManager){ UIManager.updateHealthBar(0); UIManager.showKillMessage("Fell."); }
        if(Network) Network.sendVoidDeath();
    }


    // --- Recoil/View Model Update REMOVED ---


    // --- Send Network Updates ---
    const logicalPosition = controlsObject.position.clone(); logicalPosition.y -= CONFIG.PLAYER_HEIGHT;
    const currentRotation = new THREE.Euler().setFromQuaternion(controlsObject.quaternion, 'YXZ');
    const currentRotationY = currentRotation.y; const lastSentState = playerState;
    const posThrSq = CONFIG.PLAYER_MOVE_THRESHOLD_SQ || 0.0001; const rotThr = 0.01;
    const posChanged = logicalPosition.distanceToSquared(new THREE.Vector3(lastSentState?.x??0, lastSentState?.y??0, lastSentState?.z??0)) > posThrSq;
    const rotChanged = Math.abs(currentRotationY - (lastSentState?.rotationY ?? 0)) > rotThr;

    if (posChanged || rotChanged) {
        if(lastSentState){lastSentState.x=logicalPosition.x; lastSentState.y=logicalPosition.y; lastSentState.z=logicalPosition.z; lastSentState.rotationY=currentRotationY;}
        if(Network)Network.sendPlayerUpdate({x:logicalPosition.x, y:logicalPosition.y, z:logicalPosition.z, rotationY:currentRotationY});
    }
} // End updateLocalPlayer


// --- REMOVED SHOOTING RELATED FUNCTIONS ---


/** Updates remote players */
function updateRemotePlayers(deltaTime) {
    for (const id in players) {
        if (id !== localPlayerId && players[id] instanceof ClientPlayer) {
            players[id].interpolate(deltaTime);
        }
    }
}

console.log("gameLogic.js loaded (Simplified - No Shooting, Raycast Ground Refined)");
