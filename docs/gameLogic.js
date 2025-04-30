// --- START OF FULL gameLogic.js FILE (Cannon.js Version 1 - Basic Movement) ---
// docs/gameLogic.js (Cannon.js v1 - Basic Movement)

// Accesses globals: players, localPlayerId, CONFIG, THREE, CANNON, cannonWorld, Network, Input, UIManager, stateMachine, Effects, scene

// --- Constants ---
const JUMP_IMPULSE_VALUE = CONFIG?.JUMP_IMPULSE || 30; // ** CANNON impulses often need smaller values **
const DASH_IMPULSE_MAGNITUDE = CONFIG?.DASH_IMPULSE_MAGNITUDE || 45; // ** CANNON impulses often need smaller values **
const DASH_UP_FACTOR = 0.1; // Keep proportion
const GROUND_CHECK_BUFFER = CONFIG?.GROUND_CHECK_DISTANCE || 0.25;
const SHOOT_COOLDOWN_MS = CONFIG?.SHOOT_COOLDOWN || 150;
const BULLET_DMG = CONFIG?.BULLET_DAMAGE || 25;
const BULLET_MAX_RANGE = CONFIG?.BULLET_RANGE || 300;
const ROCKET_JUMP_IMPULSE = CONFIG?.ROCKET_JUMP_FORCE || 35; // ** CANNON impulses often need smaller values **
const ROCKET_JUMP_THRESH = CONFIG?.ROCKET_JUMP_ANGLE_THRESHOLD || -0.7;
const DEATH_SHOCKWAVE_FORCE = CONFIG?.DEATH_EXPLOSION_FORCE || 60.0; // ** CANNON impulses often need smaller values **
const DEATH_SHOCKWAVE_RADIUS = CONFIG?.DEATH_EXPLOSION_RADIUS || 15.0;

/**
 * Updates the local player's physics BODY based on input. (CANNON.js version)
 * @param {number} deltaTime Time since last frame (NOT used directly by Cannon step)
 * @param {CANNON.Body} playerBody Reference to the local player's Cannon.js body.
 * @param {THREE.PerspectiveCamera} camera Reference to the main camera.
 * @param {THREE.PointerLockControls} controls Reference to the pointer lock controls.
 */
