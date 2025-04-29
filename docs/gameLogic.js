// docs/gameLogic.js (v6 - Add More Void Debugging)

// Accesses globals: camera, controls, players, localPlayerId, CONFIG, THREE, RAPIER, rapierWorld, Network, Input, UIManager, stateMachine

// --- Constants ---
const JUMP_IMPULSE_VALUE = CONFIG?.JUMP_IMPULSE || 300;
const DASH_IMPULSE_MAGNITUDE = CONFIG?.DASH_IMPULSE_MAGNITUDE || 450;
const DASH_UP_FACTOR = 0.1;
const GROUND_CHECK_DISTANCE = CONFIG?.GROUND_CHECK_DISTANCE || 0.25;

/**
 * Updates the local player's physics BODY based on input and handles void checks.
 * @param {number} deltaTime Time since last frame.
 * @param {RAPIER.RigidBody} playerBody Reference to the local player's dynamic physics body.
 */
function updateLocalPlayer(deltaTime, playerBody) {
    // --- Guard Clauses ---
    if (!playerBody || !rapierWorld || !RAPIER) { return; }
    const isPlaying = stateMachine?.is('playing');
    const isLocked = controls?.isLocked;
    const localPlayerData = localPlayerId ? players[localPlayerId] : null;
    if (!isPlaying || !isLocked || !localPlayerData) { return; }

    let currentPos, currentVel;
    try {
        currentPos = playerBody.translation();
        currentVel = playerBody.linvel();
    } catch(e) { console.error("!!! Err access body props:", e); return; }

    const isAlive = localPlayerData.health > 0;

    // ---> ADD Y-POSITION LOG <---
    // console.log(`Player Y: ${currentPos.y.toFixed(2)}`); // Spammy! Enable only if void death fails.

    // --- Ground Check ---
    let isGrounded = false;
    if (isAlive) {
        try {
            const bodyPos = currentPos;
            const h = CONFIG?.PLAYER_HEIGHT || 1.8; const r = CONFIG?.PLAYER_RADIUS || 0.4;
            const halfH = Math.max(0.01, h / 2.0 - r);
            const bottomY = bodyPos.y - halfH; // Capsule center Y - cylinder half height
            const rayOriginY = bottomY - 0.01;
            const rayOrigin = { x: bodyPos.x, y: rayOriginY, z: bodyPos.z };
            const rayDir = { x: 0, y: -1, z: 0 };
            const ray = new RAPIER.Ray(rayOrigin, rayDir);
            const maxToi = GROUND_CHECK_DISTANCE + 0.01;
            const solid = true;
            const colliderToExclude = playerBody.collider(0);
            const hit = rapierWorld.castRay(ray, maxToi, solid, undefined, undefined, colliderToExclude);
            if (hit != null && hit.toi > 0) { isGrounded = true; }
        } catch(e) { console.error("!!! Ground check err:", e); isGrounded = false; }
    }
    // console.log("Grounded:", isGrounded); // DEBUG

    // --- Apply Input Forces/Impulses ---
    if (isAlive) {
        try {
            const isSprinting = Input.keys['ShiftLeft'] && (Input.keys['KeyW']||Input.keys['KeyS']||Input.keys['KeyA']||Input.keys['KeyD']);
            const moveSpeed = isSprinting ? (CONFIG?.MOVEMENT_SPEED_SPRINTING||10.5) : (CONFIG?.MOVEMENT_SPEED||7.0);
            const forward = new THREE.Vector3(), right = new THREE.Vector3();
            const moveDir = new THREE.Vector3(0, 0, 0);
            if (camera && controls?.isLocked) {
                controls.getDirection(forward); forward.y = 0; forward.normalize();
                right.crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();
            }
            if (Input.keys['KeyW']) { moveDir.add(forward); }
            if (Input.keys['KeyS']) { moveDir.sub(forward); }
            if (Input.keys['KeyA']) { moveDir.add(right); } // Corrected: Add right for left
            if (Input.keys['KeyD']) { moveDir.sub(right); } // Corrected: Subtract right for right

            let targetVelX = 0, targetVelZ = 0;
            if (moveDir.lengthSq() > 1e-4) {
                moveDir.normalize();
                targetVelX = moveDir.x * moveSpeed; targetVelZ = moveDir.z * moveSpeed;
            }
            playerBody.setLinvel({ x: targetVelX, y: currentVel.y, z: targetVelZ }, true);

            // Log actual velocity if moving/jumping/dashing
             try {
                 const actualVel = playerBody.linvel();
                 if(targetVelX !== 0 || targetVelZ !== 0 || Input.keys['Space'] || Input.requestingDash) {
                      console.log(`Actual Velocity AFTER setLinvel/Impulse: (${actualVel.x.toFixed(2)}, ${actualVel.y.toFixed(2)}, ${actualVel.z.toFixed(2)}) --- Grounded: ${isGrounded}`);
                 }
             } catch (e) { console.error("Error getting velocity after set:", e); }


            if (Input.keys['Space'] && isGrounded && currentVel.y < 1.0) {
                console.log("Applying Jump Impulse:", JUMP_IMPULSE_VALUE);
                playerBody.applyImpulse({ x: 0, y: JUMP_IMPULSE_VALUE, z: 0 }, true);
                isGrounded = false; // Assume immediately
            }
            if (Input.requestingDash) {
                console.log("Applying Dash Impulse:", DASH_IMPULSE_MAGNITUDE, "Dir:", Input.dashDirection);
                const impulse = { x: Input.dashDirection.x * DASH_IMPULSE_MAGNITUDE, y: DASH_IMPULSE_MAGNITUDE * DASH_UP_FACTOR, z: Input.dashDirection.z * DASH_IMPULSE_MAGNITUDE };
                playerBody.applyImpulse(impulse, true);
                Input.requestingDash = false;
            }
        } catch (e) { console.error("!!! Err apply input physics:", e); try { playerBody.setLinvel({ x: 0, y: 0, z: 0 }, true); } catch (rE) {} }
    } else { // If Dead
         try { if (Math.abs(currentVel.x) > 0.1 || Math.abs(currentVel.z) > 0.1 ) { playerBody.setLinvel({x:0, y: currentVel.y, z:0}, true); } }
         catch(e) { console.error("Err set dead physics:", e); }
    }

    // --- Void Check ---
    let fellIntoVoid = false;
    const voidLevel = CONFIG.VOID_Y_LEVEL || -100; // Get void level
    try {
        if (currentPos.y < voidLevel) { // Use fetched position
            console.log(`Void Check Triggered: Player Y (${currentPos.y.toFixed(2)}) < Void Level (${voidLevel})`);
            fellIntoVoid = true;
        }
        if (!fellIntoVoid && (Math.abs(currentPos.x) > (CONFIG.MAP_BOUNDS_X || 100) || Math.abs(currentPos.z) > (CONFIG.MAP_BOUNDS_Z || 100))) {
             console.log(`Bounds Check Triggered: Player Pos (${currentPos.x.toFixed(1)}, ${currentPos.z.toFixed(1)})`);
             fellIntoVoid = true; // Treat out of bounds as void
        }

        if (fellIntoVoid && isAlive) {
            console.log(`Player ${localPlayerId} triggering void death sequence.`);
            localPlayerData.health = 0; // Set health locally FIRST
            if (UIManager) UIManager.updateHealthBar(0);
            if (Network) Network.sendVoidDeath(); // Then notify server
        }
    } catch (e) { console.error("!!! Error during void check:", e); }

    // --- Send Network Updates ---
    let controlsObject = null; try { controlsObject = controls?.getObject(); } catch (e) {}
    if (playerBody && controlsObject && localPlayerData && isAlive) {
         try {
             const h = CONFIG?.PLAYER_HEIGHT || 1.8; const bodyPos = currentPos; // Use fetched pos
             const feetPosX = bodyPos.x; const feetPosY = bodyPos.y - h / 2.0; const feetPosZ = bodyPos.z;
             const camQuat = new THREE.Quaternion(); camera.getWorldQuaternion(camQuat);
             const camRot = new THREE.Euler().setFromQuaternion(camQuat, 'YXZ'); const currentRotY = camRot.y;
             const posThreshSq = CONFIG?.PLAYER_MOVE_THRESHOLD_SQ || 1e-4; const rotThresh = 0.01;
             const lastX = localPlayerData.lastSentX ?? feetPosX; const lastY = localPlayerData.lastSentY ?? feetPosY;
             const lastZ = localPlayerData.lastSentZ ?? feetPosZ; const lastRotY = localPlayerData.lastSentRotationY ?? currentRotY;
             const posChanged = (((feetPosX-lastX)**2 + (feetPosY-lastY)**2 + (feetPosZ-lastZ)**2) > posThreshSq);
             let rotDiff = currentRotY - lastRotY; rotDiff = Math.atan2(Math.sin(rotDiff), Math.cos(rotDiff));
             const rotChanged = Math.abs(rotDiff) > rotThresh;

             if (posChanged || rotChanged) {
                 localPlayerData.lastSentX = feetPosX; localPlayerData.lastSentY = feetPosY;
                 localPlayerData.lastSentZ = feetPosZ; localPlayerData.lastSentRotationY = currentRotY;
                 if (Network) { Network.sendPlayerUpdate({ x: feetPosX, y: feetPosY, z: feetPosZ, rotationY: currentRotY }); }
             }
         } catch(e) { console.error("!!! Err calculating/sending net update:", e); }
    }
} // End updateLocalPlayer

console.log("gameLogic.js loaded (v6 - Add More Void Debugging)");
