// docs/uiManager.js (With Debugging Logs and Fixes - Uses Global Scope - REGEN v5 - Added Join Button Listener - FULL CODE)

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
                 // Construct the likely ID for the error message
                 const likelyId = key.replace(/([A-Z])/g, (match) => `-${match.toLowerCase()}`);
                 console.error(`!!! UIManager Init Error: Essential UI Element Query Failed for ID likely '#${likelyId}' (Var: ${key})`);
                 essentialFound = false;
             }
         }

         if (!essentialFound) {
             // Display a fatal error to the user if essential elements are missing
             document.body.innerHTML = "<p style='color:red; text-align:center; font-size: 1.5em;'>FATAL UI INITIALIZATION ERROR!<br/>Essential HTML elements are missing. Check console (F12).</p>";
             return false; // Indicate failure
         }

         // --- *** ADDED: Attach Event Listener to Join Button *** ---
         if (this.joinButton) {
             this.joinButton.addEventListener('click', () => {
                 console.log("[UIManager] Join Game button clicked!");
                 // Ensure Network object and attemptJoinGame function exist before calling
                 // Access global Network object safely
                 if (typeof Network !== 'undefined' && typeof Network.attemptJoinGame === 'function') {
                     Network.attemptJoinGame(); // Call the function to start joining process
                 } else {
                     console.error("!!! Cannot attempt join: Network object or attemptJoinGame function not found!");
                     // Optionally show an error to the user via UIManager
                     this.showError("Internal Error - Cannot initiate join.", "homescreen");
                 }
             });
             console.log("[UIManager] Attached click listener to joinButton.");
         } else {
              console.error("!!! UIManager: Could not attach listener, joinButton element not found during init!");
              // This case should have been caught by essentialFound check, but added safety.
         }
         // --- *** END Added Listener *** ---


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
         // Access global stateMachine if instance isn't passed, but prefer passed instance
         const sm = stateMachineInstance || window.stateMachine;
         if (!sm?.on) {
             console.error("!!! UIManager: Invalid stateMachine provided or not found globally for binding listeners.");
             return;
         }
         console.log("[UIManager] Binding state listeners...");
         // Add logging to each state handler
         sm.on('loading', (opts = {}) => {
             // console.log("[UIManager Listener] >> 'loading' State Triggered. Options:", opts); // Less spammy log
             this.showLoading(opts.message, opts.error);
         });
         sm.on('homescreen', (opts = {}) => {
             // console.log("[UIManager Listener] >> 'homescreen' State Triggered. Options:", opts); // Less spammy log
             this.showHomescreen(opts.playerCount);
         });
         sm.on('joining', (opts = {}) => {
             // console.log("[UIManager Listener] >> 'joining' State Triggered. Options:", opts); // Less spammy log
             this.showJoining(); // Updates button text on homescreen
         });
         sm.on('playing', () => {
             // console.log("[UIManager Listener] >> 'playing' State Triggered."); // Less spammy log
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
         // console.log(`[UIManager] showLoading called. Message: "${msg}", IsError: ${err}`); // More concise log

         // Ensure other screens are explicitly hidden using style.display and class removal
         this.homeScreen.classList.remove('visible');
         this.homeScreen.style.display = 'none'; // Explicit hide
         this.gameUI.classList.remove('visible');
         this.gameUI.style.display = 'none'; // Explicit hide
         this.canvas.style.visibility = 'hidden';

         // Prepare loading screen content and style
         const pElement = this.loadingScreen.querySelector('p');
         if (pElement) {
             pElement.innerHTML = msg; // Use innerHTML to allow line breaks <br/>
             pElement.style.color = err ? '#FF6666' : ''; // Set text color based on error flag (use a visible red)
         } else {
             console.warn("[UIManager] Loading screen <p> tag not found for message.");
         }
         // Add/remove error class for other potential styling
         if (err) {
             this.loadingScreen.classList.add('error');
         } else {
             this.loadingScreen.classList.remove('error');
         }

         // Make loading screen visible using both style and class
         this.loadingScreen.style.display = 'flex'; // Use flex as defined in CSS for .visible
         this.loadingScreen.classList.add('visible');
         // console.log("[UIManager] Loading screen shown."); // Less spammy log
     },

     showHomescreen: function(pCount = '?') {
         if (!this.loadingScreen || !this.homeScreen || !this.gameUI || !this.canvas) { console.error("!!! UIManager: Cannot showHomescreen - elements missing."); return; }
         const displayCount = pCount ?? '?';
         // console.log(`[UIManager] showHomescreen called. PlayerCount: ${displayCount}`); // Less spammy log

         // --- Explicitly Hide Other Screens ---
         // console.log("[UIManager] Hiding loadingScreen..."); // Less spammy log
         this.loadingScreen.classList.remove('visible');
         this.loadingScreen.style.display = 'none'; // FORCE display: none

         // console.log("[UIManager] Hiding gameUI and canvas..."); // Less spammy log
         this.gameUI.classList.remove('visible');
         this.gameUI.style.display = 'none'; // Explicit hide
         this.canvas.style.visibility = 'hidden';

         // Reset join button state
         if (this.joinButton) { this.joinButton.disabled = false; this.joinButton.textContent = "Join Game"; }
         // Update player count
         if (this.playerCountSpan) this.playerCountSpan.textContent = displayCount;
         // Clear any previous error message
         this.clearError('homescreen');

         // --- Explicitly Show Homescreen ---
         // console.log("[UIManager] Showing homeScreen..."); // Less spammy log
         this.homeScreen.style.display = 'flex'; // Use flex as defined in CSS for .visible
         this.homeScreen.classList.add('visible');

         // Verification log
         // setTimeout(() => {
         //     const loadingStyle = window.getComputedStyle(this.loadingScreen).display;
         //     const homeStyle = window.getComputedStyle(this.homeScreen).display;
         //     console.log(`[UI Check After showHomescreen] Loading display: ${loadingStyle}, Home display: ${homeStyle}`);
         // }, 50); // Short delay to allow rendering potentially
     },

     showJoining: function() {
         if (!this.joinButton || !this.homeScreen) { console.error("!!! UIManager: Cannot showJoining - elements missing."); return; }
         // console.log(`[UIManager] showJoining called.`); // Less verbose
         // Ensure homescreen is visible when joining starts
         this.homeScreen.style.display = 'flex';
         this.homeScreen.classList.add('visible');
         this.joinButton.disabled = true;
         // Text ("Connecting..." or "Joining...") is set by Network.attemptJoinGame
     },

     showGame: function() {
         if (!this.loadingScreen || !this.homeScreen || !this.gameUI || !this.canvas) { console.error("!!! UIManager: Cannot showGame - elements missing."); return; }
         console.log("[UIManager] showGame called.");

         // Hide other screens explicitly
         this.loadingScreen.classList.remove('visible'); this.loadingScreen.style.display = 'none';
         this.homeScreen.classList.remove('visible'); this.homeScreen.style.display = 'none';

         // Show game UI overlay and canvas explicitly
         this.gameUI.style.display = 'block'; // Or 'flex' if needed, assuming block default for overlay container
         this.gameUI.classList.add('visible');
         this.canvas.style.visibility = 'visible';

         // Update initial game info
         if (this.infoDiv) {
             // Access global localPlayerName safely
             const playerName = (typeof window !== 'undefined' ? window.localPlayerName : null) || 'Player';
             this.infoDiv.textContent = `Playing as ${playerName}`;
         }
         this.clearError('homescreen'); // Clear just in case
         this.clearKillMessage(); // Clear on entering game

         // Verification log
         // setTimeout(() => {
         //     const gameUIVis = window.getComputedStyle(this.gameUI).visibility;
         //     const canvasVis = window.getComputedStyle(this.canvas).visibility;
         //     console.log(`[UI Check After showGame] GameUI: ${gameUIVis}, Canvas: ${canvasVis}`);
         // }, 100);
     },

     // --- UI Element Updates ---
     updatePlayerCount: function(count) {
         if (this.playerCountSpan) {
             this.playerCountSpan.textContent = count ?? '?'; // Use nullish coalescing
         }
     },

     updateHealthBar: function(healthValue) {
         // Access global clamp function safely
         const clampFn = (typeof clamp === 'function') ? clamp : (val, min, max) => Math.max(min, Math.min(val, max));

         if (this.healthBarFill && this.healthText) {
             const hp = clampFn(Math.round(healthValue), 0, 100); // Ensure 0-100 range
             const fillWidth = `${hp}%`;
             const backgroundPos = `${100 - hp}% 0%`; // Adjust gradient based on health %
             this.healthBarFill.style.width = fillWidth;
             this.healthBarFill.style.backgroundPosition = backgroundPos;
             this.healthText.textContent = `${hp}%`;
         } else {
             // console.warn("[UIManager] Health bar elements not found for update."); // Less critical
         }
     },

     updateInfo: function(text) {
         if (this.infoDiv) {
             this.infoDiv.textContent = text;
         } else {
             console.warn("[UIManager] infoDiv not found for update.");
         }
     },

     // --- Error Handling ---
     showError: function(text, screen = 'homescreen') {
         console.warn(`[UIManager] showError called for screen '${screen}': "${text}"`);

         if (screen === 'homescreen' && this.homeScreenError) {
             this.homeScreenError.innerHTML = text; // Use innerHTML to allow basic formatting like <br>
             this.homeScreenError.style.display = 'block'; // Ensure error is visible
             // console.log("[UIManager] Displayed error on homescreen."); // Less spammy
         } else if (screen === 'loading' && this.loadingScreen) {
             // Use the dedicated showLoading function which handles error styling
             this.showLoading(text, true);
             // console.log("[UIManager] Displayed error on loading screen via showLoading."); // Less spammy
         } else {
             console.error(`!!! UIManager: Error display target screen '${screen}' not handled or element missing for message: ${text}`);
             // Fallback? Maybe a general alert for critical errors?
             // alert(`Error: ${text}`); // Use with caution
         }
     },

     clearError: function(screen = 'homescreen') {
         // console.log(`[UIManager] Attempting clearError for screen: ${screen}`); // Optional verbose log

         if (screen === 'homescreen' && this.homeScreenError) {
             // Clear only if currently visible
             if (this.homeScreenError.style.display !== 'none') {
                 this.homeScreenError.textContent = ''; // Clear text content
                 this.homeScreenError.style.display = 'none'; // Hide error element
                 // console.log("[UIManager] Cleared homescreen error text and hid element."); // Less spammy log
             }
         } else if (screen === 'loading' && this.loadingScreen) {
             // Clearing loading error means removing the 'error' class and resetting text color
             if (this.loadingScreen.classList.contains('error')) {
                  this.loadingScreen.classList.remove('error');
                  const pElement = this.loadingScreen.querySelector('p');
                  if (pElement) pElement.style.color = ''; // Reset text color to default
                  // console.log("[UIManager] Cleared loading screen error style."); // Less spammy log
             }
         }
         // No need to log if nothing was actually cleared
     },

     // --- Kill Messages ---
     showKillMessage: function(message) {
         if (this.killMessageTimeout) clearTimeout(this.killMessageTimeout); // Clear previous timeout if any

         if (this.killMessageDiv) {
             this.killMessageDiv.textContent = message;
             this.killMessageDiv.classList.add('visible'); // Make visible using CSS class

             // Access global CONFIG safely for duration
             const duration = (typeof CONFIG !== 'undefined' ? (CONFIG.KILL_MESSAGE_DURATION || 3500) : 3500);

             // Set timeout to hide the message after the duration
             this.killMessageTimeout = setTimeout(() => {
                 if (this.killMessageDiv) this.killMessageDiv.classList.remove('visible'); // Hide after duration
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
// Export globally if not using modules
if (typeof window !== 'undefined') {
    window.UIManager = UIManager;
}
console.log("uiManager.js loaded (Using Global Scope - v5 Added Join Listener - FULL)");
