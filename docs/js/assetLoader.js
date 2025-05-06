import * as THREE from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/GLTFLoader.js';

export class AssetLoader {
    constructor(onProgressCallback, onLoadedCallback) {
        this.manager = new THREE.LoadingManager();
        this.gltfLoader = new GLTFLoader(this.manager);
        this.audioLoader = new THREE.AudioLoader(this.manager);
        this.assets = {};

        this.totalAssets = 0;
        this.loadedAssets = 0;

        this.manager.onProgress = (url, itemsLoaded, itemsTotal) => {
            // This progress is per loader, we'll manage overall progress manually
            // console.log(`Loading file: ${url}. Loaded ${itemsLoaded} of ${itemsTotal} files.`);
            if (onProgressCallback) {
                onProgressCallback(this.loadedAssets, this.totalAssets);
            }
        };

        this.manager.onLoad = () => {
            // This fires when all assets managed by THIS manager are done
            // console.log('All assets managed by this loader are loaded.');
            // if (onLoadedCallback) onLoadedCallback(this.assets);
        };
    }

    setAssetCount(count) {
        this.totalAssets = count;
    }

    loadGLTF(name, path) {
        return new Promise((resolve, reject) => {
            this.gltfLoader.load(path, (gltf) => {
                this.assets[name] = gltf;
                this.loadedAssets++;
                this.updateOverallProgress();
                resolve(gltf);
            }, undefined, (error) => {
                console.error(`Error loading GLTF ${name}:`, error);
                reject(error);
            });
        });
    }

    loadAudio(name, path) {
         return new Promise((resolve, reject) => {
            this.audioLoader.load(path, (buffer) => {
                this.assets[name] = buffer;
                this.loadedAssets++;
                this.updateOverallProgress();
                resolve(buffer);
            }, undefined, (error) => {
                console.error(`Error loading Audio ${name}:`, error);
                reject(error);
            });
        });
    }
    
    updateOverallProgress() {
        if (this.onProgressCallback) {
            this.onProgressCallback(this.loadedAssets, this.totalAssets);
        }
        if (this.loadedAssets === this.totalAssets && this.onLoadedCallback) {
            this.onLoadedCallback(this.assets);
        }
    }

    getAsset(name) {
        return this.assets[name];
    }

    init(onProgress, onAllLoaded) {
        this.onProgressCallback = onProgress;
        this.onLoadedCallback = onAllLoaded;

        const assetsToLoad = [
            { name: 'playerModel', type: 'gltf', path: 'assets/maps/Shawty1.glb' },
            { name: 'gunModel', type: 'gltf', path: 'assets/maps/gun2.glb' },
            // Map is loaded dynamically based on server info later
            // { name: 'mapModel', type: 'gltf', path: 'assets/maps/the first map!.glb' },
            { name: 'gunshotSound', type: 'audio', path: 'assets/maps/gunshot.wav' }
        ];
        this.setAssetCount(assetsToLoad.length); // Initial assets

        const promises = assetsToLoad.map(asset => {
            if (asset.type === 'gltf') {
                return this.loadGLTF(asset.name, asset.path);
            } else if (asset.type === 'audio') {
                return this.loadAudio(asset.name, asset.path);
            }
        });
        
        return Promise.all(promises)
            .then(() => {
                // This.onLoadedCallback will be called by updateOverallProgress
                // if all assets are loaded.
                // We can resolve the main promise here.
                return this.assets;
            })
            .catch(error => {
                console.error("Error loading initial assets:", error);
                // Potentially show an error to the user
            });
    }

    loadMapAsset(mapName, mapPath) {
        // If a map is already loaded and it's different, we might need to dispose of old resources
        // For now, just load the new one.
        if (this.assets[mapName]) {
            console.log(`Map ${mapName} already loaded or loading.`);
            return Promise.resolve(this.assets[mapName]);
        }

        console.log(`Loading map asset: ${mapName} from ${mapPath}`);
        this.totalAssets++; // Increment total as we're loading an additional asset
        return this.loadGLTF(mapName, mapPath)
            .then(gltf => {
                console.log(`Map ${mapName} loaded successfully.`);
                return gltf;
            })
            .catch(error => {
                console.error(`Failed to load map ${mapName}:`, error);
                this.totalAssets--; // Decrement if failed, so progress calculation is correct
                this.updateOverallProgress(); // Update progress in case other assets are still loading
                throw error; // Re-throw to be caught by caller
            });
    }
}
