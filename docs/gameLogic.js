// docs/gameLogic.js

// ... updatePlayer ... (No changes needed here)
function updatePlayer(deltaTime) { /* ... Same ... */ }

// ... updateViewModel ... (No changes needed here)
function updateViewModel(deltaTime) { /* ... Same ... */ }

// --- Shoot Logic ---
function shoot() {
    if(gameState!=='playing'||!socket||!localPlayerId||!controls?.isLocked||!players[localPlayerId]||players[localPlayerId].health<=0)return;
    currentRecoilOffset.copy(RECOIL_AMOUNT);
    if(gunshotSound){try{gunshotSound.cloneNode().play().catch(function(e){});}catch(e){}}

    const bulletPosition=new THREE.Vector3();
    const bulletDirection=new THREE.Vector3();
    if(!camera) return;
    camera.getWorldDirection(bulletDirection); // Aim from camera

    if(gunViewModel && gunViewModel.parent === camera){
        // Use the MUZZLE_LOCAL_OFFSET defined in config.js
        const worldMuzzlePosition = gunViewModel.localToWorld(MUZZLE_LOCAL_OFFSET.clone());
        bulletPosition.copy(worldMuzzlePosition);
    } else {
        camera.getWorldPosition(bulletPosition); // Fallback
        bulletPosition.addScaledVector(bulletDirection, PLAYER_RADIUS * 2);
    }
    console.log(`Shooting from: ${bulletPosition.x.toFixed(2)}, ${bulletPosition.y.toFixed(2)}, ${bulletPosition.z.toFixed(2)}`);

    // Ensure variables exist before emitting
    if (bulletPosition && bulletDirection) {
        socket.emit('shoot',{position:{x:bulletPosition.x,y:bulletPosition.y,z:bulletPosition.z},direction:{x:bulletDirection.x,y:bulletDirection.y,z:bulletDirection.z}});
    } else {
        console.error("!!! Failed to calculate bullet position/direction");
    }
}

function spawnBullet(d) {
    // *** Make bullet visible for debugging ***
    const geo=new THREE.SphereGeometry(0.15, 8, 8); // Slightly larger again
    const mat=new THREE.MeshBasicMaterial({color:0xffff00}); // Solid yellow
    const mesh=new THREE.Mesh(geo,mat);
    // *** -------------------------------- ***
    if (isNaN(d.position.x) || isNaN(d.position.y) || isNaN(d.position.z)) { mesh.position.set(0, 2, 0); }
    else { mesh.position.set(d.position.x, d.position.y, d.position.z); }
    const vel=new THREE.Vector3(d.direction.x,d.direction.y,d.direction.z).normalize().multiplyScalar(BULLET_SPEED);
    bullets.push({id:d.bulletId,mesh:mesh,velocity:vel,ownerId:d.shooterId,spawnTime:Date.now()});
    scene.add(mesh);
}

function updateBullets(dT) {
    const removeIdx=[];
    for(let i=bullets.length-1; i>=0; i--){
        const b = bullets[i]; if(!b?.mesh){ if(!removeIdx.includes(i))removeIdx.push(i); continue; }
        b.mesh.position.addScaledVector(b.velocity, dT);

        // --- TEMP: Disable Collision & Lifetime Checks ---
        let hit=false;
        // for(const pId in players){ /* ... collision check ... */ }
        if(hit) continue;
        // if(Date.now()-b.spawnTime > BULLET_LIFETIME){ /* ... lifetime check ... */ }
        // --- ------------------------------------------ ---

         // Basic bounds check
         if (b.mesh.position.y < -50 || b.mesh.position.y > 100 || Math.abs(b.mesh.position.x) > 200 || Math.abs(b.mesh.position.z) > 200) {
             if(!removeIdx.includes(i))removeIdx.push(i);
             scene.remove(b.mesh);
         }
    }
    if(removeIdx.length>0){ removeIdx.sort((a,b)=>b-a); for(const idx of removeIdx){ bullets.splice(idx,1); } }
}

console.log("gameLogic.js loaded");
