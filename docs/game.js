// docs/game.js - Main Game Orchestrator (Log/Validate Physics Position)

// --- Global Flags and Data ---
let networkIsInitialized = false; let assetsAreReady = false; let initializationData = null;
var currentGameInstance = null;
var RAPIER = window.RAPIER || null;
var rapierWorld = null;
var rapierEventQueue = null;
window.isRapierReady = window.isRapierReady || false;

// Debug flags
const USE_SIMPLE_GROUND = false; // Use actual map
const DEBUG_FIXED_CAMERA = false; // Use dynamic camera
const DEBUG_MINIMAL_RENDER_LOOP = false; // Run full loop
// const DEBUG_FORCE_SPAWN_POS = false; // Use server spawn

class Game {
    // --- Constructor ---
    constructor() {
        this.scene = null; this.camera = null; this.renderer = null; this.controls = null; this.clock = null;
        this.players = window.players; this.keys = window.keys;
        this.mapMesh = null; this.simpleGroundMesh = null;
        this.playerRigidBodyHandles = {}; this.mapColliderHandle = null;
        this.rapierReady = window.isRapierReady;
        this.lastCallTime = performance.now();
        this._physicsLogCounter = 0; // Counter for selective logging

        console.log("[Game] Instance created.");
        if (!this.rapierReady) { window.addEventListener('rapier-ready', () => { console.log("[Game] 'rapier-ready' event."); RAPIER = window.RAPIER; if (!RAPIER) { console.error("RAPIER missing!"); /* Handle */ } else { this.initializePhysics(); this.attemptProceedToGame(); } }, { once: true }); }
        else { if (!window.RAPIER) { console.error("RAPIER flag true, object missing!"); /* Handle */ } else { RAPIER = window.RAPIER; this.initializePhysics(); console.log("[Game] Rapier ready on construct."); } }
    }

    // --- Start Method ---
    start() {
        console.log("[Game] Starting game initialization process...");
        networkIsInitialized = false; assetsAreReady = false; initializationData = null;
        this.mapMesh = null; this.simpleGroundMesh = null;
        this.playerRigidBodyHandles = {}; this.mapColliderHandle = null;
        this.lastCallTime = performance.now();
        if (!this.initializeThreeJS()) { return; }
        if (!this.initializeManagers()) { return; }
        if (!this.initializeNetwork()) { return; }
        this.bindLoadManagerListeners();
        this.bindOtherStateTransitions();
        this.addEventListeners();
        console.log("[Game] Triggering Asset loading and waiting for Rapier...");
        this.startAssetLoading();
        if (stateMachine) stateMachine.transitionTo('loading', { message: "Initializing..." });
        else console.error("!!! StateMachine is missing during start!");
        this.animate();
        console.log("[Game] Basic setup complete. Main loop started.");
    }

    // --- Initialize Three.js ---
    initializeThreeJS() {
        console.log("[Game] Initializing Three.js...");
        try {
            this.scene = new THREE.Scene(); window.scene = this.scene;
            this.scene.background = new THREE.Color(0x6699cc);
            this.scene.fog = new THREE.Fog(0x6699cc, 20, 200);
            this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
            window.camera = this.camera;
            this.clock = new THREE.Clock(); window.clock = this.clock;
            const canvasElement = document.getElementById('gameCanvas');
            if (!canvasElement) throw new Error("#gameCanvas missing!");
            this.renderer = new THREE.WebGLRenderer({ canvas: canvasElement, antialias: true });
            window.renderer = this.renderer;
            this.renderer.setSize(window.innerWidth, window.innerHeight);
            this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
            this.renderer.setClearColor(0x6699cc, 1); // Match background
            this.controls = new THREE.PointerLockControls(this.camera, document.body);
            window.controls = this.controls;
            this.controls.addEventListener('lock', () => console.log('[Controls] Locked'));
            this.controls.addEventListener('unlock', () => console.log('[Controls] Unlocked'));
            if (typeof THREE.DRACOLoader === 'undefined' || typeof THREE.GLTFLoader === 'undefined') throw new Error("Loaders missing!");
            window.dracoLoader = new THREE.DRACOLoader(); window.dracoLoader.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/libs/draco/'); window.dracoLoader.setDecoderConfig({ type: 'js' }); window.dracoLoader.preload();
            window.loader = new THREE.GLTFLoader(); window.loader.setDRACOLoader(window.dracoLoader);
            // Standard Lighting
            console.log("Setting up standard lighting.");
            const ambL=new THREE.AmbientLight(0xffffff, 0.6); this.scene.add(ambL);
            const dirL=new THREE.DirectionalLight(0xffffff,0.8); dirL.position.set(30,40,20); dirL.castShadow=true;
            dirL.shadow.mapSize.width=1024; dirL.shadow.mapSize.height=1024; dirL.shadow.camera.near=1; dirL.shadow.camera.far=150;
            dirL.shadow.camera.left=-60; dirL.shadow.camera.right=60; dirL.shadow.camera.top=60; dirL.shadow.camera.bottom=-60;
            this.scene.add(dirL); this.scene.add(dirL.target);
            console.log("Three.js initialized.");
            return true;
        } catch (e) { console.error("!!! Three.js Init Error:", e); return false; }
    }

