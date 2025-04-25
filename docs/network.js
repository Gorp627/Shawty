// docs/network.js

// ... (setupSocketIO, handleInitialize, attemptJoinGame, sendJoinDetails are the same) ...

// Define handlers called by socket event listeners
function handlePlayerJoined(pD) { /* ... Same ... */ }
function handlePlayerLeft(pId) { /* ... Same ... */ }

function handleHealthUpdate(data) { // ADDED LOG
    console.log(`>>> NET: Received 'healthUpdate' for ${data.id}: ${data.health}`);
    if(players[data.id]){
        players[data.id].health=data.health;
        if(data.id===localPlayerId){
            if(typeof updateHealthBar === 'function') updateHealthBar(data.health); else console.error("updateHealthBar missing!");
        }
    } else {
        console.warn(`Health update for unknown player ${data.id}`);
    }
}

function handlePlayerDied(data) { // ADDED LOG
    console.log(`>>> NET: Received 'playerDied' for ${data.targetId}`, data);
    if(players[data.targetId]){
        players[data.targetId].health=0;
        if(players[data.targetId].mesh) players[data.targetId].mesh.visible=false;
    } else {
        console.warn(`Died event for unknown player ${data.targetId}`);
    }
    if(data.targetId===localPlayerId){
        if(typeof updateHealthBar === 'function') updateHealthBar(0);
        const kN=data.killerName||'environment';const kP=data.killerPhrase||'...';
        let msg=`You just got ${kP} by ${kN}.`; if(!data.killerId)msg=`You died.`;
        if(typeof showKillMessage === 'function') showKillMessage(msg); else console.error("showKillMessage missing!");
        if(infoDiv) infoDiv.textContent=`YOU DIED`;
    }
}

function handlePlayerRespawned(pD) { /* ... Same ... */ }


console.log("network.js loaded");
