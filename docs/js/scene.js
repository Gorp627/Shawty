// docs/js/scene.js
import * as THREE from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.module.js'; // Using CDN URL
import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/jsm/loaders/GLTFLoader.js'; // Using CDN URL

let scene, camera, renderer, listener; // Removed soundListener - not used
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
    onAssetsLoadedCallback = onAssetsLoaded;

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87ceeb);
    scene.fog = new THREE.Fog(0x87ceeb, 50, 500); // Adjusted fog start

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.y = PLAYER_HEIGHT;

    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap; // Softer shadows

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(50, 100, 75); // Adjusted light position
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    directionalLight.shadow.camera.near = 0.5;
    directionalLight.shadow.camera.far = 300; // Adjusted shadow camera range
    directionalLight.shadow.camera.left = -150;
    directionalLight.shadow.camera.right = 150;
    directionalLight.shadow.camera.top = 150;
    directionalLight.shadow.camera.bottom = -150;
    scene.add(directionalLight);
    // const shadowHelper = new THREE.CameraHelper( directionalLight.shadow.camera ); scene.add(shadowHelper); // Debug

    // Audio Listener
    listener = new THREE.AudioListener();
    camera.add(listener);

    loadAssets(); // Start loading assets

    window.addEventListener('resize', onWindowResize, false);

    console.log("Three.js scene, camera, renderer, lights initialized.");
    return { scene, camera, renderer };
}

function loadAssets() {
    console.log("Starting asset loading...");
    assetLoadManager = new THREE.LoadingManager();
    assetLoadManager.onLoad = () => {
        console.log('LoadingManager: All assets loaded successfully!');
        if (onAssetsLoadedCallback) {
             console.log("Calling onAssetsLoaded callback.");
             onAssetsLoadedCallback();
        } else {
            console.warn("onAssetsLoadedCallback not defined when assets finished loading.");
        }
    };
    assetLoadManager.onError = (url) => {
        console.error('LoadingManager: There was an error loading ' + url);
    };

    let uiModuleLoaded = false; // Track if ui.js has been loaded
    let updateLoadingProgressFunc = null;

    // Define async function separately to load ui.js once
    const tryLoadAndUpdateProgress = async (itemsLoaded, itemsTotal) => {
        if (!uiModuleLoaded) {
            try {
                const uiModule = await import('./ui.js');
                updateLoadingProgressFunc = uiModule.updateLoadingProgress;
                uiModuleLoaded = true;
                console.log("ui.js module loaded for progress updates.");
            } catch(e) {
                console.error("Failed to import ui.js:", e);
                uiModuleLoaded = true; // Prevent further attempts even on error
            }
        }
        if (updateLoadingProgressFunc) {
            updateLoadingProgressFunc(itemsLoaded / itemsTotal);
        }
    };

    assetLoadManager.onProgress = (url, itemsLoaded, itemsTotal) => {
        console.log(`LoadingManager: Progress - ${url} (${itemsLoaded}/${itemsTotal})`);
        // Call the async loader/updater function without awaiting it here
        tryLoadAndUpdateProgress(itemsLoaded, itemsTotal);
    };

    const gltfLoaderManaged = new GLTFLoader(assetLoadManager);
    const audioLoaderManaged = new THREE.AudioLoader(assetLoadManager);

    // --- Load Map ---
    // *** IMPORTANT: Make sure your map file is ACTUALLY named 'map1.glb' ***
    const mapPath = 'assets/maps/map1.glb';
    console.log(`Attempting to load map: ${mapPath}`);
    gltfLoaderManaged.load(mapPath, (gltf) => {
        environmentMesh = gltf.scene;
        environmentMesh.traverse((node) => {
            if (node.isMesh) {
                node.castShadow = true;
                node.receiveShadow = true;
            }
        });
        scene.add(environmentMesh);
        console.log("Map loaded successfully.");
    }, undefined, (error) => {
         console.error(`!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!`);
         console.error(`!!! ERROR LOADING MAP: ${mapPath} !!!`, error);
         console.error(`!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!`);
         // Maybe display an error to the user that the map failed?
    });

    // --- Load Gunshot Sound ---
    const soundPath = 'assets/maps/gunshot.wav';
    console.log(`Attempting to load sound: ${soundPath}`);
    audioLoaderManaged.load(soundPath, (buffer) => {
        gunshotSoundBuffer = buffer;
        console.log("Gunshot sound loaded successfully.");
    }, undefined, (error) => {
        console.error(`!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!`);
        console.error(`!!! ERROR LOADING SOUND: ${soundPath} !!!`, error);
        console.error(`!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!`);
    });

    // NOTE: Character and Gun models are loaded dynamically in addPlayer / loadAndAttachGun
    console.log("Asset loading requests initiated.");
}


