// --- START OF FULL network.js FILE ---
// docs/network.js (Cannon.js Prereq Fix)

// Depends on: config.js, stateMachine.js, entities.js, input.js, uiManager.js, game.js, gameLogic.js, effects.js
// Accesses globals: players, localPlayerId, socket, controls, CONFIG, CANNON, cannonWorld, // Using CANNON globals now
//                   stateMachine, UIManager, ClientPlayer, scene, infoDiv, currentGameInstance, assetsAreReady, Effects, applyShockwave

var socket; // Global socket variable

const Network = {
    init: function() {
        this.setupSocketIO();
        console.log("[Network] Initialized and requested socket connection.");
    },

    isConnected: function() {
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
             socket = io(CONFIG.SERVER_URL, { transports: ['websocket', 'polling'] });
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
            window.networkIsInitialized = true;

            if (typeof UIManager !== 'undefined') {
                 UIManager.clearError('homescreen');
                 if (stateMachine?.is('joining')) {
                     console.log("[Network Connect] Was in 'joining' state, sending details now.");
                      if (UIManager.joinButton) UIManager.joinButton.textContent = "Joining...";
                     Network.sendJoinDetails();
                 } else if (stateMachine?.is('homescreen') && UIManager.joinButton) {
                     UIManager.joinButton.disabled = false;
                     UIManager.joinButton.textContent = "DEPLOY"; // Use new button text
                     console.log("[Network Connect] Reset Join Button state on homescreen.");
                 }
            }
            currentGameInstance?.attemptProceedToGame();
        });

        socket.on('disconnect', (reason) => {
            console.warn('[Network] Socket Disconnected. Reason:', reason);
            window.networkIsInitialized = false;
            window.initializationData = null;

            if (stateMachine?.is('playing') || stateMachine?.is('joining')) {
                currentGameInstance?.cleanupAllPlayers();
                console.log("[Network Disconnect] Cleaned up player objects after disconnect.");

                stateMachine?.transitionTo('homescreen', { playerCount: 0 });
                 if(UIManager) {
                     UIManager.updatePlayerCount(0);
                     let errorMsg = "Disconnected.";
                     if (reason === 'io server disconnect') errorMsg = "Kicked or server shut down.";
                     else if (reason === 'io client disconnect') errorMsg = "Left the game.";
                     else if (reason === 'ping timeout' || reason === 'transport close' || reason === 'transport error') errorMsg = "Connection lost.";
                     UIManager.showError(errorMsg, 'homescreen');
                 }
                 const globalInfoDiv = window.infoDiv;
                 if(globalInfoDiv) globalInfoDiv.textContent='Disconnected';
                 const globalControls = window.controls;
                 if(globalControls?.isLocked) globalControls.unlock();

             } else {
                  console.log("[Network] Disconnected while not in playing/joining state.");
                  if (stateMachine?.is('homescreen') && UIManager?.joinButton) {
                      UIManager.joinButton.disabled = true;
                      UIManager.joinButton.textContent = "Disconnected";
                  }
             }
        });

        socket.on('connect_error', (err) => {
            console.error('[Network] Connection Error:', err.message, err);
            window.networkIsInitialized = false;
            const errorMsg = `Connection Failed!<br/>Check Console (F12).`;
            if (stateMachine?.is('loading') || stateMachine?.is('joining')) {
                 stateMachine.transitionTo('loading', { message: errorMsg, error: true });
            } else {
                 stateMachine?.transitionTo('homescreen');
                 UIManager?.showError(errorMsg, 'homescreen');
                 if (UIManager?.joinButton) {
                      UIManager.joinButton.disabled = true;
                      UIManager.joinButton.textContent = "Connection Failed";
                 }
            }
        });

        socket.on('playerCountUpdate', (count) => { if (UIManager) UIManager.updatePlayerCount(count); });
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
                 window.players[playerData.id] = new ClientPlayer(playerData);
                 return window.players[playerData.id];
            } catch (e) {
                 console.error(`!!! Error creating ClientPlayer instance for ${playerData.id}:`, e);
                 return null;
            }
        } else if (window.players[playerData.id]) {
            console.warn(`[Network] Attempted to add player ${playerData.id} but they already exist.`);
            return window.players[playerData.id];
        } else {
            console.warn(`[Network] Attempted to add player with invalid data or missing ID:`, playerData);
            return null;
        }
    },

    _removePlayer: function(playerId) {
         if (currentGameInstance && typeof currentGameInstance.cleanupPlayer === 'function') {
             currentGameInstance.cleanupPlayer(playerId);
             console.log(`[Network] Requested cleanup for player ${playerId} via Game instance.`);
         } else {
              console.warn(`[Network] Cannot remove player ${playerId}: Game instance or cleanupPlayer missing.`);
              const player = this._getPlayer(playerId);
              if (player instanceof ClientPlayer) { player.remove?.(); if (window.players) delete window.players[playerId]; }
         }
    },

    // --- Event Handlers ---
    handleInitialize: function(data) {
        console.log('[Network] RX initialize');
        if (!data?.id || typeof data.players !== 'object') {
             console.error("!!! Invalid initialization data received:", data);
             if(stateMachine && !stateMachine.is('homescreen')) stateMachine.transitionTo('homescreen');
             UIManager?.showError("Server Init Invalid!", "homescreen");
             return;
        }
        // Access global var from config.js scope
        window.initializationData = data;
        window.networkIsInitialized = true;
        console.log("[Network] Initialization data stored. Attempting to proceed to game...");
        currentGameInstance?.attemptProceedToGame();
    },

    handlePlayerJoined: function(playerData) {
        if (playerData?.id === window.localPlayerId) return; // Use global var

        if (playerData?.id && !this._getPlayer(playerData.id) && stateMachine?.is('playing')) {
             const name = playerData.name || 'Player';
             console.log(`[Network] RX playerJoined: ${name} (ID: ${playerData.id})`);

             const newPlayer = this._addPlayer(playerData);

             // Create Cannon.js Kinematic Body
             const globalCannon = window.CANNON;
             const globalCannonWorld = window.cannonWorld;

             if (newPlayer instanceof ClientPlayer && newPlayer.mesh && globalCannon && globalCannonWorld && currentGameInstance && typeof currentGameInstance.createPlayerPhysicsBody === 'function') {
                 try {
                     const playerHeight = CONFIG?.PLAYER_HEIGHT || 1.8;
                     // Cannon Vec3 expects center mass position
                     const startPos = new globalCannon.Vec3(playerData.x, playerData.y + playerHeight / 2.0, playerData.z);
                     currentGameInstance.createPlayerPhysicsBody(playerData.id, startPos, playerData.rotationY || 0, false); // false = remote kinematic player
                 } catch (e) {
                     console.error(`!!! Failed to create Cannon physics body for joined player ${playerData.id}:`, e);
                     this._removePlayer(playerData.id);
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
            const player = this._getPlayer(playerId);
            const playerName = player?.name || 'Player';
            console.log(`[Network] RX playerLeft: ${playerName} (ID: ${playerId})`);
            this._removePlayer(playerId);
            if (UIManager?.showKillMessage) UIManager.showKillMessage(`${playerName} left the game.`);
        }
    },

    handleGameStateUpdate: function(state) {
        const globalPlayers = window.players;
        const globalCannonWorld = window.cannonWorld;
        const globalCannon = window.CANNON;

        if (!globalPlayers || !state?.players || !stateMachine?.is('playing') || !window.localPlayerId || !globalCannonWorld || !currentGameInstance?.playerBodies || !globalCannon) {
            return;
        }

        for (const id in state.players) {
            if (id === window.localPlayerId) continue;

            const serverPlayerData = state.players[id];
            const remotePlayer = globalPlayers[id];
            const remoteBody = currentGameInstance.playerBodies[id]; // Get Cannon body

            if (remotePlayer instanceof ClientPlayer && remoteBody && remoteBody.type === CANNON.Body.KINEMATIC) {
                try {
                    const playerHeight = CONFIG?.PLAYER_HEIGHT || 1.8;
                    // Set kinematic target position (center mass)
                    remoteBody.position.set(serverPlayerData.x, serverPlayerData.y + playerHeight / 2.0, serverPlayerData.z);

                    const targetRotationY = serverPlayerData.r || 0;
                    remoteBody.quaternion.setFromAxisAngle(new globalCannon.Vec3(0, 1, 0), targetRotationY);

                    if (serverPlayerData.h !== undefined && remotePlayer.health !== serverPlayerData.h) {
                         remotePlayer.health = serverPlayerData.h;
                    }
                    remotePlayer.updateData(serverPlayerData); // Update other cached data like server position

                } catch (e) {
                     console.error(`!!! Error updating kinematic body for remote player ${id} (Cannon):`, e);
                }
            }
        }
    },

    handleHealthUpdate: function(data) {
        if (!data?.id || data.health === undefined) return;
        const player = this._getPlayer(data.id);
        if (player) {
             player.health = data.health;
             if (data.id === window.localPlayerId && UIManager) {
                 UIManager.updateHealthBar(player.health);
             }
        }
    },

    handlePlayerDied: function(data) {
        if (!data?.targetId) return;

        const targetPlayer = this._getPlayer(data.targetId);
        const targetName = targetPlayer?.name || 'Player';
        const killerName = data.killerName || 'Unknown';
        const killerPhrase = data.killerPhrase || 'eliminated';

        console.log(`[Network] RX playerDied: Target=${targetName}(${data.targetId}), Killer=${killerName}(${data.killerId ?? 'N/A'})`);

        let deathPosition = new THREE.Vector3(0, 5, 0); // Default fallback
        if (targetPlayer) {
             const body = currentGameInstance?.playerBodies?.[data.targetId];
             if (body) {
                  deathPosition.copy(body.position); // Use Cannon body center mass position
             } else if (targetPlayer.mesh) {
                  // Fallback to mesh, adjust Y for center estimate
                  deathPosition.copy(targetPlayer.mesh.position);
                  deathPosition.y += (CONFIG.PLAYER_HEIGHT || 1.8) / 2.0;
             } else {
                  // Fallback to server coords
                  deathPosition.set(targetPlayer.serverX || 0, (targetPlayer.serverY || 0) + (CONFIG.PLAYER_HEIGHT || 1.8) / 2.0, targetPlayer.serverZ || 0);
             }
        }
         console.log("[Network] Death Position for effects:", deathPosition);

        if (typeof Effects?.createExplosionEffect === 'function') { Effects.createExplosionEffect(deathPosition); }
        if (typeof applyShockwave === 'function') { applyShockwave(deathPosition, data.targetId); }
        else { console.warn("applyShockwave function not found."); }

        if (data.targetId === window.localPlayerId) {
             if (targetPlayer) targetPlayer.health = 0;
             if (UIManager) {
                 UIManager.updateHealthBar(0);
                 let message = (data.killerId === null) ? "You fell out of the world."
                           : (data.killerId === data.targetId) ? "You eliminated yourself."
                           : `${killerName} ${killerPhrase} you.`;
                 UIManager.showKillMessage(message);
                 if (window.infoDiv) window.infoDiv.textContent = `DEAD - Respawning soon...`;
             }
             if (window.controls?.isLocked) window.controls.unlock();

        } else {
             if (targetPlayer instanceof ClientPlayer) {
                 targetPlayer.health = 0;
                 targetPlayer.setVisible?.(false);
                 // Set remote kinematic body to sleep or static? Optional.
                 const body = currentGameInstance?.playerBodies?.[data.targetId];
                 if (body) {
                      // body.sleep(); // Allow sleeping
                      console.log(`[Network] Remote player ${data.targetId} died, mesh hidden.`);
                 }
             }
             if (UIManager) {
                 let message = (data.killerId === null) ? `${targetName} fell out of the world.`
                           : (data.killerId === data.targetId) ? `${targetName} self-destructed.`
                           : `${killerName} ${killerPhrase} ${targetName}.`;
                 UIManager.showKillMessage(message);
             }
        }
    },

    handlePlayerRespawned: function(playerData) {
        const globalCannon = window.CANNON;
        const globalCannonWorld = window.cannonWorld;

        if (!playerData?.id || !globalCannon || !globalCannonWorld || !currentGameInstance) {
            console.warn("Invalid playerRespawned data or missing physics/game objects:", playerData);
            return;
        }

        const playerName = playerData.name || 'Player';
        console.log(`[Network] RX playerRespawned: ${playerName} (ID: ${playerData.id})`);

        let player = this._getPlayer(playerData.id);
        let playerBody = currentGameInstance.playerBodies?.[playerData.id];

        const playerHeight = CONFIG?.PLAYER_HEIGHT || 1.8;
        // Target position is center mass for Cannon
        const targetPos = new globalCannon.Vec3(playerData.x, playerData.y + playerHeight / 2.0, playerData.z);
        const rotY = playerData.rotationY || 0;


        if (playerData.id === window.localPlayerId) {
            console.log("[Network] Processing LOCAL player respawn.");
            if (!player) { console.error("!!! CRITICAL: Local player data missing during respawn!"); return; }
            if (!playerBody || playerBody.type !== CANNON.Body.DYNAMIC) {
                console.error("!!! CRITICAL: Local Cannon body missing or not dynamic! Cannot teleport.");
                UIManager?.showError("Respawn Failed (No Physics Body)!", 'homescreen');
                if (stateMachine && !stateMachine.is('homescreen')) stateMachine.transitionTo('homescreen');
                return;
            }
            // Update local data cache
            player.health = playerData.health;
            player.x = playerData.x; player.y = playerData.y; player.z = playerData.z;
            player.rotationY = rotY;
            player.name = playerData.name; player.phrase = playerData.phrase;
            window.localPlayerName = player.name; window.localPlayerPhrase = player.phrase;

            // Teleport the physics body AND reset velocities
            playerBody.position.copy(targetPos);
            playerBody.quaternion.setFromAxisAngle(new globalCannon.Vec3(0, 1, 0), rotY);
            playerBody.velocity.set(0, 0, 0);
            playerBody.angularVelocity.set(0, 0, 0);
            playerBody.wakeUp(); // Ensure body is active

            console.log(`[Network] Teleported local player body to server coords ~(${targetPos.x.toFixed(1)}, ${targetPos.y.toFixed(1)}, ${targetPos.z.toFixed(1)})`);

            if (UIManager) { UIManager.updateHealthBar(player.health); UIManager.updateInfo(`Playing as ${player.name}`); UIManager.clearKillMessage(); }
            console.log("[Network] Local player respawn complete. Click game window to re-lock controls if needed.")

        } else {
            console.log(`[Network] Processing REMOTE player respawn: ${playerName}`);
            if (!player || !(player instanceof ClientPlayer)) {
                console.warn(`Remote player object missing for respawn ID ${playerData.id}. Recreating...`);
                this._removePlayer(playerData.id);
                this.handlePlayerJoined(playerData);
                player = this._getPlayer(playerData.id); // Re-fetch
            }
            playerBody = currentGameInstance?.playerBodies?.[playerData.id]; // Re-fetch body

            if (!player || !(player instanceof ClientPlayer)) { console.error(`!!! Failed to recreate remote player ${playerData.id}! Aborting respawn.`); return; }
            if (!playerBody || playerBody.type !== CANNON.Body.KINEMATIC) { console.error(`!!! Remote Cannon body missing or not kinematic for respawn ID ${playerData.id}! Aborting respawn.`); return; }

            player.updateData(playerData);
            player.setVisible?.(true);

            // Set kinematic target position and rotation
            playerBody.position.copy(targetPos);
            playerBody.quaternion.setFromAxisAngle(new globalCannon.Vec3(0, 1, 0), rotY);
            playerBody.wakeUp(); // Ensure body is active for interpolation/sync

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
        const cannonIsSetup = !!window.CANNON &&
                              !!window.cannonWorld &&
                              !!currentGameInstance?.mapBody && // Check if the map body exists
                              physicsIsReady === true; // Check the flag set in game.js->setupPhysics

        const areAssetsReady = typeof window !== 'undefined' && window.assetsAreReady === true;
        console.log(`  - Assets Ready? ${areAssetsReady}`);
        console.log(`  - Physics/Map Ready? ${cannonIsSetup}`);

        if (!areAssetsReady || !cannonIsSetup) {
            console.warn("[Network Attempt Join] Blocked: Core components (Assets/Physics/MapBody) not ready yet.");
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
         const player = this._getPlayer(window.localPlayerId);
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
         const player = this._getPlayer(window.localPlayerId);
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
console.log("network.js loaded (Cannon.js Prereq Fix)");
// --- END OF FULL network.js FILE ---
