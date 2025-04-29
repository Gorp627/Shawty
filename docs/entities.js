// entities.js
// (Modified to sync with Rapier - Added position cache)
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
        // const playerModelData = loadManager?.getAssetData('playerModel');
        // if (playerModelData) {
        //     this.mesh = playerModelData.clone(); // Clone the loaded model scene
        //     // Adjust scale, orientation if necessary
        //     // this.mesh.scale.set(0.5, 0.5, 0.5);
        //     // Apply shadows etc.
        //     this.mesh.traverse(child => {
        //         if (child.isMesh) {
        //             child.castShadow = true;
        //             child.receiveShadow = true;
        //         }
        //     });
        //     console.log(`[Entities] Cloned actual player model for ${this.id}`);
        // } else {
            // Fallback to simple capsule if model fails or isn't ready
            // console.warn(`[Entities] Player model not loaded or failed for ${this.id}. Using fallback capsule.`);
            try {
                const h = CONFIG.PLAYER_HEIGHT || 1.8;
                const r = CONFIG.PLAYER_RADIUS || 0.4;
                 // THREE.CapsuleGeometry uses (radius, length of cylinder part, ...)
                const geo = new THREE.CapsuleGeometry(r, h - 2 * r, 4, 8);
                const mat = new THREE.MeshStandardMaterial({
                     color: this.id === localPlayerId ? 0x00ff00 : 0xff00ff, // Green for local, magenta for remote
                     roughness: 0.7
                });
                this.mesh = new THREE.Mesh(geo, mat);
                this.mesh.castShadow = true;
                this.mesh.receiveShadow = true;

                 // Add name tag above player (optional)
                 // this.createNameTag();

                if (scene) {
                    scene.add(this.mesh);
                    console.log(`[Entities] Added fallback mesh for ${this.id}`);
                } else {
                    console.error("[Entities] Scene missing when trying to add fallback mesh!");
                }
            } catch (e) {
                console.error(`[Entities] Error creating fallback capsule for ${this.id}:`, e);
            }
        // }

         // Set initial position based on server data (feet position)
         // The game loop (sync mesh to physics body) will override this shortly after physics body creation.
        if (this.mesh) {
             this.mesh.position.set(this.x, this.y, this.z);
             // Initial rotation
             this.mesh.rotation.y = this.rotationY;
        }
    }

    // Example Name Tag function (Needs THREE.CSS2DRenderer setup in game.js)
    /*
    createNameTag() {
        if (!this.mesh) return;
        const nameDiv = document.createElement('div');
        nameDiv.className = 'player-nametag'; // Add CSS for styling
        nameDiv.textContent = this.name;
        nameDiv.style.color = 'white';
        nameDiv.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
        nameDiv.style.padding = '2px 5px';
        nameDiv.style.borderRadius = '3px';
        nameDiv.style.fontSize = '12px';

        const nameLabel = new THREE.CSS2DObject(nameDiv);
        nameLabel.position.set(0, CONFIG.PLAYER_HEIGHT * 0.6, 0); // Position slightly above capsule center
        this.mesh.add(nameLabel); // Attach label to the mesh
        nameLabel.layers.set(0); // Ensure it's rendered by the CSS2DRenderer
    }
    */

    setVisible(v) { if (this.mesh) this.mesh.visible = v; }

    remove() {
        if (this.mesh) {
            if (scene) {
                scene.remove(this.mesh);
            } else {
                 console.warn("[Entities] Scene missing during mesh removal for", this.id);
            }
            try {
                // Remove CSS2D label if exists
                 const label = this.mesh.getObjectByProperty('isCSS2DObject', true);
                 if (label) {
                     label.removeFromParent();
                     if(label.element && label.element.parentNode){
                         label.element.parentNode.removeChild(label.element);
                     }
                 }

                this.mesh.traverse(c => {
                    if (c.geometry) c.geometry.dispose();
                    if (c.material) {
                         // Handle multi-materials
                         if (Array.isArray(c.material)) {
                             c.material.forEach(m => m.dispose());
                         } else {
                             c.material.dispose();
                         }
                    }
                });
                 console.log(`[Entities] Disposed mesh resources for ${this.id}`);
            } catch (e) { console.error(`[Entities] Mesh dispose error for ${this.id}:`, e); }
            this.mesh = null;
        }
    }
}
