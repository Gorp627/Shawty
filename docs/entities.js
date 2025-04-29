// entities.js
// (Modified to sync with Rapier - Use Cylinder fallback, Explicit Global)
class ClientPlayer {
    constructor(playerData) {
        this.id = playerData.id;
        this.mesh = null;
        this.name = 'Player';
        this.phrase = '...';
        this.health = CONFIG?.PLAYER_DEFAULT_HEALTH || 100;
        // Store initial server data, might be useful
        this.initialData = { ...playerData };
        // Store last known server state (FEET position) for interpolation/threshold checks etc.
        this.x = playerData.x ?? 0;
        this.y = playerData.y ?? 0;
        this.z = playerData.z ?? 0;
        this.rotationY = playerData.rotationY ?? 0;
        // Store last data actually sent *to* the server (for local player thresholding in gameLogic)
        this.lastSentX = null;
        this.lastSentY = null;
        this.lastSentZ = null;
        this.lastSentRotationY = null;

        this.updateData(playerData); // Set initial name/phrase/health
        this.loadMesh();
    }

    // Update non-physics data from server (e.g., health, name changes)
    // Also updates position cache based on received data (gameStateUpdate)
    updateData(serverData) {
        this.health = serverData.h ?? serverData.health ?? this.health;
        this.name = serverData.n ?? serverData.name ?? this.name;
        this.phrase = serverData.phrase ?? serverData.phrase ?? this.phrase;
        // Update position cache if included (used for remote interpolation later maybe)
        if (serverData.x !== undefined) this.x = serverData.x;
        if (serverData.y !== undefined) this.y = serverData.y;
        if (serverData.z !== undefined) this.z = serverData.z;
        if (serverData.r !== undefined) this.rotationY = serverData.r; // Server uses 'r'
        if (serverData.rotationY !== undefined) this.rotationY = serverData.rotationY; // Also check full name
    }

    loadMesh() {
        // Attempt to load the actual player model (optional)
        const playerModelData = loadManager?.getAssetData('playerModel');
        if (playerModelData && playerModelData instanceof THREE.Object3D) { // Check if data is valid
            try {
                this.mesh = playerModelData.clone(); // Clone the loaded model scene
                // Adjust scale, orientation if necessary based on your model
                // this.mesh.scale.set(0.5, 0.5, 0.5);
                // this.mesh.rotation.y = Math.PI; // Example: Rotate if model faces wrong way

                // Apply shadows etc.
                this.mesh.traverse(child => {
                    if (child.isMesh) {
                        child.castShadow = true;
                        child.receiveShadow = true;
                    }
                });
                 // Add mesh to scene if not already added by cloning
                 if (scene && !this.mesh.parent) {
                    scene.add(this.mesh);
                 }
                 console.log(`[Entities] Cloned actual player model for ${this.id}`);
            } catch (e) {
                console.error(`[Entities] Error cloning player model for ${this.id}:`, e);
                this.mesh = null; // Ensure mesh is null if cloning fails
            }
        }

        // Fallback to simple CYLINDER if model fails, isn't ready, or mesh is still null
        if (!this.mesh) {
            console.warn(`[Entities] Player model not loaded or failed for ${this.id}. Using fallback CYLINDER.`);
            try {
                const h = CONFIG.PLAYER_HEIGHT || 1.8;
                const r = CONFIG.PLAYER_RADIUS || 0.4;

                // *********************************************************
                // *** FIX: Use CylinderGeometry instead of CapsuleGeometry ***
                // *********************************************************
                const geo = new THREE.CylinderGeometry(r, r, h, 8); // radiusTop, radiusBottom, height, radialSegments

                const mat = new THREE.MeshStandardMaterial({
                     color: this.id === localPlayerId ? 0x00ff00 : 0xff00ff, // Green for local, magenta for remote
                     roughness: 0.7
                });
                this.mesh = new THREE.Mesh(geo, mat);
                this.mesh.castShadow = true;
                this.mesh.receiveShadow = true;

                // Cylinder origin is at its center, offset for positioning later
                // This offset is applied when the mesh is added/synced, not necessarily here
                // this.mesh.position.y = h / 2.0; // Setting here might be overwritten

                if (scene) {
                    scene.add(this.mesh);
                    console.log(`[Entities] Added fallback CYLINDER mesh for ${this.id}`);
                } else {
                    console.error("[Entities] Scene missing when trying to add fallback mesh!");
                }
            } catch (e) {
                // Catch potential error from CylinderGeometry itself
                console.error(`[Entities] Error creating fallback cylinder for ${this.id}:`, e);
            }
        }

        // Set initial position and rotation based on server data (feet position)
        // The game loop (sync mesh to physics body) will override this shortly after physics body creation.
        if (this.mesh) {
             // Position the mesh CENTER based on feet position + half height
             const initialYOffset = (CONFIG.PLAYER_HEIGHT || 1.8) / 2.0;
             this.mesh.position.set(this.x, this.y + initialYOffset, this.z);
             this.mesh.rotation.y = this.rotationY;
        }
    }

    setVisible(v) { if (this.mesh) this.mesh.visible = v; }

    remove() {
        if (this.mesh) {
            if (scene) { scene.remove(this.mesh); }
            else { console.warn("[Entities] Scene missing during mesh removal for", this.id); }
            try {
                this.mesh.traverse(c => {
                    if (c.geometry) c.geometry.dispose();
                    if (c.material) {
                         if (Array.isArray(c.material)) { c.material.forEach(m => m.dispose()); }
                         else { c.material.dispose(); }
                    }
                });
                 console.log(`[Entities] Disposed mesh resources for ${this.id}`);
            } catch (e) { console.error(`[Entities] Mesh dispose error for ${this.id}:`, e); }
            this.mesh = null;
        }
    }
}

// Ensure ClientPlayer is globally accessible
window.ClientPlayer = ClientPlayer;

console.log("entities.js loaded and ClientPlayer assigned to window.");
