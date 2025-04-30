// --- START OF FULL uiManager.js FILE ---
// docs/uiManager.js (Character Select UI Flow v1)

const UIManager = {
     // Declare properties
     loadingScreen: null,
     homeScreen: null,
     characterSelectScreen: null, // NEW SCREEN
     gameUI: null,
     playerCountSpan: null,
     playerNameInput: null,
     // playerPhraseInput: null, // REMOVED
     nextButton: null, // RENAMED from joinButton
     homeScreenError: null,
     // Character Select Elements
     previewCanvas: null, // NEW
     characterNameDisplay: null, // NEW
     confirmDeployButton: null, // NEW
     characterSelectError: null, // NEW
     // Game UI Elements
     infoDiv: null,
     healthBarFill: null,
     healthText: null,
     killMessageDiv: null,
     canvas: null, // Main game canvas
     killMessageTimeout: null,
     // Simple preview scene (optional, basic setup)
     previewScene: null,
     previewCamera: null,
     previewRenderer: null,
     previewModel: null,
     previewAnimationId: null,

     initialize: function() {
         console.log("[UIManager] Initializing...");
         // Query selectors for all UI elements
         this.loadingScreen = document.getElementById('loadingScreen');
         this.homeScreen = document.getElementById('homeScreen');
         this.characterSelectScreen = document.getElementById('characterSelectScreen'); // Query new screen
         this.gameUI = document.getElementById('gameUI');
         this.playerCountSpan = document.getElementById('playerCount');
         this.playerNameInput = document.getElementById('playerNameInput');
         // this.playerPhraseInput = document.getElementById('playerPhraseInput'); // REMOVED
         this.nextButton = document.getElementById('nextButton'); // Query renamed button
         this.homeScreenError = document.getElementById('homeScreenError');
         // Query Char Select elements
         this.previewCanvas = document.getElementById('previewCanvas');
         this.characterNameDisplay = document.getElementById('characterNameDisplay');
         this.confirmDeployButton = document.getElementById('confirmDeployButton');
         this.characterSelectError = document.getElementById('characterSelectError');
         // Query Game UI elements
         this.infoDiv = document.getElementById('info');
         this.healthBarFill = document.getElementById('healthBarFill');
         this.healthText = document.getElementById('healthText');
         this.killMessageDiv = document.getElementById('killMessage');
         this.canvas = document.getElementById('gameCanvas');

         // Basic check if essential elements were found
         let essentialFound = true;
         const essentialElements = {
             loadingScreen: this.loadingScreen,
             homeScreen: this.homeScreen,
             characterSelectScreen: this.characterSelectScreen, // Add new screen
             gameUI: this.gameUI,
             canvas: this.canvas,
             nextButton: this.nextButton, // Check renamed button
             confirmDeployButton: this.confirmDeployButton, // Check new button
             homeScreenError: this.homeScreenError,
             characterSelectError: this.characterSelectError, // Check new error display
             previewCanvas: this.previewCanvas, // Check preview canvas
         };
         for (const key in essentialElements) {
             if (!essentialElements[key]) {
                 const likelyId = key.replace(/([A-Z])/g, (match) => `-${match.toLowerCase()}`);
                 console.error(`!!! UIManager Init Error: Essential UI Element Query Failed for ID likely '#${likelyId}' (Var: ${key})`);
                 essentialFound = false;
             }
         }

         if (!essentialFound) {
             document.body.innerHTML = "<p style='color:red; text-align:center; font-size: 1.5em;'>FATAL UI INITIALIZATION ERROR!<br/>Essential HTML elements are missing. Check console (F12).</p>";
             return false; // Indicate failure
         }

         // --- Attach Event Listeners ---
         // Homescreen Next Button
         if (this.nextButton) {
             this.nextButton.addEventListener('click', () => {
                 console.log("[UIManager] Next button clicked!");
                 this.clearError('homescreen');
                 const name = this.playerNameInput.value.trim();
                 if (!name) {
                     this.showError("Please enter a callsign.", "homescreen");
                     return;
                 }
                 // Clean and store name (using global from config.js)
                 window.localPlayerName = name.slice(0, 16).replace(/[^\w\s\-]/g, '').trim() || 'Anon';
                 this.playerNameInput.value = window.localPlayerName; // Update input field with cleaned name

                 // Transition to Character Select
                 if (window.stateMachine) {
                     window.stateMachine.transitionTo('characterSelect');
                 } else {
                     console.error("State machine not found!");
                     this.showError("Internal Error.", "homescreen");
                 }
             });
             console.log("[UIManager] Attached click listener to nextButton.");
         } else {
              console.error("!!! UIManager: Could not attach listener, nextButton element not found during init!");
         }

         // Character Select Deploy Button
         if (this.confirmDeployButton) {
            this.confirmDeployButton.addEventListener('click', () => {
                console.log("[UIManager] Deploy button clicked!");
                this.clearError('characterSelect');
                // TODO: Add logic here if multiple characters are implemented
                // For now, just proceeds to join game
                if (typeof Network !== 'undefined' && typeof Network.attemptJoinGame === 'function') {
                    Network.attemptJoinGame(); // Network.attemptJoinGame will transition stateMachine to 'joining'
                } else {
                    console.error("!!! Cannot attempt join: Network object or attemptJoinGame function not found!");
                    this.showError("Internal Error - Cannot initiate deploy.", "characterSelect");
                }
            });
            console.log("[UIManager] Attached click listener to confirmDeployButton.");
         } else {
              console.error("!!! UIManager: Could not attach listener, confirmDeployButton element not found during init!");
         }

         // Initialize simple preview scene
         this.setupPreviewScene();

         console.log("[UIManager] Initialized successfully.");
         return true; // Indicate success
     },

     bindStateListeners: function(stateMachineInstance) {
         const sm = stateMachineInstance || window.stateMachine;
         if (!sm?.on) {
             console.error("!!! UIManager: Invalid stateMachine provided or not found globally for binding listeners.");
             return;
         }
         console.log("[UIManager] Binding state listeners...");

         sm.on('loading', (opts = {}) => {
             this.showLoading(opts.message, opts.error);
         });
         sm.on('homescreen', (opts = {}) => {
             console.log("[UIManager Listener] >> 'homescreen' State Triggered. Options:", opts);
             this.showHomescreen(opts.playerCount);
         });
         sm.on('characterSelect', (opts = {}) => { // Listen for new state
            console.log("[UIManager Listener] >> 'characterSelect' State Triggered.");
            this.showCharacterSelect();
         });
         sm.on('joining', (opts = {}) => {
             console.log("[UIManager Listener] >> 'joining' State Triggered.");
             // Joining now shows the loading screen
             this.showLoading("Joining..."); // Or "Connecting..." based on Network status
         });
         sm.on('playing', () => {
             console.log("[UIManager Listener] >> 'playing' State Triggered.");
             this.showGame();
         });
         console.log("[UIManager] State listeners bound successfully.");
     },

     // --- Screen Visibility Control ---

     showLoading: function(msg = "Loading...", err = false) {
         if (!this.loadingScreen || !this.homeScreen || !this.characterSelectScreen || !this.gameUI || !this.canvas) {
             console.error("!!! UIManager: Cannot showLoading - essential elements missing.");
             return;
         }
         this.stopPreviewAnimation(); // Stop preview rendering when loading

         // Ensure other screens are explicitly hidden
         this.homeScreen.classList.remove('visible'); this.homeScreen.style.display = 'none';
         this.characterSelectScreen.classList.remove('visible'); this.characterSelectScreen.style.display = 'none';
         this.gameUI.classList.remove('visible'); this.gameUI.style.display = 'none';
         this.canvas.style.visibility = 'hidden';

         // Prepare loading screen content and style
         const pElement = this.loadingScreen.querySelector('p');
         if (pElement) {
             pElement.innerHTML = msg; // Use innerHTML to allow line breaks <br/>
             pElement.style.color = err ? '#f38ba8' : ''; // Use theme error color
         }
         if (err) { this.loadingScreen.classList.add('error'); }
         else { this.loadingScreen.classList.remove('error'); }

         // Make loading screen visible
         this.loadingScreen.style.display = 'flex';
         this.loadingScreen.classList.add('visible');
     },

     showHomescreen: function(pCount = '?') {
         if (!this.loadingScreen || !this.homeScreen || !this.characterSelectScreen || !this.gameUI || !this.canvas) { console.error("!!! UIManager: Cannot showHomescreen - elements missing."); return; }
         const displayCount = pCount ?? '?';
         console.log(`[UIManager] showHomescreen function called. PlayerCount: ${displayCount}`);
         this.stopPreviewAnimation();

         // --- Explicitly Hide Other Screens ---
         this.loadingScreen.classList.remove('visible'); this.loadingScreen.style.display = 'none';
         this.characterSelectScreen.classList.remove('visible'); this.characterSelectScreen.style.display = 'none';
         this.gameUI.classList.remove('visible'); this.gameUI.style.display = 'none';
         this.canvas.style.visibility = 'hidden';

         // Reset button state
         if (this.nextButton) { this.nextButton.disabled = false; this.nextButton.textContent = "NEXT"; }
         // Update player count
         if (this.playerCountSpan) this.playerCountSpan.textContent = displayCount;
         // Clear any previous error message
         this.clearError('homescreen');

         // --- Explicitly Show Homescreen ---
         this.homeScreen.style.display = 'flex';
         this.homeScreen.classList.add('visible');
     },

     showCharacterSelect: function() {
        if (!this.loadingScreen || !this.homeScreen || !this.characterSelectScreen || !this.gameUI || !this.canvas) { console.error("!!! UIManager: Cannot showCharacterSelect - elements missing."); return; }
        console.log(`[UIManager] showCharacterSelect function called.`);
        this.startPreviewAnimation(); // Start preview rendering

        // --- Explicitly Hide Other Screens ---
        this.loadingScreen.classList.remove('visible'); this.loadingScreen.style.display = 'none';
        this.homeScreen.classList.remove('visible'); this.homeScreen.style.display = 'none';
        this.gameUI.classList.remove('visible'); this.gameUI.style.display = 'none';
        this.canvas.style.visibility = 'hidden';

        // Reset button state (might be disabled if connection error occurred during homescreen)
        if (this.confirmDeployButton) { this.confirmDeployButton.disabled = false; this.confirmDeployButton.textContent = "DEPLOY"; }
        // Update display name (only one character for now)
        if (this.characterNameDisplay) this.characterNameDisplay.textContent = "Shawty";
        // Clear any previous error message
        this.clearError('characterSelect');
        // Optionally load/update the preview model here if needed
        this.loadPreviewModel();


        // --- Explicitly Show Character Select Screen ---
        this.characterSelectScreen.style.display = 'flex';
        this.characterSelectScreen.classList.add('visible');
     },

    // Removed showJoining - joining state now uses showLoading

     showGame: function() {
         if (!this.loadingScreen || !this.homeScreen || !this.characterSelectScreen || !this.gameUI || !this.canvas) { console.error("!!! UIManager: Cannot showGame - elements missing."); return; }
         console.log("[UIManager] showGame called.");
         this.stopPreviewAnimation();

         // Hide other screens explicitly
         this.loadingScreen.classList.remove('visible'); this.loadingScreen.style.display = 'none';
         this.homeScreen.classList.remove('visible'); this.homeScreen.style.display = 'none';
         this.characterSelectScreen.classList.remove('visible'); this.characterSelectScreen.style.display = 'none';

         // Show game UI overlay and canvas explicitly
         this.gameUI.style.display = 'block'; // Or 'flex' if needed
         this.gameUI.classList.add('visible');
         this.canvas.style.visibility = 'visible';

         // Update initial game info
         if (this.infoDiv) {
             const playerName = window.localPlayerName || 'Player'; // Use globally set name
             this.infoDiv.textContent = `Playing as ${playerName}`;
         }
         this.clearError('homescreen'); // Clear just in case
         this.clearError('characterSelect'); // Clear just in case
         this.clearKillMessage(); // Clear on entering game
     },

     // --- UI Element Updates ---
     updatePlayerCount: function(count) {
         if (this.playerCountSpan) {
             this.playerCountSpan.textContent = count ?? '?';
         }
     },

     updateHealthBar: function(healthValue) {
         const clampFn = window.clamp || ((val, min, max) => Math.max(min, Math.min(val, max)));

         if (this.healthBarFill && this.healthText) {
             const hp = clampFn(Math.round(healthValue), 0, 100);
             const fillWidth = `${hp}%`;
             const backgroundPos = `${100 - hp}% 0%`; // Shift gradient background
             this.healthBarFill.style.width = fillWidth;
             this.healthBarFill.style.backgroundPosition = backgroundPos;
             this.healthText.textContent = `${hp}%`;
         }
     },

     updateInfo: function(text) {
         if (this.infoDiv) {
             this.infoDiv.textContent = text;
         }
     },

     // --- Error Handling ---
     showError: function(text, screen = 'homescreen') { // Default to homescreen
         console.warn(`[UIManager] showError called for screen '${screen}': "${text}"`);
         let targetErrorElement = null;

         if (screen === 'homescreen' && this.homeScreenError) {
             targetErrorElement = this.homeScreenError;
         } else if (screen === 'characterSelect' && this.characterSelectError) {
             targetErrorElement = this.characterSelectError;
         } else if (screen === 'loading' && this.loadingScreen) {
             // Loading screen handles errors via showLoading
             this.showLoading(text, true);
             return; // Exit early for loading screen
         } else {
             console.error(`!!! UIManager: Error display target screen '${screen}' not handled or element missing for message: ${text}`);
             // Fallback: Show error on homescreen if target is invalid but homescreen exists
             if (this.homeScreenError) {
                 targetErrorElement = this.homeScreenError;
                 text = `(Error on ${screen}): ${text}`; // Prepend context
             } else {
                 return; // No valid error display found
             }
         }

         if (targetErrorElement) {
             targetErrorElement.innerHTML = text; // Use innerHTML for potential <br>
             targetErrorElement.style.display = 'block';
         }
     },

     clearError: function(screen = 'homescreen') {
         let targetErrorElement = null;
         if (screen === 'homescreen' && this.homeScreenError) {
             targetErrorElement = this.homeScreenError;
         } else if (screen === 'characterSelect' && this.characterSelectError) {
             targetErrorElement = this.characterSelectError;
         } else if (screen === 'loading' && this.loadingScreen) {
             // Clear loading screen error state
             if (this.loadingScreen.classList.contains('error')) {
                  this.loadingScreen.classList.remove('error');
                  const pElement = this.loadingScreen.querySelector('p');
                  if (pElement) pElement.style.color = ''; // Reset color
             }
             return; // Exit early for loading screen
         }

         // Clear error for other screens
         if (targetErrorElement && targetErrorElement.style.display !== 'none') {
             targetErrorElement.textContent = '';
             targetErrorElement.style.display = 'none';
         }
     },

     // --- Kill Messages ---
     showKillMessage: function(message) {
         if (this.killMessageTimeout) clearTimeout(this.killMessageTimeout);

         if (this.killMessageDiv) {
             this.killMessageDiv.textContent = message;
             this.killMessageDiv.classList.add('visible');

             const duration = (typeof CONFIG !== 'undefined' ? (CONFIG.KILL_MESSAGE_DURATION || 3500) : 3500);

             this.killMessageTimeout = setTimeout(() => {
                 if (this.killMessageDiv) this.killMessageDiv.classList.remove('visible');
             }, duration);
         } else {
             console.warn("[UIManager] killMessageDiv not found, cannot show message:", message);
         }
     },

     clearKillMessage: function() {
         if (this.killMessageTimeout) clearTimeout(this.killMessageTimeout);
         if (this.killMessageDiv) this.killMessageDiv.classList.remove('visible');
     },

     // --- Character Preview Scene (Basic Setup) ---
     setupPreviewScene: function() {
        if (!this.previewCanvas || typeof THREE === 'undefined') {
            console.warn("[UIManager] Preview canvas or THREE missing, cannot setup preview scene.");
            return;
        }
        try {
            this.previewScene = new THREE.Scene();
            this.previewScene.background = new THREE.Color(0x202530); // Dark blue-grey background

            const aspect = this.previewCanvas.clientWidth / this.previewCanvas.clientHeight;
            this.previewCamera = new THREE.PerspectiveCamera(50, aspect, 0.1, 100);
            this.previewCamera.position.z = 3; // Position camera
            this.previewCamera.position.y = 0.5;

            this.previewRenderer = new THREE.WebGLRenderer({
                canvas: this.previewCanvas,
                antialias: true,
                alpha: true // Allow transparency if needed
            });
            this.previewRenderer.setSize(this.previewCanvas.clientWidth, this.previewCanvas.clientHeight);
            this.previewRenderer.setPixelRatio(window.devicePixelRatio);

            // Add basic lighting
            const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
            this.previewScene.add(ambientLight);
            const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
            directionalLight.position.set(5, 10, 7.5);
            this.previewScene.add(directionalLight);

            console.log("[UIManager] Basic Preview Scene Initialized.");
            // Model loading will happen in loadPreviewModel when screen is shown
        } catch(e) {
            console.error("!!! Error setting up preview scene:", e);
            this.previewScene = null; // Ensure scene is null on error
        }
    },

    loadPreviewModel: function() {
        if (!this.previewScene) {
            console.warn("[UIManager] Preview scene not ready, cannot load model.");
            return;
        }
        // Check if model is already loaded
        if (this.previewModel) {
            this.previewModel.visible = true; // Ensure it's visible
            return;
        }

        // Check if player model asset is loaded by main loadManager
        const playerModelAsset = window.playerModelData; // Use global from loadManager
        if (playerModelAsset && playerModelAsset.scene) {
            try {
                console.log("[UIManager] Cloning player model for preview...");
                this.previewModel = playerModelAsset.scene.clone();
                this.previewModel.scale.set(0.9, 0.9, 0.9); // Adjust scale for preview
                this.previewModel.position.y = -0.9; // Adjust position to stand on "ground"
                 // Ensure shadows are off if not needed, or configure lights better
                this.previewModel.traverse(child => {
                    if (child.isMesh) {
                        child.castShadow = false;
                        child.receiveShadow = false;
                    }
                });
                this.previewScene.add(this.previewModel);
                console.log("[UIManager] Preview model added to scene.");
            } catch (e) {
                console.error("!!! Error cloning/adding preview model:", e);
            }
        } else {
            console.warn("[UIManager] Player model asset not ready for preview.");
            // Optionally add a placeholder?
        }
    },

    startPreviewAnimation: function() {
        if (this.previewAnimationId || !this.previewRenderer || !this.previewScene || !this.previewCamera) {
            return; // Already running or not setup
        }
        const animate = () => {
            this.previewAnimationId = requestAnimationFrame(animate);
            // Rotate the model slowly
            if (this.previewModel) {
                this.previewModel.rotation.y += 0.005;
            }
            this.previewRenderer.render(this.previewScene, this.previewCamera);
        };
        animate();
        console.log("[UIManager] Started Preview Animation.");
    },

    stopPreviewAnimation: function() {
        if (this.previewAnimationId) {
            cancelAnimationFrame(this.previewAnimationId);
            this.previewAnimationId = null;
            console.log("[UIManager] Stopped Preview Animation.");
            // Optionally hide model when not shown
            // if (this.previewModel) this.previewModel.visible = false;
        }
    }
};

// Export globally
if (typeof window !== 'undefined') {
    window.UIManager = UIManager;
}
console.log("uiManager.js loaded (Character Select UI Flow v1)");
// --- END OF FULL uiManager.js FILE ---
