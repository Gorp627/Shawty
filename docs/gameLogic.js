// docs/gameLogic.js

// Depends on: config.js, stateMachine.js, entities.js, input.js, effects.js, network.js, uiManager.js
// Accesses globals: scene, camera, controls, clock, players, bullets, velocityY, isOnGround, localPlayerId, gunshotSound, gunViewModel, CONFIG, THREE, ClientPlayer, Network, Effects, Input, UIManager, stateMachine, Bullet

/**
 * Updates the state of the local player based on input, physics, and collisions.
 * Sends updates to the server if necessary.
 * @param {number} deltaTime - Time elapsed since the last frame in seconds.
 */
function updateLocalPlayer(deltaTime) {
    // Guard clause checks
    const isPlaying = stateMachine.is('playing');
    const isLocked = controls?.isLocked;
    const hasLocalPlayer = localPlayerId && players[localPlayerId];
    const isAlive = hasLocalPlayer && players[localPlayerId].health > 0;
    if (!isPlaying || !isLocked || !hasLocalPlayer || !isAlive) return; // Skip if conditions not met

    const controlsObject = controls.getObject();
    const localPlayerState = players[localPlayerId];
    const moveSpeed = Input.keys['ShiftLeft'] ? CONFIG.MOVEMENT_SPEED_SPRINTING : CONFIG.MOVEMENT_SPEED;
    const deltaSpeed = moveSpeed * deltaTime;
    const previousPosition = controlsObject.position.clone();

    // Vertical Movement
    velocityY -= CONFIG.GRAVITY * deltaTime;
    controlsObject.position.y += velocityY * deltaTime;

    // Horizontal Movement
    if (Input.keys['KeyW']) { controls.moveForward(deltaSpeed); }
    if (Input.keys['KeyS']) { controls.moveForward(-deltaSpeed); }
    if (Input.keys['KeyA']) { controls.moveRight(-deltaSpeed); }
    if (Input.keys['KeyD']) { controls.moveRight(deltaSpeed); }

    // Dash Movement
    if (Input.isDashing) { controlsObject.position.addScaledVector(Input.dashDirection, CONFIG.DASH_FORCE * deltaTime); }

    // Player-Player Collision
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

    // Ground Check
    const groundY = 0;
    if (controlsObject.position.y < groundY + CONFIG.PLAYER_HEIGHT) {
        controlsObject.position.y = groundY + CONFIG.PLAYER_HEIGHT;
        if (velocityY < 0) { velocityY = 0; }
        isOnGround = true;
    } else { isOnGround = false; }

    // Void Check
    if (controlsObject.position.y < CONFIG.VOID_Y_LEVEL && localPlayerState.health > 0) {
        console.log("Player fell into void."); localPlayerState.health = 0;
        if(UIManager){ UIManager.updateHealthBar(0); UIManager.showKillMessage("You fell out of the world."); }
        if(Network) Network.sendVoidDeath(); // Check if Network exists
    }

    // Update View Model
    if (Effects?.updateViewModel) Effects.updateViewModel(deltaTime); // Check if Effects and function exist

    // Send Network Updates
    const logicalPosition = controlsObject.position.clone(); logicalPosition.y -= CONFIG.PLAYER_HEIGHT;
    const currentRotation = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ'); const currentRotationY = currentRotation.y;
    const lastSentState = localPlayerState;
    const posChanged = logicalPosition.distanceToSquared(new THREE.Vector3(lastSentState?.x ?? 0, lastSentState?.y ?? 0, lastSentState?.z ?? 0)) > CONFIG.PLAYER_MOVE_THRESHOLD_SQ;
    const rotChanged = Math.abs(currentRotationY - (lastSentState?.rotationY ?? 0)) > 0.01;
    if (posChanged || rotChanged) {
        if (lastSentState) { lastSentState.x = logicalPosition.x; lastSentState.y = logicalPosition.y; lastSentState.z = logicalPosition.z; lastSentState.rotationY = currentRotationY; }
        if(Network) Network.sendPlayerUpdate({ x: logicalPosition.x, y: logicalPosition.y, z: logicalPosition.z, rotationY: currentRotationY }); // Check if Network exists
    }
}

/**
 * Initiates the shooting action for the local player.
 */
