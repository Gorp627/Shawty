// docs/player.js

function addPlayer(playerData) {
    console.log(`Add player ${playerData.id} (${playerData.name})`); if(players[playerData.id]||playerData.id===localPlayerId)return;
    players[playerData.id]={...playerData,mesh:null,targetPosition:null,targetRotationY:null};
    if(playerModel&&playerModel!=='error'){
        try{
            const modelInstance=playerModel.clone();
            // <<<=== PLAYER SCALE SET TO 0.3 ===>>>
            const desiredScale=0.3; // Set requested scale
            modelInstance.scale.set(desiredScale,desiredScale,desiredScale);
            console.log(`Scaled PLAYER model instance ${playerData.id} to ${desiredScale}`);
            // <<<----------------------------- >>>
            modelInstance.traverse(function(c){if(c.isMesh)c.castShadow=true;});
            const visualY=playerData.y; // Assume model origin at feet
            modelInstance.position.set(playerData.x,visualY,playerData.z);
            modelInstance.rotation.y=playerData.rotationY;
            scene.add(modelInstance);
            players[playerData.id].mesh=modelInstance;
            players[playerData.id].targetPosition=modelInstance.position.clone();
            players[playerData.id].targetRotationY=modelInstance.rotation.y; // Use instance rotation
        } catch(e){
            console.error(`Model error ${playerData.id}:`,e);addPlayerFallbackMesh(playerData);
        }
    } else{
        addPlayerFallbackMesh(playerData);
    }
}
function addPlayerFallbackMesh(playerData) { /* ... Same ... */ }
function removePlayerMesh(playerId) { /* ... Same ... */ }
function updateRemotePlayerPosition(playerData) { /* ... Same ... */ }
function updateOtherPlayers(deltaTime) { /* ... Same ... */ }

console.log("player.js loaded");
