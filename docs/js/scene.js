// docs/js/scene.js
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.module.js'; // Using jsdelivr URL
import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/jsm/loaders/GLTFLoader.js'; // Keep jsdelivr URL

let scene, camera, renderer, listener;
let playerMeshes = {}; // Store meshes for all players { id: mesh }
let environmentMesh; // For map collision
let assetLoadManager;
let onAssetsLoadedCallback;

const gltfLoader = new GLTFLoader();
const audioLoader = new THREE.AudioLoader();
let gunshotSoundBuffer;

const PLAYER_HEIGHT = 1.8;
const FALL_DEATH_Y = -50;

export function initScene(canvas, onAssetsLoaded) {
    try { // Wrap initialization in a try-catch block
        onAssetsLoadedCallback = onAssetsLoaded;

        scene = new THREE.Scene();
        scene.background = new THREE.Color(0x87ceeb); // Sky blue
        scene.fog = new THREE.Fog(0x87ceeb, 50, 500); // Start fog further away

        // Camera
        camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        camera.position.y = PLAYER_HEIGHT; // Initial height guess

        // Renderer
        renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap; // Softer shadows

        // Lighting
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6); // Soft ambient light
        scene.add(ambientLight);

        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8); // Main directional light
        directionalLight.position.set(50, 100, 75); // Position the light source
        directionalLight.castShadow = true;
        // Configure shadow properties
        directionalLight.shadow.mapSize.width = 2048; // Higher resolution shadows
        directionalLight.shadow.mapSize.height = 2048;
        directionalLight.shadow.camera.near = 0.5;
        directionalLight.shadow.camera.far = 300; // Adjust shadow range based on map size
        directionalLight.shadow.camera.left = -150;
        directionalLight.shadow.camera.right = 150;
        directionalLight.shadow.camera.top = 150;
        directionalLight.shadow.camera.bottom = -150;
        directionalLight.shadow.bias = -0.0005; // Adjust shadow bias to prevent artifacts
        scene.add(directionalLight);
        // const shadowHelper = new THREE.CameraHelper( directionalLight.shadow.camera ); scene.add(shadowHelper); // Uncomment to debug shadow camera

        // Audio Listener (required for positional audio)
        listener = new THREE.AudioListener();
        camera.add(listener); // Attach listener to the camera

        loadAssets(); // Start loading map, sounds, etc.

        // Handle window resizing
        window.addEventListener('resize', onWindowResize, false);

        console.log("Three.js scene, camera, renderer, lights initialized.");
        return { scene, camera, renderer }; // Return the created objects

    } catch (e) {
        console.error("!!! Error initializing scene:", e);
        // Optionally display error to user or prevent game from starting
        return null; // Indicate failure
    }
}

