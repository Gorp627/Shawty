// docs/gameLogic.js

// Needs access to globals/constants from config.js
// Needs access to functions from ui.js, player.js, core.js

function updatePlayer(deltaTime) {
    if(gameState!=='playing'||!controls?.isLocked||!localPlayerId||!players[localPlayerId])return;
    const o=controls.getObject(); const s=players[localPlayerId]; if(!s||s.health<=0)return;
    const sp=keys['ShiftLeft']?MOVEMENT_SPEED_SPRINTING:MOVEMENT_SPEED; const dS=sp*deltaTime; const pPos=o.position.clone();
    velocityY-=GRAVITY*deltaTime; o.position.y+=velocityY*deltaTime;
    // Corrected movement application
    if(keys['KeyW']){controls.moveForward(dS);} if(keys['KeyS']){controls.moveForward(-dS);}
    if(keys['KeyA']){controls.moveRight(-dS);} if(keys['KeyD']){controls.moveRight(dS);}
    const cPos=o.position; for(const id in players){if(id!==localPlayerId&&players[id].mesh&&players[id].mesh.visible){const oM=players[id].mesh; const dXZ=new THREE.Vector2(cPos.x-oM.position.x,cPos.z-oM.position.z).length(); if(dXZ<PLAYER_COLLISION_RADIUS*2){o.position.x=pPos.x; o.position.z=pPos.z; o.position.y=cPos.y; break;}}}
    let gY=0; if(o.position.y<gY+PLAYER_HEIGHT){o.position.y=gY+PLAYER_HEIGHT;if(velocityY<0)velocityY=0;isOnGround=true;}else{isOnGround=false;}
    if(o.position.y<VOID_Y_LEVEL&&s.health>0){socket.emit('fellIntoVoid');s.health=0;updateHealthBar(0);showKillMessage("You fell into the void.");}

    // Update Gun View Model Position / Recoil
    if (typeof updateViewModel === 'function') updateViewModel(deltaTime); else console.error("updateViewModel is missing!");

    const lPos=o.position.clone(); lPos.y-=PLAYER_HEIGHT; const lS=players[localPlayerId]; const pc=lPos.distanceToSquared(new THREE.Vector3(lS?.x??0,lS?.y??0,lS?.z??0))>0.001; const cR=new THREE.Euler().setFromQuaternion(camera.quaternion,'YXZ'); const cRY=cR.y; const rc=Math.abs(cRY-(lS?.rotationY??0))>0.01;
    if(pc||rc){ if(lS){lS.x=lPos.x;lS.y=lPos.y;lS.z=lPos.z;lS.rotationY=cRY;} socket.emit('playerUpdate',{x:lPos.x,y:lPos.y,z:lPos.z,rotationY:cRY});}
}

// --- View Model Update (Recoil) ---
function updateViewModel(deltaTime) {
    if(!gunViewModel||!camera)return;
    if (frameCount % 60 === 0) { /* console.log(`UpdateVM - Recoil: ${currentRecoilOffset.toArray().map(n=>n.toFixed(3)).join(',')}`); */ } // Reduce log noise
    currentRecoilOffset.lerp(new THREE.Vector3(0,0,0),deltaTime*RECOIL_RECOVER_SPEED);
    const fP=GUN_POS_OFFSET.clone().add(currentRecoilOffset);
    gunViewModel.position.copy(fP);
    gunViewModel.rotation.copy(camera.rotation);
}

// --- Shoot Logic ---
function shoot() {
    if(gameState!=='playing'||!socket||!localPlayerId||!controls?.isLocked||!players[localPlayerId]||players[localPlayerId].health<=0)return;
    currentRecoilOffset.copy(RECOIL_AMOUNT); // Apply recoil
    if(gunshotSound){try{gunshotSound.cloneNode().play().catch(function(e){});}catch(e){}}
    const bP=new THREE.Vector3(),bD=new THREE.Vector3(); if(!camera)return;
    camera.getWorldDirection(bD); // Aim from camera center
    // Spawn bullet visually near gun
    if(gunViewModel && gunViewModel.parent === camera){
        const muzzleOffset = new THREE.Vector3(0,-0.05,-0.5); // Adjust local offset if needed
        muzzleOffset.applyQuaternion(gunViewModel.quaternion); // Rotate offset relative to gun
        bP.copy(gunViewModel.position).add(muzzleOffset); // Add local offset to gun position
        bP.applyQuaternion(camera.quaternion); // Rotate combined offset by camera world rotation
        bP.add(camera.position); // Add camera world position
    } else { camera.getWorldPosition(bP); } // Fallback to camera center
    socket.emit('shoot',{position:{x:bP.x,y:bP.y,z:bP.z},direction:{x:bD.x,y:bD.y,z:bD.z}});
}

function spawnBullet(d) {
    const geo=new THREE.SphereGeometry(0.05, 4, 4); // Smaller bullet
    const mat=new THREE.MeshBasicMaterial({color:0xffff00}); const h=new THREE.Mesh(geo,mat);
    h.position.set(d.position.x,d.position.y,d.position.z);
    const v=new THREE.Vector3(d.direction.x,d.direction.y,d.direction.z).normalize().multiplyScalar(BULLET_SPEED);
    bullets.push({id:d.bulletId,mesh:h,velocity:v,ownerId:d.shooterId,spawnTime:Date.now()});
    scene.add(h);
}

function updateBullets(dT) { // Includes damage logs
    const removeIdx=[];
    for(let i=bullets.length-1;i>=0;i--){
        const b=bullets[i]; if(!b?.mesh){if(!removeIdx.includes(i))removeIdx.push(i); continue;}
        b.mesh.position.addScaledVector(b.velocity,dT); let hit=false;
        for(const pId in players){
            if(pId!==b.ownerId && players[pId].mesh && players[pId].mesh.visible){
                const pM=players[pId].mesh; const pP=new THREE.Vector3(); pM.getWorldPosition(pP);
                const dist=b.mesh.position.distanceTo(pP);
                const pScaleR=(pM.scale?.x || 1) * PLAYER_RADIUS; // Use PLAYER_RADIUS for player collision sphere approx
                const thresh=pScaleR + 0.05; // Player radius + BULLET radius
                if(dist<thresh){
                    console.log(`Client hit: Bul ${b.id} -> P ${pId}`);
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
        if(Date.now()-b.spawnTime>BULLET_LIFETIME){ if(!removeIdx.includes(i))removeIdx.push(i); scene.remove(b.mesh); }
    }
    if(removeIdx.length>0){ removeIdx.sort((a,b)=>b-a); for(const idx of removeIdx){ bullets.splice(idx,1); } }
}

console.log("gameLogic.js loaded");
