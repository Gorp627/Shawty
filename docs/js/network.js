// const SERVER_URL = 'ws://localhost:3000'; // For local testing
const SERVER_URL = 'https://gametest-psxl.onrender.com'; // Your Render server URL

export class NetworkManager {
    constructor(uiManager, gameManager) {
        this.socket = null;
        this.uiManager = uiManager;
        this.gameManager = gameManager; // To call game methods
    }

    connect(playerName, selectedCharacter) {
        this.socket = io(SERVER_URL);

        this.socket.on('connect', () => {
            console.log('Connected to server with ID:', this.socket.id);
            this.socket.emit('joinGame', { name: playerName, character: selectedCharacter });
        });

        this.socket.on('availableCharacters', (characters) => {
            this.uiManager.populateCharacterSelector(characters);
        });
        
        this.socket.on('currentMap', (mapInfo) => {
            if (this.gameManager) {
                this.gameManager.setCurrentMapInfo(mapInfo);
            } else {
                console.warn("GameManager not ready for currentMap info");
            }
        });

        this.socket.on('playerCount', (count) => {
            this.uiManager.updatePlayerCount(count);
        });

        this.socket.on('gameJoined', (data) => {
            // data: { playerId, initialPlayers, spawnPoint, currentMap, gameSettings }
            console.log('Game joined!', data);
            this.uiManager.showGameUI();
            this.uiManager.hideHomeMenu();
            if (this.gameManager) {
                this.gameManager.setCurrentMapInfo(data.currentMap); // Ensure map info is set
                this.gameManager.setGameSettings(data.gameSettings);
                this.gameManager.initGameScene(data.playerId, data.initialPlayers, data.spawnPoint);
            }
        });

        this.socket.on('playerJoined', (playerData) => {
            console.log('Player joined game:', playerData);
            if (this.gameManager) this.gameManager.addPlayer(playerData);
            this.uiManager.updatePlayerCount(Object.keys(this.gameManager.remotePlayers).length + 1); // Approximate
        });

        this.socket.on('playerLeft', (playerId) => {
            console.log('Player left game:', playerId);
            if (this.gameManager) this.gameManager.removePlayer(playerId);
             this.uiManager.updatePlayerCount(Object.keys(this.gameManager.remotePlayers).length +1); // Approximate
        });

        this.socket.on('playerMoved', (data) => {
            // data: { id, position, rotation, velocity, isDashing, isShooting }
            if (this.gameManager) this.gameManager.updateRemotePlayer(data);
        });

        this.socket.on('shotFired', (data) => {
            // data: { shooterId, origin, direction, E_pressed }
            if (this.gameManager) this.gameManager.handleRemoteShot(data);
        });
        
        this.socket.on('applyGunRecoil', (data) => { // data: { direction }
            if (this.gameManager && this.gameManager.localPlayer) {
                this.gameManager.localPlayer.applyGunPropulsion(data.direction);
            }
        });

        this.socket.on('playerDamaged', (data) => {
            // data: { victimId, attackerId, health }
            if (this.gameManager) this.gameManager.handlePlayerDamage(data);
        });

        this.socket.on('playerDied', (data) => {
            // data: { victimId, killerId, deathPosition, victimName, killerName, updatedScores }
            if (this.gameManager) this.gameManager.handlePlayerDeath(data);
            this.uiManager.addFeedMessage(`${data.killerName || 'Environment'} eliminated ${data.victimName}.`);
            if (this.gameManager.leaderboardData) { // Update leaderboard if visible
                this.updateLeaderboardScores(data.updatedScores);
            }
        });

        this.socket.on('playerRespawn', (data) => {
            // data: { playerId, position, health }
            if (this.gameManager) this.gameManager.handlePlayerRespawn(data);
        });

        this.socket.on('newChatMessage', (data) => {
            // data: { name, text }
            this.uiManager.addChatMessage(data.name, data.text);
        });
        
        this.socket.on('chatHistory', (messages) => {
            messages.forEach(msg => this.uiManager.addChatMessage(msg.name, msg.text, true));
        });

        this.socket.on('systemMessage', (message) => {
            this.uiManager.addSystemMessage(message);
        });

        this.socket.on('timerUpdate', (timeRemaining) => {
            this.uiManager.updateTimer(timeRemaining);
        });

        this.socket.on('roundStart', (data) => {
            // data: { mapName, duration, players }
            console.log("Round Started:", data);
            this.uiManager.hideRoundEndScreen();
            this.uiManager.updateTimer(data.duration);
            this.uiManager.clearKillFeed();
            if (this.gameManager) {
                 // Check if map needs to be changed/reloaded
                if (!this.gameManager.currentMapInfo || this.gameManager.currentMapInfo.name !== data.mapName) {
                    const newMapInfo = this.gameManager.serverGameSettings.MAPS.find(m => m.name === data.mapName); // Assuming server sends full map list in gameSettings
                    if (newMapInfo) {
                        this.gameManager.setCurrentMapInfo(newMapInfo); // This should trigger map loading in game.js
                        // Game entities will be reset/re-added based on server player data
                    }
                }
                this.gameManager.updateAllPlayersState(data.players); // Sync all player scores and states
            }
            this.uiManager.addSystemMessage(`Round started on ${data.mapName}!`);
        });

        this.socket.on('roundEnd', (data) => {
            // data: { leaderboard }
            console.log("Round Ended:", data);
            this.uiManager.showRoundEndScreen(data.leaderboard);
            if (this.gameManager && this.gameManager.localPlayer) {
                this.gameManager.localPlayer.isChatting = true; // Force chat off, disable controls
                 this.gameManager.controlsActive = false;
                 document.exitPointerLock();
            }
        });
        
        this.socket.on('disconnect', () => {
            console.log('Disconnected from server.');
            this.uiManager.showHomeMenuWithMessage("Disconnected from server. Please refresh.");
            if(this.gameManager) this.gameManager.cleanup();
        });

        this.socket.on('connect_error', (err) => {
            console.error('Connection Error:', err);
            this.uiManager.showHomeMenuWithMessage(`Connection failed: ${err.message}. Ensure server is running.`);
        });
    }
    
