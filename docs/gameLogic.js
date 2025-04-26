// docs/gameLogic.js

// Depends on: config.js, stateMachine.js, entities.js, input.js, effects.js, network.js, uiManager.js
// Accesses globals: scene, camera, controls, clock, players, velocityY, isOnGround, localPlayerId, CONFIG, THREE, ClientPlayer, Network, Effects, Input, UIManager, stateMachine, mapMesh (NOW EXPECTED TO BE GLOBAL)

// Create a reusable Raycaster instance
const groundRaycaster = new THREE.Raycaster();
const downwardVector = new THREE.Vector3(0, -1, 0); // Reusable vector for down direction
const rayOriginOffset = 0.1; // How far above the feet to start the ray
const groundCheckDistance = CONFIG.PLAYER_HEIGHT + rayOriginOffset + 0.2; // Max distance to check for ground

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

    // --- Vertical Movement (Gravity Applies First) ---
    // Apply gravity UNLESS determined to be on ground later
    let appliedGravity = true; // Assume gravity applies initially
    let onValidGround = false; // Flag to check if ground found is valid

    // --- Raycasting Ground Check ---
    let actualGroundY = -Infinity; // Where the ground actually is

    if (mapMesh) { // Only raycast if the map mesh is loaded
        // Set ray origin slightly above the player's potential feet position this frame
        const rayOrigin = controlsObject.position.clone();
        rayOrigin.y += rayOriginOffset; // Start slightly above feet

        groundRaycaster.set(rayOrigin, downwardVector);
        const intersects = groundRaycaster.intersectObject(mapMesh, true); // Check map recursively

        if (intersects.length > 0) {
            // Find the closest intersection point directly below the player
            let closestIntersection = null;
            for (const intersect of intersects) {
                // Ensure the intersection is below the ray origin and within reasonable distance
                if (intersect.point.y < rayOrigin.y && intersect.distance < groundCheckDistance) {
                    if (!closestIntersection || intersect.distance < closestIntersection.distance) {
                        closestIntersection = intersect;
                    }
                }
            }

            if (closestIntersection) {
                actualGroundY = closestIntersection.point.y; // The precise Y coord of the ground
                onValidGround = true;
                // If player is on or below the ground after gravity calculation
                if (controlsObject.position.y <= actualGroundY + CONFIG.PLAYER_HEIGHT) {
                     controlsObject.position.y = actualGroundY + CONFIG.PLAYER_HEIGHT; // Snap to ground
                     if (velocityY < 0) velocityY = 0; // Reset downward velocity
                     appliedGravity = false; // Don't apply gravity if snapped/on ground
                }
            }
        }
    } else {
         // Fallback if map isn't loaded: Use basic Y=0 check (or just let gravity run)
         const simpleGroundY = 0;
         if (controlsObject.position.y < simpleGroundY + CONFIG.PLAYER_HEIGHT) {
            // console.warn("Map mesh not ready, using simple ground check."); // Less spammy
            // controlsObject.position.y = simpleGroundY + CONFIG.PLAYER_HEIGHT;
            // if (velocityY < 0) velocityY = 0;
            // appliedGravity = false; // Consider not applying gravity if below Y=0?
            onValidGround = false; // Treat as not on valid ground if map missing
         }
    }

    // Apply Gravity if not on ground (or if check failed)
    if (appliedGravity) {
         velocityY -= CONFIG.GRAVITY * deltaTime;
    }
    // Apply vertical velocity AFTER ground check adjustments might have happened
    controlsObject.position.y += velocityY * deltaTime;

    // Update isOnGround global flag based on valid ground check
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
        controlsObject.position.addScaledVector(moveDirection, deltaSpeed);
        // TODO: Add horizontal collision check here (e.g., raycast before move or check after move and revert)
    }

    // --- Dash Movement ---
    if (Input.isDashing) { controlsObject.position.addScaledVector(Input.dashDirection, CONFIG.DASH_FORCE * deltaTime); }

    // --- Collision (Player-Player) ---
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
function updateRemotePlayers(deltaTime) { for(const id in players){if(id!==localPlayerId&&players[id]instanceof ClientPlayer)players[id].interpolate(dT);}} // dT needs defining or pass deltaTime

// Corrected updateRemotePlayers
function updateRemotePlayers(deltaTime) { // Use deltaTime passed in
    for (const id in players) {
        if (id !== localPlayerId && players[id] instanceof ClientPlayer) {
            players[id].interpolate(deltaTime); // Pass deltaTime to interpolate
        }
    }
}


console.log("gameLogic.js loaded (Simplified - No Shooting, Raycast Ground)");
