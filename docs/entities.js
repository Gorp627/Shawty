// docs/entities.js

// Needs access to globals: scene, THREE, CONFIG, playerModel, loadManager
// Accesses other classes: Bullet (defined below)

// --- Player Class (Client-side representation) ---
class ClientPlayer {
    constructor(playerData) {
        this.id = playerData.id;
        this.mesh = null;
        this.targetPosition = new THREE.Vector3();
        this.targetRotationY = 0;
        this.name = 'Player';
        this.phrase = '...';
        this.health = CONFIG?.PLAYER_DEFAULT_HEALTH || 100;

        this.updateData(playerData);
        this.loadMesh(); // Attempt to load mesh after data init
    }

    updateData(serverData) {
        this.x = serverData.x ?? this.x ?? 0;
        this.y = serverData.y ?? this.y ?? 0;
        this.z = serverData.z ?? this.z ?? 0;
        this.rotationY = serverData.r ?? serverData.rotationY ?? this.rotationY ?? 0;
        this.health = serverData.h ?? serverData.health ?? this.health;
        this.name = serverData.n ?? serverData.name ?? this.name;
        this.phrase = serverData.phrase ?? this.phrase;
        this.setInterpolationTargets();
    }

    setInterpolationTargets() {
        const playerHeight = CONFIG?.PLAYER_HEIGHT || 1.8;
        let visualY = this.y; // Assume model origin at feet by default
        if (this.mesh && this.mesh.geometry instanceof THREE.CylinderGeometry) {
             visualY = this.y + playerHeight / 2; // Adjust for cylinder center origin
        }
        this.targetPosition.set(this.x, visualY, this.z);
        this.targetRotationY = this.rotationY;
    }

    loadMesh() {
        // *** ADDED CHECK: Use loadManager.isAssetReady for robustness ***
        console.log(`[Entities] Checking playerModel readiness for ${this.id}. State: ${loadManager?.assets?.playerModel?.state}, Global OK: ${!!(window.playerModel && window.playerModel !== 'error')}`);
        if (loadManager && loadManager.isAssetReady('playerModel') && window.playerModel instanceof THREE.Object3D) {
            console.log(`[Entities] playerModel IS ready for ${this.id}. Attempting clone...`);
            try {
                this.mesh = window.playerModel.clone(); // Use the global model directly
                const defaultScale = 0.3;
                this.mesh.scale.set(defaultScale, defaultScale, defaultScale);
                this.mesh.traverse(child => { if (child.isMesh) { child.castShadow = true; child.receiveShadow = true; } });

                const initialVisualY = this.y; // Model origin assumed at feet
                this.mesh.position.set(this.x, initialVisualY, this.z);
                this.mesh.rotation.y = this.rotationY;
                this.targetPosition.copy(this.mesh.position); // Sync interpolation target
                this.targetRotationY = this.rotationY;

                if (scene) { scene.add(this.mesh); console.log(`[Entities] Added player model mesh for ${this.id}`); }
                else { console.error("[Entities] Scene global missing!"); }

            } catch (e) {
                console.error(`[Entities] Error cloning player model for ${this.id}:`, e);
                this.loadFallbackMesh();
            }
        } else {
            // If asset not ready or invalid, use fallback
            console.warn(`[Entities] playerModel NOT ready or invalid for ${this.id}. Using fallback.`);
            this.loadFallbackMesh();
        }
    }

