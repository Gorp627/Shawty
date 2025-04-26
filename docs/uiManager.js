// docs/uiManager.js

// Manages direct interaction with HTML UI elements

const UIManager = {
     // References (populated by initialize)
     loadingScreen: null, homeScreen: null, gameUI: null, playerCountSpan: null,
     playerNameInput: null, playerPhraseInput: null, joinButton: null, homeScreenError: null,
     infoDiv: null, healthBarFill: null, healthText: null, killMessageDiv: null, canvas: null,
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

         // Basic check
         if (!this.loadingScreen || !this.homeScreen || !this.gameUI || !this.canvas || !this.joinButton /* etc */ ) {
             console.error("!!! UIManager: Critical UI element missing during init!");
             document.body.innerHTML = "<p style='color:red;'>UI Element Init Error!</p>";
             return false; // Signal failure
         }
         console.log("[UIManager] Initialized.");
         return true; // Signal success
     },

     // Bind listeners to state changes (called by game.js)
     bindStateListeners: function(stateMachine) {
         if (!stateMachine || typeof stateMachine.on !== 'function') { console.error("UIManager: Invalid stateMachine"); return; }
         stateMachine.on('loading', (opts = {}) => this.showLoading(opts.message, opts.error, opts.assets));
         stateMachine.on('homescreen', (opts = {}) => this.showHomescreen(opts.playerCount));
         stateMachine.on('joining', (opts = {}) => this.showJoining(opts.waitingForAssets));
         stateMachine.on('playing', () => this.showGame());
          console.log("[UIManager] State listeners bound.");
     },

     // --- UI Visibility ---
     showLoading: function(message = "Loading...", isError = false, isAssets = false) {
         if(!this.loadingScreen) return;
         if(this.homeScreen) this.homeScreen.style.display = 'none'; this.homeScreen.classList.remove('visible');
         if(this.gameUI) this.gameUI.style.display = 'none'; this.gameUI.classList.remove('visible');
         if(this.canvas) this.canvas.style.display = 'none'; this.canvas.classList.remove('visible');
         this.loadingScreen.style.display = 'flex';
         const p = this.loadingScreen.querySelector('p');
         if (p) p.innerHTML = message;
         this.loadingScreen.classList.toggle('assets', !!isAssets);
         this.loadingScreen.classList.toggle('error', !!isError);
         if (p && isError) p.style.color = 'red'; else if (p) p.style.color = '';
     },
     showHomescreen: function(playerCount = '?') {
          if(!this.homeScreen) return;
          if(this.loadingScreen) this.loadingScreen.style.display = 'none';
          if(this.gameUI) this.gameUI.style.display = 'none'; this.gameUI.classList.remove('visible');
          if(this.canvas) this.canvas.style.display = 'none'; this.canvas.classList.remove('visible');
          if(this.joinButton) { this.joinButton.disabled = false; this.joinButton.textContent = "Join Game"; }
          if(this.playerCountSpan) this.playerCountSpan.textContent = playerCount ?? this.playerCountSpan.textContent ?? '?';
          this.homeScreen.style.display = 'flex';
          requestAnimationFrame(() => { this.homeScreen?.classList.add('visible'); });
     },
     showJoining: function(waitingAssets = false) {
         if (!this.joinButton || !this.loadingScreen) return;
         if (waitingAssets) { this.showLoading("Loading Assets..."); this.loadingScreen?.classList.add('assets'); }
         else { if (this.homeScreen) this.homeScreen.style.display = 'flex'; this.joinButton.disabled = true; this.joinButton.textContent = "Joining..."; }
     },
     showGame: function() {
         if(!this.gameUI || !this.canvas) return;
         if(this.loadingScreen) this.loadingScreen.style.display = 'none';
         if(this.homeScreen) this.homeScreen.style.display = 'none'; this.homeScreen.classList.remove('visible');
         this.gameUI.style.display = 'block';
         this.canvas.style.display = 'block';
         requestAnimationFrame(() => { this.gameUI?.classList.add('visible'); this.canvas?.classList.add('visible'); });
         if(this.infoDiv) this.infoDiv.textContent = `Playing as ${localPlayerName || 'Player'}`;
     },

     // --- In-Game UI Updates ---
     updatePlayerCount: function(count) { if(this.playerCountSpan) this.playerCountSpan.textContent = count; },
     updateHealthBar: function(health) { const hp = Math.max(0, Math.min(100, health)); if (this.healthBarFill && this.healthText) { const fW=`${hp}%`; const bP=`${100-hp}% 0%`; this.healthBarFill.style.width = fW; this.healthBarFill.style.backgroundPosition = bP; this.healthText.textContent = `${Math.round(hp)}%`; } },
     updateInfo: function(text) { if (this.infoDiv) this.infoDiv.textContent = text; },
     showError: function(text, screen = 'homescreen') { if(screen === 'homescreen' && this.homeScreenError) this.homeScreenError.textContent = text; else if(screen === 'loading' && this.loadingScreen) { const p = this.loadingScreen.querySelector('p'); if(p) { p.innerHTML = text; p.style.color = 'red'; } } else console.error(`UI Error: ${text}`); },
     clearError: function() { if(this.homeScreenError) this.homeScreenError.textContent = ''; },
     showKillMessage: function(message) { if(this.killMessageTimeout) clearTimeout(this.killMessageTimeout); if(this.killMessageDiv) { this.killMessageDiv.textContent = message; this.killMessageDiv.classList.add('visible'); this.killMessageTimeout = setTimeout(() => { if(this.killMessageDiv) this.killMessageDiv.classList.remove('visible'); }, CONFIG.KILL_MESSAGE_DURATION); } },
     clearKillMessage: function() { if(this.killMessageTimeout) clearTimeout(this.killMessageTimeout); if(this.killMessageDiv) this.killMessageDiv.classList.remove('visible'); }

};
window.UIManager = UIManager; // Export globally
console.log("uiManager.js loaded");
