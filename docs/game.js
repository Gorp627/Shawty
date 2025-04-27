// docs/game.js - Main Game Orchestrator (with Cannon-es)

// --- Global Flags and Data ---
let networkIsInitialized = false;
let assetsAreReady = false;
let initializationData = null;
var currentGameInstance = null;
var groundBody = null; // Store reference to the ground physics body globally for collision checks

// --- Physics Constants ---
const timeStep = 1 / 60; // Default value, will use CONFIG if available

class Game {
    // --- Constructor ---
    constructor() {
        this.scene = null; this.camera = null; this.renderer = null; this.controls = null; this.clock = null;
        this.players = players; this.keys = keys; this.mapMesh = null; this.physicsBodies = {};
        this.world = null; this.lastCallTime = performance.now();
        this.groundMaterial = null; this.playerMaterial = null; // Materials stored on instance
        console.log("[Game] Instance created.");
    }

    // --- Start Method ---
    start() {
        console.log("[Game] Starting...");
        networkIsInitialized = false; assetsAreReady = false; initializationData = null;
        this.mapMesh = null; this.physicsBodies = {}; this.world = null; groundBody = null;
        this.groundMaterial = null; this.playerMaterial = null;
        this.lastCallTime = performance.now();
        const effectiveTimeStep = typeof CONFIG !== 'undefined' ? (CONFIG.PHYSICS_TIMESTEP || 1 / 60) : 1/60;

        if (!this.initializeCoreComponents()) { return; }
        if (!this.initializeManagers()) { return; }
        if (!this.initializeNetwork()) { return; }

        this.bindLoadManagerListeners();
        this.bindOtherStateTransitions();
        this.addEventListeners();

        if(stateMachine) stateMachine.transitionTo('loading'); else console.error("stateMachine missing!");
        this.startAssetLoading();

        this.animate(effectiveTimeStep);
        console.log("[Game] Started successfully setup.");
    }

    // --- Initialize Network ---
    initializeNetwork() {
        console.log("[Game] Initializing Network Module...");
        if (Network?.init) { try { Network.init(); console.log("[Game] Network module initialized."); return true; } catch (e) { console.error("!!! Network Init Error:", e); stateMachine?.transitionTo('loading', { message: `FATAL: Network Failed! ${e.message}`, error: true }); return false; } }
        else { console.error("Network object/init missing!"); stateMachine?.transitionTo('loading', { message: `FATAL: Network Load Failed!`, error: true }); return false; }
    }

    // --- Setup Asset Loading ---
    bindLoadManagerListeners() {
        if (!loadManager) { console.error("LoadManager missing!"); stateMachine?.transitionTo('loading',{message:"Load Manager Fail!", error:true}); return; }
        loadManager.on('ready', () => {
            console.log("[Game] LoadManager 'ready'."); assetsAreReady = true; this.mapMesh = loadManager.getAssetData('map');
            if (!this.mapMesh) { console.error("Map data missing after ready!"); stateMachine?.transitionTo('loading', { message: "Map Data Fail!", error: true }); return; }
            console.log("[Game] Map mesh stored."); this.attemptProceedToGame();
        });
        loadManager.on('error', (data) => { console.error("LoadManager error:", data); assetsAreReady = false; this.mapMesh = null; stateMachine?.transitionTo('loading',{message:`Asset Error!<br/>${data.message||'Check console.'}`,error:true}); });
        console.log("[Game] LoadManager listeners bound.");
    }

     // --- Check if ready to proceed ---
    attemptProceedToGame() {
        console.log(`[Game] Check Proceed: assets=${assetsAreReady}, net=${networkIsInitialized}, data=${!!initializationData}`);
        if (assetsAreReady && networkIsInitialized && initializationData) {
            console.log("All Ready -> startGamePlay"); if (currentGameInstance?.startGamePlay) { currentGameInstance.startGamePlay(initializationData); } else { console.error("Game instance missing!"); }
        } else if (assetsAreReady && stateMachine?.is('joining') && Network?.isConnected()) {
            console.log("Ready while Joining -> sendJoinDetails"); Network.sendJoinDetails();
        } else if (assetsAreReady && (stateMachine?.is('loading') || stateMachine?.is('uninitialized')) && !networkIsInitialized && !initializationData) {
             console.log("Ready while Loading -> HomeScreen"); let pCount = '?'; if (UIManager?.playerCountSpan) pCount = UIManager.playerCountSpan.textContent ?? '?'; stateMachine.transitionTo('homescreen', { playerCount: pCount });
        } else { console.log(`Not ready or invalid state: ${stateMachine?.currentState}`); }
    }

