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
            this.playerNameInput.value = playerName;
            const selectedCharacter = this.characterSelect.value;
            this.showGame();
            if (onPlayCallback) onPlayCallback(playerName, selectedCharacter);
        });

        document.addEventListener('keydown', (event) => {
            if (!this.gameActive && !this.isChatting) return; // Allow chat on home screen if T is pressed

            if (event.key.toLowerCase() === 't' && !this.isChatting) {
                event.preventDefault();
                this.chatInput.style.display = 'block';
                this.chatInput.focus();
                this.isChatting = true;
                if (window.game && window.game.controls && window.game.controls.isLocked) {
                    window.game.controls.unlock();
                }
            } else if (event.key === 'Escape') {
                if (this.isChatting) {
                    event.preventDefault();
                    this.chatInput.value = ''; // Clear chat input on Esc
                    this.chatInput.style.display = 'none';
                    this.chatInput.blur();
                    this.isChatting = false;
                    if (window.game && window.game.controls && this.gameActive && !this.isLeaderboardVisible && !window.game.controls.isLocked) {
                         window.game.controls.lock(); // Re-lock if game is active and not showing leaderboard
                    }
                } else if (this.isLeaderboardVisible) {
                    event.preventDefault();
                    this.hideLeaderboard();
                }
                // PointerLockControls handles Esc to unlock itself if game canvas has focus and is locked.
            } else if (event.key === 'Enter' && this.isChatting) {
                event.preventDefault();
                const message = this.chatInput.value.trim();
                if (message && onChatMessageSend) {
                    onChatMessageSend(message);
                }
                this.chatInput.value = '';
                this.chatInput.style.display = 'none'; // Hide after sending
                this.isChatting = false;
                if (window.game && window.game.controls && this.gameActive && !this.isLeaderboardVisible && !window.game.controls.isLocked) {
                    window.game.controls.lock(); // Re-lock if game is active
                }
            }

            if (event.key.toLowerCase() === 'l' && !this.isChatting && this.gameActive) { // Leaderboard only in game
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
        if (status.toLowerCase().includes("ready to play") || status.toLowerCase().includes("connected")) {
            setTimeout(() => {
                if (this.loadingScreen) this.loadingScreen.style.display = 'none';
                if (this.homeMenu) this.homeMenu.style.display = 'flex';
            }, 500); // Shorter delay
        }
    },

    showGame: function() {
        if (this.homeMenu) this.homeMenu.style.display = 'none';
        if (this.gameContainer) this.gameContainer.style.display = 'block';
        this.gameActive = true;
        // Game.js will handle initial lock on canvas click or if desired.
        // Forcing lock here can sometimes interfere with focus.
        // If you want to auto-lock:
        // setTimeout(() => {
        //     if (window.game && window.game.controls && !window.game.controls.isLocked) {
        //         window.game.controls.lock();
        //     }
        // }, 100);
    },

    updatePlayersOnline: function(count) {
        if (this.playersOnlineDisplay) this.playersOnlineDisplay.textContent = count;
    },

    addChatMessage: function(sender, message) {
        if (!this.chatMessages) return;
        const li = document.createElement('li');
        const senderSpan = document.createElement('span');
        senderSpan.className = 'chat-sender';
        senderSpan.textContent = `${sender}: `;
        li.appendChild(senderSpan);
        li.appendChild(document.createTextNode(message));
        this.chatMessages.appendChild(li);
        this.chatMessages.scrollTop = this.chatMessages.scrollHeight; // Auto-scroll
    },

    addKillFeedEntry: function(killerName, victimName, method) {
        if (!this.killFeed) return;
        const entry = document.createElement('div');
        entry.className = 'kill-entry';

        const killerSpanHtml = `<span class="killer-name">${killerName || "World"}</span>`;
        const victimSpanHtml = `<span class="victim-name">${victimName}</span>`;

        let textMethod = (method && method !== "Fell" && method !== "Misadventure" && method !== "Gun") ? ` (${method})` : "";
        if (method === "Gun" && killerName) {
            textMethod = ""; // Gun is implied if there's a killer
        }


        if (method === "Fell") {
             entry.innerHTML = `${victimSpanHtml} fell out of the world.`;
        } else if (!killerName || killerName === victimName || killerName === "World" || killerName === "Misadventure") {
             entry.innerHTML = `${victimSpanHtml} was eliminated.`; // Generic for self-elim or world
        }
        else {
             entry.innerHTML = `${killerSpanHtml} eliminated ${victimSpanHtml}${textMethod}`;
        }

        this.killFeed.insertBefore(entry, this.killFeed.firstChild);
        if (this.killFeed.children.length > 5) {
            this.killFeed.removeChild(this.killFeed.lastChild);
        }
        setTimeout(() => {
            if (entry.parentNode === this.killFeed) {
                 entry.style.opacity = '0';
                 setTimeout(() => { if (entry.parentNode === this.killFeed) this.killFeed.removeChild(entry); }, 500);
            }
        }, 7000);
    },

    updateGameStats: function(timeLeftMs, kills, deaths) {
        if (this.timeLeftDisplay) {
            const minutes = Math.floor(timeLeftMs / 60000);
            const seconds = Math.floor((timeLeftMs % 60000) / 1000);
            this.timeLeftDisplay.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
        }
        if (this.killCountDisplay) this.killCountDisplay.textContent = kills;
        if (this.deathCountDisplay) this.deathCountDisplay.textContent = deaths;
    },

    showLeaderboard: function(scoresData = null) {
        if (!this.leaderboardDisplay || !this.leaderboardList) return;
        if (scoresData && (window.game && window.game.players || scoresData)) { // Use scoresData if game.players not ready
            const currentScores = scoresData || window.game.players;
            const sortedPlayers = Object.values(currentScores).sort((a, b) => {
                if (b.kills !== a.kills) return b.kills - a.kills;
                return a.deaths - b.deaths;
            });

            this.leaderboardList.innerHTML = '';
            sortedPlayers.forEach((player, index) => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td class="rank">${index + 1}</td>
                    <td class="name">${player.name || 'Joining...'}</td>
                    <td class="kills">${player.kills !== undefined ? player.kills : '-'}</td>
                    <td class="deaths">${player.deaths !== undefined ? player.deaths : '-'}</td>
                `;
                this.leaderboardList.appendChild(tr);
            });
        }
        this.leaderboardDisplay.style.display = 'block';
        this.isLeaderboardVisible = true;
        if (window.game && window.game.controls && window.game.controls.isLocked) {
            window.game.controls.unlock();
        }
    },
    hideLeaderboard: function() {
        if (!this.leaderboardDisplay) return;
        this.leaderboardDisplay.style.display = 'none';
        this.isLeaderboardVisible = false;
        if (window.game && window.game.controls && !window.game.controls.isLocked && !this.isChatting && this.gameActive) {
             window.game.controls.lock();
        }
    },

    displayCenterEvent: function(message, duration = 5000) {
        if (!this.eventLogCenter) return;
        this.eventLogCenter.textContent = message;
        this.eventLogCenter.style.animation = 'none'; 
        this.eventLogCenter.offsetHeight; 
        this.eventLogCenter.style.animation = `fadeInOut ${duration / 1000}s ease-in-out forwards`;
        this.eventLogCenter.style.display = 'block';

        if (duration > 0) { // Only hide if duration is not infinite (0)
            setTimeout(() => {
                if (this.eventLogCenter && this.eventLogCenter.textContent === message) { 
                    this.eventLogCenter.style.display = 'none';
                }
            }, duration);
        }
    },
    
    resetUIForNewRound: function() {
        if (this.killFeed) this.killFeed.innerHTML = '';
        this.displayCenterEvent("Round Starting!", 3000);
    }
};

window.ui = ui; // Make ui object globally accessible
