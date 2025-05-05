// docs/js/ui.js
// No Three.js imports should be in this file

// Cache DOM elements on load
const loadingScreen = document.getElementById('loading-screen');
const loadingProgress = document.getElementById('loading-progress');
const menuScreen = document.getElementById('menu-screen');
const playerNameInput = document.getElementById('playerName');
const playButton = document.getElementById('playButton');
const gameContainer = document.getElementById('game-container');
const hudHealth = document.getElementById('health-value');
const deathScreen = document.getElementById('death-screen');

// Check if elements exist on load to catch potential HTML issues early
if (!loadingScreen || !loadingProgress || !menuScreen || !playerNameInput || !playButton || !gameContainer || !hudHealth || !deathScreen) {
    console.error("UI Error: One or more essential UI elements not found in the DOM!");
}

export function showLoadingScreen() {
    if (loadingScreen) loadingScreen.style.display = 'flex';
    if (menuScreen) menuScreen.style.display = 'none';
    if (gameContainer) gameContainer.style.display = 'none';
    if (deathScreen) deathScreen.style.display = 'none';
    console.log("UI: Showing Loading Screen");
}

export function updateLoadingProgress(progress) {
    // Ensure progress is between 0 and 1
    const clampedProgress = Math.max(0, Math.min(1, progress));
    if (loadingProgress) {
        loadingProgress.textContent = `${Math.round(clampedProgress * 100)}%`;
    }
}

export function showMenuScreen() {
    if (loadingScreen) loadingScreen.style.display = 'none';
    if (menuScreen) menuScreen.style.display = 'flex';
    if (gameContainer) gameContainer.style.display = 'none';
    if (deathScreen) deathScreen.style.display = 'none';
    console.log("UI: Showing Menu Screen");
}

export function showGameScreen() {
    if (loadingScreen) loadingScreen.style.display = 'none';
    if (menuScreen) menuScreen.style.display = 'none';
    if (gameContainer) gameContainer.style.display = 'block'; // Use 'block' for the container
    if (deathScreen) deathScreen.style.display = 'none';
    console.log("UI: Showing Game Screen");
}

export function showDeathScreen() {
     if (deathScreen) deathScreen.style.display = 'flex';
     console.log("UI: Showing Death Screen");
}

export function hideDeathScreen() {
    if (deathScreen) deathScreen.style.display = 'none';
    console.log("UI: Hiding Death Screen");
}

export function getPlayerName() {
    if (playerNameInput) {
        return playerNameInput.value || 'ShawtyPlayer'; // Default name if empty
    }
    return 'ShawtyPlayer'; // Fallback default
}

export function updateHealth(health) {
    const displayHealth = Math.max(0, Math.round(health)); // Ensure health isn't negative
    if (hudHealth) {
        hudHealth.textContent = displayHealth;
    }
}

// Add event listener for the play button, ensuring it only gets added once
let playButtonListenerAdded = false;
export function onPlayButtonClick(callback) {
    if (playButton && !playButtonListenerAdded) {
        playButton.addEventListener('click', callback);
        playButtonListenerAdded = true;
         console.log("UI: Play button listener added.");
    } else if (!playButton) {
        console.error("UI Error: Play button not found, cannot add listener.");
    } else {
        // console.warn("UI: Play button listener already added."); // Optional warning
    }
}
