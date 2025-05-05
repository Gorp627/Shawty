// docs/js/scene.js
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.module.js'; // Using jsdelivr URL
import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/jsm/loaders/GLTFLoader.js'; // Keep jsdelivr URL

let scene, camera, renderer, listener;
let playerMeshes = {};
let environmentMesh;
let assetLoadManager;
let onAssetsLoadedCallback;

const gltfLoader = new GLTFLoader();
const audioLoader = new THREE.AudioLoader();
let gunshotSoundBuffer;

const PLAYER_HEIGHT = 1.8;
const FALL_DEATH_Y = -50;

export function initScene(canvas, onAssetsLoaded) {
    try { // Wrap init in try-catch
        onAssetsLoadedCallback = onAssetsLoaded;

        scene = new THREE.Scene();
        scene.background = new THREE.Color(0x87ceeb);
        scene.fog = new THREE.Fog(0x87ceeb, 50, 500);

        camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        camera.position.y = PLAYER_HEIGHT;

        renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;

        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        scene.add(ambientLight);
        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(50, 100, 75);
        directionalLight.castShadow = true;
        directionalLight.shadow.mapSize.width = 2048; directionalLight.shadow.mapSize.height = 2048;
        directionalLight.shadow.camera.near = 0.5; directionalLight.shadow.camera.far = 300;
        directionalLight.shadow.camera.left = -150; directionalLight.shadow.camera.right = 150;
        directionalLight.shadow.camera.top = 150; directionalLight.shadow.camera.bottom = -150;
        scene.add(directionalLight);

        listener = new THREE.AudioListener();
        camera.add(listener);

        loadAssets();

        window.addEventListener('resize', onWindowResize, false);
        console.log("Three.js scene components initialized.");
        return { scene, camera, renderer };

    } catch (e) {
        console.error("Error initializing scene:", e);
        return null; // Indicate failure
    }
}

function loadAssets() {
    console.log("Starting asset loading...");
    assetLoadManager = new THREE.LoadingManager();
    assetLoadManager.onLoad = () => {
        console.log('LoadingManager: All assets loaded successfully!');
        if (onAssetsLoadedCallback) {
             console.log("Calling onAssetsLoaded callback.");
             onAssetsLoadedCallback();
        }
    };
    assetLoadManager.onError = (url) => {
        console.error('LoadingManager: Error loading asset ' + url);
    };

    let uiModuleLoaded = false;
    let updateLoadingProgressFunc = null;
    const tryLoadAndUpdateProgress = async (itemsLoaded, itemsTotal) => {
        if (!uiModuleLoaded) {
            try {
                const uiModule = await import('./ui.js');
                updateLoadingProgressFunc = uiModule.updateLoadingProgress;
                uiModuleLoaded = true;
            } catch(e) {
                console.error("Failed to import ui.js for progress:", e);
                uiModuleLoaded = true; // Prevent re-try
            }
        }
        if (updateLoadingProgressFunc) {
            updateLoadingProgressFunc(itemsLoaded / itemsTotal);
        }
    };

    assetLoadManager.onProgress = (url, itemsLoaded, itemsTotal) => {
        console.log(`LoadingManager: Progress - ${url} (${itemsLoaded}/${itemsTotal})`);
        tryLoadAndUpdateProgress(itemsLoaded, itemsTotal);
    };

    const gltfLoaderManaged = new GLTFLoader(assetLoadManager);
    const audioLoaderManaged = new THREE.AudioLoader(assetLoadManager);

    const mapPath = 'assets/maps/map1.glb';
    console.log(`Attempting to load map: ${mapPath}`);
    gltfLoaderManaged.load(mapPath, (gltf) => {
        environmentMesh = gltf.scene;
        environmentMesh.traverse((node) => { if (node.isMesh) { node.castShadow = true; node.receiveShadow = true; }});
        scene.add(environmentMesh);
        console.log("Map loaded successfully.");
    }, undefined, (error) => console.error(`!!! ERROR LOADING MAP: ${mapPath} !!!`, error));

    const soundPath = 'assets/maps/gunshot.wav';
    console.log(`Attempting to load sound: ${soundPath}`);
    audioLoaderManaged.load(soundPath, (buffer) => {
        gunshotSoundBuffer = buffer;
        console.log("Gunshot sound loaded successfully.");
    }, undefined, (error) => console.error(`!!! ERROR LOADING SOUND: ${soundPath} !!!`, error));

    console.log("Asset loading requests initiated.");
}

