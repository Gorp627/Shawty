// entities.js
// (Modified to sync with Rapier)
class ClientPlayer {
    constructor(playerData) {
        this.id = playerData.id;
        this.mesh = null;
        this.name = 'Player';
        this.phrase = '...';
        this.health = CONFIG?.PLAYER_DEFAULT_HEALTH || 100;
        this.initialData = { ...playerData };
        this.updateData(playerData);
        this.loadMesh();
    }

    updateData(serverData) {
        this.health = serverData.h ?? serverData.health ?? this.health;
        this.name = serverData.n ?? serverData.name ?? this.name;
        this.phrase = serverData.phrase ?? serverData.phrase ?? this.phrase;
    }

    loadMesh() {
        try {
            const h = CONFIG.PLAYER_HEIGHT || 1.8;
            const r = CONFIG.PLAYER_RADIUS || 0.4;
            const geo = new THREE.CapsuleGeometry(r, h - 2 * r, 4, 8);
            const mat = new THREE.MeshStandardMaterial({ color: 0xff00ff, roughness: 0.7 });
            this.mesh = new THREE.Mesh(geo, mat);
            this.mesh.castShadow = true;
            this.mesh.receiveShadow = true;

            if (scene) {
                scene.add(this.mesh);
                console.log(`[Entities] Added remote fallback mesh ${this.id}`);
            } else {
                console.error("[Entities] Scene missing!");
            }
        } catch (e) {
            console.error(`[Entities] Fallback error ${this.id}:`, e);
        }
    }

    setVisible(v) { if (this.mesh) this.mesh.visible = v; }

    remove() {
        if (this.mesh) {
            if (scene) scene.remove(this.mesh);
            try {
                this.mesh.traverse(c => {
                    if (c.isMesh) {
                        c.geometry?.dispose();
                        if (c.material) {
                            if (Array.isArray(c.material)) c.material.forEach(m => m.dispose());
                            else c.material.dispose();
                        }
                    }
                });
            } catch (e) { console.error("Mesh dispose error:", e); }
            this.mesh = null;
        }
    }
}
