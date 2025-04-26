// docs/network.js

// Depends on: config.js, stateMachine.js, entities.js, input.js, effects.js, uiManager.js, game.js
// Accesses globals: players, localPlayerId, socket, controls, velocityY, isOnGround, CONFIG,
//                   stateMachine, UIManager, ClientPlayer, scene, infoDiv
// Calls globals:    attemptEnterPlayingState, initializationData, networkIsInitialized

var socket; // Global socket variable

const Network = {
    init: function() {
        this.setupSocketIO();
        console.log("[Network] Initialized.");
    },

    isConnected: function() {
        return typeof socket !== 'undefined' && socket && socket.connected;
    },

    setupSocketIO: function() {
        if (!CONFIG?.SERVER_URL) {
             console.error("!!! CRITICAL: CONFIG.SERVER_URL missing!");
             if(stateMachine) stateMachine.transitionTo('loading',{message:"FATAL: Net Config Error!",error:true});
             return;
        }
        console.log(`[Network] Connecting to: ${CONFIG.SERVER_URL}`);
        try {
            if(typeof io === 'undefined') throw new Error("Socket.IO missing!");
            socket = io(CONFIG.SERVER_URL, { transports: ['websocket'], autoConnect: true });
            console.log("[Network] Socket initialized...");
        } catch (e) {
            console.error("!!! Socket.IO Init Error:", e);
            if(stateMachine) stateMachine.transitionTo('loading',{message:`FATAL: Net Init Error!`,error:true});
            return;
        }

        // --- Socket Event Listeners ---
        socket.on('connect', () => {
            console.log('[Network] Socket Connected! ID:', socket.id);
            // Trigger state check when connected
             if (typeof window.attemptEnterPlayingState === 'function') {
                 window.attemptEnterPlayingState();
             } else { console.error("attemptEnterPlayingState missing on connect!"); }
        });

        socket.on('disconnect', (reason) => {
            console.warn('[Network] Disconnected:', reason);
            networkIsInitialized = false; // Reset flag
            initializationData = null; // Clear stored data
            if (typeof stateMachine !== 'undefined') {
                 stateMachine.transitionTo('homescreen', { playerCount: 0 }); // Go back to homescreen
                 if (typeof UIManager !== 'undefined') { UIManager.updatePlayerCount(0); UIManager.showError("Disconnected from server.", 'homescreen'); }
            }
            // Cleanup game state (now mainly handled by game.js 'homescreen' transition listener)
            if (typeof infoDiv !== 'undefined' && infoDiv) infoDiv.textContent = 'Disconnected';
             if (controls?.isLocked) controls.unlock(); // Ensure cursor is unlocked
        });

        socket.on('connect_error', (err) => {
            console.error('!!! [Network] Connection Error:', err.message);
             if (typeof stateMachine !== 'undefined') {
                 stateMachine.transitionTo('loading',{message:`Connection Failed!<br/>${err.message}`,error:true});
             }
        });

        socket.on('playerCountUpdate', (count) => {
             if (typeof UIManager !== 'undefined') UIManager.updatePlayerCount(count);
        });

        // --- Game Specific Listeners ---
        socket.on('initialize',       (data) => { Network.handleInitialize(data); });
        socket.on('playerJoined',     (data) => { Network.handlePlayerJoined(data); }); // MODIFIED for message
        socket.on('playerLeft',       (id)   => { Network.handlePlayerLeft(id); });     // MODIFIED for message
        socket.on('gameStateUpdate',  (data) => { Network.handleGameStateUpdate(data); });
        // socket.on('shotFired',        (data) => { Network.handleShotFired(data); }); // REMOVED
        socket.on('healthUpdate',     (data) => { Network.handleHealthUpdate(data); });
        socket.on('playerDied',       (data) => { Network.handlePlayerDied(data); }); // Simplified message
        socket.on('playerRespawned',  (data) => { Network.handlePlayerRespawned(data); });
        socket.on('serverFull',       ()     => { Network.handleServerFull(); });

        // --- Debug Listeners ---
        const DEBUG_NETWORK = true; // Set to false to reduce console noise
        if(DEBUG_NETWORK) socket.onAny((ev, ...args) => {
            // Avoid logging extremely frequent events unless necessary
            if(ev !== 'gameStateUpdate' /* && ev !== 'another_frequent_event' */) {
                console.log(`[DEBUG RX] ${ev}`, args);
            }
        });
        socket.on('ping', (data) => { console.log(">>> [Net] Ping:", data); });

        console.log("[Network] Listeners attached.");
    }, // End setupSocketIO


    // --- Handlers for Server Events ---

    // Utility functions remain the same
    _getPlayer: function(id) { return players[id] || null; },
    _addPlayer: function(playerData) { if(typeof ClientPlayer==='undefined')return; if(!players)return; if(playerData?.id && !players[playerData.id]){ console.log(`[Net] Add player: ${playerData.name}(${playerData.id})`); players[playerData.id] = new ClientPlayer(playerData); } },
    _removePlayer: function(playerId) { const p=this._getPlayer(playerId); if(p){ console.log(`[Net] Remove player: ${p.name||playerId}`); p.remove?.(); delete players[playerId]; } },

    // Initialize: Store data, set flag, attempt game entry
    handleInitialize: function(data) {
         console.log('[Net] RX initialize');
         if (!data?.id || !data.players) {
             console.error("Invalid initialize data");
             stateMachine?.transitionTo('homescreen');
             UIManager?.showError("Init Fail", "homescreen");
             return;
         }
         console.log("[Net] Storing init data, networkReady=true.");
         initializationData = data;
         networkIsInitialized = true;
         if(typeof window.attemptEnterPlayingState === 'function'){
             window.attemptEnterPlayingState();
         } else {
             console.error("attemptEnterPlayingState missing!");
             stateMachine?.transitionTo('homescreen');
             UIManager?.showError("Startup Error","homescreen");
         }
    },

    // Player Joined: Add player and show UI message
    handlePlayerJoined: function(playerData) {
        if (playerData?.id !== localPlayerId && !this._getPlayer(playerData.id)) {
             const name = playerData.name || 'A player';
             console.log(`[Network] Player joined: ${name} (${playerData.id})`);
             this._addPlayer(playerData); // Add player representation
             // Show join message in UI
             if (UIManager && UIManager.showKillMessage) { // Re-use kill message display
                 UIManager.showKillMessage(`${name} joined the game.`);
             }
        }
    },

    // Player Left: Remove player and show UI message
    handlePlayerLeft: function(playerId) {
        if (playerId) {
            const pName = players[playerId]?.name || 'A player'; // Get name before removing
            console.log(`[Network] Player left: ${pName} (${playerId})`);
            this._removePlayer(playerId);
             // Show leave message in UI
             if (UIManager && UIManager.showKillMessage) {
                 UIManager.showKillMessage(`${pName} left the game.`);
             }
        }
    },

    // Game State Update: Update remote player data
    handleGameStateUpdate: function(state) {
        if(!players || !state?.players || !stateMachine?.is('playing') || !localPlayerId) return;
        for (const id in state.players) {
            const serverPlayerData = state.players[id];
            const localPlayerData = this._getPlayer(id);
            if (!localPlayerData) continue; // Skip unknown players
            if (id !== localPlayerId) {
                 // Update remote player data using ClientPlayer method
                 localPlayerData.updateData?.(serverPlayerData);
            }
            // No need to update local player health from GSU, rely on specific health events
        }
    },

    // Shot Fired: REMOVED - No bullets to spawn
    // handleShotFired: function(data){ ... },

    // Health Update: Update player health, update UI for local player
    handleHealthUpdate: function(data) {
        if (!data?.id || data.health === undefined) return;
        const player = this._getPlayer(data.id);
        if (player) {
            player.health = data.health;
            // console.log(`[Net] Health update for ${player.name || data.id}: ${player.health}`); // Less verbose
            if (data.id === localPlayerId && UIManager) {
                UIManager.updateHealthBar(player.health);
            }
        }
    },

    // Player Died: Update state, show message, hide remote mesh
    handlePlayerDied: function(data) {
        if (!data?.targetId) return;
        console.log(`>>> [Net RX] Player Died: ${data.targetId}`);
        const targetPlayer = this._getPlayer(data.targetId);

        if (targetPlayer) {
            targetPlayer.health = 0;
            if (data.targetId !== localPlayerId) {
                targetPlayer.setVisible?.(false); // Hide remote player mesh
            }
        }

        // UI message updates
        if (data.targetId === localPlayerId) {
            if (UIManager) {
                UIManager.updateHealthBar(0);
                // Simplified message since there's no killer context without damage/bullets
                let message = data.killerId === null ? "Fell out." : "Eliminated."; // Use null killerId for environment death
                UIManager.showKillMessage(message);
            }
            if (infoDiv) infoDiv.textContent = `DEAD`;
            // No gun view model to remove
        } else {
            // Show message if someone else was eliminated (no killer context easily available now)
             if (UIManager) UIManager.showKillMessage(`${targetPlayer?.name || 'A player'} was eliminated.`);
        }
    },

    // Player Respawned: Update player data, show remote mesh, update local state/UI
    handlePlayerRespawned: function(playerData) {
        if (!playerData?.id) return;
        console.log(`>>> [Net RX] Player Respawned: ${playerData.name} (${playerData.id})`);
        let player = this._getPlayer(playerData.id);

        if (!player) { // If player wasn't known (e.g., joined while dead), add them now
            console.warn(`Respawn for unknown player ${playerData.id}, adding now.`);
            this._addPlayer(playerData);
            player = this._getPlayer(playerData.id);
        }
        if (!player) return; // Still couldn't find/add player

        player.updateData(playerData); // Update all data (pos, health, etc.)

        if (playerData.id === localPlayerId) {
            // Local player respawn logic
            const visualY = player.y + (CONFIG?.PLAYER_HEIGHT || 1.8);
            if (controls?.getObject()) {
                controls.getObject().position.set(player.x, visualY, player.z);
                // Optionally reset rotation on respawn:
                // controls.getObject().rotation.set(0, player.rotationY, 0);
            }
            velocityY = 0; isOnGround = true; // Reset physics state
            if (UIManager) {
                 UIManager.updateHealthBar(player.health);
                 UIManager.updateInfo(`Playing as ${player.name}`);
                 UIManager.clearKillMessage();
            }
            // No gun to re-attach
        } else {
            // Remote player respawn logic
            player.setVisible?.(true); // Make mesh visible again
            player.setInterpolationTargets?.(); // Update interpolation targets
            // Snap position instantly on respawn
            if (player.mesh) {
                let visualY = player.y + (player.mesh.geometry instanceof THREE.CylinderGeometry ? (CONFIG?.PLAYER_HEIGHT||1.8)/2 : 0);
                player.mesh.position.set(player.x, visualY, player.z);
                player.mesh.rotation.y = player.rotationY;
            }
        }
    },

    // Server Full
    handleServerFull: function() {
        console.warn("[Net] Server Full.");
        if(socket) socket.disconnect();
        if(stateMachine?.is('joining')){ stateMachine.transitionTo('homescreen'); if(UIManager) UIManager.showError("Server is full.",'homescreen'); }
        else if(UIManager) UIManager.showError("Server full.",'homescreen');
    },


     // --- Actions Sent To Server ---
     attemptJoinGame: function() { console.log("--- [Net] attemptJoinGame ---"); if (!UIManager?.playerNameInput || !UIManager.playerPhraseInput || !UIManager.homeScreenError) return; localPlayerName=UIManager.playerNameInput.value.trim()||'Anon'; localPlayerPhrase=UIManager.playerPhraseInput.value.trim()||'...'; if(!localPlayerName){UIManager.showError('Need name.','homescreen');return;} UIManager.clearError('homescreen'); let assetsRdy = false, critErr = false; if(loadManager?.assets){assetsRdy=loadManager.requiredForGame.every(k=>loadManager.isAssetReady(k));critErr=loadManager.requiredForGame.some(k=>!loadManager.assets[k]||loadManager.assets[k].state==='error');}else critErr=true; if(critErr){UIManager.showError('Asset error.','homescreen');return;} if(!Network.isConnected()){console.warn("[Net] Not connected.");UIManager.showError('Connecting...','homescreen');if(UIManager.joinButton){UIManager.joinButton.disabled=true;UIManager.joinButton.textContent="Connecting...";} stateMachine?.transitionTo('joining',{waitingForAssets:!assetsRdy});return;} console.log("[Net] Connected."); stateMachine?.transitionTo('joining',{waitingForAssets:!assetsRdy}); if(assetsRdy)Network.sendJoinDetails();else console.log("[Net] Waiting assets..."); },
     sendJoinDetails: function() { console.log("--- [Net] sendJoinDetails ---"); if(!stateMachine?.is('joining')){console.warn("Not joining state.");stateMachine?.transitionTo('homescreen',{playerCount:UIManager?.playerCountSpan?.textContent??'?'});return;} if(!Network.isConnected()){console.error("Socket disconnected.");UIManager?.showError('Connection lost.','homescreen');stateMachine?.transitionTo('homescreen',{playerCount:UIManager?.playerCountSpan?.textContent??'?'});return;} console.log(`[Net TX] setPlayerDetails - Name: ${localPlayerName}, Phrase: ${localPlayerPhrase}`); socket.emit('setPlayerDetails',{name:localPlayerName,phrase:localPlayerPhrase}); if(UIManager?.joinButton){UIManager.joinButton.disabled=true;UIManager.joinButton.textContent="Joining...";} },
     sendPlayerUpdate: function(d) { if(Network.isConnected() && stateMachine?.is('playing')) socket.emit('playerUpdate', d);},
     // sendShoot: function(d) { /* REMOVED */ },
     // sendHit: function(tId, dmg) { /* REMOVED */ },
     sendVoidDeath: function() { if(Network.isConnected()&&stateMachine?.is('playing')){console.log("[Net TX] fellIntoVoid"); socket.emit('fellIntoVoid');}}

}; // End Network object

window.Network = Network;
console.log("network.js loaded (Simplified - No Shooting)");
