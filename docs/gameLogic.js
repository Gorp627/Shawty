// docs/gameLogic.js (Rapier - Add Shooting, Rocket Jump, Shockwave)

// Accesses globals: camera, controls, players, localPlayerId, CONFIG, THREE, RAPIER, rapierWorld, Network, Input, UIManager, stateMachine, Effects, scene

// --- Constants from CONFIG ---
const JUMP_IMPULSE_VALUE = CONFIG?.JUMP_IMPULSE || 300;
const DASH_IMPULSE_MAGNITUDE = CONFIG?.DASH_IMPULSE_MAGNITUDE || 450;
const DASH_UP_FACTOR = 0.1;
const GROUND_CHECK_BUFFER = CONFIG?.GROUND_CHECK_DISTANCE || 0.25;
const SHOOT_COOLDOWN_MS = CONFIG?.SHOOT_COOLDOWN || 150;
const BULLET_DMG = CONFIG?.BULLET_DAMAGE || 25;
const BULLET_MAX_RANGE = CONFIG?.BULLET_RANGE || 300;
const ROCKET_JUMP_IMPULSE = CONFIG?.ROCKET_JUMP_FORCE || 350;
const ROCKET_JUMP_THRESH = CONFIG?.ROCKET_JUMP_ANGLE_THRESHOLD || -0.7;
const DEATH_SHOCKWAVE_FORCE = CONFIG?.DEATH_EXPLOSION_FORCE || 600.0;
const DEATH_SHOCKWAVE_RADIUS = CONFIG?.DEATH_EXPLOSION_RADIUS || 15.0;

/**
 * Updates the local player's physics BODY based on input and handles shooting, effects, void checks.
 * @param {number} deltaTime Time since last frame.
 * @param {RAPIER.RigidBody} playerBody Reference to the local player's dynamic physics body.
 */
