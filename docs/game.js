// docs/game.js - Main Game Orchestrator

// --- Global Flags and Data for State Synchronization ---
let networkIsInitialized = false; // Flag: Server sent initialize data
let assetsAreReady = false;       // Flag: LoadManager confirmed required assets are loaded via 'ready' event
let initializationData = null;  // To store data from server's 'initialize' event
var currentGameInstance = null; // To hold the Game instance

class Game {
    // --- Constructor (MODIFIED) ---
    constructor() {
        this.scene = null; this.camera = null; this.renderer = null; this.controls = null; this.clock = null;
        this.players = players; // Use global players object
        // this.bullets = bullets; // REMOVED: Bullets array no longer exists globally
        this.keys = keys;       // Use global keys object
        console.log("[Game] Instance created.");
    }

    // --- Start Method ---
    start() {
        console.log("[Game] Starting...");
        // Reset flags
        networkIsInitialized = false;
        assetsAreReady = false; // Reset asset flag initially, LoadManager 'ready' event sets it true
        initializationData = null;

        if (!this.initializeCoreComponents()) { return; }
        if (!this.initializeManagers()) { return; }

        // Bind LoadManager Listener
        console.log("[Game] Binding LoadManager listeners...");
        if (typeof loadManager !== 'undefined') {
            loadManager.on('ready', () => {
                console.log("[Game] LoadManager 'ready' event received. All required assets loaded successfully.");
                assetsAreReady = true; // Set the flag: assets are confirmed ready by LM

                // Assets are ready. Decide next step based on network status and current state.
                if (networkIsInitialized) {
                     // Network was already initialized before assets finished. Try entering play state.
                     console.log("[Game] Assets ready, Network was already initialized. Attempting to enter playing state.");
                     window.attemptEnterPlayingState();
                 } else if (stateMachine.is('loading')) {
                     // Assets ready, network not ready, and we are in loading state. Go to homescreen.
                     console.log("[Game] Assets ready, Network not initialized. Transitioning to Homescreen.");
                      if (typeof UIManager !== 'undefined') {
                         stateMachine.transitionTo('homescreen', { playerCount: UIManager.playerCountSpan?.textContent ?? '?' });
                     } else {
                         stateMachine.transitionTo('homescreen');
                     }
                 } else {
                     // Assets ready, network not ready, but not in loading state (e.g., already on homescreen). Do nothing here.
                     console.log("[Game] Assets ready, Network not initialized, state is not 'loading'. No state change needed from here.");
                 }
            });
            // Listener for LoadManager errors
            loadManager.on('error', (data) => {
                console.error("[Game] LoadManager 'error' event received.");
                assetsAreReady = false; // Ensure flag is false on error
                if(typeof stateMachine!=='undefined') stateMachine.transitionTo('loading',{message:`FATAL: Asset Error!<br/>${data.message||'Check console.'}`,error:true});
            });
            console.log("[Game] LoadManager listeners attached.");
        } else {
            console.error("LoadManager missing!");
             if(typeof stateMachine!=='undefined') stateMachine.transitionTo('loading',{message:`FATAL: LoadManager Missing!`,error:true});
            return; // Cannot proceed without LoadManager
        }

        this.bindOtherStateTransitions();
        if(typeof stateMachine!=='undefined') stateMachine.transitionTo('loading'); else console.error("stateMachine missing!");

        // Initialize Network
        console.log("[Game] Initializing Network...");
        if(typeof Network!=='undefined' && typeof Network.init==='function') {
            Network.init(); // Network.init calls setupSocketIO which connects
        } else {
            console.error("Network missing or invalid!");
            if(typeof stateMachine!=='undefined') stateMachine.transitionTo('loading',{message:`FATAL: Network Module Failed!`,error:true});
            return; // Cannot proceed without Network
        }

        // Start loading assets
        console.log("[Game] Starting asset load via LoadManager...");
        if(typeof loadManager!=='undefined') {
            loadManager.startLoading();
        } else {
             console.error("LoadManager missing - cannot start loading!");
        }


        this.addEventListeners();
        this.animate();
        console.log("[Game] Started successfully setup.");
    }

