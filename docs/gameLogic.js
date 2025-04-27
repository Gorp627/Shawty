// docs/gameLogic.js (Adapted for Cannon-es, Ground Contact Event, Corrected Inputs)

// Depends on: config.js, stateMachine.js, input.js, network.js, uiManager.js
// Accesses globals: camera, controls, players, localPlayerId, CONFIG, THREE, CANNON, Network, Input, UIManager, stateMachine, isPlayerGrounded

/**
 * Updates the local player's physics BODY based on input and handles void checks.
 * @param {number} deltaTime Time since last frame (passed for potential future use).
 * @param {CANNON.Body} playerBody Reference to the local player's physics body.
 */
function updateLocalPlayer(deltaTime, playerBody) {
    // --- Guard Clauses ---
    if (!playerBody) { return; }
    const isPlaying = stateMachine?.is('playing');
    const isLocked = controls?.isLocked;
    const localPlayerData = localPlayerId ? players[localPlayerId] : null;
    if (!isPlaying || !isLocked || !localPlayerData) { return; }

    const isAlive = localPlayerData.health > 0;

    // Read ground state from collision handler, then reset global flag for next frame's check
    let _isGroundedThisFrame = isPlayerGrounded;
    isPlayerGrounded = false;


    // --- Physics Body Interaction (Only if Alive) ---
    if (isAlive) {
        // --- Calculate Movement Direction ---
        const moveSpeed = Input.keys['ShiftLeft'] ? CONFIG.MOVEMENT_SPEED_SPRINTING : CONFIG.MOVEMENT_SPEED;
        const forward = new THREE.Vector3(), right = new THREE.Vector3();
        const moveDirectionInput = new THREE.Vector3(0, 0, 0);

        if (camera) {
            camera.getWorldDirection(forward); forward.y = 0; forward.normalize();
            right.crossVectors(new THREE.Vector3(0, 1, 0), forward).normalize();
            // --- CORRECTED A/D LOGIC ---
            if(Input.keys['KeyW']){moveDirectionInput.add(forward);}
            if(Input.keys['KeyS']){moveDirectionInput.sub(forward);}
            if(Input.keys['KeyA']){moveDirectionInput.sub(right);} // A = Move Left
            if(Input.keys['KeyD']){moveDirectionInput.add(right);} // D = Move Right
        } else { console.error("Camera missing!"); return; }

        // --- Apply Horizontal Velocity ---
        let targetVelocityX = 0; let targetVelocityZ = 0;
        if (moveDirectionInput.lengthSq() > 0) {
            moveDirectionInput.normalize();
            targetVelocityX = moveDirectionInput.x * moveSpeed;
            targetVelocityZ = moveDirectionInput.z * moveSpeed;
        }
        const currentVelocityY = playerBody.velocity.y; // Preserve Y vel from physics
        playerBody.velocity.set(targetVelocityX, currentVelocityY, targetVelocityZ);


        // --- Handle Jump (Directly check Space key + Grounded flag) ---
        if (Input.keys['Space'] && _isGroundedThisFrame) { // Check Space AND ground flag read earlier
            playerBody.velocity.y = CONFIG.JUMP_VELOCITY || 8.5; // Apply jump force
            _isGroundedThisFrame = false; // Prevent multi-jump even if key is held for a frame or two
            console.log("Jump applied directly. Velocity Y:", playerBody.velocity.y);
            // No need to manage Input.attemptingJump flag anymore
        }

        // --- Handle Dash (Check flag, apply velocity, reset flag) ---
        if (Input.dashJustActivated) {
            const dashSpeed = 30; // Adjust this speed value for desired dash distance/feel
            const dashVelX = Input.dashDirection.x * dashSpeed;
            const dashVelY = Input.dashDirection.y * dashSpeed; // Allow vertical dash? Adjust multiplier if needed (e.g., * 0.5)
            const dashVelZ = Input.dashDirection.z * dashSpeed;

            // Preserve existing Y vel OR incorporate vertical dash? Overwrite for now for simple dash.
            // let newVelY = dashVelY;
            // if (!CONFIG.ALLOW_VERTICAL_DASH) newVelY = playerBody.velocity.y; // Option to keep current Y vel

            // Set velocity directly for the dash effect
            playerBody.velocity.set(dashVelX, dashVelY, dashVelZ); // Set velocity instead of impulse
            console.log("Dash velocity SET!");

            Input.dashJustActivated = false; // Consume the activation flag
        }

    } else { // If Dead
        playerBody.velocity.set(0, 0, 0); playerBody.angularVelocity.set(0, 0, 0);
    }


    // --- Void Check ---
    let fellIntoVoid = false;
    if (isAlive && playerBody.position) {
        if (playerBody.position.y < (CONFIG.VOID_Y_LEVEL || -40)) { fellIntoVoid = true; console.log("Fell below Y level"); }
        if (!fellIntoVoid && (Math.abs(playerBody.position.x) > (CONFIG.MAP_BOUNDS_X || 50) || Math.abs(playerBody.position.z) > (CONFIG.MAP_BOUNDS_Z || 50))) { fellIntoVoid = true; console.log("Fell outside bounds"); }
        if (fellIntoVoid) {
            console.log("Player fell into void!"); localPlayerData.health = 0;
            if(UIManager) UIManager.updateHealthBar(0); if(Network) Network.sendVoidDeath();
            if (playerBody.velocity) playerBody.velocity.set(0,0,0); if (playerBody.angularVelocity) playerBody.angularVelocity.set(0,0,0);
        }
    }

    // --- Player Collision handled by Cannon-es ---

    // --- Send Network Updates ---
    const controlsObject = controls?.getObject();
    if (playerBody.position && controlsObject && localPlayerData) {
         const playerHeight = CONFIG?.PLAYER_HEIGHT || 1.8;
         // Calculate feet Y from body center for sending to server
         const logicalPosition = new THREE.Vector3( playerBody.position.x, playerBody.position.y - playerHeight / 2.0, playerBody.position.z );
         const currentRotation = new THREE.Euler().setFromQuaternion(controlsObject.quaternion,'YXZ'); const currentRotationY = currentRotation.y;
         const pTSq = CONFIG.PLAYER_MOVE_THRESHOLD_SQ || 0.0001; const rTh = 0.01;
         const posChanged = logicalPosition.distanceToSquared(new THREE.Vector3(localPlayerData.x??0, localPlayerData.y??0, localPlayerData.z??0)) > pTSq;
         const rotChanged = Math.abs(currentRotationY - (localPlayerData.rotationY??0)) > rTh;

         if (posChanged || rotChanged) {
             localPlayerData.x = logicalPosition.x; localPlayerData.y = logicalPosition.y; localPlayerData.z = logicalPosition.z; localPlayerData.rotationY = currentRotationY;
             if (Network) Network.sendPlayerUpdate({ x: localPlayerData.x, y: localPlayerData.y, z: localPlayerData.z, rotationY: localPlayerData.rotationY });
         }
    }

} // End updateLocalPlayer


console.log("gameLogic.js loaded (Fixed A/D, Jump uses Ground Flag, Dash uses Velocity)");
