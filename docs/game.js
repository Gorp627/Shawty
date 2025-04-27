// docs/game.js - Main Game Orchestrator (Manual Physics + Spawn Retries)

// --- Global Flags and Data ---
let networkIsInitialized = false; let assetsAreReady = false; let initializationData = null;
var currentGameInstance = null;

class Game {
    // --- Constructor ---
    constructor() {
        this.scene = null; this.camera = null; this.renderer = null; this.controls = null; this.clock = null;
        this.players = players; this.keys = keys; this.mapMesh = null;
        this.lastCallTime = performance.now();
        console.log("[Game] Instance created.");
    }

    // --- Start Method ---
    start() {
        console.log("[Game] Starting..."); networkIsInitialized = false; assetsAreReady = false; initializationData = null; this.mapMesh = null; this.lastCallTime = performance.now();

        if (!this.initializeCoreComponents()) { return; }
        if (!this.initializeManagers()) { return; }
        if (!this.initializeNetwork()) { return; }
        this.bindLoadManagerListeners(); this.bindOtherStateTransitions(); this.addEventListeners();
        if(stateMachine) stateMachine.transitionTo('loading'); else console.error("stateMachine missing!");
        this.startAssetLoading();
        this.animate(); console.log("[Game] Started successfully setup.");
    }