function loadAssets() {
    console.log("Starting asset loading...");
    assetLoadManager = new THREE.LoadingManager();

    // Callback when all assets managed by this loader are loaded
    assetLoadManager.onLoad = () => {
        console.log('LoadingManager: All assets loaded successfully!');
        if (onAssetsLoadedCallback && typeof onAssetsLoadedCallback === 'function') {
             console.log("Calling onAssetsLoaded callback.");
             onAssetsLoadedCallback(); // Notify main script that assets are ready
        } else {
            console.warn("onAssetsLoadedCallback not defined or not a function when assets finished loading.");
        }
    };

    // Callback if any asset loading fails
    assetLoadManager.onError = (url) => {
        console.error('LoadingManager: There was an error loading ' + url);
        // Optionally alert user or handle specific asset load errors
    };

    // --- Progress Tracking ---
    let uiModuleLoaded = false; // Track if ui.js has been loaded for progress updates
    let updateLoadingProgressFunc = null;
    // Async function to load ui.js dynamically when progress needs updating
    const tryLoadAndUpdateProgress = async (itemsLoaded, itemsTotal) => {
        if (!uiModuleLoaded) { // Only try to import ui.js once
            try {
                const uiModule = await import('./ui.js'); // Dynamically import ui.js
                updateLoadingProgressFunc = uiModule.updateLoadingProgress; // Get the function
                uiModuleLoaded = true;
                console.log("ui.js module loaded for progress updates.");
            } catch(e) {
                console.error("Failed to import ui.js for progress updates:", e);
                uiModuleLoaded = true; // Prevent further attempts even on error
            }
        }
        // If the function was successfully loaded, call it
        if (updateLoadingProgressFunc) {
            updateLoadingProgressFunc(itemsLoaded / itemsTotal);
        }
    };
    // Assign the progress handler to the LoadingManager
    assetLoadManager.onProgress = (url, itemsLoaded, itemsTotal) => {
        console.log(`LoadingManager: Progress - ${url} (${itemsLoaded}/${itemsTotal})`);
        // Call the async loader/updater function (don't await here, let it run in background)
        tryLoadAndUpdateProgress(itemsLoaded, itemsTotal);
    };
    // --- End Progress Tracking ---


    // Create loaders managed by our LoadingManager
    const gltfLoaderManaged = new GLTFLoader(assetLoadManager);
    const audioLoaderManaged = new THREE.AudioLoader(assetLoadManager);

    // --- Load Map ---
    // *** CRITICAL: Ensure 'map1.glb' exists at the correct path ***
    const mapPath = 'assets/maps/map1.glb';
    console.log(`Attempting to load map: ${mapPath}`);
    gltfLoaderManaged.load(mapPath,
        // Success callback
        (gltf) => {
            environmentMesh = gltf.scene;
            // Configure shadows for all meshes in the map
            environmentMesh.traverse((node) => {
                if (node.isMesh) {
                    node.castShadow = true;
                    node.receiveShadow = true;
                }
            });
            scene.add(environmentMesh); // Add the loaded map to the scene
            console.log("Map loaded successfully.");
        },
        // Progress callback (optional, covered by LoadingManager.onProgress)
        undefined,
        // Error callback
        (error) => {
            console.error(`!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!`);
            console.error(`!!! CRITICAL ERROR LOADING MAP: ${mapPath} !!!`, error);
            console.error(`!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!`);
            // Consider stopping the game or showing a fatal error message
            alert(`Failed to load the game map (${mapPath}). Please check the file path and ensure the file is valid.`);
        }
    );

    // --- Load Gunshot Sound ---
    const soundPath = 'assets/maps/gunshot.wav';
    console.log(`Attempting to load sound: ${soundPath}`);
    audioLoaderManaged.load(soundPath,
        // Success callback
        (buffer) => {
            gunshotSoundBuffer = buffer; // Store the loaded audio buffer
            console.log("Gunshot sound loaded successfully.");
        },
        // Progress callback (optional)
        undefined,
        // Error callback
        (error) => {
            console.error(`!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!`);
            console.error(`!!! ERROR LOADING SOUND: ${soundPath} !!!`, error);
            console.error(`!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!`);
            // Game can likely continue without sound, but log the error
        }
    );

    // NOTE: Character and Gun models are loaded dynamically later when players join

    console.log("Asset loading requests initiated via LoadingManager.");
}


