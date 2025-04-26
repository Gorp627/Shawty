// docs/gameLogic.js

// Depends on: config.js, stateMachine.js, entities.js, input.js, network.js, uiManager.js
// Accesses globals: scene, camera, controls, clock, players, velocityY, isOnGround, localPlayerId, CONFIG, THREE, ClientPlayer, Network, Input, UIManager, stateMachine, mapMesh

const groundRaycaster = new THREE.Raycaster();
const downwardVector = new THREE.Vector3(0, -1, 0);
const rayOriginOffset = 0.1; // Start ray slightly above theoretical feet
const groundCheckDistance = (CONFIG?.PLAYER_HEIGHT || 1.8) + rayOriginOffset + 0.5; // Increased buffer further

/**
 * Updates the local player's state, movement, and network synchronization.
 * @param {number} deltaTime Time since last frame.
 */
function updateLocalPlayer(deltaTime) {
    // --- Guard Clause: Ensure active play state and locked controls ---
    const isPlaying = stateMachine.is('playing');
    const isLocked = controls?.isLocked; // Check if controls exist and are locked
    const localPlayerData = localPlayerId ? players[localPlayerId] : null;
    const isAlive = localPlayerData && localPlayerData.health > 0;

    // ** IMPORTANT: Only allow input/network updates when locked **
    // We will calculate gravity separately if needed when unlocked.
    if (!isPlaying || !localPlayerData || !isAlive) return; // Exit if not playing or dead

    const controlsObject = controls?.getObject(); // Get controls object, might be null if controls don't exist
    if (!controlsObject) return; // Cannot proceed without controls object

    // Log map mesh status at the start of locked update
    // if(isLocked) console.log("Map Mesh Check in Update:", mapMesh ? `Parent is Scene: ${mapMesh.parent === scene}` : 'No Map Mesh Object');

    // --- Store Previous Position for Collision Revert ---
    const previousPosition = controlsObject.position.clone();

    // --- Vertical Physics & Ground Check ---
    let appliedGravity = true;
    let onValidGround = false;
    const playerHeight = CONFIG.PLAYER_HEIGHT || 1.8;

    // 1. Check Ground using Raycasting (only if map is ready and controls are locked)
    if (isLocked && mapMesh && mapMesh instanceof THREE.Object3D && mapMesh.children.length > 0 && mapMesh.parent === scene) {
        // Ray origin: Start from slightly above the player's *feet* position.
        const rayOrigin = controlsObject.position.clone();
        rayOrigin.y -= (playerHeight - rayOriginOffset); // Go down by height, then up by offset

        groundRaycaster.set(rayOrigin, downwardVector);
        groundRaycaster.far = groundCheckDistance;

        // Log raycaster details
        // console.log(`Raycasting from Y: ${rayOrigin.y.toFixed(2)} down ${groundCheckDistance.toFixed(2)}`);

        try {
            const intersects = groundRaycaster.intersectObject(mapMesh, true); // Recursive check

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
                     const playerBaseY = controlsObject.position.y - playerHeight; // Where the player's feet currently are

                     // Snap to ground if currently at or below ground level
                     if (playerBaseY <= actualGroundY + 0.05) { // Increased tolerance slightly
                         // console.log(`Snapping to ground. Current Base Y: ${playerBaseY.toFixed(2)}, Ground Y: ${actualGroundY.toFixed(2)}`);
                         controlsObject.position.y = actualGroundY + playerHeight;
                         if (velocityY < 0) velocityY = 0; // Stop downward momentum
                         appliedGravity = false; // Ground supports player
                     } else {
                         // console.log(`Above ground. Current Base Y: ${playerBaseY.toFixed(2)}, Ground Y: ${actualGroundY.toFixed(2)}`);
                     }
                }
            } else {
                 // console.log("Raycast hit nothing within range.");
            }
        } catch(e) { console.error("Raycast error:", e); onValidGround = false; }
    } else if (isLocked) { // Log if map isn't ready only when locked (when we expect it)
        console.warn("Ground check skipped: mapMesh not ready or invalid.");
        onValidGround = false;
    } else {
        // When unlocked, don't raycast, assume not on ground for this check's purpose
        onValidGround = false;
    }

    // 2. Apply Gravity if airborne OR if controls unlocked
    if (appliedGravity || !isLocked) { // Apply gravity if not snapped OR if unlocked
        velocityY -= CONFIG.GRAVITY * deltaTime;
    }

    // 3. Apply resulting vertical velocity to CONTROLS OBJECT (camera rig)
    // Only apply if locked, otherwise camera position is frozen by PointerLockControls when unlocked
    if (isLocked) {
        controlsObject.position.y += velocityY * deltaTime;
    } else {
        // If unlocked, we might want gravity to affect a different object if the player should still fall visually
        // For now, vertical motion stops when unlocked due to the controls.
        velocityY=0; // Reset velocity when unlocked to prevent sudden drop on re-lock? Or let it accumulate? Resetting is safer for now.
    }


    // 4. Update global ground state flag (reflects status during locked state)
    isOnGround = onValidGround;


    // --- Horizontal Movement & Dash (ONLY IF LOCKED) ---
    if (isLocked) {
        const moveSpeed = Input.keys['ShiftLeft'] ? CONFIG.MOVEMENT_SPEED_SPRINTING : CONFIG.MOVEMENT_SPEED;
        const deltaSpeed = moveSpeed * deltaTime;
        const forward = new THREE.Vector3(); const right = new THREE.Vector3();
        camera.getWorldDirection(forward); forward.y=0; forward.normalize();
        right.crossVectors(camera.up, forward).normalize();
        let moveDirection = new THREE.Vector3(0,0,0);
        if(Input.keys['KeyW']){moveDirection.add(forward);} if(Input.keys['KeyS']){moveDirection.sub(forward);}
        if(Input.keys['KeyA']){moveDirection.add(right);} // Inverted A = Right
        if(Input.keys['KeyD']){moveDirection.sub(right);} // Inverted D = Left
        if(moveDirection.lengthSq()>0){moveDirection.normalize(); controlsObject.position.addScaledVector(moveDirection, deltaSpeed);}
        if (Input.isDashing) { controlsObject.position.addScaledVector(Input.dashDirection, CONFIG.DASH_FORCE * deltaTime); }

        // --- Collision (Player-Player - Basic Horizontal Revert - ONLY IF LOCKED) ---
        const currentPosition = controlsObject.position;
        const collisionRadius = CONFIG.PLAYER_COLLISION_RADIUS || CONFIG.PLAYER_RADIUS || 0.4;
        for (const id in players) { if (id!==localPlayerId&&players[id]instanceof ClientPlayer&&players[id].mesh?.visible&&players[id].mesh.position){ const oM=players[id].mesh; const dXZ=new THREE.Vector2(currentPosition.x-oM.position.x, currentPosition.z-oM.position.z).length(); if(dXZ<collisionRadius*2){ controlsObject.position.x=previousPosition.x; controlsObject.position.z=previousPosition.z; break; } } }

        // --- Void Check (ONLY IF LOCKED) ---
        if (controlsObject.position.y < CONFIG.VOID_Y_LEVEL && playerState.health > 0) {
            console.log("Player fell into void."); playerState.health = 0;
            if(UIManager){ UIManager.updateHealthBar(0); UIManager.showKillMessage("Fell."); }
            if(Network) Network.sendVoidDeath();
        }

        // --- Send Network Updates (ONLY IF LOCKED) ---
        const logicalPosition = controlsObject.position.clone(); logicalPosition.y -= CONFIG.PLAYER_HEIGHT;
        const currentRotation = new THREE.Euler().setFromQuaternion(controlsObject.quaternion, 'YXZ'); const currentRotationY = currentRotation.y;
        const lastSentState = playerState;
        const posThrSq = CONFIG.PLAYER_MOVE_THRESHOLD_SQ || 0.0001; const rotThr = 0.01;
        const posChanged = logicalPosition.distanceToSquared(new THREE.Vector3(lastSentState?.x??0, lastSentState?.y??0, lastSentState?.z??0)) > posThrSq;
        const rotChanged = Math.abs(currentRotationY - (lastSentState?.rotationY ?? 0)) > rotThr;
        if (posChanged || rotChanged) { if(lastSentState){lastSentState.x=logicalPosition.x; lastSentState.y=logicalPosition.y; lastSentState.z=logicalPosition.z; lastSentState.rotationY=currentRotationY;} if(Network)Network.sendPlayerUpdate({x:logicalPosition.x, y:logicalPosition.y, z:logicalPosition.z, rotationY:currentRotationY}); }
    } // End if(isLocked) block for movement/collisions/network


} // End updateLocalPlayer


// --- SHOOTING FUNCTIONS REMOVED ---


/** Updates remote players */
function updateRemotePlayers(deltaTime) {
    for (const id in players) {
        if (id !== localPlayerId && players[id] instanceof ClientPlayer) {
            players[id].interpolate(deltaTime);
        }
    }
}

console.log("gameLogic.js loaded (Simplified - No Shooting, Raycast Ground Refined)");
