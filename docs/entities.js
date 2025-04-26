// docs/entities.js

// Needs access to globals: scene, THREE, CONFIG, loadManager
// NO LONGER defines Bullet class

// --- Player Class (Client-side representation) ---
class ClientPlayer {
    constructor(playerData) {
        this.id = playerData.id; this.mesh = null; this.targetPosition = new THREE.Vector3(); this.targetRotationY = 0; this.name = 'Player'; this.phrase = '...'; this.health = CONFIG?.PLAYER_DEFAULT_HEALTH || 100;
        this.updateData(playerData);
        this.loadMesh(); // Attempt to load mesh
    }

    updateData(serverData) { this.x = serverData.x??this.x??0; this.y=serverData.y??this.y??0; this.z=serverData.z??this.z??0; this.rotationY = serverData.r??serverData.rotationY??this.rotationY??0; this.health = serverData.h??serverData.health??this.health; this.name = serverData.n??serverData.name??this.name; this.phrase=serverData.phrase??this.phrase; this.setInterpolationTargets(); }
    setInterpolationTargets() { const pH=CONFIG?.PLAYER_HEIGHT||1.8; let vY=this.y; if(this.mesh&&this.mesh.geometry instanceof THREE.CylinderGeometry)vY=this.y+pH/2; else vY = this.y; /* Assume model origin at feet for GLB, center for cylinder */ this.targetPosition.set(this.x, vY, this.z); this.targetRotationY=this.rotationY; }

    loadMesh() {
        console.log(`[Entities] Loading mesh for player ${this.id}`);
        const playerModelData = loadManager?.getAssetData('playerModel'); // Use getter
        if (playerModelData && playerModelData instanceof THREE.Object3D) {
            console.log(`[Entities] playerModel data found for ${this.id}. Cloning...`);
            try {
                this.mesh = playerModelData.clone();
                const scale = 0.3; this.mesh.scale.set(scale, scale, scale);
                this.mesh.traverse(c=>{if(c.isMesh){c.castShadow=true;c.receiveShadow=true;}});
                const initialVY = this.y; // Assume model origin is at feet from server data (Y=0 is ground)
                this.mesh.position.set(this.x, initialVY, this.z); this.mesh.rotation.y = this.rotationY;
                this.targetPosition.copy(this.mesh.position); this.targetRotationY = this.rotationY;
                if (scene) { scene.add(this.mesh); console.log(`[Entities] Added player model mesh ${this.id}`); }
                else { console.error("[Entities] Scene missing!"); }
            } catch (e) { console.error(`[Entities] Error cloning player model ${this.id}:`, e); this.loadFallbackMesh(); }
        } else { console.warn(`[Entities] playerModel data NOT ready ${this.id}. Using fallback.`); this.loadFallbackMesh(); }
    }

    loadFallbackMesh() {
        if (this.mesh) return; console.warn(`[Entities] Creating fallback ${this.id}`);
        try {
            // Use consistent radius name from config
            const r = CONFIG.PLAYER_RADIUS || 0.4;
            const h = CONFIG.PLAYER_HEIGHT || 1.8;
            const geo=new THREE.CylinderGeometry(r,r,h,8); const mat=new THREE.MeshStandardMaterial({color:0xff00ff,roughness:0.7}); this.mesh=new THREE.Mesh(geo,mat); this.mesh.castShadow=true; this.mesh.receiveShadow=true;
            // Cylinder origin is center, server Y is feet, so adjust visual Y
            const initialVY=this.y+h/2;
            this.mesh.position.set(this.x,initialVY,this.z); this.mesh.rotation.y=this.rotationY;
            this.targetPosition.copy(this.mesh.position); this.targetRotationY=this.rotationY;
            if(scene) { scene.add(this.mesh); console.log(`[Entities] Added fallback mesh ${this.id}`); }
            else { console.error("[Entities] Scene missing!"); }
        } catch (e) { console.error(`[Entities] Fallback error ${this.id}:`, e); }
    }

    interpolate(dT) { if(!this.mesh||!this.targetPosition)return; const f=dT*15; this.mesh.position.lerp(this.targetPosition,f); if(this.targetRotationY!==undefined){const tQ=new THREE.Quaternion().setFromEuler(new THREE.Euler(0,this.targetRotationY,0,'YXZ'));this.mesh.quaternion.slerp(tQ,f);} }
    setVisible(v) { if(this.mesh)this.mesh.visible=v; }
    remove() { if(this.mesh){if(scene)scene.remove(this.mesh);try{this.mesh.traverse(c=>{if(c.isMesh){c.geometry?.dispose();if(c.material){if(Array.isArray(c.material))c.material.forEach(m=>m.dispose());else c.material.dispose();}}});}catch(e){} this.mesh=null;} }

} // End ClientPlayer Class

// --- REMOVED Bullet Class ---
// class Bullet { ... }

console.log("entities.js loaded (Simplified - No Bullets)");
