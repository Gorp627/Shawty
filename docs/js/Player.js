// docs/js/Player.js
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const PLAYER_MODEL_SCALE = 0.8; // Adjust as needed
const GUN_MODEL_SCALE = 0.1; // Adjust as needed

export class Player {
    constructor(id, name, character, scene, isLocalPlayer = false, assetPaths, camera) {
        this.id = id;
        this.name = name;
        this.character = character;
        this.scene = scene;
        this.isLocalPlayer = isLocalPlayer;
        this.assetPaths = assetPaths;
        this.camera = camera; // For nametag orientation

        this.health = 100;
        this.kills = 0;
        this.deaths = 0;
        
        this.model = new THREE.Group(); // Main container for player model and gun
        this.playerMesh = null; // Will hold the GLTF character model
        this.gunMesh = null; // Will hold the GLTF gun model

        this.targetPosition = new THREE.Vector3();
        this.targetQuaternion = new THREE.Quaternion();
        this.lerpFactor = 0.2; // For smooth movement interpolation

        this.nametagElement = null;
        this.createNametag();

        this.loadModels();
    }

    async loadModels() {
        const loader = new GLTFLoader();
        try {
            // Load Player Model
            const playerGltf = await loader.loadAsync(this.assetPaths.character);
            this.playerMesh = playerGltf.scene;
            this.playerMesh.scale.setScalar(PLAYER_MODEL_SCALE);
            this.playerMesh.traverse(child => {
                if (child.isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true; // Optional
                }
            });
            this.model.add(this.playerMesh);

            // Load Gun Model
            const gunGltf = await loader.loadAsync(this.assetPaths.gun);
            this.gunMesh = gunGltf.scene;
            this.gunMesh.scale.setScalar(GUN_MODEL_SCALE);
             this.gunMesh.traverse(child => {
                if (child.isMesh) {
                    child.castShadow = true;
                }
            });
            
            // Attempt to attach gun to a "hand" bone if it exists
            // This is highly dependent on your GLB model's skeleton structure
            let handBone = null;
            if(this.playerMesh){
                this.playerMesh.traverse(child => {
                    if (child.isBone && (child.name.toLowerCase().includes('hand_r') || child.name.toLowerCase().includes('right_hand'))) {
                         handBone = child;
                    }
                });
            }

            if (handBone) {
                console.log("Attaching gun to hand bone:", handBone.name);
                handBone.add(this.gunMesh);
                // You might need to adjust gunMesh.position and gunMesh.rotation
                // relative to the hand bone for correct placement.
                this.gunMesh.position.set(0.1, 0.1, -0.2); // Example values, adjust these!
                this.gunMesh.rotation.set(0, Math.PI / 2, 0); // Example values, adjust these!
            } else {
                 console.warn(`Hand bone not found for player ${this.name}. Attaching gun to player model root.`);
                // Fallback: attach to player model root or a default position if not local player
                if (this.isLocalPlayer) {
                    // For local player, gun might be parented to camera or handled differently
                    // For now, let's hide it if no hand bone and it's not the local player's FP view
                } else {
                     this.playerMesh.add(this.gunMesh); // Add to player model
                     this.gunMesh.position.set(0.3 * PLAYER_MODEL_SCALE, 1.2 * PLAYER_MODEL_SCALE, 0.5 * PLAYER_MODEL_SCALE); // Adjust
                }
            }
            
            // If it's the local player, we might not render their own full body model or gun in first person
            // Or the gun is parented to the camera directly.
            if (this.isLocalPlayer) {
                // We'll handle the first-person gun separately in main.js, attached to the camera
                // So, we can hide the third-person gun model for the local player.
                if (this.gunMesh) this.gunMesh.visible = false;
                if (this.playerMesh) {
                    // Optionally hide parts of the local player model (e.g., head)
                    this.playerMesh.traverse(child => {
                        if (child.isMesh) child.frustumCulled = false; // Ensure it renders even if camera is "inside"
                        // if (child.name.toLowerCase().includes('head')) child.visible = false;
                    });
                }
            }


        } catch (error) {
            console.error(`Error loading models for player ${this.name}:`, error);
        }
        this.scene.add(this.model);
    }

