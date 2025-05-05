// docs/js/scene.js
import * as THREE from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.module.js';
import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/jsm/loaders/GLTFLoader.js'; // Ensure path is correct

let scene, camera, renderer, listener, soundListener;
let playerMeshes = {}; // Store meshes for all players { id: mesh }
let environmentMesh; // For map collision
let assetLoadManager;
let onAssetsLoadedCallback;

const gltfLoader = new GLTFLoader();
const audioLoader = new THREE.AudioLoader();
let gunshotSoundBuffer;

const PLAYER_HEIGHT = 1.8; // Approximate height for camera/collision offset
const FALL_DEATH_Y = -50; // Y position below which player dies

export function initScene(canvas, onAssetsLoaded) {
    onAssetsLoadedCallback = onAssetsLoaded;

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87ceeb); // Sky blue background
    scene.fog = new THREE.Fog(0x87ceeb, 0, 500); // Add fog for atmosphere

    // Camera setup (Perspective)
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.y = PLAYER_HEIGHT; // Start camera at player height

    // Renderer setup
    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true; // Enable shadows

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(50, 100, 50);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    directionalLight.shadow.camera.near = 0.5;
    directionalLight.shadow.camera.far = 500;
    directionalLight.shadow.camera.left = -150;
    directionalLight.shadow.camera.right = 150;
    directionalLight.shadow.camera.top = 150;
    directionalLight.shadow.camera.bottom = -150;
    scene.add(directionalLight);
    // const helper = new THREE.CameraHelper( directionalLight.shadow.camera ); // Debug shadows
    // scene.add( helper );


    // Audio Listener
    listener = new THREE.AudioListener();
    camera.add(listener); // Attach listener to camera

    // Load assets
    loadAssets();

    // Handle window resize
    window.addEventListener('resize', onWindowResize, false);

    return { scene, camera, renderer };
}

function loadAssets() {
    assetLoadManager = new THREE.LoadingManager();
    assetLoadManager.onLoad = () => {
        console.log('All assets loaded successfully!');
        if (onAssetsLoadedCallback) onAssetsLoadedCallback();
    };
    assetLoadManager.onError = (url) => {
        console.error('There was an error loading ' + url);
    };
    assetLoadManager.onProgress = (url, itemsLoaded, itemsTotal) => {
        console.log('Loading file: ' + url + '.\nLoaded ' + itemsLoaded + ' of ' + itemsTotal + ' files.');
        // Update loading progress UI here if needed
        // import { updateLoadingProgress } from './ui.js'; // Example
        // updateLoadingProgress(itemsLoaded / itemsTotal);
    };

    const gltfLoaderManaged = new GLTFLoader(assetLoadManager);
    const audioLoaderManaged = new THREE.AudioLoader(assetLoadManager);

    // Load Map (RENAME "the first map!.glb" to "map1.glb" or similar!)
    gltfLoaderManaged.load('assets/maps/map1.glb', (gltf) => { // *** USE RENAMED FILE ***
        environmentMesh = gltf.scene;
        environmentMesh.traverse((node) => {
            if (node.isMesh) {
                node.castShadow = true;
                node.receiveShadow = true;
                // Optional: Optimize collision by only checking certain parts of the map
                // node.userData.isCollidable = true;
            }
        });
        scene.add(environmentMesh);
        console.log("Map loaded.");
    }, undefined, (error) => console.error("Error loading map:", error));

    // Pre-load character model (optional, or load on demand)
    // gltfLoaderManaged.load('assets/maps/Shawty1.glb', (gltf) => {
    //     // Store prototype for cloning later? Or just load when needed.
    //     console.log("Character model pre-loaded (optional).");
    // }, undefined, (error) => console.error("Error pre-loading character:", error));

    // Pre-load gun model (optional)
    // gltfLoaderManaged.load('assets/maps/gun2.glb', (gltf) => {
    //     console.log("Gun model pre-loaded (optional).");
    // }, undefined, (error) => console.error("Error pre-loading gun:", error));


    // Load Sounds
    audioLoaderManaged.load('assets/maps/gunshot.wav', (buffer) => {
        gunshotSoundBuffer = buffer;
        console.log("Gunshot sound loaded.");
    }, undefined, (error) => console.error("Error loading gunshot sound:", error));
}

