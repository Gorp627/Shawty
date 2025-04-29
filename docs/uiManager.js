// docs/uiManager.js (With Debugging Logs and Fixes - REGENERATED - Added Join Button Listener)

const UIManager = {
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

         // Check optional elements and log warnings if missing
         if (!this.playerCountSpan) console.warn("[UIManager] Optional element 'playerCount' not found.");
         if (!this.playerNameInput) console.warn("[UIManager] Optional element 'playerNameInput' not found.");
         if (!this.playerPhraseInput) console.warn("[UIManager] Optional element 'playerPhraseInput' not found.");
         if (!this.infoDiv) console.warn("[UIManager] Optional element 'info' not found.");
         if (!this.healthBarFill || !this.healthText) console.warn("[UIManager] Health bar elements ('healthBarFill' or 'healthText') not found.");
         if (!this.killMessageDiv) console.warn("[UIManager] Optional element 'killMessage' not found.");

         // Add event listener for the join button
         if (this.joinButton) {
              this.joinButton.addEventListener('click', () => {
                  if (Network && typeof Network.attemptJoinGame === 'function') {
                      Network.attemptJoinGame();
                  } else {
                       console.error("!!! Join button clicked, but Network.attemptJoinGame is not available!");
                       this.showError("Network system error.", "homescreen");
                  }
              });
         } else {
              console.error("!!! Join button element not found during init!");
         }


         console.log("[UIManager] Initialized successfully.");
         return true; // Indicate success
     },

     bindStateListeners: function(stateMachine) {
         if (!stateMachine?.on) {
             console.error("!!! UIManager: Invalid stateMachine provided for binding listeners.");
             return;
         }
         console.log("[UIManager] Binding state listeners...");
         // Add logging to each state handler
         stateMachine.on('loading', (opts = {}) => {
             console.log("[UIManager Listener] >> 'loading' State Triggered. Options:", opts);
             this.showLoading(opts.message || "Loading...", opts.error || false); // Provide defaults
         });
         stateMachine.on('homescreen', (opts = {}) => {
             console.log("[UIManager Listener] >> 'homescreen' State Triggered. Options:", opts);
             this.showHomescreen(opts.playerCount);
             // Handle potential error message passed from disconnect etc.
             if(opts.errorMessage) {
                 this.showError(opts.errorMessage, 'homescreen');
             }
         });
         stateMachine.on('joining', (opts = {}) => {
             console.log("[UIManager Listener] >> 'joining' State Triggered. Options:", opts);
             this.showJoining(); // Updates button text on homescreen
         });
         stateMachine.on('playing', () => {
             console.log("[UIManager Listener] >> 'playing' State Triggered.");
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
         console.log(`[UIManager] showLoading called. Message: "${msg}", IsError: ${err}`);

         // Ensure other screens are hidden first
         this.homeScreen.classList.remove('visible');
         this.gameUI.classList.remove('visible');
         this.canvas.style.visibility = 'hidden'; // Use visibility for canvas

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

         // Make loading screen visible
         this.loadingScreen.classList.add('visible');
         console.log("[UIManager] Loading screen should now be visible.");
     },

     showHomescreen: function(pCount = '?') {
         if (!this.loadingScreen || !this.homeScreen || !this.gameUI || !this.canvas) {
             console.error("!!! UIManager: Cannot showHomescreen - essential elements missing.");
             return;
         }
         const displayCount = pCount ?? '?'; // Use ?? for nullish coalescing
         console.log(`[UIManager] showHomescreen called. PlayerCount: ${displayCount}`);

         // Hide other screens
         this.loadingScreen.classList.remove('visible');
         this.gameUI.classList.remove('visible');
         this.canvas.style.visibility = 'hidden';

         // Reset join button state (important when returning to homescreen)
         if (this.joinButton) {
             // Enable button only if network seems okay (or let network connect handler enable it)
             this.joinButton.disabled = !(Network?.isConnected() || !networkIsInitialized); // Disable if explicitly disconnected, enable otherwise/initially
             this.joinButton.textContent = Network?.isConnected() ? "Join Game" : "Connecting..."; // Reflect status
             if(!Network?.isConnected() && networkIsInitialized) { this.joinButton.textContent = "Disconnected"; } // Specific message if known disconnected
         }
         // Update player count display
         if (this.playerCountSpan) {
             this.playerCountSpan.textContent = displayCount;
         }
         // Clear any previous error message *before* showing the screen
         // Don't clear if an error message was passed specifically for homescreen display (handled in listener)
          this.clearError('homescreen'); // Clear previous errors when showing homescreen

         // Show the homescreen
         this.homeScreen.classList.add('visible');
         console.log("[UIManager] Homescreen should now be visible.");
     },

     // Simplified 'joining' state - just updates button text on homescreen
     showJoining: function() {
         if (!this.joinButton || !this.homeScreen) {
             console.error("!!! UIManager: Cannot showJoining - joinButton or homeScreen missing.");
             return;
         }
         console.log(`[UIManager] showJoining called.`);
         // Ensure homescreen is technically visible if called directly
         // Note: This doesn't hide other screens, assumes already on homescreen
         this.homeScreen.classList.add('visible'); // Make sure it's visible
         this.joinButton.disabled = true;
         // Set text based on network status (handled in Network.attemptJoinGame)
         this.joinButton.textContent = Network?.isConnected() ? "Joining..." : "Connecting...";
         console.log("[UIManager] Join button state updated for joining/connecting.");
     },

     showGame: function() {
         if (!this.loadingScreen || !this.homeScreen || !this.gameUI || !this.canvas) {
             console.error("!!! UIManager: Cannot showGame - essential elements missing.");
             return;
         }
         console.log("[UIManager] showGame called.");

         // Hide other screens
         this.loadingScreen.classList.remove('visible');
         this.homeScreen.classList.remove('visible');

         // Show game UI overlay and canvas
         this.gameUI.classList.add('visible');
         this.canvas.style.visibility = 'visible'; // Make canvas visible

         // Update initial game info (if elements exist)
         if (this.infoDiv) {
             const playerName = window.localPlayerName || 'Player'; // Access global directly (ensure it's set)
             this.infoDiv.textContent = `Playing as ${playerName}`;
         }
         // Clear any lingering homescreen errors (just in case)
         this.clearError('homescreen');
         // Optionally clear kill messages on game start
         this.clearKillMessage();

         // Attempt to lock pointer automatically
         if(controls && !controls.isLocked) {
              console.log("[UIManager] Attempting Pointer Lock on entering game...");
              controls.lock(); // Input listener will handle UI changes (.locked class)
         }

         // *** ADDED: Verification Logs ***
         console.log("--- UI State Verification After showGame ---");
         console.log("LoadingScreen hidden? Classes:", this.loadingScreen.className, "Visible:", window.getComputedStyle(this.loadingScreen).display);
         console.log("Homescreen hidden? Classes:", this.homeScreen.className, "Visible:", window.getComputedStyle(this.homeScreen).display);
         console.log("GameUI visible? Classes:", this.gameUI.className, "Visible:", window.getComputedStyle(this.gameUI).display);
         console.log("Canvas visible? Style.visibility:", this.canvas.style.visibility, "Visible:", window.getComputedStyle(this.canvas).visibility);
         console.log("--- End Verification ---");
     },

     // --- UI Element Updates ---

     updatePlayerCount: function(count) {
         if (this.playerCountSpan) {
             this.playerCountSpan.textContent = count ?? '?';
         }
     },

     updateHealthBar: function(healthValue) {
         if (this.healthBarFill && this.healthText) {
             const hp = Math.max(0, Math.min(100, Math.round(healthValue)));
             const fillWidth = `${hp}%`;
             const backgroundPos = `${100 - hp}% 0%`; // Gradient position
             this.healthBarFill.style.width = fillWidth;
             // Only change background position if using gradient fill, otherwise width is enough
             this.healthBarFill.style.backgroundPosition = backgroundPos;
             this.healthText.textContent = `${hp}%`;
         } else {
             // console.warn("[UIManager] Health bar elements not found for update."); // Less critical warning
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
             this.homeScreenError.innerHTML = text; // Use innerHTML for <br/>
             this.homeScreenError.style.display = 'block'; // Ensure error is visible
             console.log("[UIManager] Displayed error on homescreen.");
             // Also ensure join button reflects error state if applicable
             if(this.joinButton) {
                  this.joinButton.disabled = true; // Usually disable on error
                  if (text.toLowerCase().includes("connect")) {
                      this.joinButton.textContent = "Connection Failed";
                  } else if (text.toLowerCase().includes("full")) {
                       this.joinButton.textContent = "Server Full";
                  } else if (text.toLowerCase().includes("network system error")) {
                       this.joinButton.textContent = "System Error";
                  } else {
                       this.joinButton.textContent = "Error"; // Generic error text
                  }
             }
         } else if (screen === 'loading' && this.loadingScreen) {
             // Loading screen error handled within showLoading
             this.showLoading(text, true); // Call showLoading with error flag
             console.log("[UIManager] Displayed error on loading screen via showLoading.");
         } else {
             console.error(`!!! UIManager: Error display target screen '${screen}' not handled or element missing for message: ${text}`);
             // Fallback: Alert the user? Only if really critical.
             // if (screen === 'loading') alert(`Critical Error: ${text}`);
         }
     },

     clearError: function(screen = 'homescreen') {
         // console.log(`[UIManager] Attempting clearError for screen: ${screen}`); // Optional log

         if (screen === 'homescreen' && this.homeScreenError) {
             if (this.homeScreenError.textContent !== '' || this.homeScreenError.style.display !== 'none') {
                 this.homeScreenError.textContent = ''; // Clear text content
                 this.homeScreenError.style.display = 'none'; // Hide error element
                 console.log("[UIManager] Cleared homescreen error text and hid element.");
             }
         } else if (screen === 'loading' && this.loadingScreen) {
             // Clearing loading error means removing class and resetting text color
             if (this.loadingScreen.classList.contains('error')) {
                  this.loadingScreen.classList.remove('error');
                  const pElement = this.loadingScreen.querySelector('p');
                  if (pElement) pElement.style.color = ''; // Reset text color
                  console.log("[UIManager] Cleared loading screen error style.");
             }
         }
         // No need to log if nothing was cleared
     },

     // --- Kill Messages ---

     showKillMessage: function(message) {
         if (this.killMessageTimeout) clearTimeout(this.killMessageTimeout); // Clear previous timeout

         if (this.killMessageDiv) {
             this.killMessageDiv.textContent = message;
             this.killMessageDiv.classList.add('visible'); // Make visible

             const duration = typeof CONFIG !== 'undefined' ? (CONFIG.KILL_MESSAGE_DURATION || 3500) : 3500;

             this.killMessageTimeout = setTimeout(() => {
                 if (this.killMessageDiv) this.killMessageDiv.classList.remove('visible'); // Hide after duration
                 this.killMessageTimeout = null; // Clear timeout ID
             }, duration);
         } else {
             console.warn("[UIManager] killMessageDiv not found, cannot show message:", message);
         }
     },

     clearKillMessage: function() {
         if (this.killMessageTimeout) clearTimeout(this.killMessageTimeout);
         this.killMessageTimeout = null;
         if (this.killMessageDiv) this.killMessageDiv.classList.remove('visible');
     }
};
window.UIManager = UIManager; // Export globally
console.log("uiManager.js loaded (REGENERATED with Debug Logs and Fixes)");