    // --- Initialize Core Components (Three.js ONLY) ---
    initializeCoreComponents() {
         console.log("[Game] Init Core Components (Three.js)..."); try {
             this.scene = new THREE.Scene(); scene = this.scene; this.scene.background = new THREE.Color(0x6699cc); this.scene.fog = new THREE.Fog(0x6699cc, 0, 200); this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000); camera = this.camera; this.clock = new THREE.Clock(); clock = this.clock; const canvas = document.getElementById('gameCanvas'); if (!canvas) throw new Error("#gameCanvas missing!"); this.renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true }); renderer = this.renderer; this.renderer.setSize(window.innerWidth, window.innerHeight); this.renderer.shadowMap.enabled = true; this.controls = new THREE.PointerLockControls(this.camera, document.body); controls = this.controls; this.controls.addEventListener('lock', ()=>{console.log('[Controls] Locked');}); this.controls.addEventListener('unlock', ()=>{console.log('[Controls] Unlocked');}); dracoLoader = new THREE.DRACOLoader(); dracoLoader.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/libs/draco/'); dracoLoader.setDecoderConfig({ type: 'js' }); dracoLoader.preload(); loader = new THREE.GLTFLoader(); loader.setDRACOLoader(dracoLoader); const ambL = new THREE.AmbientLight(0xffffff, 0.7); this.scene.add(ambL); const dirL = new THREE.DirectionalLight(0xffffff, 1.0); dirL.position.set(15, 20, 10); dirL.castShadow = true; dirL.shadow.mapSize.width=1024; dirL.shadow.mapSize.height=1024; this.scene.add(dirL); this.scene.add(dirL.target); console.log("[Game] Core Components OK."); return true;
         } catch(e) { console.error("!!! Core Init Error:", e); UIManager?.showError(`FATAL: Graphics Init! ${e.message}`, 'loading'); return false; }
    }

    // --- Initialize Network ---
    initializeNetwork() { console.log("Init Network..."); if (Network?.init) { try { Network.init(); console.log("Net init ok."); return true; } catch (e) { console.error("Net Init Err:", e); stateMachine?.transitionTo('loading', { message: `Net Fail! ${e.message}`, error: true }); return false; } } else { console.error("Network missing!"); stateMachine?.transitionTo('loading', { message: `Net Load Fail!`, error: true }); return false; } }

    // --- Setup Asset Loading ---
    bindLoadManagerListeners() { if (!loadManager) { console.error("LoadMgr missing!"); stateMachine?.transitionTo('loading',{message:"Load Mgr Fail!", error:true}); return; } loadManager.on('ready', () => { console.log("LoadMgr 'ready'."); assetsAreReady = true; this.mapMesh = loadManager.getAssetData('map'); if (!this.mapMesh) { console.error("Map data missing!"); stateMachine?.transitionTo('loading', { message: "Map Data Fail!", error: true }); return; } console.log("Map mesh stored."); this.attemptProceedToGame(); }); loadManager.on('error', (data) => { console.error("LoadMgr error:", data); assetsAreReady = false; this.mapMesh = null; stateMachine?.transitionTo('loading',{message:`Asset Err!<br/>${data.message||''}`,error:true}); }); console.log("LoadMgr listeners bound."); }

     // --- Check if ready ---
    attemptProceedToGame() { console.log(`Check Proceed: Assets=${assetsAreReady}, NetInit=${networkIsInitialized}, Data=${!!initializationData}`); if (assetsAreReady && networkIsInitialized && initializationData) { console.log("All Ready -> startGamePlay"); if (currentGameInstance?.startGamePlay) { currentGameInstance.startGamePlay(initializationData); } else { console.error("Game instance missing!"); } } else if (assetsAreReady && stateMachine?.is('loading')) { console.log("Assets Ready -> Homescreen"); let pC = '?'; if (UIManager?.playerCountSpan) pC=UIManager.playerCountSpan.textContent??'?'; stateMachine.transitionTo('homescreen', { playerCount: pC }); } else { console.log(`Not ready state: ${stateMachine?.currentState}`); } }

    // --- Initialize Managers ---
    initializeManagers() { console.log("Init Mgrs..."); if(!UIManager||!Input||!stateMachine||!loadManager||!Network||!Effects) { console.error("Mgr undef!"); UIManager?.showError("FATAL: Mgr Load!", 'loading'); return false; } try { if(!UIManager.initialize()) throw new Error("UI fail"); Input.init(this.controls); Effects.initialize(this.scene); console.log("Mgr Initialized."); return true; } catch (e) { console.error("Mgr Init Err:", e); UIManager?.showError(`FATAL: Mgr Setup! ${e.message}`, 'loading'); return false; } }

    // --- Bind State Transitions ---
    bindOtherStateTransitions() { if(UIManager?.bindStateListeners) UIManager.bindStateListeners(stateMachine); else console.error("UI binding missing"); if (stateMachine) { stateMachine.on('transition', (data) => { console.log(`Listener State: ${data.from}->${data.to}`); if(data.to==='homescreen'){ networkIsInitialized=false; initializationData=null; if(data.from==='playing'||data.from==='joining'){ console.log(`Cleanup after ${data.from}...`); for(const id in players){if(id!==localPlayerId&&Network?._removePlayer){Network._removePlayer(id);}} if(players?.[localPlayerId]){delete players[localPlayerId];} players={}; localPlayerId=null; if(controls?.isLocked) controls.unlock(); console.log("State cleared.");}} else if(data.to==='playing'){if(UIManager&&localPlayerId&&players?.[localPlayerId]){UIManager.updateHealthBar(players[localPlayerId].health); UIManager.updateInfo(`Playing as ${players[localPlayerId].name}`);}} else if(data.to==='loading'&&data.options?.error){ console.error("Loading error:", data.options.message); if(controls?.isLocked)controls.unlock(); networkIsInitialized=false; assetsAreReady=false; initializationData=null; this.mapMesh=null; players={}; localPlayerId=null; }}); } else { console.error("stateMachine missing!"); } console.log("State Listeners Bound"); }

    // --- Add Event Listeners ---
    addEventListeners() { console.log("Add listeners..."); if(UIManager?.joinButton && Network?.attemptJoinGame){ UIManager.joinButton.addEventListener('click', ()=>{ if (!assetsAreReady) { UIManager.showError("Assets loading...", 'homescreen'); return; } Network.attemptJoinGame(); }); console.log("Join listener.");} else { console.error("Cannot add join listener!"); } window.addEventListener('resize', this.handleResize.bind(this)); console.log("Global listeners."); }

    // --- Main Update/Animate Loop ---
     animate() { requestAnimationFrame(() => this.animate()); const dt = this.clock ? this.clock.getDelta() : 0.016;
         if(stateMachine?.is('playing')){ try{ if(updateLocalPlayer) updateLocalPlayer(dt, this.mapMesh); /* Pass mapMesh */ } catch(e){console.error("Err updateLP:",e);} try{ if(updateRemotePlayers) updateRemotePlayers(dt); } catch(e){console.error("Err updateRP:",e);} try{ if(Effects?.update) Effects.update(dt); } catch(e){console.error("Err Effects:",e);} }
         if (renderer && scene && camera) { try { renderer.render(scene, camera); } catch (e) { console.error("Render error:", e); } } }


    // --- Resize Handler ---
    handleResize() { if (camera) { camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); } if (renderer) { renderer.setSize(window.innerWidth, window.innerHeight); } }

    // --- Start Game Play Method ---
    startGamePlay(initData) {
        console.log('[Game] startGamePlay called.');
        if (!initData?.id) { console.error("Invalid initData"); stateMachine?.transitionTo('homescreen'); UIManager?.showError("Init fail (data).", 'homescreen'); return; }
        if (stateMachine?.is('playing')) { console.warn("Already playing"); return; }
        if (!this.mapMesh) { console.error("MapMesh missing for spawn!"); stateMachine?.transitionTo('homescreen'); UIManager?.showError("Init fail (map).", 'homescreen'); return;}

        localPlayerId = initData.id; console.log(`Local ID: ${localPlayerId}`);
        console.log("Clearing previous state...");
        for (const id in players) { if (Network?._removePlayer) Network._removePlayer(id); } players = {};

        // Process players (local player needs procedural spawn)
        for(const id in initData.players){
            const sPD = initData.players[id];
            if(id === localPlayerId){ // --- LOCAL PLAYER ---
                console.log(`Init local: ${sPD.name}`);

                let currentSpawnX = sPD.x; // Start with server suggestion
                let currentSpawnZ = sPD.z;
                let foundGroundY = 0;    // Default ground level if all raycasts fail
                let foundGround = false; // Flag to check if we succeeded
                let attempts = 0;
                const maxSpawnAttempts = 10; // Try up to 10 times to find ground
                const spawnCheckHeight = 150.0; // Start ray high above
                const spawnRayDir = new THREE.Vector3(0, -1, 0);
                if (!raycaster) raycaster = new THREE.Raycaster(); // Ensure raycaster exists

                console.log(`Attempting spawn raycast at server coords: X=${currentSpawnX.toFixed(1)}, Z=${currentSpawnZ.toFixed(1)}`);

                // --- Procedural Spawn Height via Raycast w/ Retries ---
                while (!foundGround && attempts < maxSpawnAttempts) {
                    attempts++;
                    const spawnRayOrigin = new THREE.Vector3(currentSpawnX, spawnCheckHeight, currentSpawnZ);
                    raycaster.set(spawnRayOrigin, spawnRayDir);
                    raycaster.far = spawnCheckHeight + 100; // Look far down

                    const intersects = raycaster.intersectObject(this.mapMesh, true); // Use instance mapMesh

                    if (intersects.length > 0) {
                        foundGroundY = intersects[0].point.y; // Found ground!
                        foundGround = true;
                        console.log(`Spawn ray ${attempts} HIT! Using Ground Y: ${foundGroundY.toFixed(2)} at X:${currentSpawnX.toFixed(1)}, Z:${currentSpawnZ.toFixed(1)}`);
                        // Keep currentSpawnX and currentSpawnZ as they are valid
                    } else {
                        console.warn(`Spawn ray ${attempts} MISSED at X:${currentSpawnX.toFixed(1)}, Z:${currentSpawnZ.toFixed(1)}.`);
                        if (attempts < maxSpawnAttempts) {
                             // Try new random coordinates within general bounds
                             const boundX = CONFIG?.MAP_BOUNDS_X || 50;
                             const boundZ = CONFIG?.MAP_BOUNDS_Z || 50;
                             // Generate random point within a slightly smaller area than map bounds (e.g. 90%)
                             currentSpawnX = Math.random() * (boundX * 1.8) - (boundX * 0.9);
                             currentSpawnZ = Math.random() * (boundZ * 1.8) - (boundZ * 0.9);
                             console.log(`Retrying spawn raycast at new random coords: X=${currentSpawnX.toFixed(1)}, Z=${currentSpawnZ.toFixed(1)}`);
                        } else {
                             console.error(`Max spawn attempts reached! Defaulting to Y=0 at last attempted XZ (${currentSpawnX.toFixed(1)}, ${currentSpawnZ.toFixed(1)}).`);
                             foundGroundY = 0; // Ultimate fallback Y
                             // Keep the last attempted XZ as the final spawn location
                        }
                    }
                } // End while attempts
                // --- End Spawn Height Calculation ---

                // Store final position (potentially adjusted XZ) in local cache
                players[id] = { ...sPD, x: currentSpawnX, y: foundGroundY, z: currentSpawnZ, isLocal: true, mesh: null };

                const cameraHeight = CONFIG?.CAMERA_Y_OFFSET || 1.6;
                const spawnBuffer = 0.1; // Add small buffer to ensure starting above ground
                const finalVisualY = foundGroundY + cameraHeight + spawnBuffer; // Position camera relative to FOUND ground Y + buffer

                if(controls?.getObject()){
                    controls.getObject().position.set(currentSpawnX, finalVisualY, currentSpawnZ); // Use final X, calculated Y, final Z
                    controls.getObject().rotation.set(0, sPD.rotationY || 0, 0);
                    console.log(`Set FINAL controls pos(${currentSpawnX.toFixed(1)}, ${finalVisualY.toFixed(1)}, ${currentSpawnZ.toFixed(1)})`);
                }

                velocityY = 0; isOnGround = true; // Reset manual physics state AFTER positioning
                console.log("Reset initial physics state.");

                if(UIManager){ UIManager.updateHealthBar(sPD.health ?? 100); UIManager.updateInfo(`Playing as ${players[id].name}`); UIManager.clearError('homescreen'); UIManager.clearKillMessage(); }

            } else { // --- REMOTE PLAYER --- Use server coords directly for setup
                 if(Network?._addPlayer) Network._addPlayer(sPD); // Creates ClientPlayer + visual mesh
            }
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
console.log("game.js loaded (Retry Spawn Raycast)");
