// docs/gameLogic.js

// Needs access to globals/constants from config.js
// Needs access to functions/objects from uiManager.js, player.js, core.js, entities.js, effects.js, input.js, network.js

function updatePlayer(deltaTime) {
    if(!stateMachine.is('playing')||!controls?.isLocked||!localPlayerId||!players[localPlayerId])return;
    const o=controls.getObject(); const s=players[localPlayerId]; if(!s||s.health<=0)return;
    const sp=Input.keys['ShiftLeft']?CONFIG.MOVEMENT_SPEED_SPRINTING:CONFIG.MOVEMENT_SPEED; // Use Input.keys
    const dS=sp*deltaTime; const pPos=o.position.clone();
    velocityY-=CONFIG.GRAVITY*deltaTime; o.position.y+=velocityY*deltaTime;
    // Use Input.keys for movement checks
    if(Input.keys['KeyW']){controls.moveForward(dS);} if(Input.keys['KeyS']){controls.moveForward(-dS);}
    if(Input.keys['KeyA']){controls.moveRight(-dS);} if(Input.keys['KeyD']){controls.moveRight(dS);}
    // Dash Movement (apply impulse based on dash direction)
    if (Input.isDashing) {
        o.position.addScaledVector(Input.dashDirection, CONFIG.DASH_FORCE * deltaTime);
    }
    const cPos=o.position; for(const id in players){if(id!==localPlayerId&&players[id].mesh&&players[id].mesh.visible){const oM=players[id].mesh; const dXZ=new THREE.Vector2(cPos.x-oM.position.x,cPos.z-oM.position.z).length(); if(dXZ<CONFIG.PLAYER_COLLISION_RADIUS*2){o.position.x=pPos.x; o.position.z=pPos.z; o.position.y=cPos.y; break;}}}
    let gY=0; // TODO: Map Collision
    if(o.position.y<gY+PLAYER_HEIGHT){o.position.y=gY+PLAYER_HEIGHT;if(velocityY<0)velocityY=0;isOnGround=true;}else{isOnGround=false;}
    if(o.position.y<CONFIG.VOID_Y_LEVEL&&s.health>0){if(typeof Network!=='undefined')Network.sendVoidDeath();s.health=0;if(typeof UIManager!=='undefined'){UIManager.updateHealthBar(0);UIManager.showKillMessage("Fell.");}}
    if (typeof Effects !== 'undefined') Effects.updateViewModel(deltaTime); // Use Effects object
    const lPos=o.position.clone(); lPos.y-=PLAYER_HEIGHT; const lS=players[localPlayerId]; const pc=lPos.distanceToSquared(new THREE.Vector3(lS?.x??0,lS?.y??0,lS?.z??0))>CONFIG.PLAYER_MOVE_THRESHOLD_SQ; const cR=new THREE.Euler().setFromQuaternion(camera.quaternion,'YXZ'); const cRY=cR.y; const rc=Math.abs(cRY-(lS?.rotationY??0))>0.01;
    if(pc||rc){ if(lS){lS.x=lPos.x;lS.y=lPos.y;lS.z=lPos.z;lS.rotationY=cRY;} if(typeof Network!=='undefined')Network.sendPlayerUpdate({x:lPos.x,y:lPos.y,z:lPos.z,rotationY:cRY});}
}

// --- Shoot Logic ---
function shoot() {
    if (!stateMachine.is('playing') || !controls?.isLocked || !localPlayerId || !players[localPlayerId]?.health > 0) return;
    if (typeof Effects !== 'undefined') Effects.triggerRecoil(); // Use Effects
    if(gunshotSound){try{gunshotSound.cloneNode().play().catch(function(e){});}catch(e){}}
    const bulletPosition=new THREE.Vector3(),bulletDirection=new THREE.Vector3(); if(!camera) return;
    camera.getWorldDirection(bulletDirection);
    if(gunViewModel && gunViewModel.parent === camera){ const worldMuzzlePosition = gunViewModel.localToWorld(CONFIG.MUZZLE_LOCAL_OFFSET.clone()); bulletPosition.copy(worldMuzzlePosition); }
    else { camera.getWorldPosition(bulletPosition); bulletPosition.addScaledVector(bulletDirection, PLAYER_RADIUS*2); }
    if (typeof Network !== 'undefined') Network.sendShoot({position:{x:bulletPosition.x,y:bulletPosition.y,z:bulletPosition.z},direction:{x:bulletDirection.x,y:bulletDirection.y,z:bulletDirection.z}});
}

// --- Bullet Handling ---
function spawnBullet(d) { if (typeof Bullet !== 'undefined') { bullets.push(new Bullet(d)); } else console.error("Bullet class missing!"); }
function updateBullets(dT) {
    for (let i = bullets.length - 1; i >= 0; i--) {
        const bullet = bullets[i];
        const isActive = bullet.update(dT); // Update position and check lifetime
        if (!isActive) { bullet.remove(); bullets.splice(i, 1); continue; }
        const hitPlayerId = bullet.checkCollision(); // Check player collision
        if (hitPlayerId) { if (bullet.ownerId === localPlayerId) { if(typeof Network!=='undefined') Network.sendHit(hitPlayerId, CONFIG.BULLET_DAMAGE); } bullet.remove(); bullets.splice(i, 1); }
         // TODO: Check map collision here
    }
}

console.log("gameLogic.js loaded");
