// docs/gameLogic.js (Rapier - Removed Old Raycast Block)

// Accesses globals: camera, controls, players, localPlayerId, CONFIG, THREE, RAPIER, rapierWorld, Network, Input, UIManager, stateMachine

// --- Constants ---
const JUMP_IMPULSE = { x: 0, y: CONFIG?.JUMP_IMPULSE || 300, z: 0 };
const DASH_UP_FACTOR = 0.1;
const GROUND_CHECK_BUFFER = CONFIG?.GROUND_CHECK_DISTANCE || 0.25;

/**
 * Updates the local player's physics BODY based on input and handles void checks.
 * @param {number} deltaTime Time since last frame.
 * @param {RAPIER.RigidBody} playerBody Reference to the local player's physics body.
 */
function updateLocalPlayer(deltaTime, playerBody) {
    // --- Guard Clauses ---
    if (!playerBody || !rapierWorld || !RAPIER) { /* console.warn("updateLP skipped: Physics missing"); */ return; }
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
            const capsuleHalfHeight = Math.max(0.01, playerHeight / 2.0 - playerRadius);
            const rayOrigin = { x: bodyPos.x, y: bodyPos.y - capsuleHalfHeight + 0.05, z: bodyPos.z }; // Slightly below center
            const rayDirection = { x: 0, y: -1, z: 0 };
            const ray = new RAPIER.Ray(rayOrigin, rayDirection);
            const maxToi = playerRadius + GROUND_CHECK_BUFFER; // Check distance = radius + buffer
            const solid = true;

            const hit = rapierWorld.castRay(ray, maxToi, solid);
            if (hit != null) { // Check if hit is not null
                isGrounded = true;
                // console.log(`Ground Hit! TOI: ${hit.toi.toFixed(3)}`); // DEBUG
            }
        } catch(e) { console.error("Ground check error:", e); isGrounded = false; }
    }

    // --- <<< REMOVED Old THREE.Raycaster ground check block >>> ---


    // --- Physics Body Interaction (Only if Alive) ---
    if (isAlive) {
        try {
            // Calculate Movement Direction
            const currentVel = playerBody.linvel();
            const moveSpeed = Input.keys['ShiftLeft'] ? (CONFIG?.MOVEMENT_SPEED_SPRINTING || 10.5) : (CONFIG?.MOVEMENT_SPEED || 7.0);
            const forward = new THREE.Vector3(), right = new THREE.Vector3();
            const moveDirectionInput = new THREE.Vector3(0, 0, 0);
            if (camera) { camera.getWorldDirection(forward); forward.y=0; forward.normalize(); right.crossVectors(camera.up, forward).normalize(); } else { console.error("Camera missing!"); return; }
            if(Input.keys['KeyW']){moveDirectionInput.add(forward);} if(Input.keys['KeyS']){moveDirectionInput.sub(forward);}
            if(Input.keys['KeyA']){moveDirectionInput.sub(right);} if(Input.keys['KeyD']){moveDirectionInput.add(right);}

            // Apply Horizontal Velocity
            let targetVelocityX = currentVel.x; let targetVelocityZ = currentVel.z;
            if (moveDirectionInput.lengthSq() > 0.0001){ moveDirectionInput.normalize(); targetVelocityX = moveDirectionInput.x * moveSpeed; targetVelocityZ = moveDirectionInput.z * moveSpeed; }
            playerBody.setLinvel({ x: targetVelocityX, y: currentVel.y, z: targetVelocityZ }, true);

            // Handle Jump
            if (Input.keys['Space'] && isGrounded) {
                if (currentVel.y < 1.0) { playerBody.applyImpulse(JUMP_IMPULSE, true); console.log("Jump Impulse!"); }
            }

            // Handle Dash
            if (Input.requestingDash) {
                const dashMagnitude = CONFIG?.DASH_IMPULSE_MAGNITUDE || 450;
                const impulse = { x: Input.dashDirection.x * dashMagnitude, y: Input.dashDirection.y * dashMagnitude * DASH_UP_FACTOR, z: Input.dashDirection.z * dashMagnitude };
                playerBody.applyImpulse(impulse, true); console.log("Dash Impulse!"); Input.requestingDash = false;
            }
        } catch (e) { console.error("Input physics error:", e); }

    } else { // If Dead
        try { if (playerBody.setLinvel) playerBody.setLinvel({x:0,y:0,z:0}, true); if (playerBody.setAngvel) playerBody.setAngvel({x:0,y:0,z:0}, true); } catch(e) { console.error("Zero velocity error:", e); }
    }

    // --- Void Check ---
    let fellIntoVoid = false;
    if (playerBody.translation) { try { const cPos = playerBody.translation(); if (cPos.y < (CONFIG.VOID_Y_LEVEL||-100)) fellIntoVoid = true; if (!fellIntoVoid && (Math.abs(cPos.x) > (CONFIG.MAP_BOUNDS_X||100) || Math.abs(cPos.z) > (CONFIG.MAP_BOUNDS_Z||100))) fellIntoVoid = true; if (fellIntoVoid && isAlive) { console.log("Void death!"); localPlayerData.health = 0; if(UIManager) UIManager.updateHealthBar(0); if(Network) Network.sendVoidDeath(); if(playerBody.setLinvel)playerBody.setLinvel({x:0,y:0,z:0},true); if(playerBody.setAngvel)playerBody.setAngvel({x:0,y:0,z:0},true); } } catch (e) { console.error("Void check error:", e); } }

    // --- Send Network Updates ---
    const controlsObject = controls?.getObject();
    if (playerBody.translation && controlsObject && localPlayerData) {
         try { const h=CONFIG?.PLAYER_HEIGHT||1.8; const p=playerBody.translation(); const lPos={x:p.x,y:p.y-h/2.0,z:p.z}; const cRot=new THREE.Euler().setFromQuaternion(controlsObject.quaternion,'YXZ'); const cY=cRot.y; const pTSq=CONFIG?.PLAYER_MOVE_THRESHOLD_SQ||0.0001; const rTh=0.01; const posCh=new THREE.Vector3(lPos.x,lPos.y,lPos.z).distanceToSquared(new THREE.Vector3(localPlayerData.x??0, localPlayerData.y??0, localPlayerData.z??0))>pTSq; const rotCh=Math.abs(cY - (localPlayerData.rotationY??0)) > rTh; if (posCh || rotCh) { localPlayerData.x=lPos.x; localPlayerData.y=lPos.y; localPlayerData.z=lPos.z; localPlayerData.rotationY=cY; if (Network) Network.sendPlayerUpdate({ x:lPos.x, y:lPos.y, z:lPos.z, rotationY:cY }); } }
         catch(e) { console.error("Network update calc error:", e); }
    }

} // End updateLocalPlayer


console.log("gameLogic.js loaded (Removed THREE.Raycaster Logic)");
