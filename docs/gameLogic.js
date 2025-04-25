// docs/gameLogic.js

// Needs access to globals/constants from config.js
// Needs access to functions from ui.js, player.js, core.js

function updatePlayer(deltaTime) {
    if(gameState!=='playing'||!controls?.isLocked||!localPlayerId||!players[localPlayerId])return;
    const o=controls.getObject(); const s=players[localPlayerId]; if(!s||s.health<=0)return;
    const sp=keys['ShiftLeft']?MOVEMENT_SPEED_SPRINTING:MOVEMENT_SPEED; const dS=sp*deltaTime; const pPos=o.position.clone();
    velocityY-=GRAVITY*deltaTime; o.position.y+=velocityY*deltaTime;
    if(keys['KeyW']){controls.moveForward(dS);} if(keys['KeyS']){controls.moveForward(-dS);} if(keys['KeyA']){controls.moveRight(-dS);} if(keys['KeyD']){controls.moveRight(dS);}
    const cPos=o.position; for(const id in players){if(id!==localPlayerId&&players[id].mesh&&players[id].mesh.visible){const oM=players[id].mesh; const dXZ=new THREE.Vector2(cPos.x-oM.position.x,cPos.z-oM.position.z).length(); if(dXZ<PLAYER_COLLISION_RADIUS*2){o.position.x=pPos.x; o.position.z=pPos.z; o.position.y=cPos.y; break;}}}
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

    currentRecoilOffset.lerp(new THREE.Vector3(0,0,0), deltaTime * RECOIL_RECOVER_SPEED); // Recover recoil
    const finalGunPos = GUN_POS_OFFSET.clone().add(currentRecoilOffset); // Add recoil to base offset
    gunViewModel.position.copy(finalGunPos); // Apply position relative to camera

    // --- CORRECTED ROTATION ---
    // We need the gun's rotation in the *camera's* space, not world space.
    // We can achieve this by calculating the world quaternion of the camera,
    // extracting the Y rotation, and applying ONLY that Y rotation to the gun model.
    // Setting X and Z to 0 relative to the camera keeps it from tilting up/down with view.

    const cameraWorldQuaternion = new THREE.Quaternion();
    camera.getWorldQuaternion(cameraWorldQuaternion); // Get camera's world rotation

    // Use Euler angles to easily isolate Y rotation
    const cameraEuler = new THREE.Euler().setFromQuaternion(cameraWorldQuaternion, 'YXZ'); // Order is important!

    gunViewModel.rotation.x = 0; // Keep gun level horizontally (relative to camera)
    gunViewModel.rotation.y = cameraEuler.y; // Match camera's horizontal look direction
    gunViewModel.rotation.z = 0; // Keep gun level side-to-side (relative to camera)

    // Add any initial rotation offset needed if the gun wasn't exported facing forward
    // Example: gunViewModel.rotation.y += Math.PI; // If gun points backwards
    // --- END CORRECTED ROTATION ---

}

// --- Shoot Logic ---
function shoot() {
    if(gameState!=='playing'||!socket||!localPlayerId||!controls?.isLocked||!players[localPlayerId]||players[localPlayerId].health<=0)return;
    currentRecoilOffset.copy(RECOIL_AMOUNT); // Apply recoil
    if(gunshotSound){try{gunshotSound.cloneNode().play().catch(function(e){/* ignore */});}catch(e){}} else {console.warn("No gunshot sound.");}
    const bulletPosition=new THREE.Vector3(),bulletDirection=new THREE.Vector3(); if(!camera)return;
    camera.getWorldDirection(bulletDirection); // Aim from camera center
    if(gunViewModel && gunViewModel.parent === camera){ // Calc origin near muzzle
        const muzzleOffset = new THREE.Vector3(0,-0.05,-0.5); // Fine-tune local offset (relative TO GUN) Z-forward
        // Transform the local muzzle offset into the gun's world space
        const worldMuzzlePosition = gunViewModel.localToWorld(muzzleOffset.clone()); // Convert local gun offset to world
        bulletPosition.copy(worldMuzzlePosition);
    } else { camera.getWorldPosition(bulletPosition); } // Fallback
    console.log(`Shooting from: ${bulletPosition.x.toFixed(2)}, ${bulletPosition.y.toFixed(2)}, ${bulletPosition.z.toFixed(2)}`); // Log bullet spawn pos
    socket.emit('shoot',{position:{x:bulletPosition.x,y:bP.y,z:bP.z},direction:{x:bD.x,y:bD.y,z:bD.z}});
}

function spawnBullet(d) {
    console.log(`Spawning bullet ${d.id} requested by ${d.shooterId}`);
    // --- Larger Bullet & Obvious Material for Debugging ---
    const geo=new THREE.SphereGeometry(0.5, 8, 8); // TEMP Larger radius
    const mat=new THREE.MeshBasicMaterial({color: 0xff00ff, wireframe: true }); // TEMP Magenta Wireframe
    // --- -------------------------------------------- ---
    const mesh=new THREE.Mesh(geo,mat);
    // Validate position data
    if (isNaN(d.position.x) || isNaN(d.position.y) || isNaN(d.position.z)) {
         console.error("!!! Invalid bullet position received:", d.position);
         // Fallback position or don't spawn
         mesh.position.set(0, 2, 0); // Example fallback
    } else {
        mesh.position.set(d.position.x, d.position.y, d.position.z);
    }
    console.log(`  Actual spawn pos: ${mesh.position.x.toFixed(2)}, ${mesh.position.y.toFixed(2)}, ${mesh.position.z.toFixed(2)}`);
    const vel=new THREE.Vector3(d.direction.x,d.direction.y,d.direction.z).normalize().multiplyScalar(BULLET_SPEED);
    bullets.push({id:d.bulletId,mesh:mesh,velocity:vel,ownerId:d.shooterId,spawnTime:Date.now()});
    scene.add(mesh); // ADD TO SCENE!
    console.log(`  Bullet ${d.id} mesh added to scene.`);
}

function updateBullets(dT) { // Added Damage Logs
    const removeIdx=[];
    for(let i=bullets.length-1;i>=0;i--){
        const b=bullets[i]; if(!b?.mesh){ if(!removeIdx.includes(i))removeIdx.push(i); continue; }
        b.mesh.position.addScaledVector(b.velocity,dT); let hit=false;
        for(const pId in players){
            if(pId!==b.ownerId && players[pId].mesh && players[pId].mesh.visible){
                const pM=players[pId].mesh; const pP=new THREE.Vector3(); pM.getWorldPosition(pP);
                const dist=b.mesh.position.distanceTo(pP);
                const pScaleR=(pM.scale?.x || 1) * PLAYER_RADIUS;
                const thresh=pScaleR + (b.mesh.geometry?.parameters?.radius || 0.1); // Use actual bullet radius

                if(dist<thresh){
                    console.log(`Client hit: Bul ${b.id} -> P ${pId}`);
                    hit=true;
                    if(b.ownerId===localPlayerId){
                        console.log(`>>> Emitting 'hit' event: target=${pId}`);
                        socket.emit('hit',{targetId:pId,damage:10});
                    }
                    if(!removeIdx.includes(i))removeIdx.push(i);
                    scene.remove(b.mesh); break;
                }
            }
        }
        if(hit)continue;
        // Increased lifetime for testing
        if(Date.now()-b.spawnTime>10000){ if(!removeIdx.includes(i))removeIdx.push(i); scene.remove(b.mesh); }
    }
    if(removeIdx.length>0){ removeIdx.sort((a,b)=>b-a); for(const idx of removeIdx){ bullets.splice(idx,1); } }
}

console.log("gameLogic.js loaded");
