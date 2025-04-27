// docs/gameLogic.js (Adapted for Cannon-es, Ground Contact Event)

// Depends on: config.js, stateMachine.js, input.js, network.js, uiManager.js
// Accesses globals: camera, controls, players, localPlayerId, CONFIG, THREE, CANNON, Network, Input, UIManager, stateMachine, isPlayerGrounded // Global ground flag

/**
 * Updates the local player's physics BODY based on input and handles void checks.
 * @param {number} deltaTime Time since last frame (passed but might not be used for velocity).
 * @param {CANNON.Body} playerBody Reference to the local player's physics body.
 */
function updateLocalPlayer(deltaTime, playerBody) {
    // --- Guard Clauses ---
    if (!playerBody) { return; } // Must have physics body
    const isPlaying = stateMachine?.is('playing');
    const isLocked = controls?.isLocked;
    const localPlayerData = localPlayerId ? players[localPlayerId] : null;
    if (!isPlaying || !isLocked || !localPlayerData) { return; } // Must be playing, locked, have data

    const isAlive = localPlayerData.health > 0;

    // <<< Reset Grounded Flag - Updated by collision handler between frames >>>
    // NOTE: Collision events fire *during* world.step(). To reliably check for ground before applying jump,
    // it's better to have the event handler set the flag, and we read it here.
    // But we MUST reset it here or after using it, otherwise player might jump infinitely after leaving ground.
    let _isGroundedThisFrame = isPlayerGrounded; // Read the state set by collision listener
    isPlayerGrounded = false; // <<< IMPORTANT: Assume not grounded for NEXT frame unless collision happens


    // --- Physics Body Interaction (Only if Alive) ---
    if (isAlive) {
        // --- Calculate Movement Direction ---
        const moveSpeed = Input.keys['ShiftLeft'] ? CONFIG.MOVEMENT_SPEED_SPRINTING : CONFIG.MOVEMENT_SPEED;
        const forward = new THREE.Vector3(), right = new THREE.Vector3();
        const moveDirectionInput = new THREE.Vector3(0, 0, 0);

        if (camera) {
            camera.getWorldDirection(forward); forward.y = 0; forward.normalize();
            right.crossVectors(new THREE.Vector3(0, 1, 0), forward).normalize();
            // Apply Input (A/D Swapped correctly)
            if(Input.keys['KeyW']){moveDirectionInput.add(forward);}
            if(Input.keys['KeyS']){moveDirectionInput.sub(forward);}
            if(Input.keys['KeyA']){moveDirectionInput.sub(right);} // A = Left
            if(Input.keys['KeyD']){moveDirectionInput.add(right);} // D = Right
        } else { console.error("Camera missing!"); return; }

        // --- Apply Horizontal Velocity ---
        let targetVelocityX = 0; let targetVelocityZ = 0;
        if (moveDirectionInput.lengthSq() > 0) {
            moveDirectionInput.normalize();
            targetVelocityX = moveDirectionInput.x * moveSpeed;
            targetVelocityZ = moveDirectionInput.z * moveSpeed;
        }
        const currentVelocityY = playerBody.velocity.y; // Keep vertical from physics
        playerBody.velocity.set(targetVelocityX, currentVelocityY, targetVelocityZ);


        // --- Handle Jump ---
        if (Input.attemptingJump) { // Check jump request flag from input
            if (_isGroundedThisFrame) { // Check the grounded state read at start of function
                playerBody.velocity.y = CONFIG.JUMP_VELOCITY || 8.5; // Apply jump velocity
                console.log("Jump Applied! VelocityY:", playerBody.velocity.y);
                _isGroundedThisFrame = false; // Prevent repeated jump from same ground contact if collision fires late
            } else {
                // console.log("Jump attempt ignored, not grounded this frame.");
            }
            Input.attemptingJump = false; // Consume the jump attempt flag regardless
        }

        // --- Handle Dash ---
        if (Input.requestingDashImpulse) {
            const impulseDirection = new CANNON.Vec3(Input.dashDirection.x, Input.dashDirection.y, Input.dashDirection.z);
            const impulseMagnitude = CONFIG.DASH_FORCE_MAGNITUDE || 1200;
            impulseDirection.scale(impulseMagnitude, impulseDirection);
            playerBody.applyImpulse(impulseDirection, playerBody.position);
            console.log("Dash Impulse Applied!");
            Input.requestingDashImpulse = false; // Consume dash request
        }

    } else { // If Dead
        playerBody.velocity.set(0, 0, 0); playerBody.angularVelocity.set(0, 0, 0);
    }


    // --- Void Check ---
    let fellIntoVoid = false;
    if (isAlive && playerBody.position) { // Check if player body exists
        if (playerBody.position.y < (CONFIG.VOID_Y_LEVEL || -40)) { fellIntoVoid = true; console.log("Fell below Y level"); }
        if (!fellIntoVoid && (Math.abs(playerBody.position.x) > (CONFIG.MAP_BOUNDS_X || 50) || Math.abs(playerBody.position.z) > (CONFIG.MAP_BOUNDS_Z || 50))) { fellIntoVoid = true; console.log("Fell outside bounds"); }
        if (fellIntoVoid) {
            console.log("Player fell into void!"); localPlayerData.health = 0;
            if(UIManager) UIManager.updateHealthBar(0); if(Network) Network.sendVoidDeath();
            if (playerBody.velocity) playerBody.velocity.set(0,0,0); if (playerBody.angularVelocity) playerBody.angularVelocity.set(0,0,0); // Stop body immediately
        }
    }

    // --- Player Collision handled by physics engine ---

    // --- Send Network Updates ---
    const controlsObject = controls?.getObject();
    if (playerBody.position && controlsObject && localPlayerData) { // Check required objects
         const playerHeight = CONFIG?.PLAYER_HEIGHT || 1.8;
         const logicalPosition = new THREE.Vector3( playerBody.position.x, playerBody.position.y - playerHeight / 2.0, playerBody.position.z ); // Calculate feet Y from body center
         const currentRotation = new THREE.Euler().setFromQuaternion(controlsObject.quaternion,'YXZ'); const currentRotationY = currentRotation.y;
         const pTSq = CONFIG.PLAYER_MOVE_THRESHOLD_SQ || 0.0001; const rTh = 0.01;
         const posChanged = logicalPosition.distanceToSquared(new THREE.Vector3(localPlayerData.x??0, localPlayerData.y??0, localPlayerData.z??0)) > pTSq;
         const rotChanged = Math.abs(currentRotationY - (localPlayerData.rotationY??0)) > rTh;

         if (posChanged || rotChanged) {
             localPlayerData.x = logicalPosition.x; localPlayerData.y = logicalPosition.y; localPlayerData.z = logicalPosition.z; localPlayerData.rotationY = currentRotationY;
             if (Network) Network.sendPlayerUpdate({ x: localPlayerData.x, y: localPlayerData.y, z: localPlayerData.z, rotationY: localPlayerData.rotationY });
         }
         // Also consider sending periodic updates even if not moved significantly? Prevents appearing frozen on other clients if packet loss occurs.
    }

} // End updateLocalPlayer


console.log("gameLogic.js loaded (Using Physics Body, Ground Events, A/D Corrected)");