function updateLocalPlayer(deltaTime, playerBody) {
    // --- Guard Clauses ---
    if (!playerBody || !rapierWorld || !RAPIER || !camera || !controls) { return; }
    const isPlaying = stateMachine?.is('playing');
    const isLocked = controls?.isLocked;
    const localPlayerData = localPlayerId ? players[localPlayerId] : null;

    // Only run logic if playing, controls locked, and data exists
    if (!isPlaying || !isLocked || !localPlayerData) { return; }

    const isAlive = localPlayerData.health > 0;

    // --- Ground Check (Raycast) ---
    let isGrounded = false;
    if (isAlive) {
        try {
            const bodyPos = playerBody.translation();
            const playerHeight = CONFIG.PLAYER_HEIGHT;
            const playerRadius = CONFIG.PLAYER_RADIUS;
            const capsuleHalfHeight = Math.max(0.01, playerHeight / 2.0 - playerRadius);
            const capsuleBottomY = bodyPos.y - capsuleHalfHeight - playerRadius;
            const rayOrigin = { x: bodyPos.x, y: capsuleBottomY + 0.05, z: bodyPos.z };
            const rayDirection = { x: 0, y: -1, z: 0 };
            const ray = new RAPIER.Ray(rayOrigin, rayDirection);
            const maxToi = GROUND_CHECK_BUFFER + 0.05;
            const hit = rapierWorld.castRay(ray, maxToi, true, RAPIER.InteractionGroup.all(), playerBody.collider(0)); // Exclude self

            if (hit != null) {
                isGrounded = true;
            }
        } catch(e) { console.error("!!! Rapier ground check error:", e); isGrounded = false; }
    }

    // --- Apply Input Forces/Impulses (Only if Alive) ---
    if (isAlive) {
        try {
            const currentVel = playerBody.linvel();
            const moveSpeed = Input.keys['ShiftLeft'] ? (CONFIG?.MOVEMENT_SPEED_SPRINTING || 10.5) : (CONFIG?.MOVEMENT_SPEED || 7.0);

            // --- Horizontal Movement (using setLinvel) ---
            const forward = new THREE.Vector3(), right = new THREE.Vector3();
            const moveDirectionInput = new THREE.Vector3(0, 0, 0);
            camera.getWorldDirection(forward); forward.y = 0; forward.normalize();
            right.crossVectors(camera.up, forward).normalize();

            if (Input.keys['KeyW']) { moveDirectionInput.add(forward); }
            if (Input.keys['KeyS']) { moveDirectionInput.sub(forward); }
            if (Input.keys['KeyA']) { moveDirectionInput.sub(right); }
            if (Input.keys['KeyD']) { moveDirectionInput.add(right); }

            let targetVelocityX = 0, targetVelocityZ = 0;
            if (moveDirectionInput.lengthSq() > 0.0001) {
                moveDirectionInput.normalize();
                targetVelocityX = moveDirectionInput.x * moveSpeed;
                targetVelocityZ = moveDirectionInput.z * moveSpeed;
            }
            playerBody.setLinvel({ x: targetVelocityX, y: currentVel.y, z: targetVelocityZ }, true);

            // --- Handle Jump ---
            if (Input.keys['Space'] && isGrounded) {
                 if (currentVel.y < 1.0) { // Prevent jump spam while moving up
                    playerBody.applyImpulse({ x: 0, y: JUMP_IMPULSE_VALUE, z: 0 }, true);
                    isGrounded = false; // Assume left ground
                 }
            }

            // --- Handle Dash ---
            if (Input.requestingDash) {
                 const impulse = {
                     x: Input.dashDirection.x * DASH_IMPULSE_MAGNITUDE,
                     y: DASH_IMPULSE_MAGNITUDE * DASH_UP_FACTOR, // Add slight upward boost
                     z: Input.dashDirection.z * DASH_IMPULSE_MAGNITUDE
                 };
                 playerBody.applyImpulse(impulse, true);
                 Input.requestingDash = false; // Consume dash request
                 // TODO: Play dash sound? Effects.playSound(...)
            }

            // --- Handle Shooting ---
            const now = Date.now();
            if (Input.mouseButtons[0] && now > (window.lastShootTime || 0) + SHOOT_COOLDOWN_MS) {
                 window.lastShootTime = now; // Update last shoot time immediately
                 performShoot(playerBody); // Pass player body for rocket jump logic
                 Input.mouseButtons[0] = false; // Consume the click (for semi-auto feel, remove for auto)
            }

        } catch (e) { console.error("!!! Error applying input physics:", e); }
    } // End if(isAlive) for movement/actions

    // --- Void Check ---
    try {
        const currentBodyPos = playerBody.translation();
        // Ensure CONFIG.VOID_Y_LEVEL exists, otherwise use a sensible default
        const voidLevel = (typeof CONFIG !== 'undefined' && typeof CONFIG.VOID_Y_LEVEL === 'number') ? CONFIG.VOID_Y_LEVEL : -100;
        const boundsX = (typeof CONFIG !== 'undefined' && typeof CONFIG.MAP_BOUNDS_X === 'number') ? CONFIG.MAP_BOUNDS_X : 100;
        const boundsZ = (typeof CONFIG !== 'undefined' && typeof CONFIG.MAP_BOUNDS_Z === 'number') ? CONFIG.MAP_BOUNDS_Z : 100;

        const fellIntoVoid = currentBodyPos.y < voidLevel;
        const outOfBounds = !fellIntoVoid && (Math.abs(currentBodyPos.x) > boundsX || Math.abs(currentBodyPos.z) > boundsZ);

        if ((fellIntoVoid || outOfBounds) && isAlive) {
            console.log(`Player ${localPlayerId} fell into void or out of bounds.`);
            localPlayerData.health = 0;
            UIManager?.updateHealthBar(0);
            Network?.sendVoidDeath(); // Notify server
            // Physics state handled by server respawn teleport
        }
    } catch (e) { console.error("!!! Error during void check:", e); }

    // --- Sync Local Player Visual Mesh to Physics Body ---
    if (localPlayerData?.mesh) {
        try {
            const bodyPos = playerBody.translation();
            const bodyRot = playerBody.rotation(); // Rapier Quaternion

            // Position mesh based on physics body center
            // Adjust Y based on where the model's origin is (e.g., at feet or center)
            // Assuming player model origin is at the FEET:
            const playerHeight = CONFIG.PLAYER_HEIGHT || 1.8;
            localPlayerData.mesh.position.set(bodyPos.x, bodyPos.y - playerHeight / 2.0, bodyPos.z);

            // Rotate mesh based on camera horizontal rotation (Y-axis only)
            const cameraEuler = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ');
            localPlayerData.mesh.rotation.y = cameraEuler.y;

        } catch(e) { console.error("!!! Error syncing local player mesh:", e); }
    }


    // --- Send Network Updates ---
    if (playerBody && isAlive) { // Only send updates if alive
         try {
             const playerHeight = CONFIG.PLAYER_HEIGHT;
             const bodyPos = playerBody.translation();
             const feetPos = { x: bodyPos.x, y: bodyPos.y - playerHeight / 2.0, z: bodyPos.z };
             const cameraEuler = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ');
             const currentRotationY = cameraEuler.y;

             const positionThresholdSq = CONFIG.PLAYER_MOVE_THRESHOLD_SQ;
             const rotationThreshold = 0.01;

             // Check if position/rotation changed enough compared to last *sent* state (stored in localPlayerData)
             const positionChanged = (
                 (feetPos.x - (localPlayerData.x ?? 0)) ** 2 +
                 (feetPos.y - (localPlayerData.y ?? 0)) ** 2 +
                 (feetPos.z - (localPlayerData.z ?? 0)) ** 2
             ) > positionThresholdSq;
             const rotationChanged = Math.abs(currentRotationY - (localPlayerData.rotationY ?? 0)) > rotationThreshold;

             if (positionChanged || rotationChanged) {
                 localPlayerData.x = feetPos.x; localPlayerData.y = feetPos.y; localPlayerData.z = feetPos.z;
                 localPlayerData.rotationY = currentRotationY;
                 Network?.sendPlayerUpdate({ x: feetPos.x, y: feetPos.y, z: feetPos.z, rotationY: currentRotationY });
             }
         } catch(e) { console.error("!!! Error calculating/sending network update:", e); }
    }

} // End updateLocalPlayer

