// docs/entities.js (Client-side representation for REMOTE players - Kinematic)

// Needs access to globals: scene, THREE, CONFIG, loadManager

// --- Player Class (Client-side representation for REMOTE players) ---
class ClientPlayer {
    constructor(playerData) {
        this.id = playerData.id;
        this.mesh = null;           // Three.js visual mesh
        this.name = 'Player';
        this.phrase = '...';
        this.health = CONFIG?.PLAYER_DEFAULT_HEALTH || 100;

        // Store initial data needed for mesh loading/setup
        this.initialData = { ...playerData }; // Copy initial state

        // --- REMOVED Interpolation targets - Positions now set directly from Rapier kinematic body ---
        // this.targetPosition = new THREE.Vector3();
        // this.targetRotationY = 0;

        this.updateData(playerData); // Set initial name, phrase, health
        this.loadMesh(); // Load visual mesh
    }

    // Updates internal state cache from server data (for non-physics properties)
    updateData(serverData) {
        // Cache non-positional data received from server
        this.health = serverData.h ?? serverData.health ?? this.health;
        this.name = serverData.n ?? serverData.name ?? this.name;
        this.phrase = serverData.phrase ?? serverData.phrase ?? this.phrase;

        // Position/Rotation are handled by syncing the Rapier kinematic body in game.js/network.js
        // Server data (sPD) is directly used to set the kinematic body's next position/rotation
        // this.x = serverData.x ?? this.x ?? 0; // No longer need local cache
        // this.y = serverData.y ?? this.y ?? 0;
        // this.z = serverData.z ?? this.z ?? 0;
        // this.rotationY = serverData.r ?? serverData.rotationY ?? this.rotationY ?? 0;

        // --- REMOVED setInterpolationTargets - Not needed with direct Rapier body syncing ---
        // this.setInterpolationTargets();
    }

    // --- REMOVED setInterpolationTargets() method ---

    loadMesh() {
        console.log(`[Entities] Loading mesh for remote player ${this.id}`);
        const playerModelData = loadManager?.getAssetData('playerModel');

        if (playerModelData && playerModelData instanceof THREE.Object3D) {
            try {
                this.mesh = playerModelData.clone();
                const scale = 0.3; this.mesh.scale.set(scale, scale, scale);
                this.mesh.traverse(c=>{if(c.isMesh){c.castShadow=true; c.receiveShadow=true;}});

                // Initial position/rotation will be set by the Rapier body creation in game.js
                // or the first gameStateUpdate sync for players joining later.
                // We don't set initial mesh position here anymore.
                // let initialVY = this.initialData.y;
                // this.mesh.position.set(this.initialData.x, initialVY, this.initialData.z);
                // this.mesh.rotation.y = this.initialData.rotationY || 0;

                if (scene) { scene.add(this.mesh); console.log(`[Entities] Added remote model mesh ${this.id}`); }
                else { console.error("[Entities] Scene missing!"); }
            } catch (e) { console.error(`[Entities] Clone error ${this.id}:`, e); this.loadFallbackMesh(); }
        } else { console.warn(`[Entities] playerModel data NOT ready for remote ${this.id}. Using fallback.`); this.loadFallbackMesh(); }
    }

    loadFallbackMesh() {
        if (this.mesh) return; console.warn(`[Entities] Creating fallback mesh for remote ${this.id}`);
        try {
            const r=CONFIG.PLAYER_RADIUS||0.4; const h=CONFIG.PLAYER_HEIGHT||1.8;
            const geo=new THREE.CylinderGeometry(r,r,h,8); const mat=new THREE.MeshStandardMaterial({color:0xff00ff,roughness:0.7}); this.mesh=new THREE.Mesh(geo,mat); this.mesh.castShadow=true; this.mesh.receiveShadow=true;

            // Initial position/rotation set by Rapier body.
            // Cylinder origin is center, game.js sync logic accounts for this offset if needed.
            // const initialVY=this.initialData.y + h/2;
            // this.mesh.position.set(this.initialData.x, initialVY, this.initialData.z);
            // this.mesh.rotation.y=this.initialData.rotationY || 0;

            if(scene) { scene.add(this.mesh); console.log(`[Entities] Added remote fallback mesh ${this.id}`); }
            else { console.error("[Entities] Scene missing!"); }
        } catch (e) { console.error(`[Entities] Fallback error ${this.id}:`, e); }
    }

    // --- REMOVED interpolate() method ---
    // Interpolation is replaced by direct syncing of the Rapier kinematic body's position/rotation
    // to the Three.js mesh in the game loop (game.js)

    setVisible(v) { if(this.mesh)this.mesh.visible=v; }

    remove() {
         if (this.mesh) { if (scene) scene.remove(this.mesh); try { this.mesh.traverse(c=>{ if(c.isMesh){c.geometry?.dispose();if(c.material){if(Array.isArray(c.material))c.material.forEach(m=>m.dispose());else c.material.dispose();}}}); } catch(e){console.error("Mesh dispose error:", e);} this.mesh = null; }
    }

} // End ClientPlayer Class

console.log("entities.js loaded (Rapier - Kinematic, No Interpolation)");