export function addPlayer(playerData) {
    // Defensive checks for valid data
    if (!playerData || !playerData.id || !playerData.position || !playerData.rotation) {
        console.error("addPlayer called with invalid playerData:", playerData);
        return;
    }
    // Check if mesh already exists to prevent duplicates
    if (playerMeshes[playerData.id]) {
         console.warn(`Player mesh already exists for ${playerData.id}. Updating position instead.`);
         updatePlayerPosition(playerData.id, playerData.position, playerData.rotation); // Update existing mesh
         return;
    }

    const modelName = playerData.model || 'Shawty1'; // Default model if not specified
    const modelPath = `assets/maps/${modelName}.glb`;
    console.log(`Adding player ${playerData.name || playerData.id} (${playerData.id}). Loading model: ${modelPath}`);

    // Use the unmanaged loader as this happens outside the initial load sequence
    gltfLoader.load(modelPath,
        // Success callback
        (gltf) => {
            console.log(`Model ${modelPath} loaded for player ${playerData.id}.`);
            const playerMesh = gltf.scene; // The root object of the loaded model
            playerMesh.scale.set(0.5, 0.5, 0.5); // Adjust scale as needed
            playerMesh.position.set(playerData.position.x, playerData.position.y, playerData.position.z);
            playerMesh.rotation.y = playerData.rotation.y || 0; // Set initial Y rotation based on server data
            playerMesh.castShadow = true;
            playerMesh.receiveShadow = false; // Usually looks better if characters don't receive shadows
            playerMesh.userData.id = playerData.id; // Store ID for reference

            // Ensure all parts of the model cast shadows
            playerMesh.traverse((node) => {
                if (node.isMesh) {
                    node.castShadow = true;
                }
            });

            loadAndAttachGun(playerMesh); // Load and attach the gun model

            playerMeshes[playerData.id] = playerMesh; // Store reference to the mesh
            scene.add(playerMesh); // Add the complete player mesh to the scene
            console.log(`Mesh added to scene for ${playerData.id}`);

        },
        // Progress callback (optional)
        undefined,
        // Error callback
        (error) => {
            console.error(`!!! Error loading model ${modelPath} for player ${playerData.id}:`, error);
            // Fallback: Create a simple red cube if model fails to load
            const geometry = new THREE.BoxGeometry(1, PLAYER_HEIGHT, 1);
            const material = new THREE.MeshStandardMaterial({ color: 0xff0000 }); // Red indicates error
            const cube = new THREE.Mesh(geometry, material);
            cube.position.set(playerData.position.x, playerData.position.y, playerData.position.z);
            cube.castShadow = true;
            cube.userData.id = playerData.id;
            playerMeshes[playerData.id] = cube; // Store the fallback mesh
            scene.add(cube);
            console.log(`Added fallback cube for player ${playerData.id}`);
        }
    );
}

function loadAndAttachGun(playerMesh) {
    if (!playerMesh) return; // Safety check

    const gunPath = 'assets/maps/gun2.glb';
    // Use unmanaged loader
    gltfLoader.load(gunPath,
        (gltf) => {
            const gunMesh = gltf.scene;
            gunMesh.scale.set(0.2, 0.2, 0.2); // Adjust scale as needed
            // Adjust position relative to player mesh origin (0,0,0 is player's feet usually)
            gunMesh.position.set(0.3, PLAYER_HEIGHT * 0.4, 0.4); // Fine-tune position (x=right, y=up, z=forward)
            gunMesh.rotation.y = -Math.PI / 2; // Point gun forward relative to player
            gunMesh.castShadow = true;
            // Ensure all parts of gun cast shadows
            gunMesh.traverse((node) => { if (node.isMesh) node.castShadow = true; });

            playerMesh.add(gunMesh); // Attach gun as a child of the player mesh
            playerMesh.userData.gun = gunMesh; // Store reference on player mesh if needed later
            // console.log(`Gun attached to player ${playerMesh.userData.id}`); // Less verbose logging

        },
        undefined, // Progress
        (error) => {
            console.error(`!!! Error loading gun model ${gunPath}:`, error);
            // Gun failing to load is less critical than player model or map
        }
    );
}

export function removePlayer(playerId) {
    const mesh = playerMeshes[playerId];
    if (mesh) {
        console.log(`Removing mesh and resources for player ${playerId}`);
        // Recursively remove children and dispose resources if possible
        while(mesh.children.length > 0){
            const child = mesh.children[0];
            // If child is a gun or other complex object, dispose its resources too
            // disposeEffect(child); // Assuming disposeEffect handles geometries/materials
            mesh.remove(child);
        }
        scene.remove(mesh); // Remove player mesh from scene
        disposeEffect(mesh); // Attempt to dispose player mesh resources
        delete playerMeshes[playerId]; // Remove reference
    } else {
        console.warn(`Tried to remove non-existent player mesh: ${playerId}`);
    }
}

export function updatePlayerPosition(playerId, position, rotation) {
    const mesh = playerMeshes[playerId];
    // Check if mesh exists and position/rotation data is valid
    if (mesh && position && rotation) {
        mesh.position.set(position.x, position.y, position.z);
        // Only apply Y rotation from server for player body orientation
        // Camera rotation (pitch/X) is handled client-side by PointerLockControls
        mesh.rotation.y = rotation.y;
    } else if (!mesh) {
        // Avoid spamming console if mesh isn't ready yet (e.g., model still loading)
        // console.warn(`Tried to update non-existent mesh for player ${playerId}`);
    } else if (!position || !rotation) {
         console.warn(`Invalid position/rotation data received for player ${playerId}`, position, rotation);
    }
}

