// docs/game.js - Main Game Orchestrator (with Rapier.js)

// --- Global Flags and Data ---
let networkIsInitialized = false;
let assetsAreReady = false;
let initializationData = null;
var currentGameInstance = null;
var groundCollider = null; // Store ground collider handle

// Global RAPIER reference set by rapier_init.js
var RAPIER = window.RAPIER || null;
var rapierWorld = null; // Rapier world instance
var rapierEventQueue = null; // Event queue

// Rapier Ready Flag set by rapier_init.js
window.isRapierReady = window.isRapierReady || false;

class Game {
    // --- Constructor ---
    constructor() {
        this.scene = null; this.camera = null; this.renderer = null; this.controls = null; this.clock = null;
        this.players = players; this.keys = keys; this.mapMesh = null;
        this.playerRigidBodies = {}; // Map Player ID -> RAPIER.RigidBody handle
        this.rapierReady = window.isRapierReady;
        this.lastCallTime = performance.now();
        console.log("[Game] Instance created.");

        // Listen for Rapier readiness if not already ready
        if (!this.rapierReady) {
            window.addEventListener('rapier-ready', () => {
                console.log("[Game] 'rapier-ready' event received inside listener.");
                RAPIER = window.RAPIER; if (!RAPIER) console.error("RAPIER global missing after event!");
                else { this.initializePhysics(); this.attemptProceedToGame(); }
            }, { once: true });
        } else { if (!window.RAPIER) console.error("RAPIER global missing though flag ready!"); else this.initializePhysics(); console.log("[Game] Rapier ready on construct."); }
    }

    // --- Start Method ---
    start() {
        console.log("[Game] Starting...");
        networkIsInitialized = false; assetsAreReady = false; initializationData = null;
        this.mapMesh = null; this.playerRigidBodies = {}; rapierWorld = null; groundCollider = null; rapierEventQueue = null; this.lastCallTime = performance.now();

        // Init modules/listeners that DON'T depend on Rapier World existing yet
        if (!this.initializeThreeJS()) { return; }
        if (!this.initializeManagers()) { return; }
        if (!this.initializeNetwork()) { return; }
        this.bindLoadManagerListeners();
        this.bindOtherStateTransitions();
        this.addEventListeners();

        console.log("[Game] Triggering Asset and Rapier loading..."); this.startAssetLoading(); // Starts loading assets
        // rapier_init.js is loading Rapier module in parallel
        if(stateMachine) stateMachine.transitionTo('loading', {message:"Loading Assets/Physics..."}); else console.error("stateMachine missing!");

        this.animate(); // Start the render loop (physics loop starts only after Rapier is ready)
        console.log("[Game] Basic setup done, waiting for loads...");
    }

