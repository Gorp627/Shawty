// docs/gameLogic.js

// Depends on: config.js, stateMachine.js, entities.js, input.js, network.js, uiManager.js
// Accesses globals: scene, camera, controls, clock, players, velocityY, isOnGround, localPlayerId, CONFIG, THREE, ClientPlayer, Network, Input, UIManager, stateMachine, mapMesh (Expected global)

// Create a reusable Raycaster instance for ground checks
const groundCheckRaycaster = new THREE.Raycaster(); // Renamed for clarity
const downVec = new THREE.Vector3(0, -1, 0); // Reusable downward vector
const playerHeight = CONFIG?.PLAYER_HEIGHT || 1.8; // Get player height once
const playerRadius = CONFIG?.PLAYER_RADIUS || 0.4; // Get player radius once
const groundCheckDist = 0.25; // How far DOWN from origin points to check (keep relatively short)
const groundSnapThreshold = 0.2; // How close player feet need to be below ground to snap UP
const aboveFeetOffset = 0.1; // Start rays slightly above theoretical feet position

// --- Debug Ray Visualization ---
const DEBUG_GROUND_RAYS = true; // SET TO true TO SEE THE RAYS, false to disable
let debugRayHelpers = []; // Array to hold Line objects for visualization

// Function to create/update debug ray helpers
function setupOrUpdateDebugRays(origins, hits) {
    if (!DEBUG_GROUND_RAYS || !scene) { // Ensure scene exists
        // If debugging was on but now off, remove existing helpers
        if(debugRayHelpers.length > 0) {
             debugRayHelpers.forEach(helper => scene?.remove(helper.line)); // Safely remove
             debugRayHelpers = [];
        }
        return;
    }

    const materialHit = new THREE.LineBasicMaterial({ color: 0x00ff00, linewidth: 2 }); // Green for hit
    const materialMiss = new THREE.LineBasicMaterial({ color: 0xff0000, linewidth: 2 }); // Red for miss

    // If number of origins changed, recreate helpers
    if (debugRayHelpers.length !== origins.length) {
        debugRayHelpers.forEach(helper => scene.remove(helper.line)); // Remove old ones
        debugRayHelpers = []; // Clear array
        origins.forEach(() => { // Create new helpers based on new origin count
            const points = [new THREE.Vector3(), new THREE.Vector3()]; // Dummy points initially
            const geometry = new THREE.BufferGeometry().setFromPoints(points);
            const line = new THREE.Line(geometry, materialMiss); // Start as miss
            scene.add(line);
            debugRayHelpers.push({line: line, hitMaterial: materialHit, missMaterial: materialMiss, geometry: geometry});
        });
    }

    // Update positions and colors
    origins.forEach((origin, i) => {
        if (debugRayHelpers[i]) { // Ensure helper exists
            const endPoint = origin.clone().addScaledVector(downVec, groundCheckDist);
            const points = [origin, endPoint];
            debugRayHelpers[i].geometry.setFromPoints(points); // Update line geometry
            debugRayHelpers[i].geometry.computeBoundingSphere(); // Important for visibility
            debugRayHelpers[i].line.material = hits[i] ? debugRayHelpers[i].hitMaterial : debugRayHelpers[i].missMaterial; // Update color based on hit status
        }
    });
}
// --- End Debug Ray Visualization ---


/**
 * Updates the local player's state, movement, and network synchronization.
 * Uses MULTIPLE short raycasts from player base for ground check.
 * @param {number} deltaTime Time since last frame.
 */
