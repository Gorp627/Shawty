// docs/gameLogic.js (Rapier Raycast Ground Check, Impulse Jump/Dash, A/D Corrected)

// Accesses globals: camera, controls, players, localPlayerId, CONFIG, THREE, RAPIER, rapierWorld, Network, Input, UIManager, stateMachine

// --- Constants ---
const JUMP_IMPULSE_VEC = { x: 0, y: CONFIG?.JUMP_IMPULSE || 300, z: 0 };
const DASH_UP_FACTOR = 0.2; // Optional vertical dash component strength

/**
 * Updates the local player's physics BODY based on input and handles void checks.
 * @param {number} deltaTime Time since last frame.
 * @param {RAPIER.RigidBody} playerBody Reference to the local player's physics body.
 */
function updateLocalPlayer(deltaTime, playerBody) {
    // --- Guard Clauses ---
    if (!playerBody || !rapierWorld || !RAPIER) { return; } // Need physics objects
    const isPlaying = stateMachine?.is('playing');
    const isLocked = controls?.isLocked;
    const localPlayerData = localPlayerId ? players[localPlayerId] : null;
    if (!isPlaying || !isLocked || !localPlayerData) { return; }

    const isAlive = localPlayerData.health > 0;

    // --- Ground Check (Rapier Raycast) ---
    let isGrounded = false;
    if (isAlive) {
        try { // Add try-catch around physics access
            const bodyPos = playerBody.translation(); // Get body's center position
            const playerCapsuleHalfHeight = Math.max(0.01, (CONFIG?.PLAYER_HEIGHT || 1.8) / 2.0 - (CONFIG?.PLAYER_RADIUS || 0.4));
            const playerRadius = CONFIG?.PLAYER_RADIUS || 0.4;

            // Ray origin: Start slightly *below* the body center, almost at the bottom sphere center of the capsule
            const rayOrigin = { x: bodyPos.x, y: bodyPos.y - playerCapsuleHalfHeight + 0.05, z: bodyPos.z };
            const rayDirection = { x: 0, y: -1, z: 0 }; // Straight down
            const ray = new RAPIER.Ray(rayOrigin, rayDirection);
            const maxToi = playerRadius + (CONFIG?.GROUND_CHECK_DISTANCE || 0.25); // Check distance: radius + configured buffer
            const solid = true; // Hit solid objects

            // Cast the ray
            const hit = rapierWorld.castRay(ray, maxToi, solid);
            if (hit) {
                // Optional: Could check hit normal here to prevent jumping up steep slopes
                // let normal = hit.normal; -> Check if normal.y is close to 1
                isGrounded = true;
                // console.log(`Ground Hit! TOI: ${hit.toi}`); // DEBUG
            }
        } catch(e) {
            console.error("Error during ground check raycast:", e);
            isGrounded = false; // Assume not grounded if error occurs
        }
    }


    // --- Physics Body Interaction (Only if Alive) ---
    if (isAlive) {
        try { // Add try-catch
            // --- Calculate Movement Direction ---
            const moveSpeed = Input.keys['ShiftLeft'] ? (CONFIG?.MOVEMENT_SPEED_SPRINTING || 10.5) : (CONFIG?.MOVEMENT_SPEED || 7.0);
            const forward = new THREE.Vector3(), right = new THREE.Vector3();
            const moveDirectionInput = new THREE.Vector3(0, 0, 0);
            if (camera) { camera.getWorldDirection(forward); forward.y=0; forward.normalize(); right.crossVectors(camera.up, forward).normalize(); }
            else { console.error("Camera missing!"); return; }
            if(Input.keys['KeyW']){moveDirectionInput.add(forward);} if(Input.keys['KeyS']){moveDirectionInput.sub(forward);}
            if(Input.keys['KeyA']){moveDirectionInput.sub(right);} if(Input.keys['KeyD']){moveDirectionInput.add(right);}

            // --- Apply Horizontal Velocity ---
            let targetVelocityX = 0; let targetVelocityZ = 0;
            if (moveDirectionInput.lengthSq() > 0.0001){ moveDirectionInput.normalize(); targetVelocityX = moveDirectionInput.x * moveSpeed; targetVelocityZ = moveDirectionInput.z * moveSpeed; }
            const currentVelocityY = playerBody.linvel().y;
            playerBody.setLinvel({ x: targetVelocityX, y: currentVelocityY, z: targetVelocityZ }, true);

            // --- Handle Jump ---
            if (Input.keys['Space'] && isGrounded) { // Check key AND raycast result
                playerBody.applyImpulse(JUMP_IMPULSE_VEC, true); // Apply jump impulse
                console.log("Jump Impulse Applied!");
                // Note: No need to manually set isGrounded false, raycast next frame handles it.
            }

            // --- Handle Dash ---
            if (Input.requestingDash) {
                const dashMagnitude = CONFIG?.DASH_IMPULSE_MAGNITUDE || 450;
                const impulse = { x: Input.dashDirection.x * dashMagnitude, y: Input.dashDirection.y * dashMagnitude * DASH_UP_FACTOR, z: Input.dashDirection.z * dashMagnitude };
                playerBody.applyImpulse(impulse, true);
                console.log("Dash Impulse Applied!");
                Input.requestingDash = false; // Consume the flag
            }

        } catch (e) {
            console.error("Error applying input physics:", e);
        } // End try-catch for input physics

    } else { // If Dead
        try { // Add try-catch
            if (playerBody.setLinvel) playerBody.setLinvel({x:0,y:0,z:0}, true);
            if (playerBody.setAngvel) playerBody.setAngvel({x:0,y:0,z:0}, true);
        } catch(e) { console.error("Error zeroing velocity on dead player:", e); }
    }


    // --- Void Check ---
    let fellIntoVoid = false;
    if (isAlive && playerBody.translation) { // Check translation method exists
        try { // Add try-catch
            const currentY = playerBody.translation().y; const currentX = playerBody.translation().x; const currentZ = playerBody.translation().z;
            if (currentY < (CONFIG.VOID_Y_LEVEL || -100)) { fellIntoVoid = true; console.log("Fell below Y level"); }
            if (!fellIntoVoid && (Math.abs(currentX) > (CONFIG.MAP_BOUNDS_X || 100) || Math.abs(currentZ) > (CONFIG.MAP_BOUNDS_Z || 100))) { fellIntoVoid = true; console.log("Fell outside bounds"); }
            if (fellIntoVoid) { console.log("Void death!"); localPlayerData.health = 0; if(UIManager) UIManager.updateHealthBar(0); if(Network) Network.sendVoidDeath(); if (playerBody.setLinvel) playerBody.setLinvel({x:0,y:0,z:0}, true); if (playerBody.setAngvel) playerBody.setAngvel({x:0,y:0,z:0}, true); }
        } catch (e) { console.error("Error during void check:", e); }
    }

    // --- Player Collision handled by Rapier ---

    // --- Send Network Updates ---
    const controlsObject = controls?.getObject();
    if (playerBody.translation && controlsObject && localPlayerData) { // Check required objects exist
         try { // Add try-catch
             const playerHeight = CONFIG?.PLAYER_HEIGHT || 1.8; const bodyPos = playerBody.translation();
             const logicalPosition = { x: bodyPos.x, y: bodyPos.y - playerHeight / 2.0, z: bodyPos.z }; // Feet Y from body center
             const currentRotation = new THREE.Euler().setFromQuaternion(controlsObject.quaternion,'YXZ'); const currentRotationY = currentRotation.y;
             const pTSq = CONFIG?.PLAYER_MOVE_THRESHOLD_SQ || 0.0001; const rTh = 0.01;
             const posChanged = new THREE.Vector3(logicalPosition.x, logicalPosition.y, logicalPosition.z).distanceToSquared(new THREE.Vector3(localPlayerData.x??0, localPlayerData.y??0, localPlayerData.z??0)) > pTSq;
             const rotChanged = Math.abs(currentRotationY - (localPlayerData.rotationY??0)) > rTh;
             if (posChanged || rotChanged) {
                 localPlayerData.x = logicalPosition.x; localPlayerData.y = logicalPosition.y; localPlayerData.z = logicalPosition.z; localPlayerData.rotationY = currentRotationY;
                 if (Network) Network.sendPlayerUpdate({ x: localPlayerData.x, y: localPlayerData.y, z: localPlayerData.z, rotationY: localPlayerData.rotationY });
             }
         } catch(e) { console.error("Error during network update data calculation:", e); }
    }

} // End updateLocalPlayer


console.log("gameLogic.js loaded (Using Rapier Raycast Ground Check)");
