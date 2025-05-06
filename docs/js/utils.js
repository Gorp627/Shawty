/**
 * Utility functions for the Shawty game
 */

// Constants
const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;
const GRAVITY = -9.8;
const MAP_BOUNDS = {
    minX: -100,
    maxX: 100,
    minY: -50,
    maxY: 100,
    minZ: -100,
    maxZ: 300
};
const FALL_DEATH_Y = -50;

// Helper Functions
function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

function lerp(start, end, factor) {
    return start + factor * (end - start);
}

function randomBetween(min, max) {
    return Math.random() * (max - min) + min;
}

function formatTime(timeInSeconds) {
    const minutes = Math.floor(timeInSeconds / 60);
    const seconds = Math.floor(timeInSeconds % 60);
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
}

function isOutOfBounds(position) {
    return (
        position.x < MAP_BOUNDS.minX ||
        position.x > MAP_BOUNDS.maxX ||
        position.z < MAP_BOUNDS.minZ ||
        position.z > MAP_BOUNDS.maxZ ||
        position.y < FALL_DEATH_Y
    );
}

function calculateDirection(start, end) {
    const direction = new THREE.Vector3();
    direction.subVectors(end, start).normalize();
    return direction;
}

function getRandomSpawnPoint() {
    const spawnPoints = [
        new THREE.Vector3(-0.10692, 89.1166 + 0.5, 128.919),
        new THREE.Vector3(25.3129, 85.7254 + 0.5, 8.80901),
        new THREE.Vector3(50.2203, 39.8632 + 0.5, 203.312)
    ];
    return spawnPoints[Math.floor(Math.random() * spawnPoints.length)];
}

function createDebugSphere(scene, position, color = 0xff0000, radius = 0.5) {
    const geometry = new THREE.SphereGeometry(radius);
    const material = new THREE.MeshBasicMaterial({ color });
    const sphere = new THREE.Mesh(geometry, material);
    sphere.position.copy(position);
    scene.add(sphere);
    return sphere;
}

// Audio helper
const AudioManager = {
    sounds: {},
    
    load: function(name, path, volume = 1.0, loop = false) {
        const listener = new THREE.AudioListener();
        const sound = new THREE.Audio(listener);
        const audioLoader = new THREE.AudioLoader();
        
        return new Promise((resolve, reject) => {
            audioLoader.load(path, (buffer) => {
                sound.setBuffer(buffer);
                sound.setVolume(volume);
                sound.setLoop(loop);
                this.sounds[name] = sound;
                resolve(sound);
            }, undefined, reject);
        });
    },
    
    play: function(name) {
        const sound = this.sounds[name];
        if (sound) {
            if (sound.isPlaying) {
                sound.stop();
            }
            sound.play();
        }
    },
    
    stop: function(name) {
        const sound = this.sounds[name];
        if (sound && sound.isPlaying) {
            sound.stop();
        }
    }
};

// Collision detection
function boxCollision(box1, box2) {
    return (
        box1.min.x <= box2.max.x &&
        box1.max.x >= box2.min.x &&
        box1.min.y <= box2.max.y &&
        box1.max.y >= box2.min.y &&
        box1.min.z <= box2.max.z &&
        box1.max.z >= box2.min.z
    );
}

function sphereCollision(sphere1, sphere2) {
    const distance = sphere1.center.distanceTo(sphere2.center);
    return distance < (sphere1.radius + sphere2.radius);
}

function raycastFromCamera(camera, mouse, raycaster, objects) {
    raycaster.setFromCamera(mouse, camera);
    return raycaster.intersectObjects(objects, true);
}