/** Performs shooting logic: Raycast, send hit, trigger effects/rocket jump */
function performShoot(playerBody) {
     if (!camera || !Network || !scene) return;
     // console.log("Bang!"); // DEBUG

     // Play Gun Sound (non-positional, attached to camera/listener)
     if (window.gunSoundBuffer) Effects.playSound(window.gunSoundBuffer, null, false, 0.4);

     // --- Raycast ---
     const raycaster = new THREE.Raycaster();
     const origin = new THREE.Vector3();
     const direction = new THREE.Vector3();
     camera.getWorldPosition(origin); // Ray starts from camera position
     camera.getWorldDirection(direction); // Ray goes in camera look direction

     raycaster.set(origin, direction);
     raycaster.far = BULLET_MAX_RANGE; // Set max range

     // Find potential targets: remote player meshes and the map mesh
     const potentialTargets = [];
     for (const id in window.players) {
          if (id !== localPlayerId && window.players[id]?.mesh) {
              potentialTargets.push(window.players[id].mesh);
          }
     }
     // Add map mesh if needed for bullet impacts on walls (optional)
     // if (window.mapMesh) potentialTargets.push(window.mapMesh);

     // Perform raycast
     const intersects = raycaster.intersectObjects(potentialTargets, true); // `true` checks descendants

     let hitDetected = false;
     if (intersects.length > 0) {
         // Find the closest valid hit (could hit multiple things)
         for (const hit of intersects) {
             // Check if we hit a player mesh
             let hitObject = hit.object;
             let hitPlayerId = null;
             // Traverse up to find the parent with player data if we hit a submesh
             while(hitObject && !hitPlayerId) {
                 if (hitObject.userData?.isPlayer && hitObject.userData?.entityId !== localPlayerId) {
                     hitPlayerId = hitObject.userData.entityId;
                 }
                 hitObject = hitObject.parent;
             }

             if (hitPlayerId) {
                 console.log(`Hit player ${hitPlayerId} at distance ${hit.distance}`);
                 // Send hit notification to server
                 Network.sendPlayerHit({ targetId: hitPlayerId, damage: BULLET_DMG });
                 hitDetected = true;
                 // TODO: Create visual hit effect at hit.point
                 // Effects.createImpact(hit.point, hit.face?.normal);
                 break; // Stop checking after hitting the first player
             } else {
                  // Hit something else (e.g., map) - Optional: Create impact effect
                  // console.log(`Hit map/other object at distance ${hit.distance}`);
                  // Effects.createImpact(hit.point, hit.face?.normal);
                   // break; // Stop checking after hitting anything? Or allow shooting through minor objects?
             }
         }
     }

     // --- Rocket Jump Logic ---
     if (Input.keys['KeyC']) { // Check if 'C' key is held
         const worldDown = new THREE.Vector3(0, -1, 0);
         const dotProduct = direction.dot(worldDown); // Check how much camera is looking down
         // console.log("Shooting Down Dot:", dotProduct.toFixed(2)); // DEBUG
         if (dotProduct > -ROCKET_JUMP_THRESH) { // Dot product > ~0.7 means pointing sufficiently down
             console.log("Rocket Jump Triggered!");
             playerBody.applyImpulse({ x: 0, y: ROCKET_JUMP_IMPULSE, z: 0 }, true);
             // TODO: Play specific rocket jump sound/effect?
             // Effects.playSound(...)
         }
     }

     // Optional: Tell server we shot for tracer effects (even if no hit)
     // Network.sendShotFired({ origin: origin.toArray(), direction: direction.toArray() });
}


