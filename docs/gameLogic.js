// docs/gameLogic.js (Rapier - With Debug Logs & Robustness)

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
    let currentPos;
    try {
        currentPos = playerBody.translation();
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
            // The actual bottom of the capsule collider is center Y - capsuleHalfHeight
            // Note: Capsule origin in Rapier is its center.
            const capsuleBottomCenterY = bodyPos.y - capsuleHalfHeight;

            // Start ray slightly *below* the capsule's bottom center point to avoid starting inside ground
            // but *above* where the ground check buffer distance starts.
            const rayOriginY = capsuleBottomCenterY - 0.01; // Start just below the capsule bottom
            const rayOrigin = { x: bodyPos.x, y: rayOriginY, z: bodyPos.z };
            const rayDirection = { x: 0, y: -1, z: 0 }; // Straight down

            const ray = new RAPIER.Ray(rayOrigin, rayDirection);
            // Max distance: Check from slightly below the capsule down to the buffer distance
            const maxToi = GROUND_CHECK_BUFFER + 0.01; // Total distance to check downwards
            const solid = true; // Check against solid objects
            const groups = undefined; // Collision groups (optional, null/undefined for all)
            const colliderToExclude = playerBody.collider(0); // Exclude the player's own collider

             // Cast the ray
            const hit = rapierWorld.castRay(
                 ray,
                 maxToi,
                 solid,
                 undefined, // query_filter_flags
                 groups,    // query_groups
                 colliderToExclude // exclude collider
            );


            if (hit != null && hit.toi > 0) { // Ray hit something within the distance (toi > 0 ensures not hitting self immediately)
                // console.log(`Ground Hit! TOI: ${hit.toi.toFixed(3)} Collider: ${hit.collider.handle}`); // DEBUG: Log ground hit distance
                isGrounded = true;
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
            const isSprinting = Input.keys['ShiftLeft'] && (Input.keys['KeyW'] || Input.keys['KeyS'] || Input.keys['KeyA'] || Input.keys['KeyD']); // Only sprint if moving
            const moveSpeed = isSprinting ? (CONFIG?.MOVEMENT_SPEED_SPRINTING || 10.5) : (CONFIG?.MOVEMENT_SPEED || 7.0);


            // Get camera direction for movement relative to view
            const forward = new THREE.Vector3(), right = new THREE.Vector3();
            const moveDirectionInput = new THREE.Vector3(0, 0, 0); // Input direction vector
            if (camera && controls && controls.isLocked) { // Ensure camera and controls are active
                // Get direction from the PointerLockControls object, which holds the camera
                controls.getDirection(forward); // Gets the direction the camera is looking
                forward.y = 0; // Ignore vertical component for horizontal movement
                forward.normalize();
                // Calculate right vector relative to world UP, not camera UP, for consistent horizontal plane movement
                right.crossVectors(new THREE.Vector3(0,1,0), forward).normalize().negate(); // Cross world up with forward, negate for standard right
            } else {
                 if(!camera) console.error("!!! Camera missing for movement calculation!");
                 // Don't move if controls aren't locked
                 // return; // Or just allow no movement input
            }

            // Calculate input direction based on keys
            if (Input.keys['KeyW']) { moveDirectionInput.add(forward); }
            if (Input.keys['KeyS']) { moveDirectionInput.sub(forward); }
            if (Input.keys['KeyA']) { moveDirectionInput.sub(right); }
            if (Input.keys['KeyD']) { moveDirectionInput.add(right); }

            // Calculate target velocity based on input
            let targetVelocityX = currentVel.x; // Start with current velocity
            let targetVelocityZ = currentVel.z;

            if (moveDirectionInput.lengthSq() > 0.0001) { // If there is movement input
                moveDirectionInput.normalize(); // Normalize the direction vector
                targetVelocityX = moveDirectionInput.x * moveSpeed;
                targetVelocityZ = moveDirectionInput.z * moveSpeed;
                // console.log(`Moving: TargetVel X=${targetVelocityX.toFixed(2)}, Z=${targetVelocityZ.toFixed(2)}`); // DEBUG
            } else {
                // If no input, let damping handle slowdown. Setting to 0 directly can feel abrupt.
                 targetVelocityX = 0; // Set target horizontal velocity to 0 if no input
                 targetVelocityZ = 0;
            }

             // Apply velocity change using forces/impulses might feel smoother or allow better interaction with slopes
             // Method 1: Direct velocity setting (more responsive, less "physics-y")
             playerBody.setLinvel({ x: targetVelocityX, y: currentVel.y, z: targetVelocityZ }, true); // `true` = wake body if sleeping

             // Method 2: Applying force (might feel smoother but needs tuning)
             // const forceFactor = 20.0; // Adjust this multiplier
             // const force = {
             //     x: (targetVelocityX - currentVel.x) * forceFactor,
             //     y: 0, // Don't apply horizontal force vertically
             //     z: (targetVelocityZ - currentVel.z) * forceFactor
             // };
             // playerBody.applyImpulse(force, true); // Or applyForce

            // --- Handle Jump ---
            if (Input.keys['Space'] && isGrounded) {
                 // Apply an upward impulse for jumping
                 // Check if already moving upwards significantly to prevent double-jumps while ascending
                 if (currentVel.y < 1.0) { // Allow jump even if slightly moving up
                    playerBody.applyImpulse({ x: 0, y: JUMP_IMPULSE_VALUE, z: 0 }, true);
                    // console.log("Jump Impulse Applied!"); // DEBUG
                    isGrounded = false; // Assume we left the ground
                 }
                 // Prevent default space behavior (scrolling) - handled in Input.js
            }

            // --- Handle Dash ---
            // Input.js now sets `requestingDash` and `dashDirection`
            if (Input.requestingDash) {
                 // Calculate impulse vector based on direction from Input.js
                 const impulse = {
                     x: Input.dashDirection.x * DASH_IMPULSE_MAGNITUDE,
                     y: DASH_IMPULSE_MAGNITUDE * DASH_UP_FACTOR, // Add slight upward boost (removed direction factor here)
                     z: Input.dashDirection.z * DASH_IMPULSE_MAGNITUDE
                 };
                 playerBody.applyImpulse(impulse, true);
                 // console.log("Dash Impulse Applied!", impulse); // DEBUG
                 Input.requestingDash = false; // Consume the dash request
            }

        } catch (e) {
            console.error("!!! Error applying input physics:", e);
             // Attempt to reset velocity to prevent runaway errors?
             try { playerBody.setLinvel({ x: 0, y: 0, z: 0 }, true); } catch (resetErr) { console.error("Failed to reset velocity after error:", resetErr); }
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
        const currentBodyPos = playerBody.translation(); // Use position fetched at start if still valid
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
    let controlsObject = null;
    try { controlsObject = controls?.getObject(); } catch (e) { console.error("Error getting controls object:", e); }

    if (playerBody && controlsObject && localPlayerData && isAlive) { // Only send updates if alive
         try {
             const playerHeight = CONFIG?.PLAYER_HEIGHT || 1.8;
             const bodyPos = playerBody.translation(); // Center position from Rapier

             // Server expects position at the FEET
             const feetPosX = bodyPos.x;
             const feetPosY = bodyPos.y - playerHeight / 2.0;
             const feetPosZ = bodyPos.z;

             // Get camera rotation (Y-axis only is usually needed for server)
             // Use camera's world quaternion directly for more robustness
             const cameraWorldQuaternion = new THREE.Quaternion();
             camera.getWorldQuaternion(cameraWorldQuaternion);
             const cameraRotation = new THREE.Euler().setFromQuaternion(cameraWorldQuaternion, 'YXZ'); // Use YXZ order
             const currentRotationY = cameraRotation.y;

             // Check thresholds for sending update against last *sent* or initial data
             const positionThresholdSq = CONFIG?.PLAYER_MOVE_THRESHOLD_SQ || 0.0001;
             const rotationThreshold = 0.01; // Radians (~0.6 degrees)

             const lastSentX = localPlayerData.lastSentX ?? localPlayerData.x ?? 0;
             const lastSentY = localPlayerData.lastSentY ?? localPlayerData.y ?? 0;
             const lastSentZ = localPlayerData.lastSentZ ?? localPlayerData.z ?? 0;
             const lastSentRotY = localPlayerData.lastSentRotationY ?? localPlayerData.rotationY ?? 0;

             const positionChanged = (
                 (feetPosX - lastSentX) ** 2 +
                 (feetPosY - lastSentY) ** 2 +
                 (feetPosZ - lastSentZ) ** 2
             ) > positionThresholdSq;

              // Calculate shortest angle difference for rotation
             let rotationDiff = currentRotationY - lastSentRotY;
             rotationDiff = Math.atan2(Math.sin(rotationDiff), Math.cos(rotationDiff)); // Normalize to [-PI, PI]
             const rotationChanged = Math.abs(rotationDiff) > rotationThreshold;


             // If position or rotation changed enough, send update
             if (positionChanged || rotationChanged) {
                 // Update local cache of *last sent* data
                 localPlayerData.lastSentX = feetPosX;
                 localPlayerData.lastSentY = feetPosY;
                 localPlayerData.lastSentZ = feetPosZ;
                 localPlayerData.lastSentRotationY = currentRotationY;

                  // Also update the main position cache if needed elsewhere (though network shouldn't rely on this)
                  // localPlayerData.x = feetPosX;
                  // localPlayerData.y = feetPosY;
                  // localPlayerData.z = feetPosZ;
                  // localPlayerData.rotationY = currentRotationY;

                 // Send update to server
                 if (Network) {
                     Network.sendPlayerUpdate({
                         x: feetPosX,
                         y: feetPosY,
                         z: feetPosZ,
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

console.log("gameLogic.js loaded (Rapier - Added Debug Logs & Robustness)");
