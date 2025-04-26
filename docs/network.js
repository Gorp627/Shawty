// docs/network.js

// Depends on: config.js, stateMachine.js, entities.js, input.js, effects.js, uiManager.js, game.js
// Accesses globals: players, localPlayerId, socket, controls, velocityY, isOnGround, CONFIG,
//                   stateMachine, UIManager, ClientPlayer, scene, infoDiv
// Calls globals:    attemptEnterPlayingState, initializationData, networkIsInitialized

var socket; // Global socket variable

const Network = {
    init: function() { this.setupSocketIO(); console.log("[Network] Initialized."); },
    isConnected: function() { return typeof socket !== 'undefined' && socket && socket.connected; },

    setupSocketIO: function() {
        if (!CONFIG?.SERVER_URL) { console.error("!!! CRITICAL: CONFIG.SERVER_URL missing!"); if(stateMachine) stateMachine.transitionTo('loading',{message:"FATAL: Net Config Error!",error:true}); return; }
        console.log(`[Network] Connecting to: ${CONFIG.SERVER_URL}`);
        try { if(typeof io === 'undefined') throw new Error("Socket.IO missing!"); socket = io(CONFIG.SERVER_URL, { transports: ['websocket'], autoConnect: true }); console.log("[Network] Socket initialized..."); }
        catch (e) { console.error("!!! Socket.IO Init Error:", e); if(stateMachine) stateMachine.transitionTo('loading',{message:`FATAL: Net Init Error!`,error:true}); return; }

        // --- Socket Event Listeners ---
        socket.on('connect', () => { console.log('[Network] Socket Connected! ID:', socket.id); if(assetsAreReady && typeof window.attemptEnterPlayingState === 'function') window.attemptEnterPlayingState(); });
        socket.on('disconnect', (reason) => { console.warn('[Network] Disconnected:', reason); networkIsInitialized = false; initializationData = null; if(stateMachine) stateMachine.transitionTo('homescreen',{playerCount:0}); if(UIManager){UIManager.updatePlayerCount(0);UIManager.showError("Disconnected.",'homescreen');} if(infoDiv) infoDiv.textContent='Disconnected'; if(controls?.isLocked)controls.unlock(); });
        socket.on('connect_error', (err) => { console.error('!!! [Network] Connect Error:', err.message); if(stateMachine) stateMachine.transitionTo('loading',{message:`Connect Fail!<br/>${err.message}`,error:true}); });
        socket.on('playerCountUpdate', (count) => { if(UIManager) UIManager.updatePlayerCount(count); });

        // --- Game Specific Listeners ---
        socket.on('initialize',       (data) => { Network.handleInitialize(data); });
        socket.on('playerJoined',     (data) => { Network.handlePlayerJoined(data); }); // MODIFIED for message
        socket.on('playerLeft',       (id)   => { Network.handlePlayerLeft(id); });
        socket.on('gameStateUpdate',  (data) => { Network.handleGameStateUpdate(data); });
        // socket.on('shotFired',        (data) => { Network.handleShotFired(data); }); // REMOVED
        socket.on('healthUpdate',     (data) => { Network.handleHealthUpdate(data); });
        socket.on('playerDied',       (data) => { Network.handlePlayerDied(data); });
        socket.on('playerRespawned',  (data) => { Network.handlePlayerRespawned(data); });
        socket.on('serverFull',       ()     => { Network.handleServerFull(); });

        // --- Debug Listeners ---
        const DEBUG_NETWORK = true; if(DEBUG_NETWORK) socket.onAny((ev, ...args) => { if(ev !== 'gameStateUpdate') console.log(`[DEBUG RX] ${ev}`, args); });
        socket.on('ping', (data) => { console.log(">>> [Net] Ping:", data); });

        console.log("[Network] Listeners attached.");
    }, // End setupSocketIO

    // --- Handlers for Server Events ---
    _getPlayer: function(id) { return players[id] || null; },
    _addPlayer: function(playerData) { if(typeof ClientPlayer==='undefined')return; if(!players)return; if(playerData?.id && !players[playerData.id]){ console.log(`[Net] Add player: ${playerData.name}(${playerData.id})`); players[playerData.id] = new ClientPlayer(playerData); } },
    _removePlayer: function(playerId) { const p=this._getPlayer(playerId); if(p){ console.log(`[Net] Remove player: ${p.name||playerId}`); p.remove?.(); delete players[playerId]; } },
    handleInitialize: function(data) { console.log('[Net] RX initialize'); if (!data?.id || !data.players) { console.error("Invalid initialize data"); stateMachine?.transitionTo('homescreen'); UIManager?.showError("Init Fail", "homescreen"); return; } console.log("[Net] Storing init data, networkReady=true."); initializationData=data; networkIsInitialized=true; if(typeof window.attemptEnterPlayingState==='function'){window.attemptEnterPlayingState();}else{console.error("attemptEnterPlayingState missing!"); stateMachine?.transitionTo('homescreen'); UIManager?.showError("Startup Error","homescreen");} },

    // MODIFIED handlePlayerJoined
    handlePlayerJoined: function(playerData) {
        if (playerData?.id !== localPlayerId && !this._getPlayer(playerData.id)) {
             console.log(`[Network] Player joined: ${playerData.name} (${playerData.id})`);
             this._addPlayer(playerData); // Add player representation
             // Show join message in UI
             if (UIManager && UIManager.showKillMessage) { // Re-use kill message display for join message
                 UIManager.showKillMessage(`${playerData.name || 'A player'} joined the game.`);
             }
        }
    },
    handlePlayerLeft: function(playerId) { if (playerId) { const pName = players[playerId]?.name || playerId; this._removePlayer(playerId); if (UIManager && UIManager.showKillMessage) UIManager.showKillMessage(`${pName} left the game.`); } },
    handleGameStateUpdate: function(state) { if(!players||!state?.players||!stateMachine?.is('playing')||!localPlayerId)return; for(const id in state.players){const sPD=state.players[id],lPD=this._getPlayer(id);if(!lPD)continue;if(id!==localPlayerId)lPD.updateData?.(sPD);} },
    // handleShotFired: function(data){ /* ... REMOVED ... */ },
    handleHealthUpdate: function(data) { if(!data?.id||data.health===undefined)return; const p=this._getPlayer(data.id); if(p){ p.health=data.health; if(data.id===localPlayerId && UIManager)UIManager.updateHealthBar(data.health); } },
    handlePlayerDied: function(data) { if(!data?.targetId)return; const p=this._getPlayer(data.targetId); if(p){ p.health=0; if(data.targetId!==localPlayerId)p.setVisible?.(false); } if(data.targetId===localPlayerId){ if(UIManager){UIManager.updateHealthBar(0); let m = data.killerId?`Killed by ${data.killerName}`:`Fell out.`; UIManager.showKillMessage(m);} if(infoDiv) infoDiv.textContent=`DEAD`; /* No gun to remove */ } else { if(data.killerId===localPlayerId&&UIManager)UIManager.showKillMessage(`Eliminated ${p?.name||'Someone'}`); } }, // Simplified kill messages
    handlePlayerRespawned: function(pD) { if(!pD?.id)return; let p=this._getPlayer(pD.id); if(!p){this._addPlayer(pD);p=this._getPlayer(pD.id);} if(!p)return; p.updateData(pD); if(pD.id===localPlayerId){ const vY=p.y+(CONFIG?.PLAYER_HEIGHT||1.8); if(controls?.getObject())controls.getObject().position.set(p.x,vY,p.z); velocityY=0;isOnGround=true; if(UIManager){UIManager.updateHealthBar(p.health);UIManager.updateInfo(`Playing as ${p.name}`);UIManager.clearKillMessage();} }else{ p.setVisible?.(true); p.setInterpolationTargets?.(); if(p.mesh){let vY=p.y+(p.mesh.geometry instanceof THREE.CylinderGeometry?(CONFIG?.PLAYER_HEIGHT||1.8)/2:0);p.mesh.position.set(p.x,vY,p.z);p.mesh.rotation.y=p.rotationY;} } },
    handleServerFull: function() { console.warn("[Net] Server Full."); if(socket)socket.disconnect(); if(stateMachine?.is('joining')){stateMachine.transitionTo('homescreen');if(UIManager)UIManager.showError("Server is full.",'homescreen');}else if(UIManager)UIManager.showError("Server full.",'homescreen'); },


     // --- Actions Sent To Server ---
     attemptJoinGame: function() { console.log("--- [Net] attemptJoinGame ---"); if (!UIManager?.playerNameInput || !UIManager.playerPhraseInput || !UIManager.homeScreenError) return; localPlayerName=UIManager.playerNameInput.value.trim()||'Anon'; localPlayerPhrase=UIManager.playerPhraseInput.value.trim()||'...'; if(!localPlayerName){UIManager.showError('Need name.','homescreen');return;} UIManager.clearError('homescreen'); let assetsRdy = false, critErr = false; if(loadManager?.assets){assetsRdy=loadManager.requiredForGame.every(k=>loadManager.isAssetReady(k));critErr=loadManager.requiredForGame.some(k=>!loadManager.assets[k]||loadManager.assets[k].state==='error');}else critErr=true; if(critErr){UIManager.showError('Asset error.','homescreen');return;} if(!Network.isConnected()){console.warn("[Net] Not connected.");UIManager.showError('Connecting...','homescreen');if(UIManager.joinButton){UIManager.joinButton.disabled=true;UIManager.joinButton.textContent="Connecting...";} stateMachine?.transitionTo('joining',{waitingForAssets:!assetsRdy});return;} console.log("[Net] Connected."); stateMachine?.transitionTo('joining',{waitingForAssets:!assetsRdy}); if(assetsRdy)Network.sendJoinDetails();else console.log("[Net] Waiting assets..."); },
     sendJoinDetails: function() { console.log("--- [Net] sendJoinDetails ---"); if(!stateMachine?.is('joining')){console.warn("Not joining state.");stateMachine?.transitionTo('homescreen',{playerCount:UIManager?.playerCountSpan?.textContent??'?'});return;} if(!Network.isConnected()){console.error("Socket disconnected.");UIManager?.showError('Connection lost.','homescreen');stateMachine?.transitionTo('homescreen',{playerCount:UIManager?.playerCountSpan?.textContent??'?'});return;} console.log(`[Net TX] setPlayerDetails - Name: ${localPlayerName}, Phrase: ${localPlayerPhrase}`); socket.emit('setPlayerDetails',{name:localPlayerName,phrase:localPlayerPhrase}); if(UIManager?.joinButton){UIManager.joinButton.disabled=true;UIManager.joinButton.textContent="Joining...";} },
     sendPlayerUpdate: function(d) { if(Network.isConnected() && stateMachine?.is('playing')) socket.emit('playerUpdate', d);},
     // sendShoot: function(d) { /* ... REMOVED ... */},
     // sendHit: function(tId, dmg) { /* ... REMOVED ... */},
     sendVoidDeath: function() { if(Network.isConnected()&&stateMachine?.is('playing')){console.log("[Net TX] fellIntoVoid"); socket.emit('fellIntoVoid');}}

}; // End Network object

window.Network = Network;
console.log("network.js loaded (Simplified - No Shooting)");
