// docs/game.js - Main Game Orchestrator (Fixed sPD ReferenceError in Catch Block)

// --- Global Flags and Data ---
let networkIsInitialized = false; let assetsAreReady = false; let initializationData = null;
var currentGameInstance = null; // Holds the single Game instance
var RAPIER = window.RAPIER || null; // Will be populated by rapier_init.js
var rapierWorld = null;
var rapierEventQueue = null;
window.isRapierReady = window.isRapierReady || false; // Flag set by rapier_init.js

// Debug flags (Revert back for normal testing)
const USE_SIMPLE_GROUND = false; // <<< Use the actual map now
const DEBUG_FIXED_CAMERA = false; // <<< Use dynamic camera linked to player
const DEBUG_MINIMAL_RENDER_LOOP = false; // <<< Run full game loop

class Game {
    // --- Constructor ---
    constructor() {
        // Core Three.js components
        this.scene = null; this.camera = null; this.renderer = null; this.controls = null; this.clock = null;
        // Game state references
        this.players = window.players; this.keys = window.keys;
        this.mapMesh = null; this.simpleGroundMesh = null;
        // Physics state
        this.playerRigidBodyHandles = {}; this.mapColliderHandle = null;
        this.rapierReady = window.isRapierReady;
        // Timing
        this.lastCallTime = performance.now();

        console.log("[Game] Instance created.");

        // --- Rapier Initialization Listener ---
        if (!this.rapierReady) {
            window.addEventListener('rapier-ready', () => {
                console.log("[Game] Received 'rapier-ready' event.");
                RAPIER = window.RAPIER;
                if (!RAPIER) { console.error("!!! RAPIER missing after event!"); UIManager?.showError(`FATAL: Physics Load Fail! (Event)`, 'loading'); if(stateMachine) stateMachine.transitionTo('loading',{message:"Physics Lib Failed!",error:true}); }
                else { this.initializePhysics(); this.attemptProceedToGame(); }
            }, { once: true });
        } else {
            if (!window.RAPIER) { console.error("!!! RAPIER flag true, object missing!"); UIManager?.showError(`FATAL: Physics Load Fail! (Flag)`, 'loading'); if(stateMachine) stateMachine.transitionTo('loading',{message:"Physics Lib Failed!",error:true}); }
            else { RAPIER = window.RAPIER; this.initializePhysics(); console.log("[Game] Rapier ready on construct."); }
        }
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
            // Initial camera position set by syncCameraToBody later

            this.clock = new THREE.Clock(); window.clock = this.clock;
            const canvasElement = document.getElementById('gameCanvas');
            if (!canvasElement) throw new Error("Required canvas element '#gameCanvas' not found!");
            this.renderer = new THREE.WebGLRenderer({ canvas: canvasElement, antialias: true });
            window.renderer = this.renderer;
            this.renderer.setSize(window.innerWidth, window.innerHeight);
            this.renderer.shadowMap.enabled = true;
            this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
            // Set clear color to match background/fog initially
            this.renderer.setClearColor(0x6699cc, 1);

            this.controls = new THREE.PointerLockControls(this.camera, document.body);
            window.controls = this.controls;
            this.controls.addEventListener('lock', () => { console.log('[Controls] Pointer Locked'); });
            this.controls.addEventListener('unlock', () => { console.log('[Controls] Pointer Unlocked'); });

            if (typeof THREE.DRACOLoader === 'undefined' || typeof THREE.GLTFLoader === 'undefined') throw new Error("DRACO/GLTF Loader missing!");
            window.dracoLoader = new THREE.DRACOLoader(); window.dracoLoader.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/libs/draco/'); window.dracoLoader.setDecoderConfig({ type: 'js' }); window.dracoLoader.preload();
            window.loader = new THREE.GLTFLoader(); window.loader.setDRACOLoader(window.dracoLoader);

            // --- Original Lighting Setup ---
            console.log("[Game] Setting up standard lighting.");
            const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
            this.scene.add(ambientLight);
            const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
            directionalLight.position.set(30, 40, 20);
            directionalLight.castShadow = true;
            directionalLight.shadow.mapSize.width = 1024; directionalLight.shadow.mapSize.height = 1024;
            directionalLight.shadow.camera.near = 1; directionalLight.shadow.camera.far = 150;
            directionalLight.shadow.camera.left = -60; directionalLight.shadow.camera.right = 60;
            directionalLight.shadow.camera.top = 60; directionalLight.shadow.camera.bottom = -60;
            this.scene.add(directionalLight);
            this.scene.add(directionalLight.target);
            // --- End Original Lighting ---

            console.log("[Game] Three.js initialized successfully.");
            return true;
        } catch (e) { console.error("!!! Three.js Init Error:", e); UIManager?.showError(`FATAL: Graphics Init!<br/>${e.message}`, 'loading'); if(stateMachine) stateMachine.transitionTo('loading',{message:"GFX Init Failed!", error:true}); return false; }
    }

    // --- Initialize Rapier Physics ---
    initializePhysics() {
        if (!RAPIER) { console.error("RAPIER missing!"); return false; } if (rapierWorld) { console.warn("Physics already init."); return true; } console.log("Init Rapier..."); try { const g = new RAPIER.Vector3(0.0, CONFIG?.GRAVITY ?? -25.0, 0.0); rapierWorld = new RAPIER.World(g); window.rapierWorld = rapierWorld; if (!rapierWorld) throw new Error("World fail."); rapierEventQueue = new RAPIER.EventQueue(true); window.rapierEventQueue = rapierEventQueue; if (!rapierEventQueue) throw new Error("Queue fail."); console.log("Rapier world/queue created."); return true; } catch (e) { console.error("!!! Rapier Init Error:", e); rapierWorld = null; window.rapierWorld = null; rapierEventQueue = null; window.rapierEventQueue = null; return false; }
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
            this.mapMesh = loadManager.getAssetData('map'); // Get loaded map data

            if (!this.mapMesh && !USE_SIMPLE_GROUND) { // Critical if not using simple ground
                console.error("Map asset data missing!"); if(stateMachine) stateMachine.transitionTo('loading',{message:"Map Data Err!",error:true}); return;
            }

            if (USE_SIMPLE_GROUND) {
                 console.log("Using simple ground.");
                 const s=200; const gG=new THREE.PlaneGeometry(s,s); const gM=new THREE.MeshStandardMaterial({color:0x888888,side:THREE.DoubleSide});
                 this.simpleGroundMesh=new THREE.Mesh(gG,gM); this.simpleGroundMesh.rotation.x = -Math.PI/2; this.simpleGroundMesh.receiveShadow=true; this.simpleGroundMesh.position.y=0;
                 if(this.scene) this.scene.add(this.simpleGroundMesh); console.log("Added simple visual ground.");
            } else if (this.mapMesh) { // Use the actual map
                 console.log("Using loaded GLB map.");
                 if (this.scene && !this.mapMesh.parent) {
                     this.scene.add(this.mapMesh); console.log("Added loaded map mesh to scene.");
                 } else if (!this.scene) { console.error("Scene not available to add map mesh!"); }
            }
            this.createMapCollider(); this.attemptProceedToGame();
        });
        loadManager.on('error', (d) => { console.error("LoadMgr error:", d); assetsAreReady = false; this.mapMesh = null; this.simpleGroundMesh = null; if(stateMachine) stateMachine.transitionTo('loading',{message:`Asset Err!`,error:true}); });
        console.log("LoadMgr listeners bound.");
    }
    // --- Create Rapier Collider for Map/Ground ---
    createMapCollider() {
        if (!RAPIER || !rapierWorld || this.mapColliderHandle !== null) { return false; } if (!this.mapMesh && !USE_SIMPLE_GROUND) { console.warn("No map/ground."); return false; }
        console.log(`Creating collider (Simple: ${USE_SIMPLE_GROUND})...`);
        try {
            let colliderDesc;
            if (USE_SIMPLE_GROUND) {
                 const s=100; const t=0.5; colliderDesc=RAPIER.ColliderDesc.cuboid(s,t,s).setTranslation(0,-t,0); console.log(`Simple cuboid collider.`);
            } else { // Use Trimesh for loaded map
                 if (!this.mapMesh) throw new Error("Map mesh missing for trimesh.");
                 let found = false;
                 this.mapMesh.traverse((child) => {
                     if (!found && child.isMesh && child.geometry) {
                         if (!child.geometry.attributes.position || child.geometry.attributes.position.count === 0) { console.warn(`Skipping mesh '${child.name}': No vertices.`); return; }
                         let v = child.geometry.attributes.position.array; let i = child.geometry.index ? child.geometry.index.array : null;
                         console.log(`Using map mesh: ${child.name}. Verts: ${v.length/3}${i ? `, Indices: ${i.length/3}` : ''}.`);
                         if (i) { colliderDesc = RAPIER.ColliderDesc.trimesh(v, i); }
                         else { console.warn(`Map mesh lacks indices.`); if ((v.length/3)%3!==0) { console.error(`Vert count not div by 3.`); return; } colliderDesc = RAPIER.ColliderDesc.trimesh(v); }
                         found = true;
                     }
                 });
                 if (!found || !colliderDesc) { throw new Error("No suitable geometry found for map trimesh."); }
            }
            colliderDesc.setFriction(0.7).setRestitution(0.1).setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);
            let c=rapierWorld.createCollider(colliderDesc); if (!c) throw new Error("Collider create fail.");
            this.mapColliderHandle=c.handle; console.log(`Created collider. Handle: ${this.mapColliderHandle}`); return true;
        } catch (e) { console.error("Collider creation error:", e); this.mapColliderHandle = null; return false; }
    }
    // --- Check Prerequisites ---
    attemptProceedToGame() {
        const rdy = !!RAPIER && !!rapierWorld; const col = this.mapColliderHandle !== null;
        console.log(`Check: Rapier=${rdy}, Collider=${col}, Assets=${assetsAreReady}, Net=${networkIsInitialized}, Data=${!!initializationData}`);
        if (rdy && col && assetsAreReady && networkIsInitialized && initializationData) {
            console.log("All ready -> startGamePlay"); if (typeof this.startGamePlay === 'function') { this.startGamePlay(initializationData); } else { console.error("startGamePlay missing!"); }
        } else if (rdy && col && assetsAreReady && stateMachine?.is('loading')) {
             console.log("Core ready -> Homescreen"); stateMachine.transitionTo('homescreen', { playerCount: UIManager?.playerCountSpan?.textContent ?? '?' });
        } else { console.log(`Waiting... State: ${stateMachine?.currentState || '?'}`); }
    }
    // --- Bind State Transitions ---
    bindOtherStateTransitions() {
        if (UIManager?.bindStateListeners) UIManager.bindStateListeners(stateMachine); else console.error("UI bind missing");
        if (stateMachine) {
            stateMachine.on('transition', (d) => { const { from: f, to: t } = d; console.log(`State: ${f} -> ${t}`); if ((f === 'playing' || f === 'joining') && (t === 'homescreen' || t === 'loading')) { console.log(`Cleanup after ${f}...`); this.cleanupGameState(); if (controls?.isLocked) controls.unlock(); } else if (t === 'playing') { console.log("Entered 'playing'."); } else if (t === 'loading' && d.options?.error) { console.error(`Loading error: ${d.options.message}`); if (controls?.isLocked) controls.unlock(); networkIsInitialized = false; assetsAreReady = false; initializationData = null; this.cleanupGameState(); } });
        } else { console.error("stateMachine missing!"); }
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

        // Run physics simulation step
        if (!DEBUG_MINIMAL_RENDER_LOOP && rapierWorld) {
             try { rapierWorld.step(rapierEventQueue); }
             catch (e) { console.error("Rapier step error:", e); }
        }

        // Run game logic only when playing and not in minimal debug
        if (!DEBUG_MINIMAL_RENDER_LOOP && stateMachine?.is('playing') && localPlayerId && window.players[localPlayerId]) {
            try {
                const localHandle = this.playerRigidBodyHandles[localPlayerId];
                const localBody = (localHandle !== undefined && rapierWorld) ? rapierWorld.getRigidBody(localHandle) : null;
                if (typeof updateLocalPlayer === 'function' && localBody) { updateLocalPlayer(dt, localBody); }
                if (typeof Effects?.update === 'function') { Effects.update(dt); }
                if (!DEBUG_FIXED_CAMERA && localBody) { this.syncCameraToBody(localBody); }

                // Sync Remote Players
                for (const id in window.players) { if (id === localPlayerId) continue; const p=window.players[id]; if (p instanceof ClientPlayer && p.mesh) { const h=this.playerRigidBodyHandles[id]; const b=(h!==undefined&&rapierWorld)?rapierWorld.getRigidBody(h):null; if(b){ const bp=b.translation(); const br=b.rotation(); p.mesh.position.set(bp.x,bp.y,bp.z); p.mesh.quaternion.set(br.x,br.y,br.z,br.w); const ph=CONFIG?.PLAYER_HEIGHT||1.8; if (!(p.mesh.geometry instanceof THREE.CylinderGeometry)){ p.mesh.position.y -= ph/2.0; }} } }

            } catch (e) { console.error("Playing loop error:", e); }
        }

        // Always render
        if (renderer && scene && camera) {
            try { renderer.render(scene, camera); }
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
        if (!initData?.id || typeof initData.players !== 'object') { console.error("Invalid init data"); /* Handle */ return; }
        if (!rapierWorld || !RAPIER || this.mapColliderHandle === null) { console.error("Physics not ready"); /* Handle */ return; }
        if (stateMachine?.is('playing')) { console.warn("Already playing, resetting..."); this.cleanupGameState(); } else { console.log("Cleaning up..."); this.cleanupGameState(); }

        localPlayerId = initData.id; window.localPlayerId = localPlayerId; console.log(`Local ID: ${localPlayerId}`);
        console.log("Creating players/bodies...");
        const ph = CONFIG?.PLAYER_HEIGHT||1.8; const pr = CONFIG?.PLAYER_RADIUS||0.4; const ch = Math.max(0.01, ph/2.0-pr);
        let localCreated = false;

        for (const id in initData.players) {
            // Use a local copy for safety within loop/catch
            const playerDataForLoop = initData.players[id];
            if (playerDataForLoop.x === undefined) { console.warn(`Invalid pos ${id}`); continue; }
            const bodyCenterY = playerDataForLoop.y + ph / 2.0;

            try { // Start try block for this player
                let pCD = RAPIER.ColliderDesc.capsule(ch,pr).setFriction(0.7).setRestitution(0.1).setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);
                const iRY = playerDataForLoop.rotationY||0; const iRE = {x:0,y:iRY,z:0}; let rb; let rbD;

                if (id === localPlayerId) {
                    console.log(`Init LOCAL: ${playerDataForLoop.name} (${id})`);
                    window.players[id]={...playerDataForLoop,isLocal:true,mesh:null};
                    rbD=RAPIER.RigidBodyDesc.dynamic().setTranslation(playerDataForLoop.x,bY,playerDataForLoop.z).setRotation(iRE).setLinvel(0,0,0).setAngvel({x:0,y:0,z:0}).setLinearDamping(0.5).setAngularDamping(1.0).lockRotations().setCanSleep(false);
                    rb=rapierWorld.createRigidBody(rbD); if(!rb) throw new Error("Fail local body.");
                    this.playerRigidBodyHandles[id]=rb.handle; console.log(`Created DYNAMIC. H: ${rb.handle}`);
                    rapierWorld.createCollider(pCD,rb.handle);
                    if(!DEBUG_FIXED_CAMERA) { this.syncCameraToBody(rb); }
                    if(UIManager) { UIManager.updateHealthBar(playerDataForLoop.health??100); UIManager.updateInfo(`Playing as ${playerDataForLoop.name || 'P'}`); UIManager.clearError('homescreen'); UIManager.clearKillMessage(); }
                    localCreated = true;
                } else {
                    console.log(`Init REMOTE: ${playerDataForLoop.name} (${id})`);
                    let rpI=Network?._addPlayer(playerDataForLoop); if(!rpI) { console.warn(`Fail ClientPlayer ${id}.`); continue; }
                    rbD=RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(playerDataForLoop.x,bY,playerDataForLoop.z).setRotation(iRE);
                    rb=rapierWorld.createRigidBody(rbD); if(!rb) throw new Error(`Fail remote body ${id}.`);
                    this.playerRigidBodyHandles[id]=rb.handle; console.log(`Created KINEMATIC. H: ${rb.handle}`);
                    rapierWorld.createCollider(pCD,rb.handle);
                }
            } catch (bodyError) { // Catch errors specific to this player
                 // *** FIX: Don't reference sPD (now playerDataForLoop) inside catch if it might be undefined ***
                 console.error(`!!! Body/collider error creating player ${id}:`, bodyError);
                 this.cleanupPlayer(id); // Attempt cleanup for the player that failed
                 // If the *local* player failed, this is critical
                 if (id === localPlayerId) {
                     console.error("CRITICAL: Failed to create local player body/collider.");
                     stateMachine?.transitionTo('homescreen'); // Go back home
                     // Show specific error
                     UIManager?.showError("FATAL: Player Init Fail!", 'homescreen');
                     return; // Stop the entire startGamePlay process
                 }
                 // If a remote player failed, log it but continue processing others
            }
        } // End loop through players

        if (!localCreated) { console.error("!!! Local player failed!"); stateMachine?.transitionTo('homescreen'); UIManager?.showError("FATAL: Local Player Missing!", 'homescreen'); return; }
        console.log(`Player init complete. ${Object.keys(window.players).length} players.`);
        if (stateMachine) { console.log("Transitioning state -> 'playing'..."); stateMachine.transitionTo('playing'); } else { console.error("stateMachine missing!"); }
    }

    // --- Helper: Sync Camera to Body ---
    syncCameraToBody(playerBody) { if(playerBody&&controls?.getObject()){try{const bP=playerBody.translation();const cO=CONFIG?.CAMERA_Y_OFFSET??1.6;controls.getObject().position.set(bP.x,bP.y+cO,bP.z);}catch(e){console.error("Cam sync error:",e);}} }
     // --- Helper: Cleanup Game State ---
     cleanupGameState() { console.log("[Game Cleanup] Cleaning up state..."); for(const pId in this.playerRigidBodyHandles){const h=this.playerRigidBodyHandles[pId];if(rapierWorld&&h!==undefined){try{let b=rapierWorld.getRigidBody(h);if(b)rapierWorld.removeRigidBody(b);}catch(e){}}} this.playerRigidBodyHandles={}; for(const id in window.players){if(typeof Network?._removePlayer==='function'){Network._removePlayer(id);}else{if(window.players[id] instanceof ClientPlayer)window.players[id].remove();delete window.players[id];}} window.players={}; localPlayerId=null;window.localPlayerId=null; console.log("Cleanup done."); }
     // --- Helper: Cleanup a Single Player ---
     cleanupPlayer(playerId) { console.warn(`[Game Cleanup] Cleaning up player: ${playerId}`); const h=this.playerRigidBodyHandles[playerId];if(rapierWorld&&h!==undefined){try{let b=rapierWorld.getRigidBody(h);if(b)rapierWorld.removeRigidBody(b);}catch(e){} delete this.playerRigidBodyHandles[playerId];} if(typeof Network?._removePlayer==='function'){Network._removePlayer(playerId);}else{if(window.players[playerId] instanceof ClientPlayer)window.players[playerId].remove();delete window.players[playerId];} }
    // --- Start Asset Loading Process ---
    startAssetLoading() { console.log("Request asset loading..."); if(typeof loadManager?.startLoading==='function'){loadManager.startLoading();}else{console.error("LoadManager missing!");} }

} // End Game Class

// --- Global Game Initialization Function ---
function runGame() { console.log("--- runGame() ---"); try { if(window.currentGameInstance){console.warn("Prev instance found.");} const gI=new Game(); window.currentGameInstance=gI; gI.start(); } catch(e) { console.error("!!! Game Instance Err:", e); document.body.innerHTML = `<p style='color:red;'>FATAL GAME INIT FAILED.</p>`; } }
// --- DOM Ready Check ---
if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', runGame); } else { runGame(); }

console.log("game.js loaded (Fixed sPD ReferenceError in Catch)");
