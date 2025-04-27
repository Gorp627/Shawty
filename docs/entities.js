// docs/entities.js (Reverted to Manual Physics)

// Needs access to globals: scene, THREE, CONFIG, loadManager

// --- Player Class (Client-side representation for REMOTE players) ---
class ClientPlayer {
    constructor(playerData) {
        this.id = playerData.id;
        this.mesh = null;           // Three.js visual mesh
        this.targetPosition = new THREE.Vector3(); // For interpolation
        this.targetRotationY = 0;                 // For interpolation
        this.name = 'Player';
        this.phrase = '...';
        this.health = CONFIG?.PLAYER_DEFAULT_HEALTH || 100;

        // Store initial data needed for mesh loading/setup
        this.initialData = { ...playerData }; // Copy initial state

        this.updateData(playerData); // Set initial name, phrase, health, AND targets
        this.loadMesh(); // Load visual mesh
    }

    // Updates state from server data AND sets interpolation targets
    updateData(serverData) {
        // Update internal state cache (server sends feet Y)
        this.x = serverData.x ?? this.x ?? 0;
        this.y = serverData.y ?? this.y ?? 0; // Store feet Y
        this.z = serverData.z ?? this.z ?? 0;
        this.rotationY = serverData.r ?? serverData.rotationY ?? this.rotationY ?? 0;
        this.health = serverData.h ?? serverData.health ?? this.health;
        this.name = serverData.n ?? serverData.name ?? this.name;
        this.phrase = serverData.phrase ?? serverData.phrase ?? this.phrase;
        // Set targets for smooth visual interpolation
        this.setInterpolationTargets();
    }

    // Calculate the target visual position based on mesh type and server Y (feet)
    setInterpolationTargets() {
        const playerHeight = CONFIG?.PLAYER_HEIGHT || 1.8;
        let visualTargetY = this.y; // Assume visual mesh origin is at feet (server Y)

        // Adjust visual Y if the mesh origin is known to be different (e.g., center)
        if (this.mesh && this.mesh.geometry instanceof THREE.CylinderGeometry) {
            visualTargetY = this.y + playerHeight / 2; // Cylinder origin is center
        }
        // If GLTF model origin is center, add: else if (this.mesh) { visualTargetY = this.y + playerHeight / 2; }

        this.targetPosition.set(this.x, visualTargetY, this.z);
        this.targetRotationY = this.rotationY;
    }

    loadMesh() {
        console.log(`[Entities] Loading mesh for remote player ${this.id}`);
        const playerModelData = loadManager?.getAssetData('playerModel');

        if (playerModelData && playerModelData instanceof THREE.Object3D) {
            try {
                this.mesh = playerModelData.clone();
                const scale = 0.3; this.mesh.scale.set(scale, scale, scale);
                this.mesh.traverse(c=>{if(c.isMesh){c.castShadow=true; c.receiveShadow=true;}});
                // Set initial visual position based on initial data
                let initialVY = this.initialData.y; // Assume feet origin
                this.mesh.position.set(this.initialData.x, initialVY, this.initialData.z);
                this.mesh.rotation.y = this.initialData.rotationY || 0;
                // Set initial interpolation targets based on this position
                this.setInterpolationTargets();

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
            // Cylinder origin is center, use initial server feet Y + half height
            const initialVY=this.initialData.y + h/2;
            this.mesh.position.set(this.initialData.x, initialVY, this.initialData.z);
            this.mesh.rotation.y=this.initialData.rotationY || 0;
            // Set initial interpolation targets based on this position
            this.setInterpolationTargets();

            if(scene) { scene.add(this.mesh); console.log(`[Entities] Added remote fallback mesh ${this.id}`); }
            else { console.error("[Entities] Scene missing!"); }
        } catch (e) { console.error(`[Entities] Fallback error ${this.id}:`, e); }
    }

    // Interpolate visual mesh towards target position/rotation
    interpolate(dT) {
        if (!this.mesh || !this.targetPosition) return;
        const lerpFactor = dT * 15; // Interpolation speed factor
        this.mesh.position.lerp(this.targetPosition, lerpFactor);
        if (this.targetRotationY !== undefined) {
            const targetQuaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, this.targetRotationY, 0, 'YXZ'));
            this.mesh.quaternion.slerp(targetQuaternion, lerpFactor);
        }
    }


    setVisible(v) { if(this.mesh)this.mesh.visible=v; }

    remove() {
         if (this.mesh) { if (scene) scene.remove(this.mesh); try { this.mesh.traverse(c=>{ if(c.isMesh){c.geometry?.dispose();if(c.material){if(Array.isArray(c.material))c.material.forEach(m=>m.dispose());else c.material.dispose();}}}); } catch(e){console.error("Mesh dispose error:", e);} this.mesh = null; }
    }

} // End ClientPlayer Class

console.log("entities.js loaded (Reverted to Manual Physics / Interpolation)");
