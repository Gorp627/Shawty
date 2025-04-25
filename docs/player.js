// docs/player.js

// Needs access to globals: players, playerModel, PLAYER_RADIUS, PLAYER_HEIGHT, scene, localPlayerId

function addPlayer(playerData) {
    console.log(`Add player ${playerData.id}`); if(players[playerData.id]||playerData.id===localPlayerId)return;
    players[playerData.id]={...playerData,mesh:null,targetPosition:null,targetRotationY:null};
    if(playerModel&&playerModel!=='error'){ try{const dS=0.8;//<<< ADJUST SCALE const mI=playerModel.clone();mI.scale.set(dS,dS,dS);mI.traverse(function(c){if(c.isMesh)c.castShadow=true;}); const vY=playerData.y;mI.position.set(playerData.x,vY,playerData.z);mI.rotation.y=playerData.rotationY;scene.add(mI);players[playerData.id].mesh=mI;players[playerData.id].targetPosition=mI.position.clone();players[playerData.id].targetRotationY=mI.rotation.y;}catch(e){console.error(`Model error ${playerData.id}:`,e);addPlayerFallbackMesh(playerData);}}else{addPlayerFallbackMesh(playerData);}
}
function addPlayerFallbackMesh(playerData) {
    if(!players[playerData.id]||players[playerData.id].mesh)return; console.warn(`Fallback for ${playerData.id}`); try{ const geo=new THREE.CylinderGeometry(PLAYER_RADIUS,PLAYER_RADIUS,PLAYER_HEIGHT,8); const mat=new THREE.MeshStandardMaterial({color:0xff00ff}); const mesh=new THREE.Mesh(geo,mat); mesh.castShadow=true;const visY=playerData.y+(PLAYER_HEIGHT/2); mesh.position.set(playerData.x,visY,playerData.z); mesh.rotation.y=playerData.rotationY; scene.add(mesh); players[playerData.id].mesh=mesh; players[playerData.id].targetPosition=mesh.position.clone(); players[playerData.id].targetRotationY=mesh.rotation.y;}catch(e){console.error(`Fallback error ${playerData.id}:`,e);}
}
function removePlayerMesh(playerId) {
     if(players[playerId]?.mesh){ try{ scene.remove(players[playerId].mesh); if(players[playerId].mesh.geometry)players[playerId].mesh.geometry.dispose(); if(players[playerId].mesh.material){if(Array.isArray(players[playerId].mesh.material)){players[playerId].mesh.material.forEach(function(m){m.dispose();});}else{players[playerId].mesh.material.dispose();}} }catch(e){} players[playerId].mesh=null; }
}
function updateRemotePlayerPosition(playerData) {
     if(playerData.id!==localPlayerId&&players[playerData.id]){ const p=players[playerData.id];let vY;if(p.mesh&&p.mesh.geometry instanceof THREE.CylinderGeometry){vY=playerData.y+(PLAYER_HEIGHT/2);}else{vY=playerData.y;}p.targetPosition=new THREE.Vector3(playerData.x,vY,playerData.z);p.targetRotationY=playerData.rotationY;p.x=playerData.x;p.y=playerData.y;p.z=playerData.z;p.rotationY=playerData.rotationY;p.name=playerData.name;p.phrase=playerData.phrase;}
}
 function updateOtherPlayers(dT) { // Interpolation loop
     for(const id in players){if(id!==localPlayerId&&players[id].mesh){const p=players[id],m=p.mesh;if(p.targetPosition&&p.targetRotationY!==undefined){m.position.lerp(p.targetPosition,dT*12);let aD=p.targetRotationY-m.rotation.y;while(aD<-Math.PI)aD+=Math.PI*2;while(aD>Math.PI)aD-=Math.PI*2;m.rotation.y+=aD*dT*12;}}}
 }

console.log("player.js loaded");
