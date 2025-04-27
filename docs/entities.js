// docs/entities.js (Adapted for Cannon-es)

// Needs access to globals: scene, THREE, CONFIG, loadManager
// Visual representation linked to a Cannon.js body

// --- Player Class (Client-side representation for REMOTE players) ---
class ClientPlayer {
    constructor(playerData) {
        this.id = playerData.id;
        this.mesh = null;           // Three.js visual mesh
        this.body = null;           // Reference to Cannon.js physics body (set externally)
        this.name = 'Player';
        this.phrase = '...';
        this.health = CONFIG?.PLAYER_DEFAULT_HEALTH || 100;

        // Store initial data needed for mesh loading/setup
        this.initialData = { ...playerData }; // Copy initial state

        this.updateData(playerData); // Set initial name, phrase, health
        this.loadMesh(); // Load visual mesh
    }

    // Updates NON-physics properties from server data
    updateData(serverData) {
        // NOTE: x, y, z, rotationY (r) are primarily handled by updating the physics body directly
        // This function now only updates auxiliary data like health, name, phrase from GSU or other events.
        if (serverData.h !== undefined) this.health = serverData.h;
        if (serverData.n !== undefined) this.name = serverData.n;
        if (serverData.phrase !== undefined) this.phrase = serverData.phrase;

        // For remote players (KINEMATIC bodies), we update their physics body directly elsewhere
        // when receiving gameStateUpdate or playerRespawned events.
        // So, we don't call setInterpolationTargets here anymore.
    }
    // REMOVED: setInterpolationTargets() - Physics body position is set directly

    loadMesh() {
        console.log(`[Entities] Loading mesh for remote player ${this.id}`);
        const playerModelData = loadManager?.getAssetData('playerModel');

        if (playerModelData && playerModelData instanceof THREE.Object3D) {
            try {
                this.mesh = playerModelData.clone();
                const scale = 0.3; this.mesh.scale.set(scale, scale, scale);
                this.mesh.traverse(c=>{if(c.isMesh){c.castShadow=true;c.receiveShadow=true;}});
                // Set initial visual position based on data stored during construction
                // Position will be immediately overwritten by physics sync in animate loop.
                const initialY = this.initialData.y + (CONFIG.PLAYER_HEIGHT || 1.8) / 2; // Estimate center
                this.mesh.position.set(this.initialData.x, initialY, this.initialData.z);
                this.mesh.rotation.y = this.initialData.rotationY || 0;

                if (scene) { scene.add(this.mesh); console.log(`[Entities] Added remote player model mesh ${this.id}`); }
                else { console.error("[Entities] Scene missing when adding mesh!"); }
            } catch (e) { console.error(`[Entities] Error cloning player model ${this.id}:`, e); this.loadFallbackMesh(); }
        } else { console.warn(`[Entities] playerModel data NOT ready for remote ${this.id}. Using fallback.`); this.loadFallbackMesh(); }
    }

    loadFallbackMesh() {
        if (this.mesh) return; console.warn(`[Entities] Creating fallback mesh for remote ${this.id}`);
        try {
            const r = CONFIG.PLAYER_RADIUS || 0.4; const h = CONFIG.PLAYER_HEIGHT || 1.8;
            const geo=new THREE.CylinderGeometry(r,r,h,8); const mat=new THREE.MeshStandardMaterial({color:0xff00ff,roughness:0.7}); this.mesh=new THREE.Mesh(geo,mat); this.mesh.castShadow=true; this.mesh.receiveShadow=true;
            // Cylinder visual position = physics center. Set initial estimate.
            const initialY = this.initialData.y + h/2;
            this.mesh.position.set(this.initialData.x, initialY, this.initialData.z);
            this.mesh.rotation.y = this.initialData.rotationY || 0;

            if(scene) { scene.add(this.mesh); console.log(`[Entities] Added remote fallback mesh ${this.id}`); }
            else { console.error("[Entities] Scene missing!"); }
        } catch (e) { console.error(`[Entities] Fallback error ${this.id}:`, e); }
    }

    // REMOVED: interpolate() - Visuals synced directly from physics body in Game.animate loop

    setVisible(v) { if(this.mesh)this.mesh.visible=v; }

    remove() {
         // Remove visual mesh
         if (this.mesh) { if (scene) scene.remove(this.mesh); try { this.mesh.traverse(c=>{ if(c.isMesh){c.geometry?.dispose();if(c.material){if(Array.isArray(c.material))c.material.forEach(m=>m.dispose());else c.material.dispose();}}}); } catch(e){} this.mesh = null; }
         // Physics body removal should be handled externally (e.g., in Network._removePlayer)
         this.body = null; // Clear reference
    }

} // End ClientPlayer Class

console.log("entities.js loaded (Adapted for Physics Engine)");
