// entities.js (Use loaded GLTF model)
// Represents REMOTE players

class ClientPlayer {
    constructor(playerData) {
        this.id = playerData.id;
        this.mesh = null; // This will hold the loaded GLTF scene
        this.name = 'Player';
        this.phrase = '...';
        this.health = playerData.health ?? CONFIG?.PLAYER_DEFAULT_HEALTH ?? 100;
        // Store initial server data, useful for reference
        this.initialData = { ...playerData };
        // Store current server-known position/rotation for reference/interpolation targets
        this.serverX = playerData.x;
        this.serverY = playerData.y;
        this.serverZ = playerData.z;
        this.serverRotY = playerData.rotationY || 0;

        this.updateData(playerData); // Process initial data
        this.loadMesh(); // Attempt to load the visual mesh
    }

    // Update non-physics data (name, phrase, health)
    updateData(serverData) {
        this.health = serverData.h ?? serverData.health ?? this.health;
        this.name = serverData.n ?? serverData.name ?? this.name;
        this.phrase = serverData.p ?? serverData.phrase ?? this.phrase;
        // Update server position cache if provided in update
        if (serverData.x !== undefined) this.serverX = serverData.x;
        if (serverData.y !== undefined) this.serverY = serverData.y;
        if (serverData.z !== undefined) this.serverZ = serverData.z;
        if (serverData.r !== undefined) this.serverRotY = serverData.r; // 'r' from gameStateUpdate
        else if (serverData.rotationY !== undefined) this.serverRotY = serverData.rotationY; // 'rotationY' from join/respawn
    }

    loadMesh() {
        const playerModelAsset = loadManager.getAssetData('playerModel'); // Get loaded asset

        if (playerModelAsset && playerModelAsset.scene) {
            try {
                // Clone the scene to create an independent instance for this player
                this.mesh = playerModelAsset.scene.clone();
                this.mesh.scale.set(0.5, 0.5, 0.5); // Example scale - ADJUST AS NEEDED
                this.mesh.castShadow = true;
                this.mesh.receiveShadow = true;
                // Assign player ID for potential raycasting identification later
                this.mesh.userData = { entityId: this.id, isPlayer: true };
                this.mesh.traverse(child => { // Ensure shadows are set on all sub-meshes
                     if (child.isMesh) {
                         child.castShadow = true;
                         child.receiveShadow = true;
                         child.userData = { entityId: this.id, isPlayer: true }; // Also tag submeshes
                     }
                });


                if (window.scene) { // Use global scene reference
                    window.scene.add(this.mesh);
                    // Set initial position/rotation based on server data
                    // Note: Rapier body handles the authoritative position, mesh will follow in game loop
                    const playerHeight = CONFIG.PLAYER_HEIGHT || 1.8;
                    this.mesh.position.set(this.serverX, this.serverY, this.serverZ); // Set initial mesh position at feet
                    this.mesh.rotation.set(0, this.serverRotY, 0); // Set initial Y rotation
                    console.log(`[Entities] Added GLTF mesh for remote player ${this.id}`);
                } else {
                    console.error("[Entities] Scene missing when adding GLTF mesh!");
                }
            } catch (e) {
                console.error(`[Entities] Error cloning/adding player GLTF ${this.id}:`, e);
                this.loadFallbackMesh(); // Attempt fallback on error
            }
        } else {
            console.warn(`[Entities] Player model asset not ready for ${this.id}, using fallback capsule.`);
            this.loadFallbackMesh(); // Use fallback if asset wasn't loaded
        }
    }

    // Fallback if GLTF loading fails or isn't ready
    loadFallbackMesh() {
        try {
            const h = CONFIG.PLAYER_HEIGHT || 1.8;
            const r = CONFIG.PLAYER_RADIUS || 0.4;
            const geo = new THREE.CapsuleGeometry(r, h - 2 * r, 4, 8);
            const mat = new THREE.MeshStandardMaterial({ color: 0xff00ff, roughness: 0.7 });
            this.mesh = new THREE.Mesh(geo, mat);
            this.mesh.castShadow = true;
            this.mesh.receiveShadow = true;
            this.mesh.userData = { entityId: this.id, isPlayer: true, isFallback: true }; // Mark as fallback

            if (window.scene) {
                window.scene.add(this.mesh);
                 // Set initial position/rotation based on server data
                const playerHeight = CONFIG.PLAYER_HEIGHT || 1.8;
                this.mesh.position.set(this.serverX, this.serverY, this.serverZ); // Position mesh at feet
                this.mesh.rotation.set(0, this.serverRotY, 0); // Set initial Y rotation
                console.log(`[Entities] Added remote FALLBACK mesh ${this.id}`);
            } else {
                console.error("[Entities] Scene missing when adding fallback mesh!");
            }
        } catch (e) {
            console.error(`[Entities] Fallback mesh creation error ${this.id}:`, e);
        }
    }


    setVisible(v) { if (this.mesh) this.mesh.visible = v; }

    remove() {
        if (this.mesh) {
            if (window.scene) window.scene.remove(this.mesh);
            // Dispose geometry and materials to free GPU memory
            try {
                this.mesh.traverse(c => {
                    if (c.isMesh) {
                        c.geometry?.dispose();
                        if (c.material) {
                            // Handle both single and multi-materials
                            if (Array.isArray(c.material)) {
                                c.material.forEach(m => m.dispose());
                            } else {
                                c.material.dispose();
                            }
                        }
                    }
                });
                // console.log(`[Entities] Disposed mesh resources for ${this.id}`);
            } catch (e) { console.error("Mesh resource disposal error:", e); }
            this.mesh = null;
        }
    }
}
// No window assignment needed if Network.js uses `new ClientPlayer()`
