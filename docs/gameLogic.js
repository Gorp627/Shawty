// docs/gameLogic.js

// Depends on: config.js, stateMachine.js, entities.js, input.js, network.js, uiManager.js
// Accesses globals: scene, camera, controls, clock, players, velocityY, isOnGround, localPlayerId, CONFIG, THREE, ClientPlayer, Network, Input, UIManager, stateMachine, mapMesh

const groundCheckRaycaster = new THREE.Raycaster(); // Renamed for clarity
const downVec = new THREE.Vector3(0, -1, 0);
const playerHeight = CONFIG?.PLAYER_HEIGHT || 1.8;
const playerRadius = CONFIG?.PLAYER_RADIUS || 0.4;
const groundCheckDist = 0.25; // How far DOWN from origin points to check (keep relatively short)
const groundSnapThreshold = 0.2; // How close player feet need to be to ground to snap UP
const aboveFeetOffset = 0.1; // Start rays slightly above theoretical feet

// --- Debug Ray Visualization ---
const DEBUG_GROUND_RAYS = true; // SET TO true TO SEE THE RAYS
let debugRayHelpers = []; // Array to hold Line objects for visualization
function setupDebugRays(origins) {
    if (!DEBUG_GROUND_RAYS) return;
    // Remove old helpers
    debugRayHelpers.forEach(helper => scene.remove(helper));
    debugRayHelpers = [];
    // Create new helpers
    const materialHit = new THREE.LineBasicMaterial({ color: 0x00ff00 }); // Green for hit
    const materialMiss = new THREE.LineBasicMaterial({ color: 0xff0000 }); // Red for miss
    origins.forEach(origin => {
        const points = [origin.clone(), origin.clone().addScaledVector(downVec, groundCheckDist)];
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const line = new THREE.Line(geometry, materialMiss); // Start as miss
        scene.add(line);
        debugRayHelpers.push({line: line, hitMaterial: materialHit, missMaterial: materialMiss, geometry: geometry});
    });
}
function updateDebugRays(origins, hits) {
    if (!DEBUG_GROUND_RAYS || debugRayHelpers.length !== origins.length) return;
    origins.forEach((origin, i) => {
        const points = [origin.clone(), origin.clone().addScaledVector(downVec, groundCheckDist)];
        debugRayHelpers[i].geometry.setFromPoints(points); // Update position
        debugRayHelpers[i].line.material = hits[i] ? debugRayHelpers[i].hitMaterial : debugRayHelpers[i].missMaterial; // Update color
    });
}
// --- End Debug Ray Visualization ---


/**
 * Updates the local player's state, movement, and network synchronization.
 * Uses MULTIPLE short raycasts from player base for ground check.
 * @param {number} deltaTime Time since last frame.
 */
