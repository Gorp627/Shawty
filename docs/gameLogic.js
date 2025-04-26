// docs/gameLogic.js

// Depends on: config.js, stateMachine.js, entities.js, input.js, network.js, uiManager.js
// Accesses globals: scene, camera, controls, clock, players, velocityY, isOnGround, localPlayerId, CONFIG, THREE, ClientPlayer, Network, Input, UIManager, stateMachine, mapMesh (Expected global)

// Create a reusable Raycaster instance for ground checks
const groundRaycaster = new THREE.Raycaster();
const downwardVector = new THREE.Vector3(0, -1, 0);
const rayOriginOffset = 0.1; // Start ray slightly above theoretical feet
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
        // Optional: Apply gravity even when unlocked? This prevents instant freezing mid-air on Esc.
        // if (isPlaying && localPlayerData && isAlive && camera) { // Check if basic objects exist
        //     velocityY -= CONFIG.GRAVITY * deltaTime;
        //     camera.position.y += velocityY * deltaTime; // Apply gravity directly to camera Y if controlsObject isn't available/reliable unlocked
        //     // Basic void check even when unlocked
        //     if (camera.position.y < CONFIG.VOID_Y_LEVEL && localPlayerData.health > 0) {
        //         // Don't send network event if unlocked maybe? Or just handle locally?
        //         // This state needs careful design - for now, just stop processing.
        //     }
        // }
        return;
    }

    // --- Get References ---
    const controlsObject = controls.getObject();
    const playerState = localPlayerData;
    const previousPosition = controlsObject.position.clone();

    // --- Vertical Physics & Ground Check ---
    let appliedGravity = true;
    let onValidGround = false;

    // 1. Check if mapMesh is ready for raycasting
    const isMapReady = mapMesh && mapMesh instanceof THREE.Object3D && mapMesh.children.length > 0 && mapMesh.parent === scene;
    if (isMapReady) {
        // Set raycaster origin slightly above player's feet
        const rayOrigin = controlsObject.position.clone();
        rayOrigin.y -= (CONFIG.PLAYER_HEIGHT - rayOriginOffset);

        groundRaycaster.set(rayOrigin, downwardVector);
        groundRaycaster.far = groundCheckDistance;

        try {
            const intersects = groundRaycaster.intersectObject(mapMesh, true); // Recursive check
            // console.log("Intersects:", intersects.length > 0 ? intersects[0].distance : 'None'); // Debug intersections

            if (intersects.length > 0) {
                let closestDistance = Infinity;
                let groundPointY = -Infinity;
                for (const intersect of intersects) {
                    if (intersect.point && intersect.distance < closestDistance && intersect.point.y < rayOrigin.y) {
                        closestDistance = intersect.distance;
                        groundPointY = intersect.point.y;
                    }
                }

                // Check if the closest valid hit is within tolerance
                if (closestDistance < groundCheckDistance - 0.1) {
                     onValidGround = true;
                     const actualGroundY = groundPointY;
                     const playerFeetY = controlsObject.position.y - CONFIG.PLAYER_HEIGHT;

                     // Snap to ground if currently at or below ground level
                     if (playerFeetY <= actualGroundY + 0.02) { // Slightly larger tolerance for snapping
                         // console.log("Snapping to ground at Y:", actualGroundY + CONFIG.PLAYER_HEIGHT);
                         controlsObject.position.y = actualGroundY + CONFIG.PLAYER_HEIGHT;
                         if (velocityY < 0) velocityY = 0;
                         appliedGravity = false;
                     }
                }
            }
        } catch(e) { console.error("Raycast error:", e); onValidGround = false; }
    } else {
        // console.warn("Ground check skipped: mapMesh not ready."); // Log only if mapMesh exists but isn't valid/ready
        onValidGround = false;
    }

    // 2. Apply Gravity if airborne
    if (appliedGravity) {
        velocityY -= CONFIG.GRAVITY * deltaTime;
    }

    // 3. Apply vertical velocity change to position
    controlsObject.position.y += velocityY * deltaTime;

    // 4. Update global flag
    isOnGround = onValidGround; // Set global flag AFTER calculations for this frame

    // --- Horizontal Movement (Based on Input & Camera Direction) ---
    const moveSpeed = Input.keys['ShiftLeft'] ? CONFIG.MOVEMENT_SPEED_SPRINTING : CONFIG.MOVEMENT_SPEED;
    const deltaSpeed = moveSpeed * deltaTime;
    const forward = new THREE.Vector3(); const right = new THREE.Vector3();
    camera.getWorldDirection(forward); forward.y=0; forward.normalize();
    right.crossVectors(camera.up, forward).normalize();
    let moveDirection = new THREE.Vector3(0,0,0);
    if(Input.keys['KeyW']){moveDirection.add(forward);} if(Input.keys['KeyS']){moveDirection.sub(forward);}
    if(Input.keys['KeyA']){moveDirection.add(right);} // A=Right (Inverted)
    if(Input.keys['KeyD']){moveDirection.sub(right);} // D=Left (Inverted)
    if(moveDirection.lengthSq()>0){moveDirection.normalize(); controlsObject.position.addScaledVector(moveDirection, deltaSpeed);}

    // --- Dash Movement ---
    if (Input.isDashing) { controlsObject.position.addScaledVector(Input.dashDirection, CONFIG.DASH_FORCE * deltaTime); }


    // --- Collision (Player-Player - Basic Horizontal Revert) ---
    const currentPosition = controlsObject.position;
    const collisionRadius = CONFIG.PLAYER_COLLISION_RADIUS || CONFIG.PLAYER_RADIUS || 0.4;
    for (const id in players) { if (id!==localPlayerId&&players[id]instanceof ClientPlayer&&players[id].mesh?.visible&&players[id].mesh.position){ const oM=players[id].mesh; const dXZ=new THREE.Vector2(currentPosition.x-oM.position.x, currentPosition.z-oM.position.z).length(); if(dXZ<collisionRadius*2){ controlsObject.position.x=previousPosition.x; controlsObject.position.z=previousPosition.z; break; } } }


    // --- Void Check (Final safety net) ---
    if (controlsObject.position.y < CONFIG.VOID_Y_LEVEL && playerState.health > 0) {
        console.log("Player fell into void."); playerState.health = 0;
        if(UIManager){ UIManager.updateHealthBar(0); UIManager.showKillMessage("Fell."); }
        if(Network) Network.sendVoidDeath();
    }


    // --- Network Updates ---
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
}


// --- REMOVED SHOOTING RELATED FUNCTIONS ---


/** Updates remote players interpolation */
function updateRemotePlayers(deltaTime) {
    for (const id in players) {
        if (id !== localPlayerId && players[id] instanceof ClientPlayer) {
            players[id].interpolate(deltaTime);
        }
    }
}

console.log("gameLogic.js loaded (Simplified - No Shooting, Raycast Ground)");
