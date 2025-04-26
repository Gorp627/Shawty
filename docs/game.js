// docs/game.js - Main Game Orchestrator

// --- Global Flags and Data for State Synchronization ---
let networkIsInitialized = false; // Flag: Server sent initialize data
let assetsAreReady = false;       // Flag: LoadManager confirmed required assets are loaded
let initializationData = null;  // To store data from server's 'initialize' event
var currentGameInstance = null; // To hold the Game instance

class Game {
    // ... constructor ...
    constructor() { this.scene = null; this.camera = null; this.renderer = null; this.controls = null; this.clock = null; this.players = players; this.bullets = bullets; this.keys = keys; this.frameCount = 0; this.debugLogFrequency = 180; console.log("[Game] Instance created."); }

    start() {
        console.log("[Game] Starting...");
        // Only reset network flags here. Asset flag managed by LoadManager.
        networkIsInitialized = false;
        initializationData = null;
        assetsAreReady = false; // Also reset asset flag initially

        if (!this.initializeCoreComponents()) { return; }
        if (!this.initializeManagers()) { return; }

        // Bind LoadManager Listener
        console.log("[Game] Binding LoadManager listeners...");
        if (loadManager) {
            loadManager.on('ready', () => {
                console.log("[Game] LoadManager 'ready'. Assets loaded.");
                assetsAreReady = true; // Set the flag

                // Decide next step
                if (networkIsInitialized) {
                     console.log("[Game] Assets ready, Network already init. Attempting play state.");
                     window.attemptEnterPlayingState();
                 } else if (stateMachine.is('loading')) {
                     console.log("[Game] Assets ready, Network not init. Transitioning to Homescreen.");
                      if (UIManager) { stateMachine.transitionTo('homescreen', { playerCount: UIManager.playerCountSpan?.textContent ?? '?' }); }
                      else { stateMachine.transitionTo('homescreen'); }
                 } else {
                     console.log("[Game] Assets ready, Network not init, state not 'loading'. No state change needed.");
                 }
            });
            loadManager.on('error', (data) => { console.error("[Game] LoadManager 'error'."); assetsAreReady = false; if(stateMachine) stateMachine.transitionTo('loading',{message:`FATAL: Asset Error!`,error:true}); });
            console.log("[Game] LoadManager listeners attached.");
        } else { console.error("LoadManager missing!"); if(stateMachine) stateMachine.transitionTo('loading',{message:`FATAL: LoadManager Missing!`,error:true}); return; }

        this.bindOtherStateTransitions();
        if(stateMachine) stateMachine.transitionTo('loading'); else console.error("stateMachine missing!");

        // Init Network
        if(Network?.init) Network.init(); else { console.error("Network missing!"); if(stateMachine) stateMachine.transitionTo('loading',{message:`FATAL: Network Module Failed!`,error:true}); return; }

        // Start loading assets
        if(loadManager?.startLoading) loadManager.startLoading(); else { console.error("LoadManager missing!"); }

        this.addEventListeners();
        this.animate();
        console.log("[Game] Started setup.");
    }

