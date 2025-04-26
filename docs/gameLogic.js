// docs/gameLogic.js

// Depends on: config.js, stateMachine.js, entities.js, input.js, network.js, uiManager.js
// Accesses globals: scene, camera, controls, clock, players, velocityY, isOnGround, localPlayerId, CONFIG, THREE, ClientPlayer, Network, Input, UIManager, stateMachine, mapMesh

const groundCheckRaycaster = new THREE.Raycaster();
const downVec = new THREE.Vector3(0, -1, 0);
const playerHeight = CONFIG?.PLAYER_HEIGHT || 1.8;
const playerRadius = CONFIG?.PLAYER_RADIUS || 0.4;
const groundCheckDist = 0.25; // How far DOWN from origin points to check
const groundSnapThreshold = 0.2; // How close player feet need to be below ground to snap UP
const aboveFeetOffset = 0.1; // Start rays slightly above theoretical feet

const DEBUG_GROUND_RAYS = true; // SET TO true TO SEE THE RAYS
let debugRayHelpers = [];

function setupOrUpdateDebugRays(origins, hits) {
    if (!DEBUG_GROUND_RAYS || !scene) { if(debugRayHelpers.length > 0) { debugRayHelpers.forEach(h => scene?.remove(h.line)); debugRayHelpers = []; } return; }
    const matHit = new THREE.LineBasicMaterial({ color: 0x00ff00, linewidth: 2 });
    const matMiss = new THREE.LineBasicMaterial({ color: 0xff0000, linewidth: 2 });
    if (debugRayHelpers.length !== origins.length) {
        debugRayHelpers.forEach(h => scene.remove(h.line)); debugRayHelpers = [];
        origins.forEach(() => { const pts=[new THREE.Vector3(),new THREE.Vector3()]; const geo=new THREE.BufferGeometry().setFromPoints(pts); const ln=new THREE.Line(geo,matMiss); scene.add(ln); debugRayHelpers.push({line:ln,hitMaterial:matHit,missMaterial:matMiss,geometry:geo}); });
    }
    origins.forEach((origin, i) => { if(debugRayHelpers[i]){ const eP=origin.clone().addScaledVector(downVec,groundCheckDist); const pts=[origin,eP]; debugRayHelpers[i].geometry.setFromPoints(pts); debugRayHelpers[i].geometry.computeBoundingSphere(); debugRayHelpers[i].line.material=hits[i]?debugRayHelpers[i].hitMaterial:debugRayHelpers[i].missMaterial;} });
}


/**
 * Updates the local player's state, movement, and network synchronization.
 * @param {number} deltaTime Time since last frame.
 */
