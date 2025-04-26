// docs/gameLogic.js

// Depends on: config.js, stateMachine.js, entities.js, input.js, effects.js, network.js, uiManager.js
// Accesses globals: scene, camera, controls, clock, players, bullets, velocityY, isOnGround, localPlayerId, gunshotSound

function updateLocalPlayer(deltaTime) { // Renamed from updatePlayer
    // Combined Guard Clause
    if(!stateMachine.is('playing')||!controls?.isLocked||!localPlayerId||!players[localPlayerId]||players[localPlayerId].health<=0)return;

    const o=controls.getObject(); const s=players[localPlayerId];
    const sp=Input.keys['ShiftLeft']?CONFIG.MOVEMENT_SPEED_SPRINTING:CONFIG.MOVEMENT_SPEED;
    const dS=sp*deltaTime; const pPos=o.position.clone();

    // Vertical Movement (Gravity/Jump)
    velocityY-=CONFIG.GRAVITY*deltaTime; o.position.y+=velocityY*deltaTime;

    // Horizontal Movement (Uses Input module state)
    if(Input.keys['KeyW']){controls.moveForward(dS);} if(Input.keys['KeyS']){controls.moveForward(-dS);}
    if(Input.keys['KeyA']){controls.moveRight(-dS);} if(Input.keys['KeyD']){controls.moveRight(dS);}

    // Dash Movement (Uses Input module state)
    if (Input.isDashing) { o.position.addScaledVector(Input.dashDirection, CONFIG.DASH_FORCE * deltaTime); }

    // Collision (Player-Player)
    const cPos=o.position; for(const id in players){if(id!==localPlayerId&&players[id].mesh&&players[id].mesh.visible){const oM=players[id].mesh; const dXZ=new THREE.Vector2(cPos.x-oM.position.x,cPos.z-oM.position.z).length(); if(dXZ<CONFIG.PLAYER_COLLISION_RADIUS*2){o.position.x=pPos.x; o.position.z=pPos.z; o.position.y=cPos.y; break;}}}

    // Ground Check (Basic - Needs Raycasting)
    let gY=0; if(o.position.y<gY+PLAYER_HEIGHT){o.position.y=gY+PLAYER_HEIGHT;if(velocityY<0)velocityY=0;isOnGround=true;}else{isOnGround=false;}

    // Void Check
    if(o.position.y<CONFIG.VOID_Y_LEVEL&&s.health>0){Network.sendVoidDeath();s.health=0;UIManager.updateHealthBar(0);UIManager.showKillMessage("Fell.");}

    // Update View Model using Effects module
    Effects.updateViewModel(deltaTime);

    // Send Updates via Network module
    const lPos=o.position.clone(); lPos.y-=PLAYER_HEIGHT; const lS=players[localPlayerId]; const pc=lPos.distanceToSquared(new THREE.Vector3(lS?.x??0,lS?.y??0,lS?.z??0))>CONFIG.PLAYER_MOVE_THRESHOLD_SQ; const cR=new THREE.Euler().setFromQuaternion(camera.quaternion,'YXZ'); const cRY=cR.y; const rc=Math.abs(cRY-(lS?.rotationY??0))>0.01;
    if(pc||rc){ if(lS){lS.x=lPos.x;lS.y=lPos.y;lS.z=lPos.z;lS.rotationY=cRY;} Network.sendPlayerUpdate({x:lPos.x,y:lPos.y,z:lPos.z,rotationY:cRY});}
}

function shoot() { // Called by Input Manager
    if (!stateMachine.is('playing') || !controls?.isLocked || !localPlayerId || !players[localPlayerId]?.health > 0) return;
    Effects.triggerRecoil(); // Use Effects object
    if(gunshotSound){try{gunshotSound.cloneNode().play().catch(function(e){});}catch(e){}}
    const bP=new THREE.Vector3(),bD=new THREE.Vector3(); if(!camera) return;
    camera.getWorldDirection(bD); // Aim direction from camera
    // Bullet origin from gun (via Effects object holding gunViewModel ref?) - No, gunViewModel is global for now
    if(gunViewModel && gunViewModel.parent === camera){ const worldMuzzlePosition = gunViewModel.localToWorld(CONFIG.MUZZLE_LOCAL_OFFSET.clone()); bP.copy(worldMuzzlePosition); }
    else { camera.getWorldPosition(bP); bP.addScaledVector(bD, CONFIG.PLAYER_RADIUS*2); } // Fallback
    Network.sendShoot({position:{x:bP.x,y:bP.y,z:bP.z},direction:{x:bD.x,y:bD.y,z:bD.z}}); // Use Network object
}

function spawnBullet(d) { if (typeof Bullet !== 'undefined') { bullets.push(new Bullet(d)); } else console.error("Bullet class missing!"); }

function updateBullets(dT) { // Handles bullet movement & client-side collision checks
    for (let i = bullets.length - 1; i >= 0; i--) {
        const bullet = bullets[i];
        const isActive = bullet.update(dT);
        if (!isActive) { bullet.remove(); bullets.splice(i, 1); continue; } // Remove if expired/out of bounds
        const hitPlayerId = bullet.checkCollision(); // Check player collision
        if (hitPlayerId) {
             if (bullet.ownerId === localPlayerId) { Network.sendHit(hitPlayerId, CONFIG.BULLET_DAMAGE); } // Use Network object
             bullet.remove(); bullets.splice(i, 1);
             continue; // Stop processing this bullet
        }
         // TODO: Check map collision here
         // const didHitMap = checkMapCollision(bullet.mesh.position);
         // if (didHitMap) { Effects.createImpact(bullet.mesh.position); bullet.remove(); bullets.splice(i, 1); }
    }
}

function updateRemotePlayers(deltaTime) { // Renamed from updateOtherPlayers
     for(const id in players){
        if(id !== localPlayerId && players[id] instanceof ClientPlayer) { // Ensure it's a ClientPlayer instance
            players[id].interpolate(deltaTime);
        }
     }
 }

 // Map collision check (placeholder)
 // function checkMapCollision(position) { return false; }


console.log("gameLogic.js loaded");
