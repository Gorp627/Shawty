// docs/ui.js

// Get UI Element references
function getUIElements() { /* ... Same ... */ }

// --- UI State Management ---
function setGameState(newState, options = {}) {
    console.log(`Setting game state to: ${newState}`); const previousState = gameState;
    loadingScreen=loadingScreen||document.getElementById('loadingScreen'); homeScreen=homeScreen||document.getElementById('homeScreen'); gameUI=gameUI||document.getElementById('gameUI'); const canvas=document.getElementById('gameCanvas');
    if(gameState===newState && !(newState==='loading'&&options.error)) return; gameState = newState;
    playerCountSpan=playerCountSpan||document.getElementById('playerCount'); joinButton=joinButton||document.getElementById('joinButton');
    if(loadingScreen){loadingScreen.style.display='none'; loadingScreen.classList.remove('assets','error');const p=loadingScreen.querySelector('p');if(p)p.style.color='';}
    if(homeScreen){homeScreen.style.display='none';homeScreen.classList.remove('visible');}
    if(gameUI){gameUI.style.display='none';gameUI.classList.remove('visible');}
    if(canvas)canvas.style.display='none';
    switch(newState){
        case'loading':if(loadingScreen){/* ... same ... */}break;
        case'homescreen':if(homeScreen){/* ... same ... */}break;
        case'joining':if(joinButton){/* ... same ... */}if(options.waitingForAssets)setGameState('loading',{message:"Loading Assets...",assets:true});break;
        case'playing':
            const cElem=document.getElementById('gameCanvas');
            if(gameUI){gameUI.style.display='block';requestAnimationFrame(()=>{gameUI.classList.add('visible');});}else console.error("! gameUI");
            if(cElem){cElem.style.display='block';}else console.error("! gameCanvas");
            if(scene&&controls){
                if(!scene.getObjectByName("PlayerControls")){controls.getObject().name="PlayerControls";scene.add(controls.getObject());}
                if(typeof attachGunViewModel === 'function') attachGunViewModel(); else console.error("attachGunViewModel missing!");
                console.log(">>> Position Check - Cam:",camera?.position.toArray(),"Ctrl:",controls?.getObject()?.position.toArray());
                console.log(">>> Switched to playing state. User must click canvas to lock pointer.");
                // --- REMOVED AUTOMATIC LOCK ---
                // setTimeout(function(){if(gameState==='playing'&&!controls.isLocked)controls.lock();},100);
                // ------------------------------
            } else { console.error("! Scene/Controls missing!"); }
            onWindowResize();
            break;
    } console.log(`Switched state from ${previousState} to ${gameState}`);
}

// --- Other UI Updates ---
function updateHealthBar(health) { /* ... Same ... */ }
function showKillMessage(message) { /* ... Same ... */ }

console.log("ui.js loaded");
