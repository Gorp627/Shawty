// --- START OF FULL network.js FILE ---
// docs/network.js (Cannon.js Prereq Fix v2)

// Depends on: config.js, stateMachine.js, entities.js, input.js, uiManager.js, game.js, gameLogic.js, effects.js
// Accesses globals: players, localPlayerId, socket, controls, CONFIG, CANNON, cannonWorld, // Using CANNON globals now
//                   stateMachine, UIManager, ClientPlayer, scene, infoDiv, currentGameInstance, assetsAreReady, physicsIsReady, Effects, applyShockwave

var socket; // Global socket variable

const Network = {
    init: function() {
        this.setupSocketIO();
        console.log("[Network] Initialized and requested socket connection.");
    },

    isConnected: function() {
        // Ensure socket exists and has the connected property true
        return typeof socket !== 'undefined' && socket && socket.connected === true;
    },

    setupSocketIO: function() {
        if (!CONFIG?.SERVER_URL) {
             console.error("!!! Network Error: CONFIG.SERVER_URL is not defined!");
             stateMachine?.transitionTo('loading',{message:"Network Config Error!",error:true});
             return;
        }
        console.log(`[Network] Attempting to connect to server: ${CONFIG.SERVER_URL}`);
        try {
             if (typeof io === 'undefined') throw new Error("Socket.IO client library (io) not found!");
             // Prioritize websocket, allow polling as fallback
             socket = io(CONFIG.SERVER_URL, {
                 transports: ['websocket', 'polling'],
             });
             console.log("[Network] Socket.IO object created. Waiting for connection events...");
        }
        catch (e) {
             console.error("!!! Socket.IO Initialization Error:", e);
             stateMachine?.transitionTo('loading',{message:`Net Init Error!<br/>${e.message}`,error:true});
             return;
        }

        // --- Socket Event Listeners ---
        socket.on('connect', () => {
            console.log('[Network] Socket Connected! ID:', socket.id);
            // Access global flag from config.js scope
            window.networkIsInitialized = true; // Set flag

            // Update UI state on successful connection
            if (typeof UIManager !== 'undefined') {
                 UIManager.clearError('homescreen'); // Clear previous connection errors
                 // If we were trying to join when connection succeeded
                 if (stateMachine?.is('joining')) {
                     console.log("[Network Connect] Was in 'joining' state, sending details now.");
                      if (UIManager.joinButton) UIManager.joinButton.textContent = "Joining..."; // Ensure text is correct
                     Network.sendJoinDetails();
                 } else if (stateMachine?.is('homescreen') && UIManager.joinButton) {
                     // If just connected while on homescreen, enable join button
                     UIManager.joinButton.disabled = false;
                     UIManager.joinButton.textContent = "DEPLOY"; // Use new button text
                     console.log("[Network Connect] Reset Join Button state on homescreen.");
                 }
            }
            // Check if ready to proceed (e.g., if assets/physics finished while disconnected)
            currentGameInstance?.attemptProceedToGame();
        });

        socket.on('disconnect', (reason) => {
            console.warn('[Network] Socket Disconnected. Reason:', reason);
            window.networkIsInitialized = false; // Use global scope
            window.initializationData = null; // Use global scope

            // Only transition back to homescreen if currently playing or joining
            if (stateMachine?.is('playing') || stateMachine?.is('joining')) {
                // *** CRITICAL: Cleanup ALL player objects and bodies on disconnect ***
                currentGameInstance?.cleanupAllPlayers(); // Use game's cleanup method
                console.log("[Network Disconnect] Cleaned up player objects after disconnect.");
                // *** END CRITICAL Cleanup ***

                stateMachine?.transitionTo('homescreen', { playerCount: 0 }); // Reset player count
                 if(UIManager) {
                     UIManager.updatePlayerCount(0);
                     let errorMsg = "Disconnected.";
                     if (reason === 'io server disconnect') errorMsg = "Kicked or server shut down.";
                     else if (reason === 'io client disconnect') errorMsg = "Left the game."; // Manual disconnect
                     else if (reason === 'ping timeout' || reason === 'transport close' || reason === 'transport error') errorMsg = "Connection lost.";
                     UIManager.showError(errorMsg, 'homescreen');
                 }
                 // Use global references safely
                 const globalInfoDiv = window.infoDiv; // Get from global scope if needed
                 if(globalInfoDiv) globalInfoDiv.textContent='Disconnected';
                 const globalControls = window.controls;
                 if(globalControls?.isLocked) globalControls.unlock();

             } else {
                  console.log("[Network] Disconnected while not in playing/joining state.");
                  // If on homescreen, maybe disable join button until reconnected
                  if (stateMachine?.is('homescreen') && UIManager?.joinButton) {
                      UIManager.joinButton.disabled = true;
                      UIManager.joinButton.textContent = "Disconnected";
                  }
             }
             // Cleanup game state (bodies, players) is handled by the state transition listener in game.js OR explicitly above
        });

        socket.on('connect_error', (err) => {
            console.error('[Network] Connection Error:', err.message, err); // Log full error object
            window.networkIsInitialized = false; // Use global scope
            // Transition back to loading/homescreen with error message
            const errorMsg = `Connection Failed!<br/>Check Console (F12).`; // Simpler message for UI
            if (stateMachine?.is('loading') || stateMachine?.is('joining')) {
                 stateMachine.transitionTo('loading', { message: errorMsg, error: true });
            } else {
                 stateMachine?.transitionTo('homescreen'); // Ensure on homescreen
                 UIManager?.showError(errorMsg, 'homescreen');
                 if (UIManager?.joinButton) { // Disable join on connection failure
                      UIManager.joinButton.disabled = true;
                      UIManager.joinButton.textContent = "Connection Failed";
                 }
            }
        });

        socket.on('playerCountUpdate', (count) => {
            if (UIManager) UIManager.updatePlayerCount(count);
        });

        // Game-specific events
        socket.on('initialize', (data) => Network.handleInitialize(data) );
        socket.on('playerJoined', (data) => Network.handlePlayerJoined(data) );
        socket.on('playerLeft', (id) => Network.handlePlayerLeft(id) );
        socket.on('gameStateUpdate', (data) => Network.handleGameStateUpdate(data) );
        socket.on('healthUpdate', (data) => Network.handleHealthUpdate(data) );
        socket.on('playerDied', (data) => Network.handlePlayerDied(data) );
        socket.on('playerRespawned', (data) => Network.handlePlayerRespawned(data) );
        socket.on('serverFull', () => Network.handleServerFull() );

        console.log("[Network] Core socket event listeners attached.");
    },

    // --- Helper Functions ---
    _getPlayer: function(id) { return (typeof window !== 'undefined' && window.players) ? window.players[id] || null : null; },

    _addPlayer: function(playerData) {
        if (typeof window === 'undefined' || !window.ClientPlayer || !window.players) {
             console.error("!!! Cannot add player: ClientPlayer class or global players object missing.");
             return null;
        }
        if (playerData?.id && !window.players[playerData.id]) {
            console.log(`[Network] Creating ClientPlayer visual instance for: ${playerData.name || '??'} (ID: ${playerData.id})`);
            try {
                 window.players[playerData.id] = new ClientPlayer(playerData); // Assumes ClientPlayer is defined globally
                 return window.players[playerData.id];
            } catch (e) {
                 console.error(`!!! Error creating ClientPlayer instance for ${playerData.id}:`, e);
                 return null;
            }
        } else if (window.players[playerData.id]) {
            console.warn(`[Network] Attempted to add player ${playerData.id} but they already exist in global players.`);
            return window.players[playerData.id]; // Return existing player
        } else {
            console.warn(`[Network] Attempted to add player with invalid data or missing ID:`, playerData);
            return null;
        }
    },

    _removePlayer: function(playerId) {
         // Delegate cleanup to the Game instance
         if (currentGameInstance && typeof currentGameInstance.cleanupPlayer === 'function') {
             currentGameInstance.cleanupPlayer(playerId);
             console.log(`[Network] Requested cleanup for player ${playerId} via Game instance.`);
         } else {
              console.warn(`[Network] Cannot remove player ${playerId}: Game instance or cleanupPlayer method missing.`);
              const player = this._getPlayer(playerId);
              if (player instanceof ClientPlayer) {
                   player.remove?.(); // Remove mesh if method exists
                   if (window.players) delete window.players[playerId];
              }
         }
    },

    // --- Event Handlers ---
    handleInitialize: function(data) {
        console.log('[Network] RX initialize');
        if (!data?.id || typeof data.players !== 'object') {
             console.error("!!! Invalid initialization data received from server:", data);
             if(stateMachine && !stateMachine.is('homescreen')) stateMachine.transitionTo('homescreen');
             UIManager?.showError("Server Init Invalid!", "homescreen");
             return;
        }
        // Access global var from config.js scope
        window.initializationData = data; // Store the data
        window.networkIsInitialized = true; // Ensure flag is set using global scope
        console.log("[Network] Initialization data stored. Attempting to proceed to game...");
        currentGameInstance?.attemptProceedToGame();
    },

    handlePlayerJoined: function(playerData) {
        if (playerData?.id === window.localPlayerId) return; // Use global scope

        if (playerData?.id && !this._getPlayer(playerData.id) && stateMachine?.is('playing')) {
             const name = playerData.name || 'Player';
             console.log(`[Network] RX playerJoined: ${name} (ID: ${playerData.id})`);

             const newPlayer = this._addPlayer(playerData); // Adds to window.players object

             // Create Cannon.js Kinematic Body
             const globalCannon = window.CANNON; // Use global scope
             const globalCannonWorld = window.cannonWorld; // Use global scope

             if (newPlayer instanceof ClientPlayer && newPlayer.mesh && globalCannon && globalCannonWorld && currentGameInstance && typeof currentGameInstance.createPlayerPhysicsBody === 'function') {
                 try {
                     const playerHeight = CONFIG?.PLAYER_HEIGHT || 1.8;
                     // Cannon Vec3 expects center mass position
                     const startPos = new globalCannon.Vec3(playerData.x, playerData.y + playerHeight / 2.0, playerData.z);
                     currentGameInstance.createPlayerPhysicsBody(playerData.id, startPos, playerData.rotationY || 0, false); // false = remote kinematic player
                 } catch (e) {
                     console.error(`!!! Failed to create Cannon physics body for joined player ${playerData.id}:`, e);
                     this._removePlayer(playerData.id); // Use helper to remove mesh and player entry
                 }
             } else if (!(newPlayer instanceof ClientPlayer)) {
                 console.warn(`[Network] Skipping physics body for joined player ${playerData.id} because ClientPlayer instance failed.`);
             } else {
                  console.warn(`[Network] Skipping physics body creation for joined player ${playerData.id}. Missing CANNON/World/GameInstance or Method?`);
             }

             if (UIManager?.showKillMessage) UIManager.showKillMessage(`${name} joined the game.`);

        } else if (!stateMachine?.is('playing')) {
             // Ignore if not in playing state
        }
    },

    handlePlayerLeft: function(playerId) {
        if (playerId) {
            const player = this._getPlayer(playerId); // Check global players
            const playerName = player?.name || 'Player';
            console.log(`[Network] RX playerLeft: ${playerName} (ID: ${playerId})`);
            this._removePlayer(playerId); // Use helper which calls game cleanup method
            if (UIManager?.showKillMessage) UIManager.showKillMessage(`${playerName} left the game.`);
        }
    },

    handleGameStateUpdate: function(state) {
        // Use global references safely
        const globalPlayers = window.players;
        const globalCannonWorld = window.cannonWorld;
        const globalCannon = window.CANNON;

        // Ensure all prerequisites are met before processing updates
        if (!globalPlayers || !state?.players || !stateMachine?.is('playing') || !window.localPlayerId || !globalCannonWorld || !currentGameInstance?.playerBodies || !globalCannon) {
            return; // Not ready or not relevant state
        }

        for (const id in state.players) {
            if (id === window.localPlayerId) continue; // Ignore updates for the local player

            const serverPlayerData = state.players[id]; // Data for one remote player from server
            const remotePlayer = globalPlayers[id]; // Get ClientPlayer instance from global map
            const remoteBody = currentGameInstance.playerBodies[id]; // Get Cannon body reference from game instance map

            // Check if both visual player and physics body exist and body is kinematic
            if (remotePlayer instanceof ClientPlayer && remoteBody && remoteBody.type === CANNON.Body.KINEMATIC) {
                try {
                    const playerHeight = CONFIG?.PLAYER_HEIGHT || 1.8;
                    // Set kinematic target position (center mass for Cannon)
                    remoteBody.position.set(serverPlayerData.x, serverPlayerData.y + playerHeight / 2.0, serverPlayerData.z);

                    // Set kinematic target rotation
                    const targetRotationY = serverPlayerData.r || 0; // Server uses 'r' for rotationY
                    remoteBody.quaternion.setFromAxisAngle(new globalCannon.Vec3(0, 1, 0), targetRotationY);
                    // Ensure kinematic bodies are awake to process updates if needed (might not be necessary depending on direct pos/rot setting)
                    // remoteBody.wakeUp();

                    // --- Update Non-Physics Data (e.g., Health) ---
                    if (serverPlayerData.h !== undefined && remotePlayer.health !== serverPlayerData.h) {
                         remotePlayer.health = serverPlayerData.h;
                    }
                    // Update name/phrase if they were included (usually not in gameStateUpdate)
                    remotePlayer.updateData(serverPlayerData); // Syncs position cache and other fields if present

                } catch (e) {
                     console.error(`!!! Error updating kinematic body for remote player ${id} (Cannon):`, e);
                }
            }
        }
    },

    handleHealthUpdate: function(data) {
        if (!data?.id || data.health === undefined) { console.warn("Invalid healthUpdate data received:", data); return; }
        const player = this._getPlayer(data.id); // Check global players
        if (player) {
             player.health = data.health;
             if (data.id === window.localPlayerId && UIManager) { // Use global localPlayerId
                 UIManager.updateHealthBar(player.health);
             }
        }
    },

    handlePlayerDied: function(data) {
        if (!data?.targetId) { console.warn("Invalid playerDied data received:", data); return; }
        const targetPlayer = this._getPlayer(data.targetId);
        const targetName = targetPlayer?.name || 'Player';
        const killerName = data.killerName || 'Unknown';
        const killerPhrase = data.killerPhrase || 'eliminated';
        console.log(`[Network] RX playerDied: Target=${targetName}(${data.targetId}), Killer=${killerName}(${data.killerId ?? 'N/A'})`);

        let deathPosition = new THREE.Vector3(0, 5, 0); // Default fallback
        if (targetPlayer) {
             const body = currentGameInstance?.playerBodies?.[data.targetId]; // Get Cannon body
             if (body) { deathPosition.copy(body.position); } // Use body center mass
             else if (targetPlayer.mesh) { deathPosition.copy(targetPlayer.mesh.position); deathPosition.y += (CONFIG.PLAYER_HEIGHT || 1.8) / 2.0; } // Estimate from mesh
             else { deathPosition.set(targetPlayer.serverX || 0, (targetPlayer.serverY || 0) + (CONFIG.PLAYER_HEIGHT || 1.8) / 2.0, targetPlayer.serverZ || 0); } // Estimate from server cache
        }
        console.log("[Network] Death Position for effects:", deathPosition);

        if (typeof Effects?.createExplosionEffect === 'function') { Effects.createExplosionEffect(deathPosition); }
        if (typeof applyShockwave === 'function') { applyShockwave(deathPosition, data.targetId); } else { console.warn("applyShockwave function not found."); }

        if (data.targetId === window.localPlayerId) { // Use global localPlayerId
             if (targetPlayer) targetPlayer.health = 0;
             if (UIManager) {
                 UIManager.updateHealthBar(0);
                 let message = (data.killerId === null) ? "You fell out of the world." : (data.killerId === data.targetId) ? "You eliminated yourself." : `${killerName} ${killerPhrase} you.`;
                 UIManager.showKillMessage(message);
                 if (window.infoDiv) window.infoDiv.textContent = `DEAD - Respawning soon...`;
             }
             if (window.controls?.isLocked) window.controls.unlock();
        } else {
             if (targetPlayer instanceof ClientPlayer) {
                 targetPlayer.health = 0; targetPlayer.setVisible?.(false);
                 const body = currentGameInstance?.playerBodies?.[data.targetId];
                 if (body) { /* body.sleep(); // Optional */ console.log(`[Network] Remote player ${data.targetId} died, mesh hidden.`); }
             }
             if (UIManager) {
                 let message = (data.killerId === null) ? `${targetName} fell out of the world.` : (data.killerId === data.targetId) ? `${targetName} self-destructed.` : `${killerName} ${killerPhrase} ${targetName}.`;
                 UIManager.showKillMessage(message);
             }
        }
    },

    handlePlayerRespawned: function(playerData) {
        const globalCannon = window.CANNON; const globalCannonWorld = window.cannonWorld;
        if (!playerData?.id || !globalCannon || !globalCannonWorld || !currentGameInstance) { console.warn("Invalid playerRespawned data or missing objects:", playerData); return; }
        const playerName = playerData.name || 'Player';
        console.log(`[Network] RX playerRespawned: ${playerName} (ID: ${playerData.id})`);

        let player = this._getPlayer(playerData.id);
        let playerBody = currentGameInstance.playerBodies?.[playerData.id];
        const playerHeight = CONFIG?.PLAYER_HEIGHT || 1.8;
        const targetPos = new globalCannon.Vec3(playerData.x, playerData.y + playerHeight / 2.0, playerData.z);
        const rotY = playerData.rotationY || 0;

        if (playerData.id === window.localPlayerId) { // Use global localPlayerId
            console.log("[Network] Processing LOCAL player respawn.");
            if (!player) { console.error("!!! CRITICAL: Local player data missing during respawn!"); return; }
            if (!playerBody || playerBody.type !== CANNON.Body.DYNAMIC) { console.error("!!! CRITICAL: Local Cannon body missing or not dynamic!"); UIManager?.showError("Respawn Failed (No Physics Body)!", 'homescreen'); if (stateMachine && !stateMachine.is('homescreen')) stateMachine.transitionTo('homescreen'); return; }
            player.health = playerData.health; player.x = playerData.x; player.y = playerData.y; player.z = playerData.z; player.rotationY = rotY; player.name = playerData.name; player.phrase = playerData.phrase;
            window.localPlayerName = player.name; window.localPlayerPhrase = player.phrase;

            playerBody.position.copy(targetPos);
            playerBody.quaternion.setFromAxisAngle(new globalCannon.Vec3(0, 1, 0), rotY);
            playerBody.velocity.set(0, 0, 0); playerBody.angularVelocity.set(0, 0, 0);
            playerBody.wakeUp();
            console.log(`[Network] Teleported local player body to server coords ~(${targetPos.x.toFixed(1)}, ${targetPos.y.toFixed(1)}, ${targetPos.z.toFixed(1)})`);
            if (UIManager) { UIManager.updateHealthBar(player.health); UIManager.updateInfo(`Playing as ${player.name}`); UIManager.clearKillMessage(); }
            console.log("[Network] Local player respawn complete.")
        } else {
            console.log(`[Network] Processing REMOTE player respawn: ${playerName}`);
            if (!player || !(player instanceof ClientPlayer)) { console.warn(`Remote player object missing for respawn ID ${playerData.id}. Recreating...`); this._removePlayer(playerData.id); this.handlePlayerJoined(playerData); player = this._getPlayer(playerData.id); }
            playerBody = currentGameInstance?.playerBodies?.[playerData.id];
            if (!player || !(player instanceof ClientPlayer)) { console.error(`!!! Failed recreate remote player ${playerData.id}! Aborting respawn.`); return; }
            if (!playerBody || playerBody.type !== CANNON.Body.KINEMATIC) { console.error(`!!! Remote Cannon body missing or not kinematic for respawn ID ${playerData.id}! Aborting respawn.`); return; }

            player.updateData(playerData); player.setVisible?.(true);
            playerBody.position.copy(targetPos);
            playerBody.quaternion.setFromAxisAngle(new globalCannon.Vec3(0, 1, 0), rotY);
            playerBody.wakeUp();
            console.log(`[Network] Teleported remote kinematic body ${playerData.id} to server coords ~(${targetPos.x.toFixed(1)}, ${targetPos.y.toFixed(1)}, ${targetPos.z.toFixed(1)})`);
        }
    },

    handleServerFull: function() {
        console.warn("[Network] Received 'serverFull' message.");
        if (socket) socket.disconnect();
        stateMachine?.transitionTo('loading', { message: `Server is Full!`, error: true });
    },

     // --- Actions ---
     attemptJoinGame: function() {
        console.log("[Network] Attempting to join game...");

        if (!UIManager?.playerNameInput || !UIManager.playerPhraseInput) { console.error("!!! Cannot attempt join: Name or Phrase input missing."); return; }
        if (typeof window !== 'undefined') {
             window.localPlayerName = UIManager.playerNameInput.value.trim() || 'Anon';
             window.localPlayerPhrase = UIManager.playerPhraseInput.value.trim() || '...';
             if (!window.localPlayerName) window.localPlayerName = 'Anon';
             if (!window.localPlayerPhrase) window.localPlayerPhrase = '...';
             UIManager.playerNameInput.value = window.localPlayerName;
             UIManager.playerPhraseInput.value = window.localPlayerPhrase;
        } else { console.error("Window object not available for player name/phrase."); return; }

        UIManager.clearError('homescreen');

        // *** Check Core Game Prerequisites (CANNON.js VERSION) ***
        console.log(`[Network Attempt Join] Checking prerequisites:`);
        // ***** SIMPLIFIED CHECK: Use global physicsIsReady flag *****
        const physicsMapReady = window.physicsIsReady === true;
        // **********************************************************
        const areAssetsReady = typeof window !== 'undefined' && window.assetsAreReady === true;
        console.log(`  - Assets Ready? ${areAssetsReady}`);
        console.log(`  - Physics/Map Ready? ${physicsMapReady}`);

        if (!areAssetsReady || !physicsMapReady) {
            console.warn("[Network Attempt Join] Blocked: Core components (Assets/Physics) not ready yet.");
            UIManager.showError('Game systems initializing, please wait...', 'homescreen');
            return;
        }
        console.log("[Network Attempt Join] Prerequisites met.");

        stateMachine?.transitionTo('joining');
        if (UIManager.joinButton) { UIManager.joinButton.disabled = true; }

        if (Network.isConnected()) {
            console.log("[Network Attempt Join] Already connected -> Sending player details...");
            if (UIManager.joinButton) UIManager.joinButton.textContent = "Joining...";
            Network.sendJoinDetails();
        } else {
            console.log("[Network Attempt Join] Not connected -> Triggering connection...");
            if (UIManager.joinButton) UIManager.joinButton.textContent = "Connecting...";
            if (socket && typeof socket.connect === 'function' && !socket.active) {
                 console.log("[Network Attempt Join] Manually calling socket.connect().");
                 socket.connect();
            } else if (!socket) {
                 console.error("!!! Cannot connect: Socket object doesn't exist!");
                 UIManager.showError("Network Init Failed!", 'homescreen');
                 stateMachine?.transitionTo('homescreen');
                 if (UIManager.joinButton) UIManager.joinButton.disabled = false; UIManager.joinButton.textContent = "DEPLOY";
            }
        }
     }, // End attemptJoinGame

     sendJoinDetails: function() {
         if (!stateMachine?.is('joining')) { console.warn("[Network] Tried sendJoinDetails but not in 'joining' state."); return; }
         if (!Network.isConnected()) {
             console.error("[Network] Cannot send join details: Disconnected.");
             UIManager?.showError('Connection lost.', 'homescreen');
             if(UIManager.joinButton){ UIManager.joinButton.disabled=false; UIManager.joinButton.textContent="DEPLOY"; }
             return;
         }
         const nameToSend = window.localPlayerName; const phraseToSend = window.localPlayerPhrase;
         console.log(`[Network] TX setPlayerDetails | Name: ${nameToSend}, Phrase: ${phraseToSend}`);
         socket.emit('setPlayerDetails', { name: nameToSend, phrase: phraseToSend });
     },

     sendPlayerUpdate: function(data) {
         const player = this._getPlayer(window.localPlayerId); // Use global ID
         if (Network.isConnected() && stateMachine?.is('playing') && player?.health > 0) {
             socket.emit('playerUpdate', data);
         }
     },

     sendVoidDeath: function() {
         if (Network.isConnected() && stateMachine?.is('playing')) {
             console.log("[Network] TX fellIntoVoid");
             socket.emit('fellIntoVoid');
         }
     },

     sendPlayerHit: function(hitData) {
         const player = this._getPlayer(window.localPlayerId); // Use global ID
         if (Network.isConnected() && stateMachine?.is('playing') && player?.health > 0) {
              console.log(`[Network] TX playerHit -> Target: ${hitData.targetId}, Damage: ${hitData.damage}`);
              socket.emit('playerHit', hitData);
         }
     }

}; // End Network object

// Export globally
if (typeof window !== 'undefined') {
    window.Network = Network;
}
console.log("network.js loaded (Cannon.js Prereq Fix v2)");
// --- END OF FULL network.js FILE ---