export function addPlayer(playerData) {
    if (playerMeshes[playerData.id]) return; // Already exists

    console.log(`Adding player ${playerData.name} (${playerData.id}) to scene`);
    // Load the specific character model
    gltfLoader.load(`assets/maps/${playerData.model || 'Shawty1'}.glb`, (gltf) => {
        const playerMesh = gltf.scene;
        playerMesh.scale.set(0.5, 0.5, 0.5); // Adjust scale as needed
        playerMesh.position.set(playerData.position.x, playerData.position.y, playerData.position.z);
        // playerMesh.rotation.set(playerData.rotation.x, playerData.rotation.y, playerData.rotation.z); // Set initial rotation if needed
        playerMesh.castShadow = true;
        playerMesh.receiveShadow = true;
        playerMesh.userData.id = playerData.id; // Store ID for reference

        playerMesh.traverse((node) => {
            if (node.isMesh) {
                node.castShadow = true;
                 // node.receiveShadow = true; // Characters usually don't receive shadows on themselves well unless complex setup
            }
        });

        // Attach gun model (placeholder - more complex logic needed)
        loadAndAttachGun(playerMesh);

        playerMeshes[playerData.id] = playerMesh;
        scene.add(playerMesh);
        console.log(`Mesh added for ${playerData.id}`);
    }, undefined, (error) => {
        console.error(`Error loading model for player ${playerData.id}:`, error);
        // Fallback to a simple cube if loading fails?
        const geometry = new THREE.BoxGeometry(1, PLAYER_HEIGHT, 1);
        const material = new THREE.MeshStandardMaterial({ color: Math.random() * 0xffffff });
        const cube = new THREE.Mesh(geometry, material);
        cube.position.set(playerData.position.x, playerData.position.y, playerData.position.z);
        cube.castShadow = true;
        cube.userData.id = playerData.id;
        playerMeshes[playerData.id] = cube;
        scene.add(cube);
    });
}

function loadAndAttachGun(playerMesh) {
     // Basic gun attachment - Needs refinement for proper positioning/bone attachment
    gltfLoader.load('assets/maps/gun2.glb', (gltf) => {
        const gunMesh = gltf.scene;
        gunMesh.scale.set(0.2, 0.2, 0.2); // Adjust scale
        gunMesh.position.set(0.3, PLAYER_HEIGHT * 0.4, 0.5); // Adjust position relative to player center
        gunMesh.rotation.y = -Math.PI / 2; // Point forward
        gunMesh.castShadow = true;

        gunMesh.traverse((node) => {
            if (node.isMesh) node.castShadow = true;
        });

        // Attach gun to player mesh
        // For simplicity, directly adding. For animation, attach to a specific bone.
        playerMesh.add(gunMesh);
        playerMesh.userData.gun = gunMesh; // Store reference if needed
        console.log(`Gun attached to player ${playerMesh.userData.id}`);

    }, undefined, (error) => console.error("Error loading gun model:", error));
}


export function removePlayer(playerId) {
    const mesh = playerMeshes[playerId];
    if (mesh) {
        scene.remove(mesh);
        // Properly dispose of geometry and material to free memory if needed
        // mesh.traverse(child => { ... dispose ... });
        delete playerMeshes[playerId];
        console.log(`Removed mesh for player ${playerId}`);
    }
}

export function updatePlayerPosition(playerId, position, rotation) {
    const mesh = playerMeshes[playerId];
    if (mesh) {
        mesh.position.set(position.x, position.y, position.z);
        // Only apply Y rotation to the main mesh (prevents weird tilting)
        mesh.rotation.y = rotation.y;
        // If you want head tilt based on camera pitch (rotation.x), apply it selectively
        // to a 'head' bone or part of the model if rigged, or ignore for simplicity.
    }
}

export function getPlayerMesh(playerId) {
    return playerMeshes[playerId];
}

export function getCamera() {
    return camera;
}

export function getScene() {
    return scene;
}

export function getEnvironmentMeshes() {
    // Return array of meshes considered for collision
    // Simple: just the loaded map
    // Complex: specific collidable parts of the map
    return environmentMesh ? [environmentMesh] : [];
}

export function playGunshotSound(position) {
    if (!gunshotSoundBuffer || !listener) return;

    // Use PositionalAudio for 3D sound
    const sound = new THREE.PositionalAudio(listener);
    sound.setBuffer(gunshotSoundBuffer);
    sound.setRefDistance(20); // Distance at which volume starts decreasing
    sound.setRolloffFactor(1); // How quickly volume decreases
    sound.setVolume(0.5); // Adjust volume

    // Create a temporary object to position the sound
    // Or attach to the gun mesh if available and correctly positioned
    const soundObject = new THREE.Object3D();
    soundObject.position.copy(position);
    scene.add(soundObject); // Add temporarily to the scene

    soundObject.add(sound); // Add sound source to the object
    sound.play();

    // Clean up the temporary object after the sound finishes
    sound.onEnded = () => {
        sound.isPlaying = false; // Reset flag
        soundObject.remove(sound); // Remove sound source
        scene.remove(soundObject); // Remove temporary object
        // console.log("Sound object removed");
    };
}

