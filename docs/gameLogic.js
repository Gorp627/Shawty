// docs/gameLogic.js

// Depends on: config.js, stateMachine.js, entities.js, input.js, network.js, uiManager.js
// Accesses globals: scene, camera, controls, clock, players, velocityY, isOnGround, localPlayerId, CONFIG, THREE, ClientPlayer, Network, Input, UIManager, stateMachine, mapMesh

// Raycaster for the new ground check method
const multiGroundRaycaster = new THREE.Raycaster();
const multiDownwardVector = new THREE.Vector3(0, -1, 0);
const multiGroundCheckDistance = 0.2; // How far below the points to check - VERY SHORT

/**
 * Updates the local player's state, movement, and network synchronization.
 * Uses MULTIPLE short raycasts from player base for ground check.
 * @param {number} deltaTime Time since last frame.
 */
function updateLocalPlayer(deltaTime) {
    // --- Guard Clause ---
    const isPlaying = stateMachine.is('playing');
    const isLocked = controls?.isLocked;
    const localPlayerData = localPlayerId ? players[localPlayerId] : null;
    const isAlive = localPlayerData && localPlayerData.health > 0;
    if (!isPlaying || !isLocked || !localPlayerData || !isAlive) {
        if (!isLocked) velocityY = 0; // Reset velocity if unlocked to prevent drop
        return;
    }

    // --- Get References ---
    const controlsObject = controls.getObject();
    const playerState = localPlayerData;
    const previousPosition = controlsObject.position.clone();
    const playerHeight = CONFIG.PLAYER_HEIGHT || 1.8;
    const playerRadius = CONFIG.PLAYER_RADIUS || 0.4;

    // --- Vertical Physics & Multi-Ray Ground Check ---
    let appliedGravity = true;
    let onValidGround = false;
    let highestGroundY = -Infinity; // Track the highest ground point found under the player

    // 1. Check Ground using Multiple Raycasts (if map is ready)
    const isMapReady = mapMesh && mapMesh instanceof THREE.Object3D && mapMesh.children.length > 0 && mapMesh.parent === scene;
    if (isMapReady) {
        const playerBaseY = controlsObject.position.y - playerHeight; // Y position of player's feet
        const currentX = controlsObject.position.x;
        const currentZ = controlsObject.position.z;

        // Define points around the player base to cast from (slightly above the base)
        const rayOrigins = [
            new THREE.Vector3(currentX, playerBaseY + 0.1, currentZ), // Center slightly up
            new THREE.Vector3(currentX + playerRadius * 0.5, playerBaseY + 0.1, currentZ), // Right
            new THREE.Vector3(currentX - playerRadius * 0.5, playerBaseY + 0.1, currentZ), // Left
            new THREE.Vector3(currentX, playerBaseY + 0.1, currentZ + playerRadius * 0.5), // Forward
            new THREE.Vector3(currentX, playerBaseY + 0.1, currentZ - playerRadius * 0.5)  // Back
        ];

        let foundHit = false;
        for (const origin of rayOrigins) {
             multiGroundRaycaster.set(origin, multiDownwardVector);
             multiGroundRaycaster.far = multiGroundCheckDistance; // Short check distance

             try {
                 const intersects = multiGroundRaycaster.intersectObject(mapMesh, true);
                 if (intersects.length > 0) {
                     // Find the closest hit for *this specific ray*
                     let closestHitDist = Infinity;
                     let hitPointY = -Infinity;
                     for(const hit of intersects) {
                         if (hit.distance < closestHitDist) {
                             closestHitDist = hit.distance;
                             hitPointY = hit.point.y;
                         }
                     }
                     // If a hit was found by this ray within the short distance
                     if (closestHitDist < multiGroundCheckDistance) {
                         foundHit = true; // Mark that at least one ray hit ground
                         highestGroundY = Math.max(highestGroundY, hitPointY); // Keep track of the highest ground point found
                     }
                 }
             } catch (e) { console.error("Raycast error:", e); foundHit = false; break; } // Stop checking on error
        } // End loop through ray origins

        // Determine if on ground based on hits
        if (foundHit) {
            onValidGround = true;
            // Snap player UP to the highest detected ground level to prevent sinking
            if (playerBaseY <= highestGroundY + 0.05) { // If feet are at or slightly below highest point
                controlsObject.position.y = highestGroundY + playerHeight; // Set base exactly on highest ground
                if (velocityY < 0) velocityY = 0; // Reset downward velocity
                appliedGravity = false; // Ground supports player
            }
        }

    } else { // Map not ready
        onValidGround = false;
    }

    // 2. Apply Gravity if airborne
    if (appliedGravity) {
        velocityY -= CONFIG.GRAVITY * deltaTime;
    }

    // 3. Apply resulting vertical velocity
    controlsObject.position.y += velocityY * deltaTime;

    // 4. Update global ground state flag
    isOnGround = onValidGround;

    // --- Horizontal Movement (Based on Input & Camera Direction - Inverted A/D) ---
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


    // --- Send Network Updates ---
    const logicalPosition = controlsObject.position.clone(); logicalPosition.y -= playerHeight; // Use calculated height
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

console.log("gameLogic.js loaded (Simplified - No Shooting, Multi-Raycast Ground)");