     // --- Separate Three.js Initialization ---
    initializeThreeJS() {
        console.log("[Game] Initializing Three.js Components...");
         try { // Scene, Camera, Renderer, Controls, Loaders, Lights
             this.scene = new THREE.Scene(); scene = this.scene; this.scene.background = new THREE.Color(0x6699cc); this.scene.fog = new THREE.Fog(0x6699cc, 0, 200); this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000); camera = this.camera; this.clock = new THREE.Clock(); clock = this.clock; const canvas = document.getElementById('gameCanvas'); if (!canvas) throw new Error("#gameCanvas missing!"); this.renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true }); renderer = this.renderer; this.renderer.setSize(window.innerWidth, window.innerHeight); this.renderer.shadowMap.enabled = true; this.controls = new THREE.PointerLockControls(this.camera, document.body); controls = this.controls; this.controls.addEventListener('lock', ()=>{console.log('[Controls] Locked');}); this.controls.addEventListener('unlock', ()=>{console.log('[Controls] Unlocked');}); dracoLoader = new THREE.DRACOLoader(); dracoLoader.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/libs/draco/'); dracoLoader.setDecoderConfig({ type: 'js' }); dracoLoader.preload(); loader = new THREE.GLTFLoader(); loader.setDRACOLoader(dracoLoader); const ambL = new THREE.AmbientLight(0xffffff, 0.7); this.scene.add(ambL); const dirL = new THREE.DirectionalLight(0xffffff, 1.0); dirL.position.set(15, 20, 10); dirL.castShadow = true; dirL.shadow.mapSize.width=1024; dirL.shadow.mapSize.height=1024; this.scene.add(dirL); this.scene.add(dirL.target); console.log("[Game] Three.js Components OK."); return true;
         } catch(e) { console.error("!!! Three.js Init Error:", e); UIManager?.showError(`FATAL: Graphics Init! ${e.message}`, 'loading'); return false; }
    }

    // --- Separate Physics Initialization (called when Rapier WASM is ready) ---
    initializePhysics() {
         if (!window.RAPIER) { console.error("Attempted physics init but RAPIER global not ready!"); return false; }
         if (rapierWorld) { console.warn("Physics world already initialized."); return true; }

         console.log("[Game] Initializing Rapier Physics World...");
         try {
             const RAPIER = window.RAPIER; // Local alias
             const gravity = new RAPIER.Vector3(0.0, CONFIG?.GRAVITY ?? -9.81, 0.0);
             rapierWorld = new RAPIER.World(gravity);
             if (!rapierWorld) throw new Error("World creation returned null/undefined.");
             rapierEventQueue = new RAPIER.EventQueue(true);
             if (!rapierEventQueue) throw new Error("EventQueue creation failed.");
             console.log("[Game] Rapier world & queue created.");

             const groundSize = 100; const groundHeight = 0.1;
             const groundColliderDesc = RAPIER.ColliderDesc.cuboid(groundSize, groundHeight / 2, groundSize)
                 .setTranslation(0.0, -groundHeight / 2, 0.0) .setFriction(0.5).setRestitution(0.1);
             groundCollider = rapierWorld.createCollider(groundColliderDesc); // Creates static collider
             if (!groundCollider) throw new Error("Ground collider creation failed.");
             console.log("[Game] Rapier Ground collider created.");

             return true;
         } catch (e) { console.error("!!! Rapier Physics World Init Error:", e); rapierWorld = null; rapierEventQueue = null; groundCollider = null; if (UIManager) UIManager.showError(`FATAL: Physics Init! ${e.message}`, 'loading'); return false; }
     }


    // --- Initialize Network ---
    initializeNetwork() {
        console.log("[Game] Initializing Network Module..."); if (Network?.init) { try { Network.init(); console.log("Net init called."); return true; } catch (e) { console.error("Net Init Error:", e); stateMachine?.transitionTo('loading', { message: `FATAL: Net Fail! ${e.message}`, error: true }); return false; } }
        else { console.error("Network missing!"); stateMachine?.transitionTo('loading', { message: `FATAL: Net Load Fail!`, error: true }); return false; }
    }

    // --- Setup Asset Loading ---
    bindLoadManagerListeners() {
        if (!loadManager) { console.error("LoadManager missing!"); stateMachine?.transitionTo('loading',{message:"Load Manager Fail!", error:true}); return; }
        loadManager.on('ready', () => { console.log("[Game] LoadManager 'ready'."); assetsAreReady = true; this.mapMesh = loadManager.getAssetData('map'); if (!this.mapMesh) { console.error("Map data missing post-ready!"); stateMachine?.transitionTo('loading', { message: "Map Data Fail!", error: true }); return; } console.log("[Game] Map mesh stored."); this.attemptProceedToGame(); });
        loadManager.on('error', (data) => { console.error("LoadManager error:", data); assetsAreReady = false; this.mapMesh = null; stateMachine?.transitionTo('loading',{message:`Asset Error!<br/>${data.message||'Check console.'}`,error:true}); }); console.log("[Game] LoadManager listeners bound.");
    }

     // --- Check if ready to proceed ---
    attemptProceedToGame() {
        console.log(`[Game] Check Proceed: Rapier=${!!window.RAPIER}, World=${!!rapierWorld}, Assets=${assetsAreReady}, NetInit=${networkIsInitialized}, Data=${!!initializationData}`);
        if (window.RAPIER && rapierWorld && assetsAreReady && networkIsInitialized && initializationData) {
            console.log("All Ready -> startGamePlay"); if (currentGameInstance?.startGamePlay) { currentGameInstance.startGamePlay(initializationData); } else { console.error("Game instance missing!"); }
        } else if (assetsAreReady && window.RAPIER && rapierWorld && stateMachine?.is('loading')) { // Check Rapier loaded before leaving loading screen
            console.log("Assets & Physics Ready, still loading state -> To Homescreen"); let pCount = '?'; if (UIManager?.playerCountSpan) pCount = UIManager.playerCountSpan.textContent ?? '?'; stateMachine.transitionTo('homescreen', { playerCount: pCount });
        } else { console.log(`Not ready or invalid state. State: ${stateMachine?.currentState}`); }
    }


    // --- Initialize Other Managers ---
    initializeManagers() {
        console.log("[Game] Init Managers..."); if(!UIManager || !Input || !stateMachine || !loadManager || !Network || !Effects) { console.error("Mgr undefined!"); UIManager?.showError("FATAL: Mgr Load!", 'loading'); return false; }
         try { if(!UIManager.initialize()) throw new Error("UI init fail"); Input.init(this.controls); Effects.initialize(this.scene); console.log("[Game] Mgr Initialized."); return true;
         } catch (e) { console.error("!!! Mgr Init Error:", e); UIManager?.showError(`FATAL: Mgr Setup! ${e.message}`, 'loading'); return false; }
    }

    // --- Bind State Transitions ---
    bindOtherStateTransitions() {
         if(UIManager?.bindStateListeners) UIManager.bindStateListeners(stateMachine); else console.error("UIManager binding missing");
         if (stateMachine) { stateMachine.on('transition', (data) => { console.log(`[Game Listener] State: ${data.from} -> ${data.to}`); if (data.to === 'homescreen') { networkIsInitialized = false; initializationData = null; if (data.from === 'playing' || data.from === 'joining') { console.log(`Cleanup after ${data.from}...`); for(const handle of Object.values(this.playerRigidBodies)) { if (rapierWorld && handle) rapierWorld.removeRigidBody(handle); } this.playerRigidBodies = {}; for(const id in players){ if(id !== localPlayerId && Network?._removePlayer){ Network._removePlayer(id); } } if(players?.[localPlayerId]) { delete players[localPlayerId]; } players = {}; localPlayerId = null; if(controls?.isLocked) controls.unlock(); console.log("State cleared."); } } else if (data.to === 'playing') { if (UIManager && localPlayerId && players?.[localPlayerId]) { UIManager.updateHealthBar(players[localPlayerId].health); UIManager.updateInfo(`Playing as ${players[localPlayerId].name}`); }} else if (data.to === 'loading' && data.options?.error) { console.error("Loading error:", data.options.message); if(controls?.isLocked)controls.unlock(); networkIsInitialized=false; assetsAreReady=false; initializationData=null; this.mapMesh=null; this.playerRigidBodies={}; players={}; localPlayerId=null; } }); }
         else { console.error("stateMachine missing!"); } console.log("[Game] State Listeners Bound");
    }

    // --- Add Event Listeners ---
    addEventListeners() {
         console.log("[Game] Add listeners..."); if (UIManager?.joinButton && Network?.attemptJoinGame) { UIManager.joinButton.addEventListener('click', () => { if (!window.RAPIER || !rapierWorld) { UIManager.showError("Physics loading...", 'homescreen'); return; } if (!assetsAreReady) { UIManager.showError("Assets loading...", 'homescreen'); return; } Network.attemptJoinGame(); }); console.log("Join listener added."); } else { console.error("Cannot add join listener!"); } window.addEventListener('resize', this.handleResize.bind(this)); console.log("Global listeners added.");
    }

    // --- Main Update/Animate Loop ---
     animate() {
        requestAnimationFrame(() => this.animate());
        const dt = this.clock ? this.clock.getDelta() : 0.016;

        // Step Physics World ONLY if it exists
        if (rapierWorld) { rapierWorld.step(rapierEventQueue); }

        // Update Game Logic only if playing AND world exists
        if(rapierWorld && stateMachine?.is('playing')){
            try{
                const localPlayerHandle = localPlayerId ? this.playerRigidBodies[localPlayerId] : null;
                const localPlayerBody = localPlayerHandle ? rapierWorld.getRigidBody(localPlayerHandle) : null;
                if (updateLocalPlayer && localPlayerBody) { updateLocalPlayer(dt, localPlayerBody); }
            } catch(e){console.error("Err updateLP:",e);}
            try{ if(Effects?.update) Effects.update(dt); } catch(e){console.error("Err Effects.update:",e);}

             // Sync Visuals...
             const localBodyHandle = localPlayerId ? this.playerRigidBodies[localPlayerId] : null;
             const localBody = localBodyHandle ? rapierWorld.getRigidBody(localBodyHandle) : null;
             if (localBody && controls?.getObject()) { const pos=localBody.translation(); controls.getObject().position.set(pos.x, pos.y + (CONFIG?.CAMERA_Y_OFFSET ?? 1.6), pos.z); }
             for (const id in players) { if (id !== localPlayerId && players[id] instanceof ClientPlayer && players[id].mesh) { const rbHandle = this.playerRigidBodies[id]; const rb = rbHandle ? rapierWorld.getRigidBody(rbHandle) : null; if (rb) { const p=rb.translation(); const r=rb.rotation(); players[id].mesh.position.set(p.x,p.y,p.z); players[id].mesh.quaternion.set(r.x, r.y, r.z, r.w); const h=CONFIG?.PLAYER_HEIGHT||1.8; if(!(players[id].mesh.geometry instanceof THREE.CylinderGeometry)) {players[id].mesh.position.y -= h/2.0;} }}}
        }

        // Render
        if (renderer && scene && camera) { try { renderer.render(scene, camera); } catch (e) { console.error("Render error:", e); } }
    }


    // --- Resize Handler ---
    handleResize() { if (camera) { camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); } if (renderer) { renderer.setSize(window.innerWidth, window.innerHeight); } }

    // --- Start Game Play Method ---
    startGamePlay(initData) {
        console.log('[Game] startGamePlay called.');
        // Checks
        if (!initData?.id) { console.error("Invalid initData"); stateMachine?.transitionTo('homescreen'); UIManager?.showError("Init fail (data).", 'homescreen'); return; }
        // Check global RAPIER object AND world instance
        if (!rapierWorld || !window.RAPIER) { console.error("Rapier world/lib missing"); stateMachine?.transitionTo('homescreen'); UIManager?.showError("Init fail (physics).", 'homescreen'); return; }
        if (stateMachine?.is('playing')) { console.warn("Already playing"); return; }

        localPlayerId = initData.id; console.log(`[Game] Local ID: ${localPlayerId}`);
        console.log("[Game] Clearing previous state...");
        // Use the Rapier method to remove bodies by handle
        for (const handle of Object.values(this.playerRigidBodies)) { if (rapierWorld && handle != undefined) rapierWorld.removeRigidBody(handle); } this.playerRigidBodies = {};
        for (const id in players) { if (Network?._removePlayer) Network._removePlayer(id); } players = {};

        // Process players
        for(const id in initData.players){
            const sPD = initData.players[id];
            if (sPD.x === undefined || sPD.y === undefined || sPD.z === undefined) { console.warn(`Invalid pos for ${id}`); continue; }
            const playerHeight = CONFIG?.PLAYER_HEIGHT||1.8; const playerRadius = CONFIG?.PLAYER_RADIUS||0.4;
            const capsuleHalfHeight = Math.max(0.01, (playerHeight / 2.0) - playerRadius); // Ensure non-zero
            const bodyCenterY = sPD.y + playerHeight / 2.0;

            try {
                // Player Collider Desc (Use correct Rapier API)
                let playerColliderDesc = RAPIER.ColliderDesc.capsule(capsuleHalfHeight, playerRadius) // <<< CORRECTED API CALL
                   .setFriction(0.5).setRestitution(0.1).setTranslation(0,0,0); // Relative offset (none needed for simple capsule)

                if(id === localPlayerId){ // --- LOCAL ---
                    console.log(`[Game] Init local: ${sPD.name}`); players[id] = { ...sPD, isLocal: true, mesh: null };
                    let rigidBodyDesc = RAPIER.RigidBodyDesc.dynamic().setTranslation(sPD.x, bodyCenterY, sPD.z).setLinvel(0,0,0).setAngvel({x:0,y:0,z:0}).setLinearDamping(0.5).setAngularDamping(1.0).lockRotations();
                    let body = rapierWorld.createRigidBody(rigidBodyDesc); if (!body) throw new Error("Local body create fail.");
                    let collider = rapierWorld.createCollider(playerColliderDesc, body.handle); // Use body handle
                    this.playerRigidBodies[id] = body.handle; console.log(`Created DYNAMIC body handle ${body.handle}`);
                    if(controls?.getObject()){ const bPos=body.translation(); controls.getObject().position.set(bPos.x, bPos.y+(CONFIG?.CAMERA_Y_OFFSET ?? 1.6), bPos.z); }
                    if(UIManager){ UIManager.updateHealthBar(sPD.health ?? 100); UIManager.updateInfo(`Playing as ${sPD.name}`); UIManager.clearError('homescreen'); UIManager.clearKillMessage(); }
                } else { // --- REMOTE ---
                     if(Network?._addPlayer) Network._addPlayer(sPD); const remotePlayer = players[id];
                     if (remotePlayer instanceof ClientPlayer && rapierWorld) {
                         const q = new RAPIER.Quaternion(0,0,0,1); const rotY = sPD.rotationY || 0; q.setFromAxisAngle({x:0, y:1, z:0}, rotY);
                         let rigidBodyDesc = RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(sPD.x, bodyCenterY, sPD.z).setRotation(q);
                         let body = rapierWorld.createRigidBody(rigidBodyDesc); if (!body) throw new Error(`Remote body ${id} fail.`);
                         let collider = rapierWorld.createCollider(playerColliderDesc, body.handle); this.playerRigidBodies[id] = body.handle; console.log(`Created KINEMATIC body handle ${body.handle}`);
                     } else { console.warn(`Skip remote physics body ${id}.`); }
                }
            } catch(bodyError) { console.error(`Body creation error for ${id}:`, bodyError); stateMachine?.transitionTo('homescreen'); UIManager?.showError("Game init fail (body).", 'homescreen'); return; }
        } // End for loop

        console.log(`[Game] Init complete. ${Object.keys(players).length} players.`);
        if(stateMachine){ console.log("Transitioning to 'playing'..."); stateMachine.transitionTo('playing'); }
        else { console.error("stateMachine missing!"); }
    }

    // --- Start Asset Loading ---
    startAssetLoading() { console.log("[Game] Start asset load..."); if (loadManager) { loadManager.startLoading(); } else { console.error("LoadManager missing!"); stateMachine?.transitionTo('loading', {message:"Asset Manager Fail!", error: true}); } }

} // End Game Class

// --- Global Entry Point & DOM Ready ---
function runGame() { console.log("--- runGame() ---"); try { const gI=new Game(); window.currentGameInstance=gI; gI.start(); window.onresize=()=>gI.handleResize(); } catch(e){console.error("!!Error creating Game:",e);document.body.innerHTML="<p>GAME INIT FAILED.</p>";}}
if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',runGame);}else{runGame();}
console.log("game.js loaded (Corrected Rapier Capsule Collider)");
