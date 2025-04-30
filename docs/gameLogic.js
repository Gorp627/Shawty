// --- START OF FULL gameLogic.js FILE ---
// docs/gameLogic.js (Rapier - Ground Check Fix, Debug Logs)

// Accesses globals: players, localPlayerId, CONFIG, THREE, RAPIER, rapierWorld, Network, Input, UIManager, stateMachine, Effects, scene

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
 * @param {THREE.PerspectiveCamera} camera Reference to the main camera.
 * @param {THREE.PointerLockControls} controls Reference to the pointer lock controls.
 */
function updateLocalPlayer(deltaTime, playerBody, camera, controls) {

    // --- Guard Clauses ---
    if (!playerBody || !rapierWorld || !RAPIER || !camera || !controls) {
        console.warn("[GameLogic Update] Returning early - Missing prerequisites (check passed args)");
        return;
    }
    const isPlaying = stateMachine?.is('playing');
    const isLocked = controls?.isLocked;
    const localPlayerData = localPlayerId ? players[localPlayerId] : null;

    if (!isPlaying || !isLocked || !localPlayerData) {
        return;
    }

    const isAlive = localPlayerData.health > 0;

    // --- Ground Check (Raycast) ---
    let isGrounded = false;
    if (isAlive) {
        try {
            const bodyPos = playerBody.translation();
            const playerHeight = CONFIG.PLAYER_HEIGHT;
            const playerRadius = CONFIG.PLAYER_RADIUS;
            // Calculate the bottom of the capsule's cylindrical part
            const capsuleCylinderHalfHeight = Math.max(0.01, playerHeight / 2.0 - playerRadius);
            // Start the ray slightly above the absolute bottom sphere center
            const rayOriginY = (bodyPos.y - capsuleCylinderHalfHeight - playerRadius) + 0.05;
            const rayOrigin = { x: bodyPos.x, y: rayOriginY, z: bodyPos.z };
            const rayDirection = { x: 0, y: -1, z: 0 };
            const ray = new RAPIER.Ray(rayOrigin, rayDirection);
            // How far down to check: a small buffer distance
            const maxToi = GROUND_CHECK_BUFFER + 0.05;

            // ***** FIX: REMOVE InteractionGroup.all() *****
            const hit = rapierWorld.castRay(
                ray,
                maxToi,
                true, // Query solid shapes
                undefined, // interactionGroups (use default filtering)
                undefined, // filter flags
                playerBody.collider(0) // Collider to exclude (player's own)
            );
            // ********************************************

            if (hit != null) {
                isGrounded = true;
                // console.log("[GameLogic Ground Check] Ground detected!"); // Uncomment if needed
            }
        } catch(e) {
            console.error("!!! Rapier ground check error:", e); // Log the actual error
            isGrounded = false;
        }
    }
     // console.log(`[GameLogic Update] IsGrounded: ${isGrounded}`); // Uncomment if needed

    // --- Apply Input Forces/Impulses (Only if Alive) ---
    if (isAlive) {
        try {
            const currentVel = playerBody.linvel();
            const moveSpeed = Input.keys['ShiftLeft'] ? (CONFIG?.MOVEMENT_SPEED_SPRINTING || 10.5) : (CONFIG?.MOVEMENT_SPEED || 7.0);

            // console.log("[GameLogic Update] Input Keys:", JSON.stringify(Input.keys)); // Uncomment if needed
            // console.log("[GameLogic Update] Input Mouse:", JSON.stringify(Input.mouseButtons)); // Uncomment if needed

            // --- Horizontal Movement (using setLinvel) ---
            const forward = new THREE.Vector3(), right = new THREE.Vector3();
            const moveDirectionInput = new THREE.Vector3(0, 0, 0);
            camera.getWorldDirection(forward); forward.y = 0; forward.normalize();
            right.crossVectors(camera.up, forward).normalize();

            if (Input.keys['KeyW']) { moveDirectionInput.add(forward); }
            if (Input.keys['KeyS']) { moveDirectionInput.sub(forward); }
            // Keep Original A/D logic (Subtract Right for Left)
            if (Input.keys['KeyA']) { moveDirectionInput.sub(right); }
            if (Input.keys['KeyD']) { moveDirectionInput.add(right); }


            let targetVelocityX = 0, targetVelocityZ = 0;
            if (moveDirectionInput.lengthSq() > 0.0001) {
                moveDirectionInput.normalize();
                targetVelocityX = moveDirectionInput.x * moveSpeed;
                targetVelocityZ = moveDirectionInput.z * moveSpeed;
                // console.log(`[GameLogic Update] Applying Movement Vel: x=${targetVelocityX.toFixed(1)}, z=${targetVelocityZ.toFixed(1)}`); // Uncomment if needed
            }
            // Apply calculated horizontal velocity, maintain existing vertical velocity
            playerBody.setLinvel({ x: targetVelocityX, y: currentVel.y, z: targetVelocityZ }, true);

            // --- Handle Jump ---
            if (Input.keys['Space'] && isGrounded) {
                 // Add a small tolerance to prevent tiny bounces stopping jump
                 if (currentVel.y < 1.0) {
                    console.log("[GameLogic Update] Applying Jump Impulse"); // Keep active for testing
                    playerBody.applyImpulse({ x: 0, y: JUMP_IMPULSE_VALUE, z: 0 }, true);
                    isGrounded = false; // Assume left ground after jump impulse
                 }
            }

            // --- Handle Dash ---
            if (Input.requestingDash) {
                 console.log("[GameLogic Update] Applying Dash Impulse"); // Keep active for testing
                 const impulse = {
                     x: Input.dashDirection.x * DASH_IMPULSE_MAGNITUDE,
                     y: DASH_IMPULSE_MAGNITUDE * DASH_UP_FACTOR,
                     z: Input.dashDirection.z * DASH_IMPULSE_MAGNITUDE
                 };
                 playerBody.applyImpulse(impulse, true);
                 Input.requestingDash = false;
            }

            // --- Handle Shooting ---
            const now = Date.now();
            if (Input.mouseButtons[0] && now > (window.lastShootTime || 0) + SHOOT_COOLDOWN_MS) {
                 console.log("[GameLogic] Shoot condition met (Click & Cooldown OK)"); // Keep active for testing
                 window.lastShootTime = now;
                 performShoot(playerBody, camera);
                 Input.mouseButtons[0] = false;
            }

        } catch (e) { console.error("!!! Error applying input physics:", e); }
    } // End if(isAlive)

    // --- Void Check ---
    try {
        const currentBodyPos = playerBody.translation();
        const voidLevel = (typeof CONFIG !== 'undefined' && typeof CONFIG.VOID_Y_LEVEL === 'number') ? CONFIG.VOID_Y_LEVEL : -100;
        const boundsX = (typeof CONFIG !== 'undefined' && typeof CONFIG.MAP_BOUNDS_X === 'number') ? CONFIG.MAP_BOUNDS_X : 100;
        const boundsZ = (typeof CONFIG !== 'undefined' && typeof CONFIG.MAP_BOUNDS_Z === 'number') ? CONFIG.MAP_BOUNDS_Z : 100;
        const fellIntoVoid = currentBodyPos.y < voidLevel;
        const outOfBounds = !fellIntoVoid && (Math.abs(currentBodyPos.x) > boundsX || Math.abs(currentBodyPos.z) > boundsZ);
        if ((fellIntoVoid || outOfBounds) && isAlive) {
            console.log(`Player ${localPlayerId} fell into void or out of bounds.`);
            localPlayerData.health = 0;
            UIManager?.updateHealthBar(0);
            Network?.sendVoidDeath();
        }
    } catch (e) { console.error("!!! Error during void check:", e); }

    // --- Sync Local Player Visual Mesh to Physics Body ---
    if (localPlayerData?.mesh) {
        try {
            const bodyPos = playerBody.translation();
            const playerHeight = CONFIG.PLAYER_HEIGHT || 1.8;
            localPlayerData.mesh.position.set(bodyPos.x, bodyPos.y - playerHeight / 2.0, bodyPos.z);
            const cameraEuler = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ');
            localPlayerData.mesh.rotation.y = cameraEuler.y;
        } catch(e) { console.error("!!! Error syncing local player mesh:", e); }
    }

    // --- Send Network Updates ---
    if (playerBody && isAlive) {
         try {
             const playerHeight = CONFIG.PLAYER_HEIGHT;
             const bodyPos = playerBody.translation();
             const feetPos = { x: bodyPos.x, y: bodyPos.y - playerHeight / 2.0, z: bodyPos.z };
             const cameraEuler = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ');
             const currentRotationY = cameraEuler.y;
             const positionThresholdSq = CONFIG.PLAYER_MOVE_THRESHOLD_SQ;
             const rotationThreshold = 0.01;
             const positionChanged = ((feetPos.x - (localPlayerData.x ?? 0)) ** 2 + (feetPos.y - (localPlayerData.y ?? 0)) ** 2 + (feetPos.z - (localPlayerData.z ?? 0)) ** 2) > positionThresholdSq;
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
function performShoot(playerBody, camera) {
     console.log("[GameLogic] performShoot called");

     if (!camera || !Network || !scene) {
        console.warn("[GameLogic] performShoot returning early: Missing camera, Network, or scene.");
        return;
     }

     if (window.gunSoundBuffer) { Effects.playSound(window.gunSoundBuffer, null, false, 0.4); }
     else { console.warn("[GameLogic] Gun sound buffer not loaded, cannot play sound."); }

     // --- Raycast ---
     const raycaster = new THREE.Raycaster();
     const origin = new THREE.Vector3();
     const direction = new THREE.Vector3();
     camera.getWorldPosition(origin);
     camera.getWorldDirection(direction);

     raycaster.set(origin, direction);
     raycaster.far = BULLET_MAX_RANGE;

     const potentialTargets = [];
     for (const id in window.players) {
          if (id !== localPlayerId && window.players[id]?.mesh) {
              potentialTargets.push(window.players[id].mesh);
          }
     }
     // if (window.mapMesh) potentialTargets.push(window.mapMesh);

     console.log(`[GameLogic] Raycasting from camera. Targets: ${potentialTargets.length}`);
     const intersects = raycaster.intersectObjects(potentialTargets, true);
     console.log(`[GameLogic] Raycast intersects: ${intersects.length}`);

     let hitDetected = false;
     if (intersects.length > 0) {
         for (const hit of intersects) {
             let hitObject = hit.object;
             let hitPlayerId = null;
             while(hitObject && !hitPlayerId) {
                 if (hitObject.userData?.isPlayer && hitObject.userData?.entityId !== localPlayerId) { hitPlayerId = hitObject.userData.entityId; }
                 hitObject = hitObject.parent;
             }
             if (hitPlayerId) {
                 console.log(`Hit player ${hitPlayerId} at distance ${hit.distance}`);
                 Network.sendPlayerHit({ targetId: hitPlayerId, damage: BULLET_DMG });
                 hitDetected = true;
                 break;
             } else { /* Optional map hit logic */ }
         }
     }

     // --- Rocket Jump Logic ---
     if (Input.keys['KeyC']) {
         const worldDown = new THREE.Vector3(0, -1, 0);
         const dotProduct = direction.dot(worldDown);
         if (dotProduct > -ROCKET_JUMP_THRESH) {
             console.log("Rocket Jump Triggered!"); // Keep active for testing
             playerBody.applyImpulse({ x: 0, y: ROCKET_JUMP_IMPULSE, z: 0 }, true);
         }
     }
}


/** Applies physics impulse to nearby players on death */
function applyShockwave(originPosition, deadPlayerId) {
    if (!RAPIER || !rapierWorld || !window.players || !currentGameInstance?.playerRigidBodyHandles) return;
    console.log(`Applying shockwave from dead player ${deadPlayerId} at`, originPosition);
    const origin = new THREE.Vector3(originPosition.x, originPosition.y, originPosition.z);
    for (const targetId in window.players) {
        if (targetId === deadPlayerId) continue;
        const targetPlayer = window.players[targetId];
        const targetBodyHandle = currentGameInstance.playerRigidBodyHandles[targetId];
        if (!targetBodyHandle) continue;
        try {
            const targetBody = rapierWorld.getRigidBody(targetBodyHandle);
            if (!targetBody || targetPlayer.health <= 0) continue;
            const targetPos = targetBody.translation();
            const direction = new THREE.Vector3().subVectors(targetPos, origin);
            const distance = direction.length();
            if (distance < DEATH_SHOCKWAVE_RADIUS && distance > 0.01) {
                const forceFalloff = 1.0 - (distance / DEATH_SHOCKWAVE_RADIUS);
                const impulseMagnitude = DEATH_SHOCKWAVE_FORCE * forceFalloff;
                direction.normalize();
                targetBody.applyImpulse({ x: direction.x * impulseMagnitude, y: direction.y * impulseMagnitude * 0.5 + impulseMagnitude * 0.3, z: direction.z * impulseMagnitude }, true);
                console.log(`Applied shockwave impulse to ${targetId} (Dist: ${distance.toFixed(1)}, Mag: ${impulseMagnitude.toFixed(1)})`);
            }
        } catch (e) { console.error(`Error applying shockwave to player ${targetId}:`, e); }
    }
}

console.log("gameLogic.js loaded (Ground Check Fix, Debug Logs)");
// --- END OF FULL gameLogic.js FILE ---
