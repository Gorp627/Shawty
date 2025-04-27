// docs/network.js

// Depends on: config.js, stateMachine.js, entities.js, input.js, effects.js, uiManager.js, game.js
// Accesses globals: players, localPlayerId, socket, controls, CONFIG,
//                   stateMachine, UIManager, ClientPlayer, scene, infoDiv, currentGameInstance, assetsAreReady
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
            console.log('[Net] Socket Connected! ID:', socket.id);
            networkIsInitialized = true; // Set flag now connection is established

            // If we were in the 'joining' state (meaning user clicked Join before connecting)
            // AND assets are ready, send the join details now.
            if (stateMachine?.is('joining') && assetsAreReady) {
                 console.log("[Net Connect Handler] State is 'joining' and assets ready. Sending join details...");
                 Network.sendJoinDetails();
            } else if (stateMachine?.is('joining') && !assetsAreReady) {
                 console.log("[Net Connect Handler] State is 'joining' but assets not ready. Waiting for assets...");
                 // LoadManager 'ready' event will handle sending details later
                 if(UIManager.joinButton) { UIManager.joinButton.disabled = true; UIManager.joinButton.textContent = "Loading Assets..."; }
            }
        });

        socket.on('disconnect', (reason) => {
            console.warn('[Net] Disconnected:', reason);
            networkIsInitialized = false; // Reset flag
            initializationData = null; // Clear stored data
            if (typeof stateMachine !== 'undefined') {
                 stateMachine.transitionTo('homescreen', { playerCount: 0 });
                 if (typeof UIManager !== 'undefined') {
                     UIManager.updatePlayerCount(0);
                     UIManager.showError("Disconnected from server.", 'homescreen');
                 }
            }
            if (typeof infoDiv !== 'undefined' && infoDiv) infoDiv.textContent = 'Disconnected';
            if (controls?.isLocked) controls.unlock();
        });

        socket.on('connect_error', (err) => {
            console.error('!!! [Net] Connect Error:', err.message);
            networkIsInitialized = false; // Ensure flag is false on error
             if (typeof stateMachine !== 'undefined') {
                 if (stateMachine.is('loading') || stateMachine.is('joining')) {
                    stateMachine.transitionTo('loading',{message:`Connection Failed!<br/>${err.message}`,error:true});
                 } else {
                     stateMachine.transitionTo('homescreen');
                     if(UIManager) UIManager.showError(`Connection Failed: ${err.message}`, 'homescreen');
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
    _addPlayer: function(playerData) { /* ... no change ... */ },
    _removePlayer: function(playerId) { /* ... no change ... */ },


    // Initialize: Store data, set flag, START THE GAME if assets ready
    handleInitialize: function(data) {
         console.log('[Net] RX initialize');
         if (!data?.id || !data.players) {
             console.error("Invalid initialize data received from server.");
             stateMachine?.transitionTo('homescreen');
             UIManager?.showError("Server Init Data Invalid", "homescreen");
             return;
         }

         initializationData = data; // Store data globally
         // networkIsInitialized = true; // Flag is already set on 'connect'

         // THIS is the point where we should start the game play, IF assets are ready.
         if (assetsAreReady) {
             console.log("[Net Initialize Handler] Assets ready. Starting game play...");
             if (currentGameInstance?.startGamePlay) {
                 currentGameInstance.startGamePlay(initializationData); // This transitions state to 'playing'
             } else {
                  console.error("[Net Initialize Handler] Game instance missing! Cannot start game.");
                  stateMachine?.transitionTo('homescreen');
                  UIManager?.showError("Client Startup Error", "homescreen");
             }
         } else {
             console.log("[Net Initialize Handler] Received initialize, but assets not ready. Waiting for assets...");
             // The loadManager 'ready' event handler will call startGamePlay later.
             if (stateMachine?.is('joining') && UIManager?.showLoading) {
                  UIManager.showLoading("Finalizing Assets..."); // Update status message
             }
         }
    }, // End handleInitialize

    handlePlayerJoined: function(playerData) { /* ... no change ... */ },
    handlePlayerLeft: function(playerId) { /* ... no change ... */ },
    handleGameStateUpdate: function(state) { /* ... no change ... */ },
    handleHealthUpdate: function(data) { /* ... no change ... */ },
    handlePlayerDied: function(data) { /* ... no change ... */ },
    handlePlayerRespawned: function(playerData) { /* ... no change ... */ },
    handleServerFull: function() { /* ... no change ... */ },


     // --- Actions Sent To Server ---

     attemptJoinGame: function() {
        console.log("--- [Net] attemptJoinGame ---");
        if (!UIManager?.playerNameInput || !UIManager.playerPhraseInput) { console.error("UI Inputs missing!"); return; }
        localPlayerName = UIManager.playerNameInput.value.trim() || 'Anon';
        localPlayerPhrase = UIManager.playerPhraseInput.value.trim() || '...';

        if (!localPlayerName) { UIManager.showError('Please enter a name.', 'homescreen'); return; }
        UIManager.clearError('homescreen');

        // Check Asset Status (already checked by game.js before calling this usually, but double check)
        if (!assetsAreReady) {
            console.warn("[Net] Assets not ready, cannot attempt join yet.");
            UIManager.showError('Assets still loading...', 'homescreen');
             // Maybe transition to loading screen? Or just disable button.
             stateMachine?.transitionTo('loading', { message: "Waiting for assets..." });
            return;
        }

        // Transition to 'joining' state FIRST
        stateMachine?.transitionTo('joining');
        if (UIManager.joinButton) { UIManager.joinButton.disabled = true; UIManager.joinButton.textContent = "Joining..."; }

        // Now check network connection
        if (Network.isConnected()) {
            console.log("[Net] Already connected. Sending join details...");
            Network.sendJoinDetails(); // Assets are ready, network connected -> send details
        } else {
            console.log("[Net] Not connected. Waiting for connection...");
            // Update button text maybe
            if (UIManager.joinButton) { UIManager.joinButton.textContent = "Connecting..."; }
            // The 'connect' event handler will trigger sendJoinDetails if state is still 'joining'
            if (socket && !socket.active) { socket.connect(); } // Ensure connection attempt is active
        }
     },

     sendJoinDetails: function() {
         // Make sure we are actually supposed to be joining and are connected
         if (!stateMachine?.is('joining')) {
             console.warn("sendJoinDetails called but not in 'joining' state. Aborting.");
             return; // Avoid sending multiple times if state changed unexpectedly
         }
         if (!Network.isConnected()) {
             console.error("sendJoinDetails called but socket disconnected. Aborting.");
             stateMachine?.transitionTo('homescreen', { playerCount: UIManager?.playerCountSpan?.textContent ?? '?' });
             UIManager?.showError('Connection lost.', 'homescreen');
             return;
         }

         console.log(`[Net TX] setPlayerDetails Name: ${localPlayerName}, Phrase: ${localPlayerPhrase}`);
         socket.emit('setPlayerDetails', { name: localPlayerName, phrase: localPlayerPhrase });
         // Keep button disabled, text "Joining..." is fine.
     },

     sendPlayerUpdate: function(data) { /* ... no change ... */ },

}; // End Network object

window.Network = Network;
console.log("network.js loaded (Simplified Join Logic)");