    updateLeaderboardScores(updatedScores) {
        if (!this.gameManager.leaderboardData) this.gameManager.leaderboardData = {};
        for (const playerId in updatedScores) {
            const playerEntry = Object.values(this.gameManager.leaderboardData).find(p => p.id === playerId) || 
                                Object.values(this.gameManager.getAllPlayers()).find(p => p.id === playerId); // Try to find by name if not in leaderboardData yet

            if (playerEntry) {
                playerEntry.kills = updatedScores[playerId].kills;
                playerEntry.deaths = updatedScores[playerId].deaths;
            } else { // New player for leaderboard, or player name from remotePlayers
                const playerInfo = this.gameManager.getAllPlayers()[playerId];
                if(playerInfo){
                    this.gameManager.leaderboardData[playerId] = { // This structure might differ from server's leaderboard
                        id: playerId,
                        name: playerInfo.name, // Need to get name
                        kills: updatedScores[playerId].kills,
                        deaths: updatedScores[playerId].deaths
                    };
                }
            }
        }
        if (this.uiManager.isLeaderboardVisible()) {
            this.uiManager.updateLeaderboard(this.gameManager.getLeaderboard());
        }
    }

    sendPlayerUpdate(position, rotation, velocity, isDashing, isShooting) {
        if (this.socket && this.socket.connected) {
            this.socket.emit('playerUpdate', { position, rotation, velocity, isDashing, isShooting });
        }
    }

    sendShoot(direction, E_pressed) {
        if (this.socket && this.socket.connected) {
            this.socket.emit('shoot', { direction, E_pressed });
        }
    }
    
    sendPlayerHit(victimId, damage) {
        if (this.socket && this.socket.connected) {
            this.socket.emit('playerHit', { victimId, damage });
        }
    }

    sendChatMessage(message) {
        if (this.socket && this.socket.connected) {
            this.socket.emit('chatMessage', message);
        }
    }
    
    sendDash() {
        if (this.socket && this.socket.connected) {
            this.socket.emit('playerDash');
        }
    }
}
