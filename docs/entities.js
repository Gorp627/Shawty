// docs/entities.js

// Needs access to globals: scene, THREE, CONFIG, playerModel
// Accesses other classes: Bullet (defined below)

// --- Player Class (Client-side representation) ---
class ClientPlayer {
    constructor(playerData) {
        this.id = playerData.id;
        this.mesh = null; // Initialize mesh as null
        this.targetPosition = new THREE.Vector3();
        this.targetRotationY = 0; // Initialize rotation
        this.name = 'Player'; // Default name
        this.phrase = '...'; // Default phrase
        this.health = CONFIG.PLAYER_DEFAULT_HEALTH || 100; // Default health from config or fallback

        // Update with incoming data, then load mesh
        this.updateData(playerData); // Update position, rotation, name, health etc.
        this.loadMesh(); // Attempt to load the primary mesh
    }

    updateData(serverData) {
        // Update properties from server data, using nullish coalescing for safety
        this.x = serverData.x ?? this.x ?? 0;
        this.y = serverData.y ?? this.y ?? 0;
        this.z = serverData.z ?? this.z ?? 0;
        // Use 'r' from lean data or 'rotationY' from full data
        this.rotationY = serverData.r ?? serverData.rotationY ?? this.rotationY ?? 0;
        // Use 'h' from lean data or 'health' from full data
        this.health = serverData.h ?? serverData.health ?? this.health;
        this.name = serverData.n ?? serverData.name ?? this.name;
        this.phrase = serverData.phrase ?? this.phrase; // Phrase might not be in lean data

        // Set interpolation targets AFTER updating data
        this.setInterpolationTargets();
    }

    setInterpolationTargets() {
        // Calculate target visual Y position based on player's logical Y and height
        // Use CONFIG values, provide defaults if CONFIG is missing
        const playerHeight = CONFIG?.PLAYER_HEIGHT || 1.8;
        // Target Y depends on the mesh type (origin at feet vs center) - assuming model origin is at feet for now.
        // If using cylinder fallback, its origin is the center, so add half height.
        let visualY = this.y;
        if (this.mesh && this.mesh.geometry instanceof THREE.CylinderGeometry) {
             visualY = this.y + playerHeight / 2;
        }
        // For the actual player model, assume origin is at feet unless model is different
        // visualY = this.y; // If model origin is at feet

        this.targetPosition.set(this.x, visualY, this.z);
        this.targetRotationY = this.rotationY;
    }

    loadMesh() {
        // Check if the global playerModel is loaded and valid
        if (typeof playerModel !== 'undefined' && playerModel && playerModel !== 'error' && playerModel instanceof THREE.Object3D) {
            try {
                this.mesh = playerModel.clone(); // Clone the loaded model
                const defaultScale = 0.3; // Example scale, adjust as needed
                this.mesh.scale.set(defaultScale, defaultScale, defaultScale);

                // Enable shadows for the cloned mesh
                this.mesh.traverse(child => {
                    if (child.isMesh) {
                        child.castShadow = true;
                        child.receiveShadow = true;
                    }
                });

                // Set initial position and rotation based on current data
                const initialVisualY = this.y; // Assuming model origin is at feet
                this.mesh.position.set(this.x, initialVisualY, this.z);
                this.mesh.rotation.y = this.rotationY;

                // Update interpolation targets to match initial state
                this.targetPosition.copy(this.mesh.position);
                this.targetRotationY = this.rotationY;

                // Add to scene if scene exists
                if (scene) {
                    scene.add(this.mesh);
                    console.log(`[Entities] Added player model mesh for ${this.id}`);
                } else {
                    console.error("[Entities] Scene global is missing, cannot add player mesh!");
                }
            } catch (e) {
                console.error(`[Entities] Error cloning/setting up player model for ${this.id}:`, e);
                this.loadFallbackMesh(); // Attempt fallback if cloning fails
            }
        } else {
            // If playerModel isn't ready or is invalid, use fallback
            console.warn(`[Entities] Player model not ready or invalid for ${this.id}. Using fallback mesh.`);
            this.loadFallbackMesh();
        }
    }