function shoot() {
    const isPlaying = stateMachine.is('playing'); const isLocked = controls?.isLocked; const hasLocalPlayer = localPlayerId && players[localPlayerId]; const isAlive = hasLocalPlayer && players[localPlayerId].health > 0; const hasCamera = !!camera;
    if (!isPlaying || !isLocked || !hasLocalPlayer || !isAlive || !hasCamera) { console.warn("Shoot conditions not met."); return; }

    // Effects
    if (Effects) {
        if(Effects.triggerRecoil) Effects.triggerRecoil(); // Check function existence
        if(Effects.triggerMuzzleFlash) Effects.triggerMuzzleFlash(); // Check function existence
    }

    // *** ADDED LOGGING FOR SOUND ***
    console.log("[gameLogic] Attempting sound. Global gunshotSound:", gunshotSound);
    if (gunshotSound && typeof gunshotSound.cloneNode === 'function') {
        try {
             const sound = gunshotSound.cloneNode();
             console.log("[gameLogic] Cloned sound node. Calling play...");
             sound.play().then(() => {
                 console.log("[gameLogic] Gunshot sound playback started.");
             }).catch(function(e) {
                 // Browser often prevents rapid plays or plays before metadata loaded. Often ignorable.
                 console.warn("[gameLogic] Gunshot sound play() promise rejected (may be ok):", e.message);
             });
        } catch(e) {
             console.error("[gameLogic] Error cloning/playing gunshot sound:", e);
        }
    } else {
         console.warn("[gameLogic] gunshotSound object missing or invalid.");
    }

    // Bullet Origin/Direction
    const bulletPosition = new THREE.Vector3(); const bulletDirection = new THREE.Vector3();
    camera.getWorldDirection(bulletDirection);
    if (gunViewModel && gunViewModel.parent === camera && typeof gunViewModel.localToWorld === 'function') {
         const worldMuzzlePosition = gunViewModel.localToWorld(CONFIG.MUZZLE_LOCAL_OFFSET.clone());
         bulletPosition.copy(worldMuzzlePosition);
    } else { // Fallback
         camera.getWorldPosition(bulletPosition);
         bulletPosition.addScaledVector(bulletDirection, (CONFIG.PLAYER_RADIUS || 0.4) * 2);
    }
    // *** ADDED LOGGING FOR BULLET SPAWN ***
    console.log("[gameLogic] Bullet Spawn Origin:", bulletPosition.toArray(), "Direction:", bulletDirection.toArray());
    console.log("[gameLogic] Using Muzzle Offset:", CONFIG.MUZZLE_LOCAL_OFFSET.toArray());


    // Network Send
    if (Network?.sendShoot) { // Check if Network and function exist
         Network.sendShoot({
             position: { x: bulletPosition.x, y: bulletPosition.y, z: bulletPosition.z },
             direction: { x: bulletDirection.x, y: bulletDirection.y, z: bulletDirection.z }
         });
    } else { console.error("Network.sendShoot missing!"); }
}

/** Spawns a bullet instance visually on the client. */
function spawnBullet(data) {
    if (typeof Bullet !== 'undefined') {
        bullets.push(new Bullet(data));
    } else {
        console.error("Bullet class is missing! Cannot spawn bullet.");
    }
}

/** Updates all active bullets, handles movement, collision checks, and removal. */
function updateBullets(deltaTime) {
    for (let i = bullets.length - 1; i >= 0; i--) {
        const bullet = bullets[i];
        const isActive = bullet.update(deltaTime);

        if (!isActive) {
            bullet.remove();
            bullets.splice(i, 1);
            continue;
        }

        const hitPlayerId = bullet.checkCollision();
        if (hitPlayerId) {
            console.log(`Bullet ${bullet.id} hit player ${hitPlayerId}`);
            if (bullet.ownerId === localPlayerId) {
                if(Network) Network.sendHit(hitPlayerId, CONFIG.BULLET_DAMAGE); // Check if Network exists
            }
            bullet.remove();
            bullets.splice(i, 1);
            continue;
        }
        // TODO: Map Collision
    }
}

/** Updates the interpolation for remote players' visual representations. */
function updateRemotePlayers(deltaTime) {
    for (const id in players) {
        if (id !== localPlayerId && players[id] instanceof ClientPlayer) { // Ensure it's the correct type
            players[id].interpolate(deltaTime);
        }
    }
}

console.log("gameLogic.js loaded");
