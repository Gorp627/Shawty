// docs/entities.js

// Needs access to globals: scene, THREE, CONFIG, loadManager
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
        this.health = CONFIG?.PLAYER_DEFAULT_HEALTH || 100; // Default health from config or fallback

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
        // Target Y depends on the mesh type (origin at feet vs center)
        let visualY = this.y; // Assume model origin at feet by default
        if (this.mesh && this.mesh.geometry instanceof THREE.CylinderGeometry) {
             visualY = this.y + playerHeight / 2; // Adjust for cylinder center origin
        }

        this.targetPosition.set(this.x, visualY, this.z);
        this.targetRotationY = this.rotationY;
    }

    loadMesh() {
        // *** MODIFIED: Get data directly from loadManager ***
        console.log(`[Entities] Attempting to load mesh for player ${this.id}`);
        // Use the getter which also checks readiness internally
        const playerModelData = loadManager?.getAssetData('playerModel');

        if (playerModelData && playerModelData instanceof THREE.Object3D) {
            console.log(`[Entities] playerModel data found for ${this.id}. Cloning...`);
            try {
                this.mesh = playerModelData.clone(); // Clone the model data retrieved from LM

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
                const initialVisualY = this.y; // Model origin assumed at feet
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
            // If asset not ready or invalid, use fallback
            console.warn(`[Entities] playerModel data not retrieved or invalid for ${this.id}. Using fallback.`);
            this.loadFallbackMesh();
        }
    }

    loadFallbackMesh() {
        // Prevent creating multiple fallback meshes
        if (this.mesh) return;

        console.warn(`[Entities] Creating fallback mesh for ${this.id}`);
        try {
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
                 // console.log(`[Entities] Removed mesh for ${this.id}`); // Less verbose
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

         const geometry = new THREE.SphereGeometry(0.08, 6, 6); // Small sphere
         const material = new THREE.MeshBasicMaterial({ color: 0xffff00 }); // Bright yellow
         this.mesh = new THREE.Mesh(geometry, material);

         if (bulletData.position && !isNaN(bulletData.position.x)) { this.mesh.position.set(bulletData.position.x, bulletData.position.y, bulletData.position.z); }
         else { console.warn(`[Bullet ${this.id}] Invalid spawn pos, defaulting.`); this.mesh.position.set(0, 1, 0); }

         this.velocity = new THREE.Vector3(0, 0, -1); // Default direction
         const speed = CONFIG?.BULLET_SPEED || 75;
         if (bulletData.direction && !isNaN(bulletData.direction.x)) { this.velocity.set(bulletData.direction.x, bulletData.direction.y, bulletData.direction.z).normalize().multiplyScalar(speed); }
         else { console.warn(`[Bullet ${this.id}] Invalid direction, using default.`); this.velocity.multiplyScalar(speed); }

         if (scene) { scene.add(this.mesh); }
         else { console.error("[Bullet] Scene missing!"); }
     }

     update(deltaTime){
         if (!this.mesh) return false;
         this.mesh.position.addScaledVector(this.velocity, deltaTime);
         if (Date.now() - this.spawnTime > (CONFIG?.BULLET_LIFETIME || 2500)) return false; // Expired
         const pos = this.mesh.position; const limit = 200;
         if (pos.y < -50 || pos.y > 100 || Math.abs(pos.x) > limit || Math.abs(pos.z) > limit) return false; // Out of bounds
         return true; // Still active
     }

     checkCollision(){
         if (!this.mesh || !players) return null;
         const bulletRadius = this.mesh.geometry?.parameters?.radius || 0.08;
         const playerHitRadius = CONFIG?.PLAYER_RADIUS || 0.4;

         for (const playerId in players) {
             if (playerId === this.ownerId || !(players[playerId] instanceof ClientPlayer)) continue; // Skip owner and non-ClientPlayers
             const player = players[playerId];
             if (player.mesh?.visible && player.mesh.position) { // Check mesh exists, visible, has position
                 const playerPosition = player.mesh.position;
                 const distanceSq = this.mesh.position.distanceToSquared(playerPosition);
                 const combinedRadius = bulletRadius + playerHitRadius;
                 const combinedRadiusSq = combinedRadius * combinedRadius;
                 if (distanceSq < combinedRadiusSq) return playerId; // Hit!
             }
         }
         return null; // No collision
     }

     remove(){
         if (this.mesh) {
             if (scene) { scene.remove(this.mesh); }
             this.mesh.geometry?.dispose();
             this.mesh.material?.dispose();
             this.mesh = null;
         }
     }
} // End Bullet Class

console.log("entities.js loaded");