    // --- Initialize Core Components (Three.js + Cannon.js) ---
    initializeCoreComponents() {
        console.log("[Game] Init Core Components...");
         try { // Three.js...
             this.scene = new THREE.Scene(); scene = this.scene; this.scene.background = new THREE.Color(0x6699cc); this.scene.fog = new THREE.Fog(0x6699cc, 0, 200); this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000); camera = this.camera; this.clock = new THREE.Clock(); clock = this.clock; const canvas = document.getElementById('gameCanvas'); if (!canvas) throw new Error("#gameCanvas missing!"); this.renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true }); renderer = this.renderer; this.renderer.setSize(window.innerWidth, window.innerHeight); this.renderer.shadowMap.enabled = true; this.controls = new THREE.PointerLockControls(this.camera, document.body); controls = this.controls; this.controls.addEventListener('lock', ()=>{console.log('[Controls] Locked');}); this.controls.addEventListener('unlock', ()=>{console.log('[Controls] Unlocked');}); dracoLoader = new THREE.DRACOLoader(); dracoLoader.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/libs/draco/'); dracoLoader.setDecoderConfig({ type: 'js' }); dracoLoader.preload(); loader = new THREE.GLTFLoader(); loader.setDRACOLoader(dracoLoader); const ambL = new THREE.AmbientLight(0xffffff, 0.7); this.scene.add(ambL); const dirL = new THREE.DirectionalLight(0xffffff, 1.0); dirL.position.set(15, 20, 10); dirL.castShadow = true; dirL.shadow.mapSize.width=1024; dirL.shadow.mapSize.height=1024; this.scene.add(dirL); this.scene.add(dirL.target); console.log("[Game] Three.js OK.");
             // Cannon.js Setup...
             if (typeof CANNON === 'undefined') throw new Error("Cannon lib not loaded!"); this.world = new CANNON.World(); world = this.world; this.world.gravity.set(0, CONFIG?.GRAVITY ?? -9.82, 0); this.world.broadphase = new CANNON.NaiveBroadphase();
             this.groundMaterial = new CANNON.Material("groundMaterial"); this.playerMaterial = new CANNON.Material("playerMaterial"); // Store on instance
             const groundPlayerContact = new CANNON.ContactMaterial(this.groundMaterial, this.playerMaterial, { friction: 0.1, restitution: 0.1 }); this.world.addContactMaterial(groundPlayerContact);
             const playerPlayerContact = new CANNON.ContactMaterial(this.playerMaterial, this.playerMaterial, { friction: 0.5, restitution: 0.2 }); this.world.addContactMaterial(playerPlayerContact); console.log("Physics materials OK.");
             const groundShape = new CANNON.Plane(); groundBody = new CANNON.Body({ mass: 0, shape: groundShape, material: this.groundMaterial }); groundBody.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2); groundBody.position.set(0, 0, 0); this.world.addBody(groundBody); console.log("[Game] Cannon.js OK."); return true;
         } catch(e) { console.error("!!! Core Init Error:", e); UIManager?.showError(`FATAL Init Error! ${e.message}`, 'loading'); return false; }
    }

    // --- Initialize Other Managers ---
    initializeManagers() {
        console.log("[Game] Init Managers...");
         if(!UIManager || !Input || !stateMachine || !loadManager || !Network || !Effects) { console.error("Mgr undefined!"); UIManager?.showError("FATAL: Mgr Load Error!", 'loading'); return false; }
         try { if(!UIManager.initialize()) throw new Error("UI init fail"); Input.init(this.controls); Effects.initialize(this.scene); console.log("[Game] Managers Initialized."); return true;
         } catch (e) { console.error("!!! Mgr Init Error:", e); UIManager?.showError(`FATAL: Mgr Setup Error! ${e.message}`, 'loading'); return false; }
    }

    // --- Bind State Transitions ---
    bindOtherStateTransitions() {
        if(UIManager?.bindStateListeners) UIManager.bindStateListeners(stateMachine); else console.error("UIManager binding missing");
        if (stateMachine) { stateMachine.on('transition', (data) => { console.log(`[Game Listener] State: ${data.from} -> ${data.to}`); if (data.to === 'homescreen') { networkIsInitialized = false; initializationData = null; if (data.from === 'playing' || data.from === 'joining') { console.log(`Cleanup after ${data.from}...`); for(const id in this.physicsBodies) { if (world && this.physicsBodies[id]) world.removeBody(this.physicsBodies[id]); } this.physicsBodies = {}; for(const id in players){ if(id !== localPlayerId && Network?._removePlayer){ Network._removePlayer(id); } } if(players?.[localPlayerId]) { delete players[localPlayerId]; } players = {}; localPlayerId = null; if(controls?.isLocked) controls.unlock(); console.log("State cleared for homescreen."); } } else if (data.to === 'playing') { if (UIManager && localPlayerId && players?.[localPlayerId]) { UIManager.updateHealthBar(players[localPlayerId].health); UIManager.updateInfo(`Playing as ${players[localPlayerId].name}`); }} else if (data.to === 'loading' && data.options?.error) { console.error("Loading error:", data.options.message); if(controls?.isLocked)controls.unlock(); networkIsInitialized=false; assetsAreReady=false; initializationData=null; this.mapMesh=null; this.physicsBodies={}; players={}; localPlayerId=null; } }); }
        else { console.error("stateMachine missing!"); } console.log("[Game] State Listeners Bound");
    }

    // --- Add Event Listeners ---
    addEventListeners() {
        console.log("[Game] Add listeners..."); if (UIManager?.joinButton && Network?.attemptJoinGame) { UIManager.joinButton.addEventListener('click', () => { if (!assetsAreReady) { UIManager.showError("Assets loading...", 'homescreen'); return; } Network.attemptJoinGame(); }); console.log("Join listener added."); } else { console.error("Cannot add join listener!"); } window.addEventListener('resize', this.handleResize.bind(this)); console.log("Global listeners added.");
    }

    // --- Main Update/Animate Loop ---
     animate(physicsTimeStep) {
        requestAnimationFrame(() => this.animate(physicsTimeStep));
        const now = performance.now(); const dt = (now - this.lastCallTime) / 1000.0; this.lastCallTime = now;

        if (this.world) { this.world.step(physicsTimeStep, dt); } // Step physics

        if(stateMachine?.is('playing')){
            try{ const localPlayerBody = localPlayerId ? this.physicsBodies[localPlayerId] : null; if (updateLocalPlayer) updateLocalPlayer(dt, localPlayerBody); } catch(e){console.error("Err updateLP:",e);}
            try{ if(Effects?.update) Effects.update(dt); } catch(e){console.error("Err Effects.update:",e);}

             // Sync Visuals AFTER physics step...
             const localBody = localPlayerId ? this.physicsBodies[localPlayerId] : null;
             if (localBody && controls?.getObject()) { controls.getObject().position.copy(localBody.position); controls.getObject().position.y += (CONFIG?.CAMERA_Y_OFFSET ?? 1.6); }
             for (const id in players) {
                 if (id !== localPlayerId && players[id] instanceof ClientPlayer && players[id].mesh) {
                     const remoteBody = this.physicsBodies[id];
                     if (remoteBody) {
                          players[id].mesh.position.copy(remoteBody.position);
                          players[id].mesh.quaternion.copy(remoteBody.quaternion);
                          const playerHeight = CONFIG?.PLAYER_HEIGHT || 1.8;
                          const isFallback = players[id].mesh.geometry instanceof THREE.CylinderGeometry; // Check if it's the fallback
                          const visualY = remoteBody.position.y - (isFallback ? 0 : playerHeight / 2.0); // Adjust only if NOT fallback

                           // --- LOGGING for Clipping ---
                           //if (Math.random() < 0.01) { // Log occasionally
                           //     console.log(`Sync remote ${id}: BodyY=${remoteBody.position.y.toFixed(2)}, isFallback=${isFallback}, VisualY=${visualY.toFixed(2)}`);
                           //}
                           // --- END LOGGING ---

                           players[id].mesh.position.y = visualY; // Apply potentially adjusted Y
                     }
                 }
             }
        }
        if (renderer && scene && camera) { try { renderer.render(scene, camera); } catch (e) { console.error("Render error:", e); } }
    }


    // --- Resize Handler ---
    handleResize() { if (camera) { camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); } if (renderer) { renderer.setSize(window.innerWidth, window.innerHeight); } }

    // --- Ground Contact Handler ---
    handlePlayerGroundContact(event) {
        const localBody = localPlayerId ? this.physicsBodies[localPlayerId] : null; if (!localBody) return;
        let otherBody = null;
        if (event.bodyA?.id === localBody.id) otherBody = event.bodyB; else if (event.bodyB?.id === localBody.id) otherBody = event.bodyA;
        if (otherBody === groundBody) { isPlayerGrounded = true; /* console.log("Ground true"); */ } // Set global flag used by gameLogic
    }


    // --- Start Game Play Method ---
    startGamePlay(initData) {
        console.log('[Game] startGamePlay called.');
        if (!initData || !initData.id || !this.world || !this.playerMaterial) { console.error("Invalid initData/world/material"); stateMachine?.transitionTo('homescreen'); UIManager?.showError("Game init failed (setup).", 'homescreen'); return; }
        if (stateMachine?.is('playing')) { console.warn("Already playing"); return; }

        localPlayerId = initData.id; console.log(`[Game] Local ID: ${localPlayerId}`);
        console.log("[Game] Clearing previous state...");
        for (const id in this.physicsBodies) { if (this.world && this.physicsBodies[id]) this.world.removeBody(this.physicsBodies[id]); } this.physicsBodies = {};
        for (const id in players) { if (Network?._removePlayer) Network._removePlayer(id); } players = {};

        // Process players
        for(const id in initData.players){
            const sPD = initData.players[id];
            if (sPD.x === undefined || sPD.y === undefined || sPD.z === undefined) { console.warn(`Invalid pos data for ${id}`); continue; }
            const playerHeight = CONFIG?.PLAYER_HEIGHT||1.8; const playerRadius = CONFIG?.PLAYER_RADIUS||0.4; const bodyCenterY = sPD.y + playerHeight / 2.0;

            try { // Try body creation
                if(id === localPlayerId){ // --- LOCAL ---
                    console.log(`[Game] Init local player: ${sPD.name}`); players[id] = { ...sPD, isLocal: true, mesh: null };
                    const playerShape = new CANNON.Sphere(playerRadius);
                    const playerBody = new CANNON.Body({ mass: CONFIG?.PLAYER_MASS||70, position: new CANNON.Vec3(sPD.x, bodyCenterY, sPD.z), shape: playerShape, material: this.playerMaterial, linearDamping: 0.5, angularDamping: 0.9 });
                    if (!playerBody) throw new Error("Local body fail."); playerBody.angularFactor?.set(0,1,0);
                    playerBody.addEventListener('collide', this.handlePlayerGroundContact.bind(this)); // Bind listener
                    this.world.addBody(playerBody); this.physicsBodies[id] = playerBody; console.log(`Created local body y=${bodyCenterY.toFixed(2)}`);
                    if(controls?.getObject() && playerBody.position){ controls.getObject().position.copy(playerBody.position); controls.getObject().position.y += (CONFIG?.CAMERA_Y_OFFSET ?? 1.6); }
                    if(UIManager){ UIManager.updateHealthBar(sPD.health ?? 100); UIManager.updateInfo(`Playing as ${players[id].name}`); UIManager.clearError('homescreen'); UIManager.clearKillMessage(); }
                } else { // --- REMOTE ---
                     if(Network?._addPlayer) Network._addPlayer(sPD); const remotePlayer = players[id];
                     if (remotePlayer instanceof ClientPlayer && world) {
                         const remoteShape = new CANNON.Sphere(playerRadius); const remoteBody = new CANNON.Body({ mass: 0, shape: remoteShape, position: new CANNON.Vec3(sPD.x, bodyCenterY, sPD.z), type: CANNON.Body.KINEMATIC, material: this.playerMaterial });
                         if (!remoteBody) throw new Error(`Remote body ${id} fail.`); const rotY = sPD.rotationY || 0; remoteBody.quaternion?.setFromEuler(0, rotY, 0);
                         this.world.addBody(remoteBody); this.physicsBodies[id] = remoteBody;
                     } else { console.warn(`Skip remote physics body ${id}.`); }
                }
            } catch(bodyError) { console.error(`Body creation error for ${id}:`, bodyError); stateMachine?.transitionTo('homescreen'); UIManager?.showError("Game init fail (body).", 'homescreen'); return; }
        } // End for loop

        console.log(`[Game] Init complete. ${Object.keys(players).length} players.`);
        isPlayerGrounded = true; // Assume starts grounded
        if(stateMachine){ console.log("[Game] Transitioning state to 'playing'..."); stateMachine.transitionTo('playing'); }
        else { console.error("stateMachine missing!"); }
    }

    // --- Start Asset Loading ---
    startAssetLoading() {
        console.log("[Game] Starting asset load..."); if (loadManager) { loadManager.startLoading(); }
        else { console.error("LoadManager missing!"); stateMachine?.transitionTo('loading', {message:"Asset Manager Fail!", error: true}); }
    }

} // End Game Class

// --- Global Entry Point ---
function runGame() { console.log("--- runGame() ---"); try { const gI=new Game(); window.currentGameInstance=gI; gI.start(); window.onresize=()=>gI.handleResize(); } catch(e){console.error("!!Error creating Game:",e);document.body.innerHTML="<p>GAME INIT FAILED.</p>";}}
// --- DOM Ready Execution ---
if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',runGame);}else{runGame();}
console.log("game.js loaded (Fixed Player Material Ref, Collision Handler)");
