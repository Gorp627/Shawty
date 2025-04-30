// --- START OF FULL gameLogic.js FILE ---
// docs/gameLogic.js (Rapier - v25 Separate Read/Write)

// Accesses globals: players, localPlayerId, CONFIG, THREE, RAPIER, rapierWorld, Network, Input, UIManager, stateMachine, Effects, scene

// --- Constants ---
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
 * Updates the local player's physics BODY based on input.
 * @param {number} deltaTime Time since last frame.
 * @param {RAPIER.RigidBody} playerBody Reference to the local player's dynamic physics body.
 * @param {THREE.PerspectiveCamera} camera Reference to the main camera.
 * @param {THREE.PointerLockControls} controls Reference to the pointer lock controls.
 */
function updateLocalPlayer(deltaTime, playerBody, camera, controls) {

    // --- Guard Clauses ---
    if (!playerBody || !rapierWorld || !RAPIER || !camera || !controls) return;
    const isPlaying = stateMachine?.is('playing');
    const isLocked = controls?.isLocked;
    const localPlayerData = localPlayerId ? players[localPlayerId] : null;
    if (!isPlaying || !isLocked || !localPlayerData) return;
    const isAlive = localPlayerData.health > 0;
    if (!isAlive) return; // Don't process physics for dead players

    // --- PHASE 1: READ State ---
    let currentVelY = 0;
    let currentBodyPos = { x: 0, y: 0, z: 0 }; // Store position components
    let isGrounded = false;

    try {
        const currentLinvel = playerBody.linvel();
        if (currentLinvel) currentVelY = currentLinvel.y;

        const bodyTranslation = playerBody.translation();
        if (bodyTranslation) {
            currentBodyPos.x = bodyTranslation.x;
            currentBodyPos.y = bodyTranslation.y;
            currentBodyPos.z = bodyTranslation.z;
        }

        // Ground Check using the read position
        const playerHeight = CONFIG.PLAYER_HEIGHT;
        const playerRadius = CONFIG.PLAYER_RADIUS;
        const capsuleCylinderHalfHeight = Math.max(0.01, playerHeight / 2.0 - playerRadius);
        const rayOriginY = (currentBodyPos.y - capsuleCylinderHalfHeight - playerRadius) + 0.05;
        const rayOrigin = { x: currentBodyPos.x, y: rayOriginY, z: currentBodyPos.z };
        const rayDirection = { x: 0, y: -1, z: 0 };
        const ray = new RAPIER.Ray(rayOrigin, rayDirection);
        const maxToi = GROUND_CHECK_BUFFER + 0.05;

        const hit = rapierWorld.castRay(ray, maxToi, true, undefined, undefined, playerBody.collider(0));
        if (hit != null) {
            isGrounded = true;
        }

    } catch (e) {
        console.error("!!! Rapier state read or ground check error:", e);
        // If reading state fails, we probably shouldn't try to write either
        return;
    }

    // --- PHASE 2: Calculate Actions & Target Velocity ---
    let targetVelocityX = 0;
    let targetVelocityZ = 0;
    let jumpImpulse = { x: 0, y: 0, z: 0 };
    let dashImpulse = { x: 0, y: 0, z: 0 };
    let shootRequested = false;

    try {
        // Calculate Movement Velocity
        const moveSpeed = Input.keys['ShiftLeft'] ? (CONFIG?.MOVEMENT_SPEED_SPRINTING || 10.5) : (CONFIG?.MOVEMENT_SPEED || 7.0);
        const forward = new THREE.Vector3(), right = new THREE.Vector3();
        const moveDirectionInput = new THREE.Vector3(0, 0, 0);
        camera.getWorldDirection(forward); forward.y = 0; forward.normalize();
        right.crossVectors(camera.up, forward).normalize();

        if (Input.keys['KeyW']) { moveDirectionInput.add(forward); }
        if (Input.keys['KeyS']) { moveDirectionInput.sub(forward); }
        if (Input.keys['KeyA']) { moveDirectionInput.add(right); } // A/D swapped per user feedback
        if (Input.keys['KeyD']) { moveDirectionInput.sub(right); } // A/D swapped per user feedback

        if (moveDirectionInput.lengthSq() > 0.0001) {
            moveDirectionInput.normalize();
            targetVelocityX = moveDirectionInput.x * moveSpeed;
            targetVelocityZ = moveDirectionInput.z * moveSpeed;
        }

        // Check Jump Condition
        if (Input.keys['Space'] && isGrounded && currentVelY < 1.0) {
            console.log("[GameLogic Update] Jump Condition Met");
            jumpImpulse.y = JUMP_IMPULSE_VALUE;
        }

        // Check Dash Condition
        if (Input.requestingDash) {
             console.log("[GameLogic Update] Dash Condition Met");
             dashImpulse.x = Input.dashDirection.x * DASH_IMPULSE_MAGNITUDE;
             dashImpulse.y = DASH_IMPULSE_MAGNITUDE * DASH_UP_FACTOR;
             dashImpulse.z = Input.dashDirection.z * DASH_IMPULSE_MAGNITUDE;
             Input.requestingDash = false; // Consume dash request
        }

        // Check Shoot Condition
        const now = Date.now();
        if (Input.mouseButtons[0] && now > (window.lastShootTime || 0) + SHOOT_COOLDOWN_MS) {
            console.log("[GameLogic] Shoot condition met");
            shootRequested = true;
            window.lastShootTime = now;
            Input.mouseButtons[0] = false;
        }

    } catch (e) {
        console.error("!!! Error during action/velocity calculation:", e);
    }


    // --- PHASE 3: WRITE State (Apply Velocity & Impulses) ---
    try {
        // Apply calculated horizontal velocity, maintain current *read* vertical velocity
        playerBody.setLinvel({ x: targetVelocityX, y: currentVelY, z: targetVelocityZ }, true);

        // Apply Jump Impulse if needed
        if (jumpImpulse.y > 0) {
             console.log("[GameLogic Update] Applying Jump Impulse");
             playerBody.applyImpulse(jumpImpulse, true);
        }

        // Apply Dash Impulse if needed
        if (dashImpulse.x !== 0 || dashImpulse.y !== 0 || dashImpulse.z !== 0) {
            console.log("[GameLogic Update] Applying Dash Impulse");
            playerBody.applyImpulse(dashImpulse, true);
        }

    } catch(e) {
        console.error("!!! Error applying physics state updates:", e);
    }

    // Perform Shooting Action (after physics writes, as it reads camera state)
    if (shootRequested) {
        performShoot(playerBody, camera); // Pass camera ref
    }


    // --- Other Logic (Reads only, generally safe after writes) ---

    // --- Void Check ---
    try {
        // Use the position read at the start of the function
        const voidLevel = (typeof CONFIG !== 'undefined' && typeof CONFIG.VOID_Y_LEVEL === 'number') ? CONFIG.VOID_Y_LEVEL : -100;
        const boundsX = (typeof CONFIG !== 'undefined' && typeof CONFIG.MAP_BOUNDS_X === 'number') ? CONFIG.MAP_BOUNDS_X : 100;
        const boundsZ = (typeof CONFIG !== 'undefined' && typeof CONFIG.MAP_BOUNDS_Z === 'number') ? CONFIG.MAP_BOUNDS_Z : 100;
        const fellIntoVoid = currentBodyPos.y < voidLevel;
        const outOfBounds = !fellIntoVoid && (Math.abs(currentBodyPos.x) > boundsX || Math.abs(currentBodyPos.z) > boundsZ);
        if ((fellIntoVoid || outOfBounds) && isAlive) { // Check isAlive again just in case
            console.log(`Player ${localPlayerId} fell into void or out of bounds.`);
            localPlayerData.health = 0;
            UIManager?.updateHealthBar(0);
            Network?.sendVoidDeath();
        }
    } catch (e) { console.error("!!! Error during void check:", e); }

    // --- Sync Local Player Visual Mesh to Physics Body ---
    if (localPlayerData?.mesh) {
        try {
            // Use the position read at the start
            const playerHeight = CONFIG.PLAYER_HEIGHT || 1.8;
            localPlayerData.mesh.position.set(currentBodyPos.x, currentBodyPos.y - playerHeight / 2.0, currentBodyPos.z);
            // Camera rotation read doesn't conflict with body state
            const cameraEuler = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ');
            localPlayerData.mesh.rotation.y = cameraEuler.y;
        } catch(e) { console.error("!!! Error syncing local player mesh:", e); }
    }

    // --- Send Network Updates ---
    if (playerBody && isAlive) { // Check isAlive again
         try {
             // Use the position read at the start
             const playerHeight = CONFIG.PLAYER_HEIGHT;
             const feetPos = { x: currentBodyPos.x, y: currentBodyPos.y - playerHeight / 2.0, z: currentBodyPos.z };
             // Camera read is fine
             const cameraEuler = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ');
             const currentRotationY = cameraEuler.y;
             const positionThresholdSq = CONFIG.PLAYER_MOVE_THRESHOLD_SQ;
             const rotationThreshold = 0.01;
             // Compare against previously sent state stored in localPlayerData
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
     if (!camera || !Network || !scene) { console.warn("[GameLogic] performShoot returning early: Missing camera, Network, or scene."); return; }
     if (window.gunSoundBuffer) { Effects.playSound(window.gunSoundBuffer, null, false, 0.4); }
     else { console.warn("[GameLogic] Gun sound buffer not loaded, cannot play sound."); }
     const raycaster = new THREE.Raycaster(); const origin = new THREE.Vector3(); const direction = new THREE.Vector3();
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
     if (Input.keys['KeyC']) {
         const worldDown = new THREE.Vector3(0, -1, 0); const dotProduct = direction.dot(worldDown);
         if (dotProduct > -ROCKET_JUMP_THRESH) {
             console.log("Rocket Jump Triggered!");
             // Apply impulse immediately here is usually OK as it's the last physics write related to shooting
             playerBody.applyImpulse({ x: 0, y: ROCKET_JUMP_IMPULSE, z: 0 }, true);
         }
     }
}

/** Applies physics impulse to nearby players on death */
function applyShockwave(originPosition, deadPlayerId) {
    // This function reads other bodies and applies impulses, it *might* need similar separation if errors occur during shockwaves
    if (!RAPIER || !rapierWorld || !window.players || !currentGameInstance?.playerRigidBodyHandles) return;
    console.log(`Applying shockwave from dead player ${deadPlayerId} at`, originPosition);
    const origin = new THREE.Vector3(originPosition.x, originPosition.y, originPosition.z);
    // Collect bodies to apply impulse to first
    const impulsesToApply = [];
    for (const targetId in window.players) {
        if (targetId === deadPlayerId) continue;
        const targetPlayer = window.players[targetId];
        const targetBodyHandle = currentGameInstance.playerRigidBodyHandles[targetId];
        if (!targetBodyHandle) continue;
        try {
            const targetBody = rapierWorld.getRigidBody(targetBodyHandle);
            if (!targetBody || targetPlayer.health <= 0) continue;
            const targetPos = targetBody.translation(); // READ
            const direction = new THREE.Vector3().subVectors(targetPos, origin);
            const distance = direction.length();
            if (distance < DEATH_SHOCKWAVE_RADIUS && distance > 0.01) {
                const forceFalloff = 1.0 - (distance / DEATH_SHOCKWAVE_RADIUS);
                const impulseMagnitude = DEATH_SHOCKWAVE_FORCE * forceFalloff;
                direction.normalize();
                // Store impulse details instead of applying immediately
                impulsesToApply.push({
                    body: targetBody,
                    impulse: {
                        x: direction.x * impulseMagnitude,
                        y: direction.y * impulseMagnitude * 0.5 + impulseMagnitude * 0.3,
                        z: direction.z * impulseMagnitude
                    }
                });
            }
        } catch (e) { console.error(`Error calculating shockwave for player ${targetId}:`, e); }
    }
    // Now apply all impulses
    for (const data of impulsesToApply) {
        try {
             console.log(`Applying shockwave impulse to ${data.body.userData?.entityId || 'unknown'}`);
             data.body.applyImpulse(data.impulse, true); // WRITE
        } catch(e) { console.error(`Error applying shockwave impulse to player ${data.body.userData?.entityId || 'unknown'}:`, e); }
    }
}

console.log("gameLogic.js loaded (v25 Separate Read/Write)");
// --- END OF FULL gameLogic.js FILE ---
