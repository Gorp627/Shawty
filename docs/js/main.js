// docs/js/main.js
/* global ui, network, game, THREE */ // For linters

const main = {
    localPlayerInfo: {
        name: null,
        character: null
    },

    init: function() {
        console.log("Shawty Game Client Initializing...");
        ui.init(this.onPlayPressed.bind(this), this.onChatMessageSend.bind(this));
        network.connect(
            this.onServerConnected.bind(this),
            this.onServerMessage.bind(this),
            this.onServerDisconnected.bind(this)
        );

        // Resume AudioContext on first user interaction (good practice for browsers)
        const resumeAudio = () => {
            if (game.listener && game.listener.context.state === 'suspended') {
                game.listener.context.resume();
            }
            document.body.removeEventListener('click', resumeAudio);
            document.body.removeEventListener('keydown', resumeAudio);
        };
        document.body.addEventListener('click', resumeAudio);
        document.body.addEventListener('keydown', resumeAudio);
    },

    onPlayPressed: function(playerName, selectedCharacter) {
        console.log(`Play pressed. Name: ${playerName}, Character: ${selectedCharacter}`);
        this.localPlayerInfo.name = playerName;
        this.localPlayerInfo.character = selectedCharacter;

        // Initialize the game scene (Three.js, Cannon.js)
        // This will also load assets. When assets are loaded, onGameInitialized will be called.
        const canvas = document.getElementById('gameCanvas');
        game.init(canvas, playerName, selectedCharacter);
    },
    
    // This will be called from game.js after assets are loaded and basic scene is up
    onGameInitialized: function() {
        console.log("Game scene initialized by game.js. Ready to send join request.");
        if (network.isConnected) {
            network.joinGame(this.localPlayerInfo.name, this.localPlayerInfo.character);
        } else {
            console.warn("Game initialized, but network not connected. Join request will be queued.");
             // Join request is already queued by network.send if socket wasn't open.
        }
    },

    onChatMessageSend: function(message) {
        network.sendChatMessage(message);
        // Optionally, add local message to UI immediately for responsiveness
        // ui.addChatMessage(this.localPlayerInfo.name || "Me", message); // Server will echo it back anyway
    },

    onServerConnected: function() {
        console.log("Main: Server connected.");
        // If game is already initialized (e.g. reconnect after game was running)
        // and join request was queued, it should be sent now by network.js
        // If game is NOT yet initialized (first connect), onGameInitialized will handle join.
    },

    onServerMessage: function(data) {
        // Most messages are handled by network.js which calls game.js methods directly
        // This is a fallback or for messages specific to main.js/ui.js coordination
        // console.log("Main received message from network layer:", data);

        switch (data.type) {
            case 'playerCount':
                ui.updatePlayersOnline(data.count);
                break;
            case 'eventLog': // General server messages for UI
                // ui.addEventLogMessage(data.entry.message); // Example, if UI needs it
                console.log("Server Event:", data.entry.message);
                break;
            case 'chat': // Already handled by network which calls ui.addChatMessage
                // ui.addChatMessage(data.sender, data.message);
                break;
             case 'roundStart':
                ui.resetUIForNewRound();
                ui.updateGameStats(data.timeLeft, game.localPlayer.kills, game.localPlayer.deaths); // Kills/deaths reset on server
                if (game.isInitialized) game.resetLocalPlayerStats(); // Reset local counters if needed
                break;
            case 'roundEnd':
                ui.displayCenterEvent(`${data.winnerName} wins the round!`, 7000);
                ui.showLeaderboard(data.scores);
                // Don't hide leaderboard immediately, let player view it
                break;
            // Game-specific messages are passed to game.js by network.js
            // e.g., gameState, gameStateUpdate, playerJoined, playerLeft, playerDied etc.
        }
    },

    onServerDisconnected: function() {
        console.warn("Main: Server disconnected.");
        ui.displayCenterEvent("Disconnected. Attempting to reconnect...", 0); // 0 duration = stays until changed
        // Potentially show home screen or a "reconnecting" overlay
        // ui.showHomeScreen(); // Or similar
    }
};

// Expose main to global if needed for callbacks from other files easily
window.main = main;

// Initialize when the DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    main.init();
});
