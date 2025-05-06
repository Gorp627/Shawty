// docs/js/UI.js

export class UI {
    constructor(mainApp) {
        this.mainApp = mainApp; // Reference to main.js instance

        // Loading Screen
        this.loadingScreen = document.getElementById('loading-screen');
        this.loadingMessage = document.getElementById('loading-message');
        this.progressBar = document.getElementById('progress-bar');
        this.errorMessage = document.getElementById('error-message');

        // Home Menu
        this.homeMenu = document.getElementById('home-menu');
        this.playerNameInput = document.getElementById('player-name-input');
        this.characterSelector = document.getElementById('character-selector');
        this.joinGameButton = document.getElementById('join-game-button');
        this.onlinePlayersMenu = document.getElementById('online-players-menu');

        // Game UI
        this.gameUI = document.getElementById('game-ui');
        this.crosshair = document.getElementById('crosshair');
        this.healthDisplay = document.getElementById('health-display');
        this.roundTimeDisplay = document.getElementById('round-time-display');
        this.killsDisplay = document.getElementById('kills-display');
        this.deathsDisplay = document.getElementById('deaths-display');
        this.chatOutput = document.getElementById('chat-output');
        this.chatInput = document.getElementById('chat-input');
        this.leaderboardDisplay = document.getElementById('leaderboard');
        this.leaderboardList = document.getElementById('leaderboard-list');
        this.roundOverScreen = document.getElementById('round-over-screen');
        this.winnerAnnouncement = document.getElementById('winner-announcement');
        this.deathMessageScreen = document.getElementById('death-message');
        this.killedByMessage = document.getElementById('killed-by-message');

        this.selectedCharacter = "Shawty"; // Default

        this.initEventListeners();
    }

    initEventListeners() {
        this.joinGameButton.addEventListener('click', () => this.handleJoinGame());

        this.characterSelector.addEventListener('click', (event) => {
            const target = event.target.closest('.character-option');
            if (target) {
                this.characterSelector.querySelectorAll('.character-option').forEach(opt => opt.classList.remove('selected'));
                target.classList.add('selected');
                this.selectedCharacter = target.dataset.character;
            }
        });

        // Chat input focus/blur
        document.addEventListener('keydown', (event) => {
            if (event.key.toLowerCase() === 't' && !this.isChatting()) {
                event.preventDefault();
                this.chatInput.style.display = 'block';
                this.chatInput.focus();
                if (this.mainApp.characterControls) this.mainApp.characterControls.setChatting(true);
            }
        });

        this.chatInput.addEventListener('blur', () => {
            if (this.chatInput.value === "") {
                 this.chatInput.style.display = 'none';
            }
            if (this.mainApp.characterControls) this.mainApp.characterControls.setChatting(false);
        });

        this.chatInput.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                const messageText = this.chatInput.value.trim();
                if (messageText) {
                    this.mainApp.socket.emit('chatMessage', { text: messageText });
                }
                this.chatInput.value = '';
                this.chatInput.blur(); // Also unfocuses and hides if empty
            } else if (event.key === 'Escape') {
                this.chatInput.value = '';
                this.chatInput.blur();
            }
        });
    }

    isChatting() {
        return document.activeElement === this.chatInput;
    }

    setLoadingMessage(message) {
        this.loadingMessage.textContent = message;
    }

    updateProgressBar(percentage) {
        this.progressBar.style.width = `${percentage}%`;
    }

    showErrorMessage(message) {
        this.errorMessage.textContent = message;
        this.errorMessage.style.display = 'block';
        this.loadingMessage.style.display = 'none';
        this.progressBar.parentElement.style.display = 'none';
    }
    
    hideLoadingScreen() {
        this.loadingScreen.style.display = 'none';
    }

    showHomeMenu() {
        this.hideLoadingScreen();
        this.homeMenu.style.display = 'block';
    }

    hideHomeMenu() {
        this.homeMenu.style.display = 'none';
    }

    showGameUI() {
        this.gameUI.style.display = 'block';
        document.getElementById('game-canvas').style.display = 'block';
    }

    hideGameUI() {
        this.gameUI.style.display = 'none';
    }

    handleJoinGame() {
        const name = this.playerNameInput.value.trim();
        if (!name) {
            alert("Please enter your name.");
            return;
        }
        if (name.length > 15) {
            alert("Name cannot be longer than 15 characters.");
            return;
        }
        this.mainApp.joinGame(name, this.selectedCharacter);
    }

    updateOnlinePlayers(count) {
        this.onlinePlayersMenu.textContent = count;
    }

    updateHUD(playerData) {
        if (playerData.health !== undefined) this.healthDisplay.textContent = Math.max(0, playerData.health);
        if (playerData.kills !== undefined) this.killsDisplay.textContent = playerData.kills;
        if (playerData.deaths !== undefined) this.deathsDisplay.textContent = playerData.deaths;
    }

    updateRoundTime(timeInSeconds) {
        const minutes = Math.floor(timeInSeconds / 60);
        const seconds = timeInSeconds % 60;
        this.roundTimeDisplay.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }

    addChatMessage(messageData) {
        const { senderId, senderName, text, system } = messageData;
        const messageElement = document.createElement('p');
        if (system) {
            messageElement.classList.add('system-message');
            messageElement.textContent = text;
        } else {
            const nameSpan = document.createElement('span');
            nameSpan.style.fontWeight = 'bold';
            nameSpan.textContent = `${senderName || 'Player'}: `;
            
            messageElement.appendChild(nameSpan);
            messageElement.appendChild(document.createTextNode(text));

            if (this.mainApp.player && senderId === this.mainApp.player.id) {
                messageElement.classList.add('my-message');
            } else {
                messageElement.classList.add('other-message');
            }
        }
        this.chatOutput.appendChild(messageElement);
        this.chatOutput.scrollTop = this.chatOutput.scrollHeight; // Scroll to bottom
    }

    toggleLeaderboard(show, leaderboardData = []) {
        if (show) {
            this.leaderboardList.innerHTML = ''; // Clear previous entries
            leaderboardData.forEach(player => {
                const li = document.createElement('li');
                li.textContent = `${player.name} - K: ${player.kills}, D: ${player.deaths}`;
                this.leaderboardList.appendChild(li);
            });
            this.leaderboardDisplay.style.display = 'block';
        } else {
            this.leaderboardDisplay.style.display = 'none';
        }
    }

    showRoundOver(data) {
        if (data.winner) {
            this.winnerAnnouncement.textContent = `${data.winner.name} wins the round!`;
        } else {
            this.winnerAnnouncement.textContent = "It's a draw!";
        }
        this.roundOverScreen.style.display = 'block';
        this.toggleLeaderboard(true, data.leaderboard); // Show final leaderboard
        this.crosshair.style.display = 'none';
    }

    hideRoundOver() {
        this.roundOverScreen.style.display = 'none';
        this.toggleLeaderboard(false); // Hide leaderboard on new round
        this.crosshair.style.display = 'block';
    }
    
    showDeathMessage(killerName) {
        this.killedByMessage.textContent = `Killed by ${killerName || 'the environment'}`;
        this.deathMessageScreen.style.display = 'block';
        this.crosshair.style.display = 'none';
        this.mainApp.isDead = true;
    }

    hideDeathMessage() {
        this.deathMessageScreen.style.display = 'none';
        this.crosshair.style.display = 'block';
         this.mainApp.isDead = false;
    }
}
