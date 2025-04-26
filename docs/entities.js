// docs/entities.js

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
        if (this.mesh?.geometry instanceof THREE.CylinderGeometry) { visualY = this.y + (PLAYER_HEIGHT / 2); }
        else { visualY = this.y; } // Assume model origin is feet
        this.targetPosition.set(this.x, visualY, this.z);
        this.targetRotationY = this.rotationY;
    }

    loadMesh() { // Creates mesh from template or fallback
        if (playerModel && playerModel !== 'error') { // Use global playerModel template
            try { this.mesh = playerModel.clone(); const dS = 0.3; this.mesh.scale.set(dS,dS,dS); this.mesh.traverse(c => {if(c.isMesh) c.castShadow = true;}); }
            catch (e) { console.error("Player model clone error:", e); this.loadFallbackMesh(); }
        } else { this.loadFallbackMesh(); }

        if (this.mesh) { // If mesh created successfully
             this.mesh.rotation.y = this.rotationY; // Set initial rotation
             this.setInterpolationTargets(); // Calculate initial target/visual pos
             this.mesh.position.copy(this.targetPosition); // Snap to initial target
             scene.add(this.mesh);
             this.setVisible(this.health > 0); // Hide if joined dead? (Unlikely)
        }
    }

    loadFallbackMesh() { /* ... Same Cylinder fallback as before ... */ }
    interpolate(deltaTime) { /* ... Same interpolation as before ... */ }
    setVisible(visible) { if (this.mesh) this.mesh.visible = visible; }
    remove() { if (this.mesh) { scene.remove(this.mesh); /* dispose geo/mat */ this.mesh = null; } }
}

// --- Bullet Class ---
class Bullet {
     constructor(data) {
         this.id = data.bulletId; this.ownerId = data.shooterId; this.spawnTime = Date.now();
         const geometry = new THREE.SphereGeometry(0.06, 6, 6); // Make slightly bigger, fewer polys
         const material = new THREE.MeshBasicMaterial({ color: 0xfff550 }); // Yellow/Orange
         this.mesh = new THREE.Mesh(geometry, material);
         if (!isNaN(data.position.x)) { this.mesh.position.set(data.position.x, data.position.y, data.position.z); }
         else { this.mesh.position.set(0,1,0); } // Fallback
         this.velocity = new THREE.Vector3(data.direction.x, data.direction.y, data.direction.z).normalize().multiplyScalar(CONFIG.BULLET_SPEED);
         if(scene) scene.add(this.mesh); else console.error("Scene missing for bullet spawn");
     }
     update(deltaTime) { /* ... Same update logic ... */ }
     remove() { /* ... Same remove logic ... */ }
}

// NO HealthPack class needed on client for now

console.log("entities.js loaded");