    // --- Initialize Rapier Physics ---
    initializePhysics() {
        if (!RAPIER) { console.error("RAPIER missing!"); return false; } if (rapierWorld) { console.warn("Physics already init."); return true; } console.log("Init Rapier..."); try { const g = new RAPIER.Vector3(0.0, CONFIG?.GRAVITY ?? -25.0, 0.0); rapierWorld = new RAPIER.World(g); window.rapierWorld = rapierWorld; if (!rapierWorld) throw new Error("World fail."); rapierEventQueue = new RAPIER.EventQueue(true); window.rapierEventQueue = rapierEventQueue; if (!rapierEventQueue) throw new Error("Queue fail."); console.log(`Rapier world/queue created (Gravity: ${g.y}).`); return true; } catch (e) { console.error("!!! Rapier Init Error:", e); rapierWorld = null; window.rapierWorld = null; rapierEventQueue = null; window.rapierEventQueue = null; return false; }
    }
    // --- Initialize Core Managers ---
    initializeManagers() {
        console.log("Init Mgrs..."); if (!window.UIManager || !window.Input || !window.stateMachine || !window.loadManager || !window.Network || !window.Effects) { console.error("Mgr undefined!"); return false; } try { if (!UIManager.initialize()) throw new Error("UI fail"); if (!this.controls) throw new Error("Controls missing"); if (!Input.init(this.controls)) throw new Error("Input fail"); Effects.initialize(this.scene); console.log("Mgr Initialized."); return true; } catch (e) { console.error("Mgr Init Err:", e); return false; }
    }
    // --- Initialize Network Layer ---
    initializeNetwork() {
        console.log("Init Network..."); if (typeof Network?.init === 'function') { try { Network.init(); console.log("Net init ok."); return true; } catch (e) { console.error("Net Init Err:", e); return false; } } else { console.error("Network missing!"); return false; }
    }
    // --- Setup Asset Loading Listeners ---
    bindLoadManagerListeners() {
        if (!loadManager) { console.error("LoadManager missing!"); return; }
        loadManager.on('ready', () => {
            console.log("LoadMgr 'ready'."); assetsAreReady = true;
            this.mapMesh = loadManager.getAssetData('map');
            if (!this.mapMesh && !USE_SIMPLE_GROUND) { console.error("Map asset missing!"); if(stateMachine) stateMachine.transitionTo('loading',{message:"Map Data Err!",error:true}); return; }
            if (USE_SIMPLE_GROUND) { /* Simple ground logic */ console.log("Using simple ground."); const s=200,gG=new THREE.PlaneGeometry(s,s),gM=new THREE.MeshStandardMaterial({color:0x888888,side:THREE.DoubleSide}); this.simpleGroundMesh=new THREE.Mesh(gG,gM); this.simpleGroundMesh.rotation.x=-Math.PI/2; this.simpleGroundMesh.receiveShadow=true; this.simpleGroundMesh.position.y=0; if(this.scene) this.scene.add(this.simpleGroundMesh); console.log("Added simple visual ground."); }
            else if (this.mapMesh) { console.log("Using loaded map."); if(this.scene&&!this.mapMesh.parent){this.scene.add(this.mapMesh);console.log("Added map mesh to scene.");} else if(!this.scene){console.error("Scene missing!");} }
            this.createMapCollider(); this.attemptProceedToGame();
        });
        loadManager.on('error', (d) => { console.error("LoadMgr error:", d); assetsAreReady=false;this.mapMesh=null;this.simpleGroundMesh=null;if(stateMachine) stateMachine.transitionTo('loading',{message:`Asset Err!`,error:true}); });
        console.log("LoadMgr listeners bound.");
    }
    // --- Create Rapier Collider for Map/Ground ---
    createMapCollider() {
        if (!RAPIER || !rapierWorld || this.mapColliderHandle !== null) { return false; } if (!this.mapMesh && !USE_SIMPLE_GROUND) { console.warn("No map/ground."); return false; }
        console.log(`Creating collider (Simple: ${USE_SIMPLE_GROUND})...`);
        try {
            let cD;
            if (USE_SIMPLE_GROUND) { const s=100,t=0.5; cD=RAPIER.ColliderDesc.cuboid(s,t,s).setTranslation(0,-t,0); console.log(`Simple cuboid collider.`); }
            else { if(!this.mapMesh)throw new Error("Map mesh missing.");let f=false;this.mapMesh.traverse((c)=>{if(!f&&c.isMesh&&c.geometry){if(!c.geometry.attributes.position||c.geometry.attributes.position.count===0){console.warn(`Skip mesh '${c.name}': No verts.`);return;}let v=c.geometry.attributes.position.array;let i=c.geometry.index?c.geometry.index.array:null;console.log(`Using map mesh: ${c.name}. Verts: ${v.length/3}${i?`, Indices: ${i.length/3}`:''}.`);if(i){cD=RAPIER.ColliderDesc.trimesh(v,i);}else{console.warn(`Map mesh lacks indices.`);if((v.length/3)%3!==0){console.error(`Vert count not div by 3.`);return;}cD=RAPIER.ColliderDesc.trimesh(v);}f=true;}});if(!f||!cD){throw new Error("No suitable geom found.");}}
            cD.setFriction(0.7).setRestitution(0.1).setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);
            let c=rapierWorld.createCollider(cD); if (!c) throw new Error("Collider create fail."); this.mapColliderHandle=c.handle;
            console.log(`Created collider. Handle: ${this.mapColliderHandle}`); return true;
        } catch (e) { console.error("Collider creation error:", e); this.mapColliderHandle = null; return false; }
    }
    // --- Check Prerequisites ---
    attemptProceedToGame() {
        const rdy = !!RAPIER && !!rapierWorld; const col = this.mapColliderHandle !== null;
        console.log(`Check: Rapier=${rdy}, Collider=${col}, Assets=${assetsAreReady}, Net=${networkIsInitialized}, Data=${!!initializationData}`);
        if (rdy && col && assetsAreReady && networkIsInitialized && initializationData) { console.log("All ready -> startGamePlay"); if (typeof this.startGamePlay === 'function') { this.startGamePlay(initializationData); } else { console.error("startGamePlay missing!"); } }
        else if (rdy && col && assetsAreReady && stateMachine?.is('loading')) { console.log("Core ready -> Homescreen"); stateMachine.transitionTo('homescreen', { playerCount: UIManager?.playerCountSpan?.textContent ?? '?' }); }
        else { console.log(`Waiting... State: ${stateMachine?.currentState || '?'}`); }
    }
    // --- Bind State Transitions ---
    bindOtherStateTransitions() {
        if (UIManager?.bindStateListeners) UIManager.bindStateListeners(stateMachine); else console.error("UI bind missing");
        if (stateMachine) { stateMachine.on('transition', (d) => { const { from: f, to: t } = d; console.log(`State: ${f} -> ${t}`); if ((f === 'playing' || f === 'joining') && (t === 'homescreen' || t === 'loading')) { console.log(`Cleanup after ${f}...`); this.cleanupGameState(); if (controls?.isLocked) controls.unlock(); } else if (t === 'playing') { console.log("Entered 'playing'."); } else if (t === 'loading' && d.options?.error) { console.error(`Loading error: ${d.options.message}`); if (controls?.isLocked) controls.unlock(); networkIsInitialized = false; assetsAreReady = false; initializationData = null; this.cleanupGameState(); } }); } else { console.error("stateMachine missing!"); }
        console.log("State listeners bound.");
    }
    // --- Add Global Event Listeners ---
    addEventListeners() {
        console.log("Adding listeners..."); if (UIManager?.joinButton && Network?.attemptJoinGame) { UIManager.joinButton.addEventListener('click', Network.attemptJoinGame); console.log("Join listener added."); } else { console.error("Cannot add join listener!"); }
        window.addEventListener('resize', this.handleResize.bind(this)); console.log("Global listeners added.");
    }

    // --- Main Update/Animate Loop ---
    animate() {
        requestAnimationFrame(() => this.animate());
        const dt = this.clock ? this.clock.getDelta() : 0.0166;

        // --- Physics Step ---
        if (!DEBUG_MINIMAL_RENDER_LOOP && rapierWorld) {
             try { rapierWorld.step(rapierEventQueue); }
             catch (e) { console.error("Rapier step error:", e); }
        }

        // --- Gameplay Updates ---
        if (!DEBUG_MINIMAL_RENDER_LOOP && stateMachine?.is('playing') && localPlayerId && window.players[localPlayerId]) {
            try {
                const localHandle = this.playerRigidBodyHandles[localPlayerId];
                const localBody = (localHandle !== undefined && rapierWorld) ? rapierWorld.getRigidBody(localHandle) : null;
                if (typeof updateLocalPlayer === 'function' && localBody) { updateLocalPlayer(dt, localBody); }
                if (typeof Effects?.update === 'function') { Effects.update(dt); }
                if (!DEBUG_FIXED_CAMERA && localBody) {
                     // *** Add Logging and Validation before Camera Sync ***
                     try {
                         const playerPosition = localBody.translation();
                         // Log only occasionally to avoid spam
                         if (this._physicsLogCounter % 60 === 0) { // Log once per second approx
                            console.log(`[Physics Debug] Player Pos: x=${playerPosition.x?.toFixed(2)}, y=${playerPosition.y?.toFixed(2)}, z=${playerPosition.z?.toFixed(2)}`);
                         }

                         // Validate position
                         if (playerPosition && Number.isFinite(playerPosition.x) && Number.isFinite(playerPosition.y) && Number.isFinite(playerPosition.z)) {
                             this.syncCameraToBody(localBody); // Sync only if valid
                         } else {
                             console.error(`!!! Invalid Player Position from Physics! x=${playerPosition?.x}, y=${playerPosition?.y}, z=${playerPosition?.z}. Skipping camera sync.`);
                             // Optionally try to reset player position? Could be risky.
                         }
                     } catch (e) {
                          console.error("Error getting/checking player translation:", e);
                     }
                     // *** End Logging and Validation ***
                }

                // Sync Remote Players
                for (const id in window.players) { if (id === localPlayerId) continue; const p=window.players[id]; if (p instanceof ClientPlayer && p.mesh) { const h=this.playerRigidBodyHandles[id]; const b=(h!==undefined&&rapierWorld)?rapierWorld.getRigidBody(h):null; if(b){ const bp=b.translation(); const br=b.rotation(); p.mesh.position.set(bp.x,bp.y,bp.z); p.mesh.quaternion.set(br.x,br.y,br.z,br.w); const ph=CONFIG?.PLAYER_HEIGHT||1.8; if (!(p.mesh.geometry instanceof THREE.CylinderGeometry)){ p.mesh.position.y -= ph/2.0; }} } }

                this._physicsLogCounter++; // Increment log counter

            } catch (e) { console.error("Playing loop error:", e); }
        }

        // --- Rendering ---
        if (renderer && scene && camera) {
            try {
                // *** Add Scene/Camera Validation Before Render ***
                if (scene.children.length === 0) {
                    // console.warn("[Render Debug] Scene has no children before render call."); // Might happen momentarily
                }
                if (!Number.isFinite(camera.position.x) || !Number.isFinite(camera.position.y) || !Number.isFinite(camera.position.z)) {
                    console.error(`!!! Invalid Camera Position before render! x=${camera.position.x}, y=${camera.position.y}, z=${camera.position.z}`);
                    // Reset camera maybe?
                    // camera.position.set(0, 5, 15);
                    // camera.lookAt(0, 0, 0);
                } else {
                     // Only render if camera position seems valid
                     renderer.render(scene, camera);
                }
                // *** End Validation ***
            }
            catch (e) { console.error("!!! Rendering error:", e); }
        }
    }

    // --- Window Resize Handler ---
    handleResize() {
        if (camera) { camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); }
        if (renderer) { renderer.setSize(window.innerWidth, window.innerHeight); console.log(`[Game] Resized renderer`); }
    }

    // --- Start Game Play ---
    startGamePlay(initData) {
        console.log('[Game] startGamePlay...'); console.log('Init data:', JSON.stringify(initData));
        if (!initData?.id || typeof initData.players !== 'object') { console.error("Invalid init data"); stateMachine?.transitionTo('homescreen'); UIManager?.showError("Server Init Invalid!", "homescreen"); return; }
        if (!rapierWorld || !RAPIER || this.mapColliderHandle === null) { console.error("Physics not ready"); stateMachine?.transitionTo('homescreen'); UIManager?.showError("Physics Not Ready!", 'homescreen'); return; }
        if (stateMachine?.is('playing')) { console.warn("Already playing, resetting..."); this.cleanupGameState(); } else { console.log("Cleaning up..."); this.cleanupGameState(); }

        localPlayerId = initData.id; window.localPlayerId = localPlayerId; console.log(`Local ID: ${localPlayerId}`);
        console.log("Creating players/bodies...");
        const ph = CONFIG?.PLAYER_HEIGHT||1.8; const pr = CONFIG?.PLAYER_RADIUS||0.4; const ch = Math.max(0.01, ph/2.0-pr);
        let localCreated = false;

        for (const id in initData.players) {
            const playerDataForLoop = initData.players[id];
            if (playerDataForLoop.x === undefined || playerDataForLoop.y === undefined || playerDataForLoop.z === undefined) { console.warn(`Invalid pos ${id}`); continue; }

            // *** DEBUG: Force spawn position if flag is set ***
            let spawnX = playerDataForLoop.x;
            let spawnY = playerDataForLoop.y; // Use server Y as base
            let spawnZ = playerDataForLoop.z;
            if (DEBUG_FORCE_SPAWN_POS && id === localPlayerId) {
                spawnX = 0;
                spawnY = 5; // Start slightly above ground plane (Y=0)
                spawnZ = 5;
                console.log(`[DEBUG] Forcing local player spawn to (${spawnX}, ${spawnY}, ${spawnZ})`);
            }
            // *** END DEBUG ***

            const bodyCenterY = spawnY + ph / 2.0; // Calculate center based on potentially overridden spawnY

            try {
                let pCD = RAPIER.ColliderDesc.capsule(ch,pr).setFriction(0.7).setRestitution(0.1).setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);
                const iRY = playerDataForLoop.rotationY||0; const iRE = {x:0,y:iRY,z:0}; let rb; let rbD;

                if (id === localPlayerId) {
                    console.log(`Init LOCAL: ${playerDataForLoop.name} (${id})`);
                    window.players[id]={...playerDataForLoop, isLocal:true, mesh:null};
                    // Use potentially overridden spawn coords
                    rbD=RAPIER.RigidBodyDesc.dynamic().setTranslation(spawnX, bodyCenterY, spawnZ).setRotation(iRE).setLinvel(0,0,0).setAngvel({x:0,y:0,z:0}).setLinearDamping(0.5).setAngularDamping(1.0).lockRotations().setCanSleep(false);
                    rb=rapierWorld.createRigidBody(rbD); if(!rb) throw new Error("Fail local body.");
                    this.playerRigidBodyHandles[id]=rb.handle; console.log(`Created DYNAMIC body. H: ${rb.handle}`);
                    rapierWorld.createCollider(pCD,rb.handle);
                    if(!DEBUG_FIXED_CAMERA) { this.syncCameraToBody(rb); }
                    if(UIManager) { UIManager.updateHealthBar(playerDataForLoop.health??100); UIManager.updateInfo(`Playing as ${playerDataForLoop.name || 'P'}`); UIManager.clearError('homescreen'); UIManager.clearKillMessage(); }
                    localCreated = true;
                } else { // Remote player (use server position)
                    console.log(`Init REMOTE: ${playerDataForLoop.name} (${id})`);
                    let rpI=Network?._addPlayer(playerDataForLoop); if(!rpI) { console.warn(`Fail ClientPlayer ${id}.`); continue; }
                    rbD=RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(playerDataForLoop.x, bodyCenterY, playerDataForLoop.z).setRotation(iRE); // Use original server x/z
                    rb=rapierWorld.createRigidBody(rbD); if(!rb) throw new Error(`Fail remote body ${id}.`);
                    this.playerRigidBodyHandles[id]=rb.handle; console.log(`Created KINEMATIC body. H: ${rb.handle}`);
                    rapierWorld.createCollider(pCD,rb.handle);
                }
            } catch (bodyError) {
                 console.error(`!!! Body/collider error creating player ${id}:`, bodyError);
                 this.cleanupPlayer(id);
                 if (id === localPlayerId) { console.error("CRITICAL: Failed local player."); stateMachine?.transitionTo('homescreen'); UIManager?.showError("FATAL: Player Init Fail!", 'homescreen'); return; }
            }
        }
        if (!localCreated) { console.error("!!! Local player failed!"); stateMachine?.transitionTo('homescreen'); UIManager?.showError("FATAL: Local Player Missing!", 'homescreen'); return; }
        console.log(`Player init complete. ${Object.keys(window.players).length} players.`);
        if (stateMachine) { console.log("Transitioning state -> 'playing'..."); stateMachine.transitionTo('playing'); } else { console.error("stateMachine missing!"); }
    }

    // --- Helper: Sync Camera to Body ---
    syncCameraToBody(playerBody) {
        if (playerBody && controls?.getObject()) {
            try {
                const bodyPos = playerBody.translation();
                 // *** Add validation here too before setting ***
                 if (bodyPos && Number.isFinite(bodyPos.x) && Number.isFinite(bodyPos.y) && Number.isFinite(bodyPos.z)) {
                    const cameraOffset = CONFIG?.CAMERA_Y_OFFSET ?? 1.6;
                    controls.getObject().position.set(bodyPos.x, bodyPos.y + cameraOffset, bodyPos.z);
                 } else {
                    console.error(`!!! Invalid bodyPos in syncCameraToBody! x=${bodyPos?.x}, y=${bodyPos?.y}, z=${bodyPos?.z}`);
                 }
            } catch (e) { console.error("Error accessing body translation in syncCameraToBody:", e); }
        }
    }

     // --- Helper: Cleanup Game State ---
     cleanupGameState() {
         console.log("[Game Cleanup] Cleaning up state..."); for(const pId in this.playerRigidBodyHandles){const h=this.playerRigidBodyHandles[pId];if(rapierWorld&&h!==undefined){try{let b=rapierWorld.getRigidBody(h);if(b)rapierWorld.removeRigidBody(b);}catch(e){}}} this.playerRigidBodyHandles={}; for(const id in window.players){if(typeof Network?._removePlayer==='function'){Network._removePlayer(id);}else{if(window.players[id] instanceof ClientPlayer)window.players[id].remove();delete window.players[id];}} window.players={}; localPlayerId=null;window.localPlayerId=null; console.log("Cleanup done.");
     }
     // --- Helper: Cleanup a Single Player ---
     cleanupPlayer(playerId) {
         console.warn(`[Game Cleanup] Cleaning up player: ${playerId}`); const h=this.playerRigidBodyHandles[playerId];if(rapierWorld&&h!==undefined){try{let b=rapierWorld.getRigidBody(h);if(b)rapierWorld.removeRigidBody(b);}catch(e){} delete this.playerRigidBodyHandles[playerId];} if(typeof Network?._removePlayer==='function'){Network._removePlayer(playerId);}else{if(window.players[playerId] instanceof ClientPlayer)window.players[playerId].remove();delete window.players[playerId];}
     }
    // --- Start Asset Loading Process ---
    startAssetLoading() {
        console.log("Request asset loading..."); if(typeof loadManager?.startLoading==='function'){loadManager.startLoading();}else{console.error("LoadManager missing!");}
    }

} // End Game Class

// --- Global Game Initialization Function ---
function runGame() { console.log("--- runGame() ---"); try { if(window.currentGameInstance){console.warn("Prev instance found.");} const gI=new Game(); window.currentGameInstance=gI; gI.start(); } catch(e) { console.error("!!! Game Instance Err:", e); document.body.innerHTML = `<p style='color:red;'>FATAL GAME INIT FAILED.</p>`; } }
// --- DOM Ready Check ---
if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', runGame); } else { runGame(); }

console.log("game.js loaded (Log/Validate Physics Pos)");
