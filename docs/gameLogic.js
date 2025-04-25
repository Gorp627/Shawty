// docs/gameLogic.js

// Needs access to globals/constants from config.js
// Needs access to functions from ui.js, player.js, core.js

function updatePlayer(deltaTime) {
    if(gameState!=='playing'||!controls?.isLocked||!localPlayerId||!players[localPlayerId])return;
    const o=controls.getObject(); const s=players[localPlayerId]; if(!s||s.health<=0)return;
    const sp=keys['ShiftLeft']?MOVEMENT_SPEED_SPRINTING:MOVEMENT_SPEED; const dS=sp*deltaTime; const pP=o.position.clone();
    velocityY-=GRAVITY*deltaTime; o.position.y+=velocityY*deltaTime;
    if(keys['KeyW']){controls.moveForward(dS);} if(keys['KeyS']){controls.moveForward(-dS);} if(keys['KeyA']){controls.moveRight(-dS);} if(keys['KeyD']){controls.moveRight(dS);}
    const cPos=o.position; for(const id in players){if(id!==localPlayerId&&players[id].mesh&&players[id].mesh.visible){const oM=players[id].mesh; const dXZ=new THREE.Vector2(cPos.x-oM.position.x,cPos.z-oM.position.z).length(); if(dXZ<PLAYER_COLLISION_RADIUS*2){o.position.x=pP.x; o.position.z=pP.z; o.position.y=cPos.y; break;}}}
    let gY=0; if(o.position.y<gY+PLAYER_HEIGHT){o.position.y=gY+PLAYER_HEIGHT;if(velocityY<0)velocityY=0;isOnGround=true;}else{isOnGround=false;}
    if(o.position.y<VOID_Y_LEVEL&&s.health>0){socket.emit('fellIntoVoid');s.health=0;updateHealthBar(0);showKillMessage("You fell into the void.");}

    // Update Gun View Model Position / Recoil
    if (typeof updateViewModel === 'function') updateViewModel(deltaTime); else console.error("updateViewModel is missing!");

    const lPos=o.position.clone(); lPos.y-=PLAYER_HEIGHT; const lS=players[localPlayerId]; const pc=lPos.distanceToSquared(new THREE.Vector3(lS?.x??0,lS?.y??0,lS?.z??0))>0.001; const cR=new THREE.Euler().setFromQuaternion(camera.quaternion,'YXZ'); const cRY=cR.y; const rc=Math.abs(cRY-(lS?.rotationY??0))>0.01;
    if(pc||rc){ if(lS){lS.x=lPos.x;lS.y=lPos.y;lS.z=lPos.z;lS.rotationY=cRY;} socket.emit('playerUpdate',{x:lPos.x,y:lPos.y,z:lPos.z,rotationY:cRY});}
}

// --- View Model Update (Recoil & CORRECTED Rotation) ---
function updateViewModel(deltaTime) {
    if(!gunViewModel || !camera) return;

    // Recover from recoil
    currentRecoilOffset.lerp(new THREE.Vector3(0,0,0), deltaTime * RECOIL_RECOVER_SPEED);

    // Calculate final gun position relative to camera
    const finalGunPos = GUN_POS_OFFSET.clone().add(currentRecoilOffset);
    gunViewModel.position.copy(finalGunPos);

    // --- CORRECTED ROTATION ---
    // Copy ONLY the camera's Y (horizontal) rotation to the gun's Y rotation.
    // Keep the gun's X and Z rotation fixed (or apply a specific initial rotation if needed).
    gunViewModel.rotation.x = 0; // Or initial gun X rotation offset
    gunViewModel.rotation.y = camera.rotation.y; // Follow camera left/right aim
    gunViewModel.rotation.z = 0; // Or initial gun Z rotation offset
    // Example: If your gun model needs initial rotation:
    // gunViewModel.rotation.set(initialXOffset, camera.rotation.y + initialYOffset, initialZOffset);
    // --- END CORRECTED ROTATION ---
}

// --- Shoot Logic ---
function shoot() {
    if(gameState!=='playing'||!socket||!localPlayerId||!controls?.isLocked||!players[localPlayerId]||players[localPlayerId].health<=0)return;
    currentRecoilOffset.copy(RECOIL_AMOUNT); // Apply recoil
    if(gunshotSound){try{gunshotSound.cloneNode().play().catch(function(e){});}catch(e){}}
    const bP=new THREE.Vector3(),bD=new THREE.Vector3(); if(!camera)return;
    camera.getWorldDirection(bD); // Aim from camera center
    if(gunViewModel && gunViewModel.parent === camera){ // Calc origin near muzzle
        const muzzleOffset = new THREE.Vector3(0,-0.05,-0.5); // Fine-tune local offset
        muzzleOffset.applyQuaternion(gunViewModel.quaternion);
        bP.copy(gunViewModel.position).add(muzzleOffset);
        bP.applyQuaternion(camera.quaternion);
        bP.add(camera.position);
    } else { camera.getWorldPosition(bP); } // Fallback
    socket.emit('shoot',{position:{x:bP.x,y:bP.y,z:bP.z},direction:{x:bD.x,y:bD.y,z:bD.z}});
}

function spawnBullet(d) { /* ... Same ... */ }
function updateBullets(dT) { /* ... Same (includes damage logs) ... */ }

console.log("gameLogic.js loaded");
