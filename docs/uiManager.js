// --- START OF FULL uiManager.js FILE ---
// docs/uiManager.js (Character Select UI Flow v2 - Simplified)

const UIManager = {
     // Declare properties
     loadingScreen: null,
     homeScreen: null,
     characterSelectScreen: null,
     gameUI: null,
     playerCountSpan: null,
     playerNameInput: null,
     nextButton: null,
     homeScreenError: null,
     // Character Select Elements
     // previewCanvas: null, // REMOVED
     characterPreviewDiv: null, // Optional div placeholder
     characterNameDisplay: null,
     confirmDeployButton: null,
     characterSelectError: null,
     // Game UI Elements
     infoDiv: null,
     healthBarFill: null,
     healthText: null,
     killMessageDiv: null,
     canvas: null, // Main game canvas
     killMessageTimeout: null,
     // Preview rendering properties REMOVED
     // previewScene: null,
     // previewCamera: null,
     // previewRenderer: null,
     // previewModel: null,
     // previewAnimationId: null,

     initialize: function() {
         console.log("[UIManager] Initializing...");
         // Query selectors for all UI elements
         this.loadingScreen = document.getElementById('loadingScreen');
         this.homeScreen = document.getElementById('homeScreen');
         this.characterSelectScreen = document.getElementById('characterSelectScreen');
         this.gameUI = document.getElementById('gameUI');
         this.playerCountSpan = document.getElementById('playerCount');
         this.playerNameInput = document.getElementById('playerNameInput');
         this.nextButton = document.getElementById('nextButton');
         this.homeScreenError = document.getElementById('homeScreenError');
         // Query Char Select elements
         // this.previewCanvas = document.getElementById('previewCanvas'); // REMOVED
         this.characterPreviewDiv = document.getElementById('characterPreview'); // Query the container div
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
             characterSelectScreen: this.characterSelectScreen,
             gameUI: this.gameUI,
             canvas: this.canvas,
             nextButton: this.nextButton,
             confirmDeployButton: this.confirmDeployButton,
             homeScreenError: this.homeScreenError,
             characterSelectError: this.characterSelectError,
             // previewCanvas removed, characterPreviewDiv is optional styling
         };
         for (const key in essentialElements) {
             if (!essentialElements[key]) {
                 const likelyId = key.replace(/([A-Z])/g, (match) => `-${match.toLowerCase()}`);
                 console.error(`!!! UIManager Init Error: Essential UI Element Query Failed for ID likely '#${likelyId}' (Var: ${key})`);
                 essentialFound = false;
             }
         }
          // Warn if optional elements missing
         if (!this.characterPreviewDiv) console.warn("[UIManager] Optional element 'characterPreview' div not found.");
         if (!this.playerCountSpan) console.warn("[UIManager] Optional element 'playerCount' not found.");
         if (!this.infoDiv) console.warn("[UIManager] Optional element 'info' not found.");
         if (!this.healthBarFill || !this.healthText) console.warn("[UIManager] Health bar elements ('healthBarFill' or 'healthText') not found.");
         if (!this.killMessageDiv) console.warn("[UIManager] Optional element 'killMessage' not found.");


         if (!essentialFound) {
             document.body.innerHTML = "<p style='color:red; text-align:center; font-size: 1.5em;'>FATAL UI INITIALIZATION ERROR!<br/>Essential HTML elements are missing. Check console (F12).</p>";
             return false;
         }

         // --- Attach Event Listeners ---
         if (this.nextButton) {
             this.nextButton.addEventListener('click', () => {
                 // console.log("[UIManager] Next button clicked!");
                 this.clearError('homescreen');
                 const name = this.playerNameInput.value.trim();
                 if (!name) {
                     this.showError("Please enter a callsign.", "homescreen");
                     return;
                 }
                 window.localPlayerName = name.slice(0, 16).replace(/[^\w\s\-]/g, '').trim() || 'Anon';
                 this.playerNameInput.value = window.localPlayerName;
                 window.stateMachine?.transitionTo('characterSelect');
             });
             // console.log("[UIManager] Attached click listener to nextButton.");
         } else { console.error("!!! UIManager: Could not attach listener, nextButton not found!"); }

         if (this.confirmDeployButton) {
            this.confirmDeployButton.addEventListener('click', () => {
                // console.log("[UIManager] Deploy button clicked!");
                this.clearError('characterSelect');
                // Character is implicitly "Billy" for now
                console.log("[UIManager] Character 'Billy' selected (implicitly).");
                // Attempt to join the game
                Network?.attemptJoinGame(); // Network handles state transition to 'joining'
            });
            // console.log("[UIManager] Attached click listener to confirmDeployButton.");
         } else { console.error("!!! UIManager: Could not attach listener, confirmDeployButton not found!"); }

         // Preview Scene setup REMOVED
         // this.setupPreviewScene();

         console.log("[UIManager] Initialized successfully.");
         return true;
     },

     bindStateListeners: function(stateMachineInstance) {
         const sm = stateMachineInstance || window.stateMachine;
         if (!sm?.on) { console.error("!!! UIManager: Invalid stateMachine provided."); return; }
         console.log("[UIManager] Binding state listeners...");

         sm.on('loading', (opts = {}) => { this.showLoading(opts.message, opts.error); });
         sm.on('homescreen', (opts = {}) => { this.showHomescreen(opts.playerCount); });
         sm.on('characterSelect', (opts = {}) => { this.showCharacterSelect(); });
         sm.on('joining', (opts = {}) => { this.showLoading("Joining..."); }); // Use loading screen
         sm.on('playing', () => { this.showGame(); });

         console.log("[UIManager] State listeners bound successfully.");
     },

     // --- Screen Visibility Control ---
     showLoading: function(msg = "Loading...", err = false) {
         if (!this.loadingScreen || !this.homeScreen || !this.characterSelectScreen || !this.gameUI || !this.canvas) { return; }
         // stopPreviewAnimation REMOVED

         this.homeScreen.classList.remove('visible'); this.homeScreen.style.display = 'none';
         this.characterSelectScreen.classList.remove('visible'); this.characterSelectScreen.style.display = 'none';
         this.gameUI.classList.remove('visible'); this.gameUI.style.display = 'none';
         this.canvas.style.visibility = 'hidden';

         const pElement = this.loadingScreen.querySelector('p');
         if (pElement) {
             pElement.innerHTML = msg;
             pElement.style.color = err ? '#f38ba8' : '';
         }
         if (err) { this.loadingScreen.classList.add('error'); }
         else { this.loadingScreen.classList.remove('error'); }

         this.loadingScreen.style.display = 'flex';
         this.loadingScreen.classList.add('visible');
     },

     showHomescreen: function(pCount = '?') {
         if (!this.loadingScreen || !this.homeScreen || !this.characterSelectScreen || !this.gameUI || !this.canvas) { return; }
         // console.log(`[UIManager] showHomescreen function called. PlayerCount: ${pCount ?? '?'}`);
         // stopPreviewAnimation REMOVED

         this.loadingScreen.classList.remove('visible'); this.loadingScreen.style.display = 'none';
         this.characterSelectScreen.classList.remove('visible'); this.characterSelectScreen.style.display = 'none';
         this.gameUI.classList.remove('visible'); this.gameUI.style.display = 'none';
         this.canvas.style.visibility = 'hidden';

         if (this.nextButton) { this.nextButton.disabled = false; this.nextButton.textContent = "NEXT"; }
         if (this.playerCountSpan) this.playerCountSpan.textContent = pCount ?? '?';
         this.clearError('homescreen');

         this.homeScreen.style.display = 'flex';
         this.homeScreen.classList.add('visible');
     },

     showCharacterSelect: function() {
        if (!this.loadingScreen || !this.homeScreen || !this.characterSelectScreen || !this.gameUI || !this.canvas) { return; }
        // console.log(`[UIManager] showCharacterSelect function called.`);
        // startPreviewAnimation REMOVED

        this.loadingScreen.classList.remove('visible'); this.loadingScreen.style.display = 'none';
        this.homeScreen.classList.remove('visible'); this.homeScreen.style.display = 'none';
        this.gameUI.classList.remove('visible'); this.gameUI.style.display = 'none';
        this.canvas.style.visibility = 'hidden';

        if (this.confirmDeployButton) { this.confirmDeployButton.disabled = false; this.confirmDeployButton.textContent = "DEPLOY"; }
        if (this.characterNameDisplay) this.characterNameDisplay.textContent = "Billy"; // Hardcode name for now
        this.clearError('characterSelect');
        // loadPreviewModel REMOVED

        this.characterSelectScreen.style.display = 'flex';
        this.characterSelectScreen.classList.add('visible');
     },

    // showJoining REMOVED

     showGame: function() {
         if (!this.loadingScreen || !this.homeScreen || !this.characterSelectScreen || !this.gameUI || !this.canvas) { return; }
         // console.log("[UIManager] showGame called.");
         // stopPreviewAnimation REMOVED

         this.loadingScreen.classList.remove('visible'); this.loadingScreen.style.display = 'none';
         this.homeScreen.classList.remove('visible'); this.homeScreen.style.display = 'none';
         this.characterSelectScreen.classList.remove('visible'); this.characterSelectScreen.style.display = 'none';

         this.gameUI.style.display = 'block';
         this.gameUI.classList.add('visible');
         this.canvas.style.visibility = 'visible';

         if (this.infoDiv) {
             this.infoDiv.textContent = `Playing as ${window.localPlayerName || 'Player'}`;
         }
         this.clearError('homescreen');
         this.clearError('characterSelect');
         this.clearKillMessage();
     },

     // --- UI Element Updates ---
     updatePlayerCount: function(count) {
         if (this.playerCountSpan) { this.playerCountSpan.textContent = count ?? '?'; }
     },

     updateHealthBar: function(healthValue) {
         const clampFn = window.clamp || ((val, min, max) => Math.max(min, Math.min(val, max)));
         if (this.healthBarFill && this.healthText) {
             const hp = clampFn(Math.round(healthValue), 0, 100);
             this.healthBarFill.style.width = `${hp}%`;
             this.healthBarFill.style.backgroundPosition = `${100 - hp}% 0%`;
             this.healthText.textContent = `${hp}%`;
         }
     },

     updateInfo: function(text) {
         if (this.infoDiv) { this.infoDiv.textContent = text; }
     },

     // --- Error Handling ---
     showError: function(text, screen = 'homescreen') {
         console.warn(`[UIManager] showError called for screen '${screen}': "${text}"`);
         let targetErrorElement = null;

         if (screen === 'homescreen' && this.homeScreenError) targetErrorElement = this.homeScreenError;
         else if (screen === 'characterSelect' && this.characterSelectError) targetErrorElement = this.characterSelectError;
         else if (screen === 'loading' && this.loadingScreen) { this.showLoading(text, true); return; }
         else {
             console.error(`!!! UIManager: Error display target screen '${screen}' not handled.`);
             targetErrorElement = this.homeScreenError; // Fallback to homescreen
             text = `(Error @ ${screen}): ${text}`;
         }

         if (targetErrorElement) {
             targetErrorElement.innerHTML = text;
             targetErrorElement.style.display = 'block';
         }
     },

     clearError: function(screen = 'homescreen') {
         let targetErrorElement = null;
         if (screen === 'homescreen' && this.homeScreenError) targetErrorElement = this.homeScreenError;
         else if (screen === 'characterSelect' && this.characterSelectError) targetErrorElement = this.characterSelectError;
         else if (screen === 'loading' && this.loadingScreen) {
             if (this.loadingScreen.classList.contains('error')) {
                  this.loadingScreen.classList.remove('error');
                  const pElement = this.loadingScreen.querySelector('p');
                  if (pElement) pElement.style.color = '';
             }
             return;
         }
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
             const duration = CONFIG?.KILL_MESSAGE_DURATION ?? 3500;
             this.killMessageTimeout = setTimeout(() => {
                 if (this.killMessageDiv) this.killMessageDiv.classList.remove('visible');
             }, duration);
         }
     },

     clearKillMessage: function() {
         if (this.killMessageTimeout) clearTimeout(this.killMessageTimeout);
         if (this.killMessageDiv) this.killMessageDiv.classList.remove('visible');
     },

     // --- Character Preview Scene REMOVED ---
     // setupPreviewScene: function() { ... } REMOVED
     // loadPreviewModel: function() { ... } REMOVED
     // startPreviewAnimation: function() { ... } REMOVED
     // stopPreviewAnimation: function() { ... } REMOVED
};

// Export globally
if (typeof window !== 'undefined') {
    window.UIManager = UIManager;
}
console.log("uiManager.js loaded (Character Select UI Flow v2 - Simplified)");
// --- END OF FULL uiManager.js FILE ---
