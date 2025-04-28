// docs/gameLogic.js (Rapier - With Debug Logs)

// Accesses globals: camera, controls, players, localPlayerId, CONFIG, THREE, RAPIER, rapierWorld, Network, Input, UIManager, stateMachine

// --- Constants ---
const JUMP_IMPULSE_VALUE = CONFIG?.JUMP_IMPULSE || 300;
const DASH_IMPULSE_MAGNITUDE = CONFIG?.DASH_IMPULSE_MAGNITUDE || 450;
const DASH_UP_FACTOR = 0.1; // How much upward impulse to add during dash
const GROUND_CHECK_BUFFER = CONFIG?.GROUND_CHECK_DISTANCE || 0.25; // Extra distance below capsule bottom for ground check

/**
 * Updates the local player's physics BODY based on input and handles void checks.
 * @param {number} deltaTime Time since last frame.
 * @param {RAPIER.RigidBody} playerBody Reference to the local player's dynamic physics body.
 */
function updateLocalPlayer(deltaTime, playerBody) {
    // --- Guard Clauses ---
    if (!playerBody || !rapierWorld || !RAPIER) { /* console.warn("updateLP skipped: Physics missing"); */ return; }
    const isPlaying = stateMachine?.is('playing');
    const isLocked = controls?.isLocked;
    const localPlayerData = localPlayerId ? players[localPlayerId] : null;

    // Only run logic if playing, controls locked, and data exists
    if (!isPlaying || !isLocked || !localPlayerData) { return; }

    // *** ADDED: Log entry and body position ***
    // console.log("updateLocalPlayer running for:", localPlayerId); // Very spammy, enable if needed
    try {
        const currentPos = playerBody.translation();
        // console.log(`  Player Body Pos: x=${currentPos.x.toFixed(2)}, y=${currentPos.y.toFixed(2)}, z=${currentPos.z.toFixed(2)}`); // Spammy
    } catch(e) {
        console.error("!!! Error accessing playerBody at start of updateLocalPlayer:", e);
        return; // Stop if body access fails
    }

    const isAlive = localPlayerData.health > 0;

    // --- Ground Check (Using Rapier Raycast) ---
    let isGrounded = false;
    if (isAlive) { // Only check ground if alive
        try {
            const bodyPos = playerBody.translation(); // Get current body center position

            // Calculate ray origin: Bottom center of the capsule shape
            const playerHeight = CONFIG?.PLAYER_HEIGHT || 1.8;
            const playerRadius = CONFIG?.PLAYER_RADIUS || 0.4;
            // Height of the cylindrical part of the capsule
            const capsuleHalfHeight = Math.max(0.01, playerHeight / 2.0 - playerRadius);
            // The actual bottom of the capsule collider is center Y - capsuleHalfHeight - playerRadius
            const capsuleBottomY = bodyPos.y - capsuleHalfHeight - playerRadius;

            // Start ray slightly above the absolute bottom to avoid starting inside geometry
            const rayOrigin = { x: bodyPos.x, y: capsuleBottomY + 0.05, z: bodyPos.z };
            const rayDirection = { x: 0, y: -1, z: 0 }; // Straight down

            const ray = new RAPIER.Ray(rayOrigin, rayDirection);
            // Max distance: Check slightly beyond the bottom point (buffer distance)
            const maxToi = GROUND_CHECK_BUFFER + 0.05; // +0.05 matches the offset added to rayOrigin.y
            const solid = true; // Check against solid objects

            // Cast the ray
            const hit = rapierWorld.castRay(ray, maxToi, solid);

            if (hit != null) { // Ray hit something within the distance
                isGrounded = true;
                // console.log(`Ground Hit! TOI: ${hit.toi.toFixed(3)}`); // DEBUG: Log ground hit distance
            } else {
                 // console.log("Not Grounded"); // DEBUG: Log when not grounded
            }
        } catch(e) {
            console.error("!!! Rapier ground check raycast error:", e);
            isGrounded = false; // Assume not grounded on error
        }
    } // End if(isAlive) for ground check

    // --- Apply Input Forces/Impulses (Only if Alive) ---
    if (isAlive) {
        try {
            const currentVel = playerBody.linvel(); // Get current linear velocity

            // --- Horizontal Movement ---
            const moveSpeed = Input.keys['ShiftLeft'] ? (CONFIG?.MOVEMENT_SPEED_SPRINTING || 10.5) : (CONFIG?.MOVEMENT_SPEED || 7.0);

            // Get camera direction for movement relative to view
            const forward = new THREE.Vector3(), right = new THREE.Vector3();
            const moveDirectionInput = new THREE.Vector3(0, 0, 0); // Input direction vector
            if (camera) {
                camera.getWorldDirection(forward); // Get camera forward vector
                forward.y = 0; // Ignore vertical component for horizontal movement
                forward.normalize();
                right.crossVectors(camera.up, forward).normalize(); // Get camera right vector (orthogonal to up and forward)
            } else {
                console.error("!!! Camera missing for movement calculation!");
                return; // Cannot calculate movement without camera
            }

            // Calculate input direction based on keys
            if (Input.keys['KeyW']) { moveDirectionInput.add(forward); }
            if (Input.keys['KeyS']) { moveDirectionInput.sub(forward); }
            if (Input.keys['KeyA']) { moveDirectionInput.sub(right); } // Use subtract for left relative to camera
            if (Input.keys['KeyD']) { moveDirectionInput.add(right); }

            // Calculate target velocity based on input
            let targetVelocityX = currentVel.x;
            let targetVelocityZ = currentVel.z;

            if (moveDirectionInput.lengthSq() > 0.0001) { // If there is movement input
                moveDirectionInput.normalize(); // Normalize the direction vector
                targetVelocityX = moveDirectionInput.x * moveSpeed;
                targetVelocityZ = moveDirectionInput.z * moveSpeed;
                // console.log(`Moving: TargetVel X=${targetVelocityX.toFixed(2)}, Z=${targetVelocityZ.toFixed(2)}`); // DEBUG
            } else {
                // If no input, gradually slow down (damping handles some of this)
                // For more direct stopping, you could set targetVelocity to 0,
                // but setLinvel might feel more responsive. Damping might be sufficient.
                targetVelocityX = 0; // Option: Stop immediately if no input
                targetVelocityZ = 0; // Option: Stop immediately if no input
            }

            // Set linear velocity directly (keeping current Y velocity)
            // Using setLinvel provides more direct control than applying forces each frame
            playerBody.setLinvel({ x: targetVelocityX, y: currentVel.y, z: targetVelocityZ }, true); // `true` = wake body if sleeping

            // --- Handle Jump ---
            if (Input.keys['Space'] && isGrounded) {
                 // Apply an upward impulse for jumping
                 // Check if already moving upwards significantly to prevent double-jumps while ascending
                 if (currentVel.y < 1.0) { // Allow jump even if slightly moving up
                    playerBody.applyImpulse({ x: 0, y: JUMP_IMPULSE_VALUE, z: 0 }, true);
                    // console.log("Jump Impulse Applied!"); // DEBUG
                    isGrounded = false; // Assume we left the ground
                 }
                 // Prevent default space behavior (scrolling)
                 // This should ideally be in Input.js's keydown handler
                 // event.preventDefault(); // Cannot access event here
            }

            // --- Handle Dash ---
            // Input.js now sets `requestingDash` and `dashDirection`
            if (Input.requestingDash) {
                 // Calculate impulse vector based on direction from Input.js
                 const impulse = {
                     x: Input.dashDirection.x * DASH_IMPULSE_MAGNITUDE,
                     y: Input.dashDirection.y * DASH_IMPULSE_MAGNITUDE * DASH_UP_FACTOR, // Add slight upward boost
                     z: Input.dashDirection.z * DASH_IMPULSE_MAGNITUDE
                 };
                 playerBody.applyImpulse(impulse, true);
                 // console.log("Dash Impulse Applied!", impulse); // DEBUG
                 Input.requestingDash = false; // Consume the dash request
            }

        } catch (e) {
            console.error("!!! Error applying input physics:", e);
        }

    } else { // If Dead
        // Optional: Apply strong damping or set velocity to zero if dead
        try {
             // playerBody.setLinearDamping(50.0); // Very high damping when dead
             // playerBody.setLinvel({x:0, y: playerBody.linvel().y, z:0}, true); // Stop horizontal movement
             // Keep gravity acting
        } catch(e) { console.error("Error setting dead player physics:", e); }
    }

    // --- Void Check ---
    let fellIntoVoid = false;
    try {
        const currentBodyPos = playerBody.translation();
        if (currentBodyPos.y < (CONFIG.VOID_Y_LEVEL || -100)) {
            fellIntoVoid = true;
             // console.log("Player fell below void level."); // DEBUG
        }
        // Optional: Add X/Z bounds check
        if (!fellIntoVoid && (Math.abs(currentBodyPos.x) > (CONFIG.MAP_BOUNDS_X || 100) || Math.abs(currentBodyPos.z) > (CONFIG.MAP_BOUNDS_Z || 100))) {
             fellIntoVoid = true;
             // console.log("Player went out of map bounds (X/Z)."); // DEBUG
        }

        if (fellIntoVoid && isAlive) { // Only trigger void death if currently alive
            console.log(`Player ${localPlayerId} fell into the void or out of bounds.`);
            localPlayerData.health = 0; // Set health to 0 locally
            if (UIManager) UIManager.updateHealthBar(0);
            if (Network) Network.sendVoidDeath(); // Notify server

            // Optional: Stop the body completely upon void death
            // playerBody.setLinvel({ x: 0, y: 0, z: 0 }, true);
            // playerBody.setAngvel({ x: 0, y: 0, z: 0 }, true);
        }
    } catch (e) {
        console.error("!!! Error during void check:", e);
    }

    // --- Send Network Updates ---
    // Send updates based on position/rotation changes
    const controlsObject = controls?.getObject(); // The THREE.Object3D container for the camera
    if (playerBody && controlsObject && localPlayerData && isAlive) { // Only send updates if alive
         try {
             const playerHeight = CONFIG?.PLAYER_HEIGHT || 1.8;
             const bodyPos = playerBody.translation(); // Center position
             // Server expects position at the FEET
             const feetPos = { x: bodyPos.x, y: bodyPos.y - playerHeight / 2.0, z: bodyPos.z };

             // Get camera rotation (Y-axis only is usually needed for server)
             const cameraRotation = new THREE.Euler().setFromQuaternion(controlsObject.quaternion, 'YXZ'); // Use YXZ order
             const currentRotationY = cameraRotation.y;

             // Check thresholds for sending update
             const positionThresholdSq = CONFIG?.PLAYER_MOVE_THRESHOLD_SQ || 0.0001;
             const rotationThreshold = 0.01; // Radians (~0.6 degrees)

             const positionChanged = (
                 (feetPos.x - (localPlayerData.x ?? 0)) ** 2 +
                 (feetPos.y - (localPlayerData.y ?? 0)) ** 2 +
                 (feetPos.z - (localPlayerData.z ?? 0)) ** 2
             ) > positionThresholdSq;

             const rotationChanged = Math.abs(currentRotationY - (localPlayerData.rotationY ?? 0)) > rotationThreshold;

             // If position or rotation changed enough, send update
             if (positionChanged || rotationChanged) {
                 // Update local cache immediately
                 localPlayerData.x = feetPos.x;
                 localPlayerData.y = feetPos.y;
                 localPlayerData.z = feetPos.z;
                 localPlayerData.rotationY = currentRotationY;

                 // Send update to server
                 if (Network) {
                     Network.sendPlayerUpdate({
                         x: feetPos.x,
                         y: feetPos.y,
                         z: feetPos.z,
                         rotationY: currentRotationY // Send Y rotation
                     });
                 }
                 // console.log("Sent Player Update"); // DEBUG
             }
         } catch(e) {
             console.error("!!! Error calculating or sending network update:", e);
         }
    }

} // End updateLocalPlayer

console.log("gameLogic.js loaded (Rapier - Added Debug Logs)");