export function addPlayer(playerData) {
    // Defensive check for existing mesh
    if (playerMeshes[playerData.id]) {
         console.warn(`Player mesh already exists for ${playerData.id}. Updating position instead.`);
         updatePlayerPosition(playerData.id, playerData.position, playerData.rotation);
         return;
    }
    // Defensive check for necessary data
    if (!playerData || !playerData.id || !playerData.position || !playerData.rotation) {
        console.error("addPlayer called with invalid playerData:", playerData);
        return;
    }

    const modelName = playerData.model || 'Shawty1';
    const modelPath = `assets/maps/${modelName}.glb`;
    console.log(`Adding player ${playerData.name || 'N/A'} (${playerData.id}). Loading model: ${modelPath}`);

    gltfLoader.load(modelPath, (gltf) => {
        console.log(`Model ${modelPath} loaded for player ${playerData.id}.`);
        const playerMesh = gltf.scene;
        playerMesh.scale.set(0.5, 0.5, 0.5);
        playerMesh.position.set(playerData.position.x, playerData.position.y, playerData.position.z);
        playerMesh.rotation.y = playerData.rotation.y || 0; // Ensure rotation Y is set
        playerMesh.castShadow = true;
        playerMesh.receiveShadow = false; // Characters usually don't receive shadows well
        playerMesh.userData.id = playerData.id;

        playerMesh.traverse((node) => {
            if (node.isMesh) {
                node.castShadow = true;
            }
        });

        loadAndAttachGun(playerMesh); // Attach gun

        playerMeshes[playerData.id] = playerMesh;
        scene.add(playerMesh);
        console.log(`Mesh added to scene for ${playerData.id}`);

    }, undefined, (error) => {
        console.error(`!!! Error loading model ${modelPath} for player ${playerData.id}:`, error);
        // Fallback Cube Creation
        const geometry = new THREE.BoxGeometry(1, PLAYER_HEIGHT, 1);
        const material = new THREE.MeshStandardMaterial({ color: 0xff0000 }); // Red cube for error
        const cube = new THREE.Mesh(geometry, material);
        cube.position.set(playerData.position.x, playerData.position.y, playerData.position.z);
        cube.castShadow = true;
        cube.userData.id = playerData.id;
        playerMeshes[playerData.id] = cube; // Store the fallback
        scene.add(cube);
        console.log(`Added fallback cube for player ${playerData.id}`);
    });
}

function loadAndAttachGun(playerMesh) {
    const gunPath = 'assets/maps/gun2.glb';
    gltfLoader.load(gunPath, (gltf) => {
        const gunMesh = gltf.scene;
        gunMesh.scale.set(0.2, 0.2, 0.2);
        // Fine-tune position relative to player origin (0,0,0)
        gunMesh.position.set(0.3, PLAYER_HEIGHT * 0.4, 0.4); // Slightly adjusted Z
        gunMesh.rotation.y = -Math.PI / 2; // Point forward
        gunMesh.castShadow = true;
        gunMesh.traverse((node) => { if (node.isMesh) node.castShadow = true; });

        playerMesh.add(gunMesh); // Add gun as child of player mesh
        playerMesh.userData.gun = gunMesh; // Store reference
        // console.log(`Gun attached to player ${playerMesh.userData.id}`); // Less verbose log

    }, undefined, (error) => {
        console.error(`!!! Error loading gun model ${gunPath}:`, error);
    });
}

