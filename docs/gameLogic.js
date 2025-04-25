// docs/gameLogic.js

// Needs access to globals: gameState, controls, localPlayerId, players, keys, velocityY, isOnGround, camera, scene, bullets, socket etc.
// Needs access to constants: PLAYER_HEIGHT, GRAVITY, JUMP_FORCE, MOVEMENT_SPEED*, PLAYER_COLLISION_RADIUS, VOID_Y_LEVEL, BULLET_SPEED, RECOIL_AMOUNT, PLAYER_RADIUS etc.
// Needs access to functions: updateHealthBar, showKillMessage, shoot, spawnBullet, updateViewModel

function updatePlayer(deltaTime) {
    if(gameState!=='playing'||!controls?.isLocked||!localPlayerId||!players[localPlayerId])return;
    const o=controls.getObject(); const s=players[localPlayerId]; if(!s||s.health<=0)return;
    const sp=keys['ShiftLeft']?MOVEMENT_SPEED_SPRINTING:MOVEMENT_SPEED; const dS=sp*deltaTime; const pP=o.position.clone();
    velocityY-=GRAVITY*deltaTime; o.position.y+=velocityY*deltaTime;
    if(keys['KeyW']){controls.moveForward(dS);} if(keys['KeyS']){controls.moveForward(-dS);} if(keys['KeyA']){controls.moveRight(-dS);} if(keys['KeyD']){controls.moveRight(dS);}
    const cP=o.position; for(const id in players){if(id!==localPlayerId&&players[id].mesh&&players[id].mesh.visible){const oM=players[id].mesh; const dXZ=new THREE.Vector2(cP.x-oM.position.x,cP.z-oM.position.z).length(); if(dXZ<PLAYER_COLLISION_RADIUS*2){o.position.x=pP.x; o.position.z=pP.z; o.position.y=cP.y; break;}}}
    let gY=0; // TODO: Replace with map raycasting
    if(o.position.y<gY+PLAYER_HEIGHT){o.position.y=gY+PLAYER_HEIGHT;if(velocityY<0)velocityY=0;isOnGround=true;}else{isOnGround=false;}
    if(o.position.y<VOID_Y_LEVEL&&s.health>0){socket.emit('fellIntoVoid');s.health=0;updateHealthBar(0);showKillMessage("You fell into the void.");}

    // --- CALL GUN/RECOIL UPDATE ---
    if (typeof updateViewModel === 'function') updateViewModel(deltaTime);
    // -----------------------------

    const lP=o.position.clone(); lP.y-=PLAYER_HEIGHT; const lS=players[localPlayerId]; const pc=lP.distanceToSquared(new THREE.Vector3(lS?.x??0,lS?.y??0,lS?.z??0))>0.001; const cR=new THREE.Euler().setFromQuaternion(camera.quaternion,'YXZ'); const cRY=cR.y; const rc=Math.abs(cRY-(lS?.rotationY??0))>0.01;
    if(pc||rc){ if(lS){lS.x=lP.x;lS.y=lP.y;lS.z=lP.z;lS.rotationY=cRY;} socket.emit('playerUpdate',{x:lP.x,y:lP.y,z:lP.z,rotationY:cRY});}
}

// --- View Model Update (Recoil) - MOVED HERE ---
function updateViewModel(deltaTime) {
    if(!gunViewModel||!camera)return;
    currentRecoilOffset.lerp(new THREE.Vector3(0,0,0),deltaTime*RECOIL_RECOVER_SPEED); // Recover recoil
    const fP=GUN_POS_OFFSET.clone().add(currentRecoilOffset); // Add recoil to base offset
    gunViewModel.position.copy(fP); // Apply position relative to camera
    gunViewModel.rotation.copy(camera.rotation); // Make gun follow camera look direction
}

