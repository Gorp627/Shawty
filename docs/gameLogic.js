// docs/gameLogic.js

// Needs access to globals/constants from config.js
// Needs access to functions from ui.js, player.js, core.js

function updatePlayer(deltaTime) {
    if(gameState!=='playing'||!controls?.isLocked||!localPlayerId||!players[localPlayerId])return;
    const o=controls.getObject(); const s=players[localPlayerId]; if(!s||s.health<=0)return;
    const sp=keys['ShiftLeft']?MOVEMENT_SPEED_SPRINTING:MOVEMENT_SPEED; const dS=sp*deltaTime;
    const pPos=o.position.clone();
    velocityY-=GRAVITY*deltaTime; o.position.y+=velocityY*deltaTime;
    // Corrected movement application
    if(keys['KeyW']){controls.moveForward(dS);} if(keys['KeyS']){controls.moveForward(-dS);}
    if(keys['KeyA']){controls.moveRight(-dS);} if(keys['KeyD']){controls.moveRight(dS);}
    const cPos=o.position; // Check position *after* movement
    for(const id in players){if(id!==localPlayerId&&players[id].mesh&&players[id].mesh.visible){const oM=players[id].mesh; const dXZ=new THREE.Vector2(cPos.x-oM.position.x,cPos.z-oM.position.z).length(); if(dXZ<PLAYER_COLLISION_RADIUS*2){o.position.x=pPos.x; o.position.z=pPos.z; o.position.y=cPos.y; break;}}}
    let gY=0; // TODO: Replace with map raycasting
    if(o.position.y<gY+PLAYER_HEIGHT){o.position.y=gY+PLAYER_HEIGHT;if(velocityY<0)velocityY=0;isOnGround=true;}else{isOnGround=false;}
    if(o.position.y<VOID_Y_LEVEL&&s.health>0){socket.emit('fellIntoVoid');s.health=0;updateHealthBar(0);showKillMessage("You fell into the void.");}

    // Update Gun View Model Position / Recoil (Keep call, even if no gun yet)
    if (typeof updateViewModel === 'function') updateViewModel(deltaTime); else console.error("updateViewModel is missing!");

    // Send Updates To Server
    const lPos=o.position.clone(); lPos.y-=PLAYER_HEIGHT; const lS=players[localPlayerId]; const pc=lPos.distanceToSquared(new THREE.Vector3(lS?.x??0,lS?.y??0,lS?.z??0))>0.001; const cR=new THREE.Euler().setFromQuaternion(camera.quaternion,'YXZ'); const cRY=cR.y; const rc=Math.abs(cRY-(lS?.rotationY??0))>0.01;
    if(pc||rc){ if(lS){lS.x=lPos.x;lS.y=lPos.y;lS.z=lPos.z;lS.rotationY=cRY;} socket.emit('playerUpdate',{x:lPos.x,y:lPos.y,z:lPos.z,rotationY:cRY});}
}

// --- View Model Update (Recoil & CORRECTED Rotation) ---
function updateViewModel(deltaTime) {
    // This function needs gunViewModel, camera, currentRecoilOffset, RECOIL_RECOVER_SPEED, GUN_POS_OFFSET
    if(!gunViewModel || !camera) return;
    currentRecoilOffset.lerp(new THREE.Vector3(0,0,0), deltaTime * RECOIL_RECOVER_SPEED);
    const finalGunPos = GUN_POS_OFFSET.clone().add(currentRecoilOffset);
    gunViewModel.position.copy(finalGunPos);
    // Corrected Rotation Logic
    const cameraWorldQuaternion = new THREE.Quaternion(); camera.getWorldQuaternion(cameraWorldQuaternion);
    const cameraEuler = new THREE.Euler().setFromQuaternion(cameraWorldQuaternion, 'YXZ');
    gunViewModel.rotation.x = 0; // Keep level X relative to camera
    gunViewModel.rotation.y = cameraEuler.y; // Match camera Y rotation
    gunViewModel.rotation.z = 0; // Keep level Z relative to camera
}