function updateLocalPlayer(deltaTime, playerBody, camera, controls) {

    // --- Guard Clauses ---
    if (!playerBody || !cannonWorld || !CANNON || !camera || !controls) return;
    const isPlaying = stateMachine?.is('playing');
    const isLocked = controls?.isLocked;
    const localPlayerData = localPlayerId ? players[localPlayerId] : null;
    if (!isPlaying || !isLocked || !localPlayerData) return;
    const isAlive = localPlayerData.health > 0;
    if (!isAlive) {
        playerBody.velocity.set(0, 0, 0); // Stop dead players
        return;
    }

    // --- Ground Check (Cannon Raycast) ---
    let isGrounded = false;
    try {
        const playerPosition = playerBody.position;
        const playerRadius = CONFIG.PLAYER_RADIUS || 0.4; // Get radius for offset
        const rayFrom = new CANNON.Vec3(playerPosition.x, playerPosition.y, playerPosition.z);
        const rayTo = new CANNON.Vec3(playerPosition.x, playerPosition.y - playerRadius - GROUND_CHECK_BUFFER, playerPosition.z);
        const rayOptions = { skipBackfaces: true };
        const result = new CANNON.RaycastResult();
        const hasHit = cannonWorld.raycastClosest(rayFrom, rayTo, rayOptions, result);

        if (hasHit && result.body !== playerBody) {
             isGrounded = true;
        }
    } catch (e) {
        console.error("!!! Cannon ground check error:", e);
        isGrounded = false;
    }


    // --- Apply Input Forces/Impulses ---
    try {
        const currentVel = playerBody.velocity;
        const moveSpeed = Input.keys['ShiftLeft'] ? (CONFIG?.MOVEMENT_SPEED_SPRINTING || 10.5) : (CONFIG?.MOVEMENT_SPEED || 7.0);

        // --- Horizontal Movement ---
        const forward = new THREE.Vector3(), right = new THREE.Vector3();
        const moveDirectionInput = new THREE.Vector3(0, 0, 0);
        camera.getWorldDirection(forward); forward.y = 0; forward.normalize();
        right.crossVectors(camera.up, forward).normalize();

        if (Input.keys['KeyW']) { moveDirectionInput.add(forward); }
        if (Input.keys['KeyS']) { moveDirectionInput.sub(forward); }
        if (Input.keys['KeyA']) { moveDirectionInput.add(right); } // A/D swapped per user feedback
        if (Input.keys['KeyD']) { moveDirectionInput.sub(right); } // A/D swapped per user feedback

        let targetVelocityX = 0, targetVelocityZ = 0;
        if (moveDirectionInput.lengthSq() > 0.0001) {
            moveDirectionInput.normalize();
            targetVelocityX = moveDirectionInput.x * moveSpeed;
            targetVelocityZ = moveDirectionInput.z * moveSpeed;
        }

        // Apply horizontal velocity directly, keep existing vertical velocity
        playerBody.velocity.x = targetVelocityX;
        playerBody.velocity.z = targetVelocityZ;


        // --- Handle Jump ---
        if (Input.keys['Space'] && isGrounded) {
             if (currentVel.y < 2.0) {
                console.log("[GameLogic Update] Applying Jump Impulse (Cannon)");
                const impulseVec = new CANNON.Vec3(0, JUMP_IMPULSE_VALUE, 0);
                playerBody.applyImpulse(impulseVec, playerBody.position);
             }
        }

        // --- Handle Dash ---
        if (Input.requestingDash) {
             console.log("[GameLogic Update] Applying Dash Impulse (Cannon)");
             const impulseVec = new CANNON.Vec3(
                 Input.dashDirection.x * DASH_IMPULSE_MAGNITUDE,
                 DASH_IMPULSE_MAGNITUDE * DASH_UP_FACTOR,
                 Input.dashDirection.z * DASH_IMPULSE_MAGNITUDE
             );
             playerBody.applyImpulse(impulseVec, playerBody.position);
             Input.requestingDash = false;
        }

        // --- Handle Shooting ---
        const now = Date.now();
        if (Input.mouseButtons[0] && now > (window.lastShootTime || 0) + SHOOT_COOLDOWN_MS) {
             console.log("[GameLogic] Shoot condition met");
             window.lastShootTime = now;
             performShoot(playerBody, camera); // Pass Cannon body
             Input.mouseButtons[0] = false;
        }

    } catch (e) { console.error("!!! Error applying input physics (Cannon):", e); }


    // --- Void Check ---
    try {
        const currentBodyPosY = playerBody.position.y;
        const voidLevel = (typeof CONFIG !== 'undefined' && typeof CONFIG.VOID_Y_LEVEL === 'number') ? CONFIG.VOID_Y_LEVEL : -100;
        const boundsX = (typeof CONFIG !== 'undefined' && typeof CONFIG.MAP_BOUNDS_X === 'number') ? CONFIG.MAP_BOUNDS_X : 100;
        const boundsZ = (typeof CONFIG !== 'undefined' && typeof CONFIG.MAP_BOUNDS_Z === 'number') ? CONFIG.MAP_BOUNDS_Z : 100;
        const fellIntoVoid = currentBodyPosY < voidLevel;
        const outOfBounds = !fellIntoVoid && (Math.abs(playerBody.position.x) > boundsX || Math.abs(playerBody.position.z) > boundsZ);
        if ((fellIntoVoid || outOfBounds) && isAlive) {
            console.log(`Player ${localPlayerId} fell into void or out of bounds.`);
            localPlayerData.health = 0; // Update local state immediately
            UIManager?.updateHealthBar(0);
            Network?.sendVoidDeath(); // Notify server
        }
    } catch (e) { console.error("!!! Error during void check (Cannon):", e); }

    // --- Sync Local Player Visual Mesh ---
    // Handled in game.js update loop

    // --- Send Network Updates ---
    if (playerBody && isAlive) {
         try {
             const playerHeight = CONFIG.PLAYER_HEIGHT;
             const feetPos = {
                 x: playerBody.position.x,
                 y: playerBody.position.y - playerHeight / 2.0, // Calculate feet Y
                 z: playerBody.position.z
             };
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
         } catch(e) { console.error("!!! Error calculating/sending network update (Cannon):", e); }
    }

} // End updateLocalPlayer