// --- Getters ---
export function getPlayerMesh(playerId) { return playerMeshes[playerId]; }
export function getCamera() { return camera; }
export function getScene() { return scene; }
export function getEnvironmentMeshes() {
    // Return array containing the main environment mesh for collisions
    // Could be expanded later to include other static collidable objects
    return environmentMesh ? [environmentMesh] : [];
}

// --- Audio Playback ---
export function playGunshotSound(position) {
    if (!gunshotSoundBuffer || !listener || !position) {
         console.warn("Cannot play gunshot sound: buffer, listener or position missing.");
         return;
    }
    // Ensure listener is correctly attached to the camera
    if (!camera.children.includes(listener)) {
        console.warn("Audio listener not attached to camera, attaching now.");
        camera.add(listener);
    }

    const sound = new THREE.PositionalAudio(listener); // Create 3D sound source
    sound.setBuffer(gunshotSoundBuffer);
    sound.setRefDistance(20); // Distance where volume starts dropping
    sound.setRolloffFactor(1); // How fast volume drops
    sound.setVolume(0.5); // Adjust volume

    // Add sound directly to the scene at the calculated position
    // This avoids potential issues with temporary parent objects not cleaning up
    scene.add(sound);
    sound.position.copy(position); // Set position *after* adding to scene
    sound.play(); // Play the sound

    // Automatically remove the sound object from the scene once it finishes playing
    sound.onEnded = () => {
        sound.isPlaying = false; // Three.js internal flag
        if (sound.parent) {
            sound.parent.remove(sound); // Remove from scene/parent
        }
        // console.log("Gunshot sound finished and removed."); // Less verbose log
    };
}

// --- Visual Effects ---
export function createDeathExplosion(position) {
    if (!position) {
        console.error("createDeathExplosion called without position");
        return []; // Return empty array if no position
    }
    console.log("Creating death explosion effect at:", position);
    const effects = []; // Array to hold created effect objects

    // Particle System
    const particleCount = 100;
    const particles = new THREE.BufferGeometry();
    const pMaterial = new THREE.PointsMaterial({ color: 0xFF4500, size: 0.5, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false });
    const pVertices = []; const velocities = [];
    for (let i = 0; i < particleCount; i++) {
        pVertices.push(position.x, position.y + PLAYER_HEIGHT / 2, position.z); // Start near player center
        const theta = Math.random() * Math.PI * 2; const phi = Math.acos(2 * Math.random() - 1); const speed = 5 + Math.random() * 10;
        velocities.push( speed * Math.sin(phi) * Math.cos(theta), speed * Math.cos(phi) + 3, speed * Math.sin(phi) * Math.sin(theta) ); // Add upward bias
    }
    particles.setAttribute('position', new THREE.Float32BufferAttribute(pVertices, 3));
    const particleSystem = new THREE.Points(particles, pMaterial);
    particleSystem.userData.velocities = velocities; particleSystem.userData.life = 1.0; // Lifetime in seconds
    particleSystem.userData.update = (delta) => updateParticleSystem(particleSystem, delta); // Assign update function
    particleSystem.userData.dispose = () => disposeEffect(particleSystem); // Assign dispose function
    scene.add(particleSystem);
    effects.push(particleSystem); // Add to effects array

    // Shockwave Ring
    const shockwaveGeometry = new THREE.RingGeometry(0.1, 1, 64); // innerRadius, outerRadius, segments
    const shockwaveMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, transparent: true, opacity: 0.8 });
    const shockwave = new THREE.Mesh(shockwaveGeometry, shockwaveMaterial);
    shockwave.position.copy(position); shockwave.position.y += 0.1; // Slightly above ground
    shockwave.rotation.x = -Math.PI / 2; // Lay flat on XZ plane
    shockwave.userData.life = 0.5; // Short lifespan
    shockwave.userData.maxRadius = 25; // How far it expands
    shockwave.userData.update = (delta) => updateShockwave(shockwave, delta); // Assign update function
    shockwave.userData.dispose = () => disposeEffect(shockwave); // Assign dispose function
    scene.add(shockwave);
    effects.push(shockwave); // Add to effects array

    return effects; // Return array of effect objects
}

