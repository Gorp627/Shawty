// docs/game.js - Main Game Orchestrator (with Rapier.js)

// --- Global Flags and Data ---
let networkIsInitialized = false; let assetsAreReady = false; let initializationData = null;
var currentGameInstance = null; var groundCollider = null;
var RAPIER = window.RAPIER || null; var rapierWorld = null; var rapierEventQueue = null;
window.isRapierReady = window.isRapierReady || false;

class Game {
    // --- Constructor ---
    constructor() { /* ... same as before ... */ }

    // --- Start Method ---
    start() { /* ... same as before ... */ }

     // --- Separate Three.js Initialization ---
    initializeThreeJS() { /* ... same as before ... */ }

    // --- Separate Physics Initialization ---
    initializePhysics() { /* ... same as before ... */ }

    // --- Initialize Network ---
    initializeNetwork() { /* ... same as before ... */ }

    // --- Setup Asset Loading ---
    bindLoadManagerListeners() { /* ... same as before ... */ }

     // --- Check if ready ---
    attemptProceedToGame() { /* ... same as before ... */ }

    // --- Initialize Managers ---
    initializeManagers() { /* ... same as before ... */ }

    // --- Bind State Transitions ---
    bindOtherStateTransitions() { /* ... same as before ... */ }

    // --- Add Event Listeners ---
    addEventListeners() { /* ... same as before ... */ }

    // --- Main Update/Animate Loop ---
     animate() { /* ... same as before (physics step, logic update, visual sync) ... */ }

    // --- Resize Handler ---
    handleResize() { /* ... same as before ... */ }

    // --- Start Game Play Method ---
    startGamePlay(initData) {
        console.log('[Game] startGamePlay called.');
        if (!initData?.id || !rapierWorld || !window.RAPIER) { console.error("Invalid Data/Rapier/World"); stateMachine?.transitionTo('homescreen'); UIManager?.showError("Init fail (setup).", 'homescreen'); return; }
        if (stateMachine?.is('playing')) { console.warn("Already playing"); return; }

        localPlayerId = initData.id; console.log(`[Game] Local ID: ${localPlayerId}`);
        console.log("[Game] Clearing previous state...");
        for (const handle of Object.values(this.playerRigidBodies)) { if (rapierWorld && handle !== undefined) rapierWorld.removeRigidBody(handle); } this.playerRigidBodies = {};
        for (const id in players) { if (Network?._removePlayer) Network._removePlayer(id); } players = {};

        // Process players
        for(const id in initData.players){
            const sPD = initData.players[id];
            if (sPD.x === undefined || sPD.y === undefined || sPD.z === undefined) { console.warn(`Invalid pos for ${id}`); continue; }
            const playerHeight = CONFIG?.PLAYER_HEIGHT||1.8; const playerRadius = CONFIG?.PLAYER_RADIUS||0.4; const capsuleHalfHeight = Math.max(0.01, playerHeight / 2.0 - playerRadius); const bodyCenterY = sPD.y + playerHeight / 2.0;

            try {
                let playerColliderDesc = RAPIER.ColliderDesc.capsule(capsuleHalfHeight, playerRadius).setFriction(0.5).setRestitution(0.1); //.setActiveEvents(...);

                if(id === localPlayerId){ // --- LOCAL ---
                    console.log(`[Game] Init local: ${sPD.name}`); players[id] = { ...sPD, isLocal: true, mesh: null };
                    // --- CORRECTED Local Rotation Setting (applied if rotations unlocked) ---
                    const rotY = sPD.rotationY || 0;
                    let rigidBodyDesc = RAPIER.RigidBodyDesc.dynamic()
                        .setTranslation(sPD.x, bodyCenterY, sPD.z)
                        .setRotation({ x: 0, y: rotY, z: 0 }) // Set initial Y rotation via Euler angle object
                        .setLinvel(0,0,0).setAngvel({x:0,y:0,z:0})
                        .setLinearDamping(0.5).setAngularDamping(1.0)
                        .lockRotations(); // Keeps rotation locked after setting initial
                    // --- End Correction ---

                    let body = rapierWorld.createRigidBody(rigidBodyDesc); if (!body) throw new Error("Local body create fail.");
                    let collider = rapierWorld.createCollider(playerColliderDesc, body.handle);
                    this.playerRigidBodies[id] = body.handle; console.log(`Created DYNAMIC handle ${body.handle}`);
                    if(controls?.getObject()){ const bPos=body.translation(); controls.getObject().position.set(bPos.x, bPos.y+(CONFIG?.CAMERA_Y_OFFSET ?? 1.6), bPos.z); }
                    if(UIManager){ UIManager.updateHealthBar(sPD.health ?? 100); UIManager.updateInfo(`Playing as ${sPD.name}`); UIManager.clearError('homescreen'); UIManager.clearKillMessage(); }
                } else { // --- REMOTE ---
                     if(Network?._addPlayer) Network._addPlayer(sPD); const remotePlayer = players[id];
                     if (remotePlayer instanceof ClientPlayer && rapierWorld) {
                        const RAPIER = window.RAPIER;
                        const rotY = sPD.rotationY || 0;
                        // --- CORRECTED Remote Rotation Setting ---
                         let rigidBodyDesc = RAPIER.RigidBodyDesc.kinematicPositionBased()
                             .setTranslation(sPD.x, bodyCenterY, sPD.z)
                             .setRotation({ x: 0, y: rotY, z: 0 }); // Set initial Y rotation via Euler angle object
                        // --- End Correction ---
                         let body = rapierWorld.createRigidBody(rigidBodyDesc); if (!body) throw new Error(`Remote body ${id} fail.`);
                         let collider = rapierWorld.createCollider(playerColliderDesc, body.handle);
                         this.playerRigidBodies[id] = body.handle; console.log(`Created KINEMATIC handle ${body.handle}`);
                     } else { console.warn(`Skip remote physics body ${id}.`); }
                }
            } catch(bodyError) { console.error(`Body creation error for ${id}:`, bodyError); stateMachine?.transitionTo('homescreen'); UIManager?.showError("Game init fail (body).", 'homescreen'); return; }
        } // End for loop

        console.log(`[Game] Init complete. ${Object.keys(players).length} players.`);
        if(stateMachine){ console.log("Transitioning state to 'playing'..."); stateMachine.transitionTo('playing'); } else { console.error("stateMachine missing!"); }
    }

    // --- Start Asset Loading ---
    startAssetLoading() { /* ... same as before ... */ }

} // End Game Class

// --- Global Entry Point & DOM Ready ---
function runGame() { /* ... same as before ... */ }
if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',runGame);}else{runGame();}
console.log("game.js loaded (Fixed Rapier Rotation Setting)");
