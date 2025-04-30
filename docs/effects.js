// docs/effects.js (Add Explosion, Prepare for Sound)

// Needs access to globals: scene, camera, CONFIG, loadManager, THREE, listener, gunSoundBuffer

const Effects = {
    sounds: {}, // Store THREE.Audio objects

    initialize: function(sceneRef, cameraRef) {
        if (!sceneRef || !cameraRef || typeof THREE === 'undefined') {
             console.error("[Effects] Scene, Camera, or THREE missing for init!");
             return false;
        }
        // Need an AudioListener attached to the camera
        if (!window.listener) {
            window.listener = new THREE.AudioListener();
            cameraRef.add(window.listener);
            console.log("[Effects] Created and attached AudioListener to camera.");
        } else {
             console.log("[Effects] Using existing AudioListener.");
        }

        console.log("[Effects] Initialized (Explosion Added, Sound Ready).");
        return true;
    },

    // Simple placeholder particle explosion
    createExplosionEffect: function(position) {
        if (!scene || !THREE) return;
        // console.log("[Effects] Creating explosion at:", position); // DEBUG
        const geometry = new THREE.SphereGeometry(0.3, 8, 8); // Smaller particles
        const material = new THREE.MeshBasicMaterial({ color: 0xffaa00, transparent: true, opacity: 0.9 });
        const count = 30; // More particles
        const baseSpeed = 15; // Speed factor

        for (let i = 0; i < count; i++) {
            const particle = new THREE.Mesh(geometry, material.clone());
            particle.position.copy(position); // Start at the death position
            const velocity = new THREE.Vector3(
                (Math.random() - 0.5),
                (Math.random() - 0.5),
                (Math.random() - 0.5)
            );
            velocity.normalize().multiplyScalar(baseSpeed * (0.5 + Math.random() * 0.8)); // Vary speed slightly
            scene.add(particle);

            // Animate particle outwards and fade out using simple tweening over time
            let life = 0.8 + Math.random() * 0.4; // Slightly varied lifetime (0.8 to 1.2 seconds)
            const startTime = Date.now();

            function animateParticle() {
                const elapsed = (Date.now() - startTime) / 1000; // time in seconds
                if (elapsed >= life) {
                    scene.remove(particle);
                    // Properly dispose of geometry and material clones
                     if (particle.geometry) particle.geometry.dispose();
                     if (particle.material) {
                         if (Array.isArray(particle.material)) {
                             particle.material.forEach(m => m.dispose());
                         } else {
                             particle.material.dispose();
                         }
                     }
                    return;
                }
                const progress = elapsed / life; // 0 to 1

                // Move particle (using deltaTime is better, but this is simpler for short-lived effect)
                // particle.position.addScaledVector(velocity, 1/60); // Approximate movement per frame
                 particle.position.addScaledVector(velocity, Math.min(1/60, life - elapsed)); // Prevent overshooting


                // Fade out
                particle.material.opacity = 1.0 - progress;

                // Optional: Scale down
                // particle.scale.setScalar(1.0 - progress);

                requestAnimationFrame(animateParticle);
            }
            animateParticle();
        }
        // TODO: Play explosion sound here using playSound
        // This requires loading an explosion sound buffer similar to gunSoundBuffer
        // this.playSound(window.explosionSoundBuffer, position);
    },

    // Play a sound (can be positional or attached to camera)
    playSound: function(buffer, sourceObjectOrPosition = null, loop = false, volume = 0.5) {
        if (!buffer || !window.listener) {
            // console.warn("[Effects] Cannot play sound: Missing buffer or audio listener.");
            return null;
        }
        // Ensure AudioContext is running (required by user interaction)
        if (window.listener.context.state === 'suspended') {
            console.warn("[Effects] AudioContext suspended. Trying to resume...");
            window.listener.context.resume().catch(e => console.error("Resume failed", e));
            // Sound might not play immediately after resume attempt
        }


        let sound;

        if (sourceObjectOrPosition && sourceObjectOrPosition instanceof THREE.Vector3) {
            // Positional audio at a specific world location
            sound = new THREE.PositionalAudio(window.listener);
            // Need a dummy object to attach the sound to at the position
            const soundEmitter = new THREE.Object3D();
            soundEmitter.position.copy(sourceObjectOrPosition);
            scene.add(soundEmitter); // Add temporarily to scene
            soundEmitter.add(sound);
            sound.setRefDistance(8); // Adjust falloff distance
            sound.setRolloffFactor(1.5); // Adjust falloff curve

             // Auto-remove the emitter after sound plays if not looping
             if (!loop) {
                 sound.onEnded = () => {
                     sound.isPlaying = false; // THREE.Audio lacks an easy isPlaying check after stop sometimes
                     if(sound.parent) sound.removeFromParent(); // Remove sound from emitter
                     if(soundEmitter.parent) scene.remove(soundEmitter); // Remove emitter from scene
                     // console.log("[Effects] Removed temporary positional sound emitter.");
                 };
             }

        } else if (sourceObjectOrPosition && sourceObjectOrPosition instanceof THREE.Object3D) {
             // Positional audio attached to a moving object (like another player)
             sound = new THREE.PositionalAudio(window.listener);
             sourceObjectOrPosition.add(sound); // Attach sound to the object
             sound.setRefDistance(8);
             sound.setRolloffFactor(1.5);
              // Auto-remove from parent if not looping
             if (!loop) {
                  sound.onEnded = () => {
                      sound.isPlaying = false;
                      if(sound.parent) sound.removeFromParent();
                      // console.log("[Effects] Removed sound from parent object.");
                  };
             }

        } else {
            // Non-positional audio (attached to listener/camera) - good for UI sounds or local player actions
            sound = new THREE.Audio(window.listener);
            // No need to attach, Audio uses the listener directly
             if (!loop) {
                  sound.onEnded = () => {
                     sound.isPlaying = false;
                  };
             }
        }

        sound.setBuffer(buffer);
        sound.setLoop(loop);
        sound.setVolume(volume);

        // Check if already playing to avoid overlapping identical non-positional sounds
        // Note: This check might not be perfect for positional sounds if multiple instances exist.
        if(sound.isPlaying) {
            sound.stop(); // Stop previous instance before playing new one
        }
        sound.play();
        // console.log("[Effects] Playing sound."); // DEBUG

        return sound; // Return the sound object if needed
    },


    update: function(deltaTime) {
        // Placeholder for any future time-dependent effects updates
    },

};
window.Effects = Effects;
console.log("effects.js loaded (Explosion Added, Sound Ready)");
