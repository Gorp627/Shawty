// docs/gameLogic.js

// Depends on: config.js, stateMachine.js, entities.js, input.js, network.js, uiManager.js
// Accesses globals: camera, controls, players, localPlayerId, CONFIG, THREE, ClientPlayer, Network, Input, UIManager, stateMachine
// REMOVED: velocityY, isOnGround, mapMesh access, gravity, jump logic

/**
 * Updates the local player's state, HORIZONTAL movement, and network synchronization.
 * NO environmental physics (gravity, ground check, void check).
 * Basic player-player collision avoidance remains.
 * @param {number} deltaTime Time since last frame.
 */
function updateLocalPlayer(deltaTime) {
    // --- Guard Clause: Ensure active play state and locked controls ---
    const isPlaying = stateMachine.is('playing');
    const isLocked = controls?.isLocked;
    const localPlayerData = localPlayerId ? players[localPlayerId] : null;
    const isAlive = localPlayerData && localPlayerData.health > 0;

    if (!isPlaying || !isLocked || !localPlayerData || !isAlive) {
        return; // Exit if not playing, locked, and alive
    }

    // --- Get References ---
    const controlsObject = controls.getObject(); // Camera / Player Rig
    const playerState = localPlayerData; // Local data cache

    // --- Store Previous Position for Collision Revert ---
    const previousPosition = controlsObject.position.clone();

    // --- Vertical Physics REMOVED ---
    // velocityY -= CONFIG.GRAVITY * deltaTime;
    // controlsObject.position.y += velocityY * deltaTime;
    // isOnGround = false; / onValidGround = false;
    // Ground Check logic (raycast/vertex) REMOVED

    // --- Horizontal Movement (Based on Input & Camera Direction - Inverted A/D) ---
    const moveSpeed = Input.keys['ShiftLeft'] ? CONFIG.MOVEMENT_SPEED_SPRINTING : CONFIG.MOVEMENT_SPEED;
    const deltaSpeed = moveSpeed * deltaTime;
    const forward = new THREE.Vector3(), right = new THREE.Vector3();
    // Important: Use camera for direction even though controlsObject is moved
    camera.getWorldDirection(forward); forward.y=0; forward.normalize();
    right.crossVectors(camera.up, forward).normalize();
    let moveDirection = new THREE.Vector3(0,0,0);

    // Apply movement based on input keys
    if(Input.keys['KeyW']){moveDirection.add(forward);} if(Input.keys['KeyS']){moveDirection.sub(forward);}
    if(Input.keys['KeyA']){moveDirection.add(right);} // A = Right (Inverted)
    if(Input.keys['KeyD']){moveDirection.sub(right);} // D = Left (Inverted)

    if(moveDirection.lengthSq() > 0){
        moveDirection.normalize();
        // Apply movement directly to controls object position
        controlsObject.position.addScaledVector(moveDirection, deltaSpeed);
    }

    // --- Dash Movement ---
    if (Input.isDashing) { controlsObject.position.addScaledVector(Input.dashDirection, CONFIG.DASH_FORCE * deltaTime); }


    // --- Collision (Player-Player - Basic Horizontal Revert) ---
    // Keep this basic avoidance logic
    const currentPosition = controlsObject.position; // Position potentially modified by input/dash
    const collisionRadius = CONFIG.PLAYER_COLLISION_RADIUS || CONFIG.PLAYER_RADIUS || 0.4;
    for (const id in players) {
        if (id !== localPlayerId && players[id] instanceof ClientPlayer && players[id].mesh?.visible && players[id].mesh.position) {
            const otherMesh = players[id].mesh;
            const distanceXZ = new THREE.Vector2(currentPosition.x - otherMesh.position.x, currentPosition.z - otherMesh.position.z).length();
            if (distanceXZ < collisionRadius * 2) {
                // Revert only horizontal position components
                currentPosition.x = previousPosition.x;
                currentPosition.z = previousPosition.z;
                console.log("Player-Player collision detected, reverting horizontal movement."); // Add log
                break; // Stop checking after one collision
            }
        }
    }


    // --- Void Check REMOVED ---
    // if (controlsObject.position.y < CONFIG.VOID_Y_LEVEL && playerState.health > 0) { ... }


    // --- Send Network Updates (Based on horizontal position and rotation) ---
    const logicalPosition = controlsObject.position.clone();
    // logicalPosition.y -= playerHeight; // Y position less relevant now without gravity

    const currentRotation = new THREE.Euler().setFromQuaternion(controlsObject.quaternion,'YXZ'); const currentRotationY = currentRotation.y;
    const lastSentState = playerState;

    const pTSq=CONFIG.PLAYER_MOVE_THRESHOLD_SQ||0.0001; const rTh=0.01;
    // Check distance using X and Z only, maybe? Or keep full distance check? Keep full for now.
    const posChanged = logicalPosition.distanceToSquared(new THREE.Vector3(lastSentState?.x??0, lastSentState?.y??logicalPosition.y, lastSentState?.z??0)) > pTSq;
    const rotChanged = Math.abs(currentRotationY-(lastSentState?.rotationY??0)) > rTh;

    if(posChanged||rotChanged){
        if(playerState){ // Update local cache
             playerState.x=logicalPosition.x;
             // playerState.y=logicalPosition.y; // No longer track vertical physics for server? Or keep sending it? Keep sending current Y for now.
             playerState.y = controlsObject.position.y - (CONFIG.PLAYER_HEIGHT || 1.8); // Send logical feet Y based on current controls Y
             playerState.z=logicalPosition.z;
             playerState.rotationY=currentRotationY;
        }
        if(Network) Network.sendPlayerUpdate({ x:playerState.x, y:playerState.y, z:playerState.z, rotationY:currentRotationY });
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

console.log("gameLogic.js loaded (Heavily Simplified - Horizontal Only Physics)");
