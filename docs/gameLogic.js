// docs/gameLogic.js

// Depends on: config.js, stateMachine.js, entities.js, input.js, network.js, uiManager.js
// Accesses globals: camera, controls, players, localPlayerId, CONFIG, THREE, ClientPlayer, Network, Input, UIManager, stateMachine,
//                   velocityY, isOnGround, raycaster // Removed mapMesh from global access list

// Controls movement (Horizontal + Vertical), Dash, Collision (Player/Ground), Void Check, and Network updates.

/**
 * Updates the local player's physics, state, movement, dash, collision, and network sync.
 * @param {number} deltaTime Time since last frame.
 * @param {THREE.Object3D} mapMeshParam Reference to the loaded map mesh object. <<< PARAM ADDED
 */
function updateLocalPlayer(deltaTime, mapMeshParam) { // <<< PARAM ADDED
    // --- Guard Clause: Ensure active play state and locked controls ---
    const isPlaying = typeof stateMachine !== 'undefined' && stateMachine.is('playing');
    const isLocked = typeof controls !== 'undefined' && controls?.isLocked;
    const localPlayerData = localPlayerId ? players[localPlayerId] : null;

    // STOP processing if not playing, not locked, or local player doesn't exist
    if (!isPlaying || !isLocked || !localPlayerData) {
        return;
    }

    // Check if alive *after* basic checks
    const isAlive = localPlayerData.health > 0;

    // --- Get References ---
    const controlsObject = controls.getObject();

    // --- Store Previous Position for Revert ---
    const previousPosition = controlsObject.position.clone();

    // --- 1. Apply Gravity ---
    if (isAlive) {
        velocityY -= (CONFIG.GRAVITY || 25.0) * deltaTime;
    } else {
        velocityY = 0;
    }

    // --- 2. Update Vertical Position based on Velocity ---
    controlsObject.position.y += velocityY * deltaTime;
    isOnGround = false; // Assume not on ground

    // --- 3. Ground Collision Check (Raycast) ---
    // Use the passed mapMeshParam
    if (mapMeshParam && isAlive) { // <<< Use mapMeshParam
        const feetOffset = 0.1;
        const groundCheckDistance = feetOffset + 0.1;
        const cameraOffsetCheck = CONFIG.CAMERA_Y_OFFSET || 1.9;
        const rayOrigin = new THREE.Vector3(
            controlsObject.position.x,
            controlsObject.position.y - cameraOffsetCheck + feetOffset,
            controlsObject.position.z
        );
        const rayDirection = new THREE.Vector3(0, -1, 0);

        if (typeof raycaster === 'undefined') { console.error("Raycaster missing!"); raycaster = new THREE.Raycaster(); }
        raycaster.set(rayOrigin, rayDirection);
        raycaster.far = groundCheckDistance;

        const intersects = raycaster.intersectObject(mapMeshParam, true); // <<< Use mapMeshParam

        if (intersects.length > 0) {
            const distanceToGround = intersects[0].distance;
            if (distanceToGround <= feetOffset + 0.01) {
                isOnGround = true;
                velocityY = 0;
                controlsObject.position.y = intersects[0].point.y + cameraOffsetCheck;
            }
        }
    } else if (!mapMeshParam && isAlive) { // <<< Check mapMeshParam
         console.warn("updateLocalPlayer: mapMeshParam was null or undefined during physics update!");
    }


    // --- 4. Void Check ---
    let fellIntoVoid = false;
    if (isAlive) {
        if (controlsObject.position.y < (CONFIG.VOID_Y_LEVEL || -40)) {
            console.log("Fell below VOID_Y_LEVEL.");
            fellIntoVoid = true;
        }
        if (!fellIntoVoid && (Math.abs(controlsObject.position.x) > (CONFIG.MAP_BOUNDS_X || 50) ||
            Math.abs(controlsObject.position.z) > (CONFIG.MAP_BOUNDS_Z || 50))) {
            console.log("Fell outside MAP_BOUNDS.");
            fellIntoVoid = true;
        }

        if (fellIntoVoid) {
            console.log("Player fell into void!");
            localPlayerData.health = 0;
            if(typeof UIManager !== 'undefined') UIManager.updateHealthBar(0);
            if(typeof Network !== 'undefined') Network.sendVoidDeath();
            return; // Exit update loop
        }
    }

    // --- 5. Horizontal Movement ---
    const moveSpeed = (typeof Input !== 'undefined' && Input.keys['ShiftLeft']) ? CONFIG.MOVEMENT_SPEED_SPRINTING : CONFIG.MOVEMENT_SPEED;
    const deltaSpeed = moveSpeed * deltaTime;
    const forward = new THREE.Vector3(), right = new THREE.Vector3();

    if (typeof camera !== 'undefined') {
        camera.getWorldDirection(forward); forward.y=0; forward.normalize();
        right.crossVectors(camera.up, forward).normalize();
    } else { console.error("Camera missing!"); return; }

    let moveDirection = new THREE.Vector3(0,0,0);
    if(Input.keys['KeyW']){moveDirection.add(forward);} if(Input.keys['KeyS']){moveDirection.sub(forward);}
    if(Input.keys['KeyA']){moveDirection.add(right);}
    if(Input.keys['KeyD']){moveDirection.sub(right);}

    if(moveDirection.lengthSq() > 0){
        moveDirection.normalize();
        controlsObject.position.addScaledVector(moveDirection, deltaSpeed);
    }

    // --- 6. Dash Movement ---
    if (typeof Input !== 'undefined' && Input.isDashing) {
        controlsObject.position.addScaledVector(Input.dashDirection, CONFIG.DASH_FORCE * deltaTime);
    }

    // --- 7. Collision (Player-Player - Basic Horizontal Revert) ---
    const currentPosition = controlsObject.position;
    const collisionRadius = CONFIG.PLAYER_RADIUS || 0.4;
    const cameraOffsetCheck = CONFIG.CAMERA_Y_OFFSET || 1.9;
    const playerHeightCheck = CONFIG.PLAYER_HEIGHT || 1.8;

    for (const id in players) {
        if (id !== localPlayerId && players[id] instanceof ClientPlayer && players[id].mesh?.visible && players[id].mesh.position && players[id].health > 0) {
            const otherMesh = players[id].mesh;
            const otherPos = otherMesh.position;

            const distanceXZ = new THREE.Vector2(currentPosition.x - otherPos.x, currentPosition.z - otherPos.z).length();

            if (distanceXZ < collisionRadius * 2) {
                const currentFeetY = currentPosition.y - cameraOffsetCheck;
                let otherFeetY = otherPos.y;
                if (otherMesh.geometry instanceof THREE.CylinderGeometry) {
                     otherFeetY = otherPos.y - playerHeightCheck / 2;
                }
                const verticalDistance = Math.abs(currentFeetY - otherFeetY);

                if (verticalDistance < playerHeightCheck) {
                    currentPosition.x = previousPosition.x;
                    currentPosition.z = previousPosition.z;
                    break;
                }
            }
        }
    }


    // --- 8. Send Network Updates ---
    if (isAlive) {
        const cameraOffset = CONFIG?.CAMERA_Y_OFFSET || (CONFIG?.PLAYER_HEIGHT || 1.8);
        const logicalPosition = new THREE.Vector3(
             controlsObject.position.x,
             controlsObject.position.y - cameraOffset, // Calculate feet Y
             controlsObject.position.z
        );
        const currentRotation = new THREE.Euler().setFromQuaternion(controlsObject.quaternion,'YXZ'); const currentRotationY = currentRotation.y;

        const pTSq = CONFIG.PLAYER_MOVE_THRESHOLD_SQ || 0.0001;
        const rTh = 0.01;

        const posChanged = logicalPosition.distanceToSquared(new THREE.Vector3(localPlayerData?.x ?? 0, localPlayerData?.y ?? 0, localPlayerData?.z ?? 0)) > pTSq;
        const rotChanged = Math.abs(currentRotationY - (localPlayerData?.rotationY ?? 0)) > rTh;

        if (posChanged || rotChanged) {
            localPlayerData.x = logicalPosition.x;
            localPlayerData.y = logicalPosition.y;
            localPlayerData.z = logicalPosition.z;
            localPlayerData.rotationY = currentRotationY;

            if (typeof Network !== 'undefined') Network.sendPlayerUpdate({ x: localPlayerData.x, y: localPlayerData.y, z: localPlayerData.z, rotationY: localPlayerData.rotationY });
        }
    }
} // End updateLocalPlayer


/** Updates remote players interpolation */
function updateRemotePlayers(deltaTime) {
    for (const id in players) {
        if (id !== localPlayerId && players[id] instanceof ClientPlayer) {
            players[id].interpolate(deltaTime);
        }
    }
}

console.log("gameLogic.js loaded (Accepting mapMesh Param)");
