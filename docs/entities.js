// docs/entities.js

// Needs access to globals: scene, THREE, PLAYER_RADIUS, PLAYER_HEIGHT, CONFIG, playerModel
// Accesses other classes: Bullet (defined below)

// --- Player Class (Client-side representation) ---
class ClientPlayer {
    constructor(playerData) {
        this.id = playerData.id;
        this.mesh = null; // Holds the THREE.Group/Object3D
        this.targetPosition = new THREE.Vector3(); // Interpolation target
        this.targetRotationY = playerData.rotationY || 0;
        this.updateData(playerData); // Set initial state
        this.loadMesh(); // Start loading/creating mesh
    }

    updateData(serverData) { // Called by network handler for updates
        this.x = serverData.x; this.y = serverData.y; this.z = serverData.z;
        this.rotationY = serverData.r ?? serverData.rotationY;
        this.health = serverData.h ?? serverData.health;
        this.name = serverData.n || serverData.name || 'Player';
        this.phrase = serverData.phrase || '...';
        this.setInterpolationTargets(); // Update targets based on new data
    }

    setInterpolationTargets() {
        let visualY; // Calculate display Y pos
        if (this.mesh?.children[0]?.geometry instanceof THREE.CylinderGeometry || this.mesh?.geometry instanceof THREE.CylinderGeometry) { visualY = this.y + (PLAYER_HEIGHT / 2); }
        else { visualY = this.y; } // Assume model origin is feet
        this.targetPosition.set(this.x, visualY, this.z);
        this.targetRotationY = this.rotationY;
    }

    loadMesh() { // Creates mesh from template or fallback
        if (typeof playerModel !== 'undefined' && playerModel && playerModel !== 'error') {
            try {
                 this.mesh = playerModel.clone();
                 const desiredScale = 0.3; // Requested scale
                 this.mesh.scale.set(desiredScale,desiredScale,desiredScale);
                 this.mesh.traverse(c => {if(c.isMesh) c.castShadow = true;});
                 const visualY = this.y;
                 this.mesh.position.set(this.x, visualY, this.z);
                 this.mesh.rotation.y = this.rotationY;
                 this.targetPosition.copy(this.mesh.position);
                 this.targetRotationY = this.rotationY;
                 if (scene) scene.add(this.mesh); else console.error("Scene not ready in loadMesh");
            } catch(e) { console.error(`Player model clone error for ${this.id}:`, e); this.loadFallbackMesh(); }
        } else { console.warn(`Player template missing/failed for ${this.id}, using fallback.`); this.loadFallbackMesh(); }
    }

    loadFallbackMesh() {
        if(this.mesh) return;
        // console.warn(`Using fallback CYLINDER mesh for player ${this.id}`); // Reduce noise
        try {
            const geometry = new THREE.CylinderGeometry(PLAYER_RADIUS, PLAYER_RADIUS, PLAYER_HEIGHT, 8);
            const material = new THREE.MeshStandardMaterial({ color: 0xff00ff }); // Magenta
            this.mesh = new THREE.Mesh(geometry, material);
            this.mesh.castShadow = true;
            const visualY = this.y + (PLAYER_HEIGHT / 2);
            this.mesh.position.set(this.x, visualY, this.z);
            this.mesh.rotation.y = this.rotationY;
            this.targetPosition.copy(this.mesh.position);
            this.targetRotationY = this.rotationY;
            if (scene) scene.add(this.mesh); else console.error("Scene not ready for fallback mesh");
        } catch(e) { console.error("Error creating fallback mesh:", e); }
    }

    interpolate(deltaTime) { // Update position/rotation smoothly towards target
        if (!this.mesh || !this.targetPosition) return;
        this.mesh.position.lerp(this.targetPosition, deltaTime * 12); // Adjust speed if needed
        if (this.targetRotationY !== undefined) {
             const targetQuaternion = new THREE.Quaternion();
             targetQuaternion.setFromEuler(new THREE.Euler(0, this.targetRotationY, 0));
             this.mesh.quaternion.slerp(targetQuaternion, deltaTime * 12); // Adjust speed if needed
        }
    }

    setVisible(visible) { if (this.mesh) this.mesh.visible = visible; } // Set visibility

    remove() { // Cleanup when player leaves
        if (this.mesh) {
             if (scene) scene.remove(this.mesh);
             this.mesh.traverse(child => { if (child.isMesh) { child.geometry?.dispose(); if(child.material){ if(Array.isArray(child.material)) child.material.forEach(m => m.dispose()); else child.material.dispose();}}});
             this.mesh = null;
        }
    }
} // End ClientPlayer Class

// --- Bullet Class ---
class Bullet {
     constructor(data) {
         this.id = data.bulletId; this.ownerId = data.shooterId; this.spawnTime = Date.now();
         const geometry = new THREE.SphereGeometry(0.08, 6, 6); // Make bullets slightly larger
         const material = new THREE.MeshBasicMaterial({ color: 0xffff00 }); // Yellow
         this.mesh = new THREE.Mesh(geometry, material);
         if (!isNaN(data.position.x)) { this.mesh.position.set(data.position.x, data.position.y, data.position.z); } else { this.mesh.position.set(0,1,0); }
         this.velocity = new THREE.Vector3(data.direction.x, data.direction.y, data.direction.z).normalize().multiplyScalar(CONFIG.BULLET_SPEED);
         if(scene) scene.add(this.mesh); else console.error("Scene missing for bullet spawn");
     }
     update(deltaTime) { if (!this.mesh) return false; this.mesh.position.addScaledVector(this.velocity, deltaTime); if (Date.now() - this.spawnTime > CONFIG.BULLET_LIFETIME) return false; if (this.mesh.position.y < -50 || this.mesh.position.y > 100 || Math.abs(this.mesh.position.x) > 200 || Math.abs(this.mesh.position.z) > 200) return false; return true; }
     checkCollision() { if (!this.mesh) return null; for(const pId in players){ if(pId!==this.ownerId && players[pId].mesh && players[pId].mesh.visible){ const pM=players[pId].mesh; const pP=new THREE.Vector3(); pM.getWorldPosition(pP); const dist=this.mesh.position.distanceTo(pP); const pScaleR=(pM.scale?.x || 1) * PLAYER_RADIUS; const t=pScaleR + (this.mesh.geometry?.parameters?.radius || 0.1); if(dist<t){ return pId; }}} return null; }
     remove() { if(this.mesh) { if(scene) scene.remove(this.mesh); this.mesh.geometry?.dispose(); this.mesh.material?.dispose(); this.mesh = null; }}
} // End Bullet Class

console.log("entities.js loaded");