function updateLocalPlayer(deltaTime) {
    // --- Guard Clause ---
    const isPlaying=stateMachine.is('playing'), isLocked=controls?.isLocked, pData=localPlayerId?players[localPlayerId]:null, isAlive=pData&&pData.health>0;
    if (!isPlaying || !isLocked || !pData || !isAlive) { if (!isLocked) velocityY = 0; return; }

    // --- Get References ---
    const controlsObject = controls.getObject(); const playerState = pData;
    const previousPosition = controlsObject.position.clone();

    // --- Vertical Physics & Multi-Ray Ground Check ---
    let appliedGravity = true; let onValidGround = false; let highestGroundY = -Infinity;

    const isMapReady = mapMesh && mapMesh.children.length > 0 && mapMesh.parent === scene;
    if (isMapReady) {
        const playerBaseY = controlsObject.position.y - playerHeight;
        const currentPos = controlsObject.position;

        // Points around player base (offset slightly up) - define INSIDE loop if needed
        const rayOrigins = [
            new THREE.Vector3(currentPos.x, playerBaseY + aboveFeetOffset, currentPos.z), // Center
            new THREE.Vector3(currentPos.x + playerRadius * 0.7, playerBaseY + aboveFeetOffset, currentPos.z), // Right (adjust multiplier .7?)
            new THREE.Vector3(currentPos.x - playerRadius * 0.7, playerBaseY + aboveFeetOffset, currentPos.z), // Left
            new THREE.Vector3(currentPos.x, playerBaseY + aboveFeetOffset, currentPos.z + playerRadius * 0.7), // Forward
            new THREE.Vector3(currentPos.x, playerBaseY + aboveFeetOffset, currentPos.z - playerRadius * 0.7)  // Back
        ];
        if (DEBUG_GROUND_RAYS && debugRayHelpers.length !== rayOrigins.length) setupDebugRays(rayOrigins); // Create helpers first time

        let rayHits = [false, false, false, false, false]; // Track hits per ray for debugging

        for (let i = 0; i < rayOrigins.length; i++) {
             const origin = rayOrigins[i];
             groundCheckRaycaster.set(origin, downVec);
             groundCheckRaycaster.far = groundCheckDistance;

             try {
                 const intersects = groundCheckRaycaster.intersectObject(mapMesh, true);
                 if (intersects.length > 0) {
                     // Find closest hit BELOW origin for THIS ray
                     let closestHitDist = Infinity; let hitPointY = -Infinity; let hitFoundForThisRay = false;
                     for(const hit of intersects){ if(hit.distance < closestHitDist && hit.point.y < origin.y){ closestHitDist = hit.distance; hitPointY = hit.point.y; hitFoundForThisRay = true; } }

                     if (hitFoundForThisRay && closestHitDist < groundCheckDistance) { // Ensure hit is within short distance
                         // console.log(`Ray ${i} hit at Y: ${hitPointY.toFixed(2)}, Dist: ${closestHitDist.toFixed(2)}`); // Debug Log
                         onValidGround = true; // If ANY ray hits valid ground, we are considered on ground
                         highestGroundY = Math.max(highestGroundY, hitPointY);
                         rayHits[i] = true; // For debug visualization
                     }
                 }
             } catch (e) { console.error("Raycast error:", e); onValidGround = false; break; }
        } // End ray loop

        if (DEBUG_GROUND_RAYS) updateDebugRays(rayOrigins, rayHits); // Update visualization

        // Apply snapping only if considered grounded
        if (onValidGround) {
            if (playerBaseY <= highestGroundY + groundSnapThreshold) { // If feet below highest detected ground + threshold
                controlsObject.position.y = highestGroundY + playerHeight; // Snap base exactly onto highest ground
                if (velocityY < 0) velocityY = 0;
                appliedGravity = false;
            }
        }

    } else { onValidGround = false; if(DEBUG_GROUND_RAYS && debugRayHelpers.length > 0){debugRayHelpers.forEach(h=>scene.remove(h.line)); debugRayHelpers=[];}} // Map not ready, remove debug rays

    if (appliedGravity) { velocityY -= CONFIG.GRAVITY * deltaTime; }
    controlsObject.position.y += velocityY * deltaTime;
    isOnGround = onValidGround;


    // --- Horizontal Movement (Inverted A/D) ---
    const moveSpeed=Input.keys['ShiftLeft']?CONFIG.MOVEMENT_SPEED_SPRINTING:CONFIG.MOVEMENT_SPEED; const dS=moveSpeed*deltaTime;
    const fwd=new THREE.Vector3(), rgt=new THREE.Vector3(); camera.getWorldDirection(fwd); fwd.y=0; fwd.normalize(); rgt.crossVectors(camera.up, fwd).normalize();
    let moveDir=new THREE.Vector3(0,0,0);
    if(Input.keys['KeyW']){moveDir.add(fwd);} if(Input.keys['KeyS']){moveDir.sub(fwd);}
    if(Input.keys['KeyA']){moveDir.add(rgt);} // A = Right
    if(Input.keys['KeyD']){moveDir.sub(rgt);} // D = Left
    if(moveDir.lengthSq()>0){moveDir.normalize(); controlsObject.position.addScaledVector(moveDir,dS);}

    // --- Dash ---
    if (Input.isDashing) { controlsObject.position.addScaledVector(Input.dashDirection, CONFIG.DASH_FORCE * deltaTime); }

    // --- Collision (Player-Player) ---
    const curPos = controlsObject.position; const colRad = CONFIG.PLAYER_COLLISION_RADIUS||0.4;
    for(const id in players){ if(id!==localPlayerId&&players[id]instanceof ClientPlayer&&players[id].mesh?.visible&&players[id].mesh.position){ const oM=players[id].mesh; const dXZ=new THREE.Vector2(curPos.x-oM.position.x, curPos.z-oM.position.z).length(); if(dXZ<colRad*2){ curPos.x=previousPosition.x; curPos.z=previousPosition.z; break;}}}

    // --- Void Check ---
    if (controlsObject.position.y < CONFIG.VOID_Y_LEVEL && playerState.health > 0) { console.log("Fell."); playerState.health = 0; if(UIManager){UIManager.updateHealthBar(0); UIManager.showKillMessage("Fell.");} if(Network) Network.sendVoidDeath();}

    // --- Network Updates ---
    const lP=controlsObject.position.clone(); lP.y-=playerHeight; const cRot=new THREE.Euler().setFromQuaternion(controlsObject.quaternion,'YXZ'); const cRY=cRot.y; const lS=playerState;
    const pTSq=CONFIG.PLAYER_MOVE_THRESHOLD_SQ||0.0001; const rTh=0.01;
    const pChg=lP.distanceToSquared(new THREE.Vector3(lS?.x??0,lS?.y??0,lS?.z??0)) > pTSq; const rChg=Math.abs(cRY-(lS?.rotationY??0)) > rTh;
    if(pChg||rChg){ if(lS){lS.x=lP.x;lS.y=lP.y;lS.z=lP.z;lS.rotationY=cRY;} if(Network)Network.sendPlayerUpdate({x:lP.x,y:lP.y,z:lP.z,rotationY:cRY}); }
}


// --- SHOOTING FUNCTIONS REMOVED ---


/** Updates remote players */
function updateRemotePlayers(deltaTime) { for(const id in players){if(id!==localPlayerId&&players[id]instanceof ClientPlayer)players[id].interpolate(deltaTime);} }

console.log("gameLogic.js loaded (Simplified - No Shooting, Multi-Raycast Ground)");
