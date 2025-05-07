// docs/js/main.js
import * as THREE from 'three'; // Import THREE to ensure it's available if other modules need it implicitly
                               // Though game.js will import it directly.

// For ui, network, game, we are currently relying on them attaching to the window object.
// A full ESM conversion would involve importing them here.
// import importedUI from './ui.js'; // Example if ui.js had a default export
// import importedNetwork from './network.js';
// import importedGame from './game.js';

// Make ui, network, and game globally accessible for easier inter-script communication (as originally structured)
// These files will assign themselves to window.ui, window.network, window.game
import './ui.js';
import './network.js';
import './game.js';


const mainController = {
    localPlayerInfo: {
        name: null,
        character: null
    },

    init: function() {
        console.log("Shawty Game Client Initializing...");
        if (!window.ui) { console.error("UI script not loaded!"); return; }
        if (!window.network) { console.error("Network script not loaded!"); return; }
        if (!window.game) { console.error("Game script not loaded!"); return; }


        window.ui.init(this.onPlayPressed.bind(this), this.onChatMessageSend.bind(this));
        window.network.connect(
            this.onServerConnected.bind(this),
            this.onServerMessage.bind(this),
            this.onServerDisconnected.bind(this)
        );

        const resumeAudio = () => {
            // Check if game and listener are initialized
            if (window.game && window.game.listener && window.game.listener.context && window.game.listener.context.state === 'suspended') {
                window.game.listener.context.resume().catch(e => console.warn("AudioContext resume failed:", e));
            }
            document.body.removeEventListener('click', resumeAudio);
            document.body.removeEventListener('keydown', resumeAudio);
        };
        document.body.addEventListener('click', resumeAudio, { once: true }); // Use once to auto-remove
        document.body.addEventListener('keydown', resumeAudio, { once: true });
    },

    onPlayPressed: function(playerName, selectedCharacter) {
        console.log(`Play pressed. Name: ${playerName}, Character: ${selectedCharacter}`);
        this.localPlayerInfo.name = playerName;
        this.localPlayerInfo.character = selectedCharacter;

        const canvas = document.getElementById('gameCanvas');
        if (!canvas) {
            console.error("gameCanvas not found!");
            return;
        }
        window.game.init(canvas, playerName, selectedCharacter);
    },
    
    onGameInitialized: function() { // This will be called by game.js
        console.log("Game scene initialized by game.js. Ready to send join request.");
        if (window.network.isConnected) {
            window.network.joinGame(this.localPlayerInfo.name, this.localPlayerInfo.character);
        } else {
            console.warn("Game initialized, but network not connected. Join request will be queued if not already.");
            // network.js's send function already queues 'join' if not connected
        }
    },

    onChatMessageSend: function(message) {
        window.network.sendChatMessage(message);
    },

    onServerConnected: function() {
        console.log("Main: Server connected.");
        // If game is already initialized (e.g. reconnect after game was running)
        // and join request was queued, it should be sent now by network.js processMessageQueue.
    },

    onServerMessage: function(data) {
        if (!window.ui || !window.game) return; // Ensure scripts are loaded

        switch (data.type) {
            case 'playerCount':
                window.ui.updatePlayersOnline(data.count);
                break;
            case 'eventLog':
                console.log("Server Event:", data.entry.message);
                break;
            case 'chat': // Server echoes chat messages
                window.ui.addChatMessage(data.sender, data.message);
                break;
            case 'gameState': // Initial full state, primarily handled by game.js
                window.game.initializeGameState(data);
                break;
            case 'gameStateUpdate': // Delta updates, primarily handled by game.js
                window.game.updateGameState(data);
                break;
            case 'playerJoined':
                if (data.player) window.game.addPlayer(data.player);
                break;
            case 'playerLeft':
                window.game.removePlayer(data.id);
                break;
            case 'playerShot':
                window.game.handlePlayerShotEffect(data);
                break;
            case 'playerDied':
                window.game.handlePlayerDied(data);
                break;
            case 'playerRespawn':
                window.game.handlePlayerRespawn(data);
                break;
            case 'healthUpdate':
                 if(data.playerId && data.health !== undefined) window.game.updatePlayerHealth(data.playerId, data.health);
                break;
            case 'roundStart':
                window.ui.resetUIForNewRound();
                if(window.game.localPlayer) { // Check if localPlayer exists
                    window.ui.updateGameStats(data.timeLeft, window.game.localPlayer.kills, window.game.localPlayer.deaths);
                }
                if (window.game.isInitialized) window.game.resetLocalPlayerStats();
                break;
            case 'roundEnd':
                window.ui.displayCenterEvent(`${data.winnerName} wins the round!`, 7000);
                window.ui.showLeaderboard(data.scores);
                break;
            // Other specific messages can be added here or directly in game.js via network callbacks
        }
    },

    onServerDisconnected: function() {
        console.warn("Main: Server disconnected.");
        if (window.ui) {
            window.ui.displayCenterEvent("Disconnected. Attempting to reconnect...", 0);
        }
    }
};

window.mainController = mainController; // Make mainController globally accessible

document.addEventListener('DOMContentLoaded', () => {
    mainController.init();
});
