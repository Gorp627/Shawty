// docs/gameLogic.js

// Depends on: config.js, stateMachine.js, entities.js, input.js, network.js, uiManager.js
// Accesses globals: scene, camera, controls, clock, players, velocityY, isOnGround, localPlayerId, CONFIG, THREE, ClientPlayer, Network, Input, UIManager, stateMachine, mapMesh

// --- REMOVED Raycaster setup ---
// const groundCheckRaycaster = new THREE.Raycaster(); ...

const playerHeight = CONFIG?.PLAYER_HEIGHT || 1.8;
const playerRadius = CONFIG?.PLAYER_RADIUS || 0.4;
const playerRadiusSq = playerRadius * playerRadius; // Pre-calculate squared radius
const groundCheckBuffer = 0.5; // How far below feet to check for vertices
const groundSnapTolerance = 0.1; // How close feet need to be to snap

/**
 * Updates the local player's state, movement, and network synchronization.
 * Uses VERTEX CHECKING for ground collision (Less performant, experimental).
 * @param {number} deltaTime Time since last frame.
 */
function updateLocalPlayer(deltaTime) {
    // --- Guard Clause ---
    const isPlaying = stateMachine.is('playing');
    const isLocked = controls?.isLocked;
    const localPlayerData = localPlayerId ? players[localPlayerId] : null;
    const isAlive = localPlayerData && localPlayerData.health > 0;
    if (!isPlaying || !isLocked || !localPlayerData || !isAlive) {
        if (!isLocked) velocityY = 0;
        return;
    }

    // --- Get References ---
    const controlsObject = controls.getObject();
    const playerState = localPlayerData;
    const previousPosition = controlsObject.position.clone();

    // --- Vertical Physics & Vertex Ground Check ---
    let appliedGravity = true;
    let onValidGround = false;
    let highestVertexY = -Infinity; // Track highest relevant vertex found below player

    const currentPos = controlsObject.position; // Cache current position
    const playerBaseY = currentPos.y - playerHeight; // Theoretical feet position

    // 1. Check if mapMesh is usable
    const isMapReady = mapMesh && mapMesh instanceof THREE.Object3D && mapMesh.children.length >= 0; // Allow empty groups if geometry is top-level
    let mapGeometries = [];

    if (isMapReady) {
        // Traverse the map object to find all Mesh geometries
        mapMesh.traverse((node) => {
            if (node.isMesh && node.geometry) {
                // We need world positions, so apply map's world matrix to vertices
                // Cloning attributes is safer but less performant. Direct access is faster for check.
                // Ensure matrixWorld is up to date. Might need scene.updateMatrixWorld() if map moves.
                mapMesh.updateMatrixWorld(true); // Ensure world matrix is current
                mapGeometries.push({ geometry: node.geometry, matrixWorld: node.matrixWorld });
            }
        });
    }

    // 2. Perform Vertex Check if map geometry was found
    if (mapGeometries.length > 0) {
        let foundGroundVertex = false;

        // Iterate through each geometry found in the map
        for (const mapGeoData of mapGeometries) {
            const positionAttribute = mapGeoData.geometry.attributes.position;
            const matrix = mapGeoData.matrixWorld;
            const vertex = new THREE.Vector3(); // Reusable vector for world vertex position

            if (!positionAttribute) continue; // Skip if geometry has no position data

            // Iterate through vertices of this geometry
            for (let i = 0; i < positionAttribute.count; i++) {
                // Get local vertex position
                vertex.fromBufferAttribute(positionAttribute, i);
                // Transform vertex to world space
                vertex.applyMatrix4(matrix);

                // Check if vertex is horizontally within player radius
                const dx = vertex.x - currentPos.x;
                const dz = vertex.z - currentPos.z;
                const distSqXZ = dx * dx + dz * dz;

                if (distSqXZ <= playerRadiusSq) {
                    // Check if vertex is below player's *origin* but within check range below feet
                    if (vertex.y < currentPos.y && vertex.y >= playerBaseY - groundCheckBuffer) {
                        // This vertex is a candidate for ground support
                        highestVertexY = Math.max(highestVertexY, vertex.y);
                        foundGroundVertex = true;
                    }
                }
            } // End vertex loop
        } // End geometry loop

        // 3. Determine Grounded State and Apply Snapping
        if (foundGroundVertex) {
            onValidGround = true;
            // Snap player UP if feet are at or below the highest detected vertex + tolerance
            if (playerBaseY <= highestVertexY + groundSnapTolerance) {
                controlsObject.position.y = highestVertexY + playerHeight; // Snap base to highest vertex
                if (velocityY < 0) velocityY = 0; // Stop downward momentum
                appliedGravity = false; // Ground supports player
            }
        } else {
            onValidGround = false; // No relevant vertices found directly below
        }

    } else { // Map not ready or no geometry found
        onValidGround = false;
    }

    // 4. Apply Gravity if airborne
    if (appliedGravity) {
        velocityY -= CONFIG.GRAVITY * deltaTime;
    }

    // 5. Apply resulting vertical velocity
    controlsObject.position.y += velocityY * deltaTime;

    // 6. Update global ground state flag
    isOnGround = onValidGround;


    // --- Horizontal Movement (Inverted A/D) ---
    const moveSpeed=Input.keys['ShiftLeft']?CONFIG.MOVEMENT_SPEED_SPRINTING:CONFIG.MOVEMENT_SPEED; const deltaSpeed=moveSpeed*deltaTime;
    const forward=new THREE.Vector3(), right=new THREE.Vector3(); camera.getWorldDirection(forward); forward.y=0; forward.normalize(); right.crossVectors(camera.up, forward).normalize();
    let moveDirection=new THREE.Vector3(0,0,0);
    if(Input.keys['KeyW']){moveDirection.add(forward);} if(Input.keys['KeyS']){moveDirection.sub(forward);}
    if(Input.keys['KeyA']){moveDirection.add(right);} // A = Right (Inverted)
    if(Input.keys['KeyD']){moveDirection.sub(right);} // D = Left (Inverted)
    if(moveDirection.lengthSq()>0){moveDirection.normalize(); controlsObject.position.addScaledVector(moveDirection,deltaSpeed);}

    // --- Dash ---
    if (Input.isDashing) { controlsObject.position.addScaledVector(Input.dashDirection, CONFIG.DASH_FORCE * deltaTime); }

    // --- Collision (Player-Player) ---
    const currentPosition=controlsObject.position; const collisionRadius=CONFIG.PLAYER_COLLISION_RADIUS||0.4;
    for(const id in players){ if(id!==localPlayerId&&players[id]instanceof ClientPlayer&&players[id].mesh?.visible&&players[id].mesh.position){ const oM=players[id].mesh; const dXZ=new THREE.Vector2(currentPosition.x-oM.position.x, currentPosition.z-oM.position.z).length(); if(dXZ<collisionRadius*2){ currentPosition.x=previousPosition.x; currentPosition.z=previousPosition.z; break;}}}

    // --- Void Check ---
    if (controlsObject.position.y < CONFIG.VOID_Y_LEVEL && playerState.health > 0) { console.log("Fell."); playerState.health = 0; if(UIManager){UIManager.updateHealthBar(0); UIManager.showKillMessage("Fell.");} if(Network) Network.sendVoidDeath();}

    // --- Send Network Updates ---
    const logicalPosition = controlsObject.position.clone(); logicalPosition.y -= playerHeight;
    const currentRotation = new THREE.Euler().setFromQuaternion(controlsObject.quaternion,'YXZ'); const currentRotationY = currentRotation.y;
    const lastSentState = playerState; // Or cache of last sent state
    const pTSq=CONFIG.PLAYER_MOVE_THRESHOLD_SQ||0.0001; const rTh=0.01;
    const pChg = logicalPosition.distanceToSquared(new THREE.Vector3(lastSentState?.x??0, lastSentState?.y??0, lastSentState?.z??0)) > pTSq;
    const rChg = Math.abs(currentRotationY-(lastSentState?.rotationY??0)) > rTh;
    if(pChg||rChg){ if(playerState){playerState.x=logicalPosition.x;playerState.y=logicalPosition.y;playerState.z=logicalPosition.z;playerState.rotationY=currentRotationY;} if(Network)Network.sendPlayerUpdate({x:logicalPosition.x,y:logicalPosition.y,z:logicalPosition.z,rotationY:currentRotationY}); }
} // End updateLocalPlayer


// --- REMOVED SHOOTING FUNCTIONS ---


/** Updates remote players */
function updateRemotePlayers(deltaTime) { for(const id in players){if(id!==localPlayerId&&players[id]instanceof ClientPlayer)players[id].interpolate(deltaTime);} }

console.log("gameLogic.js loaded (Simplified - No Shooting, Vertex Ground Check)");