// Create explosion effect
function createExplosion(scene, position, radius = 5, particles = 50) {
    const group = new THREE.Group();
    group.position.copy(position);
    
    // Create particles
    for (let i = 0; i < particles; i++) {
        const geometry = new THREE.SphereGeometry(randomBetween(0.1, 0.5));
        const material = new THREE.MeshBasicMaterial({
            color: new THREE.Color(
                randomBetween(0.8, 1),
                randomBetween(0.3, 0.8),
                randomBetween(0, 0.3)
            )
        });
        
        const particle = new THREE.Mesh(geometry, material);
        
        // Random position within radius
        const theta = randomBetween(0, Math.PI * 2);
        const phi = randomBetween(0, Math.PI);
        const r = randomBetween(0, radius);
        
        particle.position.x = r * Math.sin(phi) * Math.cos(theta);
        particle.position.y = r * Math.sin(phi) * Math.sin(theta);
        particle.position.z = r * Math.cos(phi);
        
        // Random velocity
        particle.userData.velocity = new THREE.Vector3(
            randomBetween(-1, 1),
            randomBetween(0, 2),
            randomBetween(-1, 1)
        ).normalize().multiplyScalar(randomBetween(5, 15));
        
        group.add(particle);
    }
    
    scene.add(group);
    
    // Animate and remove after duration
    const duration = 2000; // 2 seconds
    const startTime = Date.now();
    
    function updateExplosion() {
        const elapsedTime = Date.now() - startTime;
        const progress = elapsedTime / duration;
        
        if (progress >= 1) {
            // Remove explosion
            scene.remove(group);
            return;
        }
        
        // Update particles
        group.children.forEach(particle => {
            // Apply velocity
            particle.position.add(particle.userData.velocity.clone().multiplyScalar(0.016)); // Assuming 60fps (1/60 = 0.016)
            
            // Apply gravity
            particle.userData.velocity.y += GRAVITY * 0.016;
            
            // Fade out
            const scale = 1 - progress;
            particle.scale.set(scale, scale, scale);
            
            if (particle.material) {
                particle.material.opacity = 1 - progress;
                particle.material.transparent = true;
            }
        });
        
        requestAnimationFrame(updateExplosion);
    }
    
    requestAnimationFrame(updateExplosion);
    
    return group;
}

// Create shockwave effect
function createShockwave(scene, position, radius = 10, duration = 1000) {
    const geometry = new THREE.RingGeometry(0.1, 0.5, 32);
    const material = new THREE.MeshBasicMaterial({
        color: 0xff7700,
        transparent: true,
        opacity: 0.7,
        side: THREE.DoubleSide
    });
    
    const shockwave = new THREE.Mesh(geometry, material);
    shockwave.position.copy(position);
    shockwave.rotation.x = -Math.PI / 2; // Make it parallel to the ground
    
    scene.add(shockwave);
    
    const startTime = Date.now();
    
    function updateShockwave() {
        const elapsedTime = Date.now() - startTime;
        const progress = elapsedTime / duration;
        
        if (progress >= 1) {
            scene.remove(shockwave);
            return;
        }
        
        // Expand the ring
        const currentRadius = radius * progress;
        shockwave.scale.set(currentRadius, currentRadius, 1);
        
        // Fade out
        material.opacity = 0.7 * (1 - progress);
        
        requestAnimationFrame(updateShockwave);
    }
    
    requestAnimationFrame(updateShockwave);
    
    return shockwave;
}

// Apply force to nearby objects (for explosions)
function applyExplosionForce(position, radius, force, objects) {
    objects.forEach(obj => {
        if (obj.userData.physics && obj.position) {
            const distance = position.distanceTo(obj.position);
            
            if (distance < radius) {
                // Calculate direction from explosion to object
                const direction = new THREE.Vector3().subVectors(obj.position, position).normalize();
                
                // Force decreases with distance (inverse square law)
                const forceFactor = (1 - (distance / radius)) * force;
                
                // Apply force
                const impulse = direction.multiplyScalar(forceFactor);
                
                if (obj.userData.velocity) {
                    obj.userData.velocity.add(impulse);
                }
            }
        }
    });
}
