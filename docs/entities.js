// docs/entities.js

// Needs access to globals: scene, THREE, PLAYER_RADIUS, PLAYER_HEIGHT, CONFIG, playerModel
// Accesses other classes: Bullet (defined below)

// --- Player Class (Client-side representation) ---
class ClientPlayer {
    constructor(playerData) { this.id = playerData.id; this.mesh = null; this.targetPosition = new THREE.Vector3(); this.targetRotationY = playerData.rotationY || 0; this.updateData(playerData); this.loadMesh(); }
    updateData(serverData) { this.x=serverData.x; this.y=serverData.y; this.z=serverData.z; this.rotationY=serverData.r??serverData.rotationY; this.health=serverData.h??serverData.health; this.name=serverData.n||serverData.name||'Player'; this.phrase=serverData.phrase||'...'; this.setInterpolationTargets(); }
    setInterpolationTargets() { let vY; if(this.mesh?.geometry instanceof THREE.CylinderGeometry){vY=this.y+(PLAYER_HEIGHT/2);}else{vY=this.y;} this.targetPosition.set(this.x,vY,this.z); this.targetRotationY=this.rotationY; }
    loadMesh() { if(typeof playerModel !=='undefined' && playerModel && playerModel!=='error'){ try{ this.mesh=playerModel.clone(); const dS=0.3; this.mesh.scale.set(dS,dS,dS); this.mesh.traverse(c=>{if(c.isMesh)c.castShadow=true;}); const vY=this.y; this.mesh.position.set(this.x,vY,this.z); this.mesh.rotation.y=this.rotationY; this.targetPosition.copy(this.mesh.position); this.targetRotationY=this.rotationY; if(scene)scene.add(this.mesh);else console.error("Scene missing"); }catch(e){console.error(`Player clone err ${this.id}:`,e); this.loadFallbackMesh();}} else { this.loadFallbackMesh();}}
    loadFallbackMesh() { if(this.mesh) return; console.warn(`Fallback mesh for ${this.id}`); try{ const g=new THREE.CylinderGeometry(PLAYER_RADIUS,PLAYER_RADIUS,PLAYER_HEIGHT,8);const m=new THREE.MeshStandardMaterial({color:0xff00ff}); this.mesh=new THREE.Mesh(g,m); this.mesh.castShadow=true; const vY=this.y+(PLAYER_HEIGHT/2); this.mesh.position.set(this.x,vY,this.z); this.mesh.rotation.y=this.rotationY; this.targetPosition.copy(this.mesh.position); this.targetRotationY=this.rotationY; if(scene)scene.add(this.mesh);else console.error("Scene missing"); }catch(e){console.error("Fallback err:",e);}}
    interpolate(dT) { if(!this.mesh||!this.targetPosition)return; this.mesh.position.lerp(this.targetPosition,dT*12); if(this.targetRotationY!==undefined){const tQ=new THREE.Quaternion().setFromEuler(new THREE.Euler(0,this.targetRotationY,0)); this.mesh.quaternion.slerp(tQ,dT*12);}}
    setVisible(v) { if(this.mesh)this.mesh.visible=v; }
    remove() { if(this.mesh){if(scene)scene.remove(this.mesh); this.mesh.traverse(c=>{if(c.isMesh){c.geometry?.dispose();if(c.material){if(Array.isArray(c.material)) c.material.forEach(m=>m.dispose()); else c.material.dispose();}}}); this.mesh=null;}}
} // End ClientPlayer Class

// --- Bullet Class ---
class Bullet {
     constructor(d){ this.id=d.bulletId;this.ownerId=d.shooterId;this.spawnTime=Date.now(); const g=new THREE.SphereGeometry(0.08,6,6);const m=new THREE.MeshBasicMaterial({color:0xffff00}); this.mesh=new THREE.Mesh(g,m); if(!isNaN(d.position.x))this.mesh.position.set(d.position.x,d.position.y,d.position.z);else this.mesh.position.set(0,1,0); this.velocity=new THREE.Vector3(d.direction.x,d.direction.y,d.direction.z).normalize().multiplyScalar(CONFIG.BULLET_SPEED); if(scene)scene.add(this.mesh); }
     update(dT){ if(!this.mesh)return false; this.mesh.position.addScaledVector(this.velocity,dT); if(Date.now()-this.spawnTime>CONFIG.BULLET_LIFETIME)return false; if(this.mesh.position.y<-50||this.mesh.position.y>100||Math.abs(this.mesh.position.x)>200||Math.abs(this.mesh.position.z)>200)return false; return true;}
     checkCollision(){ if(!this.mesh)return null; for(const pId in players){if(pId!==this.ownerId&&players[pId].mesh&&players[pId].mesh.visible){const pM=players[pId].mesh; const pP=new THREE.Vector3();pM.getWorldPosition(pP);const dist=this.mesh.position.distanceTo(pP);const pSR=(pM.scale?.x||1)*PLAYER_RADIUS;const t=pSR+(this.mesh.geometry?.parameters?.radius||0.1);if(dist<t){return pId;}}} return null;}
     remove(){if(this.mesh){if(scene)scene.remove(this.mesh);this.mesh.geometry?.dispose();this.mesh.material?.dispose();this.mesh=null;}}
} // End Bullet Class

console.log("entities.js loaded");
