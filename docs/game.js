// docs/game.js - Main Game Orchestrator (with Rapier.js - Corrected API)

// --- Global Flags and Data ---
let networkIsInitialized = false; let assetsAreReady = false; let initializationData = null;
var currentGameInstance = null; var groundColliderHandle = null; // Store ground collider handle

var RAPIER = window.RAPIER || null; var rapierWorld = null; var rapierEventQueue = null;
window.isRapierReady = window.isRapierReady || false;

class Game {
    // --- Constructor ---
    constructor() {
        this.scene = null; this.camera = null; this.renderer = null; this.controls = null; this.clock = null;
        this.players = players; this.keys = keys; this.mapMesh = null;
        this.playerRigidBodyHandles = {}; // Map Player ID -> RAPIER.RigidBody handle
        this.rapierReady = window.isRapierReady;
        this.lastCallTime = performance.now();
        console.log("[Game] Instance created.");

        // Listen for Rapier readiness
        if (!this.rapierReady) { window.addEventListener('rapier-ready', () => { console.log("Rapier Ready Event"); RAPIER = window.RAPIER; if (!RAPIER) console.error("RAPIER missing post-event!"); else { this.initializePhysics(); this.attemptProceedToGame(); } }, { once: true });
        } else { if (!window.RAPIER) console.error("RAPIER ready but global missing!"); else this.initializePhysics(); console.log("Rapier ready on construct."); }
    }

    // --- Start Method ---
    start() {
        console.log("[Game] Starting..."); networkIsInitialized = false; assetsAreReady = false; initializationData = null; this.mapMesh = null; this.playerRigidBodyHandles = {}; rapierWorld = null; groundColliderHandle = null; rapierEventQueue = null; this.lastCallTime = performance.now();

        if (!this.initializeThreeJS()) { return; } if (!this.initializeManagers()) { return; } if (!this.initializeNetwork()) { return; }
        this.bindLoadManagerListeners(); this.bindOtherStateTransitions(); this.addEventListeners();
        console.log("Triggering Asset/Rapier loading..."); this.startAssetLoading();
        if(stateMachine) stateMachine.transitionTo('loading', {message:"Loading..."}); else console.error("stateMachine missing!");
        this.animate(); console.log("Basic setup done, wait loads...");
    }