export function createDeathExplosion(position) {
    // Simple particle effect placeholder
    const particleCount = 100;
    const particles = new THREE.BufferGeometry();
    const pMaterial = new THREE.PointsMaterial({
        color: 0xFF4500, // OrangeRed
        size: 0.5,
        blending: THREE.AdditiveBlending,
        transparent: true,
        depthWrite: false, // Prevent particles from occluding improperly
    });

    const pVertices = [];
    const velocities = [];

    for (let i = 0; i < particleCount; i++) {
        pVertices.push(position.x, position.y + PLAYER_HEIGHT / 2, position.z); // Start near center

        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        const speed = 5 + Math.random() * 10;

        velocities.push(
            speed * Math.sin(phi) * Math.cos(theta), // x
            speed * Math.cos(phi) + 3,                // y (add slight upward bias)
            speed * Math.sin(phi) * Math.sin(theta) // z
        );
    }

    particles.setAttribute('position', new THREE.Float32BufferAttribute(pVertices, 3));
    const particleSystem = new THREE.Points(particles, pMaterial);
    particleSystem.userData.velocities = velocities; // Store velocities
    particleSystem.userData.life = 1.0; // Lifetime in seconds

    scene.add(particleSystem);

     // Simple shockwave visual (expanding ring)
    const shockwaveGeometry = new THREE.RingGeometry(0.1, 1, 64); // innerRadius, outerRadius, segments
    const shockwaveMaterial = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.8
    });
    const shockwave = new THREE.Mesh(shockwaveGeometry, shockwaveMaterial);
    shockwave.position.copy(position);
    shockwave.position.y += 0.1; // Slightly above ground
    shockwave.rotation.x = -Math.PI / 2; // Lay flat on XZ plane
    shockwave.userData.life = 0.5; // Short lifespan
    shockwave.userData.maxRadius = 25; // How far it expands

    scene.add(shockwave);


    // Return objects that need animation updates
    return [particleSystem, shockwave];
}

export function updateEffect(effect, deltaTime) {
     if (effect.isPoints) { // Particle system
        effect.userData.life -= deltaTime;
        if (effect.userData.life <= 0) {
            scene.remove(effect);
            // Dispose geometry/material if needed
            effect.geometry.dispose();
            effect.material.dispose();
            return false; // Indicate removal
        }

        const positions = effect.geometry.attributes.position.array;
        const velocities = effect.userData.velocities;
        const gravity = -9.8 * 2; // Particle gravity

        for (let i = 0; i < positions.length / 3; i++) {
            // Apply velocity
            positions[i * 3] += velocities[i * 3] * deltaTime;
            positions[i * 3 + 1] += velocities[i * 3 + 1] * deltaTime;
            positions[i * 3 + 2] += velocities[i * 3 + 2] * deltaTime;

            // Apply gravity
            velocities[i * 3 + 1] += gravity * deltaTime;

            // Fade out
            effect.material.opacity = effect.userData.life; // Simple fade
        }
        effect.geometry.attributes.position.needsUpdate = true;

    } else if (effect.isMesh && effect.geometry.type === 'RingGeometry') { // Shockwave
         effect.userData.life -= deltaTime;
         if (effect.userData.life <= 0) {
            scene.remove(effect);
            effect.geometry.dispose();
            effect.material.dispose();
            return false; // Indicate removal
        }
         const progress = 1 - (effect.userData.life / 0.5); // 0 to 1
         const currentRadius = progress * effect.userData.maxRadius;
         const innerRadius = Math.max(0.1, currentRadius - 2); // Keep a thickness

         // Recreate geometry (inefficient but simple for demo)
         // A shader would be much better for performance
         effect.geometry.dispose();
         effect.geometry = new THREE.RingGeometry(innerRadius, currentRadius, 64);
         effect.material.opacity = 1 - progress; // Fade out

    }


    return true; // Indicate still active
}


function onWindowResize() {
    if (camera && renderer) {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    }
}

export { FALL_DEATH_Y, PLAYER_HEIGHT }; // Export constants