    // --- initializeCoreComponents (No changes) ---
    initializeCoreComponents() { console.log("[Game] Init Core Components..."); try { this.scene = new THREE.Scene(); scene = this.scene; this.scene.background = new THREE.Color(0x6699cc); this.scene.fog = new THREE.Fog(0x6699cc, 0, 200); this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000); camera = this.camera; this.clock = new THREE.Clock(); clock = this.clock; const canvas = document.getElementById('gameCanvas'); if (!canvas) throw new Error("Canvas element #gameCanvas not found!"); this.renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true }); renderer = this.renderer; this.renderer.setSize(window.innerWidth, window.innerHeight); this.renderer.shadowMap.enabled = true; this.controls = new THREE.PointerLockControls(this.camera, document.body); controls = this.controls; this.controls.addEventListener('lock', ()=>{console.log('[Controls] Locked');}); this.controls.addEventListener('unlock', ()=>{console.log('[Controls] Unlocked');}); dracoLoader = new THREE.DRACOLoader(); dracoLoader.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/libs/draco/'); dracoLoader.setDecoderConfig({ type: 'js' }); dracoLoader.preload(); loader = new THREE.GLTFLoader(); loader.setDRACOLoader(dracoLoader); console.log("[Game] Loaders Initialized."); const ambL=new THREE.AmbientLight(0xffffff,0.7); scene.add(ambL); const dirL=new THREE.DirectionalLight(0xffffff,1.0); dirL.position.set(15,20,10); dirL.castShadow=true; dirL.shadow.mapSize.width=1024; dirL.shadow.mapSize.height=1024; scene.add(dirL); scene.add(dirL.target); console.log("[Game] Core Components OK."); return true; } catch(e) { console.error("!!! Core Comp Init Error:", e); if(UIManager?.showError) UIManager.showError("FATAL: Graphics Init Error!", 'loading'); else alert("FATAL: Graphics Init Error!"); return false;} }

    // --- initializeManagers (No changes) ---
    initializeManagers() { console.log("[Game] Init Managers..."); if(!UIManager||!Input||!stateMachine||!loadManager||!Network||!Effects) { console.error("!!! Mgr undefined!"); if(UIManager?.showError) UIManager.showError("FATAL: Mgr Load Error!", 'loading'); else document.body.innerHTML = "<p style='color:red;'>FATAL: MANAGER SCRIPT LOAD ERROR</p>"; return false; } try { if(!UIManager.initialize()) throw new Error("UIManager failed init"); Input.init(this.controls); Effects.initialize(this.scene); console.log("[Game] Managers Initialized."); return true; } catch (e) { console.error("!!! Mgr Init Error:", e); if(UIManager?.showError) UIManager.showError("FATAL: Game Setup Error!", 'loading'); else alert("FATAL: Game Setup Error!"); return false; } }

    // --- bindOtherStateTransitions (MODIFIED) ---
    bindOtherStateTransitions() {
        if(UIManager?.bindStateListeners) UIManager.bindStateListeners(stateMachine);
        else console.error("UIManager or bindStateListeners missing");

        stateMachine.on('transition', (data) => {
             console.log(`[Game State Listener] Transition: ${data.from} -> ${data.to}`);
             if (data.to === 'homescreen') {
                 // Reset network flag only when entering homescreen
                 networkIsInitialized = false;
                 initializationData = null;
                 // ** DO NOT RESET assetsAreReady here **
                 console.log("[Game] Reset network flags on entering homescreen.");

                 if (data.from === 'playing') { // Specific cleanup from playing
                     console.log("[Game] Cleaning up after playing state...");
                     if(Effects) Effects.removeGunViewModel();
                     bullets.forEach(b => b.remove()); bullets = [];
                     for (const id in players) { Network._removePlayer(id); } players = {}; localPlayerId = null;
                     if (controls?.isLocked) controls.unlock();
                 }

             } else if (data.to === 'playing') {
                 console.log("[Game] State transitioned to 'playing'. Attaching gun.");
                  if (Effects) {
                     const gunModelReady = !!(gunModel && gunModel !== 'error');
                     if (gunModelReady && camera && CONFIG) { Effects.attachGunViewModel(); }
                     else { console.error(`!!! Entered 'playing' but gun prerequisites not met! gun=${gunModelReady}`); }
                 } else { console.error("Effects module missing!"); }
                 if (UIManager && players[localPlayerId]) UIManager.updateHealthBar(players[localPlayerId].health);

             } else if (data.to === 'loading' && data.options?.error) {
                 console.error("Transitioned to loading state WITH ERROR:", data.options.message);
                 if (controls?.isLocked) controls.unlock();
             }
        });
        console.log("[Game] Other State Listeners Bound");
    }

    // --- addEventListeners (No changes) ---
    addEventListeners() { console.log("[Game] Add global listeners..."); if (UIManager?.joinButton && Network?.attemptJoinGame) { UIManager.joinButton.addEventListener('click', Network.attemptJoinGame); console.log("[Game] 'click' listener added to joinButton."); } else { console.error("!!! Could not add joinButton listener!"); } window.addEventListener('resize', this.handleResize.bind(this)); console.log("[Game] Global Listeners added."); }

    // --- update (No changes) ---
    update(deltaTime) { if (stateMachine.is('playing')) { try { if (updateLocalPlayer) updateLocalPlayer(deltaTime); } catch (e) { console.error("Error: updateLocalPlayer:", e); } try { if (updateRemotePlayers) updateRemotePlayers(deltaTime); } catch (e) { console.error("Error: updateRemotePlayers:", e); } try { if (updateBullets) updateBullets(deltaTime); } catch (e) { console.error("Error: updateBullets:", e); } try { if (Effects?.update) Effects.update(deltaTime); } catch (e) { console.error("Error: Effects.update:", e); } } }

    // --- animate (No changes) ---
    animate() { requestAnimationFrame(()=>this.animate()); const dT=this.clock?this.clock.getDelta():0.016; this.update(dT); if(this.renderer&&this.scene&&this.camera){try{this.renderer.render(this.scene,this.camera);}catch(e){console.error("!!! Render error:",e);}} }

    // --- handleResize (No changes) ---
    handleResize() { if(this.camera){this.camera.aspect=window.innerWidth/window.innerHeight;this.camera.updateProjectionMatrix();} if(this.renderer)this.renderer.setSize(window.innerWidth,window.innerHeight);}

    // --- startGamePlay (No changes) ---
    startGamePlay(data) { console.log('[Game] startGamePlay called.'); localPlayerId = data.id; console.log(`[Game] Local player ID set to: ${localPlayerId}`); console.log("[Game] Clearing existing players/bullets."); for(const id in players) Network._removePlayer(id); players = {}; bullets.forEach(b => b.remove()); bullets = []; let iPosX=0, iPosY=0, iPosZ=0; for (const id in data.players) { const sPD=data.players[id]; if (id===localPlayerId) { console.log(`[Game] Init local player ${sPD.name}`); players[id]={...sPD, isLocal:true, mesh:null}; iPosX=sPD.x; iPosY=sPD.y; iPosZ=sPD.z; const vY=iPosY+(CONFIG?.PLAYER_HEIGHT||1.8); if(controls?.getObject()){controls.getObject().position.set(iPosX,vY,iPosZ);controls.getObject().rotation.set(0,sPD.rotationY||0,0);}else{console.error("!!! Controls missing!");} velocityY=0; isOnGround=true; if(UIManager){UIManager.updateHealthBar(sPD.health);UIManager.updateInfo(`Playing as ${players[id].name}`);UIManager.clearError('homescreen');UIManager.clearKillMessage();}}else{Network._addPlayer(sPD);}} console.log(`[Game] Init complete. ${Object.keys(players).length} players.`); if(stateMachine){console.log("[Game] Transitioning state machine to 'playing'..."); stateMachine.transitionTo('playing');}else{console.error("!!! stateMachine missing!");} }

} // End Game Class