export function removePlayer(playerId) {
    const mesh = playerMeshes[playerId];
    if (mesh) {
        console.log(`Removing mesh for player ${playerId}`);
        // Remove children (like the gun) first
        while(mesh.children.length > 0){
            const child = mesh.children[0];
            // Optionally dispose child resources here if needed
            mesh.remove(child);
        }
        scene.remove(mesh); // Remove player mesh itself
        // TODO: Proper disposal of geometries/materials of the player mesh itself
        delete playerMeshes[playerId];
    } else {
        console.warn(`Tried to remove non-existent player mesh: ${playerId}`);
    }
}

export function updatePlayerPosition(playerId, position, rotation) {
    const mesh = playerMeshes[playerId];
    if (mesh && position && rotation) { // Add checks for valid data
        mesh.position.set(position.x, position.y, position.z);
        mesh.rotation.y = rotation.y;
    } else if (!mesh) {
        // Don't warn every frame, maybe only once?
        // console.warn(`Tried to update non-existent mesh for player ${playerId}`);
    } else if (!position || !rotation) {
         console.warn(`Invalid position/rotation data for player ${playerId}`, position, rotation);
    }
}

export function getPlayerMesh(playerId) { return playerMeshes[playerId]; }
export function getCamera() { return camera; }
export function getScene() { return scene; }
export function getEnvironmentMeshes() { return environmentMesh ? [environmentMesh] : []; }

export function playGunshotSound(position) {
    if (!gunshotSoundBuffer || !listener || !position) {
         console.warn("Cannot play gunshot sound: buffer, listener or position missing.");
         return;
    }
    // Ensure listener is attached to the camera for correct 3D audio
    if (!camera.children.includes(listener)) {
        camera.add(listener);
    }

    const sound = new THREE.PositionalAudio(listener);
    sound.setBuffer(gunshotSoundBuffer);
    sound.setRefDistance(20);
    sound.setRolloffFactor(1);
    sound.setVolume(0.5); // Adjust volume as needed

    // Add sound directly to the scene at the position
    // Using a temporary object can sometimes cause cleanup issues
    scene.add(sound);
    sound.position.copy(position); // Set position *after* adding to scene
    sound.play();

    // Auto-remove sound when finished playing
    sound.onEnded = () => {
        sound.isPlaying = false;
        if (sound.parent) {
            sound.parent.remove(sound);
        }
        // console.log("Gunshot sound finished and removed."); // Less verbose
    };
}