    // --- Initialize Core Components ---
    initializeCoreComponents() {
         console.log("[Game] Init Core Components...");
         try {
             this.scene = new THREE.Scene(); scene = this.scene; this.scene.background = new THREE.Color(0x6699cc); this.scene.fog = new THREE.Fog(0x6699cc, 0, 200);
             this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000); camera = this.camera;
             this.clock = new THREE.Clock(); clock = this.clock; const canvas = document.getElementById('gameCanvas'); if (!canvas) throw new Error("#gameCanvas missing!"); this.renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true }); renderer = this.renderer; this.renderer.setSize(window.innerWidth, window.innerHeight); this.renderer.shadowMap.enabled = true;
             this.controls = new THREE.PointerLockControls(this.camera, document.body); controls = this.controls; this.controls.addEventListener('lock', ()=>{console.log('[Controls] Locked');}); this.controls.addEventListener('unlock', ()=>{console.log('[Controls] Unlocked');});
             dracoLoader = new THREE.DRACOLoader(); dracoLoader.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/libs/draco/'); dracoLoader.setDecoderConfig({ type: 'js' }); dracoLoader.preload(); loader = new THREE.GLTFLoader(); loader.setDRACOLoader(dracoLoader); console.log("[Game] Loaders Initialized."); const ambL=new THREE.AmbientLight(0xffffff,0.7); scene.add(ambL); const dirL=new THREE.DirectionalLight(0xffffff,1.0); dirL.position.set(15,20,10); dirL.castShadow=true; dirL.shadow.mapSize.width=1024; dirL.shadow.mapSize.height=1024; scene.add(dirL); scene.add(dirL.target); console.log("[Game] Core Components OK."); return true;
         } catch(e) { console.error("!!! Core Comp Init Error:", e); if(UIManager?.showError) UIManager.showError("FATAL: Graphics Init Error!", 'loading'); else alert("FATAL: Graphics Init Error!"); return false;}
    }

    // --- Initialize Managers ---
    initializeManagers() {
         console.log("[Game] Init Managers...");
         if(!UIManager||!Input||!stateMachine||!loadManager||!Network||!Effects) { console.error("!!! Mgr undefined!"); if(UIManager?.showError) UIManager.showError("FATAL: Mgr Load Error!", 'loading'); else document.body.innerHTML = "<p>FATAL: MANAGER SCRIPT LOAD ERROR</p>"; return false; } try { if(!UIManager.initialize()) throw new Error("UIManager failed init"); Input.init(this.controls); Effects.initialize(this.scene); console.log("[Game] Managers Initialized."); return true; } catch (e) { console.error("!!! Mgr Init Error:", e); if(UIManager?.showError) UIManager.showError("FATAL: Game Setup Error!", 'loading'); else alert("FATAL: Game Setup Error!"); return false; }
    }

    // --- Bind State Transitions (MODIFIED) ---
    bindOtherStateTransitions() {
        if(UIManager?.bindStateListeners) UIManager.bindStateListeners(stateMachine);
        else console.error("UIManager missing");

        stateMachine.on('transition', (data) => {
             console.log(`[Game State Listener] Transition: ${data.from} -> ${data.to}`);
             if (data.to === 'homescreen') {
                 networkIsInitialized = false; initializationData = null; console.log("[Game] Reset network flags.");
                 if (data.from === 'playing') { console.log("[Game] Cleanup after playing..."); if(Effects)Effects.removeGunViewModel?.(); /* No bullets to clear */ for(const id in players){if(id !== localPlayerId && Network._removePlayer)Network._removePlayer(id);} players[localPlayerId]=null; delete players[localPlayerId]; localPlayerId=null; if(controls?.isLocked)controls.unlock(); }
             } else if (data.to === 'playing') {
                 console.log("[Game] >>> Entering 'playing' state listener."); // Simplified log
                 console.log("[Game] State transitioned to 'playing'.");
                 // No gun attachment needed now
                 if (UIManager && localPlayerId && players[localPlayerId]) UIManager.updateHealthBar(players[localPlayerId].health);
             } else if (data.to === 'loading' && data.options?.error) { console.error("Loading error:", data.options.message); if(controls?.isLocked)controls.unlock(); networkIsInitialized = false; assetsAreReady = false; initializationData = null;}
        });
        console.log("[Game] Other State Listeners Bound");
    }

    // --- Add Event Listeners ---
    addEventListeners() { console.log("[Game] Add global listeners..."); if (UIManager?.joinButton&&Network?.attemptJoinGame){UIManager.joinButton.addEventListener('click',Network.attemptJoinGame);console.log("[Game] Join listener added.");} else {console.error("Cannot add join listener!");}window.addEventListener('resize',this.handleResize.bind(this));console.log("[Game] Global Listeners added.");}

    // --- Update Loop (MODIFIED) ---
    update(dt) {
        if(stateMachine.is('playing')){
            try{ if(updateLocalPlayer) updateLocalPlayer(dt); } catch(e){console.error("Err updateLP:",e);}
            try{ if(updateRemotePlayers) updateRemotePlayers(dt); } catch(e){console.error("Err updateRP:",e);}
            // try{ if(updateBullets) updateBullets(dt); } catch(e){console.error("Err updateB:",e);} // REMOVED call to updateBullets
            // Try updating simplified Effects (might just handle recoil recovery now)
            try{ if(Effects?.updateViewModel) Effects.updateViewModel(dt); } catch(e){console.error("Err Effects.update:",e);}
        }
    }

    // --- Animate Loop ---
    animate() { requestAnimationFrame(()=>this.animate()); const dT=this.clock?this.clock.getDelta():0.016; this.update(dT); if(this.renderer&&this.scene&&this.camera){try{this.renderer.render(this.scene,this.camera);}catch(e){console.error("Render err:",e);}} }

    // --- Resize Handler ---
    handleResize() { if(this.camera){this.camera.aspect=window.innerWidth/window.innerHeight;this.camera.updateProjectionMatrix();} if(this.renderer)this.renderer.setSize(window.innerWidth,window.innerHeight);}

    // --- Start Game Play Method (MODIFIED) ---
    startGamePlay(data) {
        console.log('[Game] startGamePlay called.');
        localPlayerId = data.id; console.log(`[Game] Local ID: ${localPlayerId}`);
        console.log("[Game] Clearing state."); for(const id in players)Network._removePlayer(id); players={}; /* bullets=[] REMOVED */ let iPosX=0,iPosY=0,iPosZ=0;
        for(const id in data.players){ const sPD=data.players[id]; if(id===localPlayerId){console.log(`[Game] Init local ${sPD.name}`); players[id]={...sPD,isLocal:true,mesh:null}; iPosX=sPD.x; iPosY=sPD.y; iPosZ=sPD.z; const vY=iPosY+(CONFIG?.PLAYER_HEIGHT||1.8); if(controls?.getObject()){controls.getObject().position.set(iPosX,vY,iPosZ);controls.getObject().rotation.set(0,sPD.rotationY||0,0);console.log(`[Game] Set controls pos/rot.`);} velocityY=0; isOnGround=true; if(UIManager){UIManager.updateHealthBar(sPD.health);UIManager.updateInfo(`Playing as ${players[id].name}`);UIManager.clearError('homescreen');UIManager.clearKillMessage();}}else{if(Network._addPlayer)Network._addPlayer(sPD);}}
        console.log(`[Game] Init complete. ${Object.keys(players).length} players.`);
        if(stateMachine){console.log("[Game] Transitioning state to 'playing'..."); stateMachine.transitionTo('playing');}else{console.error("stateMachine missing!");}
    }

} // End Game Class

