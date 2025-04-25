// docs/gameLogic.js

// Needs access to globals: gameState, controls, localPlayerId, players, keys, velocityY, isOnGround, camera, scene, bullets, socket etc.
// Needs access to constants: PLAYER_HEIGHT, GRAVITY, JUMP_FORCE, MOVEMENT_SPEED*, PLAYER_COLLISION_RADIUS, VOID_Y_LEVEL etc.
// Needs access to functions: updateHealthBar, showKillMessage, shoot, spawnBullet, updateViewModel (if added back)

function updatePlayer(deltaTime) {
    if(gameState!=='playing'||!controls?.isLocked||!localPlayerId||!players[localPlayerId])return;
    const o=controls.getObject(); const s=players[localPlayerId]; if(!s||s.health<=0)return;
    const sp=keys['ShiftLeft']?MOVEMENT_SPEED_SPRINTING:MOVEMENT_SPEED; const dS=sp*deltaTime; const pPos=o.position.clone();
    velocityY-=GRAVITY*deltaTime; o.position.y+=velocityY*deltaTime;
    if(keys['KeyW']){controls.moveForward(dS);} if(keys['KeyS']){controls.moveForward(-dS);} if(keys['KeyA']){controls.moveRight(-dS);} if(keys['KeyD']){controls.moveRight(dS);}
    const cP=o.position; for(const id in players){if(id!==localPlayerId&&players[id].mesh&&players[id].mesh.visible){const oM=players[id].mesh; const dXZ=new THREE.Vector2(cP.x-oM.position.x,cP.z-oM.position.z).length(); if(dXZ<PLAYER_COLLISION_RADIUS*2){o.position.x=pPos.x; o.position.z=pPos.z; o.position.y=cP.y; break;}}}
    let gY=0; if(o.position.y<gY+PLAYER_HEIGHT){o.position.y=gY+PLAYER_HEIGHT;if(velocityY<0)velocityY=0;isOnGround=true;}else{isOnGround=false;}
    if(o.position.y<VOID_Y_LEVEL&&s.health>0){socket.emit('fellIntoVoid');s.health=0;updateHealthBar(0);showKillMessage("You fell into the void.");}
    // updateViewModel(deltaTime); // NO GUN
    const lP=o.position.clone(); lP.y-=PLAYER_HEIGHT; const lS=players[localPlayerId]; const pc=lP.distanceToSquared(new THREE.Vector3(lS?.x??0,lS?.y??0,lS?.z??0))>0.001; const cR=new THREE.Euler().setFromQuaternion(camera.quaternion,'YXZ'); const cRY=cR.y; const rc=Math.abs(cRY-(lS?.rotationY??0))>0.01;
    if(pc||rc){ if(lS){lS.x=lP.x;lS.y=lP.y;lS.z=lP.z;lS.rotationY=cRY;} socket.emit('playerUpdate',{x:lP.x,y:lP.y,z:lP.z,rotationY:cRY});}
}

function shoot() {
    if(gameState!=='playing'||!socket||!localPlayerId||!controls?.isLocked||!players[localPlayerId]||players[localPlayerId].health<=0)return;
    if(gunshotSound){try{gunshotSound.cloneNode().play().catch(function(e){});}catch(e){}}
    const bP=new THREE.Vector3(),bD=new THREE.Vector3(); if(!camera)return;
    camera.getWorldPosition(bP); camera.getWorldDirection(bD);
    socket.emit('shoot',{position:{x:bP.x,y:bP.y,z:bP.z},direction:{x:bD.x,y:bD.y,z:bD.z}});
}
function spawnBullet(d) {
     const g=new THREE.SphereGeometry(0.1,6,6);const m=new THREE.MeshBasicMaterial({color:0xffff00});const h=new THREE.Mesh(g,m); h.position.set(d.position.x,d.position.y,d.position.z); const v=new THREE.Vector3(d.direction.x,d.direction.y,d.direction.z).normalize().multiplyScalar(BULLET_SPEED); bullets.push({id:d.bulletId,mesh:h,velocity:v,ownerId:d.shooterId,spawnTime:Date.now()}); scene.add(h);
 }
function updateBullets(dT) {
     const rI=[]; for(let i=bullets.length-1;i>=0;i--){const b=bullets[i];if(!b?.mesh){if(!rI.includes(i))rI.push(i);continue;}b.mesh.position.addScaledVector(b.velocity,dT);let hit=false;for(const pId in players){if(pId!==b.ownerId&&players[pId].mesh&&players[pId].mesh.visible){const pM=players[pId].mesh; const pP=new THREE.Vector3();pM.getWorldPosition(pP);const dist=b.mesh.position.distanceTo(pP);const pSR=(pM.scale?.x||1)*PLAYER_RADIUS; const t=pSR+0.1; if(dist<t){hit=true;if(b.ownerId===localPlayerId){socket.emit('hit',{targetId:pId,damage:10});}if(!rI.includes(i))rI.push(i);scene.remove(b.mesh);break;}}}if(hit)continue; if(Date.now()-b.spawnTime>BULLET_LIFETIME){if(!rI.includes(i))rI.push(i);scene.remove(b.mesh);}} if(rI.length>0){ rI.sort((a,b)=>b-a); for(const idx of rI){ bullets.splice(idx,1); } }
 }

console.log("gameLogic.js loaded");
