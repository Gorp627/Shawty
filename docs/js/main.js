import { UIManager } from './ui.js';
import { NetworkManager } from './network.js';
import { GameManager } from './game.js';
import { AssetLoader } from './assetLoader.js';

class MainApp {
    constructor() {
        this.uiManager = new UIManager();
        this.assetLoader = new AssetLoader(
            this.uiManager.updateLoadingProgress.bind(this.uiManager), // onProgress
            this.onAssetsLoaded.bind(this)      // onLoaded
        );
        // NetworkManager and GameManager are initialized after assets, or partially before.
        // GameManager needs assets, NetworkManager needs GameManager for some callbacks.
        this.networkManager = null;
        this.gameManager = null;
    }

    async init() {
        this.uiManager.showHomeMenu(); // Show home menu immediately, loading happens behind it
        this.uiManager.updateLoadingProgress(0,1); // Initial state for progress bar

        // Initialize Rapier (must be done before GameManager uses it)
        try {
            await RAPIER.init(); // RAPIER should be global from the script tag
            console.log("Rapier initialized successfully.");
        } catch (error) {
            console.error("Failed to initialize Rapier:", error);
            this.uiManager.loadingStatus.textContent = "Error: Physics engine failed to load. Please refresh.";
            this.uiManager.loadingStatus.style.color = "red";
            return; // Stop initialization
        }
        
        // Defer GameManager and NetworkManager initialization slightly
        // to ensure Rapier is ready and allow UI to render.
        // GameManager constructor now takes AssetLoader directly
        this.gameManager = new GameManager(this.uiManager, null, this.assetLoader); // networkManager set later
        this.networkManager = new NetworkManager(this.uiManager, this.gameManager);
        this.gameManager.networkManager = this.networkManager; // Circular dependency resolved


        this.uiManager.setPlayButtonCallback((playerName, selectedCharacter) => {
            this.uiManager.hideHomeMenu(); // Or show a "Connecting..." message
            this.networkManager.connect(playerName, selectedCharacter);
        });
        
        // Load initial common assets (player, gun, sounds)
        // Map asset is loaded when server confirms map via 'currentMap' or 'gameJoined'
        try {
            await this.assetLoader.init(
                this.uiManager.updateLoadingProgress.bind(this.uiManager),
                this.onAssetsLoaded.bind(this)
            );
            // onAssetsLoaded will be called when these initial assets are done.
        } catch (error) {
            console.error("Error during initial asset loading:", error);
            this.uiManager.loadingStatus.textContent = "Error loading critical assets. Please refresh.";
            this.uiManager.loadingStatus.style.color = "red";
        }
    }

    onAssetsLoaded(loadedAssets) {
        console.log("Initial common assets loaded!", loadedAssets);
        this.uiManager.hideLoadingScreen();
        this.uiManager.showHomeMenu(); // Ensure home menu is shown after loading
        
        // Now that assets are loaded, we can fully initialize GameManager's 3D environment
        // But actual game scene (with map, players) is built upon server's 'gameJoined'
        this.gameManager.init().then(() => {
            console.log("GameManager Three.js scene initialized (without map/players yet).");
            // At this point, client is ready to receive 'gameJoined' from server
            // and then build the full scene.
        }).catch(error => {
            console.error("Error initializing GameManager scene:", error);
            this.uiManager.showHomeMenuWithMessage("Critical error setting up game. Please refresh.");
        });
    }
}

// Start the application
window.addEventListener('DOMContentLoaded', () => {
    const app = new MainApp();
    app.init();
});
