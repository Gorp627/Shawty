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
        console.log("[Game] Instance created.");
    }

    // --- Start Method ---
    start() {
        console.log("[Game] Starting...");
        networkIsInitialized = false; assetsAreReady = false; initializationData = null;
        this.mapMesh = null; this.physicsBodies = {}; this.world = null; groundBody = null; this.lastCallTime = performance.now();
        const effectiveTimeStep = typeof CONFIG !== 'undefined' ? (CONFIG.PHYSICS_TIMESTEP || 1 / 60) : 1/60;

        if (!this.initializeCoreComponents()) { return; }
        if (!this.initializeManagers()) { return; }
        if (!this.initializeNetwork()) { return; }

        this.bindLoadManagerListeners();
        this.bindOtherStateTransitions();
        this.addEventListeners();

        if(typeof stateMachine!=='undefined') stateMachine.transitionTo('loading'); else console.error("stateMachine missing!");
        this.startAssetLoading();

        this.animate(effectiveTimeStep);
        console.log("[Game] Started successfully setup.");
    }

    // --- Initialize Network (Defined Method) ---
    initializeNetwork() {
        console.log("[Game] Initializing Network Module...");
        if (typeof Network !== 'undefined' && typeof Network.init === 'function') { try { Network.init(); console.log("[Game] Network module initialized."); return true; } catch (e) { console.error("!!! Network Module Init Error:", e); stateMachine?.transitionTo('loading', { message: `FATAL: Network Module Failed! ${e.message}`, error: true }); return false; } }
        else { console.error("Network object or Network.init function missing!"); stateMachine?.transitionTo('loading', { message: `FATAL: Network Module Load Failed!`, error: true }); return false; }
    }


    // --- Setup Asset Loading ---
    bindLoadManagerListeners() {
        console.log("[Game] Binding LoadManager listeners...");
        if (typeof loadManager === 'undefined') { console.error("LoadManager missing!"); stateMachine?.transitionTo('loading',{message:"FATAL: Load Manager script missing!", error:true}); return; }

        loadManager.on('ready', () => {
            console.log("[Game] LoadManager 'ready' event received."); assetsAreReady = true;
            this.mapMesh = loadManager.getAssetData('map');
            if (!this.mapMesh) { console.error("Map asset data missing after ready!"); stateMachine?.transitionTo('loading', { message: "FATAL: Map asset data failed!", error: true }); return; }
            console.log("[Game] Visual map mesh reference stored.");
            this.attemptProceedToGame(); // Logic moved into this function
        });

        loadManager.on('error', (data) => {
            console.error("[Game] LoadManager 'error' event received.", data); assetsAreReady = false; this.mapMesh = null;
            if(typeof stateMachine!=='undefined') stateMachine.transitionTo('loading',{message:`FATAL: Asset Error!<br/>${data.message||'Check console.'}`,error:true});
        });
    }

     // --- Centralized logic to check if game can start/proceed ---
    attemptProceedToGame() {
        console.log(`[Game] attemptProceedToGame: assetsReady=${assetsAreReady}, networkInitialized=${networkIsInitialized}, initData=${!!initializationData}`);
        if (assetsAreReady && networkIsInitialized && initializationData) {
            console.log("[Game] Prerequisites met. Starting game play..."); if (currentGameInstance?.startGamePlay) { currentGameInstance.startGamePlay(initializationData); } else { console.error("Game instance missing!"); }
        } else if (assetsAreReady && stateMachine?.is('joining') && Network?.isConnected()) {
            console.log("[Game] Assets ready while joining. Sending join details..."); Network.sendJoinDetails();
        } else if (assetsAreReady && (stateMachine?.is('loading') || stateMachine?.is('uninitialized')) && !networkIsInitialized && !initializationData) {
             console.log("[Game LoadReady] Assets ready. Transitioning to HomeScreen."); let pCount = '?'; if (UIManager?.playerCountSpan) pCount = UIManager.playerCountSpan.textContent ?? '?'; stateMachine.transitionTo('homescreen', { playerCount: pCount });
        } else { console.log(`[Game] Prerequisites not yet met or invalid state. State: ${stateMachine?.currentState}`); }
    }


    // --- Initialize Core Components (Three.js + Cannon.js) ---
    initializeCoreComponents() {
        console.log("[Game] Init Core Components...");
         try { // Three.js setup...
             this.scene = new THREE.Scene(); scene = this.scene; this.scene.background = new THREE.Color(0x6699cc); this.scene.fog = new THREE.Fog(0x6699cc, 0, 200); this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000); camera = this.camera; this.clock = new THREE.Clock(); clock = this.clock; const canvas = document.getElementById('gameCanvas'); if (!canvas) throw new Error("#gameCanvas missing!"); this.renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true }); renderer = this.renderer; this.renderer.setSize(window.innerWidth, window.innerHeight); this.renderer.shadowMap.enabled = true; this.controls = new THREE.PointerLockControls(this.camera, document.body); controls = this.controls; this.controls.addEventListener('lock', ()=>{console.log('[Controls] Locked');}); this.controls.addEventListener('unlock', ()=>{console.log('[Controls] Unlocked');}); dracoLoader = new THREE.DRACOLoader(); dracoLoader.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/libs/draco/'); dracoLoader.setDecoderConfig({ type: 'js' }); dracoLoader.preload(); loader = new THREE.GLTFLoader(); loader.setDRACOLoader(dracoLoader); const ambL = new THREE.AmbientLight(0xffffff, 0.7); this.scene.add(ambL); const dirL = new THREE.DirectionalLight(0xffffff, 1.0); dirL.position.set(15, 20, 10); dirL.castShadow = true; dirL.shadow.mapSize.width=1024; dirL.shadow.mapSize.height=1024; this.scene.add(dirL); this.scene.add(dirL.target); console.log("[Game] Three.js Components OK.");
             // Cannon.js Setup...
             if (typeof CANNON === 'undefined') throw new Error("Cannon lib not loaded!"); this.world = new CANNON.World(); world = this.world; this.world.gravity.set(0, CONFIG?.GRAVITY ?? -9.82, 0); this.world.broadphase = new CANNON.NaiveBroadphase();
             // Create Materials
             const groundMaterial = new CANNON.Material("groundMaterial"); const playerMaterial = new CANNON.Material("playerMaterial");
             // Define Contact Materials
             const groundPlayerContact = new CANNON.ContactMaterial(groundMaterial, playerMaterial, { friction: 0.1, restitution: 0.1 });
             this.world.addContactMaterial(groundPlayerContact);
             // Player <-> Player Contact
             const playerPlayerContact = new CANNON.ContactMaterial(playerMaterial, playerMaterial, { friction: 0.5, restitution: 0.2 });
             this.world.addContactMaterial(playerPlayerContact); console.log("[Game] Defined physics materials and contacts.");
             // Create Ground Body
             const groundShape = new CANNON.Plane(); groundBody = new CANNON.Body({ mass: 0, shape: groundShape, material: groundMaterial }); groundBody.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2); groundBody.position.set(0, 0, 0); this.world.addBody(groundBody);
             console.log("[Game] Cannon.js World and Ground OK."); return true;

         } catch(e) { console.error("!!! Core Comp Init Error:", e); UIManager?.showError(`FATAL Init Error! ${e.message}`, 'loading'); return false; }
    }

    // --- Initialize Other Managers ---
    initializeManagers() {
        console.log("[Game] Init Managers...");
         if(typeof UIManager === 'undefined' || typeof Input === 'undefined' || typeof stateMachine === 'undefined' || typeof loadManager === 'undefined' || typeof Network === 'undefined' || typeof Effects === 'undefined') { console.error("Mgr undefined!"); UIManager?.showError("FATAL: Mgr Load Error!", 'loading'); return false; }
         try { if(!UIManager.initialize()) throw new Error("UI failed init"); Input.init(this.controls); Effects.initialize(this.scene); console.log("[Game] Managers Initialized."); return true;
         } catch (e) { console.error("!!! Mgr Init Error:", e); UIManager?.showError(`FATAL: Mgr Setup Error! ${e.message}`, 'loading'); return false; }
    }

    // --- Bind State Transitions ---
    bindOtherStateTransitions() {
        if(UIManager?.bindStateListeners) UIManager.bindStateListeners(stateMachine); else console.error("UIManager missing binding");
        if (stateMachine) {
            stateMachine.on('transition', (data) => {
                 console.log(`[Game Listener] Transition EVENT: ${data.from} -> ${data.to}`); // Log the actual event firing
                 if (data.to === 'homescreen') {
                     networkIsInitialized = false; initializationData = null; console.log("Reset flags for homescreen.");
                     if (data.from === 'playing' || data.from === 'joining') {
                         console.log(`Cleanup after ${data.from}...`); for(const id in this.physicsBodies) { if (this.world && this.physicsBodies[id]) { this.world.removeBody(this.physicsBodies[id]); } } this.physicsBodies = {};
                         for(const id in players){ if(id !== localPlayerId && Network?._removePlayer){ Network._removePlayer(id); } } if(players && players[localPlayerId]) { delete players[localPlayerId]; } players = {}; localPlayerId = null; if(controls?.isLocked) controls.unlock(); console.log("Player/physics cleared.");
                     }
                 } else if (data.to === 'playing') {
                    console.log("[Game State Listener] Entered 'playing' state"); if (UIManager && localPlayerId && players[localPlayerId]) UIManager.updateHealthBar(players[localPlayerId].health); if (UIManager && players[localPlayerId]?.name) UIManager.updateInfo(`Playing as ${players[localPlayerId].name}`);
                 } else if (data.to === 'loading' && data.options?.error) {
                    console.error("Loading error state:", data.options.message); if(controls?.isLocked)controls.unlock(); networkIsInitialized = false; assetsAreReady = false; initializationData = null; this.mapMesh = null; this.physicsBodies = {}; players={}; localPlayerId = null;
                }
            });
        } else { console.error("stateMachine missing for transitions!"); }
        console.log("[Game] Other State Listeners Bound");
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

        if(stateMachine?.is('playing')){ // Only run game logic and sync if playing
             try{ const localPlayerBody = localPlayerId ? this.physicsBodies[localPlayerId] : null; if (updateLocalPlayer) updateLocalPlayer(dt, localPlayerBody); } catch(e){console.error("Err updateLP:",e);}
             try{ if(Effects?.update) Effects.update(dt); } catch(e){console.error("Err Effects.update:",e);} // Update effects

             // Sync Visuals AFTER physics step...
             const localBody = localPlayerId ? this.physicsBodies[localPlayerId] : null;
             // Sync Local Controls
             if (localBody && controls?.getObject()) { controls.getObject().position.copy(localBody.position); controls.getObject().position.y += (CONFIG?.CAMERA_Y_OFFSET ?? 1.6); }
             // Sync Remote Meshes
             for (const id in players) { if (id !== localPlayerId && players[id] instanceof ClientPlayer && players[id].mesh) { const remoteBody = this.physicsBodies[id]; if (remoteBody) { players[id].mesh.position.copy(remoteBody.position); players[id].mesh.quaternion.copy(remoteBody.quaternion); const h = CONFIG?.PLAYER_HEIGHT||1.8; if (!(players[id].mesh.geometry instanceof THREE.CylinderGeometry)) { players[id].mesh.position.y -= h/2;}}}}
        }
        // Always Render
        if (renderer && scene && camera) { try { renderer.render(scene, camera); } catch (e) { console.error("Render error:", e); } }
    }


    // --- Resize Handler ---
    handleResize() { if (camera) { camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); } if (renderer) { renderer.setSize(window.innerWidth, window.innerHeight); } }

    // --- Ground Contact Handler ---
    handlePlayerGroundContact(event) {
        // Check if the collision involves the local player's body and the global ground body
        // Check both bodyA and bodyB as order isn't guaranteed
        const localBody = this.physicsBodies[localPlayerId];
        if (!localBody) return; // Cannot check ground contact if local body doesn't exist

        let otherBody = null;
        if (event.bodyA.id === localBody.id) {
            otherBody = event.bodyB;
        } else if (event.bodyB.id === localBody.id) {
            otherBody = event.bodyA;
        }

        if (otherBody === groundBody) { // Compare with the global groundBody reference
            isPlayerGrounded = true; // Set the global flag
            // console.log("Ground contact detected!"); // Frequent log, uncomment if needed
        }
    }


    // --- Start Game Play Method ---
    startGamePlay(initData) {
        console.log('[Game] startGamePlay called.');
        if (!initData || !initData.id || !this.world) { console.error("Invalid initData/world"); stateMachine?.transitionTo('homescreen'); UIManager?.showError("Game init failed.", 'homescreen'); return; }
        if (stateMachine?.is('playing')) { console.warn("Already playing"); return; }

        localPlayerId = initData.id; console.log(`[Game] Local ID: ${localPlayerId}`);
        console.log("[Game] Clearing previous state...");
        for (const id in this.physicsBodies) { if (this.world && this.physicsBodies[id]) this.world.removeBody(this.physicsBodies[id]); } this.physicsBodies = {};
        for (const id in players) { if (Network?._removePlayer) Network._removePlayer(id); } players = {};

        const playerMaterial = this.world.materials.find(m => m.name === "playerMaterial"); if (!playerMaterial) console.error("Player material missing!");

        // Process players
        for(const id in initData.players){
            const sPD = initData.players[id];
            if (sPD.x === undefined || sPD.y === undefined || sPD.z === undefined) { console.warn(`Invalid pos data for ${id}`); continue; }
            const playerHeight = CONFIG?.PLAYER_HEIGHT||1.8; const playerRadius = CONFIG?.PLAYER_RADIUS||0.4; const bodyCenterY = sPD.y + playerHeight / 2.0;

            try { // Try creating each body
                if(id === localPlayerId){ // --- LOCAL ---
                    console.log(`[Game] Init local player: ${sPD.name}`); players[id] = { ...sPD, isLocal: true, mesh: null };

                    const playerShape = new CANNON.Sphere(playerRadius);
                    const playerBody = new CANNON.Body({ mass: CONFIG?.PLAYER_MASS||70, position: new CANNON.Vec3(sPD.x, bodyCenterY, sPD.z), shape: playerShape, material: playerMaterial, linearDamping: 0.5, angularDamping: 0.9 });
                    if (!playerBody) throw new Error("Local body creation failed."); if (playerBody.angularFactor) playerBody.angularFactor.set(0,1,0);
                    // Add Collision Listener
                    playerBody.addEventListener('collide', this.handlePlayerGroundContact.bind(this)); // Add listener HERE
                    this.world.addBody(playerBody); this.physicsBodies[id] = playerBody; console.log(`Created local body y=${bodyCenterY.toFixed(2)}`);

                    if(controls?.getObject() && playerBody.position){ controls.getObject().position.copy(playerBody.position); controls.getObject().position.y += (CONFIG?.CAMERA_Y_OFFSET ?? 1.6); }
                    if(UIManager){ UIManager.updateHealthBar(sPD.health ?? 100); UIManager.updateInfo(`Playing as ${players[id].name}`); UIManager.clearError('homescreen'); UIManager.clearKillMessage(); }

                } else { // --- REMOTE ---
                     if(Network?._addPlayer) Network._addPlayer(sPD); const remotePlayer = players[id];
                     if (remotePlayer instanceof ClientPlayer && world) {
                         const remoteShape = new CANNON.Sphere(playerRadius); const remoteBody = new CANNON.Body({ mass: 0, shape: remoteShape, position: new CANNON.Vec3(sPD.x, bodyCenterY, sPD.z), type: CANNON.Body.KINEMATIC, material: playerMaterial });
                         if (!remoteBody) throw new Error(`Remote body ${id} creation failed.`); const initialRotationY = sPD.rotationY || 0; if (remoteBody.quaternion) remoteBody.quaternion.setFromEuler(0, initialRotationY, 0);
                         this.world.addBody(remoteBody); this.physicsBodies[id] = remoteBody;
                     } else { console.warn(`Skipping remote physics body ${id}.`); }
                } // End if local/remote
            } catch(bodyError) { console.error(`Body creation error for ${id}:`, bodyError); stateMachine?.transitionTo('homescreen'); UIManager?.showError("Game init failed (bodies).", 'homescreen'); return; }
        } // End for loop

        console.log(`[Game] Init complete. ${Object.keys(players).length} players.`);
        isPlayerGrounded = true; // Assume player starts grounded
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
if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',runGame);}else{runGame();}
console.log("game.js loaded (Cannon-es, Complete)");