/** Performs shooting logic: Raycast, send hit, trigger effects/rocket jump */
function performShoot(playerBody, camera) {
     console.log("[GameLogic] performShoot called");
     if (!camera || !Network || !scene) { /* ... guard ... */ return; }
     if (window.gunSoundBuffer) { Effects.playSound(window.gunSoundBuffer, null, false, 0.4); }
     else { console.warn("[GameLogic] Gun sound buffer not loaded."); }

     // --- Raycast (Uses THREE.js raycaster still) ---
     const raycaster = new THREE.Raycaster();
     const origin = new THREE.Vector3(); const direction = new THREE.Vector3();
     camera.getWorldPosition(origin); camera.getWorldDirection(direction);
     raycaster.set(origin, direction); raycaster.far = BULLET_MAX_RANGE;
     const potentialTargets = [];
     for (const id in window.players) { if (id !== localPlayerId && window.players[id]?.mesh) { potentialTargets.push(window.players[id].mesh); } }
     console.log(`[GameLogic] Raycasting from camera. Targets: ${potentialTargets.length}`);
     const intersects = raycaster.intersectObjects(potentialTargets, true);
     console.log(`[GameLogic] Raycast intersects: ${intersects.length}`);
     let hitDetected = false;
     if (intersects.length > 0) {
         for (const hit of intersects) {
             let hitObject = hit.object; let hitPlayerId = null;
             while(hitObject && !hitPlayerId) { if (hitObject.userData?.isPlayer && hitObject.userData?.entityId !== localPlayerId) { hitPlayerId = hitObject.userData.entityId; } hitObject = hitObject.parent; }
             if (hitPlayerId) {
                 console.log(`Hit player ${hitPlayerId} at distance ${hit.distance}`);
                 Network.sendPlayerHit({ targetId: hitPlayerId, damage: BULLET_DMG });
                 hitDetected = true; break;
             }
         }
     }

     // --- Rocket Jump Logic (Apply impulse to Cannon body) ---
     if (Input.keys['KeyC']) {
         const worldDown = new THREE.Vector3(0, -1, 0);
         const dotProduct = direction.dot(worldDown);
         if (dotProduct > -ROCKET_JUMP_THRESH) {
             console.log("Rocket Jump Triggered (Cannon)");
             const rjImpulse = new CANNON.Vec3(0, ROCKET_JUMP_IMPULSE, 0);
             playerBody.applyImpulse(rjImpulse, playerBody.position);
         }
     }
}


/** Applies physics impulse to nearby players on death (Cannon.js) */
function applyShockwave(originPosition, deadPlayerId) {
    if (!CANNON || !cannonWorld || !window.players || !currentGameInstance?.playerBodies) return;
    console.log(`Applying shockwave from dead player ${deadPlayerId} at`, originPosition);
    const origin = new CANNON.Vec3(originPosition.x, originPosition.y, originPosition.z); // Use CANNON.Vec3

    const impulsesToApply = [];
    for (const targetId in currentGameInstance.playerBodies) { // Iterate Cannon bodies map
        if (targetId === deadPlayerId) continue;

        const targetBody = currentGameInstance.playerBodies[targetId];
        const targetPlayer = window.players[targetId]; // Get corresponding player data
        if (!targetBody || !targetPlayer || targetPlayer.health <= 0) continue;

        try {
            const targetPos = targetBody.position; // Read Cannon position
            const direction = new CANNON.Vec3();
            targetPos.vsub(origin, direction); // direction = targetPos - origin
            const distance = direction.length();

            if (distance < DEATH_SHOCKWAVE_RADIUS && distance > 0.01) {
                const forceFalloff = 1.0 - (distance / DEATH_SHOCKWAVE_RADIUS);
                const impulseMagnitude = DEATH_SHOCKWAVE_FORCE * forceFalloff;
                direction.normalize(); // Normalize Cannon vector

                impulsesToApply.push({
                    body: targetBody,
                    impulse: new CANNON.Vec3(
                        direction.x * impulseMagnitude,
                        direction.y * impulseMagnitude * 0.5 + impulseMagnitude * 0.3, // Add upward boost
                        direction.z * impulseMagnitude
                    )
                });
            }
        } catch (e) { console.error(`Error calculating shockwave for player ${targetId} (Cannon):`, e); }
    }
    // Apply impulses
    for (const data of impulsesToApply) {
        try {
             console.log(`Applying shockwave impulse to ${data.body.userData?.entityId || 'unknown'} (Cannon)`);
             // Apply impulse at the center of the target body
             data.body.applyImpulse(data.impulse, data.body.position);
        } catch(e) { console.error(`Error applying shockwave impulse to player ${data.body.userData?.entityId || 'unknown'} (Cannon):`, e); }
    }
}

console.log("gameLogic.js loaded (Cannon.js v1 - Basic Movement)");
// --- END OF FULL gameLogic.js FILE ---
