// docs/uiManager.js

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
         // Query selectors for all UI elements
         this.loadingScreen=document.getElementById('loadingScreen');
         this.homeScreen=document.getElementById('homeScreen');
         this.gameUI=document.getElementById('gameUI');
         this.playerCountSpan=document.getElementById('playerCount');
         this.playerNameInput=document.getElementById('playerNameInput');
         this.playerPhraseInput=document.getElementById('playerPhraseInput');
         this.joinButton=document.getElementById('joinButton');
         this.homeScreenError=document.getElementById('homeScreenError');
         this.infoDiv=document.getElementById('info');
         this.healthBarFill=document.getElementById('healthBarFill');
         this.healthText=document.getElementById('healthText');
         this.killMessageDiv=document.getElementById('killMessage');
         this.canvas=document.getElementById('gameCanvas');
         // Basic check if elements were found
         if(!this.loadingScreen||!this.homeScreen||!this.gameUI||!this.canvas||!this.joinButton){
             console.error("!!! UIManager: One or more essential UI Elements Query Failed!");
             // Optionally display a fatal error to the user here
             document.body.innerHTML = "<p style='color:red; text-align:center; font-size: 1.5em;'>FATAL UI INIT ERROR!</p>";
             return false; // Indicate failure
         }
         console.log("[UIManager] Initialized.");
         return true; // Indicate success
     },

     bindStateListeners: function(stateMachine) {
         if (!stateMachine?.on) { console.error("UIManager: Invalid stateMachine provided for binding."); return; }
         // Add logging to each state handler
         stateMachine.on('loading', (opts={})=>{ console.log("[UIManager Listener] >> Loading State Triggered"); this.showLoading(opts.message, opts.error, opts.assets); });
         stateMachine.on('homescreen',(opts={})=>{ console.log("[UIManager Listener] >> Homescreen State Triggered"); this.showHomescreen(opts.playerCount); });
         stateMachine.on('joining',(opts={})=>{ console.log("[UIManager Listener] >> Joining State Triggered"); this.showJoining(opts.waitingForAssets); });
         stateMachine.on('playing',()=> { console.log("[UIManager Listener] >> Playing State Triggered"); this.showGame(); });
         console.log("[UIManager] State listeners bound.");
     },

     showLoading: function(msg="Loading...", err=false, assets=false){
         if(!this.loadingScreen || !this.homeScreen || !this.gameUI || !this.canvas) { console.error("UIManager: Cannot showLoading - elements missing."); return; }
         console.log(`[UIManager] showLoading: msg=${msg}, err=${err}`);
         // Ensure other screens are hidden
         this.homeScreen.classList.remove('visible');
         this.gameUI.classList.remove('visible');
         this.canvas.classList.remove('visible'); // Hide canvas too
         this.canvas.style.visibility = 'hidden'; // Use visibility for canvas

         // Prepare loading screen
         this.loadingScreen.classList.remove('error', 'assets'); // Clear previous states
         const p = this.loadingScreen.querySelector('p');
         if(p) p.innerHTML = msg; else console.warn("Loading screen <p> tag not found");
         if (assets) this.loadingScreen.classList.add('assets');
         if (err) { this.loadingScreen.classList.add('error'); if(p) p.style.color='red'; }
         else { if(p) p.style.color=''; } // Reset color if not error

         // Make loading screen visible
         this.loadingScreen.classList.add('visible');
     },

     showHomescreen: function(pCount='?'){
         if(!this.loadingScreen || !this.homeScreen || !this.gameUI || !this.canvas) { console.error("UIManager: Cannot showHomescreen - elements missing."); return; }
         console.log(`[UIManager] showHomescreen: pCount=${pCount}`);
         // Hide other screens
         this.loadingScreen.classList.remove('visible');
         this.gameUI.classList.remove('visible');
         this.canvas.classList.remove('visible');
         this.canvas.style.visibility = 'hidden';

         // Reset join button state (if it exists)
         if(this.joinButton){this.joinButton.disabled=false; this.joinButton.textContent="Join Game";}
         // Update player count (if it exists)
         if(this.playerCountSpan) this.playerCountSpan.textContent = pCount ?? '?'; // Use ?? for nullish coalescing

         // Show the homescreen
         this.homeScreen.classList.add('visible');
     },

     showJoining: function(waitAssets=false){
         // This state might just update button text while on homescreen or show loading
         if(!this.joinButton) { console.error("UIManager: Cannot showJoining - joinButton missing."); return; }
         console.log(`[UIManager] showJoining: waitAssets=${waitAssets}`);
         if(waitAssets && this.loadingScreen){ // Show loading screen if waiting for assets
             this.showLoading("Loading Assets...", false, true);
         } else if (this.homeScreen) { // Otherwise, update button text on homescreen
             this.homeScreen.classList.add('visible'); // Ensure homescreen is visible
             this.joinButton.disabled=true;
             this.joinButton.textContent="Joining...";
         }
     },

     showGame: function(){
         if(!this.loadingScreen || !this.homeScreen || !this.gameUI || !this.canvas) { console.error("UIManager: Cannot showGame - elements missing."); return; }
         console.log("[UIManager] showGame");
         // Hide other screens
         this.loadingScreen.classList.remove('visible');
         this.homeScreen.classList.remove('visible');
         // Show game UI and canvas
         this.gameUI.classList.add('visible');
         this.canvas.classList.add('visible');
         this.canvas.style.visibility = 'visible'; // Make canvas visible
         // Update initial game info
         if(this.infoDiv) this.infoDiv.textContent=`Playing as ${window.localPlayerName||'Player'}`; // Access global directly? OK for now.
         this.clearError('homescreen'); // Clear any lingering homescreen errors
     },

     updatePlayerCount: function(c){
         if(this.playerCountSpan) this.playerCountSpan.textContent=c;
         else console.warn("UIManager: playerCountSpan not found for update.");
     },

     updateHealthBar: function(h){
         if(this.healthBarFill && this.healthText){
             const hp = Math.max(0, Math.min(100, h)); // Clamp health 0-100
             const fillWidth = `${hp}%`;
             const backgroundPos = `${100-hp}% 0%`; // For gradient effect
             this.healthBarFill.style.width = fillWidth;
             this.healthBarFill.style.backgroundPosition = backgroundPos;
             this.healthText.textContent = `${Math.round(hp)}%`;
         } else { console.warn("UIManager: Health bar elements not found."); }
     },

     updateInfo: function(t){
         if(this.infoDiv) this.infoDiv.textContent=t;
         else console.warn("UIManager: infoDiv not found for update.");
     },

     showError: function(t, s='homescreen'){
         console.log(`[UIManager] showError called for screen '${s}': "${t}"`); // Log error call
         if(s==='homescreen' && this.homeScreenError){
             this.homeScreenError.textContent=t;
         } else if (s==='loading' && this.loadingScreen){
             const p = this.loadingScreen.querySelector('p');
             if(p){ p.innerHTML=t; p.style.color='red'; }
             this.loadingScreen.classList.add('error'); // Add error class for styling
         } else {
             console.error(`UI Error display target screen '${s}' not handled or element missing for message: ${t}`);
         }
     },

     clearError: function(s='homescreen'){ // Added 's' parameter
         console.log(`[UIManager] Attempting clearError for screen: ${s}`); // <<< ADD LOG
         if(s==='homescreen' && this.homeScreenError){
             this.homeScreenError.textContent=''; // Clear text content
             console.log("[UIManager] Cleared homescreen error text."); // <<< ADD LOG
         } else if (s==='loading' && this.loadingScreen){
             this.loadingScreen.classList.remove('error'); // Remove error class
             const p = this.loadingScreen.querySelector('p');
             if(p) p.style.color=''; // Reset text color
             console.log("[UIManager] Cleared loading error style."); // <<< ADD LOG
         }
     },

     showKillMessage: function(m){
         if(this.killMessageTimeout) clearTimeout(this.killMessageTimeout); // Clear previous timeout
         if(this.killMessageDiv){
             this.killMessageDiv.textContent=m;
             this.killMessageDiv.classList.add('visible');
             // Ensure CONFIG is accessible or use default
             const duration = typeof CONFIG !== 'undefined' ? (CONFIG.KILL_MESSAGE_DURATION || 3500) : 3500;
             this.killMessageTimeout = setTimeout(()=>{
                 if(this.killMessageDiv) this.killMessageDiv.classList.remove('visible');
             }, duration);
         } else { console.warn("UIManager: killMessageDiv not found."); }
     },

     clearKillMessage: function(){
         if(this.killMessageTimeout) clearTimeout(this.killMessageTimeout);
         if(this.killMessageDiv) this.killMessageDiv.classList.remove('visible');
     }
};
window.UIManager = UIManager; // Export globally
console.log("uiManager.js loaded (Added clearError Logging)");
