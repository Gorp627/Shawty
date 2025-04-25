// docs/ui.js

// Get UI Element references (might be better in init, but ok here for now if careful about DOMContentLoaded)
// Ensure these run AFTER the DOM is ready, handled by placing script tags correctly or using DOMContentLoaded in core.js
function getUIElements() {
    loadingScreen = loadingScreen || document.getElementById('loadingScreen');
    homeScreen = homeScreen || document.getElementById('homeScreen');
    gameUI = gameUI || document.getElementById('gameUI');
    playerCountSpan = playerCountSpan || document.getElementById('playerCount');
    playerNameInput = playerNameInput || document.getElementById('playerNameInput');
    playerPhraseInput = playerPhraseInput || document.getElementById('playerPhraseInput');
    joinButton = joinButton || document.getElementById('joinButton');
    homeScreenError = homeScreenError || document.getElementById('homeScreenError');
    infoDiv = infoDiv || document.getElementById('info');
    healthBarFill = healthBarFill || document.getElementById('healthBarFill');
    healthText = healthText || document.getElementById('healthText');
    killMessageDiv = killMessageDiv || document.getElementById('killMessage');
     // Add null checks after getting elements in init is safer
}


// --- UI State Management ---
function setGameState(newState, options = {}) {
    console.log(`Set state: ${newState}`);
    const previousState = gameState;
    if (gameState === newState && !(newState === 'loading' && options.error)) return;
    gameState = newState;

    // Ensure elements are grabbed before use
    getUIElements(); // Make sure refs exist
    const canvas = document.getElementById('gameCanvas');

    if(loadingScreen){loadingScreen.style.display='none'; loadingScreen.classList.remove('assets','error');const p=loadingScreen.querySelector('p');if(p)p.style.color='';}
    if(homeScreen){homeScreen.style.display='none';homeScreen.classList.remove('visible');}
    if(gameUI){gameUI.style.display='none';gameUI.classList.remove('visible');}
    if(canvas)canvas.style.display='none';

    switch(newState){
        case'loading':if(loadingScreen){loadingScreen.style.display='flex';const p=loadingScreen.querySelector('p');if(p)p.innerHTML=options.message||'Loading...';if(options.assets)loadingScreen.classList.add('assets');if(options.error&&p){p.style.color='#e74c3c';loadingScreen.classList.add('error');}}break;
        case'homescreen':if(homeScreen){homeScreen.style.display='flex';homeScreen.classList.add('visible');if(playerCountSpan)playerCountSpan.textContent=options.playerCount??playerCountSpan.textContent??'?';if(controls?.isLocked)controls.unlock();const obj=scene?.getObjectByName("PlayerControls");if(obj)scene.remove(obj);if(joinButton){joinButton.disabled=false;joinButton.textContent="Join Game";}}break;
        case'joining':if(joinButton){joinButton.disabled=true;joinButton.textContent="Joining...";}if(options.waitingForAssets)setGameState('loading',{message:"Loading Assets...",assets:true});break;
        case'playing':const cElem=document.getElementById('gameCanvas');if(gameUI){gameUI.style.display='block';gameUI.classList.add('visible');}else console.error("! gameUI");if(cElem){cElem.style.display='block';}else console.error("! gameCanvas");if(scene&&controls){if(!scene.getObjectByName("PlayerControls")){controls.getObject().name="PlayerControls";scene.add(controls.getObject());}setTimeout(function(){if(gameState==='playing'&&!controls.isLocked)controls.lock();},100);}else console.error("! Scene/Controls missing!");if(typeof onWindowResize === 'function') onWindowResize(); break; // Call resize
    }
     console.log(`Switched state from ${previousState} to ${gameState}`);
}

// --- Other UI Updates ---
function updateHealthBar(health) { const hp=Math.max(0,Math.min(100,health)); if(healthBarFill&&healthText){const fW=`${hp}%`; const bP=`${100-hp}% 0%`; healthBarFill.style.width=fW; healthBarFill.style.backgroundPosition=bP; healthText.textContent=`${Math.round(hp)}%`;}}
function showKillMessage(message) { if(killMessageTimeout)clearTimeout(killMessageTimeout);if(killMessageDiv){killMessageDiv.textContent=message;killMessageDiv.classList.add('visible');killMessageTimeout=setTimeout(function(){killMessageDiv.classList.remove('visible');},KILL_MESSAGE_DURATION);}}

console.log("ui.js loaded");