     // --- Separate Three.js Initialization ---
    initializeThreeJS() { console.log("Init Three.js..."); try { this.scene = new THREE.Scene(); scene = this.scene; this.scene.background = new THREE.Color(0x6699cc); this.scene.fog = new THREE.Fog(0x6699cc, 0, 200); this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000); camera = this.camera; this.clock = new THREE.Clock(); clock = this.clock; const c = document.getElementById('gameCanvas'); if (!c) throw new Error("#gameCanvas missing!"); this.renderer = new THREE.WebGLRenderer({ canvas: c, antialias: true }); renderer = this.renderer; this.renderer.setSize(window.innerWidth, window.innerHeight); this.renderer.shadowMap.enabled = true; this.controls = new THREE.PointerLockControls(this.camera, document.body); controls = this.controls; this.controls.addEventListener('lock', ()=>{console.log('Controls Locked');}); this.controls.addEventListener('unlock', ()=>{console.log('Controls Unlocked');}); dracoLoader = new THREE.DRACOLoader(); dracoLoader.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/libs/draco/'); dracoLoader.setDecoderConfig({ type: 'js' }); dracoLoader.preload(); loader = new THREE.GLTFLoader(); loader.setDRACOLoader(dracoLoader); const ambL=new THREE.AmbientLight(0xffffff, 0.7); scene.add(ambL); const dirL=new THREE.DirectionalLight(0xffffff,1.0); dirL.position.set(15,20,10); dirL.castShadow=true; dirL.shadow.mapSize.width=1024; dirL.shadow.mapSize.height=1024; scene.add(dirL); scene.add(dirL.target); console.log("Three.js OK."); return true; } catch(e) { console.error("!!! Three.js Init Error:", e); UIManager?.showError(`FATAL: Graphics Init! ${e.message}`, 'loading'); return false; } }

    // --- Separate Physics Initialization ---
    initializePhysics() {
         if (!RAPIER) { console.error("Attempted physics init but RAPIER global not ready!"); return false; } if (rapierWorld) { console.warn("Physics already init."); return true; } console.log("Initializing Rapier World..."); try {
             const gravity = new RAPIER.Vector3(0.0, CONFIG?.GRAVITY ?? -25.0, 0.0); rapierWorld = new RAPIER.World(gravity); if (!rapierWorld) throw new Error("World creation fail.");
             rapierEventQueue = new RAPIER.EventQueue(true); if (!rapierEventQueue) throw new Error("EventQueue fail."); console.log("Rapier world & queue created.");
             const groundSize=100, groundHeight=0.1; const groundColliderDesc = RAPIER.ColliderDesc.cuboid(groundSize, groundHeight/2, groundSize).setTranslation(0.0, -groundHeight/2, 0.0).setFriction(0.7).setRestitution(0.1); groundColliderHandle = rapierWorld.createCollider(groundColliderDesc)?.handle; if (groundColliderHandle === undefined) throw new Error("Ground collider fail."); console.log(`Rapier Ground collider handle: ${groundColliderHandle}`); return true;
         } catch (e) { console.error("!!! Rapier Init Error:", e); rapierWorld=null; rapierEventQueue=null; groundColliderHandle=null; UIManager?.showError(`FATAL: Physics Init! ${e.message}`, 'loading'); return false; }
     }

    // --- Initialize Network ---
    initializeNetwork() { console.log("Init Network..."); if (Network?.init) { try { Network.init(); console.log("Net init ok."); return true; } catch (e) { console.error("Net Init Err:", e); stateMachine?.transitionTo('loading', { message: `Net Fail! ${e.message}`, error: true }); return false; } } else { console.error("Network missing!"); stateMachine?.transitionTo('loading', { message: `Net Load Fail!`, error: true }); return false; } }

    // --- Setup Asset Loading ---
    bindLoadManagerListeners() { if (!loadManager) { console.error("LoadMgr missing!"); stateMachine?.transitionTo('loading',{message:"Load Mgr Fail!", error:true}); return; } loadManager.on('ready', () => { console.log("LoadMgr 'ready'."); assetsAreReady = true; this.mapMesh = loadManager.getAssetData('map'); if (!this.mapMesh) { console.error("Map data missing!"); stateMachine?.transitionTo('loading', { message: "Map Data Fail!", error: true }); return; } console.log("Map mesh stored."); this.attemptProceedToGame(); }); loadManager.on('error', (data) => { console.error("LoadMgr error:", data); assetsAreReady = false; this.mapMesh = null; stateMachine?.transitionTo('loading',{message:`Asset Err!<br/>${data.message||''}`,error:true}); }); console.log("LoadMgr listeners bound."); }

     // --- Check if ready ---
    attemptProceedToGame() { console.log(`Check Proceed: Rapier=${!!RAPIER}, World=${!!rapierWorld}, Assets=${assetsAreReady}, NetInit=${networkIsInitialized}, Data=${!!initializationData}`); if (RAPIER && rapierWorld && assetsAreReady && networkIsInitialized && initializationData) { console.log("All Ready -> startGamePlay"); if (currentGameInstance?.startGamePlay) { currentGameInstance.startGamePlay(initializationData); } else { console.error("Game instance missing!"); } } else if (assetsAreReady && RAPIER && rapierWorld && stateMachine?.is('loading')) { console.log("Assets & Physics Ready -> Homescreen"); let pC = '?'; if (UIManager?.playerCountSpan) pC=UIManager.playerCountSpan.textContent??'?'; stateMachine.transitionTo('homescreen', { playerCount: pC }); } else { console.log(`Not ready. State: ${stateMachine?.currentState}`); } }

    // --- Initialize Managers ---
    initializeManagers() { console.log("Init Mgrs..."); if(!UIManager||!Input||!stateMachine||!loadManager||!Network||!Effects) { console.error("Mgr undef!"); UIManager?.showError("FATAL: Mgr Load!", 'loading'); return false; } try { if(!UIManager.initialize()) throw new Error("UI fail"); Input.init(this.controls); Effects.initialize(this.scene); console.log("Mgr Initialized."); return true; } catch (e) { console.error("Mgr Init Err:", e); UIManager?.showError(`FATAL: Mgr Setup! ${e.message}`, 'loading'); return false; } }

    // --- Bind State Transitions ---
    bindOtherStateTransitions() { if(UIManager?.bindStateListeners) UIManager.bindStateListeners(stateMachine); else console.error("UI binding missing"); if (stateMachine) { stateMachine.on('transition', (data) => { console.log(`Listener State: ${data.from}->${data.to}`); if(data.to==='homescreen'){ networkIsInitialized=false; initializationData=null; if(data.from==='playing'||data.from==='joining'){ console.log(`Cleanup after ${data.from}...`); for(const handle of Object.values(this.playerRigidBodyHandles)) { if(rapierWorld&&handle!==undefined) rapierWorld.removeRigidBody(handle);} this.playerRigidBodyHandles={}; for(const id in players){if(id!==localPlayerId&&Network?._removePlayer){Network._removePlayer(id);}} if(players?.[localPlayerId]){delete players[localPlayerId];} players={}; localPlayerId=null; if(controls?.isLocked) controls.unlock(); console.log("State cleared.");}} else if(data.to==='playing'){if(UIManager && localPlayerId && players?.[localPlayerId]){UIManager.updateHealthBar(players[localPlayerId].health); UIManager.updateInfo(`Playing as ${players[localPlayerId].name}`);}} else if(data.to==='loading'&&data.options?.error){ console.error("Loading error:", data.options.message); if(controls?.isLocked)controls.unlock(); networkIsInitialized=false; assetsAreReady=false; initializationData=null; this.mapMesh=null; this.playerRigidBodyHandles={}; players={}; localPlayerId=null; }}); } else { console.error("stateMachine missing!"); } console.log("State Listeners Bound"); }

    // --- Add Event Listeners ---
    addEventListeners() { console.log("Add listeners..."); if (UIManager?.joinButton && Network?.attemptJoinGame) { UIManager.joinButton.addEventListener('click', () => { if (!RAPIER || !rapierWorld || !assetsAreReady) { UIManager.showError("Loading...", 'homescreen'); return; } Network.attemptJoinGame(); }); console.log("Join listener added."); } else { console.error("Cannot add join listener!"); } window.addEventListener('resize', this.handleResize.bind(this)); console.log("Global listeners added."); }

    // --- Main Update/Animate Loop ---
     animate() {
        requestAnimationFrame(() => this.animate());
        const dt = this.clock ? this.clock.getDelta() : 0.016;

        if (rapierWorld) { rapierWorld.step(rapierEventQueue); } // Step physics

        if(rapierWorld && stateMachine?.is('playing')){
            try{ // Update local player physics
                const localHandle = localPlayerId ? this.playerRigidBodyHandles[localPlayerId] : null;
                const localBody = localHandle !== undefined ? rapierWorld.getRigidBody(localHandle) : null;
                if (updateLocalPlayer && localBody) updateLocalPlayer(dt, localBody);
            } catch(e){console.error("Err updateLP:",e);}
            try{ if(Effects?.update) Effects.update(dt); } catch(e){console.error("Err Effects:",e);}

             // Sync Visuals
             const localHandle = localPlayerId ? this.playerRigidBodyHandles[localPlayerId] : null; const localBody = localHandle !== undefined ? rapierWorld.getRigidBody(localHandle) : null;
             if (localBody && controls?.getObject()) { const pos=localBody.translation(); controls.getObject().position.set(pos.x, pos.y + (CONFIG?.CAMERA_Y_OFFSET ?? 1.6), pos.z); }
             for (const id in players) { if (id !== localPlayerId && players[id] instanceof ClientPlayer && players[id].mesh) { const rbHandle = this.playerRigidBodyHandles[id]; const rb = rbHandle !== undefined ? rapierWorld.getRigidBody(rbHandle) : null; if (rb) { const p=rb.translation(); const r=rb.rotation(); players[id].mesh.position.set(p.x,p.y,p.z); players[id].mesh.quaternion.set(r.x, r.y, r.z, r.w); const h=CONFIG?.PLAYER_HEIGHT||1.8; if(!(players[id].mesh.geometry instanceof THREE.CylinderGeometry)) {players[id].mesh.position.y -= h/2.0;} }}}
        }
        if (renderer && scene && camera) { try { renderer.render(scene, camera); } catch (e) { console.error("Render error:", e); } }
    }

    // --- Resize Handler ---
    handleResize() { if (camera) { camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); } if (renderer) { renderer.setSize(window.innerWidth, window.innerHeight); } }

