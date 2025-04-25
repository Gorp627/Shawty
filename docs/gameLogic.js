// docs/gameLogic.js

// ... (updatePlayer function remains the same) ...

// --- View Model Update (Recoil & CORRECTED Rotation) ---
function updateViewModel(deltaTime) {
    if(!gunViewModel || !camera) return;
    currentRecoilOffset.lerp(new THREE.Vector3(0,0,0), deltaTime * RECOIL_RECOVER_SPEED);
    const finalGunPos = GUN_POS_OFFSET.clone().add(currentRecoilOffset);
    gunViewModel.position.copy(finalGunPos);
    const cameraWorldQuaternion = new THREE.Quaternion();
    camera.getWorldQuaternion(cameraWorldQuaternion);
    const cameraEuler = new THREE.Euler().setFromQuaternion(cameraWorldQuaternion, 'YXZ');
    gunViewModel.rotation.x = 0; // Keep level X
    gunViewModel.rotation.y = cameraEuler.y; // Match camera Y
    gunViewModel.rotation.z = 0; // Keep level Z
}

// --- Shoot Logic (Includes Recoil and Bullet Origin) ---
function shoot() {
    if(gameState!=='playing'||!socket||!localPlayerId||!controls?.isLocked||!players[localPlayerId]||players[localPlayerId].health<=0)return;
    currentRecoilOffset.copy(RECOIL_AMOUNT); // Apply recoil
    if(gunshotSound){try{gunshotSound.cloneNode().play().catch(function(e){});}catch(e){}} else {console.warn("No gunshot sound.");}

    const bulletPosition=new THREE.Vector3(); // Renamed variable for clarity
    const bulletDirection=new THREE.Vector3();
    if(!camera) return;

    camera.getWorldDirection(bulletDirection); // Aim from camera center

    if(gunViewModel && gunViewModel.parent === camera){
        const muzzleOffset = new THREE.Vector3(0,-0.05,-0.5); // Local offset Z-forward
        muzzleOffset.applyQuaternion(gunViewModel.quaternion);
        bulletPosition.copy(gunViewModel.position).add(muzzleOffset);
        bulletPosition.applyQuaternion(camera.quaternion);
        bulletPosition.add(camera.position);
    } else {
        camera.getWorldPosition(bulletPosition); // Fallback
    }
    console.log(`Shooting from: ${bulletPosition.x.toFixed(2)}, ${bulletPosition.y.toFixed(2)}, ${bulletPosition.z.toFixed(2)}`);

    // <<< FIX: Use correct variable names here (bulletPosition, bulletDirection) >>>
    socket.emit('shoot',{
        position: { x: bulletPosition.x, y: bulletPosition.y, z: bulletPosition.z },
        direction: { x: bulletDirection.x, y: bulletDirection.y, z: bulletDirection.z }
    });
    // <<< -------------------------------------------------------------------- >>>

    console.log("Shoot emitted.");
}

function spawnBullet(d) { /* ... Same ... */ }
function updateBullets(dT) { /* ... Same ... */ }

console.log("gameLogic.js loaded");
