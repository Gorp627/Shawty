// docs/js/ui.js
const ui = {
    loadingScreen: document.getElementById('loading-screen'),
    loadingStatus: document.getElementById('loading-status'),
    homeMenu: document.getElementById('home-menu'),
    playerNameInput: document.getElementById('playerNameInput'),
    characterSelect: document.getElementById('characterSelect'),
    playersOnlineDisplay: document.getElementById('playersOnline'),
    playButton: document.getElementById('playButton'),
    gameContainer: document.getElementById('game-container'),
    chatMessages: document.getElementById('chat-messages'),
    chatInput: document.getElementById('chat-input'),
    timeLeftDisplay: document.getElementById('timeLeft'),
    killCountDisplay: document.getElementById('killCount'),
    deathCountDisplay: document.getElementById('deathCount'),
    leaderboardDisplay: document.getElementById('leaderboard'),
    leaderboardList: document.getElementById('leaderboard-list'),
    killFeed: document.getElementById('kill-feed'),
    eventLogCenter: document.getElementById('event-log-center'),

    isChatting: false,
    isLeaderboardVisible: false,
    gameActive: false,

    init: function(onPlayCallback, onChatMessageSend) {
        this.playButton.addEventListener('click', () => {
            const playerName = this.playerNameInput.value.trim() || 'Guest' + Math.floor(Math.random() * 1000);
            this.playerNameInput.value = playerName; // Update input field in case it was guest
            const selectedCharacter = this.characterSelect.value;
            this.showGame();
            if (onPlayCallback) onPlayCallback(playerName, selectedCharacter);
        });

        document.addEventListener('keydown', (event) => {
            if (!this.gameActive) return;

            if (event.key.toLowerCase() === 't' && !this.isChatting) {
                event.preventDefault();
                this.chatInput.style.display = 'block';
                this.chatInput.focus();
                this.isChatting = true;
                if (window.game && window.game.controls) window.game.controls.unlock();
            } else if (event.key === 'Escape') {
                if (this.isChatting) {
                    this.chatInput.style.display = 'none';
                    this.chatInput.blur();
                    this.isChatting = false;
                    if (window.game && window.game.controls) window.game.controls.lock();
                } else if (this.isLeaderboardVisible) {
                    this.hideLeaderboard();
                } else if (window.game && window.game.controls && document.pointerLockElement) {
                    // Allow Esc to unlock pointer if not chatting or viewing leaderboard
                    // window.game.controls.unlock(); // This might be too aggressive, handled by PointerLockControls
                }
            } else if (event.key === 'Enter' && this.isChatting) {
                event.preventDefault();
                const message = this.chatInput.value.trim();
                if (message && onChatMessageSend) {
                    onChatMessageSend(message);
                }
                this.chatInput.value = '';
                this.chatInput.style.display = 'none';
                this.isChatting = false;
                if (window.game && window.game.controls) window.game.controls.lock();
            }

            if (event.key.toLowerCase() === 'l' && !this.isChatting) {
                event.preventDefault();
                if (this.isLeaderboardVisible) {
                    this.hideLeaderboard();
                } else {
                    this.showLeaderboard();
                }
            }
        });
    },

    updateLoadingProgress: function(status, percentage = -1) {
        this.loadingStatus.textContent = status;
        // If you had a progress bar:
        // const loadingBar = document.getElementById('loading-bar-actual');
        // if (percentage >= 0 && loadingBar) loadingBar.style.width = percentage + '%';

        if (status.toLowerCase().includes("ready to play") || status.toLowerCase().includes("connected")) {
            setTimeout(() => {
                this.loadingScreen.style.display = 'none';
                this.homeMenu.style.display = 'flex';
            }, 1000); // "Satisfying" delay
        }
    },

    showGame: function() {
        this.homeMenu.style.display = 'none';
        this.gameContainer.style.display = 'block';
        this.gameActive = true;
        if (window.game && window.game.controls) {
            window.game.controls.lock();
        }
    },

    updatePlayersOnline: function(count) {
        this.playersOnlineDisplay.textContent = count;
    },

    addChatMessage: function(sender, message) {
        const li = document.createElement('li');
        const senderSpan = document.createElement('span');
        senderSpan.className = 'chat-sender';
        senderSpan.textContent = `${sender}: `;
        li.appendChild(senderSpan);
        li.appendChild(document.createTextNode(message));
        this.chatMessages.appendChild(li);
        this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
    },

    addKillFeedEntry: function(killerName, victimName, method) {
        const entry = document.createElement('div');
        entry.className = 'kill-entry';

        const killerSpan = document.createElement('span');
        killerSpan.className = 'killer-name';
        killerSpan.textContent = killerName || "World";

        const victimSpan = document.createElement('span');
        victimSpan.className = 'victim-name';
        victimSpan.textContent = victimName;

        let textMethod = (method && method !== "Fell" && method !== "Misadventure") ? ` (${method})` : "";
        if (method === "Fell") {
             entry.innerHTML = `${victimSpan.outerHTML} fell out of the world.`;
        } else {
             entry.innerHTML = `${killerSpan.outerHTML} eliminated ${victimSpan.outerHTML}${textMethod}`;
        }


        this.killFeed.insertBefore(entry, this.killFeed.firstChild);
        if (this.killFeed.children.length > 5) { // Max 5 entries
            this.killFeed.removeChild(this.killFeed.lastChild);
        }
        setTimeout(() => { // Auto-remove after some time
            if (entry.parentNode === this.killFeed) {
                 entry.style.opacity = '0';
                 setTimeout(() => { if (entry.parentNode === this.killFeed) this.killFeed.removeChild(entry); }, 500);
            }
        }, 7000);
    },

    updateGameStats: function(timeLeftMs, kills, deaths) {
        const minutes = Math.floor(timeLeftMs / 60000);
        const seconds = Math.floor((timeLeftMs % 60000) / 1000);
        this.timeLeftDisplay.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
        this.killCountDisplay.textContent = kills;
        this.deathCountDisplay.textContent = deaths;
    },

    showLeaderboard: function(scoresData = null) { // scoresData is the players object from server
        if (scoresData && window.game && window.game.players) { // Update with fresh data if provided
            const sortedPlayers = Object.values(scoresData).sort((a, b) => {
                if (b.kills !== a.kills) return b.kills - a.kills;
                return a.deaths - b.deaths;
            });

            this.leaderboardList.innerHTML = ''; // Clear old scores
            sortedPlayers.forEach((player, index) => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td class="rank">${index + 1}</td>
                    <td class="name">${player.name}</td>
                    <td class="kills">${player.kills}</td>
                    <td class="deaths">${player.deaths}</td>
                `;
                this.leaderboardList.appendChild(tr);
            });
        }
        this.leaderboardDisplay.style.display = 'block';
        this.isLeaderboardVisible = true;
        if (window.game && window.game.controls) window.game.controls.unlock(); // Unlock mouse when leaderboard is up
    },
    hideLeaderboard: function() {
        this.leaderboardDisplay.style.display = 'none';
        this.isLeaderboardVisible = false;
        if (window.game && window.game.controls && !this.isChatting) window.game.controls.lock(); // Re-lock if not chatting
    },

    displayCenterEvent: function(message, duration = 5000) {
        this.eventLogCenter.textContent = message;
        this.eventLogCenter.style.animation = 'none'; // Reset animation
        this.eventLogCenter.offsetHeight; /* trigger reflow */
        this.eventLogCenter.style.animation = `fadeInOut ${duration / 1000}s ease-in-out forwards`;
        this.eventLogCenter.style.display = 'block';

        // Ensure it hides after animation
        setTimeout(() => {
             if (this.eventLogCenter.textContent === message) { // Check if it's still the same message
                this.eventLogCenter.style.display = 'none';
             }
        }, duration);
    },
    
    resetUIForNewRound: function() {
        this.killFeed.innerHTML = ''; // Clear kill feed
        // Kills/deaths will be updated by game state
        this.displayCenterEvent("Round Starting!", 3000);
    }
};
