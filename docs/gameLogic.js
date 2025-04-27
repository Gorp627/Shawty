// docs/gameLogic.js (Adapted for Cannon-es, Ground Contact Event)

// Depends on: config.js, stateMachine.js, input.js, network.js, uiManager.js
// Accesses globals: camera, controls, players, localPlayerId, CONFIG, THREE, CANNON, Network, Input, UIManager, stateMachine, isPlayerGrounded // Global ground flag

/**
 * Updates the local player's physics BODY based on input and handles void checks.
 * @param {number} deltaTime Time since last frame.
 * @param {CANNON.Body} playerBody Reference to the local player's physics body.
 */
function updateLocalPlayer(deltaTime, playerBody) {
    // --- Guard Clauses ---
    if (!playerBody) {
        // If body doesn't exist yet or player left, do nothing.
        // console.warn("updateLocalPlayer called without playerBody");
        return;
    }
    const isPlaying = typeof stateMachine !== 'undefined' && stateMachine.is('playing');
    const isLocked = typeof controls !== 'undefined' && controls?.isLocked;
    const localPlayerData = localPlayerId ? players[localPlayerId] : null;

    if (!isPlaying || !isLocked || !localPlayerData) { return; }

    const isAlive = localPlayerData.health > 0;

    // <<< Reset Grounded Flag - Collision handler will set it to true if contact occurs THIS FRAME >>>
    isPlayerGrounded = false;


    // --- Physics Body Interaction (Only if Alive) ---
    if (isAlive) {
        // --- Calculate Movement Direction ---
        const moveSpeed = Input.keys['ShiftLeft'] ? CONFIG.MOVEMENT_SPEED_SPRINTING : CONFIG.MOVEMENT_SPEED;
        const forward = new THREE.Vector3(), right = new THREE.Vector3();
        const moveDirectionInput = new THREE.Vector3(0, 0, 0);

        if (typeof camera !== 'undefined') {
            camera.getWorldDirection(forward); forward.y = 0; forward.normalize();
            right.crossVectors(new THREE.Vector3(0, 1, 0), forward).normalize();

            if(Input.keys['KeyW']){moveDirectionInput.add(forward);}
            if(Input.keys['KeyS']){moveDirectionInput.sub(forward);}
            // <<< SWAPPED A/D >>>
            if(Input.keys['KeyA']){moveDirectionInput.sub(right);} // A=Left
            if(Input.keys['KeyD']){moveDirectionInput.add(right);} // D=Right
        } else { console.error("Camera missing!"); return; }

        // --- Apply Horizontal Velocity ---
        let targetVelocityX = 0; let targetVelocityZ = 0;
        if (moveDirectionInput.lengthSq() > 0) {
            moveDirectionInput.normalize();
            targetVelocityX = moveDirectionInput.x * moveSpeed;
            targetVelocityZ = moveDirectionInput.z * moveSpeed;
        }
        // Preserve vertical velocity from physics engine (gravity/jump)
        const currentVelocityY = playerBody?.velocity.y ?? 0; // Add null check
        if (playerBody?.velocity) { // Add null check before setting
            playerBody.velocity.set(targetVelocityX, currentVelocityY, targetVelocityZ);
        }

        // --- Handle Jump (Check flag from Input.js) ---
        if (Input.attemptingJump) { // Check the flag set by Space keydown
            console.log("Jump Logic: attempt=true, grounded=", isPlayerGrounded);
            if (isPlayerGrounded) { // Double-check ground status HERE using flag
                if (playerBody?.velocity) { // Check body exists
                    playerBody.velocity.y = CONFIG.JUMP_VELOCITY || 8.5; // Apply jump velocity
                    console.log("Applying jump velocity:", playerBody.velocity.y);
                }
            }
            Input.attemptingJump = false; // Consume the jump attempt flag
        }

        // --- Handle Dash (Check flag from Input.js) ---
        if (Input.requestingDashImpulse) {
            if (playerBody?.position) { // Check body exists
                const impulseDirection = new CANNON.Vec3(Input.dashDirection.x, Input.dashDirection.y, Input.dashDirection.z);
                const impulseMagnitude = CONFIG.DASH_FORCE_MAGNITUDE || 1200;
                impulseDirection.scale(impulseMagnitude, impulseDirection); // Scale direct by magnitude
                playerBody.applyImpulse(impulseDirection, playerBody.position); // Apply at center
                console.log("Dash Impulse Applied!");
            }
            Input.requestingDashImpulse = false; // Consume the flag
        }

    } else { // If Dead
        if (playerBody?.velocity) playerBody.velocity.set(0, 0, 0); // Stop movement
        if (playerBody?.angularVelocity) playerBody.angularVelocity.set(0, 0, 0); // Stop spinning
    }


    // --- Void Check ---
    let fellIntoVoid = false;
    if (isAlive && playerBody?.position) { // Check body exists
        if (playerBody.position.y < (CONFIG.VOID_Y_LEVEL || -40)) { fellIntoVoid = true; console.log("Fell below Y level"); }
        if (!fellIntoVoid && (Math.abs(playerBody.position.x) > (CONFIG.MAP_BOUNDS_X || 50) || Math.abs(playerBody.position.z) > (CONFIG.MAP_BOUNDS_Z || 50))) { fellIntoVoid = true; console.log("Fell outside bounds"); }
        if (fellIntoVoid) {
            console.log("Player fell into void!"); localPlayerData.health = 0;
            if(UIManager) UIManager.updateHealthBar(0); if(Network) Network.sendVoidDeath();
            // Reset physics to prevent ghost forces after death message sent
            if (playerBody?.velocity) playerBody.velocity.set(0,0,0); if (playerBody?.angularVelocity) playerBody.angularVelocity.set(0,0,0);
        }
    }

    // --- Player Collision is handled by Cannon-es ---

    // --- Send Network Updates ---
    const controlsObject = controls?.getObject(); // Get for rotation data
    if (isAlive && playerBody?.position && controlsObject && localPlayerData) { // Check necessary objects
         const cameraOffset = CONFIG?.CAMERA_Y_OFFSET || 1.6;
         const logicalPosition = new THREE.Vector3( playerBody.position.x, playerBody.position.y - playerHeight / 2.0, playerBody.position.z ); // Calculate feet Y from BODY center Y
         // Alternatively, read controls pos after sync, subtract camera offset
         // const logicalPosition = new THREE.Vector3(controlsObject.position.x, controlsObject.position.y - cameraOffset, controlsObject.position.z);

         const currentRotation = new THREE.Euler().setFromQuaternion(controlsObject.quaternion,'YXZ'); const currentRotationY = currentRotation.y;
         const pTSq = CONFIG.PLAYER_MOVE_THRESHOLD_SQ || 0.0001; const rTh = 0.01;
         const posChanged = logicalPosition.distanceToSquared(new THREE.Vector3(localPlayerData.x??0, localPlayerData.y??0, localPlayerData.z??0)) > pTSq;
         const rotChanged = Math.abs(currentRotationY - (localPlayerData.rotationY??0)) > rTh;

         if (posChanged || rotChanged) {
             localPlayerData.x = logicalPosition.x; localPlayerData.y = logicalPosition.y; localPlayerData.z = logicalPosition.z; localPlayerData.rotationY = currentRotationY;
             if (Network) Network.sendPlayerUpdate({ x: localPlayerData.x, y: localPlayerData.y, z: localPlayerData.z, rotationY: localPlayerData.rotationY });
         }
    } else if (!isAlive && (posChanged || rotChanged)) {
        // Send one final update if dead and position changed (e.g., falling into void)
         localPlayerData.x = logicalPosition.x; localPlayerData.y = logicalPosition.y; localPlayerData.z = logicalPosition.z; localPlayerData.rotationY = currentRotationY;
         if (Network) Network.sendPlayerUpdate({ x: localPlayerData.x, y: localPlayerData.y, z: localPlayerData.z, rotationY: localPlayerData.rotationY });
    }


} // End updateLocalPlayer


console.log("gameLogic.js loaded (Using Physics Body, Fixed Ground Check)");