// Update function for particle systems
function updateParticleSystem(system, deltaTime) {
    // Safety checks for necessary properties
    if (!system?.userData || !system.geometry?.attributes?.position || !system.material) return false;

    system.userData.life -= deltaTime; // Decrease lifetime
    if (system.userData.life <= 0) return false; // Signal for removal

    const positions = system.geometry.attributes.position.array;
    const velocities = system.userData.velocities;
    const gravity = -9.8 * 2; // Gravity effect

    for (let i = 0; i < positions.length / 3; i++) {
        // Apply gravity to Y velocity
        velocities[i * 3 + 1] += gravity * deltaTime;
        // Update positions based on velocity
        positions[i * 3] += velocities[i * 3] * deltaTime;
        positions[i * 3 + 1] += velocities[i * 3 + 1] * deltaTime;
        positions[i * 3 + 2] += velocities[i * 3 + 2] * deltaTime;
    }
    // Fade out material based on remaining life
    system.material.opacity = Math.max(0, system.userData.life);
    // Mark position buffer as needing update for WebGL
    system.geometry.attributes.position.needsUpdate = true;
    return true; // Still active
}

// Update function for shockwave ring
function updateShockwave(wave, deltaTime) {
    // Safety checks for necessary properties
    if (!wave?.userData || !wave.geometry || !wave.material) return false;

    wave.userData.life -= deltaTime; // Decrease lifetime
    if (wave.userData.life <= 0) return false; // Signal for removal

    // Calculate expansion progress (0 to 1)
    const progress = 1 - (wave.userData.life / 0.5);
    const currentRadius = progress * wave.userData.maxRadius; // Expand radius
    const innerRadius = Math.max(0.1, currentRadius - 2); // Keep some thickness

    // Recreate ring geometry (less efficient than shaders, but simpler)
    wave.geometry.dispose(); // Dispose old geometry first!
    wave.geometry = new THREE.RingGeometry(innerRadius, currentRadius, 64);
    // Fade out material based on progress
    wave.material.opacity = Math.max(0, 1 - progress);
    return true; // Still active
}

// General function to dispose Three.js object resources
function disposeEffect(effect) {
     if (!effect) return;
     try {
        // Remove from parent (usually the scene)
        if (effect.parent) { effect.parent.remove(effect); }
        // Dispose geometry
        if (effect.geometry) effect.geometry.dispose();
        // Dispose material(s) and texture(s)
        if (effect.material) {
            if (Array.isArray(effect.material)) { // Handle multi-materials
                effect.material.forEach(m => {
                    if (m.map) m.map.dispose(); // Dispose texture
                    m.dispose(); // Dispose material
                });
            } else { // Handle single material
                 if (effect.material.map) effect.material.map.dispose(); // Dispose texture
                 effect.material.dispose(); // Dispose material
            }
        }
        // Recursively dispose children if any (though effects usually don't have complex children)
        while(effect.children.length > 0) {
            disposeEffect(effect.children[0]);
        }
        // console.log("Disposed effect object."); // Less verbose log
     } catch (e) {
         // Log errors during disposal but don't crash
         console.error("Error during effect disposal:", e, effect);
     }
}

// Update function called from main loop for active effects
export function updateEffect(effect, deltaTime) {
    // Check if the effect object has our custom update function
    if (effect?.userData && typeof effect.userData.update === 'function') {
        const isActive = effect.userData.update(deltaTime); // Call the effect's specific update logic
        // If the update function returns false (indicating finished), call its dispose function
        if (!isActive && typeof effect.userData.dispose === 'function') {
             effect.userData.dispose();
        }
        return isActive; // Return whether the effect is still active
    }
    // If no update function, log warning and consider it inactive
    console.warn("Attempted to update effect without a userData.update function:", effect);
    if(effect?.userData?.dispose) effect.userData.dispose(); // Try to dispose anyway
    return false;
}

// --- Window Resize Handler ---
function onWindowResize() {
    if (camera && renderer) { // Ensure components exist
        // Update camera aspect ratio
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix(); // Apply aspect ratio change
        // Update renderer size
        renderer.setSize(window.innerWidth, window.innerHeight);
        console.log("Window resized, camera and renderer updated.");
    }
}

// --- Exports ---
export { FALL_DEATH_Y, PLAYER_HEIGHT }; // Export constants for use elsewhere
