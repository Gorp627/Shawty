// docs/gameLogic.js (Adapted for Cannon-es)

// Depends on: config.js, stateMachine.js, input.js, network.js, uiManager.js
// Accesses globals: camera, controls, players, localPlayerId, CONFIG, THREE, CANNON, Network, Input, UIManager, stateMachine

/**
 * Updates the local player's physics BODY based on input and handles void checks.
 * @param {number} deltaTime Time since last frame (potentially unused if relying on fixed step velocity).
 * @param {CANNON.Body} playerBody Reference to the local player's physics body.
 */
function updateLocalPlayer(deltaTime, playerBody) {
    // --- Guard Clauses ---
    if (!playerBody) { return; } // Can't do physics without the body
    const isPlaying = typeof stateMachine !== 'undefined' && stateMachine.is('playing');
    const isLocked = typeof controls !== 'undefined' && controls?.isLocked;
    const localPlayerData = localPlayerId ? players[localPlayerId] : null; // Used for health check, network data cache

    if (!isPlaying || !isLocked || !localPlayerData) { return; }

    const isAlive = localPlayerData.health > 0;

    // --- Physics Body Interaction (Only if Alive) ---
    if (isAlive) {
        // --- Calculate Movement Direction (Relative to Camera) ---
        const moveSpeed = Input.keys['ShiftLeft'] ? CONFIG.MOVEMENT_SPEED_SPRINTING : CONFIG.MOVEMENT_SPEED;
        const forward = new THREE.Vector3(), right = new THREE.Vector3();
        const moveDirectionInput = new THREE.Vector3(0, 0, 0); // Input direction XZ

        if (typeof camera !== 'undefined') {
            camera.getWorldDirection(forward); forward.y = 0; forward.normalize();
            right.crossVectors(new THREE.Vector3(0, 1, 0), forward).normalize(); // Use world up

            if(Input.keys['KeyW']){moveDirectionInput.add(forward);}
            if(Input.keys['KeyS']){moveDirectionInput.sub(forward);}
            if(Input.keys['KeyA']){moveDirectionInput.sub(right);} // A=Left
            if(Input.keys['KeyD']){moveDirectionInput.add(right);} // D=Right (Corrected from inversion)
        } else { console.error("Camera missing!"); return; }

        // --- Apply Horizontal Velocity ---
        let targetVelocityX = 0;
        let targetVelocityZ = 0;
        if (moveDirectionInput.lengthSq() > 0) {
            moveDirectionInput.normalize();
            targetVelocityX = moveDirectionInput.x * moveSpeed;
            targetVelocityZ = moveDirectionInput.z * moveSpeed;
        }

        // Keep current vertical velocity from gravity/jump unless specifically modified
        const currentVelocityY = playerBody.velocity.y;

        // Set body velocity directly (ignoring delta time here relies on fixed physics step)
        playerBody.velocity.set(targetVelocityX, currentVelocityY, targetVelocityZ);

        // --- Handle Jump ---
        // Check CANNON collision events later for better ground detection, for now check Input flag
        // Note: Manual isOnGround is gone. Need a physics-based ground check later.
        // TEMPORARY BASIC JUMP (Might allow mid-air jump without proper check)
        if (Input.keys['Space'] && Math.abs(playerBody.velocity.y) < 0.1) { // Basic check if vertical velocity is near zero
            console.log("Attempting Jump (Basic Check)");
             // Make sure this doesn't stack if space is held (input handler prevents repeat ideally)
            playerBody.velocity.y = CONFIG.JUMP_VELOCITY || 8.5;
            // TODO: Replace basic Y velocity check with proper ground contact detection using collision events.
        }

        // --- Handle Dash (Using Impulse) ---
        if (typeof Input !== 'undefined' && Input.isDashing) {
             // Calculate impulse direction (based on Input.dashDirection which was set by keydown)
             const impulseDirection = new CANNON.Vec3(
                 Input.dashDirection.x,
                 Input.dashDirection.y, // Allow vertical dash component
                 Input.dashDirection.z
             );
             // Apply impulse (instantaneous force)
             // Impulse = Force * DeltaTime; We want a burst, so use Impulse directly.
             // Scale direction by desired force magnitude
             const impulseMagnitude = CONFIG.DASH_FORCE_MAGNITUDE || 1200;
             impulseDirection.scale(impulseMagnitude * timeStep, impulseDirection); // Scale by timestep? Or just magnitude? Try magnitude first.
            impulseDirection.scale(impulseMagnitude, impulseDirection); // Simpler: Just scale direction

             // Apply the impulse at the center of mass
            playerBody.applyImpulse(impulseDirection, playerBody.position);


            Input.isDashing = false; // Consume the dash flag after applying impulse
            console.log("Dash Impulse Applied!");
        }


    } else {
        // If dead, ensure velocity is zeroed out
        playerBody.velocity.set(0, 0, 0);
        playerBody.angularVelocity.set(0, 0, 0);
    }


    // --- Void Check (Reading from Physics Body) ---
    let fellIntoVoid = false;
    if (isAlive) {
        // Check Y Level
        if (playerBody.position.y < (CONFIG.VOID_Y_LEVEL || -40)) {
            console.log(`Fell below VOID_Y_LEVEL (Body Y: ${playerBody.position.y.toFixed(2)}).`);
            fellIntoVoid = true;
        }
        // Check X/Z Bounds
        if (!fellIntoVoid && (Math.abs(playerBody.position.x) > (CONFIG.MAP_BOUNDS_X || 50) ||
            Math.abs(playerBody.position.z) > (CONFIG.MAP_BOUNDS_Z || 50))) {
            console.log(`Fell outside MAP_BOUNDS (Body X: ${playerBody.position.x.toFixed(2)}, Z: ${playerBody.position.z.toFixed(2)}).`);
            fellIntoVoid = true;
        }

        if (fellIntoVoid) {
            console.log("Player fell into void!");
            localPlayerData.health = 0; // Update logical health
            if(typeof UIManager !== 'undefined') UIManager.updateHealthBar(0);
            if(typeof Network !== 'undefined') Network.sendVoidDeath(); // Notify server

            // Reset physics immediately to prevent further issues
            playerBody.velocity.set(0, 0, 0);
            playerBody.angularVelocity.set(0, 0, 0);
            // Optionally teleport body upwards slightly?
            // playerBody.position.y = 100; // Move way up instantly
        }
    }


    // --- Player Collision ---
    // This is now handled automatically by the physics engine!
    // The bodies will collide and prevent overlap based on their shapes and materials.
    // We removed the manual position revert code.


    // --- Send Network Updates ---
    // Get position/rotation from CONTROLS object (which is synced to physics body in animate loop)
    const controlsObject = controls.getObject(); // Need this for current camera orientation too
    const cameraOffset = CONFIG?.CAMERA_Y_OFFSET || 1.6;
    const logicalPosition = new THREE.Vector3(
            controlsObject.position.x,
            controlsObject.position.y - cameraOffset, // Calculate feet Y from camera Y
            controlsObject.position.z
    );
    const currentRotation = new THREE.Euler().setFromQuaternion(controlsObject.quaternion,'YXZ'); const currentRotationY = currentRotation.y;

    // Compare against cached data and send if changed significantly
    const pTSq = CONFIG.PLAYER_MOVE_THRESHOLD_SQ || 0.0001; const rTh = 0.01;
    const posChanged = logicalPosition.distanceToSquared(new THREE.Vector3(localPlayerData?.x ?? 0, localPlayerData?.y ?? 0, localPlayerData?.z ?? 0)) > pTSq;
    const rotChanged = Math.abs(currentRotationY - (localPlayerData?.rotationY ?? 0)) > rTh;

    if (posChanged || rotChanged) {
        // Update local cache object
        localPlayerData.x = logicalPosition.x;
        localPlayerData.y = logicalPosition.y; // Send calculated feet Y
        localPlayerData.z = logicalPosition.z;
        localPlayerData.rotationY = currentRotationY;
        if (typeof Network !== 'undefined') Network.sendPlayerUpdate({ x: localPlayerData.x, y: localPlayerData.y, z: localPlayerData.z, rotationY: localPlayerData.rotationY });
    }

} // End updateLocalPlayer

// No separate updateRemotePlayers physics needed - they are KINEMATIC bodies updated via network


console.log("gameLogic.js loaded (Using Cannon-es Physics Body)");
