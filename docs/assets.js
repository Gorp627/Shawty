// docs/assets.js

function loadSound() { /* ... Same ... */ }
function loadPlayerModel() { /* ... Same ... */ }
function loadGunModel() { /* ... Same ... */ }
function loadMap(mapPath) { /* ... Same ... */ }

function checkAssetsReady() { // Checks all three assets again
    console.log(`CheckR: Map=${mapLoadState}, PModel=${playerModelLoadState}, GModel=${gunModelLoadState}`);
    const mapR=mapLoadState==='loaded'||mapLoadState==='error';
    const pModelR=playerModelLoadState==='loaded'||playerModelLoadState==='error'; // <<< Re-check Player Model
    const gModelR=gunModelLoadState==='loaded'||gunModelLoadState==='error';
    if(mapR && pModelR && gModelR){ // <<< Wait for ALL THREE again
        if(mapLoadState==='error'||playerModelLoadState==='error'||gunModelLoadState==='error'){ // Fail if any fail
            assetsReady=false; console.error("Asset load failed.");
            // Use global setGameState if available
            if(typeof setGameState === 'function') setGameState('loading',{message:"FATAL: Asset Error!<br/>Check Console.",error:true});
        } else {
            assetsReady=true; console.log("Assets OK (Map+PModel+GModel)."); // Updated log
            // Trigger next state if appropriate
             if(socket?.connected && gameState==='loading'){ if(typeof setGameState === 'function') setGameState('homescreen',{playerCount:playerCountSpan?.textContent??'?'}); }
             else if(gameState==='joining'){ if(typeof sendJoinDetails === 'function') sendJoinDetails(); else console.error("sendJoinDetails missing!");}
        }
    } else { assetsReady=false; } // Still waiting
}

console.log("assets.js loaded");
