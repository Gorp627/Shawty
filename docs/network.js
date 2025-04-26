// docs/network.js

// Needs access to globals and functions from other files
// Specifically needs CONFIG from config.js
// Accesses global state vars: players, bullets, localPlayerId
// Accesses global objects: stateMachine, socket, controls, velocityY, isOnGround, CONFIG
// Calls functions defined elsewhere: Network._addPlayer, Network._removePlayer, spawnBullet, UIManager methods
// Calls NEW global: attemptEnterPlayingState, initializationData, networkIsInitialized

var socket; // Global socket variable

const Network = {
    // --- Initialization and Connection ---
    init: function() {
        this.setupSocketIO();
        console.log("[Network] Initialized.");
    },

    isConnected: function() {
      return typeof socket !== 'undefined' && socket && socket.connected;
    },

    setupSocketIO: function() {
        if (typeof CONFIG === 'undefined' || !CONFIG.SERVER_URL) {
             console.error("!!! CRITICAL: CONFIG or CONFIG.SERVER_URL not defined!");
             if(typeof stateMachine !== 'undefined') stateMachine.transitionTo('loading',{message:"FATAL: Network Config Error!",error:true});
             return;
        }
        console.log(`[Network] Attempting connection to: ${CONFIG.SERVER_URL}`);
        try {
            if (typeof io === 'undefined') throw new Error("Socket.IO client library (io) not loaded!");
            socket = io(CONFIG.SERVER_URL, { transports: ['websocket'], autoConnect: true });
            console.log("[Network] Socket initialized, attaching listeners...");
        } catch (e) {
             console.error("!!! CRITICAL: Failed to initialize Socket.IO:", e);
              if(typeof stateMachine !== 'undefined') stateMachine.transitionTo('loading',{message:`FATAL: Network Init Error!<br/>${e.message}`,error:true});
             return;
        }

        // --- Socket Event Listeners ---
        socket.on('connect', () => {
            console.log('[Network] Socket Connected Successfully! ID:', socket.id);
            // If assets are already ready when we connect, attempt to enter playing state
            // (handles case where assets finish loading before socket connects)
             if (typeof window.attemptEnterPlayingState === 'function') {
                 window.attemptEnterPlayingState();
             }
        });

        socket.on('disconnect', (reason) => {
            console.warn('[Network] Socket Disconnected. Reason:', reason);
            networkIsInitialized = false; // Reset flag
            initializationData = null; // Clear stored data
            if (typeof stateMachine !== 'undefined') {
                 stateMachine.transitionTo('homescreen', { playerCount: 0 });
                 if (typeof UIManager !== 'undefined') { UIManager.updatePlayerCount(0); UIManager.showError("Disconnected from server.", 'homescreen'); }
            }
            // Cleanup local game state (moved mostly to game.js homescreen transition)
            if (typeof infoDiv !== 'undefined' && infoDiv) infoDiv.textContent = 'Disconnected';
             if (controls?.isLocked) controls.unlock();
        });

        socket.on('connect_error', (err) => {
            console.error('!!! [Network] Connection Error:', err.message);
             if (typeof stateMachine !== 'undefined') stateMachine.transitionTo('loading',{message:`Connection Failed!<br/>${err.message}`,error:true});
        });

        socket.on('playerCountUpdate', (count) => { if (typeof UIManager !== 'undefined') UIManager.updatePlayerCount(count); });

        // --- Game Specific Listeners ---
        socket.on('initialize',       (data) => { Network.handleInitialize(data); }); // **MODIFIED**
        socket.on('playerJoined',     (data) => { Network.handlePlayerJoined(data); });
        socket.on('playerLeft',       (id)   => { Network.handlePlayerLeft(id); });
        socket.on('gameStateUpdate',  (data) => { Network.handleGameStateUpdate(data); });
        socket.on('shotFired',        (data) => { Network.handleShotFired(data); });
        socket.on('healthUpdate',     (data) => { Network.handleHealthUpdate(data); });
        socket.on('playerDied',       (data) => { Network.handlePlayerDied(data); });
        socket.on('playerRespawned',  (data) => { Network.handlePlayerRespawned(data); });
        socket.on('serverFull',       ()     => { Network.handleServerFull(); });

        // --- Debug Listeners ---
        const DEBUG_NETWORK = true;
        socket.onAny((eventName, ...args) => { if (DEBUG_NETWORK && eventName !== 'gameStateUpdate') console.log(`[DEBUG Network RX] Event: ${eventName}`, args); });
        socket.on('ping', (data) => { console.log(">>> [Network] Received 'ping' from server:", data); });

        console.log("[Network] Socket listeners attached successfully.");
    }, // End setupSocketIO


    // --- Handlers for Server Events ---

    _getPlayer: function(id) { /* ... (no changes needed) ... */ return players[id] || null; },
    _addPlayer: function(playerData) { /* ... (no changes needed) ... */ if (typeof ClientPlayer === 'undefined') { console.error("ClientPlayer class missing"); return; } if (!players) { console.warn("players global missing"); return; } if (playerData && playerData.id && !players[playerData.id]) { console.log(`[Network] Adding player: ${playerData.name} (${playerData.id})`); players[playerData.id] = new ClientPlayer(playerData); } else if (players[playerData.id]) { console.warn(`[Network] Add existing player: ${playerData.id}`); } else { console.error(`[Network] Invalid player data:`, playerData); } },
    _removePlayer: function(playerId) { /* ... (no changes needed) ... */ const player = this._getPlayer(playerId); if (player) { console.log(`[Network] Removing player: ${player.name || playerId}`); if (typeof player.remove === 'function') { player.remove(); } else if (player.mesh && typeof scene !== 'undefined') { scene.remove(player.mesh); } delete players[playerId]; } else { console.warn(`[Network] Remove non-existent player: ${playerId}`); } },
    handleGameStateUpdate: function(state) { /* ... (no changes needed) ... */ if (!players || typeof state?.players !== 'object') return; if (!stateMachine?.is('playing') || !localPlayerId) return; for (const id in state.players) { const sPD = state.players[id], lPD = this._getPlayer(id); if (!lPD) { console.warn(`[Network GSU] Unknown player: ${id}`); continue; } if (id !== localPlayerId) { if (typeof lPD.updateData === 'function') { lPD.updateData(sPD); } else { console.warn(`[Network GSU] Player ${id} missing updateData.`); lPD.x=sPD.x; lPD.y=sPD.y; lPD.z=sPD.z; lPD.rotationY=sPD.r; lPD.health=sPD.h; lPD.setInterpolationTargets?.(); } } } },

    // ** MODIFIED handleInitialize **
    handleInitialize: function(data) {
         console.log('[Network] Received initialize event:', data);
         if (!data || !data.id || !data.players) {
             console.error("!!! Invalid initialize data received:", data);
             if (typeof stateMachine !== 'undefined') stateMachine.transitionTo('homescreen'); // Revert state
             if (typeof UIManager !== 'undefined') UIManager.showError("Initialization failed (Bad Data)", "homescreen");
             return;
         }

         // Store data and set flag instead of starting game immediately
         console.log("[Network] Storing initialization data and setting networkReady flag.");
         initializationData = data;   // Store in global variable (defined in game.js)
         networkIsInitialized = true; // Set global flag (defined in game.js)

         // Call the global function to check if both network and assets are ready
         if (typeof window.attemptEnterPlayingState === 'function') {
             window.attemptEnterPlayingState();
         } else {
             console.error("!!! attemptEnterPlayingState function is missing!");
             // Handle error - cannot proceed to playing state
             if (typeof stateMachine !== 'undefined') stateMachine.transitionTo('homescreen'); // Revert state
             if (typeof UIManager !== 'undefined') UIManager.showError("Game Startup Error (Internal)", "homescreen");
         }
    }, // End handleInitialize (MODIFIED)

    handlePlayerJoined: function(playerData) { /* ... (no changes needed) ... */ if (playerData && playerData.id !== localPlayerId && !this._getPlayer(playerData.id)) { console.log(`[Network] Player joined: ${playerData.name} (${playerData.id})`); this._addPlayer(playerData); } else if (!playerData || !playerData.id) { console.warn("[Network] Invalid playerJoined data:", playerData); } },
    handlePlayerLeft: function(playerId) { /* ... (no changes needed) ... */ if (playerId) { console.log(`[Network] Player left: ${players[playerId]?.name || playerId}`); this._removePlayer(playerId); } else { console.warn("[Network] Invalid playerLeft event (no ID)."); } },
    handleHealthUpdate: function(data) { /* ... (no changes needed) ... */ if (!data || data.health === undefined || !data.id) return; const p = this._getPlayer(data.id); if (p) { console.log(`>>> [Network RX] Health Update ${p.name||data.id}: ${data.health}`); p.health = data.health; if (data.id === localPlayerId && typeof UIManager !== 'undefined') UIManager.updateHealthBar(data.health); } else { console.warn(`[Network] Health update for unknown: ${data.id}`); } },
    handlePlayerDied: function(data) { /* ... (no changes needed) ... */ if (!data || !data.targetId) return; console.log(`>>> [Network RX] Player Died: ${data.targetId}, Killer: ${data.killerName || 'Env'}`); const p = this._getPlayer(data.targetId); if (p) { p.health = 0; if (data.targetId !== localPlayerId && typeof p.setVisible === 'function') p.setVisible(false); } else { console.warn(`[Network] Died event unknown target: ${data.targetId}`); } if (data.targetId === localPlayerId) { if (typeof UIManager !== 'undefined') { UIManager.updateHealthBar(0); let m = data.killerId ? `Got ${data.killerPhrase||'...'} by ${data.killerName}` : `Fell out.`; UIManager.showKillMessage(m); } if (typeof infoDiv !== 'undefined') infoDiv.textContent = `DEAD`; if (typeof Effects !== 'undefined') Effects.removeGunViewModel(); } else { if (data.killerId === localPlayerId && typeof UIManager !== 'undefined') UIManager.showKillMessage(`You ${players[localPlayerId]?.phrase||'...'} ${p?.name||'Someone'}`); } },
    handlePlayerRespawned: function(playerData) { /* ... (no changes needed) ... */ if (!playerData || !playerData.id) return; console.log(`>>> [Network RX] Respawn: ${playerData.name} (${playerData.id})`); let p = this._getPlayer(playerData.id); if (!p) { console.warn(`Respawn unknown ${playerData.id}, adding.`); this._addPlayer(playerData); p = this._getPlayer(playerData.id); } if (!p) return; p.health = playerData.health; p.x = playerData.x; p.y = playerData.y; p.z = playerData.z; p.rotationY = playerData.rotationY; p.name = playerData.name; p.phrase = playerData.phrase; if (playerData.id === localPlayerId) { const vY = p.y + (CONFIG?.PLAYER_HEIGHT || 1.8); if (controls?.getObject()) controls.getObject().position.set(p.x, vY, p.z); velocityY = 0; isOnGround = true; if (typeof UIManager !== 'undefined') { UIManager.updateHealthBar(p.health); UIManager.updateInfo(`Playing as ${p.name}`); UIManager.clearKillMessage(); } if (typeof Effects !== 'undefined') Effects.attachGunViewModel(); } else { if (typeof p.setVisible === 'function') p.setVisible(true); if (typeof p.setInterpolationTargets === 'function') { p.setInterpolationTargets(); if (p.mesh) { let vY = p.y + (p.mesh.geometry instanceof THREE.CylinderGeometry ? (CONFIG?.PLAYER_HEIGHT||1.8)/2 : 0); p.mesh.position.set(p.x, vY, p.z); p.mesh.rotation.y = p.rotationY; } } } },
    handleShotFired: function(data){ /* ... (no changes needed) ... */ if (!data?.shooterId || !data.position || !data.direction || !data.bulletId) return; if (typeof spawnBullet === 'function') spawnBullet(data); else console.error("!!! spawnBullet missing!"); },
    handleServerFull: function() { /* ... (no changes needed) ... */ console.warn("[Network] Received 'serverFull'."); if (socket) socket.disconnect(); if (typeof stateMachine !== 'undefined' && stateMachine.is('joining')) { stateMachine.transitionTo('homescreen'); if(typeof UIManager !== 'undefined') UIManager.showError("Server is full.", 'homescreen'); } else if (typeof UIManager !== 'undefined') UIManager.showError("Server is currently full.", 'homescreen'); },


     // --- Actions Sent To Server ---
     attemptJoinGame: function() { /* ... (no changes needed from previous version) ... */ console.log("--- [Network] attemptJoinGame called ---"); if (!UIManager?.playerNameInput || !UIManager.playerPhraseInput || !UIManager.homeScreenError) { console.error("!!! UI elements missing"); if(UIManager?.showError) UIManager.showError("UI Error", 'homescreen'); return; } localPlayerName = UIManager.playerNameInput.value.trim()||'Anon'; localPlayerPhrase = UIManager.playerPhraseInput.value.trim()||'...'; if (!localPlayerName){ UIManager.showError('Need name.', 'homescreen'); return; } if (localPlayerName.length > 16){ UIManager.showError('Name > 16.', 'homescreen'); return; } if (localPlayerPhrase.length > 20){ UIManager.showError('Phrase > 20.', 'homescreen'); return; } UIManager.clearError('homescreen'); let assetsReadyCheck = false, criticalAssetErrorCheck = false; if (typeof loadManager?.assets) { assetsReadyCheck = loadManager.requiredForGame.every(k=>loadManager.assets[k]?.state==='loaded'); criticalAssetErrorCheck = loadManager.requiredForGame.some(k=>loadManager.assets[k]?.state==='error'); console.log(`[Net] Join Asset Check: Ready=${assetsReadyCheck}, Error=${criticalAssetErrorCheck}`); } else { console.error("!!! LoadManager missing!"); criticalAssetErrorCheck = true; } if (criticalAssetErrorCheck) { UIManager.showError('Asset load error.', 'homescreen'); return; } if (!Network.isConnected()) { console.warn("[Net] Socket not connected. Waiting..."); UIManager.showError('Connecting...', 'homescreen'); if (UIManager.joinButton) { UIManager.joinButton.disabled = true; UIManager.joinButton.textContent = "Connecting..."; } if(typeof stateMachine!=='undefined') stateMachine.transitionTo('joining',{waitingForAssets: !assetsReadyCheck}); return; } console.log("[Net] Socket connected. Proceeding."); if(typeof stateMachine!=='undefined') stateMachine.transitionTo('joining', { waitingForAssets: !assetsReadyCheck }); if (assetsReadyCheck) { Network.sendJoinDetails(); } else { console.log("[Net] Waiting for assets..."); } },
     sendJoinDetails: function() { /* ... (no changes needed from previous version) ... */ console.log("--- [Network] sendJoinDetails called ---"); if (typeof stateMachine === 'undefined' || !stateMachine.is('joining')) { console.warn("! [Net] Not in 'joining' state."); stateMachine?.transitionTo('homescreen',{playerCount:UIManager?.playerCountSpan?.textContent??'?'}); return; } if (!Network.isConnected()) { console.error("! [Net] Socket disconnected."); if (typeof UIManager !== 'undefined') UIManager.showError('Connection lost.', 'homescreen'); stateMachine?.transitionTo('homescreen',{playerCount:UIManager?.playerCountSpan?.textContent??'?'}); return; } console.log(`[Net TX] setPlayerDetails - Name: ${localPlayerName}, Phrase: ${localPlayerPhrase}`); socket.emit('setPlayerDetails', { name: localPlayerName, phrase: localPlayerPhrase }); if (UIManager?.joinButton) { UIManager.joinButton.disabled = true; UIManager.joinButton.textContent = "Joining..."; } },
     sendPlayerUpdate: function(playerData) { if (Network.isConnected() && stateMachine?.is('playing')) socket.emit('playerUpdate', playerData);},
     sendShoot: function(shootData) { if (Network.isConnected() && stateMachine?.is('playing')) socket.emit('shoot', shootData);},
     sendHit: function(targetId, damageAmount) { if (Network.isConnected() && stateMachine?.is('playing')) { console.log(`[Net TX] Hit -> Tgt: ${targetId}, Dmg: ${damageAmount}`); socket.emit('hit', { targetId: targetId, damage: damageAmount }); }},
     sendVoidDeath: function() { if (Network.isConnected() && stateMachine?.is('playing')) { console.log("[Net TX] fellIntoVoid"); socket.emit('fellIntoVoid');}}

}; // End Network object

window.Network = Network;
console.log("network.js loaded");
