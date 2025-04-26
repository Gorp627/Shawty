// docs/uiManager.js

// Manages direct interaction with HTML UI elements

const UIManager = {
     // References (should be populated after DOMContentLoaded)
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

     // Get references ONCE after DOM load
     initialize: function() {
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

         if (!this.loadingScreen || !this.homeScreen || !this.gameUI || !this.canvas || !this.joinButton /* etc */ ) {
             console.error("!!! UIManager: Critical UI element missing!");
             return false;
         }
         console.log("[UIManager] Initialized.");
         return true;
     },

     // Bind listeners to state changes
     bindStateListeners: function(stateMachine) {
         stateMachine.on('loading', (opts) => this.showLoading(opts.message, opts.error, opts.assets));
         stateMachine.on('homescreen', (opts) => this.showHomescreen(opts.playerCount));
         stateMachine.on('joining', (opts) => this.showJoining(opts.waitingForAssets));
         stateMachine.on('playing', () => this.showGame());
     },

     // --- UI Visibility ---
     showLoading: function(message = "Loading...", isError = false, isAssets = false) {
         if(!this.loadingScreen) return;
         // Hide others
         if(this.homeScreen) this.homeScreen.style.display = 'none';
         if(this.gameUI) this.gameUI.style.display = 'none';
         if(this.canvas) this.canvas.style.display = 'none';
         // Show loading
         this.loadingScreen.style.display = 'flex';
         const p = this.loadingScreen.querySelector('p');
         if (p) p.innerHTML = message;
         this.loadingScreen.classList.toggle('assets', !!isAssets);
         this.loadingScreen.classList.toggle('error', !!isError);
         if (p && isError) p.style.color = 'red'; else if (p) p.style.color = '';
     },
     showHomescreen: function(playerCount = 0) {
          if(!this.homeScreen) return;
          // Hide others
          if(this.loadingScreen) this.loadingScreen.style.display = 'none';
          if(this.gameUI) this.gameUI.style.display = 'none';
          if(this.canvas) this.canvas.style.display = 'none';
           // Ensure join button is usable
           if(this.joinButton) { this.joinButton.disabled = false; this.joinButton.textContent = "Join Game"; }
           // Show homescreen
          if(this.playerCountSpan) this.playerCountSpan.textContent = playerCount ?? this.playerCountSpan.textContent ?? '?';
          this.homeScreen.style.display = 'flex';
          requestAnimationFrame(() => { this.homeScreen.classList.add('visible'); }); // For CSS transition if added later
     },
     showJoining: function(waitingAssets = false) {
         if (!this.joinButton || !this.loadingScreen) return;
         if (waitingAssets) {
              this.showLoading("Loading Assets...");
              this.loadingScreen?.classList.add('assets');
         } else { // Visually stays on homescreen, just disable button
              if (this.homeScreen) this.homeScreen.style.display = 'flex'; // Make sure it's visible
               this.joinButton.disabled = true;
               this.joinButton.textContent = "Joining...";
         }
     },
     showGame: function() {
         if(!this.gameUI || !this.canvas) return;
         // Hide others
         if(this.loadingScreen) this.loadingScreen.style.display = 'none';
         if(this.homeScreen) this.homeScreen.style.display = 'none';
         // Show game elements
         this.gameUI.style.display = 'block';
         this.canvas.style.display = 'block';
         requestAnimationFrame(() => { this.gameUI.classList.add('visible'); });
         // Initial text
         if(this.infoDiv) this.infoDiv.textContent = `Playing as ${localPlayerName || 'Player'}`; // Use global name
     },

     // --- In-Game UI Updates ---
     updatePlayerCount: function(count) {
         if(this.playerCountSpan) this.playerCountSpan.textContent = count;
     },
     updateHealthBar: function(health) {
        const hp = Math.max(0, Math.min(100, health));
        if (this.healthBarFill && this.healthText) {
            const fillW=`${hp}%`; const bP=`${100-hp}% 0%`;
            this.healthBarFill.style.width = fillW; this.healthBarFill.style.backgroundPosition = bP;
            this.healthText.textContent = `${Math.round(hp)}%`;
        }
     },
     updateInfo: function(text) {
         if (this.infoDiv) this.infoDiv.textContent = text;
     },
     showError: function(text, screen = 'homescreen') {
          if(screen === 'homescreen' && this.homeScreenError) this.homeScreenError.textContent = text;
          else if(screen === 'loading' && this.loadingScreen) { // Show general error on loading screen
               const p = this.loadingScreen.querySelector('p');
               if(p) { p.innerHTML = text; p.style.color = 'red'; }
          }
          else console.error(`UI Error: ${text}`); // Fallback log
     },
     clearError: function() {
         if(this.homeScreenError) this.homeScreenError.textContent = '';
     },
     showKillMessage: function(message) {
         if (this.killMessageTimeout) clearTimeout(this.killMessageTimeout);
         if (this.killMessageDiv) {
             this.killMessageDiv.textContent = message;
             this.killMessageDiv.classList.add('visible');
             this.killMessageTimeout = setTimeout(() => {
                  if(this.killMessageDiv) this.killMessageDiv.classList.remove('visible');
             }, CONFIG.KILL_MESSAGE_DURATION);
         }
     },
     clearKillMessage: function() {
         if(this.killMessageTimeout) clearTimeout(this.killMessageTimeout);
         if(this.killMessageDiv) this.killMessageDiv.classList.remove('visible');
     }

};
console.log("uiManager.js loaded");
