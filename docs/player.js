// docs/player.js

// Needs access to globals: players, playerModel, PLAYER_RADIUS, PLAYER_HEIGHT, scene, localPlayerId

function addPlayer(playerData) {
    console.log(`Add player ${playerData.id} (${playerData.name})`); if(players[playerData.id]||playerData.id===localPlayerId)return;
    players[playerData.id]={...playerData,mesh:null,targetPosition:null,targetRotationY:null};
    if(playerModel&&playerModel!=='error'){
        try{ // Ensure try has catch
            const dS=0.8;//<<< ADJUST SCALE
            const mI=playerModel.clone();
            mI.scale.set(dS,dS,dS);
            mI.traverse(function(c){if(c.isMesh)c.castShadow=true;});
            const vY=playerData.y; // Assume model origin at feet
            mI.position.set(playerData.x,vY,playerData.z);
            mI.rotation.y=playerData.rotationY;
            scene.add(mI);
            players[playerData.id].mesh=mI;
            players[playerData.id].targetPosition=mI.position.clone();
            players[playerData.id].targetRotationY=mI.rotation.y;
        } catch(e){ // ADDED CATCH BLOCK
            console.error(`Model error ${playerData.id}:`,e);
            addPlayerFallbackMesh(playerData);
        }
    } else {
        addPlayerFallbackMesh(playerData);
    }
}

function addPlayerFallbackMesh(playerData) {
    if(!players[playerData.id]||players[playerData.id].mesh)return;
    console.warn(`Fallback for ${playerData.id}`);
    try{ // Ensure try has catch
        const geo=new THREE.CylinderGeometry(PLAYER_RADIUS,PLAYER_RADIUS,PLAYER_HEIGHT,8);
        const mat=new THREE.MeshStandardMaterial({color:0xff00ff}); // Magenta fallback
        const mesh=new THREE.Mesh(geo,mat);
        mesh.castShadow=true;
        const visY=playerData.y+(PLAYER_HEIGHT/2); // Cylinder origin is center
        mesh.position.set(playerData.x,visY,playerData.z);
        mesh.rotation.y=playerData.rotationY;
        scene.add(mesh);
        players[playerData.id].mesh=mesh;
        players[playerData.id].targetPosition=mesh.position.clone();
        players[playerData.id].targetRotationY=mesh.rotation.y;
    } catch(e){ // ADDED CATCH BLOCK
        console.error(`Fallback error ${playerData.id}:`,e);
    }
}

function removePlayerMesh(playerId) {
     if(players[playerId]?.mesh){
        try{ // Ensure try has catch
            scene.remove(players[playerId].mesh);
            if(players[playerId].mesh.geometry)players[playerId].mesh.geometry.dispose();
            if(players[playerId].mesh.material){
                if(Array.isArray(players[playerId].mesh.material)){
                    players[playerId].mesh.material.forEach(function(m){m.dispose();});
                } else {
                    players[playerId].mesh.material.dispose();
                }
            }
        } catch(e){ // ADDED CATCH BLOCK
             console.error(`Remove mesh err ${playerId}:`,e);
        }
        players[playerId].mesh=null;
    }
}

function updateRemotePlayerPosition(playerData) {
     if(playerData.id!==localPlayerId&&players[playerData.id]){
        const p=players[playerData.id];
        let vY;
        // Determine visual Y based on whether it's the fallback or the loaded model
        if(p.mesh && p.mesh.geometry instanceof THREE.CylinderGeometry){
            vY=playerData.y+(PLAYER_HEIGHT/2); // Center of cylinder
        } else {
            vY=playerData.y; // Assume loaded model origin is at feet
        }
        p.targetPosition=new THREE.Vector3(playerData.x,vY,playerData.z);
        p.targetRotationY=playerData.rotationY;
        // Update logical data from server
        p.x=playerData.x;p.y=playerData.y;p.z=playerData.z;p.rotationY=playerData.rotationY;p.name=playerData.name;p.phrase=playerData.phrase;
    }
}

function updateOtherPlayers(deltaTime) { // Interpolation loop
     for(const id in players){
        if(id!==localPlayerId&&players[id].mesh){
            const p=players[id], m=p.mesh;
            if(p.targetPosition && p.targetRotationY!==undefined){
                m.position.lerp(p.targetPosition,deltaTime*12); // Interpolate position
                let aD=p.targetRotationY-m.rotation.y; // Calculate shortest angle diff for rotation
                while(aD<-Math.PI)aD+=Math.PI*2;
                while(aD>Math.PI)aD-=Math.PI*2;
                m.rotation.y+=aD*deltaTime*12; // Interpolate rotation
            }
        }
    }
}

console.log("player.js loaded");