    createNametag() {
        this.nametagElement = document.createElement('div');
        this.nametagElement.className = 'nametag';
        this.nametagElement.textContent = this.name;
        document.body.appendChild(this.nametagElement); // Add to body, position updated in update loop
        if (this.isLocalPlayer) {
            this.nametagElement.style.display = 'none'; // Don't show for local player
        }
    }

    updateNametag() {
        if (!this.nametagElement || this.isLocalPlayer || !this.playerMesh || !this.camera) return;

        const nametagHeightOffset = 1.5 * PLAYER_MODEL_SCALE; // Adjust as needed above the model
        const nametagPosition = new THREE.Vector3(
            this.model.position.x,
            this.model.position.y + nametagHeightOffset,
            this.model.position.z
        );

        const screenPosition = nametagPosition.clone().project(this.camera);

        // Only display if the nametag is in front of the camera and not too far
        if (screenPosition.z < 1) { // z < 1 means in front
            const x = (screenPosition.x * 0.5 + 0.5) * window.innerWidth;
            const y = (-screenPosition.y * 0.5 + 0.5) * window.innerHeight;

            this.nametagElement.style.transform = `translate(-50%, -50%) translate(${x}px, ${y}px)`;
            this.nametagElement.style.display = 'block';

            // Basic occlusion check (very simple, not perfect)
            // If the player model itself is occluded, the nametag might still show.
            // A raycast would be more accurate but more expensive.
            const distanceToCamera = this.model.position.distanceTo(this.camera.position);
            if (distanceToCamera > 50) { // Max distance to show nametag
                 this.nametagElement.style.display = 'none';
            }

        } else {
            this.nametagElement.style.display = 'none';
        }
    }


    setState(newState) {
        this.targetPosition.set(newState.position.x, newState.position.y, newState.position.z);
        
        // Server sends Euler Y (yaw) and X (pitch)
        // For other players, we mainly care about Y-axis rotation for the model.
        // Pitch (X-axis) might be used for head aiming if you have bone control.
        this.targetQuaternion.setFromEuler(new THREE.Euler(0, newState.rotation.y, 0, 'YXZ'));
        // If you want model to pitch too:
        // this.targetQuaternion.setFromEuler(new THREE.Euler(newState.rotation.x, newState.rotation.y, 0, 'YXZ'));


        this.health = newState.health;
        this.kills = newState.kills;
        this.deaths = newState.deaths;
    }

    update(deltaTime) {
        // Interpolate position and rotation for smooth movement
        this.model.position.lerp(this.targetPosition, this.lerpFactor);
        this.model.quaternion.slerp(this.targetQuaternion, this.lerpFactor);

        if (this.playerMesh && !this.isLocalPlayer) { // Don't rotate local player model this way (camera does it)
             // Make remote player models look where their server rotation indicates
            // The model's "forward" might not be Z-negative, adjust if needed
            // this.playerMesh.rotation.y = this.targetYaw; // Simplified, assuming targetYaw is sent
        }
        
        this.updateNametag();
    }
    
    // Call when player is shot for visual feedback (e.g. tint red)
    onHitEffect() {
        if (this.playerMesh) {
            const originalColors = [];
            this.playerMesh.traverse(child => {
                if (child.isMesh && child.material) {
                    originalColors.push({obj: child, color: child.material.color.clone()});
                    child.material.color.setHex(0xff0000); // Tint red
                }
            });
            setTimeout(() => {
                 originalColors.forEach(item => {
                    if (item.obj.material) item.obj.material.color.copy(item.color);
                 });
            }, 150); // Duration of tint
        }
    }

    dispose() {
        if (this.model) this.scene.remove(this.model);
        if (this.playerMesh) { /* dispose geometry, material if necessary */ }
        if (this.gunMesh) { /* dispose geometry, material if necessary */ }
        if (this.nametagElement) this.nametagElement.remove();
    }
}
