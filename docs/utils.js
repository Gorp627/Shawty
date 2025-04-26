// docs/utils.js

function lerp(a, b, t) { return a + (b - a) * t; }
function clamp(value, min, max) { return Math.max(min, Math.min(value, max)); }
function randomFloat(min, max) { return Math.random() * (max - min) + min; }
function randomInt(min, max) { min = Math.ceil(min); max = Math.floor(max); return Math.floor(Math.random() * (max - min + 1)) + min; }

function createImpactParticle(position) {
    if (!scene || !CONFIG) return; // Check scene and config exist
    const geometry = new THREE.SphereGeometry(0.03, 4, 4);
    const material = new THREE.MeshBasicMaterial({ color: 0xffa500 }); // Orange
    const particle = new THREE.Mesh(geometry, material);
    particle.position.copy(position);
    scene.add(particle);
    // Remove after duration using global CONFIG
    setTimeout(() => {
        if (scene) scene.remove(particle);
        geometry.dispose();
        material.dispose();
    }, CONFIG.BULLET_IMPACT_DURATION || 300);
}

console.log("utils.js loaded");