// --- Shoot Logic (Includes Recoil and Bullet Origin) ---
function shoot() {
    if(gameState!=='playing'||!socket||!localPlayerId||!controls?.isLocked||!players[localPlayerId]||players[localPlayerId].health<=0)return;
    currentRecoilOffset.copy(RECOIL_AMOUNT); // Apply recoil
    if(gunshotSound){try{gunshotSound.cloneNode().play().catch(function(e){/* ignore */});}catch(e){}} else {console.warn("No gunshot sound.");}
    const bulletPosition=new THREE.Vector3(); const bulletDirection=new THREE.Vector3();
    if(!camera) return;
    camera.getWorldDirection(bulletDirection); // Aim from camera center
    // Calculate visual origin near gun muzzle
    if(gunViewModel && gunViewModel.parent === camera){
        const muzzleOffset = MUZZLE_LOCAL_OFFSET.clone(); // Use constant from config.js
        // Transform the local muzzle offset into the gun's world space (relative to camera)
        const worldMuzzlePosition = gunViewModel.localToWorld(muzzleOffset);
        bulletPosition.copy(worldMuzzlePosition);
    } else {
        camera.getWorldPosition(bulletPosition); // Fallback
        bulletPosition.addScaledVector(bulletDirection, PLAYER_RADIUS * 2); // Offset if no gun
    }
    // console.log(`Shooting from: ${bulletPosition.x.toFixed(2)}, ${bulletPosition.y.toFixed(2)}, ${bulletPosition.z.toFixed(2)}`);
    socket.emit('shoot',{position:{x:bulletPosition.x,y:bulletPosition.y,z:bulletPosition.z},direction:{x:bulletDirection.x,y:bulletDirection.y,z:bulletDirection.z}});
}

function spawnBullet(d) {
    const geo=new THREE.SphereGeometry(0.05, 6, 6); // Smaller bullet, less detail
    const mat=new THREE.MeshBasicMaterial({color:0xffff00}); // Solid yellow
    const mesh=new THREE.Mesh(geo,mat);
    if (isNaN(d.position.x) || isNaN(d.position.y) || isNaN(d.position.z)) { console.error("!!! Invalid bullet pos:", d.position); mesh.position.set(0, 2, 0); }
    else { mesh.position.set(d.position.x, d.position.y, d.position.z); }
    const vel=new THREE.Vector3(d.direction.x,d.direction.y,d.direction.z).normalize().multiplyScalar(BULLET_SPEED);
    bullets.push({id:d.bulletId,mesh:mesh,velocity:vel,ownerId:d.shooterId,spawnTime:Date.now()});
    scene.add(mesh);
}

function updateBullets(dT) { // Includes Damage Emit Log
    const removeIdx=[];
    for(let i=bullets.length-1;i>=0;i--){
        const b=bullets[i]; if(!b?.mesh){ if(!removeIdx.includes(i))removeIdx.push(i); continue; }
        b.mesh.position.addScaledVector(b.velocity,dT); let hit=false;
        for(const pId in players){
            if(pId!==b.ownerId && players[pId].mesh && players[pId].mesh.visible){
                const pM=players[pId].mesh; const pP=new THREE.Vector3(); pM.getWorldPosition(pP);
                const dist=b.mesh.position.distanceTo(pP);
                const pScaleR=(pM.scale?.x || 1) * PLAYER_RADIUS;
                const thresh=pScaleR + 0.05; // Player radius + BULLET radius

                if(dist<thresh){
                    // console.log(`Client hit: Bul ${b.id} -> P ${pId}`); // Reduce noise
                    hit=true;
                    if(b.ownerId===localPlayerId){
                        console.log(`>>> Emitting 'hit' event: target=${pId}`); // Log Emit
                        socket.emit('hit',{targetId:pId,damage:10});
                    }
                    if(!removeIdx.includes(i))removeIdx.push(i);
                    scene.remove(b.mesh); break;
                }
            }
        }
        if(hit)continue;
        // Restore bullet lifetime check
        if(Date.now()-b.spawnTime>BULLET_LIFETIME){ if(!removeIdx.includes(i))removeIdx.push(i); scene.remove(b.mesh); }
    }
    if(removeIdx.length>0){ removeIdx.sort((a,b)=>b-a); for(const idx of removeIdx){ bullets.splice(idx,1); } }
}

console.log("gameLogic.js loaded");