function updateLocalPlayer(deltaTime) {
    // --- Guard Clause ---
    const isPlaying = stateMachine.is('playing'); const isLocked = controls?.isLocked; const localPlayerData = localPlayerId?players[localPlayerId]:null; const isAlive = localPlayerData&&localPlayerData.health>0;
    if(!isPlaying||!isLocked||!localPlayerData||!isAlive){if(!isLocked)velocityY=0; if(DEBUG_GROUND_RAYS&&debugRayHelpers.length>0){debugRayHelpers.forEach(h=>scene?.remove(h.line)); debugRayHelpers=[];} return;}

    // --- Get References ---
    const controlsObject=controls.getObject(); const playerState=localPlayerData;
    const previousPosition=controlsObject.position.clone();

    // --- Vertical Physics & Multi-Ray Ground Check ---
    let appliedGravity = true; let onValidGround = false; let highestGroundY = -Infinity;
    const isMapReady = mapMesh && mapMesh.children.length > 0 && mapMesh.parent === scene;
    const playerBaseY = controlsObject.position.y - playerHeight; // Calculate feet Y once
    const currentPos = controlsObject.position; // Cache current position

    const rayOrigins = [
        new THREE.Vector3(currentPos.x, playerBaseY + aboveFeetOffset, currentPos.z),
        new THREE.Vector3(currentPos.x + playerRadius * 0.7, playerBaseY + aboveFeetOffset, currentPos.z),
        new THREE.Vector3(currentPos.x - playerRadius * 0.7, playerBaseY + aboveFeetOffset, currentPos.z),
        new THREE.Vector3(currentPos.x, playerBaseY + aboveFeetOffset, currentPos.z + playerRadius * 0.7),
        new THREE.Vector3(currentPos.x, playerBaseY + aboveFeetOffset, currentPos.z - playerRadius * 0.7)
    ];
    let rayHits = new Array(rayOrigins.length).fill(false);

    if (isMapReady) {
        for (let i = 0; i < rayOrigins.length; i++) {
             const origin = rayOrigins[i]; groundCheckRaycaster.set(origin, downVec); groundCheckRaycaster.far = groundCheckDistance;
             try {
                 const intersects = groundCheckRaycaster.intersectObject(mapMesh, true);
                 if(intersects.length>0){ let clDist=Infinity, hitY=-Infinity, hitFoundRay=!1; for(const hit of intersects){if(hit.distance<clDist&&hit.point.y<origin.y){clDist=hit.distance;hitY=hit.point.y;hitFoundRay=!0;}} if(hitFoundRay&&clDist<groundCheckDistance){onValidGround=!0; highestGroundY=Math.max(highestGroundY,hitY); rayHits[i]=!0;}}
             } catch (e) { console.error("Raycast error:", e); onValidGround = false; break; }
        }
        if (onValidGround) { if (playerBaseY <= highestGroundY + groundSnapThreshold) { controlsObject.position.y = highestGroundY + playerHeight; if (velocityY < 0) velocityY = 0; appliedGravity = false; } }
    } else { onValidGround = false; }

    if (DEBUG_GROUND_RAYS) setupOrUpdateDebugRays(rayOrigins, rayHits);
    if (appliedGravity) { velocityY -= CONFIG.GRAVITY * deltaTime; }
    controlsObject.position.y += velocityY * deltaTime;
    isOnGround = onValidGround;


    // --- Horizontal Movement (Inverted A/D) ---
    const moveSpeed=Input.keys['ShiftLeft']?CONFIG.MOVEMENT_SPEED_SPRINTING:CONFIG.MOVEMENT_SPEED; const deltaSpeed=moveSpeed*deltaTime;
    const forward=new THREE.Vector3(), right=new THREE.Vector3(); camera.getWorldDirection(forward); forward.y=0; forward.normalize(); right.crossVectors(camera.up, forward).normalize();
    let moveDirection=new THREE.Vector3(0,0,0);
    if(Input.keys['KeyW']){moveDirection.add(forward);} if(Input.keys['KeyS']){moveDirection.sub(forward);}
    if(Input.keys['KeyA']){moveDirection.add(right);} if(Input.keys['KeyD']){moveDirection.sub(right);}
    if(moveDirection.lengthSq()>0){moveDirection.normalize(); controlsObject.position.addScaledVector(moveDirection,deltaSpeed);}

    // --- Dash ---
    if (Input.isDashing) { controlsObject.position.addScaledVector(Input.dashDirection, CONFIG.DASH_FORCE * deltaTime); }

    // --- Collision (Player-Player) ---
    const currentPosition=controlsObject.position; const collisionRadius=CONFIG.PLAYER_COLLISION_RADIUS||0.4;
    for(const id in players){ if(id!==localPlayerId&&players[id]instanceof ClientPlayer&&players[id].mesh?.visible&&players[id].mesh.position){ const oM=players[id].mesh; const dXZ=new THREE.Vector2(currentPosition.x-oM.position.x, currentPosition.z-oM.position.z).length(); if(dXZ<collisionRadius*2){ currentPosition.x=previousPosition.x; currentPosition.z=previousPosition.z; break;}}} // Use currentPosition for modification

    // --- Void Check ---
    if (controlsObject.position.y < CONFIG.VOID_Y_LEVEL && playerState.health > 0) { console.log("Fell."); playerState.health = 0; if(UIManager){UIManager.updateHealthBar(0); UIManager.showKillMessage("Fell.");} if(Network) Network.sendVoidDeath();}

    // --- Send Network Updates ---
    const logicalPosition = controlsObject.position.clone(); logicalPosition.y -= playerHeight;
    const currentRotation = new THREE.Euler().setFromQuaternion(controlsObject.quaternion,'YXZ'); const currentRotationY = currentRotation.y;
    // *** FIX: Define lS (lastSentState) correctly BEFORE using it ***
    const lastSentState = playerState; // Or potentially another variable holding the *last state actually sent*

    const posThrSq=CONFIG.PLAYER_MOVE_THRESHOLD_SQ||0.0001; const rotThr=0.01;
    // Use optional chaining (?.) when accessing potentially null lastSentState
    const posChanged = logicalPosition.distanceToSquared(new THREE.Vector3(lastSentState?.x??0, lastSentState?.y??0, lastSentState?.z??0)) > posThrSq;
    const rotChanged = Math.abs(currentRotationY-(lastSentState?.rotationY??0)) > rotThr;

    if(posChanged||rotChanged){
        // Update local cache in playerState AFTER checks pass
        if(playerState){ // Check if playerState exists
             playerState.x=logicalPosition.x; playerState.y=logicalPosition.y; playerState.z=logicalPosition.z; playerState.rotationY=currentRotationY;
        }
        // Send update using correct variable logicalPosition
        if(Network)Network.sendPlayerUpdate({x:logicalPosition.x,y:logicalPosition.y,z:logicalPosition.z,rotationY:currentRotationY});
    }
} // End updateLocalPlayer


// --- REMOVED SHOOTING FUNCTIONS ---


/** Updates remote players */
function updateRemotePlayers(deltaTime) { for(const id in players){if(id!==localPlayerId&&players[id]instanceof ClientPlayer)players[id].interpolate(deltaTime);} }

console.log("gameLogic.js loaded (Simplified - No Shooting, Multi-Raycast Ground)");