    loadFallbackMesh() {
        // Prevent creating multiple fallback meshes
        if (this.mesh) return;

        console.warn(`[Entities] Creating fallback mesh for ${this.id}`);
        try {
            // ** FIX: Use CONFIG for dimensions **
            const radius = CONFIG?.PLAYER_RADIUS || 0.4;
            const height = CONFIG?.PLAYER_HEIGHT || 1.8;

            const geometry = new THREE.CylinderGeometry(radius, radius, height, 8); // TopRadius, BottomRadius, Height, RadialSegments
            const material = new THREE.MeshStandardMaterial({ color: 0xff00ff, roughness: 0.7 }); // Pink fallback
            this.mesh = new THREE.Mesh(geometry, material);
            this.mesh.castShadow = true;
            this.mesh.receiveShadow = true;

            // Cylinder origin is center, so position Y needs offset
            const initialVisualY = this.y + height / 2;
            this.mesh.position.set(this.x, initialVisualY, this.z);
            this.mesh.rotation.y = this.rotationY;

            // Update interpolation targets
            this.targetPosition.copy(this.mesh.position);
            this.targetRotationY = this.rotationY;

            // Add to scene
            if (scene) {
                scene.add(this.mesh);
                 console.log(`[Entities] Added fallback mesh for ${this.id}`);
            } else {
                console.error("[Entities] Scene global is missing, cannot add fallback mesh!");
            }
        } catch (e) {
             // Log the error that occurs HERE
             console.error(`[Entities] Fallback mesh creation error for ${this.id}:`, e);
        }
    }

    interpolate(deltaTime) {
        if (!this.mesh || !this.targetPosition) return; // Ensure mesh and target exist

        const interpolationFactor = deltaTime * 15; // Adjust speed as needed (15 is reasonably fast)

        // Interpolate position using LERP
        this.mesh.position.lerp(this.targetPosition, interpolationFactor);

        // Interpolate rotation using SLERP for smoother rotation
        if (this.targetRotationY !== undefined) {
            const targetQuaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, this.targetRotationY, 0, 'YXZ'));
            this.mesh.quaternion.slerp(targetQuaternion, interpolationFactor);
        }
    }

    setVisible(isVisible) {
        if (this.mesh) {
            this.mesh.visible = isVisible;
        }
    }

    remove() {
        if (this.mesh) {
            if (scene) {
                 scene.remove(this.mesh);
                 console.log(`[Entities] Removed mesh for ${this.id}`);
            }
            // Dispose geometry and material to free GPU memory
            try {
                 this.mesh.traverse(child => {
                     if (child.isMesh) {
                         child.geometry?.dispose();
                         if (child.material) {
                             if (Array.isArray(child.material)) {
                                 child.material.forEach(m => m.dispose());
                             } else {
                                 child.material.dispose();
                             }
                         }
                     }
                 });
            } catch (e) {
                 console.error(`[Entities] Error during disposal for ${this.id}:`, e);
            }
            this.mesh = null; // Clear reference
        }
    }
} // End ClientPlayer Class

