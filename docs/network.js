// docs/network.js

// Needs access to globals and functions from other files
// Specifically needs CONFIG from config.js
// Accesses global UI element vars set by UIManager: playerNameInput, playerPhraseInput, homeScreenError, playerCountSpan, infoDiv
// Accesses global state vars: localPlayerName, localPlayerPhrase, players, bullets, localPlayerId
// Accesses global objects: stateMachine, socket (defined here), THREE (if needed), Input (if needed), controls, velocityY, isOnGround
// Accesses utility: PLAYER_HEIGHT, PLAYER_RADIUS from config.js
// Calls functions defined elsewhere: removePlayerMesh (implicit via handlePlayerLeft), addPlayer (implicit via handlers), updateRemotePlayerPosition (implicit via handleGameStateUpdate), spawnBullet, updateHealthBar, showKillMessage, handlePlayerJoined, handlePlayerLeft, handleHealthUpdate, handlePlayerDied, handlePlayerRespawned

// Define Global socket variable if not already defined (though it should be)
var socket;

const Network = {
    // socket: null // Using global socket variable initialized in setupSocketIO

    init: function() {
        this.setupSocketIO();
        console.log("[Network] Initialized.");
    },

    isConnected: function() {
      // Check if socket exists and is connected
      return typeof socket !== 'undefined' && socket && socket.connected;
    },

    setupSocketIO: function() {
        // Check if CONFIG object exists before using it
        if (typeof CONFIG === 'undefined' || typeof CONFIG.SERVER_URL === 'undefined') {
             console.error("!!! CRITICAL: CONFIG or CONFIG.SERVER_URL not defined! Check config.js load order.");
             // Use stateMachine if available to show error
             if(typeof stateMachine !== 'undefined') {
                 stateMachine.transitionTo('loading',{message:"FATAL: Network Config Error!",error:true});
             } else {
                 alert("FATAL: Network Config Error! Check Console.");
             }
             return; // Stop initialization
        }

        console.log(`[Network] Attempting connection to: ${CONFIG.SERVER_URL}`);
        try {
            // Initialize the global socket variable
            // Ensure io is loaded (should be from index.html)
            if (typeof io === 'undefined') {
                throw new Error("Socket.IO client library (io) not loaded!");
            }
            socket = io(CONFIG.SERVER_URL, {
                transports: ['websocket'], // Force websocket transport
                autoConnect: true,         // Connect automatically
                // Optional: Add timeout settings if needed
                // reconnectionAttempts: 3,
                // timeout: 5000,
            });

            console.log("[Network] Socket initialized, attaching listeners...");

        } catch (e) {
             console.error("!!! CRITICAL: Failed to initialize Socket.IO:", e);
              if(typeof stateMachine !== 'undefined') {
                 stateMachine.transitionTo('loading',{message:`FATAL: Network Init Error!<br/>${e.message}`,error:true});
             } else {
                 alert("FATAL: Network Init Error! Check Console.");
             }
             return; // Stop initialization
        }


        // --- Socket Event Listeners ---
        socket.on('connect', () => { // Use arrow function to preserve 'this' if needed, though not strictly necessary here
            console.log('[Network] Socket Connected Successfully! ID:', socket.id);

            // Socket is connected. Now, LoadManager.checkCompletion will handle the transition
            // if assets are also ready. We don't need to call checkAssetsReady explicitly here.
            // loadManager.checkCompletion(); // Re-check completion status in case assets finished while connecting.
            // The above line might be useful if you want to be extra sure, but checkCompletion should
            // already be called when assets finish loading. Let's rely on the loadManager's logic for now.

            // If the stateMachine is somehow stuck in 'joining' without assets ready, perhaps reset it?
            if (typeof stateMachine !== 'undefined' && stateMachine.is('joining')) {
                console.warn("[Network] Connected while in 'joining' state. Waiting for assets or server response.");
                // If assets are ready now, trigger join details again?
                // This depends on whether `sendJoinDetails` was already called by loadManager.
                // if (typeof loadManager !== 'undefined' && loadManager.assets.map?.state === 'loaded') { // Basic check
                //     console.log("[Network] Assets seem ready, attempting to send join details again from connect handler.");
                //     this.sendJoinDetails(); // 'this' refers to Network object if using arrow function or binding
                // }
            } else if (typeof stateMachine !== 'undefined' && stateMachine.is('loading')) {
                console.log("[Network] Socket connected, waiting for assets to finish loading...");
                 // loadManager.checkCompletion will handle transition when assets are ready.
            }


        });

        socket.on('disconnect', (reason) => { // Arrow function for 'this' if needed
            console.warn('[Network] Socket Disconnected. Reason:', reason);
            // Transition back to homescreen (or an error screen if critical)
            if (typeof stateMachine !== 'undefined') {
                 // Show 0 players as we are disconnected
                 stateMachine.transitionTo('homescreen', { playerCount: 0 });
                 // Update UI immediately if possible
                 if (typeof UIManager !== 'undefined') {
                     UIManager.updatePlayerCount(0);
                     UIManager.clearError(); // Clear any previous homescreen errors
                     UIManager.showError("Disconnected from server.", 'homescreen');
                 }
            } else {
                console.error("stateMachine missing on disconnect!");
            }

            // Clean up local game state on disconnect
            if (typeof infoDiv !== 'undefined' && infoDiv) infoDiv.textContent = 'Disconnected';
             // Clear players (except potentially local player placeholder?)
             // Need removePlayerMesh function available globally or passed in
             for (const id in players) {
                 // Assuming removePlayerMesh exists and handles mesh removal/disposal
                 if (typeof removePlayerMesh === 'function') { // Check if function exists
                    removePlayerMesh(id);
                 } else if (players[id]?.mesh && typeof scene !== 'undefined') {
                    // Basic fallback cleanup if function missing
                    scene.remove(players[id].mesh);
                 }
             }
            players = {}; // Clear players object
            bullets.forEach(b => b.remove()); // Remove bullet meshes
            bullets = []; // Clear bullets array
            localPlayerId = null; // Reset local player ID
            if (controls?.isLocked) controls.unlock(); // Unlock cursor if locked
             if (typeof Effects !== 'undefined') Effects.removeGunViewModel(); // Remove gun

        });

        socket.on('connect_error', (err) => {
            console.error('!!! [Network] Connection Error:', err.message);
            // Display error to user
             if (typeof stateMachine !== 'undefined') {
                 stateMachine.transitionTo('loading',{message:`Connection Failed!<br/>${err.message}`,error:true});
             } else {
                 alert(`Connection Failed: ${err.message}`);
             }
             // Optionally try to clean up resources or prevent further actions
             // Mark assets as potentially failed if network is down? Maybe not necessary.
        });

        socket.on('playerCountUpdate', (count) => {
            // Update UI using UIManager if available
            if (typeof UIManager !== 'undefined' && typeof UIManager.updatePlayerCount === 'function') {
                 UIManager.updatePlayerCount(count);
            } else {
                // Fallback or log error if UIManager is not ready/available
                const playerCountSpanElement = document.getElementById('playerCount');
                if (playerCountSpanElement) {
                     playerCountSpanElement.textContent = count;
                } else {
                    console.warn("playerCountSpan element not found or UIManager missing.");
                }
            }
        });

        // --- Game Specific Listeners ---
        // Bind handlers directly to Network methods using .bind(this) or ensure handlers use Network.method() internally
        socket.on('initialize',       (data) => { Network.handleInitialize(data); });
        socket.on('playerJoined',     (data) => { Network.handlePlayerJoined(data); });
        socket.on('playerLeft',       (id)   => { Network.handlePlayerLeft(id); });
        socket.on('gameStateUpdate',  (data) => { Network.handleGameStateUpdate(data); });
        socket.on('shotFired',        (data) => { Network.handleShotFired(data); });
        socket.on('healthUpdate',     (data) => { Network.handleHealthUpdate(data); });
        socket.on('playerDied',       (data) => { Network.handlePlayerDied(data); });
        socket.on('playerRespawned',  (data) => { Network.handlePlayerRespawned(data); });
        socket.on('serverFull',       ()     => { Network.handleServerFull(); }); // Handle server full message

        // --- Debug Listeners ---
        // Use a flag for verbose logging to avoid spamming console in production
        const DEBUG_NETWORK = true; // Set to false for production builds
        socket.onAny((eventName, ...args) => {
            if (DEBUG_NETWORK && eventName !== 'gameStateUpdate' /*&& eventName !== 'playerMoved'*/) {
                 // Avoid logging very frequent events unless specifically debugging them
                 console.log(`[DEBUG Network RX] Event: ${eventName}`, args);
            }
        });
        socket.on('ping', (data) => {
            console.log(">>> [Network] Received 'ping' from server:", data);
        });

        console.log("[Network] Socket listeners attached successfully.");
    }, // End setupSocketIO


    // --- Handlers for Server Events (now methods of Network) ---

    // Utility to safely get player reference (local or remote)
    _getPlayer: function(id) {
        if (!players) {
            console.warn("Network handler called before 'players' global is initialized!");
            return null;
        }
        return players[id] || null;
    },

    // Utility to add a player (ensures ClientPlayer exists)
    _addPlayer: function(playerData) {
        if (typeof ClientPlayer === 'undefined') {
             console.error("ClientPlayer class is not defined! Cannot add player.");
             return;
        }
        if (!players) {
            console.warn("Network handler trying to add player before 'players' global is initialized!");
            return; // Or initialize players = {}; here? Risky.
        }
        if (playerData && playerData.id && !players[playerData.id]) {
            console.log(`[Network] Adding player: ${playerData.name} (${playerData.id})`);
            players[playerData.id] = new ClientPlayer(playerData);
            // Ensure mesh is loaded/visible - ClientPlayer constructor handles this
        } else if (players[playerData.id]) {
             console.warn(`[Network] Attempted to add existing player: ${playerData.id}`);
        } else {
             console.error(`[Network] Invalid player data received for addPlayer:`, playerData);
        }
    },

     // Utility to remove a player and their mesh
     _removePlayer: function(playerId) {
         const player = this._getPlayer(playerId);
         if (player) {
             console.log(`[Network] Removing player: ${player.name || playerId}`);
             if (typeof player.remove === 'function') {
                 player.remove(); // Use the ClientPlayer's remove method
             } else if (player.mesh && typeof scene !== 'undefined') {
                 // Fallback if remove method is missing
                 scene.remove(player.mesh);
             }
             delete players[playerId];
         } else {
             console.warn(`[Network] Attempted to remove non-existent player: ${playerId}`);
         }
     },


    handleGameStateUpdate: function(state) {
         // Guard clauses for essential data
         if (!players || typeof state?.players !== 'object' || !state.players) {
            console.warn("[Network] Invalid gameStateUpdate received or players global missing.");
            return;
         }
         if (typeof stateMachine === 'undefined' || !stateMachine.is('playing') || !localPlayerId) {
             // Don't process updates if not in the playing state or local player unknown
             return;
         }

         // Update players based on server state
         for (const id in state.players) {
             const serverPlayerData = state.players[id]; // Format: {id, x, y, z, r, h}
             const localPlayerData = this._getPlayer(id);

             if (!localPlayerData) {
                  // Player exists on server but not locally - should not happen often after init
                  // This might indicate a player joined while client was loading, handleInitialize should cover this mostly.
                  // If it happens mid-game, it's unusual. Could request full data or ignore.
                  console.warn(`[Network GSU] Received update for unknown player: ${id}. Requesting full data might be needed.`);
                  // Optional: socket.emit('requestFullPlayerData', id); // Need server handler for this
                  continue;
             }

             if (id === localPlayerId) {
                 // Optional: Compare server health with local health for sanity check?
                 // Local health is primarily updated by 'healthUpdate' and 'playerDied' events.
                 // Reconciliation logic could be added here if needed.
                 // e.g., if (localPlayerData.health !== serverPlayerData.h) { console.warn("Local health mismatch!"); Network.handleHealthUpdate({ id: id, health: serverPlayerData.h }); }
             } else {
                 // Update remote player data
                 if (typeof localPlayerData.updateData === 'function') {
                    // Pass the lean data from gameStateUpdate
                     localPlayerData.updateData(serverPlayerData);
                 } else {
                    // Manual update if updateData method is missing (less ideal)
                     localPlayerData.x = serverPlayerData.x;
                     localPlayerData.y = serverPlayerData.y;
                     localPlayerData.z = serverPlayerData.z;
                     localPlayerData.rotationY = serverPlayerData.r; // Map 'r' to rotationY
                     localPlayerData.health = serverPlayerData.h; // Map 'h' to health
                     localPlayerData.setInterpolationTargets(); // Ensure interpolation targets are set
                     console.warn(`[Network GSU] Player ${id} missing updateData method.`);
                 }
             }
         }

         // Potentially remove players who exist locally but were NOT in the gameStateUpdate
         // This is slightly risky if a server update packet is dropped, could prematurely remove players.
         // It's often safer to rely solely on the 'playerLeft' event.
         // Uncomment with caution:
         /*
         for (const localId in players) {
             if (localId !== localPlayerId && !state.players[localId]) {
                 console.warn(`[Network GSU] Player ${localId} not in state update, potentially removing.`);
                 this._removePlayer(localId); // Use the internal remove function
             }
         }
         */
     },

    handleInitialize: function(data) {
         console.log('[Network] Received initialize event:', data);

         // Basic validation
         if (!data || !data.id || !data.players) {
             console.error("!!! Invalid initialize data received from server:", data);
             // Transition back to homescreen or show error
             if (typeof stateMachine !== 'undefined') {
                 stateMachine.transitionTo('homescreen', { playerCount: UIManager?.playerCountSpan?.textContent ?? '?' });
             }
             if (typeof UIManager !== 'undefined') {
                 UIManager.showError("Initialization failed (Bad Data)", "homescreen");
             }
             return;
         }

         localPlayerId = data.id; // Set the local player ID
         console.log(`[Network] Local player ID set to: ${localPlayerId}`);

         // Clear any existing players and bullets from previous sessions
         console.log("[Network] Clearing existing players and bullets before initialization.");
         for(const id in players) {
            this._removePlayer(id);
         }
         players = {}; // Reset players object
         bullets.forEach(b => b.remove());
         bullets = []; // Reset bullets array

         let initialPosX = 0, initialPosY = 0, initialPosZ = 0;

         // Populate the players object with data from the server
         for (const id in data.players) {
             const serverPlayerData = data.players[id]; // Full data format from server on init

             if (id === localPlayerId) {
                 // Special handling for the local player
                 console.log(`[Network] Initializing local player data for ${serverPlayerData.name}`);
                 // Store the full data, potentially enriching with local input name/phrase if needed
                 // Server should ideally already have the correct name/phrase from setPlayerDetails
                 players[id] = {
                     ...serverPlayerData, // Spread server data (id, x, y, z, rotationY, health, name, phrase)
                     isLocal: true,      // Add a flag to easily identify the local player object
                     mesh: null          // Local player doesn't use a ClientPlayer mesh instance
                 };
                 initialPosX = serverPlayerData.x;
                 initialPosY = serverPlayerData.y;
                 initialPosZ = serverPlayerData.z;

                 // Set initial position of the PointerLockControls object (camera rig)
                 // Use PLAYER_HEIGHT from config
                 const visualY = initialPosY + (CONFIG?.PLAYER_HEIGHT || 1.8); // Add player height for camera position
                 if (controls?.getObject()) {
                     controls.getObject().position.set(initialPosX, visualY, initialPosZ);
                     controls.getObject().rotation.set(0, serverPlayerData.rotationY || 0, 0); // Set initial rotation
                     console.log(`[Network] Set initial controls position to (${initialPosX}, ${visualY}, ${initialPosZ})`);
                 } else {
                     console.error("!!! Controls object missing during initialize! Cannot set position.");
                 }

                 // Reset physics state
                 velocityY = 0;
                 isOnGround = true; // Assume starting on ground

                 // Update UI
                 if (typeof UIManager !== 'undefined') {
                     UIManager.updateHealthBar(serverPlayerData.health);
                     UIManager.updateInfo(`Playing as ${players[id].name}`); // Use name from server data
                     UIManager.clearError('homescreen'); // Clear any previous homescreen errors
                     UIManager.clearKillMessage(); // Clear any lingering kill messages
                 }

             } else {
                 // Add remote players using the utility function
                 this._addPlayer(serverPlayerData);
             }
         }

         console.log(`[Network] Initialization complete. ${Object.keys(players).length} players active.`);

         // Transition to the playing state
         if (typeof stateMachine !== 'undefined') {
             stateMachine.transitionTo('playing');
         } else {
             console.error("!!! stateMachine missing! Cannot transition to 'playing' state.");
         }
    },

    handlePlayerJoined: function(playerData) {
        // Add the player if they are not the local player and don't already exist
        if (playerData && playerData.id !== localPlayerId && !this._getPlayer(playerData.id)) {
             console.log(`[Network] Player joined: ${playerData.name} (${playerData.id})`);
             this._addPlayer(playerData); // Use utility function
        } else if (!playerData || !playerData.id) {
            console.warn("[Network] Received invalid playerJoined data:", playerData);
        }
        // Optional: Update player count display if not handled by playerCountUpdate
        // if (typeof UIManager !== 'undefined') UIManager.updatePlayerCount(Object.keys(players).length);
    },

    handlePlayerLeft: function(playerId) {
        if (playerId) {
            console.log(`[Network] Player left: ${players[playerId]?.name || playerId}`);
            this._removePlayer(playerId); // Use utility function
            // Optional: Update player count display if not handled by playerCountUpdate
            // if (typeof UIManager !== 'undefined') UIManager.updatePlayerCount(Object.keys(players).length);
        } else {
            console.warn("[Network] Received invalid playerLeft event (no ID).");
        }
    },

    handleHealthUpdate: function(data) {
        // data format: { id: string, health: number }
        if (!data || data.health === undefined || !data.id) {
            console.warn("[Network] Invalid healthUpdate data:", data);
            return;
        }

        const player = this._getPlayer(data.id);
        if (player) {
             console.log(`>>> [Network RX] Health Update for ${player.name || data.id}: ${data.health}`);
             player.health = data.health;
             // If it's the local player, update the health bar
             if (data.id === localPlayerId) {
                 if (typeof UIManager !== 'undefined') {
                     UIManager.updateHealthBar(data.health);
                 }
             } else {
                 // For remote players, health is mainly visual info, no direct UI element usually
                 // Could add overhead health bars later if desired
             }
        } else {
             console.warn(`[Network] Received health update for unknown player: ${data.id}`);
        }
    },

    handlePlayerDied: function(data) {
         // data format: { targetId: string, killerId: string|null, killerName: string|null, killerPhrase: string|null }
         if (!data || !data.targetId) {
             console.warn("[Network] Invalid playerDied data:", data);
             return;
         }

         console.log(`>>> [Network RX] Player Died: ${data.targetId}, Killer: ${data.killerName || 'Environment'}`);
         const targetPlayer = this._getPlayer(data.targetId);

         if (targetPlayer) {
             targetPlayer.health = 0; // Ensure health is zero
             // If it's a remote player, hide their mesh
             if (data.targetId !== localPlayerId && typeof targetPlayer.setVisible === 'function') {
                  targetPlayer.setVisible(false); // Make mesh invisible
             }
             // Could trigger death animation/effect here if needed
         } else {
              console.warn(`[Network] Received playerDied event for unknown target: ${data.targetId}`);
              // Still might need to show kill message if it was the local player dying
              // This case shouldn't happen if init/join logic is correct
         }

         // If the local player died, update UI and potentially controls
         if (data.targetId === localPlayerId) {
              if (typeof UIManager !== 'undefined') {
                  UIManager.updateHealthBar(0); // Show 0 health
                  // Construct kill message
                  let killMsg = "You were eliminated."; // Default message
                  if (data.killerId && data.killerName) {
                      killMsg = `You got ${data.killerPhrase || '...'} by ${data.killerName}`;
                  } else if (!data.killerId && data.killerName === null) { // Check for explicit null killer for environment
                     killMsg = "You fell out of the world."; // Or specific void message
                  } else {
                      // Handle cases where killer might be null but name isn't, or vice versa if server logic allows
                      killMsg = `Eliminated by ${data.killerName || 'an unknown force'}`;
                  }
                  UIManager.showKillMessage(killMsg);
              }
              if (typeof infoDiv !== 'undefined' && infoDiv) infoDiv.textContent = `DEAD - Respawning soon...`;
              // Optionally disable shooting, movement input? Depends on design.
              // Pointer lock should remain active until respawn typically.
              if (typeof Effects !== 'undefined') Effects.removeGunViewModel(); // Remove gun on death
         }
         // If someone else died, potentially show a kill feed message in UI
         else {
              if (typeof UIManager !== 'undefined') {
                    // Only show message if the local player was the killer
                    if(data.killerId === localPlayerId) {
                         const targetName = targetPlayer?.name || 'Someone';
                         const localPhrase = players[localPlayerId]?.phrase || '...';
                         UIManager.showKillMessage(`You ${localPhrase} ${targetName}`);
                    }
                    // Could add a general kill feed later for all kills
              }
         }

    },

    handlePlayerRespawned: function(playerData) {
        // data format: { id, x, y, z, rotationY, health, name, phrase } (Full data)
        if (!playerData || !playerData.id) {
             console.warn("[Network] Invalid playerRespawned data:", playerData);
             return;
        }

        console.log(`>>> [Network RX] Player Respawned: ${playerData.name} (${playerData.id})`);
        const player = this._getPlayer(playerData.id);

        if (player) {
            // Update existing player data
            player.health = playerData.health;
            player.x = playerData.x;
            player.y = playerData.y;
            player.z = playerData.z;
            player.rotationY = playerData.rotationY;
            player.name = playerData.name; // Update name/phrase in case they changed (unlikely)
            player.phrase = playerData.phrase;

            if (playerData.id === localPlayerId) {
                // Local player respawned
                console.log("[Network] Handling local player respawn.");
                // Set position/rotation using controls object
                const visualY = player.y + (CONFIG?.PLAYER_HEIGHT || 1.8);
                if (controls?.getObject()) {
                     controls.getObject().position.set(player.x, visualY, player.z);
                     // Should we force rotation? Or let the player keep looking where they were?
                     // controls.getObject().rotation.set(0, player.rotationY, 0); // Uncomment to force rotation reset
                } else {
                    console.error("!!! Controls object missing during respawn!");
                }
                // Reset physics state
                velocityY = 0;
                isOnGround = true;
                // Update UI
                if (typeof UIManager !== 'undefined') {
                     UIManager.updateHealthBar(player.health);
                     UIManager.updateInfo(`Playing as ${player.name}`);
                     UIManager.clearKillMessage(); // Clear the death message
                }
                 if (typeof Effects !== 'undefined') Effects.attachGunViewModel(); // Re-attach gun

            } else {
                // Remote player respawned
                if (typeof player.setVisible === 'function') {
                    player.setVisible(true); // Make mesh visible again
                } else if (player.mesh) {
                    player.mesh.visible = true; // Fallback
                }
                // Force position and interpolation targets immediately
                 if (typeof player.setInterpolationTargets === 'function') {
                     player.setInterpolationTargets(); // Update targets based on new data
                     if (player.mesh) {
                        // Snap position directly to avoid lerping from old dead position
                         let visualY = player.y;
                         // Adjust Y based on mesh type (Cylinder vs Model) - ClientPlayer should handle this ideally
                         if (player.mesh.geometry instanceof THREE.CylinderGeometry) {
                             visualY += (CONFIG?.PLAYER_HEIGHT || 1.8) / 2;
                         } // Else assume model origin is at feet
                         player.mesh.position.set(player.x, visualY, player.z);
                         player.mesh.rotation.y = player.rotationY; // Snap rotation too
                     }
                 } else {
                     console.warn(`Player ${playerData.id} missing setInterpolationTargets method.`);
                 }

            }

        } else {
            // Player wasn't known locally, but received respawn event (e.g., joined while dead?)
            console.warn(`[Network] Received respawn event for player ${playerData.id} who was not previously known. Adding.`);
            this._addPlayer(playerData); // Add them now
        }
    },

    handleShotFired: function(data){
        // data format: { shooterId, position: {x,y,z}, direction: {x,y,z}, bulletId }
        // Validate necessary fields
        if (!data || !data.shooterId || !data.position || !data.direction || !data.bulletId) {
             console.warn("[Network] Invalid shotFired data received:", data);
             return;
        }
        // Spawn bullet visually if the function exists
        if (typeof spawnBullet === 'function') {
             spawnBullet(data);
        } else {
             console.error("!!! spawnBullet function is missing! Cannot visualize shots.");
        }
    },

    handleServerFull: function() {
        console.warn("[Network] Received 'serverFull' message.");
        // Disconnect or show appropriate message on the homescreen
        if (socket) socket.disconnect(); // Disconnect the client

        if (typeof stateMachine !== 'undefined' && stateMachine.is('joining')) {
             // If we were in the process of joining, go back to homescreen with error
             stateMachine.transitionTo('homescreen', { playerCount: UIManager?.playerCountSpan?.textContent ?? '?' });
             if(typeof UIManager !== 'undefined') UIManager.showError("Server is full. Please try again later.", 'homescreen');
        } else {
             // If already connected somehow, handle disconnect normally (disconnect handler will run)
             // If on homescreen, show error directly
             if (typeof UIManager !== 'undefined') UIManager.showError("Server is currently full.", 'homescreen');
        }
    },


     // --- Actions Sent To Server ---
     attemptJoinGame: function() {
         console.log("--- [Network] attemptJoinGame called ---");
         // Ensure UI elements are available (UIManager should be initialized by now)
         if (!UIManager || !UIManager.playerNameInput || !UIManager.playerPhraseInput || !UIManager.homeScreenError) {
             console.error("!!! UI elements (UIManager refs) missing for attemptJoinGame!");
             // Show error if possible
             if (UIManager && UIManager.showError) {
                 UIManager.showError("UI Error - Cannot Join", 'homescreen');
             } else {
                 alert("UI Error - Cannot Join");
             }
             return;
         }

         // Get and sanitize input
         localPlayerName = UIManager.playerNameInput.value.trim() || 'Anonymous';
         localPlayerPhrase = UIManager.playerPhraseInput.value.trim() || '...'; // Default phrase

         // Basic validation
         if (!localPlayerName){
             UIManager.showError('Please enter a name.', 'homescreen');
             return;
         }
         if (localPlayerName.length > 16){ // Match server limits if possible
             UIManager.showError('Name too long (max 16 chars).', 'homescreen');
             return;
         }
         if (localPlayerPhrase.length > 20){ // Match server limits
             UIManager.showError('Phrase too long (max 20 chars).', 'homescreen');
             return;
         }

         UIManager.clearError('homescreen'); // Clear previous errors

         // --- Check Asset Status via LoadManager ---
         let assetsAreReady = false;
         let criticalAssetError = false;
         if (typeof loadManager !== 'undefined' && loadManager.assets) {
              // Check state of required assets
              const mapState = loadManager.assets.map?.state;
              const playerModelState = loadManager.assets.playerModel?.state;
              const gunModelState = loadManager.assets.gunModel?.state;
              // Check if all required assets are loaded
              assetsAreReady = loadManager.requiredForGame.every(key => loadManager.assets[key]?.state === 'loaded');
              // Check if any required asset encountered an error
              criticalAssetError = loadManager.requiredForGame.some(key => loadManager.assets[key]?.state === 'error');

              console.log(`[Network] Attempting Join | Asset Check: Ready=${assetsAreReady}, Error=${criticalAssetError} (States: Map=${mapState}, Player=${playerModelState}, Gun=${gunModelState})`);
         } else {
             console.error("!!! LoadManager missing or invalid during attemptJoinGame!");
             criticalAssetError = true; // Assume error if LoadManager is broken
         }

         // Handle asset errors
         if (criticalAssetError) {
             UIManager.showError('A critical asset failed to load. Cannot join.', 'homescreen');
             // Optionally transition stateMachine to error?
             // stateMachine.transitionTo('loading', {message: 'Asset Load Error!', error: true});
             return;
         }

         // --- Check Network Status ---
          if (!Network.isConnected()) {
             console.warn("[Network] Attempting join, but socket not connected yet. Waiting...");
             // Show feedback to user
             UIManager.showError('Connecting to server...', 'homescreen');
             // Disable join button temporarily
             if (UIManager.joinButton) {
                 UIManager.joinButton.disabled = true;
                 UIManager.joinButton.textContent = "Connecting...";
             }
             // Transition to joining state, wait for connect event
             if(typeof stateMachine!=='undefined') {
                 stateMachine.transitionTo('joining',{waitingForAssets: !assetsAreReady}); // Indicate if waiting for assets too
             } else {
                 console.error("stateMachine missing!");
             }
             // The 'connect' handler or 'assetLoaded' handler will eventually call sendJoinDetails if needed.
             return; // Don't proceed further until connected
         }


         // --- Transition State and Send Details ---
         console.log("[Network] Socket connected. Proceeding with join attempt.");
         if(typeof stateMachine!=='undefined') {
             // Indicate if waiting for assets or just server response
             stateMachine.transitionTo('joining', { waitingForAssets: !assetsAreReady });
         } else {
             console.error("stateMachine missing!");
         }

         // If assets are ready, send details immediately.
         // If assets are NOT ready, LoadManager's 'ready' event will trigger sendJoinDetails later.
         if (assetsAreReady) {
             Network.sendJoinDetails();
         } else {
             console.log("[Network] Waiting for assets to load before sending join details...");
             // UIManager should already show "Loading Assets..." via the state machine transition
         }
     }, // End attemptJoinGame

     sendJoinDetails: function() {
         console.log("--- [Network] sendJoinDetails called ---");

         // Ensure we are in the correct state and connected
         if (typeof stateMachine === 'undefined' || !stateMachine.is('joining')) {
             console.warn("! [Network] Attempted to send join details, but not in 'joining' state. Current state:", stateMachine?.currentState);
             // Potentially revert to homescreen if state is wrong
             if(typeof stateMachine !== 'undefined') stateMachine.transitionTo('homescreen',{playerCount:UIManager?.playerCountSpan?.textContent ?? '?'});
             return;
         }

         if (!Network.isConnected()) {
             console.error("! [Network] Attempted to send join details, but socket is disconnected.");
             // Update UI
             if (typeof UIManager !== 'undefined') {
                 UIManager.showError('Connection lost before joining.', 'homescreen');
             }
             // Revert state
             stateMachine.transitionTo('homescreen',{playerCount:UIManager?.playerCountSpan?.textContent ?? '?'});
             return;
         }

         // Send the details
         console.log(`[Network] Sending setPlayerDetails - Name: ${localPlayerName}, Phrase: ${localPlayerPhrase}`);
         socket.emit('setPlayerDetails', { name: localPlayerName, phrase: localPlayerPhrase });

         // Optionally, update UI to show "Joining..." if not already handled by state machine listener
         if (UIManager && UIManager.joinButton) {
             UIManager.joinButton.disabled = true;
             UIManager.joinButton.textContent = "Joining...";
         }
     },

     sendPlayerUpdate: function(playerData) {
        // playerData format: {x, y, z, rotationY}
        if (Network.isConnected() && stateMachine?.is('playing')) {
            socket.emit('playerUpdate', playerData);
        }
     },

     sendShoot: function(shootData) {
        // shootData format: { position: {x,y,z}, direction: {x,y,z} }
         if (Network.isConnected() && stateMachine?.is('playing')) {
             socket.emit('shoot', shootData);
         }
     },

     sendHit: function(targetId, damageAmount) {
        // Send hit event to server for validation
         if (Network.isConnected() && stateMachine?.is('playing')) {
             console.log(`[Network TX] Sending hit -> Target: ${targetId}, Damage: ${damageAmount}`);
             socket.emit('hit', { targetId: targetId, damage: damageAmount });
         }
     },

     sendVoidDeath: function() {
        // Notify server player fell into void
         if (Network.isConnected() && stateMachine?.is('playing')) {
             console.log("[Network TX] Sending fellIntoVoid");
             socket.emit('fellIntoVoid');
         }
     }

}; // End Network object

// Export globally if needed by other modules directly, though ideally accessed via Network.method()
window.Network = Network;
console.log("network.js loaded");

// Helper function (if needed globally, otherwise keep inside Network or move to utils.js)
// This function might be better placed within the gameLogic or entities modules
// Or potentially removed if player removal is fully handled by Network._removePlayer
function removePlayerMesh(playerId) {
     // This is redundant if Network._removePlayer is used consistently
     console.warn("Global removePlayerMesh called - should ideally use Network._removePlayer");
     const player = players[playerId];
     if (player) {
         if (typeof player.remove === 'function') {
             player.remove(); // Use the instance method if available
         } else if (player.mesh && typeof scene !== 'undefined') {
             scene.remove(player.mesh);
             // Consider disposing geometry/material here if not done in ClientPlayer.remove
             player.mesh.geometry?.dispose();
             if (player.mesh.material) {
                  if (Array.isArray(player.mesh.material)) {
                     player.mesh.material.forEach(m => m.dispose());
                  } else {
                     player.mesh.material.dispose();
                  }
             }
         }
         delete players[playerId];
     }
 }