/** Applies physics impulse to nearby players on death */
function applyShockwave(originPosition, deadPlayerId) {
    if (!RAPIER || !rapierWorld || !window.players || !currentGameInstance?.playerRigidBodyHandles) return;
    console.log(`Applying shockwave from dead player ${deadPlayerId} at`, originPosition);

    const origin = new THREE.Vector3(originPosition.x, originPosition.y, originPosition.z);

    for (const targetId in window.players) {
        if (targetId === deadPlayerId) continue; // Don't apply to self

        const targetPlayer = window.players[targetId];
        const targetBodyHandle = currentGameInstance.playerRigidBodyHandles[targetId];
        if (!targetBodyHandle) continue; // No physics body for this player

        try {
            const targetBody = rapierWorld.getRigidBody(targetBodyHandle);
            if (!targetBody || targetPlayer.health <= 0) continue; // Don't affect other dead players or invalid bodies

            const targetPos = targetBody.translation(); // Rapier physics position
            const direction = new THREE.Vector3().subVectors(targetPos, origin);
            const distance = direction.length();

            if (distance < DEATH_SHOCKWAVE_RADIUS && distance > 0.01) {
                const forceFalloff = 1.0 - (distance / DEATH_SHOCKWAVE_RADIUS); // Linear falloff
                const impulseMagnitude = DEATH_SHOCKWAVE_FORCE * forceFalloff;
                direction.normalize(); // Get direction vector

                // Apply impulse (more immediate effect than force)
                targetBody.applyImpulse({
                    x: direction.x * impulseMagnitude,
                    y: direction.y * impulseMagnitude * 0.5 + impulseMagnitude * 0.3, // Add some upward boost based on magnitude
                    z: direction.z * impulseMagnitude
                }, true); // Wake up body

                console.log(`Applied shockwave impulse to ${targetId} (Dist: ${distance.toFixed(1)}, Mag: ${impulseMagnitude.toFixed(1)})`);
            }
        } catch (e) {
            console.error(`Error applying shockwave to player ${targetId}:`, e);
        }
    }
}

console.log("gameLogic.js loaded (Added Shooting, RJ, Shockwave)");
