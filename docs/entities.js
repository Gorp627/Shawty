// docs/entities.js

// Needs access to globals: scene, THREE, PLAYER_RADIUS, PLAYER_HEIGHT, CONFIG
// Needs access to assets: playerModel (template)

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
        this.rotationY = serverData.r ?? serverData.rotationY; // Use shorthand 'r' from server loop or full name
        this.health = serverData.h ?? serverData.health; // Use shorthand 'h' or full name
        this.name = serverData.n || serverData.name || 'Player'; // Use 'n' or full name
        this.phrase = serverData.phrase || '...'; // Only sent on init/respawn usually
        // Update interpolation targets based on new data
        this.setInterpolationTargets();
    }

    setInterpolationTargets() {
        let visualY; // Calculate display Y pos
        // Check the type of geometry to determine offset
        if (this.mesh?.children[0]?.geometry instanceof THREE.CylinderGeometry || this.mesh?.geometry instanceof THREE.CylinderGeometry) { // Check if mesh OR its first child is fallback
            visualY = this.y + (PLAYER_HEIGHT / 2); // Center of cylinder
        } else {
            visualY = this.y; // Assume loaded model origin is at feet
        }
        this.targetPosition.set(this.x, visualY, this.z);
        this.targetRotationY = this.rotationY;
    }


    loadMesh() { // Creates mesh from template or fallback
        if (typeof playerModel !== 'undefined' && playerModel && playerModel !== 'error') { // Use global playerModel template
            try {
                 this.mesh = playerModel.clone();
                 const desiredScale = 0.3; // Requested scale
                 this.mesh.scale.set(desiredScale,desiredScale,desiredScale);
                 this.mesh.traverse(c => {if(c.isMesh) c.castShadow = true;});
                 const visualY = this.y; // Assume model origin at feet
                 this.mesh.position.set(this.x, visualY, this.z); // Set initial position
                 this.mesh.rotation.y = this.rotationY; // Set initial rotation
                 this.targetPosition.copy(this.mesh.position); // Init target
                 this.targetRotationY = this.rotationY;
                 if (scene) scene.add(this.mesh); else console.error("Scene not ready in loadMesh");
            } catch(e) {
                 console.error(`Player model clone error for ${this.id}:`, e);
                 this.loadFallbackMesh();
            }
        } else {
             console.warn(`Player template missing/failed for ${this.id}, using fallback.`);
             this.loadFallbackMesh();
        }
    }

    loadFallbackMesh() {
        if(this.mesh) return; // Don't add fallback if mesh already exists
        console.warn(`Using fallback CYLINDER mesh for player ${this.id}`);
        try {
            const geometry = new THREE.CylinderGeometry(PLAYER_RADIUS, PLAYER_RADIUS, PLAYER_HEIGHT, 8);
            const material = new THREE.MeshStandardMaterial({ color: 0xff00ff }); // Magenta
            this.mesh = new THREE.Mesh(geometry, material);
            this.mesh.castShadow = true;
            const visualY = this.y + (PLAYER_HEIGHT / 2); // Cylinder origin is center
            this.mesh.position.set(this.x, visualY, this.z);
            this.mesh.rotation.y = this.rotationY;
            this.targetPosition.copy(this.mesh.position);
            this.targetRotationY = this.rotationY;
            if (scene) scene.add(this.mesh); else console.error("Scene not ready for fallback mesh");
        } catch(e) { console.error("Error creating fallback mesh:", e); }
    }


    // Update position/rotation smoothly towards target
    interpolate(deltaTime) {
        if (!this.mesh || !this.targetPosition) return;
        this.mesh.position.lerp(this.targetPosition, deltaTime * 12); // Adjust speed as needed
        if (this.targetRotationY !== undefined) {
             const targetQuaternion = new THREE.Quaternion();
             targetQuaternion.setFromEuler(new THREE.Euler(0, this.targetRotationY, 0));
             this.mesh.quaternion.slerp(targetQuaternion, deltaTime * 12);
        }
    }

    // Set visibility
    setVisible(visible) { if (this.mesh) this.mesh.visible = visible; }

    // Cleanup when player leaves
    remove() {
        if (this.mesh) {
             if (scene) scene.remove(this.mesh);
             // Dispose geometry/materials
             this.mesh.traverse(child => {
                 if (child.isMesh) {
                     child.geometry?.dispose();
                     if(child.material) {
                         if(Array.isArray(child.material)) child.material.forEach(m=>m.dispose());
                         else child.material.dispose();
                     }
                 }
             });
             this.mesh = null;
        }
    }
}

// --- Bullet Class ---
class Bullet {
     constructor(data) {
         this.id = data.bulletId; this.ownerId = data.shooterId; this.spawnTime = Date.now();
         const geometry = new THREE.SphereGeometry(0.06, 6, 6);
         const material = new THREE.MeshBasicMaterial({ color: 0xfff550 });
         this.mesh = new THREE.Mesh(geometry, material);
         if (!isNaN(data.position.x)) { this.mesh.position.set(data.position.x, data.position.y, data.position.z); }
         else { this.mesh.position.set(0,1,0); } // Fallback
         this.velocity = new THREE.Vector3(data.direction.x, data.direction.y, data.direction.z).normalize().multiplyScalar(CONFIG.BULLET_SPEED);
         if(scene) scene.add(this.mesh); else console.error("Scene missing for bullet spawn");
     }

     update(deltaTime) { // Returns false if needs removal
         if (!this.mesh) return false;
         this.mesh.position.addScaledVector(this.velocity, deltaTime);
         if (Date.now() - this.spawnTime > CONFIG.BULLET_LIFETIME) return false;
         if (this.mesh.position.y < -50 || this.mesh.position.y > 100 || Math.abs(this.mesh.position.x) > 200 || Math.abs(this.mesh.position.z) > 200) return false; // Bounds check
         return true; // Still active
     }

     checkCollision() { // Simple collision check separate from update
         if (!this.mesh) return null; // No mesh = no collision
          for(const pId in players){
               if(pId!==this.ownerId && players[pId].mesh && players[pId].mesh.visible){
                   const pM=players[pId].mesh; const pP=new THREE.Vector3(); pM.getWorldPosition(pP);
                   const dist=this.mesh.position.distanceTo(pP);
                   const pScaleR=(pM.scale?.x || 1) * PLAYER_RADIUS; const t=pScaleR + (this.mesh.geometry?.parameters?.radius || 0.1);
                   if(dist<t){
                       console.log(`Client hit: Bul ${this.id} -> P ${pId}`);
                       return pId; // Return ID of player hit
                   }
               }
           }
         return null; // No hit
     }

     remove() { if(this.mesh) { if(scene) scene.remove(this.mesh); this.mesh.geometry?.dispose(); this.mesh.material?.dispose(); this.mesh = null; }}
}

// --- Health Pack Class (Still basic, assumes model load later) ---
// class HealthPack { ... } // We removed health packs for now

let activeHealthPacks = {}; // Store packs by ID

console.log("entities.js loaded");
