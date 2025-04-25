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
    for(const id in players){
        if(id!==localPlayerId&&players[id].mesh&&players[id].mesh.visible){
            const oM=players[id].mesh;
            const dXZ=new THREE.Vector2(cPos.x-oM.position.x,cPos.z-oM.position.z).length();
            if(dXZ<PLAYER_COLLISION_RADIUS*2){
                // Revert horizontal movement but keep vertical
                o.position.x=pPos.x; o.position.z=pPos.z; o.position.y=cPos.y;
                break; // Collision detected, stop checking
            }
        }
    }
    let gY=0; // TODO: Replace with map raycasting
    if(o.position.y<gY+PLAYER_HEIGHT){o.position.y=gY+PLAYER_HEIGHT;if(velocityY<0)velocityY=0;isOnGround=true;}else{isOnGround=false;}
    if(o.position.y<VOID_Y_LEVEL&&s.health>0){socket.emit('fellIntoVoid');s.health=0;updateHealthBar(0);showKillMessage("You fell into the void.");}

    // Update Gun View Model Position / Recoil
    if (typeof updateViewModel === 'function') updateViewModel(deltaTime); else console.error("updateViewModel is missing!");

    // Send Updates To Server
    const lPos=o.position.clone(); lPos.y-=PLAYER_HEIGHT; const lS=players[localPlayerId]; const pc=lPos.distanceToSquared(new THREE.Vector3(lS?.x??0,lS?.y??0,lS?.z??0))>0.001; const cR=new THREE.Euler().setFromQuaternion(camera.quaternion,'YXZ'); const cRY=cR.y; const rc=Math.abs(cRY-(lS?.rotationY??0))>0.01;
    if(pc||rc){ if(lS){lS.x=lPos.x;lS.y=lPos.y;lS.z=lPos.z;lS.rotationY=cRY;} socket.emit('playerUpdate',{x:lPos.x,y:lPos.y,z:lPos.z,rotationY:cRY});}
}

// --- View Model Update (Recoil & CORRECTED Rotation) ---
function updateViewModel(deltaTime) {
    if(!gunViewModel || !camera) return;
    currentRecoilOffset.lerp(new THREE.Vector3(0,0,0), deltaTime * RECOIL_RECOVER_SPEED);
    const finalGunPos = GUN_POS_OFFSET.clone().add(currentRecoilOffset);
    gunViewModel.position.copy(finalGunPos);
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
    if(gunViewModel && gunViewModel.parent === camera){ const muzzleOffset = new THREE.Vector3(0,-0.05,-0.5); muzzleOffset.applyQuaternion(gunViewModel.quaternion); bulletPosition.copy(gunViewModel.position).add(muzzleOffset); bulletPosition.applyQuaternion(camera.quaternion); bulletPosition.add(camera.position); }
    else { camera.getWorldPosition(bulletPosition); } // Fallback
    console.log(`Shooting from: ${bulletPosition.x.toFixed(2)}, ${bulletPosition.y.toFixed(2)}, ${bulletPosition.z.toFixed(2)}`);
    socket.emit('shoot',{position:{x:bulletPosition.x,y:bulletPosition.y,z:bulletPosition.z},direction:{x:bulletDirection.x,y:bulletDirection.y,z:bulletDirection.z}});
    // console.log("Shoot emitted."); // Reduce noise
}

function spawnBullet(d) {
    // console.log(`Spawning bullet ${d.id}`); // Reduce noise
    const geo=new THREE.SphereGeometry(0.5, 8, 8); // TEMP Larger radius
    const mat=new THREE.MeshBasicMaterial({color: 0xff00ff, wireframe: true }); // TEMP Magenta Wireframe
    const mesh=new THREE.Mesh(geo,mat);
    if (isNaN(d.position.x) || isNaN(d.position.y) || isNaN(d.position.z)) { console.error("!!! Invalid bullet pos:", d.position); mesh.position.set(0, 2, 0); }
    else { mesh.position.set(d.position.x, d.position.y, d.position.z); }
    // console.log(` Spawn pos: ${mesh.position.x.toFixed(2)}, ${mesh.position.y.toFixed(2)}, ${mesh.position.z.toFixed(2)}`); // Reduce noise
    const vel=new THREE.Vector3(d.direction.x,d.direction.y,d.direction.z).normalize().multiplyScalar(BULLET_SPEED);
    bullets.push({id:d.bulletId,mesh:mesh,velocity:vel,ownerId:d.shooterId,spawnTime:Date.now()});
    scene.add(mesh); // Add to scene
    // console.log(` Bullet ${d.id} added to scene.`); // Reduce noise
}

function updateBullets(dT) { // TEMP: Simplified for debugging visibility
    const removeIdx=[];
    for(let i=bullets.length-1; i>=0; i--){
        const b = bullets[i];
        if(!b?.mesh){ if(!removeIdx.includes(i))removeIdx.push(i); continue; }

        // Just move it
        b.mesh.position.addScaledVector(b.velocity, dT);

        // Extremely basic bounds check to prevent infinite bullets
        if (b.mesh.position.y < -50 || b.mesh.position.y > 100 || Math.abs(b.mesh.position.x) > 200 || Math.abs(b.mesh.position.z) > 200) {
            // console.log(`Bullet ${b.id} out of bounds, removing.`); // Reduce noise
             if(!removeIdx.includes(i))removeIdx.push(i);
             scene.remove(b.mesh); // REMOVE when out of bounds
        }

        // --- COLLISION & LIFETIME COMMENTED OUT FOR TEST ---
        // let hit=false; for(const pId in players){ ... if(dist<thresh){ hit=true; ... } } if(hit)continue;
        // if(Date.now()-b.spawnTime>BULLET_LIFETIME){ if(!removeIdx.includes(i))removeIdx.push(i); scene.remove(b.mesh); }
        // --- ----------------------------------------- ---
    }
    // Remove bullets marked for deletion (only out of bounds ones for now)
    if(removeIdx.length>0){ removeIdx.sort((a,b)=>b-a); for(const idx of removeIdx){ bullets.splice(idx,1); } }
}


console.log("gameLogic.js loaded");
