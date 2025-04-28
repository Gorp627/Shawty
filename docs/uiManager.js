// docs/uiManager.js

const UIManager = {
     loadingScreen: null, homeScreen: null, gameUI: null, playerCountSpan: null, playerNameInput: null, playerPhraseInput: null, joinButton: null, homeScreenError: null, infoDiv: null, healthBarFill: null, healthText: null, killMessageDiv: null, canvas: null, killMessageTimeout: null,

     initialize: function() {
         // Query selectors...
         this.loadingScreen=document.getElementById('loadingScreen'); this.homeScreen=document.getElementById('homeScreen'); this.gameUI=document.getElementById('gameUI'); this.playerCountSpan=document.getElementById('playerCount'); this.playerNameInput=document.getElementById('playerNameInput'); this.playerPhraseInput=document.getElementById('playerPhraseInput'); this.joinButton=document.getElementById('joinButton'); this.homeScreenError=document.getElementById('homeScreenError'); this.infoDiv=document.getElementById('info'); this.healthBarFill=document.getElementById('healthBarFill'); this.healthText=document.getElementById('healthText'); this.killMessageDiv=document.getElementById('killMessage'); this.canvas=document.getElementById('gameCanvas');
         // Basic check if elements were found
         if(!this.loadingScreen||!this.homeScreen||!this.gameUI||!this.canvas||!this.joinButton){console.error("UI Element Query Failed!"); return false;}
         console.log("[UIManager] Initialized."); return true;
     },

     bindStateListeners: function(stateMachine) {
         if (!stateMachine?.on) { console.error("UIManager: Invalid stateMachine provided for binding."); return; }
         // Add logging to each state handler
         stateMachine.on('loading', (opts={})=>{ console.log("[UIManager Listener] >> Loading State"); this.showLoading(opts.message, opts.error, opts.assets); });
         stateMachine.on('homescreen',(opts={})=>{ console.log("[UIManager Listener] >> Homescreen State"); this.showHomescreen(opts.playerCount); });
         stateMachine.on('joining',(opts={})=>{ console.log("[UIManager Listener] >> Joining State"); this.showJoining(opts.waitingForAssets); });
         stateMachine.on('playing',()=> { console.log("[UIManager Listener] >> Playing State"); this.showGame(); });
         console.log("[UIManager] State listeners bound.");
     },

     showLoading: function(msg="Loading...", err=false, assets=false){
         if(!this.loadingScreen || !this.homeScreen || !this.gameUI || !this.canvas) return; // Ensure elements exist
         console.log(`[UIManager] showLoading: msg=${msg}, err=${err}`); // Log parameters
         this.homeScreen.classList.remove('visible'); this.gameUI.classList.remove('visible'); this.canvas.classList.remove('visible');
         this.loadingScreen.classList.remove('error', 'assets'); // Clear previous states
         const p = this.loadingScreen.querySelector('p');
         if(p) p.innerHTML = msg; else console.warn("Loading screen <p> tag not found");
         if (assets) this.loadingScreen.classList.add('assets');
         if (err) { this.loadingScreen.classList.add('error'); if(p) p.style.color='red'; } else { if(p) p.style.color=''; }
         this.loadingScreen.classList.add('visible'); // Ensure loading is visible
     },

     showHomescreen: function(pCount='?'){
         if(!this.loadingScreen || !this.homeScreen || !this.gameUI || !this.canvas) return;
         console.log(`[UIManager] showHomescreen: pCount=${pCount}`);
         this.loadingScreen.classList.remove('visible'); this.gameUI.classList.remove('visible'); this.canvas.classList.remove('visible');
         if(this.joinButton){this.joinButton.disabled=false; this.joinButton.textContent="Join Game";}
         if(this.playerCountSpan) this.playerCountSpan.textContent=pCount ?? '?'; // Use provided count or default
         this.homeScreen.classList.add('visible'); // Make homescreen visible
     },

     showJoining: function(waitAssets=false){
         if(!this.loadingScreen || !this.homeScreen || !this.joinButton) return;
         console.log(`[UIManager] showJoining: waitAssets=${waitAssets}`);
         if(waitAssets){ this.showLoading("Loading Assets..."); this.loadingScreen?.classList.add('assets'); }
         else { this.homeScreen.classList.add('visible'); this.joinButton.disabled=true; this.joinButton.textContent="Joining..."; } // Stay on homescreen but disable button
     },

     showGame: function(){
         if(!this.loadingScreen || !this.homeScreen || !this.gameUI || !this.canvas) return;
         console.log("[UIManager] showGame");
         this.loadingScreen.classList.remove('visible'); this.homeScreen.classList.remove('visible');
         this.gameUI.classList.add('visible'); this.canvas.classList.add('visible');
         if(this.infoDiv) this.infoDiv.textContent=`Playing as ${localPlayerName||'Player'}`;
     },

     updatePlayerCount: function(c){ if(this.playerCountSpan) this.playerCountSpan.textContent=c; },
     updateHealthBar: function(h){ /* ... (same logic) ... */ },
     updateInfo: function(t){ if(this.infoDiv)this.infoDiv.textContent=t; },
     showError: function(t,s='homescreen'){ if(s==='homescreen'&&this.homeScreenError){this.homeScreenError.textContent=t;} else if(s==='loading'&&this.loadingScreen){const p=this.loadingScreen.querySelector('p'); if(p){p.innerHTML=t; p.style.color='red'; this.loadingScreen.classList.add('error');}} else console.error(`UI Err [${s}]: ${t}`); },
     clearError: function(s='homescreen'){ if(s==='homescreen'&&this.homeScreenError){this.homeScreenError.textContent='';} else if (s==='loading'&&this.loadingScreen){this.loadingScreen.classList.remove('error'); const p=this.loadingScreen.querySelector('p'); if(p)p.style.color='';} },
     showKillMessage: function(m){ if(this.killMessageTimeout)clearTimeout(this.killMessageTimeout); if(this.killMessageDiv){this.killMessageDiv.textContent=m; this.killMessageDiv.classList.add('visible'); this.killMessageTimeout=setTimeout(()=>{if(this.killMessageDiv)this.killMessageDiv.classList.remove('visible');},CONFIG?.KILL_MESSAGE_DURATION || 3500);}},
     clearKillMessage: function(){ if(this.killMessageTimeout)clearTimeout(this.killMessageTimeout); if(this.killMessageDiv)this.killMessageDiv.classList.remove('visible');}
};
window.UIManager = UIManager; // Export globally
console.log("uiManager.js loaded");