// --- Bullet Class ---
class Bullet {
     constructor(bulletData){
         this.id = bulletData.bulletId; // Unique ID for the bullet
         this.ownerId = bulletData.shooterId; // ID of the player who shot it
         this.spawnTime = Date.now(); // Timestamp for lifetime calculation

         // Geometry and Material
         const geometry = new THREE.SphereGeometry(0.08, 6, 6); // Small sphere
         const material = new THREE.MeshBasicMaterial({ color: 0xffff00 }); // Bright yellow, no lighting needed
         this.mesh = new THREE.Mesh(geometry, material);

         // Initial Position - ensure data is valid
         if (bulletData.position && !isNaN(bulletData.position.x)) {
             this.mesh.position.set(bulletData.position.x, bulletData.position.y, bulletData.position.z);
         } else {
             console.warn(`[Bullet] Invalid spawn position for bullet ${this.id}, defaulting.`);
             this.mesh.position.set(0, 1, 0); // Default position if data is bad
         }

         // Velocity - ensure direction is valid and normalize
         this.velocity = new THREE.Vector3(0, 0, -1); // Default direction
         if (bulletData.direction && !isNaN(bulletData.direction.x)) {
              this.velocity.set(bulletData.direction.x, bulletData.direction.y, bulletData.direction.z)
                         .normalize() // Ensure unit vector
                         .multiplyScalar(CONFIG?.BULLET_SPEED || 75); // Apply speed from config or default
         } else {
              console.warn(`[Bullet] Invalid direction for bullet ${this.id}, using default.`);
              this.velocity.multiplyScalar(CONFIG?.BULLET_SPEED || 75); // Apply speed to default direction
         }


         // Add to scene
         if (scene) {
             scene.add(this.mesh);
         } else {
             console.error("[Bullet] Scene global missing, cannot add bullet mesh!");
         }
     }

     update(deltaTime){
         if (!this.mesh) return false; // Bullet already removed

         // Move bullet
         this.mesh.position.addScaledVector(this.velocity, deltaTime);

         // Check lifetime
         if (Date.now() - this.spawnTime > (CONFIG?.BULLET_LIFETIME || 2500)) {
             // console.log(`Bullet ${this.id} expired.`);
             return false; // Expired
         }

         // Check boundaries (simple box check)
         const pos = this.mesh.position;
         const limit = 200;
         if (pos.y < -50 || pos.y > 100 || Math.abs(pos.x) > limit || Math.abs(pos.z) > limit) {
             // console.log(`Bullet ${this.id} out of bounds.`);
             return false; // Out of bounds
         }

         return true; // Still active
     }

     checkCollision() {
         if (!this.mesh || !players) return null; // Cannot check collision without mesh or players

         // ** FIX: Use CONFIG.PLAYER_RADIUS **
         const bulletRadius = this.mesh.geometry?.parameters?.radius || 0.08;
         const playerHitRadius = CONFIG?.PLAYER_RADIUS || 0.4; // Use config or default

         for (const playerId in players) {
             // Don't collide with the owner or the local player representation (if it's not a ClientPlayer instance)
             if (playerId === this.ownerId || !(players[playerId] instanceof ClientPlayer)) {
                 continue;
             }

             const player = players[playerId];
             // Check if player mesh exists, is visible, and has position data
             if (player.mesh && player.mesh.visible && player.mesh.position) {
                 const playerPosition = player.mesh.position; // Use mesh position directly
                 const distanceSq = this.mesh.position.distanceToSquared(playerPosition);

                 // Calculate combined radius squared
                 // Note: This assumes player mesh origin is representative for collision.
                 // Adjust playerHitRadius based on player scale if necessary: const scaledPlayerRadius = playerHitRadius * (player.mesh.scale?.x || 1);
                 const combinedRadius = bulletRadius + playerHitRadius;
                 const combinedRadiusSq = combinedRadius * combinedRadius;

                 if (distanceSq < combinedRadiusSq) {
                     // console.log(`Collision detected: Bullet ${this.id} -> Player ${playerId}`);
                     return playerId; // Return ID of the hit player
                 }
             }
         }
         return null; // No collision detected
     }

     remove(){
         if (this.mesh) {
             if (scene) {
                 scene.remove(this.mesh);
             }
             // Dispose geometry and material
             this.mesh.geometry?.dispose();
             this.mesh.material?.dispose();
             this.mesh = null; // Clear reference
         }
     }
} // End Bullet Class

console.log("entities.js loaded");