// --- Shoot Logic (Includes Recoil and Bullet Origin) ---
function shoot() {
    if(gameState!=='playing'||!socket||!localPlayerId||!controls?.isLocked||!players[localPlayerId]||players[localPlayerId].health<=0)return;
    currentRecoilOffset.copy(RECOIL_AMOUNT); // Apply recoil offset instantly
    if(gunshotSound){try{gunshotSound.cloneNode().play().catch(function(e){/* ignore */});}catch(e){}} else {console.warn("No gunshot sound.");}

    const bulletPosition=new THREE.Vector3();
    const bulletDirection=new THREE.Vector3();
    if(!camera) return; // Safety check

    // Use camera direction for aiming accuracy
    camera.getWorldDirection(bulletDirection);

    // Calculate visual origin near gun muzzle
    if (gunViewModel && gunViewModel.parent === camera) { // Check if gun is attached
        // Approx Muzzle Pos: Start at camera, move by gun offset, then slight forward along gun's *local* Z
        const localMuzzleOffset = new THREE.Vector3(0, -0.05, -0.5); // Fine-tune this local Z offset
        bulletPosition.copy(localMuzzleOffset); // Start with local offset
        bulletPosition.applyQuaternion(gunViewModel.quaternion); // Rotate offset by gun's rotation (relative to camera)
        bulletPosition.add(gunViewModel.position); // Add gun's offset position (relative to camera)
        bulletPosition.applyQuaternion(camera.quaternion); // Rotate combined offset by camera's world rotation
        bulletPosition.add(camera.position); // Add camera's world position
        // console.log("Bullet origin: gun approx");
    } else {
        // Fallback if gun isn't ready
        camera.getWorldPosition(bulletPosition);
        // Optional: Add slight forward offset from camera center
        // bulletPosition.addScaledVector(bulletDirection, 0.1);
        // console.log("Bullet origin: cam");
    }

    socket.emit('shoot',{position:{x:bulletPosition.x,y:bulletPosition.y,z:bulletPosition.z},direction:{x:bulletDirection.x,y:bulletDirection.y,z:bulletDirection.z}});
}

function spawnBullet(d) {
    // console.log(`Spawning bullet ${d.bulletId}`);
    // --- Smaller Bullet ---
    const geo=new THREE.SphereGeometry(0.05, 4, 4); // Smaller radius, fewer segments
    // --------------------
    const mat=new THREE.MeshBasicMaterial({color:0xffff00});const h=new THREE.Mesh(geo,mat);
    h.position.set(d.position.x,d.position.y,d.position.z);
    const v=new THREE.Vector3(d.direction.x,d.direction.y,d.direction.z).normalize().multiplyScalar(BULLET_SPEED);
    bullets.push({id:d.bulletId,mesh:h,velocity:v,ownerId:d.shooterId,spawnTime:Date.now()});
    scene.add(h);
}

function updateBullets(dT) { // Added Damage Logs
    const removeIdx=[];
    for(let i=bullets.length-1;i>=0;i--){
        const b=bullets[i];
        if(!b?.mesh){ if(!removeIdx.includes(i))removeIdx.push(i); continue; }
        b.mesh.position.addScaledVector(b.velocity,dT);
        let hit=false;
        for(const pId in players){
            if(pId!==b.ownerId && players[pId].mesh && players[pId].mesh.visible){
                const pM=players[pId].mesh; const pP=new THREE.Vector3(); pM.getWorldPosition(pP);
                const dist=b.mesh.position.distanceTo(pP);
                const pScaleR=(pM.scale?.x || 1) * PLAYER_RADIUS; // Use PLAYER_RADIUS here
                const thresh=pScaleR + 0.05; // Use player radius + bullet radius

                if(dist<thresh){
                    console.log(`Client hit: Bul ${b.id} -> P ${pId}`); // Log hit detection
                    hit=true;
                    if(b.ownerId===localPlayerId){
                        // *** LOG EMITTING HIT ***
                        console.log(`>>> Emitting 'hit' event: target=${pId}`);
                        socket.emit('hit',{targetId:pId,damage:10});
                        // *** ---------------- ***
                    }
                    if(!removeIdx.includes(i))removeIdx.push(i);
                    scene.remove(b.mesh); // Remove visual immediately
                    break; // Bullet is gone
                }
            }
        }
        if(hit)continue;
        if(Date.now()-b.spawnTime>BULLET_LIFETIME){ if(!removeIdx.includes(i))removeIdx.push(i); scene.remove(b.mesh); }
    }
    if(removeIdx.length>0){ removeIdx.sort((a,b)=>b-a); for(const idx of removeIdx){ bullets.splice(idx,1); } }
}

console.log("gameLogic.js loaded");