    loadFallbackMesh() {
        if (this.mesh) return; // Don't overwrite existing mesh
        console.warn(`[Entities] Creating fallback mesh for ${this.id}`);
        try {
            const radius = CONFIG?.PLAYER_RADIUS || 0.4;
            const height = CONFIG?.PLAYER_HEIGHT || 1.8;
            const geometry = new THREE.CylinderGeometry(radius, radius, height, 8);
            const material = new THREE.MeshStandardMaterial({ color: 0xff00ff, roughness: 0.7 });
            this.mesh = new THREE.Mesh(geometry, material);
            this.mesh.castShadow = true; this.mesh.receiveShadow = true;

            const initialVisualY = this.y + height / 2; // Cylinder center origin
            this.mesh.position.set(this.x, initialVisualY, this.z);
            this.mesh.rotation.y = this.rotationY;
            this.targetPosition.copy(this.mesh.position); // Sync interpolation target
            this.targetRotationY = this.rotationY;

            if (scene) { scene.add(this.mesh); console.log(`[Entities] Added fallback mesh for ${this.id}`); }
            else { console.error("[Entities] Scene global missing!"); }
        } catch (e) { console.error(`[Entities] Fallback mesh creation error for ${this.id}:`, e); }
    }

    interpolate(deltaTime) { /* ... (No changes needed) ... */ if(!this.mesh||!this.targetPosition)return;const factor=deltaTime*15;this.mesh.position.lerp(this.targetPosition,factor);if(this.targetRotationY!==undefined){const tQ=new THREE.Quaternion().setFromEuler(new THREE.Euler(0,this.targetRotationY,0,'YXZ'));this.mesh.quaternion.slerp(tQ,factor);} }
    setVisible(isVisible) { /* ... (No changes needed) ... */ if(this.mesh)this.mesh.visible=isVisible; }
    remove() { /* ... (No changes needed) ... */ if(this.mesh){if(scene)scene.remove(this.mesh);try{this.mesh.traverse(c=>{if(c.isMesh){c.geometry?.dispose();if(c.material){if(Array.isArray(c.material))c.material.forEach(m=>m.dispose());else c.material.dispose();}}});}catch(e){console.error(`Err dispose ${this.id}:`,e);}this.mesh=null;} }

} // End ClientPlayer Class

// --- Bullet Class ---
class Bullet { /* ... (No changes needed) ... */ constructor(d){this.id=d.bulletId;this.ownerId=d.shooterId;this.spawnTime=Date.now();const g=new THREE.SphereGeometry(0.08,6,6);const m=new THREE.MeshBasicMaterial({color:0xffff00});this.mesh=new THREE.Mesh(g,m);if(d.position&&!isNaN(d.position.x))this.mesh.position.set(d.position.x,d.position.y,d.position.z);else this.mesh.position.set(0,1,0);this.velocity=new THREE.Vector3(0,0,-1);if(d.direction&&!isNaN(d.direction.x))this.velocity.set(d.direction.x,d.direction.y,d.direction.z).normalize().multiplyScalar(CONFIG?.BULLET_SPEED||75);else this.velocity.multiplyScalar(CONFIG?.BULLET_SPEED||75);if(scene)scene.add(this.mesh);}update(dT){if(!this.mesh)return false;this.mesh.position.addScaledVector(this.velocity,dT);if(Date.now()-this.spawnTime>(CONFIG?.BULLET_LIFETIME||2500))return false;const pos=this.mesh.position;const limit=200;if(pos.y<-50||pos.y>100||Math.abs(pos.x)>limit||Math.abs(pos.z)>limit)return false;return true;}checkCollision(){if(!this.mesh||!players)return null;const bulletRadius=this.mesh.geometry?.parameters?.radius||0.08;const playerHitRadius=CONFIG?.PLAYER_RADIUS||0.4;for(const pId in players){if(pId===this.ownerId||!(players[pId]instanceof ClientPlayer))continue;const p=players[pId];if(p.mesh?.visible&&p.mesh.position){const pPos=p.mesh.position;const dSq=this.mesh.position.distanceToSquared(pPos);const combinedRadius=bulletRadius+playerHitRadius;const combinedRadiusSq=combinedRadius*combinedRadius;if(dSq<combinedRadiusSq)return pId;}}return null;}remove(){if(this.mesh){if(scene)scene.remove(this.mesh);this.mesh.geometry?.dispose();this.mesh.material?.dispose();this.mesh=null;}} }

console.log("entities.js loaded");
