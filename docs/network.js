// docs/network.js

const Network = {
    init: function() { /* ... Same ... */ },
    isConnected: function() { /* ... Same ... */ },
    setupSocketIO: function() { /* ... Same ... */ },

    // --- Handlers for Server Events ---
    handleGameStateUpdate: function(state) { /* ... Same ... */ },
    handleInitialize: function(data) { /* ... Same ... */ },
    handlePlayerJoined: function(pD) { /* ... Same ... */ },
    handlePlayerLeft: function(pId) { /* ... Same ... */ },
    handleHealthUpdate: function(data) { /* ... Same ... */ },
    handlePlayerDied: function(data) { /* ... Same ... */ },
    handlePlayerRespawned: function(pD) { /* ... Same ... */ },
    handleShotFired: function(d){ if(typeof spawnBullet === 'function') spawnBullet(d); else console.error("spawnBullet missing!"); },


     // --- Actions Sent To Server ---
     attemptJoinGame: function() {
         console.log("--- attemptJoinGame called ---");

         // *** Get element references INSIDE the function call ***
         const pNameInput = document.getElementById('playerNameInput');
         const pPhraseInput = document.getElementById('playerPhraseInput');
         const hsError = document.getElementById('homeScreenError');

         // Check if elements were found THIS time
         if (!pNameInput || !pPhraseInput || !hsError) {
             console.error("!!! UI input/error elements missing when trying to join!");
             // Optionally display a general error or try reloading?
             alert("UI Error - please refresh.");
             return;
         }
         // *** -------------------------------------------- ***

         localPlayerName = pNameInput.value.trim() || 'Anonymous'; // Use local vars
         localPlayerPhrase = pPhraseInput.value.trim() || '...';   // Use local vars

         if (!localPlayerName){hsError.textContent='Enter name';return;}
         if (localPlayerPhrase.length>20){hsError.textContent='Phrase too long';return;}
         hsError.textContent=''; // Use local var

         // Check asset status directly via LoadManager
         let currentAssetsReady = false;
         let criticalAssetError = false;
         if (typeof loadManager !== 'undefined') {
             const mapOk = loadManager.assets.map?.state === 'loaded';
             const pModelOk = loadManager.assets.playerModel?.state === 'loaded';
             const gModelOk = loadManager.assets.gunModel?.state === 'loaded';
             currentAssetsReady = mapOk && pModelOk && gModelOk;
             criticalAssetError = loadManager.assets.map?.state === 'error' ||
                                  loadManager.assets.playerModel?.state === 'error' ||
                                  loadManager.assets.gunModel?.state === 'error';
             console.log(`Attempting Join as "${localPlayerName}" | Assets Check: ${currentAssetsReady}, Critical Error: ${criticalAssetError}`);
         } else {
             console.error("LoadManager not available!");
             criticalAssetError = true;
         }

         if (criticalAssetError) { hsError.textContent = 'Asset error. Cannot join.'; return; }

         if(typeof stateMachine!=='undefined') stateMachine.transitionTo('joining',{waitingForAssets:!currentAssetsReady}); else console.error("stateMachine missing!");

         if(currentAssetsReady){
             Network.sendJoinDetails(); // Assets ready
         } else {
             console.log("Wait assets..."); // Assets not ready
         }
     }, // End attemptJoinGame

     sendJoinDetails: function() { /* ... Same logic using global localPlayerName/Phrase, ensures hsError/playerCountSpan exist ... */ },
     sendPlayerUpdate: function(updateData) { /* ... Same ... */ },
     sendShoot: function(shootData) { /* ... Same ... */ },
     sendHit: function(targetId, damage) { /* ... Same ... */ },
     sendVoidDeath: function() { /* ... Same ... */ }

}; // End Network object

window.Network = Network; // Export globally
console.log("network.js loaded");
