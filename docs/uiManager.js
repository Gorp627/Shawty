// --- START OF FULL uiManager.js FILE ---
// docs/uiManager.js (With Debugging Logs and Fixes - Uses Global Scope - REGEN v6 - Full Code)

const UIManager = {
     // Declare properties
     loadingScreen: null,
     homeScreen: null,
     gameUI: null,
     playerCountSpan: null,
     playerNameInput: null,
     playerPhraseInput: null,
     joinButton: null,
     homeScreenError: null,
     infoDiv: null,
     healthBarFill: null,
     healthText: null,
     killMessageDiv: null,
     canvas: null,
     killMessageTimeout: null,

     initialize: function() {
         console.log("[UIManager] Initializing...");
         // Query selectors for all UI elements
         this.loadingScreen = document.getElementById('loadingScreen');
         this.homeScreen = document.getElementById('homeScreen');
         this.gameUI = document.getElementById('gameUI');
         this.playerCountSpan = document.getElementById('playerCount');
         this.playerNameInput = document.getElementById('playerNameInput');
         this.playerPhraseInput = document.getElementById('playerPhraseInput');
         this.joinButton = document.getElementById('joinButton');
         this.homeScreenError = document.getElementById('homeScreenError');
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
             gameUI: this.gameUI,
             canvas: this.canvas,
             joinButton: this.joinButton, // Crucial for starting
             homeScreenError: this.homeScreenError // Crucial for feedback
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

         // Attach Event Listener to Join Button
         if (this.joinButton) {
             this.joinButton.addEventListener('click', () => {
                 console.log("[UIManager] Join Game button clicked!");
                 if (typeof Network !== 'undefined' && typeof Network.attemptJoinGame === 'function') {
                     Network.attemptJoinGame();
                 } else {
                     console.error("!!! Cannot attempt join: Network object or attemptJoinGame function not found!");
                     this.showError("Internal Error - Cannot initiate join.", "homescreen");
                 }
             });
             console.log("[UIManager] Attached click listener to joinButton.");
         } else {
              console.error("!!! UIManager: Could not attach listener, joinButton element not found during init!");
         }

         // Check optional elements and log warnings if missing
         if (!this.playerCountSpan) console.warn("[UIManager] Optional element 'playerCount' not found.");
         if (!this.playerNameInput) console.warn("[UIManager] Optional element 'playerNameInput' not found.");
         if (!this.playerPhraseInput) console.warn("[UIManager] Optional element 'playerPhraseInput' not found.");
         if (!this.infoDiv) console.warn("[UIManager] Optional element 'info' not found.");
         if (!this.healthBarFill || !this.healthText) console.warn("[UIManager] Health bar elements ('healthBarFill' or 'healthText') not found.");
         if (!this.killMessageDiv) console.warn("[UIManager] Optional element 'killMessage' not found.");


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
             // console.log("[UIManager Listener] >> 'loading' State Triggered.");
             this.showLoading(opts.message, opts.error);
         });
         sm.on('homescreen', (opts = {}) => {
             // ***** DEBUG: Make sure this log appears *****
             console.log("[UIManager Listener] >> 'homescreen' State Triggered. Options:", opts);
             // *********************************************
             this.showHomescreen(opts.playerCount); // Call the function to show the screen
         });
         sm.on('joining', (opts = {}) => {
             // console.log("[UIManager Listener] >> 'joining' State Triggered.");
             this.showJoining(); // Updates button text on homescreen
         });
         sm.on('playing', () => {
             // console.log("[UIManager Listener] >> 'playing' State Triggered.");
             this.showGame();
         });
         console.log("[UIManager] State listeners bound successfully.");
     },

     // --- Screen Visibility Control ---

     showLoading: function(msg = "Loading...", err = false) {
         if (!this.loadingScreen || !this.homeScreen || !this.gameUI || !this.canvas) {
             console.error("!!! UIManager: Cannot showLoading - essential elements missing.");
             return;
         }

         // Ensure other screens are explicitly hidden using style.display and class removal
         this.homeScreen.classList.remove('visible'); this.homeScreen.style.display = 'none';
         this.gameUI.classList.remove('visible'); this.gameUI.style.display = 'none';
         this.canvas.style.visibility = 'hidden';

         // Prepare loading screen content and style
         const pElement = this.loadingScreen.querySelector('p');
         if (pElement) {
             pElement.innerHTML = msg; // Use innerHTML to allow line breaks <br/>
             pElement.style.color = err ? '#f38ba8' : ''; // Use theme error color
         } else {
             console.warn("[UIManager] Loading screen <p> tag not found for message.");
         }
         // Add/remove error class for other potential styling
         if (err) { this.loadingScreen.classList.add('error'); }
         else { this.loadingScreen.classList.remove('error'); }

         // Make loading screen visible using both style and class
         this.loadingScreen.style.display = 'flex';
         this.loadingScreen.classList.add('visible');
     },

     showHomescreen: function(pCount = '?') {
         if (!this.loadingScreen || !this.homeScreen || !this.gameUI || !this.canvas) { console.error("!!! UIManager: Cannot showHomescreen - elements missing."); return; }
         const displayCount = pCount ?? '?';
         // ***** DEBUG: Add log inside showHomescreen *****
         console.log(`[UIManager] showHomescreen function called. PlayerCount: ${displayCount}`);
         // ***********************************************

         // --- Explicitly Hide Other Screens ---
         console.log("[UIManager] Hiding loadingScreen...");
         this.loadingScreen.classList.remove('visible');
         this.loadingScreen.style.display = 'none'; // FORCE display: none

         console.log("[UIManager] Hiding gameUI and canvas...");
         this.gameUI.classList.remove('visible');
         this.gameUI.style.display = 'none';
         this.canvas.style.visibility = 'hidden';

         // Reset join button state
         if (this.joinButton) { this.joinButton.disabled = false; this.joinButton.textContent = "DEPLOY"; } // Use theme button text
         // Update player count
         if (this.playerCountSpan) this.playerCountSpan.textContent = displayCount;
         // Clear any previous error message
         this.clearError('homescreen');

         // --- Explicitly Show Homescreen ---
         console.log("[UIManager] Showing homeScreen...");
         this.homeScreen.style.display = 'flex'; // Use correct display type from CSS
         this.homeScreen.classList.add('visible');

         // --- VERIFICATION LOG ---
         // Optional: Check computed styles after a short delay
         /*
         setTimeout(() => {
             try{
                 const loadingStyle = window.getComputedStyle(this.loadingScreen).display;
                 const homeStyle = window.getComputedStyle(this.homeScreen).display;
                 console.log(`[UI Check After showHomescreen] Loading display: ${loadingStyle}, Home display: ${homeStyle}`);
             } catch(e) { console.error("Error checking computed styles:", e)}
         }, 100);
         */
     },

     showJoining: function() {
         if (!this.joinButton || !this.homeScreen) { console.error("!!! UIManager: Cannot showJoining - elements missing."); return; }
         // Ensure homescreen is visible when joining starts
         this.homeScreen.style.display = 'flex';
         this.homeScreen.classList.add('visible');
         this.joinButton.disabled = true;
         // Text ("Connecting..." or "Joining...") is set by Network.attemptJoinGame
         // Or we can set a default here:
         // this.joinButton.textContent = "Processing...";
     },

     showGame: function() {
         if (!this.loadingScreen || !this.homeScreen || !this.gameUI || !this.canvas) { console.error("!!! UIManager: Cannot showGame - elements missing."); return; }
         console.log("[UIManager] showGame called.");

         // Hide other screens explicitly
         this.loadingScreen.classList.remove('visible'); this.loadingScreen.style.display = 'none';
         this.homeScreen.classList.remove('visible'); this.homeScreen.style.display = 'none';

         // Show game UI overlay and canvas explicitly
         this.gameUI.style.display = 'block'; // Or 'flex' if needed
         this.gameUI.classList.add('visible');
         this.canvas.style.visibility = 'visible';

         // Update initial game info
         if (this.infoDiv) {
             const playerName = (typeof window !== 'undefined' ? window.localPlayerName : null) || 'Player';
             this.infoDiv.textContent = `Playing as ${playerName}`;
         }
         this.clearError('homescreen'); // Clear just in case
         this.clearKillMessage(); // Clear on entering game
     },

     // --- UI Element Updates ---
     updatePlayerCount: function(count) {
         if (this.playerCountSpan) {
             this.playerCountSpan.textContent = count ?? '?';
         }
     },

     updateHealthBar: function(healthValue) {
         const clampFn = (typeof clamp === 'function') ? clamp : (val, min, max) => Math.max(min, Math.min(val, max));

         if (this.healthBarFill && this.healthText) {
             const hp = clampFn(Math.round(healthValue), 0, 100);
             const fillWidth = `${hp}%`;
             const backgroundPos = `${100 - hp}% 0%`;
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
     showError: function(text, screen = 'homescreen') {
         console.warn(`[UIManager] showError called for screen '${screen}': "${text}"`);

         if (screen === 'homescreen' && this.homeScreenError) {
             this.homeScreenError.innerHTML = text; // Use innerHTML
             this.homeScreenError.style.display = 'block';
         } else if (screen === 'loading' && this.loadingScreen) {
             this.showLoading(text, true);
         } else {
             console.error(`!!! UIManager: Error display target screen '${screen}' not handled or element missing for message: ${text}`);
         }
     },

     clearError: function(screen = 'homescreen') {
         if (screen === 'homescreen' && this.homeScreenError) {
             if (this.homeScreenError.style.display !== 'none') {
                 this.homeScreenError.textContent = '';
                 this.homeScreenError.style.display = 'none';
             }
         } else if (screen === 'loading' && this.loadingScreen) {
             if (this.loadingScreen.classList.contains('error')) {
                  this.loadingScreen.classList.remove('error');
                  const pElement = this.loadingScreen.querySelector('p');
                  if (pElement) pElement.style.color = '';
             }
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
     }
};

// Export globally
if (typeof window !== 'undefined') {
    window.UIManager = UIManager;
}
console.log("uiManager.js loaded (Using Global Scope - v6 Debug Logs)"); // Updated log message
// --- END OF FULL uiManager.js FILE ---
