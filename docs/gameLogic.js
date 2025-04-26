// docs/gameLogic.js

// Needs access to globals/constants from config.js
// Needs access to functions/objects from uiManager.js, player.js, core.js, entities.js, effects.js, input.js, network.js

function updatePlayer(deltaTime) {
    // Function to update the local player's state, physics, and send updates
    if (stateMachine.is('playing') && controls?.isLocked && localPlayerId && players[localPlayerId]) {
        const o = controls.getObject(); // Player's camera rig / collision capsule parent
        const s = players[localPlayerId]; // Player data object
        if (!s || s.health <= 0) return; // Don't update if no data or dead

        const sp = Input.keys['ShiftLeft'] ? CONFIG.MOVEMENT_SPEED_SPRINTING : CONFIG.MOVEMENT_SPEED; // Check Input state for sprint
        const dS = sp * deltaTime;
        const pPos = o.position.clone(); // Position before movement

        // Apply Gravity
        velocityY -= CONFIG.GRAVITY * deltaTime;
        o.position.y += velocityY * deltaTime;

        // Apply Horizontal Movement based on Input keys and camera direction
        if(Input.keys['KeyW']){controls.moveForward(dS);}
        if(Input.keys['KeyS']){controls.moveForward(-dS);}
        if(Input.keys['KeyA']){controls.moveRight(-dS);}
        if(Input.keys['KeyD']){controls.moveRight(dS);}

        // Collision Detection (Player-Player - very basic)
        const cPos=o.position; // Position after movement attempt
        for(const id in players){
            if(id !== localPlayerId && players[id].mesh && players[id].mesh.visible){
                const oM=players[id].mesh;
                const dXZ=new THREE.Vector2(cPos.x-oM.position.x, cPos.z-oM.position.z).length();
                if(dXZ < (CONFIG.PLAYER_COLLISION_RADIUS * 2)){
                    // Revert horizontal position if colliding
                    o.position.x=pPos.x; o.position.z=pPos.z; o.position.y=cPos.y; // Keep vertical change
                    break;
                }
            }
        }

        // Ground Check & Correction (Basic - Needs Map Collision)
        let groundY = 0; // Assuming flat ground at Y=0
        if(o.position.y < groundY + PLAYER_HEIGHT){
             o.position.y = groundY + PLAYER_HEIGHT; // Don't fall through floor
             if(velocityY < 0) velocityY = 0; // Stop falling velocity
             isOnGround = true;
        } else {
            isOnGround = false;
        }

        // Void Check
        if(o.position.y < CONFIG.VOID_Y_LEVEL && s.health > 0){
            if (typeof Network !== 'undefined' && typeof Network.sendVoidDeath === 'function') { // Ensure Network module is loaded
                 Network.sendVoidDeath(); // Tell server about falling
            }
            s.health = 0; // Set local health immediately
            if (typeof UIManager !== 'undefined') { // Ensure UIManager is loaded
                UIManager.updateHealthBar(0);
                UIManager.showKillMessage("You fell into the void.");
            }
        }

        // Update Gun View Model (calls function from effects.js)
        if (typeof Effects !== 'undefined' && typeof Effects.updateViewModel === 'function') {
             Effects.updateViewModel(deltaTime);
        }

        // Send Updates to Server (If position or rotation changed)
        const logicalPos = o.position.clone(); logicalPos.y -= PLAYER_HEIGHT; // Feet position
        const lS = players[localPlayerId]; // Use current state for comparison
        const posChanged = logicalPos.distanceToSquared(new THREE.Vector3(lS?.x??0, lS?.y??0, lS?.z??0)) > CONFIG.PLAYER_MOVE_THRESHOLD_SQ;
        const camRot = new THREE.Euler().setFromQuaternion(camera.quaternion,'YXZ'); const curRotY = camRot.y;
        const rotChanged = Math.abs(curRotY-(lS?.rotationY??0)) > 0.01; // Rotation threshold

        if(posChanged || rotChanged){
             if(lS){ // Update local cache of last sent state
                  lS.x=logicalPos.x;lS.y=logicalPos.y;lS.z=logicalPos.z;lS.rotationY=curRotY;
             }
              // Ensure network function exists before calling
             if(typeof Network !== 'undefined' && typeof Network.sendPlayerUpdate === 'function') {
                Network.sendPlayerUpdate({x:logicalPos.x,y:logicalPos.y,z:logicalPos.z,rotationY:curRotY});
             }
        }
    }
}


// --- Shoot Logic ---
function shoot() {
    // Checks moved to Input handler mostly, but keep some guards
    if (!stateMachine.is('playing') || !controls?.isLocked || !localPlayerId || !players[localPlayerId]?.health > 0) return;

    // Apply recoil (calls function in effects.js)
    if (typeof Effects !== 'undefined' && typeof Effects.triggerRecoil === 'function') Effects.triggerRecoil();

    // Play sound (uses global gunshotSound from config.js)
    if(gunshotSound){ try{ gunshotSound.cloneNode().play().catch(function(e){}); } catch(e){} } else { console.warn("No gunshot sound."); }

    // Calculate bullet position/direction
    const bulletPosition=new THREE.Vector3(); const bulletDirection=new THREE.Vector3();
    if(!camera) return; // Need camera
    camera.getWorldDirection(bulletDirection); // Aim direction

    if(gunViewModel && gunViewModel.parent === camera){ // Use gun muzzle if possible
        const worldMuzzlePosition = gunViewModel.localToWorld(CONFIG.MUZZLE_LOCAL_OFFSET.clone());
        bulletPosition.copy(worldMuzzlePosition);
    } else { // Fallback to camera center
        camera.getWorldPosition(bulletPosition); bulletPosition.addScaledVector(bulletDirection, PLAYER_RADIUS*2);
    }

    // Send to server (calls function in network.js)
    if (typeof Network !== 'undefined' && typeof Network.sendShoot === 'function') {
         Network.sendShoot({position:{x:bulletPosition.x,y:bulletPosition.y,z:bulletPosition.z},direction:{x:bulletDirection.x,y:bulletDirection.y,z:bulletDirection.z}});
    }
}

// --- Bullet Handling ---
function spawnBullet(data) {
     if (typeof Bullet !== 'undefined') { // Check if Bullet class exists
         const newBullet = new Bullet(data); // Create instance from entities.js
         bullets.push(newBullet); // Add to global array
     } else { console.error("Bullet class not defined!"); }
}

function updateBullets(deltaTime) {
    for (let i = bullets.length - 1; i >= 0; i--) {
        const bullet = bullets[i];
        const isActive = bullet.update(deltaTime); // Update position and check lifetime

        if (!isActive) {
            // Remove if lifetime expired or went out of bounds
            bullet.remove();
            bullets.splice(i, 1);
            continue;
        }

        // Check collision against players
        const hitPlayerId = bullet.checkCollision(); // CheckCollision defined in entities.js
        if (hitPlayerId) {
             if (bullet.ownerId === localPlayerId) { // Only local player reports hits
                 if (typeof Network !== 'undefined' && typeof Network.sendHit === 'function') {
                     Network.sendHit(hitPlayerId, CONFIG.BULLET_DAMAGE); // Use damage from config
                 }
             }
             // Remove bullet visuals and data immediately on hit
             bullet.remove();
             bullets.splice(i, 1);
        }
        // TODO: Check map collision here (e.g., raycast) and remove if hit
    }
}


console.log("gameLogic.js loaded");
