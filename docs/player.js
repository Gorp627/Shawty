// docs/player.js

// Needs access to globals: players, playerModel, PLAYER_RADIUS, PLAYER_HEIGHT, scene, localPlayerId

function addPlayer(playerData) {
    // console.log(`Add player ${playerData.id} (${playerData.name})`); // Reduce noise
    if(players[playerData.id]||playerData.id===localPlayerId)return;
    players[playerData.id]={...playerData,mesh:null,targetPosition:null,targetRotationY:null};
    if(playerModel&&playerModel!=='error'){
        try{ // Ensure try has catch
            const modelInstance=playerModel.clone();
            // <<<=== PLAYER SCALE SET TO 0.3 ===>>>
            const desiredScale=0.3; // Explicitly set requested scale
            modelInstance.scale.set(desiredScale,desiredScale,desiredScale);
            // console.log(`Scaled PLAYER model ${playerData.id} to ${desiredScale}`); // Reduce noise
            // <<<----------------------------- >>>
            modelInstance.traverse(function(c){if(c.isMesh)c.castShadow=true;});
            const visualY=playerData.y; // Assume model origin is at feet for loaded models
            modelInstance.position.set(playerData.x,visualY,playerData.z);
            modelInstance.rotation.y=playerData.rotationY;
            scene.add(modelInstance); // Add model to the main scene
            players[playerData.id].mesh=modelInstance; // Store reference
            players[playerData.id].targetPosition=modelInstance.position.clone(); // Set initial interpolation target
            players[playerData.id].targetRotationY=modelInstance.rotation.y;
        } catch(e){
            console.error(`Model error during addPlayer for ${playerData.id}:`,e);
            addPlayerFallbackMesh(playerData); // Use fallback if cloning/adding fails
        }
    } else{
        console.warn(`Player model template not ready or failed for ${playerData.id}, using fallback.`);
        addPlayerFallbackMesh(playerData); // Use fallback if template isn't ready
    }
}

function addPlayerFallbackMesh(playerData) {
    // Prevent adding if already exists or is local player (redundant check maybe)
    if(!players[playerData.id]||players[playerData.id].mesh||playerData.id===localPlayerId)return;
    console.warn(`Using fallback CYLINDER mesh for player ${playerData.id}`);
    try{ // Ensure try has catch
        const geo=new THREE.CylinderGeometry(PLAYER_RADIUS,PLAYER_RADIUS,PLAYER_HEIGHT,8); // Simple cylinder
        const mat=new THREE.MeshStandardMaterial({color:0xff00ff}); // Bright Magenta fallback color
        const mesh=new THREE.Mesh(geo,mat);
        mesh.castShadow=true;
        const visualY=playerData.y+(PLAYER_HEIGHT/2); // Cylinder origin is center, so offset Y
        mesh.position.set(playerData.x,visualY,playerData.z);
        mesh.rotation.y=playerData.rotationY;
        scene.add(mesh); // Add cylinder to scene
        players[playerData.id].mesh=mesh; // Store reference
        players[playerData.id].targetPosition=mesh.position.clone(); // Set interpolation target
        players[playerData.id].targetRotationY=mesh.rotation.y;
    } catch(e){
        console.error(`Fallback mesh creation error for ${playerData.id}:`,e);
        // If fallback fails, player might be invisible
    }
}

function removePlayerMesh(playerId) {
     // Check if player and mesh exist
     if(players[playerId]?.mesh){
        try{ // Ensure try has catch
            scene.remove(players[playerId].mesh); // Remove from scene
            // Dispose of resources to prevent memory leaks
            if(players[playerId].mesh.geometry) players[playerId].mesh.geometry.dispose();
            if(players[playerId].mesh.material){
                // Handle multi-material objects
                if(Array.isArray(players[playerId].mesh.material)){
                    players[playerId].mesh.material.forEach(function(m){m.dispose();});
                } else {
                    players[playerId].mesh.material.dispose();
                }
            }
           // console.log(`Removed mesh for player ${playerId}`); // Reduce log noise
        } catch(e){
            console.error(`Error removing mesh for player ${playerId}:`,e);
        }
        players[playerId].mesh=null; // Clear reference in player data
    }
}

function updateRemotePlayerPosition(playerData) {
     // Only update known players who are not the local player
     if(playerData.id!==localPlayerId && players[playerData.id]){
        const p=players[playerData.id];
        let visualY;
        // Determine visual Y based on whether it's the fallback cylinder or the loaded model
        if(p.mesh && p.mesh.geometry instanceof THREE.CylinderGeometry){
            visualY=playerData.y+(PLAYER_HEIGHT/2); // Center of cylinder
        } else {
            visualY=playerData.y; // Assume loaded model origin is at feet
        }
        // Set target state for smooth interpolation
        p.targetPosition=new THREE.Vector3(playerData.x,visualY,playerData.z);
        p.targetRotationY=playerData.rotationY;
        // Update the stored logical data from the server
        p.x=playerData.x;
        p.y=playerData.y; // Store logical Y
        p.z=playerData.z;
        p.rotationY=playerData.rotationY;
        p.name=playerData.name; // Sync name/phrase in case they change
        p.phrase=playerData.phrase;
    }
}

 function updateOtherPlayers(deltaTime) { // Interpolation loop for remote players
     for(const id in players){
        // Only interpolate other players who have a mesh and target data
        if(id!==localPlayerId && players[id].mesh && players[id].targetPosition){
            const p=players[id];
            const m=p.mesh;
            // Interpolate position using lerp
            m.position.lerp(p.targetPosition, deltaTime * 12); // Adjust interpolation speed (12) if needed

            // Interpolate rotation using slerp (or lerp for Y-axis only)
            if(p.targetRotationY !== undefined){
                let targetQuaternion = new THREE.Quaternion();
                targetQuaternion.setFromEuler(new THREE.Euler(0, p.targetRotationY, 0)); // Create target quaternion for Y rotation
                m.quaternion.slerp(targetQuaternion, deltaTime * 12); // Slerp rotation

                // --- OR --- Simple Y-axis Lerp (less smooth for full rotations):
                // let aD=p.targetRotationY - m.rotation.y;
                // while(aD < -Math.PI) aD += Math.PI * 2;
                // while(aD > Math.PI) aD -= Math.PI * 2;
                // m.rotation.y += aD * deltaTime * 12;
            }
        }
    }
 }

console.log("player.js loaded");
