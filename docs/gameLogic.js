// docs/gameLogic.js

// Depends on: config.js, stateMachine.js, entities.js, input.js, network.js, uiManager.js
// NO LONGER depends on: effects.js (directly), loadManager.js (directly)
// Accesses globals: scene, camera, controls, clock, players, velocityY, isOnGround, localPlayerId, CONFIG, THREE, ClientPlayer, Network, Input, UIManager, stateMachine
// NO LONGER accesses: bullets, gunshotSound, gunViewModel, currentRecoilOffset, Bullet, Effects methods

/**
 * Updates the state of the local player based on input, physics, and collisions.
 * Sends updates to the server if necessary.
 * @param {number} deltaTime - Time elapsed since the last frame in seconds.
 */
function updateLocalPlayer(deltaTime) {
    // --- Guard Clause ---
    const isPlaying = stateMachine.is('playing');
    const isLocked = controls?.isLocked;
    const localPlayerData = localPlayerId ? players[localPlayerId] : null;
    const isAlive = localPlayerData && localPlayerData.health > 0;
    if (!isPlaying || !isLocked || !localPlayerData || !isAlive) return;

    // --- Get Objects ---
    const controlsObject = controls.getObject();
    const playerState = localPlayerData;

    // --- Movement Calculation ---
    const moveSpeed = Input.keys['ShiftLeft'] ? CONFIG.MOVEMENT_SPEED_SPRINTING : CONFIG.MOVEMENT_SPEED;
    const deltaSpeed = moveSpeed * deltaTime;
    const previousPosition = controlsObject.position.clone();

    // --- Vertical Movement (Gravity/Jump) ---
    velocityY -= CONFIG.GRAVITY * deltaTime;
    controlsObject.position.y += velocityY * deltaTime;

    // --- Horizontal Movement (Based on Input module state & camera direction) ---
    const forward = new THREE.Vector3(); const right = new THREE.Vector3();
    camera.getWorldDirection(forward); forward.y = 0; forward.normalize();
    right.crossVectors(camera.up, forward).normalize();

    let moveDirection = new THREE.Vector3(0, 0, 0);
    if (Input.keys['KeyW']) { moveDirection.add(forward); }
    if (Input.keys['KeyS']) { moveDirection.sub(forward); }
    if (Input.keys['KeyA']) { moveDirection.sub(right); }
    if (Input.keys['KeyD']) { moveDirection.add(right); }

    if (moveDirection.lengthSq() > 0) {
        moveDirection.normalize();
        controlsObject.position.addScaledVector(moveDirection, deltaSpeed);
    }

    // --- Dash Movement (Based on Input module state) ---
    if (Input.isDashing) {
        controlsObject.position.addScaledVector(Input.dashDirection, CONFIG.DASH_FORCE * deltaTime);
    }

    // --- Collision (Player-Player) ---
    const currentPosition = controlsObject.position;
    const collisionRadius = CONFIG.PLAYER_COLLISION_RADIUS || CONFIG.PLAYER_RADIUS || 0.4;
    for (const id in players) {
        if (id !== localPlayerId && players[id] instanceof ClientPlayer && players[id].mesh?.visible && players[id].mesh.position) {
            const otherMesh = players[id].mesh;
            const distanceXZ = new THREE.Vector2(currentPosition.x - otherMesh.position.x, currentPosition.z - otherMesh.position.z).length();
            if (distanceXZ < collisionRadius * 2) {
                controlsObject.position.x = previousPosition.x;
                controlsObject.position.z = previousPosition.z;
                break;
            }
        }
    }

    // --- Ground Check (Basic - Assumes flat ground) ---
    const groundY = 0;
    if (controlsObject.position.y < groundY + CONFIG.PLAYER_HEIGHT) {
        controlsObject.position.y = groundY + CONFIG.PLAYER_HEIGHT;
        if (velocityY < 0) { velocityY = 0; }
        isOnGround = true;
    } else {
        isOnGround = false;
    }

    // --- Void Check ---
    if (controlsObject.position.y < CONFIG.VOID_Y_LEVEL && playerState.health > 0) {
        console.log("Player fell into void."); playerState.health = 0;
        if(UIManager){ UIManager.updateHealthBar(0); UIManager.showKillMessage("Fell."); }
        if(Network) Network.sendVoidDeath();
    }

    // --- Apply Recoil / View Model Updates - REMOVED ---
    // if (camera && currentRecoilOffset && (currentRecoilOffset.x !== 0 || currentRecoilOffset.y !== 0)) {
    //     camera.rotation.x -= currentRecoilOffset.y * 0.1;
    // }
    // if (Effects?.updateViewModel) Effects.updateViewModel(deltaTime); // Removed as Effects.updateViewModel is gone/empty


    // --- Send Network Updates ---
    const logicalPosition = controlsObject.position.clone(); logicalPosition.y -= CONFIG.PLAYER_HEIGHT;
    const currentRotation = new THREE.Euler().setFromQuaternion(controlsObject.quaternion, 'YXZ');
    const currentRotationY = currentRotation.y;
    const lastSentState = playerState;

    const posThresholdSq = CONFIG.PLAYER_MOVE_THRESHOLD_SQ || 0.0001;
    const positionChanged = logicalPosition.distanceToSquared( new THREE.Vector3(lastSentState?.x ?? 0, lastSentState?.y ?? 0, lastSentState?.z ?? 0) ) > posThresholdSq;
    const rotationThreshold = 0.01;
    const rotationChanged = Math.abs(currentRotationY - (lastSentState?.rotationY ?? 0)) > rotationThreshold;

    if (positionChanged || rotationChanged) {
        if (lastSentState) { lastSentState.x = logicalPosition.x; lastSentState.y = logicalPosition.y; lastSentState.z = logicalPosition.z; lastSentState.rotationY = currentRotationY; }
        if(Network) Network.sendPlayerUpdate({ x:logicalPosition.x, y:logicalPosition.y, z:logicalPosition.z, rotationY:currentRotationY });
    }
}

// --- REMOVED SHOOTING RELATED FUNCTIONS ---
// function shoot() { ... }
// function spawnBullet(data) { ... }
// function updateBullets(deltaTime) { ... }
// --- END REMOVED ---


/** Updates the interpolation for remote players' visual representations. */
function updateRemotePlayers(deltaTime) {
    for (const id in players) {
        if (id !== localPlayerId && players[id] instanceof ClientPlayer) { // Check type
            players[id].interpolate(deltaTime);
        }
    }
}

console.log("gameLogic.js loaded (Simplified - No Shooting)");