// ... (rest of scene.js remains the same as provided in the previous good version: addPlayer, loadAndAttachGun, removePlayer, updatePlayerPosition, getters, playGunshotSound, createDeathExplosion, update/dispose effects, onWindowResize, exports) ...
// [Make sure to copy the rest of scene.js from the previous response here]
export function addPlayer(playerData) {
    if (playerMeshes[playerData.id]) { console.warn(`Player mesh already exists for ${playerData.id}. Updating position instead.`); updatePlayerPosition(playerData.id, playerData.position, playerData.rotation); return; }
    if (!playerData || !playerData.id || !playerData.position || !playerData.rotation) { console.error("addPlayer called with invalid playerData:", playerData); return; }
    const modelName = playerData.model || 'Shawty1'; const modelPath = `assets/maps/${modelName}.glb`;
    console.log(`Adding player ${playerData.name || 'N/A'} (${playerData.id}). Loading model: ${modelPath}`);
    gltfLoader.load(modelPath, (gltf) => {
        console.log(`Model ${modelPath} loaded for player ${playerData.id}.`); const playerMesh = gltf.scene; playerMesh.scale.set(0.5, 0.5, 0.5); playerMesh.position.set(playerData.position.x, playerData.position.y, playerData.position.z); playerMesh.rotation.y = playerData.rotation.y || 0; playerMesh.castShadow = true; playerMesh.receiveShadow = false; playerMesh.userData.id = playerData.id;
        playerMesh.traverse((node) => { if (node.isMesh) { node.castShadow = true; } });
        loadAndAttachGun(playerMesh); playerMeshes[playerData.id] = playerMesh; scene.add(playerMesh); console.log(`Mesh added to scene for ${playerData.id}`);
    }, undefined, (error) => {
        console.error(`!!! Error loading model ${modelPath} for player ${playerData.id}:`, error); const geometry = new THREE.BoxGeometry(1, PLAYER_HEIGHT, 1); const material = new THREE.MeshStandardMaterial({ color: 0xff0000 }); const cube = new THREE.Mesh(geometry, material); cube.position.set(playerData.position.x, playerData.position.y, playerData.position.z); cube.castShadow = true; cube.userData.id = playerData.id; playerMeshes[playerData.id] = cube; scene.add(cube); console.log(`Added fallback cube for player ${playerData.id}`);
    });
}
function loadAndAttachGun(playerMesh) { const gunPath = 'assets/maps/gun2.glb'; gltfLoader.load(gunPath, (gltf) => { const gunMesh = gltf.scene; gunMesh.scale.set(0.2, 0.2, 0.2); gunMesh.position.set(0.3, PLAYER_HEIGHT * 0.4, 0.4); gunMesh.rotation.y = -Math.PI / 2; gunMesh.castShadow = true; gunMesh.traverse((node) => { if (node.isMesh) node.castShadow = true; }); playerMesh.add(gunMesh); playerMesh.userData.gun = gunMesh; }, undefined, (error) => { console.error(`!!! Error loading gun model ${gunPath}:`, error); }); }
export function removePlayer(playerId) { const mesh = playerMeshes[playerId]; if (mesh) { console.log(`Removing mesh for player ${playerId}`); while(mesh.children.length > 0){ const child = mesh.children[0]; mesh.remove(child); } scene.remove(mesh); delete playerMeshes[playerId]; } else { console.warn(`Tried to remove non-existent player mesh: ${playerId}`); } }
export function updatePlayerPosition(playerId, position, rotation) { const mesh = playerMeshes[playerId]; if (mesh && position && rotation) { mesh.position.set(position.x, position.y, position.z); mesh.rotation.y = rotation.y; } else if (!mesh) { } else if (!position || !rotation) { console.warn(`Invalid position/rotation data for player ${playerId}`, position, rotation); } }
export function getPlayerMesh(playerId) { return playerMeshes[playerId]; } export function getCamera() { return camera; } export function getScene() { return scene; } export function getEnvironmentMeshes() { return environmentMesh ? [environmentMesh] : []; }
export function playGunshotSound(position) { if (!gunshotSoundBuffer || !listener || !position) { console.warn("Cannot play gunshot sound: buffer, listener or position missing."); return; } if (!camera.children.includes(listener)) { camera.add(listener); } const sound = new THREE.PositionalAudio(listener); sound.setBuffer(gunshotSoundBuffer); sound.setRefDistance(20); sound.setRolloffFactor(1); sound.setVolume(0.5); scene.add(sound); sound.position.copy(position); sound.play(); sound.onEnded = () => { sound.isPlaying = false; if (sound.parent) { sound.parent.remove(sound); } }; }
export function createDeathExplosion(position) { if (!position) { console.error("createDeathExplosion called without position"); return []; } console.log("Creating death explosion at:", position); const particleCount = 100; const particles = new THREE.BufferGeometry(); const pMaterial = new THREE.PointsMaterial({ color: 0xFF4500, size: 0.5, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }); const pVertices = []; const velocities = []; for (let i = 0; i < particleCount; i++) { pVertices.push(position.x, position.y + PLAYER_HEIGHT / 2, position.z); const theta = Math.random() * Math.PI * 2; const phi = Math.acos(2 * Math.random() - 1); const speed = 5 + Math.random() * 10; velocities.push( speed * Math.sin(phi) * Math.cos(theta), speed * Math.cos(phi) + 3, speed * Math.sin(phi) * Math.sin(theta) ); } particles.setAttribute('position', new THREE.Float32BufferAttribute(pVertices, 3)); const particleSystem = new THREE.Points(particles, pMaterial); particleSystem.userData.velocities = velocities; particleSystem.userData.life = 1.0; particleSystem.userData.update = (delta) => updateParticleSystem(particleSystem, delta); particleSystem.userData.dispose = () => disposeEffect(particleSystem); scene.add(particleSystem); const shockwaveGeometry = new THREE.RingGeometry(0.1, 1, 64); const shockwaveMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, transparent: true, opacity: 0.8 }); const shockwave = new THREE.Mesh(shockwaveGeometry, shockwaveMaterial); shockwave.position.copy(position); shockwave.position.y += 0.1; shockwave.rotation.x = -Math.PI / 2; shockwave.userData.life = 0.5; shockwave.userData.maxRadius = 25; shockwave.userData.update = (delta) => updateShockwave(shockwave, delta); shockwave.userData.dispose = () => disposeEffect(shockwave); scene.add(shockwave); return [particleSystem, shockwave]; }
function updateParticleSystem(system, deltaTime) { if (!system?.userData || !system.geometry?.attributes?.position) return false; system.userData.life -= deltaTime; if (system.userData.life <= 0) return false; const positions = system.geometry.attributes.position.array; const velocities = system.userData.velocities; const gravity = -9.8 * 2; for (let i = 0; i < positions.length / 3; i++) { velocities[i * 3 + 1] += gravity * deltaTime; positions[i * 3] += velocities[i * 3] * deltaTime; positions[i * 3 + 1] += velocities[i * 3 + 1] * deltaTime; positions[i * 3 + 2] += velocities[i * 3 + 2] * deltaTime; } if(system.material) system.material.opacity = Math.max(0, system.userData.life); system.geometry.attributes.position.needsUpdate = true; return true; }
function updateShockwave(wave, deltaTime) { if (!wave?.userData || !wave.geometry || !wave.material) return false; wave.userData.life -= deltaTime; if (wave.userData.life <= 0) return false; const progress = 1 - (wave.userData.life / 0.5); const currentRadius = progress * wave.userData.maxRadius; const innerRadius = Math.max(0.1, currentRadius - 2); wave.geometry.dispose(); wave.geometry = new THREE.RingGeometry(innerRadius, currentRadius, 64); wave.material.opacity = Math.max(0, 1 - progress); return true; }
function disposeEffect(effect) { if (!effect) return; try { if (effect.parent) { effect.parent.remove(effect); } if (effect.geometry) effect.geometry.dispose(); if (effect.material) { if (Array.isArray(effect.material)) { effect.material.forEach(m => { if (m.map) m.map.dispose(); m.dispose(); }); } else { if (effect.material.map) effect.material.map.dispose(); effect.material.dispose(); } } } catch (e) { console.error("Error during effect disposal:", e, effect); } }
export function updateEffect(effect, deltaTime) { if (effect?.userData && typeof effect.userData.update === 'function') { const isActive = effect.userData.update(deltaTime); if (!isActive && typeof effect.userData.dispose === 'function') { effect.userData.dispose(); } return isActive; } console.warn("Attempted to update effect without update function:", effect); return false; }
function onWindowResize() { if (camera && renderer) { camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight); console.log("Window resized."); } }
export { FALL_DEATH_Y, PLAYER_HEIGHT };