// --- attemptEnterPlayingState (No changes) ---
function attemptEnterPlayingState() { console.log(`[Game] attemptEnterPlayingState called. networkReady=${networkIsInitialized}, assetsReady=${assetsAreReady}`); if (networkIsInitialized && assetsAreReady && !stateMachine.is('playing')) { console.log("[Game] Both network and assets ready! Starting game play..."); if (!initializationData) { console.error("!!! CRITICAL: InitData missing!"); stateMachine?.transitionTo('homescreen'); if (UIManager) UIManager.showError("Init Error", 'homescreen'); return; } if (currentGameInstance?.startGamePlay) { currentGameInstance.startGamePlay(initializationData); } else { console.error("!!! Cannot find game instance or startGamePlay method!"); stateMachine?.transitionTo('homescreen'); if (UIManager) UIManager.showError("Startup Error", 'homescreen'); } } else { if (!networkIsInitialized) console.log("[Game] Waiting for server initialization..."); if (!assetsAreReady) console.log("[Game] Waiting for assets to load..."); if (stateMachine?.is('playing')) console.log("[Game] Already in playing state."); } }
window.attemptEnterPlayingState = attemptEnterPlayingState;

// --- runGame (No changes) ---
function runGame() { console.log("--- runGame() triggered ---"); try { const gameInstance = new Game(); window.currentGameInstance = gameInstance; gameInstance.start(); window.onresize = () => gameInstance.handleResize(); } catch (e) { console.error("!!! Error creating Game instance:", e); document.body.innerHTML = "<p style='color:red;'>GAME INIT FAILED.</p>"; } }

// --- DOM Ready (No changes) ---
if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',runGame);console.log("DOM loading, scheduling.");}else{console.log("DOM ready, running.");runGame();}
console.log("game.js loaded and executed");
