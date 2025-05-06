export class UIManager {
    constructor() {
        this.loadingScreen = document.getElementById('loadingScreen');
        this.loadingStatus = document.getElementById('loadingStatus');
        this.progressBar = document.getElementById('progressBar');

        this.homeMenu = document.getElementById('homeMenu');
        this.playerNameInput = document.getElementById('playerNameInput');
        this.charSelect = document.getElementById('charSelect');
        this.playButton = document.getElementById('playButton');
        this.playerCountSpan = document.getElementById('playerCount');

        this.gameContainer = document.getElementById('gameContainer');
        this.hud = document.getElementById('hud');
        this.healthValue = document.getElementById('healthValue');
        this.timerDisplay = document.getElementById('timerDisplay');
        this.killFeed = document.getElementById('killFeed');

        this.chatContainer = document.getElementById('chatContainer');
        this.chatOutput = document.getElementById('chatOutput');
        this.chatInput = document.getElementById('chatInput');

        this.leaderboardDisplay = document.getElementById('leaderboard');
        this.leaderboardList = document.getElementById('leaderboardList');
        
        this.crosshair = document.getElementById('crosshair');
        this.roundEndScreen = document.getElementById('roundEndScreen');
        this.roundEndLeaderboard = document.getElementById('roundEndLeaderboard');
        this.nextRoundMessage = document.getElementById('nextRoundMessage');


        this.chatInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && this.onChatSubmit) {
                this.onChatSubmit(this.chatInput.value);
                this.chatInput.value = '';
                this.hideChatInput();
            }
            e.stopPropagation(); // Prevent game controls while typing
        });
    }

    setPlayButtonCallback(callback) {
        this.playButton.onclick = () => {
            const name = this.playerNameInput.value.trim();
            const character = this.charSelect.value;
            if (name) {
                callback(name, character);
            } else {
                alert('Please enter your name.');
            }
        };
    }
    
    populateCharacterSelector(characters) { // characters is an array of names
        this.charSelect.innerHTML = ''; // Clear existing options
        characters.forEach(charName => {
            const option = document.createElement('option');
            option.value = charName;
            option.textContent = charName;
            this.charSelect.appendChild(option);
        });
    }

    updateLoadingProgress(loaded, total) {
        const percent = total > 0 ? (loaded / total) * 100 : 0;
        this.progressBar.style.width = `${percent}%`;
        this.loadingStatus.textContent = `Loading assets... (${loaded}/${total})`;
        if (loaded === total && total > 0) {
             this.loadingStatus.textContent = 'Assets loaded! Ready.';
        }
    }
    
    hideLoadingScreen() {
        this.loadingScreen.style.display = 'none';
    }

    showHomeMenu() {
        this.hideLoadingScreen();
        this.homeMenu.style.display = 'flex'; // Or block, depending on CSS
         this.gameContainer.style.display = 'none';
         this.crosshair.style.display = 'none';
    }
    
    showHomeMenuWithMessage(message) {
        this.showHomeMenu();
        const messageP = document.createElement('p');
        messageP.textContent = message;
        messageP.style.color = 'orange';
        this.homeMenu.insertBefore(messageP, this.playerNameInput); // Insert before name input
    }

    hideHomeMenu() {
        this.homeMenu.style.display = 'none';
    }

    showGameUI() {
        this.gameContainer.style.display = 'block';
        this.crosshair.style.display = 'block';
        this.hud.style.display = 'block';
        this.chatContainer.style.display = 'block';
    }

    updatePlayerCount(count) {
        this.playerCountSpan.textContent = count;
    }

    updateHealth(health) {
        this.healthValue.textContent = Math.max(0, Math.round(health));
        this.healthValue.style.color = health > 60 ? 'lightgreen' : health > 30 ? 'orange' : 'red';
    }

    updateTimer(timeRemainingMs) {
        const totalSeconds = Math.max(0, Math.floor(timeRemainingMs / 1000));
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        this.timerDisplay.textContent = `Time: ${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }
    
    addFeedMessage(message) {
        const messageElement = document.createElement('div');
        messageElement.classList.add('feed-message');
        messageElement.textContent = message;
        this.killFeed.appendChild(messageElement);
        // Auto-remove after animation (CSS handles fade out)
        setTimeout(() => {
            if (messageElement.parentNode === this.killFeed) {
                 this.killFeed.removeChild(messageElement);
            }
        }, 5000); // Match CSS animation duration
    }
    
    clearKillFeed() {
        this.killFeed.innerHTML = '';
    }

    addChatMessage(name, text, isHistory = false) {
        const messageElement = document.createElement('p');
        messageElement.innerHTML = `<strong>${name}:</strong> ${this.escapeHTML(text)}`;
        this.chatOutput.appendChild(messageElement);
        if (!isHistory) {
            this.chatOutput.scrollTop = this.chatOutput.scrollHeight; // Scroll to bottom
        }
    }
    
    addSystemMessage(text, isHistory = false) {
        const messageElement = document.createElement('p');
        messageElement.innerHTML = `<em style="color: #00ffff;">${this.escapeHTML(text)}</em>`;
        this.chatOutput.appendChild(messageElement);
         if (!isHistory) {
            this.chatOutput.scrollTop = this.chatOutput.scrollHeight;
        }
    }
    escapeHTML(str) {
        return str.replace(/[&<>"']/g, function (match) {
            return {
                '&': '&',  // Added comma
                '<': '<',   // Added comma
                '>': '>',   // Added comma
                '"': '"', // Added comma
                "'": '''
            }[match];
        });
    }

    toggleChatInput(visible, localPlayer) {
        if (visible) {
            this.chatInput.style.display = 'block';
            this.chatInput.focus();
            if (localPlayer) localPlayer.isChatting = true;
        } else {
            this.chatInput.style.display = 'none';
            this.chatInput.blur(); // Make sure it loses focus
            if (localPlayer) localPlayer.isChatting = false;
        }
    }
    hideChatInput() { // Called after submitting message
        this.chatInput.style.display = 'none';
        this.chatInput.blur();
        // Note: localPlayer.isChatting should be set by game logic that calls this
    }


    toggleLeaderboard(visible, leaderboardData = []) {
        if (visible) {
            this.leaderboardList.innerHTML = ''; // Clear previous entries
            leaderboardData.sort((a,b) => b.kills - a.kills || a.deaths - b.deaths); // Sort by kills, then deaths
            leaderboardData.forEach(player => {
                const li = document.createElement('li');
                li.textContent = `${player.name} - Kills: ${player.kills}, Deaths: ${player.deaths}`;
                this.leaderboardList.appendChild(li);
            });
            this.leaderboardDisplay.style.display = 'block';
        } else {
            this.leaderboardDisplay.style.display = 'none';
        }
    }
    
    isLeaderboardVisible() {
        return this.leaderboardDisplay.style.display === 'block';
    }
    
    updateLeaderboard(leaderboardData) { // Called when leaderboard is already visible
        if (this.isLeaderboardVisible()) {
            this.toggleLeaderboard(true, leaderboardData);
        }
    }

    showRoundEndScreen(leaderboard) {
        this.roundEndLeaderboard.innerHTML = '';
        leaderboard.forEach(player => {
            const li = document.createElement('li');
            li.textContent = `${player.name} - Kills: ${player.kills}, Deaths: ${player.deaths}`;
            if (leaderboard.indexOf(player) === 0) { // Highlight winner
                li.style.fontWeight = 'bold';
                li.style.color = '#00ffff';
            }
            this.roundEndLeaderboard.appendChild(li);
        });
        this.nextRoundMessage.textContent = "Next round starting soon..."; // Or map voting message
        this.roundEndScreen.style.display = 'block';
        this.crosshair.style.display = 'none'; // Hide crosshair
    }

    hideRoundEndScreen() {
        this.roundEndScreen.style.display = 'none';
         if (this.gameContainer.style.display === 'block') { // Only show crosshair if game is active
            this.crosshair.style.display = 'block';
        }
    }
}