function updateLocalPlayer(deltaTime) {
    // --- Guard Clause: Ensure active play state and locked controls ---
    const isPlaying = stateMachine.is('playing');
    const isLocked = controls?.isLocked; // Crucial: Only update physics/movement when locked
    const localPlayerData = localPlayerId ? players[localPlayerId] : null;
    const isAlive = localPlayerData && localPlayerData.health > 0;

    // ** IMPORTANT: Stop physics/input processing if controls are not locked **
    if (!isPlaying || !isLocked || !localPlayerData || !isAlive) {
        // Reset vertical velocity when unlocked to prevent accumulating speed and sudden drop on re-lock.
        if (!isLocked) velocityY = 0;
        // Ensure debug rays are removed if we stop updating while they are visible
        if(DEBUG_GROUND_RAYS && debugRayHelpers.length > 0) {
             debugRayHelpers.forEach(helper => scene?.remove(helper.line)); debugRayHelpers = [];
        }
        return;
    }

    // --- Get References ---
    const controlsObject = controls.getObject(); // Camera / Player Rig
    const playerState = localPlayerData; // Local data cache

    // --- Store Previous Position for Collision Revert ---
    const previousPosition = controlsObject.position.clone();

    // --- Vertical Physics & Multi-Ray Ground Check ---
    let appliedGravity = true; // Assume gravity will be applied
    let onValidGround = false; // Start assuming not on ground
    let highestGroundY = -Infinity; // Track the highest ground point found under the player

    // 1. Define Ray Origins based on current position
    const playerBaseY = controlsObject.position.y - playerHeight; // Y position of player's theoretical feet
    const currentPos = controlsObject.position; // Cache current position
    const rayOrigins = [
        new THREE.Vector3(currentPos.x, playerBaseY + aboveFeetOffset, currentPos.z), // Center slightly up
        new THREE.Vector3(currentPos.x + playerRadius * 0.7, playerBaseY + aboveFeetOffset, currentPos.z), // Right (adjust multiplier .7?)
        new THREE.Vector3(currentPos.x - playerRadius * 0.7, playerBaseY + aboveFeetOffset, currentPos.z), // Left
        new THREE.Vector3(currentPos.x, playerBaseY + aboveFeetOffset, currentPos.z + playerRadius * 0.7), // Forward
        new THREE.Vector3(currentPos.x, playerBaseY + aboveFeetOffset, currentPos.z - playerRadius * 0.7)  // Back
    ];
    let rayHits = new Array(rayOrigins.length).fill(false); // Track hits per ray for debugging

    // 2. Check if mapMesh is ready for raycasting
    const isMapReady = mapMesh && mapMesh instanceof THREE.Object3D && mapMesh.children.length > 0 && mapMesh.parent === scene;
    if (isMapReady) {
        // 3. Perform Raycasts
        for (let i = 0; i < rayOrigins.length; i++) {
             const origin = rayOrigins[i];
             groundCheckRaycaster.set(origin, downVec);
             groundCheckRaycaster.far = groundCheckDistance;

             try {
                 const intersects = groundCheckRaycaster.intersectObject(mapMesh, true); // Recursive check
                 if (intersects.length > 0) {
                     // Find closest hit BELOW origin for THIS ray
                     let closestHitDist = Infinity; let hitPointY = -Infinity; let hitFoundForThisRay = false;
                     for(const hit of intersects){ if(hit.distance < closestHitDist && hit.point.y < origin.y){ closestHitDist = hit.distance; hitPointY = hit.point.y; hitFoundForThisRay = true; } }

                     if (hitFoundForThisRay && closestHitDist < groundCheckDistance) { // Hit valid ground below origin within check distance
                         onValidGround = true; // Set flag if ANY ray hits valid ground
                         highestGroundY = Math.max(highestGroundY, hitPointY); // Track highest point detected among all rays
                         rayHits[i] = true; // Mark this ray as hit for debug visualization
                     }
                 }
             } catch (e) { console.error("Raycast error:", e); onValidGround = false; break; } // Stop checking on error
        } // End ray loop

        // 4. Apply Snapping Logic if on ground
        if (onValidGround) {
            // Check if player feet are at or below the highest detected ground (+ threshold)
            if (playerBaseY <= highestGroundY + groundSnapThreshold) {
                controlsObject.position.y = highestGroundY + playerHeight; // Snap base exactly onto highest ground
                if (velocityY < 0) velocityY = 0; // Stop downward velocity
                appliedGravity = false; // Ground supports player
            }
        }

    } else {
        onValidGround = false; // Map not ready
    }

    // Update Debug Visualization (do this regardless of map ready state to potentially clear old rays)
    if (DEBUG_GROUND_RAYS || debugRayHelpers.length > 0) setupOrUpdateDebugRays(rayOrigins, rayHits);


    // 5. Apply Gravity if airborne
    if (appliedGravity) {
        velocityY -= CONFIG.GRAVITY * deltaTime;
    }

    // 6. Apply resulting vertical velocity to controls object
    controlsObject.position.y += velocityY * deltaTime;

    // 7. Update global ground state flag
    isOnGround = onValidGround;


    // --- Horizontal Movement (Based on Input & Camera Direction - Inverted A/D) ---
    const moveSpeed=Input.keys['ShiftLeft']?CONFIG.MOVEMENT_SPEED_SPRINTING:CONFIG.MOVEMENT_SPEED; const deltaSpeed=moveSpeed*deltaTime;
    const forward=new THREE.Vector3(), right=new THREE.Vector3(); camera.getWorldDirection(forward); forward.y=0; forward.normalize(); right.crossVectors(camera.up, forward).normalize();
    let moveDirection=new THREE.Vector3(0,0,0);
    if(Input.keys['KeyW']){moveDirection.add(forward);} if(Input.keys['KeyS']){moveDirection.sub(forward);}
    if(Input.keys['KeyA']){moveDirection.add(right);} // A = Right (Inverted)
    if(Input.keys['KeyD']){moveDirection.sub(right);} // D = Left (Inverted)
    if(moveDirection.lengthSq()>0){moveDirection.normalize(); controlsObject.position.addScaledVector(moveDirection,deltaSpeed);}

    // --- Dash Movement ---
    if (Input.isDashing) { controlsObject.position.addScaledVector(Input.dashDirection, CONFIG.DASH_FORCE * deltaTime); }


    // --- Collision (Player-Player - Basic Horizontal Revert) ---
    const currentPosition = controlsObject.position; const collisionRadius = CONFIG.PLAYER_COLLISION_RADIUS||0.4;
    for(const id in players){ if(id!==localPlayerId&&players[id]instanceof ClientPlayer&&players[id].mesh?.visible&&players[id].mesh.position){ const oM=players[id].mesh; const dXZ=new THREE.Vector2(currentPosition.x-oM.position.x, currentPosition.z-oM.position.z).length(); if(dXZ<collisionRadius*2){ currentPosition.x=previousPosition.x; currentPosition.z=previousPosition.z; break;}}} // Use currentPosition for modification


    // --- Void Check (Final safety net after all movement applied) ---
    if (controlsObject.position.y < CONFIG.VOID_Y_LEVEL && playerState.health > 0) {
        console.log("Player fell into void."); playerState.health = 0;
        if(UIManager){ UIManager.updateHealthBar(0); UIManager.showKillMessage("Fell."); }
        if(Network) Network.sendVoidDeath();
    }


    // --- Send Network Updates ---
    const logicalPosition = controlsObject.position.clone(); logicalPosition.y -= playerHeight; // Use calculated height
    const currentRotation = new THREE.Euler().setFromQuaternion(controlsObject.quaternion,'YXZ'); const currentRotationY = currentRotation.y;
    // *** FIX: Define lastSentState correctly BEFORE using it ***
    const lastSentState = playerState; // Get reference to local player state which caches last sent/acknowledged state

    const posThrSq=CONFIG.PLAYER_MOVE_THRESHOLD_SQ||0.0001; const rotThr=0.01;
    // Use optional chaining (?.) when accessing potentially null lastSentState properties
    const posChanged = logicalPosition.distanceToSquared(new THREE.Vector3(lastSentState?.x??0, lastSentState?.y??0, lastSentState?.z??0)) > posThrSq;
    const rotChanged = Math.abs(currentRotationY-(lastSentState?.rotationY??0)) > rotThr;

    if(posChanged||rotChanged){
        // Update local cache in playerState AFTER checks pass
        if(playerState){ // Check if playerState exists before writing
             playerState.x=logicalPosition.x; playerState.y=logicalPosition.y; playerState.z=logicalPosition.z; playerState.rotationY=currentRotationY;
        }
        // Send update using correct variable logicalPosition
        if(Network)Network.sendPlayerUpdate({x:logicalPosition.x,y:logicalPosition.y,z:logicalPosition.z,rotationY:currentRotationY});
    }
} // End updateLocalPlayer


// --- REMOVED SHOOTING FUNCTIONS ---


/** Updates remote players */
function updateRemotePlayers(deltaTime) {
    for (const id in players) {
        if (id !== localPlayerId && players[id] instanceof ClientPlayer) {
            players[id].interpolate(deltaTime);
        }
    }
}

console.log("gameLogic.js loaded (Simplified - No Shooting, Multi-Raycast Ground)");
