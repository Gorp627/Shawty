// docs/gameLogic.js

// Depends on: config.js, stateMachine.js, entities.js, input.js, network.js, uiManager.js
// Accesses globals: camera, controls, players, localPlayerId, CONFIG, THREE, ClientPlayer, Network, Input, UIManager, stateMachine
// Controls HORIZONTAL movement, Dash, Player-Player collision avoidance, and Network updates.
// NO vertical physics (gravity, jump, ground check, void check).

/**
 * Updates the local player's state, HORIZONTAL movement, dash, collision, and network sync.
 * @param {number} deltaTime Time since last frame.
 */
function updateLocalPlayer(deltaTime) {
    // --- Guard Clause: Ensure active play state and locked controls ---
    const isPlaying = typeof stateMachine !== 'undefined' && stateMachine.is('playing');
    const isLocked = typeof controls !== 'undefined' && controls?.isLocked;
    const localPlayerData = localPlayerId ? players[localPlayerId] : null;
    const isAlive = localPlayerData && localPlayerData.health > 0;

    if (!isPlaying || !isLocked || !localPlayerData || !isAlive) {
        return; // Exit if not playing, locked, and alive
    }

    // --- Get References ---
    const controlsObject = controls.getObject(); // Camera / Player Rig
    const playerState = localPlayerData; // Local data cache (plain object, not ClientPlayer)

    // --- Store Previous Position for Collision Revert ---
    const previousPosition = controlsObject.position.clone();

    // --- Vertical Physics REMOVED ---
    // No gravity, no Y velocity updates based on physics.

    // --- Horizontal Movement (Based on Input & Camera Direction - Inverted A/D) ---
    const moveSpeed = (typeof Input !== 'undefined' && Input.keys['ShiftLeft']) ? CONFIG.MOVEMENT_SPEED_SPRINTING : CONFIG.MOVEMENT_SPEED;
    const deltaSpeed = moveSpeed * deltaTime;
    const forward = new THREE.Vector3(), right = new THREE.Vector3();
    // Important: Use camera for direction even though controlsObject is moved
    if (typeof camera !== 'undefined') {
        camera.getWorldDirection(forward); forward.y=0; forward.normalize(); // Project onto XZ plane
        right.crossVectors(camera.up, forward).normalize(); // Camera up is usually (0,1,0)
    } else {
         console.error("Camera missing in updateLocalPlayer"); return; // Cannot move without camera
    }
    let moveDirection = new THREE.Vector3(0,0,0);

    // Apply movement based on input keys
    if(Input.keys['KeyW']){moveDirection.add(forward);} if(Input.keys['KeyS']){moveDirection.sub(forward);}
    if(Input.keys['KeyA']){moveDirection.add(right);} // A = Right (Inverted)
    if(Input.keys['KeyD']){moveDirection.sub(right);} // D = Left (Inverted)

    if(moveDirection.lengthSq() > 0){
        moveDirection.normalize();
        // Apply movement directly to controls object position (XZ plane)
        controlsObject.position.addScaledVector(moveDirection, deltaSpeed);
    }

    // --- Dash Movement ---
    // Applies force in the calculated dash direction (can have Y component if looking up/down)
    if (typeof Input !== 'undefined' && Input.isDashing) {
        controlsObject.position.addScaledVector(Input.dashDirection, CONFIG.DASH_FORCE * deltaTime);
    }

    // --- Collision (Player-Player - Basic Horizontal Revert) ---
    const currentPosition = controlsObject.position;
    const collisionRadius = CONFIG.PLAYER_RADIUS || 0.4; // Use unified radius
    for (const id in players) {
        if (id !== localPlayerId && players[id] instanceof ClientPlayer && players[id].mesh?.visible && players[id].mesh.position) {
            const otherMesh = players[id].mesh;
            // Compare on XZ plane only
            const distanceXZ = new THREE.Vector2(currentPosition.x - otherMesh.position.x, currentPosition.z - otherMesh.position.z).length();
            // Compare Y positions (approximate centers) - optional, prevents reverting if vertically separated
            const otherCenterY = otherMesh.position.y; // Assume model Y is center or feet, use direct comparison
            const currentCenterY = currentPosition.y; // Controls Y is head height
            const heightDifference = Math.abs(currentCenterY - otherCenterY);
            const collisionHeight = (CONFIG.PLAYER_HEIGHT || 1.8);

            if (distanceXZ < collisionRadius * 2 && heightDifference < collisionHeight) { // Check both XZ distance and rough Y overlap
                // Revert only horizontal position components
                currentPosition.x = previousPosition.x;
                currentPosition.z = previousPosition.z;
                // console.log("Player-Player collision detected, reverting horizontal movement."); // Optional log
                break; // Stop checking after one collision
            }
        }
    }

    // --- Void Check REMOVED ---
    // Server now handles void detection.

    // --- Send Network Updates (Based on position and rotation) ---
    // Calculate logical position (feet) to send to server
    const logicalPosition = controlsObject.position.clone();
    const cameraOffset = CONFIG?.CAMERA_Y_OFFSET || (CONFIG?.PLAYER_HEIGHT || 1.8); // Use camera offset, fallback to player height
    logicalPosition.y -= cameraOffset; // <<< CHANGED Subtract camera offset to get feet Y

    const currentRotation = new THREE.Euler().setFromQuaternion(controlsObject.quaternion,'YXZ'); const currentRotationY = currentRotation.y;
    const lastSentState = playerState; // Reference to the plain object for local player

    const pTSq = CONFIG.PLAYER_MOVE_THRESHOLD_SQ || 0.0001;
    const rTh = 0.01; // Rotation threshold

    // Check if position or rotation changed significantly
    const posChanged = logicalPosition.distanceToSquared(new THREE.Vector3(lastSentState?.x ?? 0, lastSentState?.y ?? 0, lastSentState?.z ?? 0)) > pTSq;
    const rotChanged = Math.abs(currentRotationY - (lastSentState?.rotationY ?? 0)) > rTh;

    if (posChanged || rotChanged) {
        // Update local cache immediately (plain object)
        playerState.x = logicalPosition.x;
        playerState.y = logicalPosition.y; // Send feet Y
        playerState.z = logicalPosition.z;
        playerState.rotationY = currentRotationY;

        // Send update to server
        if (typeof Network !== 'undefined') Network.sendPlayerUpdate({ x: playerState.x, y: playerState.y, z: playerState.z, rotationY: currentRotationY });
    }
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

console.log("gameLogic.js loaded (Simplified - Horizontal Only Movement, No Client Void Check)");
