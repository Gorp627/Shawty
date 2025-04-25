// docs/ui.js

// UI Element variables are declared in config.js and assigned in core.js->init()
// let loadingScreen, homeScreen, gameUI, playerCountSpan, playerNameInput, playerPhraseInput, joinButton, homeScreenError, infoDiv, healthBarFill, healthText, killMessageDiv;

// --- UI State Management ---
function setGameState(newState, options = {}) {
    // console.log(`Set state: ${newState}`); // Reduce noise
    const previousState = gameState;
    // Assuming elements are already grabbed and assigned globally by init()
    if (!loadingScreen || !homeScreen || !gameUI ) {
        console.error("Cannot set game state - UI elements not ready!");
        return;
    }
    const canvas = document.getElementById('gameCanvas'); // May need this one too

    if (gameState === newState && !(newState === 'loading' && options.error)) return;
    gameState = newState;

    // Hide all sections first
    if(loadingScreen) { loadingScreen.style.display = 'none'; loadingScreen.classList.remove('assets','error'); const p=loadingScreen.querySelector('p'); if(p)p.style.color='';}
    if(homeScreen) { homeScreen.style.display = 'none'; homeScreen.classList.remove('visible'); }
    if(gameUI) { gameUI.style.display = 'none'; gameUI.classList.remove('visible'); }
    if(canvas) canvas.style.display = 'none';

    // Show target state
    switch(newState){
        case'loading':if(loadingScreen){loadingScreen.style.display='flex';const p=loadingScreen.querySelector('p');if(p)p.innerHTML=options.message||'Loading...';if(options.assets)loadingScreen.classList.add('assets');if(options.error&&p){p.style.color='#e74c3c';loadingScreen.classList.add('error');}}break;
        case'homescreen':if(homeScreen){homeScreen.style.display='flex';requestAnimationFrame(()=>{homeScreen.classList.add('visible');});if(playerCountSpan)playerCountSpan.textContent=options.playerCount??playerCountSpan.textContent??'?';if(controls?.isLocked)controls.unlock();const obj=scene?.getObjectByName("PlayerControls");if(obj)scene.remove(obj);if(typeof removeGunViewModel==='function')removeGunViewModel();if(joinButton){joinButton.disabled=false;joinButton.textContent="Join Game";}}break;
        case'joining':if(joinButton){joinButton.disabled=true;joinButton.textContent="Joining...";}if(options.waitingForAssets)setGameState('loading',{message:"Loading Assets...",assets:true});break;
        case'playing':const cElem=document.getElementById('gameCanvas');if(gameUI){gameUI.style.display='block';requestAnimationFrame(()=>{gameUI.classList.add('visible');});}else console.error("! gameUI");if(cElem){cElem.style.display='block';}else console.error("! gameCanvas");if(scene&&controls){if(!scene.getObjectByName("PlayerControls")){controls.getObject().name="PlayerControls";scene.add(controls.getObject());}if(typeof attachGunViewModel==='function')attachGunViewModel();setTimeout(function(){if(gameState==='playing'&&!controls.isLocked)controls.lock();},100);}else console.error("! Scene/Controls missing!");if(typeof onWindowResize === 'function') onWindowResize(); break;
    }
    // console.log(`Switched state from ${previousState} to ${gameState}`); // Reduce noise
}

// --- Other UI Updates ---
function updateHealthBar(health) { const hp=Math.max(0,Math.min(100,health)); if(healthBarFill&&healthText){const fW=`${hp}%`; const bP=`${100-hp}% 0%`; healthBarFill.style.width=fW; healthBarFill.style.backgroundPosition=bP; healthText.textContent=`${Math.round(hp)}%`;}}
function showKillMessage(message) { if(killMessageTimeout)clearTimeout(killMessageTimeout);if(killMessageDiv){killMessageDiv.textContent=message;killMessageDiv.classList.add('visible');killMessageTimeout=setTimeout(function(){killMessageDiv.classList.remove('visible');},KILL_MESSAGE_DURATION);}}

console.log("ui.js loaded");
