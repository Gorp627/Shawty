// docs/gameLogic.js (Rapier - Refined Ground Check & Inputs)

// Accesses globals: camera, controls, players, localPlayerId, CONFIG, THREE, RAPIER, rapierWorld, Network, Input, UIManager, stateMachine

// --- Constants ---
const JUMP_IMPULSE = { x: 0, y: CONFIG?.JUMP_IMPULSE || 300, z: 0 }; // Jump impulse vector
const DASH_UP_FACTOR = 0.1; // Reduced vertical dash impulse factor
const GROUND_CHECK_BUFFER = 0.2; // How much further than capsule bottom the ray checks

/**
 * Updates the local player's physics BODY based on input and handles void checks.
 * @param {number} _deltaTime Time since last frame (unused currently - physics uses fixed step).
 * @param {RAPIER.RigidBody} playerBody Reference to the local player's physics body.
 */
function updateLocalPlayer(_deltaTime, playerBody) {
    // --- Guard Clauses ---
    if (!playerBody || !rapierWorld || !RAPIER) { console.warn("updateLP skipped: Missing physics objects"); return; }
    const isPlaying = stateMachine?.is('playing');
    const isLocked = controls?.isLocked;
    const localPlayerData = localPlayerId ? players[localPlayerId] : null;
    if (!isPlaying || !isLocked || !localPlayerData) { return; }

    const isAlive = localPlayerData.health > 0;

    // --- Ground Check (Rapier Raycast) ---
    let isGrounded = false;
    if (isAlive) {
        try {
            const bodyPos = playerBody.translation();
            const playerHeight = CONFIG?.PLAYER_HEIGHT || 1.8;
            const playerRadius = CONFIG?.PLAYER_RADIUS || 0.4;
            // Capsule bottom sphere center Y = bodyCenterY - capsuleHalfHeight
            const capsuleHalfHeight = Math.max(0.01, playerHeight / 2.0 - playerRadius);
            const bottomSphereCenterY = bodyPos.y - capsuleHalfHeight;

            // Ray origin: Start AT the bottom sphere center of the capsule
            const rayOrigin = { x: bodyPos.x, y: bottomSphereCenterY, z: bodyPos.z };
            const rayDirection = { x: 0, y: -1, z: 0 }; // Straight down
            const ray = new RAPIER.Ray(rayOrigin, rayDirection);
            // Check distance: Radius of bottom sphere + a small buffer
            const maxToi = playerRadius + GROUND_CHECK_BUFFER;
            const solid = true; // Hit solid objects

            const hit = rapierWorld.castRay(ray, maxToi, solid);
            if (hit) {
                isGrounded = true;
                // console.log(`Ground Hit! TOI: ${hit.toi.toFixed(3)} <= Max: ${maxToi.toFixed(3)}`); // DEBUG
            } else {
                // console.log("Ground MISS"); // DEBUG
            }
        } catch(e) { console.error("Error during ground check:", e); isGrounded = false; }
    }

    // --- Physics Body Interaction (Only if Alive) ---
    if (isAlive) {
        try {
            // --- Calculate Movement Direction ---
            const currentVel = playerBody.linvel(); // Get current velocity
            const moveSpeed = Input.keys['ShiftLeft'] ? (CONFIG?.MOVEMENT_SPEED_SPRINTING || 10.5) : (CONFIG?.MOVEMENT_SPEED || 7.0);
            const forward = new THREE.Vector3(), right = new THREE.Vector3();
            const moveDirectionInput = new THREE.Vector3(0, 0, 0);
            if (camera) { camera.getWorldDirection(forward); forward.y=0; forward.normalize(); right.crossVectors(camera.up, forward).normalize(); }
            else { console.error("Camera missing!"); return; }
            if(Input.keys['KeyW']){moveDirectionInput.add(forward);} if(Input.keys['KeyS']){moveDirectionInput.sub(forward);}
            if(Input.keys['KeyA']){moveDirectionInput.sub(right);} if(Input.keys['KeyD']){moveDirectionInput.add(right);} // A/D Corrected

            // --- Apply Horizontal Velocity ---
            let targetVelocityX = currentVel.x; // Start with current vel
            let targetVelocityZ = currentVel.z;
            if (moveDirectionInput.lengthSq() > 0.0001){
                moveDirectionInput.normalize();
                targetVelocityX = moveDirectionInput.x * moveSpeed;
                targetVelocityZ = moveDirectionInput.z * moveSpeed;
                // Consider applying force instead of setting velocity for smoother control?
                // playerBody.resetForces(true);
                // playerBody.addForce({x: moveDirectionInput.x * moveForce, y: 0, z: moveDirectionInput.z * moveForce}, true);
            }
            // Preserve Y velocity from gravity/previous jump impulse
            playerBody.setLinvel({ x: targetVelocityX, y: currentVel.y, z: targetVelocityZ }, true);

            // --- Handle Jump ---
            if (Input.keys['Space'] && isGrounded) {
                // Apply impulse only once per ground contact essentially
                // Prevent applying if already moving up significantly from a jump
                if (currentVel.y < 1.0) { // Check if not already moving up fast
                    playerBody.applyImpulse(JUMP_IMPULSE, true);
                    console.log("Jump Impulse Applied!");
                     // Immediately mark as not grounded to prevent double jump in same physics step if needed
                    // isGrounded = false; // Usually not needed if input check is robust
                }
            }

            // --- Handle Dash ---
            if (Input.requestingDash) {
                const dashMagnitude = CONFIG?.DASH_IMPULSE_MAGNITUDE || 450;
                const impulse = { x: Input.dashDirection.x * dashMagnitude, y: Input.dashDirection.y * dashMagnitude * DASH_UP_FACTOR, z: Input.dashDirection.z * dashMagnitude };
                playerBody.applyImpulse(impulse, true);
                console.log("Dash Impulse Applied!");
                Input.requestingDash = false; // Consume the flag
            }

        } catch (e) { console.error("Error applying input physics:", e); }

    } else { // If Dead
        try { if (playerBody.setLinvel) playerBody.setLinvel({x:0,y:0,z:0}, true); if (playerBody.setAngvel) playerBody.setAngvel({x:0,y:0,z:0}, true); }
        catch(e) { console.error("Error zeroing velocity:", e); }
    }

    // --- Void Check ---
    let fellIntoVoid = false;
    if (playerBody.translation) { // Check only if body exists
        try { const currentY = playerBody.translation().y; const currentX = playerBody.translation().x; const currentZ = playerBody.translation().z;
            if (currentY < (CONFIG.VOID_Y_LEVEL || -100)) { fellIntoVoid = true; console.log("Fell below Y level"); }
            if (!fellIntoVoid && (Math.abs(currentX) > (CONFIG.MAP_BOUNDS_X || 100) || Math.abs(currentZ) > (CONFIG.MAP_BOUNDS_Z || 100))) { fellIntoVoid = true; console.log("Fell outside bounds"); }
            if (fellIntoVoid && isAlive) { // Only trigger death once
                 console.log("Void death!"); localPlayerData.health = 0;
                 if(UIManager) UIManager.updateHealthBar(0); if(Network) Network.sendVoidDeath();
                 playerBody.setLinvel({x:0,y:0,z:0}, true); playerBody.setAngvel({x:0,y:0,z:0}, true);
            }
        } catch (e) { console.error("Error during void check:", e); }
    }

    // --- Send Network Updates ---
    const controlsObject = controls?.getObject();
    if (playerBody.translation && controlsObject && localPlayerData) {
         try { const playerHeight = CONFIG?.PLAYER_HEIGHT || 1.8; const bodyPos = playerBody.translation(); const logicalPosition = { x: bodyPos.x, y: bodyPos.y - playerHeight / 2.0, z: bodyPos.z }; const currentRotation = new THREE.Euler().setFromQuaternion(controlsObject.quaternion,'YXZ'); const currentRotationY = currentRotation.y; const pTSq = CONFIG?.PLAYER_MOVE_THRESHOLD_SQ || 0.0001; const rTh = 0.01; const posChanged = new THREE.Vector3(logicalPosition.x, logicalPosition.y, logicalPosition.z).distanceToSquared(new THREE.Vector3(localPlayerData.x??0, localPlayerData.y??0, localPlayerData.z??0)) > pTSq; const rotChanged = Math.abs(currentRotationY - (localPlayerData.rotationY??0)) > rTh; if (posChanged || rotChanged) { localPlayerData.x = logicalPosition.x; localPlayerData.y = logicalPosition.y; localPlayerData.z = logicalPosition.z; localPlayerData.rotationY = currentRotationY; if (Network) Network.sendPlayerUpdate({ x: localPlayerData.x, y: localPlayerData.y, z: localPlayerData.z, rotationY: localPlayerData.rotationY }); } }
         catch(e) { console.error("Error during network update calc:", e); }
    }

} // End updateLocalPlayer

console.log("gameLogic.js loaded (Rapier Raycast Ground Check, Impulse Jump/Dash, A/D Corrected)");