export function createDeathExplosion(position) {
    if (!position) {
        console.error("createDeathExplosion called without position");
        return [];
    }
    console.log("Creating death explosion at:", position);
    const particleCount = 100;
    const particles = new THREE.BufferGeometry();
    const pMaterial = new THREE.PointsMaterial({ color: 0xFF4500, size: 0.5, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false });
    const pVertices = []; const velocities = [];
    for (let i = 0; i < particleCount; i++) {
        pVertices.push(position.x, position.y + PLAYER_HEIGHT / 2, position.z); // Start near center
        const theta = Math.random() * Math.PI * 2; const phi = Math.acos(2 * Math.random() - 1); const speed = 5 + Math.random() * 10;
        velocities.push( speed * Math.sin(phi) * Math.cos(theta), speed * Math.cos(phi) + 3, speed * Math.sin(phi) * Math.sin(theta) );
    }
    particles.setAttribute('position', new THREE.Float32BufferAttribute(pVertices, 3));
    const particleSystem = new THREE.Points(particles, pMaterial);
    particleSystem.userData.velocities = velocities; particleSystem.userData.life = 1.0;
    particleSystem.userData.update = (delta) => updateParticleSystem(particleSystem, delta); particleSystem.userData.dispose = () => disposeEffect(particleSystem);
    scene.add(particleSystem);

    const shockwaveGeometry = new THREE.RingGeometry(0.1, 1, 64);
    const shockwaveMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, transparent: true, opacity: 0.8 });
    const shockwave = new THREE.Mesh(shockwaveGeometry, shockwaveMaterial);
    shockwave.position.copy(position); shockwave.position.y += 0.1; shockwave.rotation.x = -Math.PI / 2;
    shockwave.userData.life = 0.5; shockwave.userData.maxRadius = 25;
    shockwave.userData.update = (delta) => updateShockwave(shockwave, delta); shockwave.userData.dispose = () => disposeEffect(shockwave);
    scene.add(shockwave);

    return [particleSystem, shockwave];
}

function updateParticleSystem(system, deltaTime) {
    if (!system?.userData || !system.geometry?.attributes?.position) return false; // Safety checks
    system.userData.life -= deltaTime;
    if (system.userData.life <= 0) return false; // Signal for removal
    const positions = system.geometry.attributes.position.array; const velocities = system.userData.velocities; const gravity = -9.8 * 2;
    for (let i = 0; i < positions.length / 3; i++) {
        velocities[i * 3 + 1] += gravity * deltaTime;
        positions[i * 3] += velocities[i * 3] * deltaTime; positions[i * 3 + 1] += velocities[i * 3 + 1] * deltaTime; positions[i * 3 + 2] += velocities[i * 3 + 2] * deltaTime;
    }
    if(system.material) system.material.opacity = Math.max(0, system.userData.life); // Check material exists
    system.geometry.attributes.position.needsUpdate = true;
    return true; // Still active
}

function updateShockwave(wave, deltaTime) {
    if (!wave?.userData || !wave.geometry || !wave.material) return false; // Safety checks
    wave.userData.life -= deltaTime;
    if (wave.userData.life <= 0) return false; // Signal for removal
    const progress = 1 - (wave.userData.life / 0.5); const currentRadius = progress * wave.userData.maxRadius; const innerRadius = Math.max(0.1, currentRadius - 2);
    // Avoid recreating geometry if possible, but this is simpler for now
    wave.geometry.dispose();
    wave.geometry = new THREE.RingGeometry(innerRadius, currentRadius, 64);
    wave.material.opacity = Math.max(0, 1 - progress);
    return true; // Still active
}

function disposeEffect(effect) {
     if (!effect) return;
     try {
        if (effect.parent) { effect.parent.remove(effect); }
        if (effect.geometry) effect.geometry.dispose();
        if (effect.material) {
            if (Array.isArray(effect.material)) {
                effect.material.forEach(m => { if (m.map) m.map.dispose(); m.dispose(); });
            } else {
                 if (effect.material.map) effect.material.map.dispose();
                 effect.material.dispose();
            }
        }
        // console.log("Disposed effect");
     } catch (e) {
         console.error("Error during effect disposal:", e, effect);
     }
}

export function updateEffect(effect, deltaTime) {
    if (effect?.userData && typeof effect.userData.update === 'function') {
        const isActive = effect.userData.update(deltaTime);
        // Only dispose if update function signals it's done (returns false)
        if (!isActive && typeof effect.userData.dispose === 'function') {
             effect.userData.dispose();
        }
        return isActive; // Return status from update function
    }
    console.warn("Attempted to update effect without update function:", effect);
    return false; // Cannot update, treat as inactive
}


function onWindowResize() {
    if (camera && renderer) {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
        console.log("Window resized."); // Log resize
    }
}

export { FALL_DEATH_Y, PLAYER_HEIGHT };
