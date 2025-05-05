// docs/js/ui.js

const loadingScreen = document.getElementById('loading-screen');
const loadingProgress = document.getElementById('loading-progress');
const menuScreen = document.getElementById('menu-screen');
const playerNameInput = document.getElementById('playerName');
const playButton = document.getElementById('playButton');
const gameContainer = document.getElementById('game-container');
const hudHealth = document.getElementById('health-value');
const deathScreen = document.getElementById('death-screen');


export function showLoadingScreen() {
    loadingScreen.style.display = 'flex';
    menuScreen.style.display = 'none';
    gameContainer.style.display = 'none';
    deathScreen.style.display = 'none';
}

export function updateLoadingProgress(progress) {
    loadingProgress.textContent = `${Math.round(progress * 100)}%`;
}

export function showMenuScreen() {
    loadingScreen.style.display = 'none';
    menuScreen.style.display = 'flex';
    gameContainer.style.display = 'none';
    deathScreen.style.display = 'none';
}

export function showGameScreen() {
    loadingScreen.style.display = 'none';
    menuScreen.style.display = 'none';
    gameContainer.style.display = 'block'; // Use block for game container
    deathScreen.style.display = 'none';
}

export function showDeathScreen() {
     deathScreen.style.display = 'flex';
}

export function hideDeathScreen() {
    deathScreen.style.display = 'none';
}

export function getPlayerName() {
    return playerNameInput.value || 'ShawtyPlayer';
}

export function updateHealth(health) {
    hudHealth.textContent = Math.max(0, Math.round(health)); // Ensure health isn't negative
}

// Add event listener for the play button
export function onPlayButtonClick(callback) {
    playButton.addEventListener('click', callback);
}
