// docs/js/scene.js
import * as THREE from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.module.js'; // Using CDN URL
import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/jsm/loaders/GLTFLoader.js'; // Using CDN URL

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

    // *** ADD async HERE ***
    assetLoadManager.onProgress = async (url, itemsLoaded, itemsTotal) => {
        console.log('Loading file: ' + url + '.\nLoaded ' + itemsLoaded + ' of ' + itemsTotal + ' files.');
         // Update loading progress UI using the imported function
         try {
            // Now await is allowed because the function is async
            const { updateLoadingProgress } = await import('./ui.js');
            updateLoadingProgress(itemsLoaded / itemsTotal);
         } catch(e) { console.error("Failed to import or call updateLoadingProgress", e); }
    };
    // *** END CHANGE ***

    const gltfLoaderManaged = new GLTFLoader(assetLoadManager);
    const audioLoaderManaged = new THREE.AudioLoader(assetLoadManager);

    // Load Map (Make sure your map file is named map1.glb)
    gltfLoaderManaged.load('assets/maps/map1.glb', (gltf) => {
        environmentMesh = gltf.scene;
        environmentMesh.traverse((node) => {
            if (node.isMesh) {
                node.castShadow = true;
                node.receiveShadow = true;
            }
        });
        scene.add(environmentMesh);
        console.log("Map loaded.");
    }, undefined, (error) => console.error("Error loading map:", error));

    // Load Sounds
    audioLoaderManaged.load('assets/maps/gunshot.wav', (buffer) => {
        gunshotSoundBuffer = buffer;
        console.log("Gunshot sound loaded.");
    }, undefined, (error) => console.error("Error loading gunshot sound:", error));
}

export function addPlayer(playerData) {
    if (playerMeshes[playerData.id]) {
         console.warn(`Player mesh already exists for ${playerData.id}. Skipping add.`);
         updatePlayerPosition(playerData.id, playerData.position, playerData.rotation);
         return;
    }

    console.log(`Adding player ${playerData.name} (${playerData.id}) to scene`);
    gltfLoader.load(`assets/maps/${playerData.model || 'Shawty1'}.glb`, (gltf) => {
        const playerMesh = gltf.scene;
        playerMesh.scale.set(0.5, 0.5, 0.5);
        playerMesh.position.set(playerData.position.x, playerData.position.y, playerData.position.z);
        playerMesh.rotation.y = playerData.rotation?.y || 0;
        playerMesh.castShadow = true;
        playerMesh.receiveShadow = true;
        playerMesh.userData.id = playerData.id;

        playerMesh.traverse((node) => {
            if (node.isMesh) {
                node.castShadow = true;
            }
        });

        loadAndAttachGun(playerMesh); // Attach gun
        playerMeshes[playerData.id] = playerMesh;
        scene.add(playerMesh);
        console.log(`Mesh added for ${playerData.id}`);
    }, undefined, (error) => {
        console.error(`Error loading model for player ${playerData.id}:`, error);
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
    gltfLoader.load('assets/maps/gun2.glb', (gltf) => {
        const gunMesh = gltf.scene;
        gunMesh.scale.set(0.2, 0.2, 0.2);
        gunMesh.position.set(0.3, PLAYER_HEIGHT * 0.4, 0.5);
        gunMesh.rotation.y = -Math.PI / 2;
        gunMesh.castShadow = true;
        gunMesh.traverse((node) => { if (node.isMesh) node.castShadow = true; });
        playerMesh.add(gunMesh);
        playerMesh.userData.gun = gunMesh;
        console.log(`Gun attached to player ${playerMesh.userData.id}`);
    }, undefined, (error) => console.error("Error loading gun model:", error));
}

export function removePlayer(playerId) {
    const mesh = playerMeshes[playerId];
    if (mesh) {
        scene.remove(mesh);
        // TODO: Proper disposal
        delete playerMeshes[playerId];
        console.log(`Removed mesh for player ${playerId}`);
    }
}

export function updatePlayerPosition(playerId, position, rotation) {
    const mesh = playerMeshes[playerId];
    if (mesh) {
        mesh.position.set(position.x, position.y, position.z);
        mesh.rotation.y = rotation.y;
    } else {
        console.warn(`Tried to update non-existent mesh for player ${playerId}`);
    }
}

export function getPlayerMesh(playerId) { return playerMeshes[playerId]; }
export function getCamera() { return camera; }
export function getScene() { return scene; }
export function getEnvironmentMeshes() { return environmentMesh ? [environmentMesh] : []; }

export function playGunshotSound(position) {
    if (!gunshotSoundBuffer || !listener) return;
    const sound = new THREE.PositionalAudio(listener);
    sound.setBuffer(gunshotSoundBuffer);
    sound.setRefDistance(20);
    sound.setRolloffFactor(1);
    sound.setVolume(0.5);
    const soundObject = new THREE.Object3D();
    soundObject.position.copy(position);
    scene.add(soundObject);
    soundObject.add(sound);
    sound.play();
    sound.onEnded = () => {
        sound.isPlaying = false;
        if(soundObject.parent) { soundObject.remove(sound); scene.remove(soundObject); }
    };
}

export function createDeathExplosion(position) {
    const particleCount = 100;
    const particles = new THREE.BufferGeometry();
    const pMaterial = new THREE.PointsMaterial({ color: 0xFF4500, size: 0.5, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false });
    const pVertices = []; const velocities = [];
    for (let i = 0; i < particleCount; i++) {
        pVertices.push(position.x, position.y + PLAYER_HEIGHT / 2, position.z);
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
    system.userData.life -= deltaTime;
    if (system.userData.life <= 0) return false;
    const positions = system.geometry.attributes.position.array; const velocities = system.userData.velocities; const gravity = -9.8 * 2;
    for (let i = 0; i < positions.length / 3; i++) {
        velocities[i * 3 + 1] += gravity * deltaTime;
        positions[i * 3] += velocities[i * 3] * deltaTime; positions[i * 3 + 1] += velocities[i * 3 + 1] * deltaTime; positions[i * 3 + 2] += velocities[i * 3 + 2] * deltaTime;
    }
    system.material.opacity = Math.max(0, system.userData.life); system.geometry.attributes.position.needsUpdate = true;
    return true;
}

function updateShockwave(wave, deltaTime) {
    wave.userData.life -= deltaTime;
    if (wave.userData.life <= 0) return false;
    const progress = 1 - (wave.userData.life / 0.5); const currentRadius = progress * wave.userData.maxRadius; const innerRadius = Math.max(0.1, currentRadius - 2);
    wave.geometry.dispose(); wave.geometry = new THREE.RingGeometry(innerRadius, currentRadius, 64); wave.material.opacity = Math.max(0, 1 - progress);
    return true;
}

function disposeEffect(effect) {
     if (effect.parent) { effect.parent.remove(effect); }
     if (effect.geometry) effect.geometry.dispose();
     if (effect.material) { if (effect.material.map) effect.material.map.dispose(); effect.material.dispose(); }
     // console.log("Disposed effect"); // Optional log
}

export function updateEffect(effect, deltaTime) {
    if (effect.userData && typeof effect.userData.update === 'function') {
        const isActive = effect.userData.update(deltaTime);
        if (!isActive && typeof effect.userData.dispose === 'function') { effect.userData.dispose(); }
        return isActive;
    }
    return false;
}

function onWindowResize() {
    if (camera && renderer) {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    }
}

export { FALL_DEATH_Y, PLAYER_HEIGHT };
