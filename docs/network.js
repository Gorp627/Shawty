// docs/network.js

// Depends on: config.js, stateMachine.js, entities.js, input.js, effects.js, uiManager.js, game.js
// Accesses globals: players, bullets, localPlayerId, socket, controls, velocityY, isOnGround, CONFIG,
//                   stateMachine, UIManager, ClientPlayer, scene, infoDiv
// Calls globals:    attemptEnterPlayingState, initializationData, networkIsInitialized, spawnBullet

var socket; // Global socket variable

const Network = {
    // --- Initialization and Connection ---
    init: function() { /* ... (no changes) ... */ this.setupSocketIO(); console.log("[Network] Initialized."); },
    isConnected: function() { /* ... (no changes) ... */ return typeof socket !== 'undefined' && socket && socket.connected; },

    setupSocketIO: function() {
        if (!CONFIG?.SERVER_URL) { /* ... error handling ... */ return; }
        console.log(`[Network] Attempting connection to: ${CONFIG.SERVER_URL}`);
        try { if (typeof io === 'undefined') throw new Error("Socket.IO lib missing!"); socket = io(CONFIG.SERVER_URL, { transports: ['websocket'], autoConnect: true }); console.log("[Network] Socket initialized..."); }
        catch (e) { console.error("!!! Socket.IO Init Error:", e); if(stateMachine) stateMachine.transitionTo('loading',{message:`FATAL: Network Init Error!`,error:true}); return; }

        // --- Socket Event Listeners ---
        socket.on('connect', () => {
            console.log('[Network] Socket Connected! ID:', socket.id);
            // If assets happen to be ready the moment we connect, try entering play state.
            // This covers the case where assets finish loading *before* the socket connects.
            if (assetsAreReady) { // Check the global flag from game.js
                 console.log("[Network] Socket connected and assets were already ready. Attempting to enter playing state.");
                 if (typeof window.attemptEnterPlayingState === 'function') {
                    window.attemptEnterPlayingState();
                 } else { console.error("attemptEnterPlayingState missing on connect!"); }
            } else {
                 console.log("[Network] Socket connected, waiting for assets.");
            }
        });

        socket.on('disconnect', (reason) => { /* ... (no changes - resets flags in game.js now) ... */ console.warn('[Network] Disconnected:', reason); networkIsInitialized = false; initializationData = null; if(stateMachine) stateMachine.transitionTo('homescreen',{playerCount:0}); if(UIManager){UIManager.updatePlayerCount(0);UIManager.showError("Disconnected.",'homescreen');} if(infoDiv) infoDiv.textContent='Disconnected'; if(controls?.isLocked)controls.unlock(); });
        socket.on('connect_error', (err) => { /* ... (no changes) ... */ console.error('!!! [Network] Connect Error:', err.message); if(stateMachine) stateMachine.transitionTo('loading',{message:`Connect Fail!<br/>${err.message}`,error:true}); });
        socket.on('playerCountUpdate', (count) => { /* ... (no changes) ... */ if(UIManager) UIManager.updatePlayerCount(count); });

        // --- Game Listeners ---
        socket.on('initialize',       (data) => { Network.handleInitialize(data); }); // Stays the same - calls modified handler
        socket.on('playerJoined',     (data) => { Network.handlePlayerJoined(data); });
        socket.on('playerLeft',       (id)   => { Network.handlePlayerLeft(id); });
        socket.on('gameStateUpdate',  (data) => { Network.handleGameStateUpdate(data); });
        socket.on('shotFired',        (data) => { Network.handleShotFired(data); });
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
    // ** handleInitialize is unchanged - still sets flags and calls attemptEnterPlayingState **
    handleInitialize: function(data) { console.log('[Network] RX initialize:', data); if (!data?.id || !data.players) { console.error("!!! Invalid initialize data:", data); stateMachine?.transitionTo('homescreen'); UIManager?.showError("Init Fail (Bad Data)", "homescreen"); return; } console.log("[Network] Storing init data, setting networkReady=true."); initializationData = data; networkIsInitialized = true; if(typeof window.attemptEnterPlayingState === 'function'){window.attemptEnterPlayingState();}else{console.error("!!! attemptEnterPlayingState missing!"); stateMachine?.transitionTo('homescreen'); UIManager?.showError("Startup Error (Internal)", "homescreen");} },

    // --- Other handlers (_getPlayer, _addPlayer, _removePlayer, GSU, etc.) remain unchanged ---
    _getPlayer: function(id) { return players[id] || null; },
    _addPlayer: function(playerData) { if (typeof ClientPlayer === 'undefined') { console.error("ClientPlayer missing"); return; } if (!players) { console.warn("players missing"); return; } if (playerData?.id && !players[playerData.id]) { console.log(`[Net] Add player: ${playerData.name} (${playerData.id})`); players[playerData.id] = new ClientPlayer(playerData); } else if (players[playerData.id]) { /* already exists */ } else { console.error(`[Net] Invalid player data:`, playerData); } },
    _removePlayer: function(playerId) { const p=this._getPlayer(playerId); if(p){ console.log(`[Net] Remove player: ${p.name||playerId}`); if(typeof p.remove==='function'){p.remove();} else if (p.mesh&&scene){scene.remove(p.mesh);} delete players[playerId]; } },
    handleGameStateUpdate: function(state) { if (!players||!state?.players) return; if (!stateMachine?.is('playing')||!localPlayerId) return; for (const id in state.players) { const sPD=state.players[id], lPD=this._getPlayer(id); if(!lPD) continue; if (id!==localPlayerId){ if(typeof lPD.updateData==='function'){lPD.updateData(sPD);}else{console.warn(`Player ${id} missing updateData.`);lPD.x=sPD.x; lPD.y=sPD.y; lPD.z=sPD.z; lPD.rotationY=sPD.r; lPD.health=sPD.h; lPD.setInterpolationTargets?.(); }}} },
    handlePlayerJoined: function(playerData) { if (playerData?.id !== localPlayerId && !this._getPlayer(playerData.id)) { this._addPlayer(playerData); } },
    handlePlayerLeft: function(playerId) { if (playerId) { this._removePlayer(playerId); } },
    handleHealthUpdate: function(data) { if (!data?.id || data.health===undefined) return; const p=this._getPlayer(data.id); if(p){ p.health = data.health; if (data.id === localPlayerId && UIManager) UIManager.updateHealthBar(data.health); } },
    handlePlayerDied: function(data) { if (!data?.targetId) return; const p = this._getPlayer(data.targetId); if (p) { p.health = 0; if (data.targetId !== localPlayerId && p.setVisible) p.setVisible(false); } if (data.targetId === localPlayerId) { if(UIManager){ UIManager.updateHealthBar(0); let m = data.killerId ? `Got ${data.killerPhrase||'...'} by ${data.killerName}` : `Fell out.`; UIManager.showKillMessage(m); } if(infoDiv) infoDiv.textContent=`DEAD`; if(Effects) Effects.removeGunViewModel(); } else { if (data.killerId === localPlayerId && UIManager) UIManager.showKillMessage(`You ${players[localPlayerId]?.phrase||'...'} ${p?.name||'Someone'}`); } },
    handlePlayerRespawned: function(playerData) { if (!playerData?.id) return; let p=this._getPlayer(playerData.id); if (!p) { this._addPlayer(playerData); p=this._getPlayer(playerData.id); } if (!p) return; p.health=playerData.health; p.x=playerData.x; p.y=playerData.y; p.z=playerData.z; p.rotationY=playerData.rotationY; p.name=playerData.name; p.phrase=playerData.phrase; if (playerData.id===localPlayerId) { const vY=p.y + (CONFIG?.PLAYER_HEIGHT||1.8); if(controls?.getObject()) controls.getObject().position.set(p.x, vY, p.z); velocityY=0; isOnGround=true; if(UIManager){ UIManager.updateHealthBar(p.health); UIManager.updateInfo(`Playing as ${p.name}`); UIManager.clearKillMessage(); } if(Effects) Effects.attachGunViewModel(); } else { if (p.setVisible) p.setVisible(true); if (p.setInterpolationTargets) { p.setInterpolationTargets(); if (p.mesh) { let vY = p.y + (p.mesh.geometry instanceof THREE.CylinderGeometry ? (CONFIG?.PLAYER_HEIGHT||1.8)/2 : 0); p.mesh.position.set(p.x,vY,p.z); p.mesh.rotation.y=p.rotationY; } } } },
    handleShotFired: function(data){ if (!data?.shooterId || !data.position || !data.direction || !data.bulletId) return; if (spawnBullet) spawnBullet(data); else console.error("spawnBullet missing!"); },
    handleServerFull: function() { console.warn("[Net] Server Full."); if(socket) socket.disconnect(); if (stateMachine?.is('joining')) { stateMachine.transitionTo('homescreen'); if(UIManager) UIManager.showError("Server is full.", 'homescreen'); } else if (UIManager) UIManager.showError("Server full.", 'homescreen'); },

    // --- Actions Sent To Server (No changes needed) ---
    attemptJoinGame: function() { console.log("--- [Net] attemptJoinGame ---"); if (!UIManager?.playerNameInput || !UIManager.playerPhraseInput || !UIManager.homeScreenError) { console.error("UI elements missing"); return; } localPlayerName = UIManager.playerNameInput.value.trim()||'Anon'; localPlayerPhrase = UIManager.playerPhraseInput.value.trim()||'...'; if (!localPlayerName){ UIManager.showError('Need name.', 'homescreen'); return; } if (localPlayerName.length > 16){ UIManager.showError('Name > 16.', 'homescreen'); return; } if (localPlayerPhrase.length > 20){ UIManager.showError('Phrase > 20.', 'homescreen'); return; } UIManager.clearError('homescreen'); let assetsRdy = false, criticalErr = false; if (loadManager?.assets) { assetsRdy = loadManager.requiredForGame.every(k=>loadManager.assets[k]?.state==='loaded'); criticalErr = loadManager.requiredForGame.some(k=>loadManager.assets[k]?.state==='error'); } else criticalErr = true; if (criticalErr) { UIManager.showError('Asset error.', 'homescreen'); return; } if (!Network.isConnected()) { console.warn("[Net] Not connected."); UIManager.showError('Connecting...', 'homescreen'); if (UIManager.joinButton){ UIManager.joinButton.disabled=true; UIManager.joinButton.textContent="Connecting...";} stateMachine?.transitionTo('joining',{waitingForAssets: !assetsRdy}); return; } console.log("[Net] Connected."); stateMachine?.transitionTo('joining', { waitingForAssets: !assetsRdy }); if (assetsRdy) Network.sendJoinDetails(); else console.log("[Net] Waiting assets..."); },
    sendJoinDetails: function() { console.log("--- [Net] sendJoinDetails ---"); if (!stateMachine?.is('joining')) { console.warn("Not joining state."); stateMachine?.transitionTo('homescreen',{playerCount:UIManager?.playerCountSpan?.textContent??'?'}); return; } if (!Network.isConnected()) { console.error("Socket disconnected."); UIManager?.showError('Connection lost.', 'homescreen'); stateMachine?.transitionTo('homescreen',{playerCount:UIManager?.playerCountSpan?.textContent??'?'}); return; } console.log(`[Net TX] setPlayerDetails - Name: ${localPlayerName}, Phrase: ${localPlayerPhrase}`); socket.emit('setPlayerDetails', { name: localPlayerName, phrase: localPlayerPhrase }); if (UIManager?.joinButton) { UIManager.joinButton.disabled = true; UIManager.joinButton.textContent = "Joining..."; } },
    sendPlayerUpdate: function(d) { if (Network.isConnected() && stateMachine?.is('playing')) socket.emit('playerUpdate', d);},
    sendShoot: function(d) { if (Network.isConnected() && stateMachine?.is('playing')) socket.emit('shoot', d);},
    sendHit: function(tId, dmg) { if (Network.isConnected() && stateMachine?.is('playing')) { console.log(`[Net TX] Hit -> Tgt:${tId}, Dmg:${dmg}`); socket.emit('hit', { targetId: tId, damage: dmg }); }},
    sendVoidDeath: function() { if (Network.isConnected() && stateMachine?.is('playing')) { console.log("[Net TX] fellIntoVoid"); socket.emit('fellIntoVoid');}}

}; // End Network object

window.Network = Network;
console.log("network.js loaded");
