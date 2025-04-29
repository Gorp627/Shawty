// docs/gameLogic.js (Rapier - Debug Movement/Jump/Dash)

// Accesses globals: camera, controls, players, localPlayerId, CONFIG, THREE, RAPIER, rapierWorld, Network, Input, UIManager, stateMachine

// --- Constants ---
const JUMP_IMPULSE_VALUE = CONFIG?.JUMP_IMPULSE || 300;
const DASH_IMPULSE_MAGNITUDE = CONFIG?.DASH_IMPULSE_MAGNITUDE || 450;
const DASH_UP_FACTOR = 0.1; // How much upward impulse to add during dash
const GROUND_CHECK_DISTANCE = CONFIG?.GROUND_CHECK_DISTANCE || 0.25; // Extra distance below capsule bottom for ground check

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
    if (!isPlaying || !isLocked || !localPlayerData) {
        // console.log(`updateLocalPlayer skipped: isPlaying=${isPlaying}, isLocked=${isLocked}, hasData=${!!localPlayerData}`); // Debug skip reason
        return;
    }

    let currentPos, currentVel;
    try {
        currentPos = playerBody.translation();
        currentVel = playerBody.linvel(); // Get current linear velocity
    } catch(e) {
        console.error("!!! Error accessing playerBody properties at start of updateLocalPlayer:", e);
        return; // Stop if body access fails
    }

    const isAlive = localPlayerData.health > 0;

    // --- Ground Check (Using Rapier Raycast) ---
    let isGrounded = false;
    if (isAlive) { // Only check ground if alive
        try {
            const bodyPos = currentPos; // Use position fetched earlier

            const playerHeight = CONFIG?.PLAYER_HEIGHT || 1.8;
            const playerRadius = CONFIG?.PLAYER_RADIUS || 0.4;
            const capsuleHalfHeight = Math.max(0.01, playerHeight / 2.0 - playerRadius);
            const capsuleBottomCenterY = bodyPos.y - capsuleHalfHeight;
            const rayOriginY = capsuleBottomCenterY - 0.01; // Start just below the capsule bottom
            const rayOrigin = { x: bodyPos.x, y: rayOriginY, z: bodyPos.z };
            const rayDirection = { x: 0, y: -1, z: 0 }; // Straight down

            const ray = new RAPIER.Ray(rayOrigin, rayDirection);
            const maxToi = GROUND_CHECK_DISTANCE + 0.01; // Total distance to check downwards
            const solid = true;
            const groups = undefined;
            const colliderToExclude = playerBody.collider(0); // Exclude the player's own collider

            const hit = rapierWorld.castRay(ray, maxToi, solid, undefined, groups, colliderToExclude);

            if (hit != null && hit.toi > 0) {
                isGrounded = true;
                // console.log(`Ground Hit! TOI: ${hit.toi.toFixed(3)}`); // DEBUG
            } else {
                 // console.log("Not Grounded"); // DEBUG
            }
        } catch(e) {
            console.error("!!! Rapier ground check raycast error:", e);
            isGrounded = false;
        }
    }
    // console.log("IsGrounded:", isGrounded); // DEBUG: Log ground status every frame


    // --- Apply Input Forces/Impulses (Only if Alive) ---
    if (isAlive) {
        try {
            // --- Horizontal Movement ---
            const isSprinting = Input.keys['ShiftLeft'] && (Input.keys['KeyW'] || Input.keys['KeyS'] || Input.keys['KeyA'] || Input.keys['KeyD']);
            const moveSpeed = isSprinting ? (CONFIG?.MOVEMENT_SPEED_SPRINTING || 10.5) : (CONFIG?.MOVEMENT_SPEED || 7.0);

            const forward = new THREE.Vector3(), right = new THREE.Vector3();
            const moveDirectionInput = new THREE.Vector3(0, 0, 0);

            if (camera && controls && controls.isLocked) {
                controls.getDirection(forward); // Gets the direction the camera is looking (-Z local axis)
                forward.y = 0;
                forward.normalize();

                // Calculate right vector based on world UP and camera FORWARD
                right.crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize(); // Right = Forward x WorldUp
                // console.log(`Forward: ${forward.x.toFixed(2)}, ${forward.z.toFixed(2)} | Right: ${right.x.toFixed(2)}, ${right.z.toFixed(2)}`); // DEBUG VECTORS
            } else {
                // No movement if camera/controls invalid or not locked
            }

            // Calculate input direction based on keys
            if (Input.keys['KeyW']) { moveDirectionInput.add(forward); }
            if (Input.keys['KeyS']) { moveDirectionInput.sub(forward); }
            if (Input.keys['KeyA']) { moveDirectionInput.add(right); } // Add right for left movement (A)
            if (Input.keys['KeyD']) { moveDirectionInput.sub(right); } // Subtract right for right movement (D)

             // DEBUG Input Keys
             // if (Input.keys['KeyW'] || Input.keys['KeyS'] || Input.keys['KeyA'] || Input.keys['KeyD'] ) {
             //      console.log(`Keys: W=${Input.keys['KeyW']} S=${Input.keys['KeyS']} A=${Input.keys['KeyA']} D=${Input.keys['KeyD']}`);
             // }


            // Calculate target velocity based on input
            let targetVelocityX = 0; // Default to zero if no input
            let targetVelocityZ = 0;

            if (moveDirectionInput.lengthSq() > 0.0001) { // If there is movement input
                moveDirectionInput.normalize();
                targetVelocityX = moveDirectionInput.x * moveSpeed;
                targetVelocityZ = moveDirectionInput.z * moveSpeed;
                // console.log(`Moving: TargetVel X=${targetVelocityX.toFixed(2)}, Z=${targetVelocityZ.toFixed(2)} | Input Dir: ${moveDirectionInput.x.toFixed(2)}, ${moveDirectionInput.z.toFixed(2)}`); // DEBUG
            }

            // Set linear velocity directly (keeping current Y velocity)
            playerBody.setLinvel({ x: targetVelocityX, y: currentVel.y, z: targetVelocityZ }, true);

            // --- Handle Jump ---
            if (Input.keys['Space'] && isGrounded) {
                 if (currentVel.y < 1.0) { // Allow jump even if slightly moving up
                    console.log("Applying Jump Impulse:", JUMP_IMPULSE_VALUE); // DEBUG JUMP
                    playerBody.applyImpulse({ x: 0, y: JUMP_IMPULSE_VALUE, z: 0 }, true);
                    isGrounded = false; // Assume we left the ground
                 } else {
                     console.log("Jump blocked: Already moving upwards significantly (velY:", currentVel.y.toFixed(2), ")"); // DEBUG JUMP BLOCKED
                 }
            } else if (Input.keys['Space'] && !isGrounded) {
                // console.log("Jump key pressed but not grounded."); // DEBUG JUMP FAIL
            }

            // --- Handle Dash ---
            if (Input.requestingDash) {
                console.log("Applying Dash Impulse:", DASH_IMPULSE_MAGNITUDE, "Direction:", Input.dashDirection); // DEBUG DASH
                 const impulse = {
                     x: Input.dashDirection.x * DASH_IMPULSE_MAGNITUDE,
                     y: DASH_IMPULSE_MAGNITUDE * DASH_UP_FACTOR,
                     z: Input.dashDirection.z * DASH_IMPULSE_MAGNITUDE
                 };
                 playerBody.applyImpulse(impulse, true);
                 Input.requestingDash = false; // Consume the dash request
            }

        } catch (e) {
            console.error("!!! Error applying input physics:", e);
             try { playerBody.setLinvel({ x: 0, y: 0, z: 0 }, true); } catch (resetErr) { console.error("Failed to reset velocity after error:", resetErr); }
        }

    } else { // If Dead
        // Optional: Stop movement completely if dead
         try {
             if (Math.abs(currentVel.x) > 0.1 || Math.abs(currentVel.z) > 0.1 ) { // Only set if moving horizontally
                 playerBody.setLinvel({x:0, y: currentVel.y, z:0}, true);
             }
         } catch(e) { console.error("Error setting dead player physics:", e); }
    }

    // --- Void Check (Keep as before) ---
    let fellIntoVoid = false;
    try {
        // Use position fetched at start if still valid
        if (currentPos.y < (CONFIG.VOID_Y_LEVEL || -100)) {
            fellIntoVoid = true;
        }
        if (!fellIntoVoid && (Math.abs(currentPos.x) > (CONFIG.MAP_BOUNDS_X || 100) || Math.abs(currentPos.z) > (CONFIG.MAP_BOUNDS_Z || 100))) {
             fellIntoVoid = true;
        }

        if (fellIntoVoid && isAlive) {
            console.log(`Player ${localPlayerId} fell into the void or out of bounds.`);
            localPlayerData.health = 0;
            if (UIManager) UIManager.updateHealthBar(0);
            if (Network) Network.sendVoidDeath();
        }
    } catch (e) {
        console.error("!!! Error during void check:", e);
    }

    // --- Send Network Updates (Keep as before) ---
    let controlsObject = null;
    try { controlsObject = controls?.getObject(); } catch (e) { console.error("Error getting controls object:", e); }

    if (playerBody && controlsObject && localPlayerData && isAlive) {
         try {
             const playerHeight = CONFIG?.PLAYER_HEIGHT || 1.8;
             const bodyPos = playerBody.translation(); // Center position from Rapier

             const feetPosX = bodyPos.x;
             const feetPosY = bodyPos.y - playerHeight / 2.0;
             const feetPosZ = bodyPos.z;

             const cameraWorldQuaternion = new THREE.Quaternion();
             camera.getWorldQuaternion(cameraWorldQuaternion);
             const cameraRotation = new THREE.Euler().setFromQuaternion(cameraWorldQuaternion, 'YXZ');
             const currentRotationY = cameraRotation.y;

             const positionThresholdSq = CONFIG?.PLAYER_MOVE_THRESHOLD_SQ || 0.0001;
             const rotationThreshold = 0.01;

             const lastSentX = localPlayerData.lastSentX ?? feetPosX; // Use current if first time
             const lastSentY = localPlayerData.lastSentY ?? feetPosY;
             const lastSentZ = localPlayerData.lastSentZ ?? feetPosZ;
             const lastSentRotY = localPlayerData.lastSentRotationY ?? currentRotationY;

             const positionChanged = (
                 (feetPosX - lastSentX) ** 2 +
                 (feetPosY - lastSentY) ** 2 +
                 (feetPosZ - lastSentZ) ** 2
             ) > positionThresholdSq;

             let rotationDiff = currentRotationY - lastSentRotY;
             rotationDiff = Math.atan2(Math.sin(rotationDiff), Math.cos(rotationDiff));
             const rotationChanged = Math.abs(rotationDiff) > rotationThreshold;

             if (positionChanged || rotationChanged) {
                 localPlayerData.lastSentX = feetPosX;
                 localPlayerData.lastSentY = feetPosY;
                 localPlayerData.lastSentZ = feetPosZ;
                 localPlayerData.lastSentRotationY = currentRotationY;

                 if (Network) {
                     Network.sendPlayerUpdate({
                         x: feetPosX,
                         y: feetPosY,
                         z: feetPosZ,
                         rotationY: currentRotationY
                     });
                 }
                 // console.log("Sent Player Update"); // DEBUG
             }
         } catch(e) {
             console.error("!!! Error calculating or sending network update:", e);
         }
    }

} // End updateLocalPlayer

console.log("gameLogic.js loaded (Rapier - Debug Movement/Jump/Dash)");