    // --- Start Game Play Method ---
    startGamePlay(initData) {
        console.log('[Game] startGamePlay called.');
        if (!initData?.id || !rapierWorld || !RAPIER) { console.error("Init Data/Rapier/World missing"); stateMachine?.transitionTo('homescreen'); UIManager?.showError("Init fail (setup).", 'homescreen'); return; }
        if (stateMachine?.is('playing')) { console.warn("Already playing"); return; }

        localPlayerId = initData.id; console.log(`Local ID: ${localPlayerId}`);
        console.log("Clearing previous state...");
        for (const handle of Object.values(this.playerRigidBodyHandles)) { if (rapierWorld && handle !== undefined) rapierWorld.removeRigidBody(handle); } this.playerRigidBodyHandles = {};
        for (const id in players) { if (Network?._removePlayer) Network._removePlayer(id); } players = {};

        // Process players
        for(const id in initData.players){
            const sPD = initData.players[id];
            if (sPD.x === undefined || sPD.y === undefined || sPD.z === undefined) { console.warn(`Invalid pos for ${id}`); continue; }
            const playerHeight=CONFIG?.PLAYER_HEIGHT||1.8; const playerRadius=CONFIG?.PLAYER_RADIUS||0.4; const capHalfHeight=Math.max(0.01, playerHeight/2.0 - playerRadius); const bodyCenterY = sPD.y + playerHeight / 2.0;

            try {
                let playerColliderDesc = RAPIER.ColliderDesc.capsule(capHalfHeight, playerRadius).setFriction(0.7).setRestitution(0.1); // Increased friction slightly

                if(id === localPlayerId){ // --- LOCAL ---
                    console.log(`Init local: ${sPD.name}`); players[id] = { ...sPD, isLocal: true, mesh: null };
                    let rigidBodyDesc = RAPIER.RigidBodyDesc.dynamic().setTranslation(sPD.x, bodyCenterY, sPD.z).setLinvel(0,0,0).setAngvel({x:0,y:0,z:0}).setLinearDamping(0.5).setAngularDamping(1.0).lockRotations();
                    let body = rapierWorld.createRigidBody(rigidBodyDesc); if (!body) throw new Error("Local body create fail.");
                    let collider = rapierWorld.createCollider(playerColliderDesc, body.handle);
                    this.playerRigidBodyHandles[id] = body.handle; console.log(`Created DYNAMIC handle ${body.handle}`); // Store handle
                    if(controls?.getObject()){ const bPos=body.translation(); controls.getObject().position.set(bPos.x, bPos.y+(CONFIG?.CAMERA_Y_OFFSET ?? 1.6), bPos.z); }
                    if(UIManager){ UIManager.updateHealthBar(sPD.health ?? 100); UIManager.updateInfo(`Playing as ${sPD.name}`); UIManager.clearError('homescreen'); UIManager.clearKillMessage(); }
                } else { // --- REMOTE ---
                     if(Network?._addPlayer) Network._addPlayer(sPD); const remotePlayer = players[id];
                     if (remotePlayer instanceof ClientPlayer && rapierWorld) {
                         const rotY = sPD.rotationY || 0;
                         // --- CORRECTED Rotation Setting ---
                         let rigidBodyDesc = RAPIER.RigidBodyDesc.kinematicPositionBased()
                            .setTranslation(sPD.x, bodyCenterY, sPD.z)
                            .setRotation({ x: 0, y: rotY, z: 0 }); // Use Euler angle object
                         // --- END CORRECTION ---
                         let body = rapierWorld.createRigidBody(rigidBodyDesc); if (!body) throw new Error(`Remote body ${id} fail.`);
                         let collider = rapierWorld.createCollider(playerColliderDesc, body.handle);
                         this.playerRigidBodyHandles[id] = body.handle; console.log(`Created KINEMATIC handle ${body.handle}`); // Store handle
                     } else { console.warn(`Skip remote physics body ${id}.`); }
                }
            } catch(bodyError) { console.error(`Body creation error for ${id}:`, bodyError); stateMachine?.transitionTo('homescreen'); UIManager?.showError("Game init fail (body).", 'homescreen'); return; }
        } // End for loop

        console.log(`Init complete. ${Object.keys(players).length} players.`);
        if(stateMachine){ console.log("Transitioning state to 'playing'..."); stateMachine.transitionTo('playing'); } else { console.error("stateMachine missing!"); }
    }

    // --- Start Asset Loading ---
    startAssetLoading() { console.log("Start asset load..."); if (loadManager) { loadManager.startLoading(); } else { console.error("LoadManager missing!"); stateMachine?.transitionTo('loading', {message:"Asset Manager Fail!", error: true}); } }

} // End Game Class

// --- Global Entry Point & DOM Ready ---
function runGame() { console.log("--- runGame() ---"); try { const gI=new Game(); window.currentGameInstance=gI; gI.start(); window.onresize=()=>gI.handleResize(); } catch(e){console.error("!!Error creating Game:",e);document.body.innerHTML="<p>GAME INIT FAILED.</p>";}}
if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',runGame);}else{runGame();}
console.log("game.js loaded (Corrected Euler Rotation Setting)");
