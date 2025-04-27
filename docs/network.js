// docs/network.js (Adapted for Cannon-es)

// Depends on: config.js, stateMachine.js, entities.js, input.js, effects.js, uiManager.js, game.js
// Accesses globals: players, localPlayerId, socket, controls, CONFIG, CANNON,
//                   stateMachine, UIManager, ClientPlayer, scene, infoDiv, currentGameInstance, assetsAreReady, world

// Calls globals:    initializationData, networkIsInitialized

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
        if (typeof CONFIG === 'undefined' || !CONFIG?.SERVER_URL) {
             console.error("!!! CRITICAL: CONFIG or CONFIG.SERVER_URL missing!");
             if(typeof stateMachine !== 'undefined') stateMachine.transitionTo('loading',{message:"FATAL: Net Config Error!",error:true});
             return;
        }
        console.log(`[Network] Connecting to: ${CONFIG.SERVER_URL}`);
        try {
            if(typeof io === 'undefined') throw new Error("Socket.IO library not loaded!");
            socket = io(CONFIG.SERVER_URL, { transports: ['websocket'], autoConnect: true });
            console.log("[Network] Socket initialized...");
        } catch (e) {
            console.error("!!! Socket.IO Init Error:", e);
            if(typeof stateMachine !== 'undefined') stateMachine.transitionTo('loading',{message:`FATAL: Net Init Error! ${e.message}`,error:true});
            return;
        }

        // --- Socket Event Listeners ---
        socket.on('connect', () => {
            console.log('[Net] Socket Connected! ID:', socket.id);
            networkIsInitialized = true; // Set flag now connection is established

            if (stateMachine?.is('joining') && typeof assetsAreReady !== 'undefined' && assetsAreReady) {
                 console.log("[Net Connect Handler] State is 'joining' and assets ready. Sending join details...");
                 Network.sendJoinDetails();
            } else if (stateMachine?.is('joining') && (typeof assetsAreReady === 'undefined' || !assetsAreReady)) {
                 console.log("[Net Connect Handler] State is 'joining' but assets not ready. Waiting for assets...");
                 if(typeof UIManager !== 'undefined' && UIManager.joinButton) { UIManager.joinButton.disabled = true; UIManager.joinButton.textContent = "Loading Assets..."; }
            }
        });

        socket.on('disconnect', (reason) => {
            console.warn('[Net] Disconnected:', reason);
            networkIsInitialized = false; // Reset flag
            initializationData = null; // Clear stored data
            if (typeof stateMachine !== 'undefined') {
                 // game.js transition handler now clears players and physics bodies
                 stateMachine.transitionTo('homescreen', { playerCount: 0 });
                 if (typeof UIManager !== 'undefined') {
                     UIManager.updatePlayerCount(0);
                     UIManager.showError("Disconnected from server.", 'homescreen');
                 }
            }
            if (typeof infoDiv !== 'undefined' && infoDiv) infoDiv.textContent = 'Disconnected';
            if (typeof controls !== 'undefined' && controls?.isLocked) controls.unlock();
        });

        socket.on('connect_error', (err) => {
            console.error('!!! [Net] Connect Error:', err.message);
            networkIsInitialized = false; // Ensure flag is false on error
             if (typeof stateMachine !== 'undefined') {
                 if (stateMachine.is('loading') || stateMachine.is('joining')) {
                    stateMachine.transitionTo('loading',{message:`Connection Failed!<br/>${err.message}`,error:true});
                 } else {
                     stateMachine.transitionTo('homescreen');
                     if(typeof UIManager !== 'undefined') UIManager.showError(`Connection Failed: ${err.message}`, 'homescreen');
                 }
             }
        });

        socket.on('playerCountUpdate', (count) => {
             if (typeof UIManager !== 'undefined') UIManager.updatePlayerCount(count);
        });

        // --- Game Specific Listeners ---
        socket.on('initialize',       (data) => { Network.handleInitialize(data); });
        socket.on('playerJoined',     (data) => { Network.handlePlayerJoined(data); });
        socket.on('playerLeft',       (id)   => { Network.handlePlayerLeft(id); });
        socket.on('gameStateUpdate',  (data) => { Network.handleGameStateUpdate(data); });
        socket.on('healthUpdate',     (data) => { Network.handleHealthUpdate(data); });
        socket.on('playerDied',       (data) => { Network.handlePlayerDied(data); });
        socket.on('playerRespawned',  (data) => { Network.handlePlayerRespawned(data); });
        socket.on('serverFull',       ()     => { Network.handleServerFull(); });

        // --- Debug Listeners ---
        const DEBUG_NETWORK = false;
        if(DEBUG_NETWORK) socket.onAny((ev, ...args) => { if(ev !== 'gameStateUpdate') { console.log(`[DEBUG RX] ${ev}`, args); } });
        socket.on('ping', (data) => { console.log(">>> [Net] Ping:", data); });

        console.log("[Network] Listeners attached.");
    }, // End setupSocketIO


    // --- Handlers for Server Events ---

    _getPlayer: function(id) { return players[id] || null; },

    _addPlayer: function(playerData) { // Primarily creates the visual ClientPlayer
        if(typeof ClientPlayer === 'undefined'){ console.error("ClientPlayer class missing"); return null; }
        if(typeof players === 'undefined') { console.warn("players global object missing"); return null; }
        if(playerData?.id && !players[playerData.id]){
            console.log(`[Net] Creating ClientPlayer visual for: ${playerData.name || 'NoName'} (${playerData.id})`);
            players[playerData.id] = new ClientPlayer(playerData); // Creates visual representation
            return players[playerData.id];
        }
        return null;
    },

    _removePlayer: function(playerId) {
        const player = this._getPlayer(playerId);
        const playerBody = typeof currentGameInstance !== 'undefined' ? currentGameInstance.physicsBodies[playerId] : null;

        if (player || playerBody) {
            console.log(`[Net] Removing player & body: ${player?.name || playerId}`);
            // Remove visual mesh via ClientPlayer instance
            if (player && player instanceof ClientPlayer) {
                player.remove?.(); // ClientPlayer.remove handles THREE mesh cleanup
            }
            // Remove physics body from world and tracking object
            if (playerBody && typeof world !== 'undefined' && world) {
                 world.removeBody(playerBody);
                 if (typeof currentGameInstance !== 'undefined' && currentGameInstance.physicsBodies) {
                      delete currentGameInstance.physicsBodies[playerId];
                 }
                 console.log(`[Net] Removed physics body for ${playerId}`);
            } else if (playerBody) {
                 console.warn(`[Net] Found physics body for ${playerId} but no physics world to remove from!`);
            }

            // Remove player entry from global 'players' object (might already be cleared by game.js homescreen handler)
            if (players[playerId]) {
                 delete players[playerId];
            }
        } else {
             // console.warn(`[Net] Attempted to remove non-existent player/body: ${playerId}`);
        }
    },


    // Initialize: Trigger game start (which now creates physics bodies)
    handleInitialize: function(data) {
         console.log('[Net] RX initialize');
         if (!data?.id || !data.players) {
             console.error("Invalid initialize data received from server.");
             if (typeof stateMachine !== 'undefined') stateMachine.transitionTo('homescreen');
             if (typeof UIManager !== 'undefined') UIManager?.showError("Server Init Data Invalid", "homescreen");
             return;
         }
         initializationData = data; // Store data

         // Check assets and proceed (Game instance now handles physics body creation)
         if (typeof assetsAreReady !== 'undefined' && assetsAreReady) {
             console.log("[Net Initialize Handler] Assets ready. Starting game play...");
             if (typeof currentGameInstance !== 'undefined' && currentGameInstance?.startGamePlay) {
                 currentGameInstance.startGamePlay(initializationData); // Creates physics bodies
             } else {
                  console.error("[Net Initialize Handler] Game instance missing! Cannot start game.");
                  if (typeof stateMachine !== 'undefined') stateMachine.transitionTo('homescreen');
                  if (typeof UIManager !== 'undefined') UIManager?.showError("Client Startup Error", "homescreen");
             }
         } else {
             console.log("[Net Initialize Handler] Received initialize, but assets not ready.");
             if (stateMachine?.is('joining') && typeof UIManager !== 'undefined' && UIManager?.showLoading) {
                  UIManager.showLoading("Finalizing Assets...");
             }
         }
    }, // End handleInitialize

    handlePlayerJoined: function(playerData) {
         // Logic to add remote player (visual AND physics)
         if (playerData?.id !== localPlayerId && !this._getPlayer(playerData.id)) {
             const name = playerData.name || 'A player';
             console.log(`[Network] Player joined event: ${name} (${playerData.id})`);

             const newPlayer = this._addPlayer(playerData); // Adds visual ClientPlayer to scene

             // Create the Physics Body if visual part succeeded
             if (newPlayer instanceof ClientPlayer && typeof world !== 'undefined' && typeof currentGameInstance !== 'undefined' && typeof CANNON !== 'undefined') {
                  const playerMaterial = world.materials.find(m => m.name === "playerMaterial");
                 const remoteRadius = CONFIG?.PLAYER_RADIUS || 0.4;
                 const remoteHeight = CONFIG?.PLAYER_HEIGHT || 1.8;
                 const remoteShape = new CANNON.Sphere(remoteRadius);
                 const remoteBodyCenterY = playerData.y + remoteHeight / 2.0;
                 const remoteBody = new CANNON.Body({
                      mass: 0, shape: remoteShape,
                      position: new CANNON.Vec3(playerData.x, remoteBodyCenterY, playerData.z),
                      type: CANNON.Body.KINEMATIC, // KINEMATIC for remote players
                      material: playerMaterial
                 });
                 world.addBody(remoteBody);
                 currentGameInstance.physicsBodies[playerData.id] = remoteBody; // Store body ref
                 console.log(`[Network] Created kinematic physics body for joined player ${playerData.id}`);
                 remoteBody.quaternion.setFromEuler(0, playerData.rotationY || 0, 0); // Set initial rotation

             } else {
                  console.error(`[Network] Cannot create physics body for joined player ${playerData.id} - world, game instance, or CANNON missing!`);
             }

             if (typeof UIManager !== 'undefined' && UIManager.showKillMessage) { UIManager.showKillMessage(`${name} joined the game.`); }
         }
    },

    handlePlayerLeft: function(playerId) {
        if (playerId) {
            const pName = typeof players !== 'undefined' && players[playerId] ? players[playerId].name : 'A player';
            console.log(`[Network] Player left event: ${pName} (${playerId})`);
            this._removePlayer(playerId); // Calls helper to remove visual AND physics body
             if (typeof UIManager !== 'undefined' && UIManager.showKillMessage) {
                  UIManager.showKillMessage(`${pName} left the game.`);
             }
        }
    },

    // Update REMOTE players' KINEMATIC physics bodies based on server state
    handleGameStateUpdate: function(state) {
        if(!players || !state?.players || !stateMachine?.is('playing') || !localPlayerId || typeof currentGameInstance?.physicsBodies === 'undefined') return;

        for (const id in state.players) {
            const serverPlayerData = state.players[id]; // Lean data {id, x, y, z, r, h} y = feet

            if (id !== localPlayerId) { // Only update remote players
                 const remoteBody = currentGameInstance.physicsBodies[id];
                 const remotePlayer = players[id]; // ClientPlayer instance

                 if (remoteBody) { // Update physics body directly
                     const remoteHeight = CONFIG?.PLAYER_HEIGHT || 1.8;
                     const bodyCenterY = serverPlayerData.y + remoteHeight / 2.0;
                     remoteBody.position.set(serverPlayerData.x, bodyCenterY, serverPlayerData.z);
                     remoteBody.quaternion.setFromEuler(0, serverPlayerData.r || 0, 0); // Use 'r' for rotation
                 }
                  if (remotePlayer instanceof ClientPlayer && serverPlayerData.h !== undefined) {
                       remotePlayer.health = serverPlayerData.h;
                  }

            }
        }
    },

    handleHealthUpdate: function(data) {
        if (!data?.id || data.health === undefined) return;
        const player = this._getPlayer(data.id);
        if (player) {
            player.health = data.health; // Update the cached health value
            if (data.id === localPlayerId && typeof UIManager !== 'undefined') {
                UIManager.updateHealthBar(player.health);
            }
        }
    },

    handlePlayerDied: function(data) {
         if (!data?.targetId) return;
         console.log(`>>> [Net RX] Player Died: ${data.targetId}`);
         const targetPlayer = this._getPlayer(data.targetId); // Plain object (local) or ClientPlayer (remote)
         const targetBody = typeof currentGameInstance !== 'undefined' ? currentGameInstance.physicsBodies[data.targetId] : null;

         if (targetPlayer) targetPlayer.health = 0; // Update logical health cache

         if (data.targetId === localPlayerId) {
              if (typeof UIManager !== 'undefined') {
                  UIManager.updateHealthBar(0);
                  let message = data.killerId === null ? "Fell out." : "Eliminated.";
                  if (data.killerName && data.killerId !== null && targetPlayer) {
                       message = `${data.killerName} ${data.killerPhrase || 'eliminated'} ${targetPlayer.name}`;
                   }
                   UIManager.showKillMessage(message);
              }
              if (typeof infoDiv !== 'undefined') infoDiv.textContent = `DEAD`;
              if (typeof controls !== 'undefined' && controls?.isLocked) controls.unlock();
              if (targetBody) {
                   // Make local body static or disable temporarily if needed?
                   // For now, gameLogic 'isAlive' check should prevent input processing
              }
         } else if (targetPlayer instanceof ClientPlayer) {
              targetPlayer.setVisible?.(false); // Hide visual mesh
              if (typeof UIManager !== 'undefined') {
                 let message = `${targetPlayer.name || 'A player'} was eliminated.`;
                 if (data.killerName && data.killerId !== null) { message = `${data.killerName} ${data.killerPhrase || 'eliminated'} ${targetPlayer.name}`; }
                 else if (data.killerId === null) { message = `${targetPlayer.name || 'A player'} fell out.`; }
                 UIManager.showKillMessage(message);
               }
               // Remove remote body? Or wait for respawn to teleport it? Wait seems better.
         }
    },

    handlePlayerRespawned: function(playerData) {
        if (!playerData?.id) return;
        console.log(`>>> [Net RX] Player Respawned: ${playerData.name} (${playerData.id})`);
        let player = this._getPlayer(playerData.id); // Visual/cache representation
        let playerBody = typeof currentGameInstance !== 'undefined' ? currentGameInstance.physicsBodies[playerData.id] : null; // Physics body

        if (playerData.id === localPlayerId) {
             console.log("[Net] Handling LOCAL player respawn.");
             if (!player) { console.error("[Net] Local player object missing on respawn!"); player = { isLocal: true }; players[localPlayerId] = player; }
             if (!playerBody || typeof CANNON === 'undefined') { console.error("[Net] Local physics body or CANNON missing on respawn!"); return; }

             // Update local data object
             player.health = playerData.health; player.x = playerData.x; player.y = playerData.y; player.z = playerData.z;
             player.rotationY = playerData.rotationY; player.name = playerData.name; player.phrase = playerData.phrase;

             // TELEPORT Physics Body
             const playerHeight = CONFIG?.PLAYER_HEIGHT || 1.8;
             const bodyCenterY = playerData.y + playerHeight / 2.0; // Calc center from feet Y
             playerBody.position.set(playerData.x, bodyCenterY, playerData.z);
             playerBody.quaternion.setFromEuler(0, playerData.rotationY || 0, 0);
             playerBody.velocity.set(0, 0, 0);
             playerBody.angularVelocity.set(0, 0, 0);
             console.log("[Net] Teleported local physics body.");

             if (typeof UIManager !== 'undefined') {
                  UIManager.updateHealthBar(player.health);
                  UIManager.updateInfo(`Playing as ${player.name}`);
                  UIManager.clearKillMessage();
              }

        } else { // REMOTE Player Respawn
             console.log(`[Net] Handling REMOTE player respawn for ${playerData.name}.`);
             // Recreate if missing
             if (!player || !playerBody || !(player instanceof ClientPlayer)) {
                console.warn(`Respawn for missing remote player ${playerData.id}, recreating...`);
                 this._removePlayer(playerData.id);
                 this.handlePlayerJoined(playerData); // This now creates mesh+body
                 player = this._getPlayer(playerData.id);
                 playerBody = currentGameInstance?.physicsBodies[playerData.id];
                 if (!player || !playerBody || typeof CANNON === 'undefined') { console.error("Failed to recreate remote player/body on respawn!"); return; }
             }

             player.updateData(playerData); // Update health/name etc.
             player.setVisible?.(true);

             // TELEPORT Remote Kinematic Body
             const remoteHeight = CONFIG?.PLAYER_HEIGHT || 1.8;
             const remoteBodyCenterY = playerData.y + remoteHeight / 2.0;
             playerBody.position.set(playerData.x, remoteBodyCenterY, playerData.z);
             playerBody.quaternion.setFromEuler(0, playerData.rotationY || 0, 0);
             console.log("[Net] Teleported remote physics body.");
        }
    },

    handleServerFull: function() {
        console.warn("[Net] Server Full.");
        if(socket) socket.disconnect();
        if(typeof stateMachine !== 'undefined') stateMachine.transitionTo('loading',{message:`Server is Full!`,error:true});
    },


     // --- Actions Sent To Server ---
     attemptJoinGame: function() {
         console.log("--- [Net] attemptJoinGame ---");
        if (typeof UIManager === 'undefined' || !UIManager?.playerNameInput || !UIManager.playerPhraseInput) { console.error("UI Inputs missing!"); return; }
        localPlayerName = UIManager.playerNameInput.value.trim() || 'Anon';
        localPlayerPhrase = UIManager.playerPhraseInput.value.trim() || '...';
        if (!localPlayerName) { UIManager.showError('Please enter a name.', 'homescreen'); return; }
        UIManager.clearError('homescreen');
        if (typeof assetsAreReady === 'undefined' || !assetsAreReady) { console.warn("[Net] Assets not ready."); UIManager.showError('Assets still loading...', 'homescreen'); return; }
        if (typeof stateMachine !== 'undefined') stateMachine?.transitionTo('joining');
        if (UIManager.joinButton) { UIManager.joinButton.disabled = true; UIManager.joinButton.textContent = "Joining..."; }
        if (Network.isConnected()) { console.log("[Net] Already connected. Sending join details..."); Network.sendJoinDetails(); }
        else { console.log("[Net] Not connected. Waiting for connection..."); if (UIManager.joinButton) { UIManager.joinButton.textContent = "Connecting..."; } if (socket && !socket.active) { socket.connect(); } }
     },

     sendJoinDetails: function() {
         if (typeof stateMachine === 'undefined' || !stateMachine?.is('joining')) { console.warn("Not joining state."); return; }
         if (!Network.isConnected()) { console.error("Socket disconnected."); stateMachine?.transitionTo('homescreen', { playerCount: UIManager?.playerCountSpan?.textContent ?? '?' }); UIManager?.showError('Connection lost.', 'homescreen'); return; }
         console.log(`[Net TX] setPlayerDetails Name: ${localPlayerName}, Phrase: ${localPlayerPhrase}`);
         socket.emit('setPlayerDetails', { name: localPlayerName, phrase: localPlayerPhrase });
     },

     sendPlayerUpdate: function(data) {
         const localPlayer = this._getPlayer(localPlayerId);
         if(Network.isConnected() && stateMachine?.is('playing') && localPlayer?.health > 0) {
             socket.emit('playerUpdate', data); // Includes updated Y position now
         }
    },

     sendVoidDeath: function() {
        if(Network.isConnected() && stateMachine?.is('playing')){
             console.log("[Net TX] fellIntoVoid");
             socket.emit('fellIntoVoid');
        }
    }

}; // End Network object

window.Network = Network;
console.log("network.js loaded (Cannon-es Integration)");