// --- Global Function: attemptEnterPlayingState ---
function attemptEnterPlayingState() {
    console.log(`[Game] attemptEnterPlayingState called. networkReady=${networkIsInitialized}, assetsReady=${assetsAreReady}`);
    if (networkIsInitialized && assetsAreReady && !stateMachine.is('playing')) {
        console.log("[Game] Both ready! Starting game play...");
        if (!initializationData) { console.error("InitData missing!"); stateMachine?.transitionTo('homescreen'); if(UIManager)UIManager.showError("Init Error",'homescreen'); return; }
        if (currentGameInstance?.startGamePlay) { currentGameInstance.startGamePlay(initializationData); }
        else { console.error("Game instance missing!"); stateMachine?.transitionTo('homescreen'); if(UIManager)UIManager.showError("Startup Error",'homescreen'); }
    } else { if(!networkIsInitialized)console.log("Waiting for network init..."); if(!assetsAreReady)console.log("Waiting for assets..."); if(stateMachine?.is('playing'))console.log("Already playing."); }
}
window.attemptEnterPlayingState = attemptEnterPlayingState;

// --- Global Entry Point: runGame ---
function runGame() { console.log("--- runGame() ---"); try { const gI=new Game(); window.currentGameInstance=gI; gI.start(); window.onresize=()=>gI.handleResize(); } catch(e){console.error("Error creating Game:",e);document.body.innerHTML="<p>GAME INIT FAILED.</p>";}}

// --- DOM Ready Execution ---
if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',runGame);}else{runGame();}
console.log("game.js loaded");
