// docs/game.js - Main Game Orchestrator

class Game {
    constructor() {
        // Assign directly from globals defined in config.js or initialized in initializeCoreComponents
        this.scene = scene; this.camera = camera; this.renderer = renderer;
        this.controls = controls; this.clock = clock;
        this.players = players; this.bullets = bullets; this.keys = keys;
        this.frameCount = 0; this.debugLogFrequency = 180;
        console.log("[Game] Instance created.");
    }

    start() {
        console.log("[Game] Starting...");
        if (!this.initializeCoreComponents() || !this.initializeManagers()) {
            console.error("[Game] Initialization failed. Stopping.");
            return;
        }

        // *** Bind LoadManager Listener BEFORE starting load ***
        console.log("[Game] Binding LoadManager listeners...");
        if (typeof loadManager !== 'undefined') {
            loadManager.on('ready', () => { // Arrow function to keep 'this' context if needed
                 console.log("[Game] LoadManager 'ready' event received."); // Add log
                 // Check socket connection state explicitly
                 if(Network.isConnected()) {
                      console.log("[Game] Assets ready & Socket connected -> homescreen");
                      stateMachine.transitionTo('homescreen', {playerCount: UIManager.playerCountSpan?.textContent ?? '?'});
                 } else {
                     // Socket not connected yet, the 'connect' handler in network.js should trigger homescreen later
                     console.log("[Game] Assets ready, but waiting for socket connection...");
                     // Stay visually in 'loading' state, but maybe update text
                     stateMachine.transitionTo('loading', {message: 'Connecting...'});
                 }
            });
             loadManager.on('error', (data) => {
                  stateMachine.transitionTo('loading', {message: `FATAL: Asset Error!<br/>${data.message||''}`, error: true});
             });
             console.log("[Game] LoadManager listeners attached.");
        } else {
            console.error("LoadManager missing, cannot attach listeners.");
            stateMachine.transitionTo('loading', {message:'Load Manager Failed!', error: true}); // Fail state
             return;
        }
        // *****************************************************

        this.bindOtherStateTransitions(); // Bind UI state transitions
        stateMachine.transitionTo('loading'); // Initial state trigger

        // Start loading assets *AFTER* attaching listener
        console.log("[Game] Starting asset load via LoadManager...");
        loadManager.startLoading();

        // Start Socket.IO connection via network module
        if(typeof Network !== 'undefined' && typeof Network.init === 'function') Network.init(); else console.error("Network missing!");

        this.addEventListeners(); // Add window/doc listeners

        // Start the main animation loop
        this.animate();
        console.log("[Game] Started successfully.");
    }

    initializeCoreComponents() {
         console.log("[Game] Init Core Components...");
         try {
             this.scene = scene || new THREE.Scene(); this.scene.background = new THREE.Color(0x6699cc); this.scene.fog = new THREE.Fog(0x6699cc, 0, 200);
             this.camera = camera || new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
             this.clock = clock || new THREE.Clock();
             const canvas = document.getElementById('gameCanvas'); if (!canvas) throw new Error("Canvas missing!");
             this.renderer = renderer || new THREE.WebGLRenderer({ canvas: canvas, antialias: true }); this.renderer.setSize(window.innerWidth, window.innerHeight); this.renderer.shadowMap.enabled = true;
             this.controls = controls || new THREE.PointerLockControls(this.camera, document.body);
             this.controls.addEventListener('lock', function () { /* console.log('Locked'); */ });
             this.controls.addEventListener('unlock', function () { console.log('Unlocked'); if (stateMachine.is('playing')) stateMachine.transitionTo('homescreen', {playerCount: UIManager?.playerCountSpan?.textContent ?? '?'}); });
              // Assign to globals AFTER creation
             scene = this.scene; camera = this.camera; renderer = this.renderer; controls = this.controls; clock = this.clock;
              // Lighting
              const ambL = new THREE.AmbientLight(0xffffff, 0.7); scene.add(ambL); const dirL = new THREE.DirectionalLight(0xffffff, 1.0); dirL.position.set(15, 20, 10); dirL.castShadow = true; dirL.shadow.mapSize.width=1024; dirL.shadow.mapSize.height=1024; scene.add(dirL); scene.add(dirL.target);
              console.log("[Game] Core Components OK."); return true;
         } catch(e) { console.error("Core Component Init Error:", e); if(typeof UIManager!=='undefined') UIManager.showError("Graphics Init Error!", 'loading'); else alert("Graphics Init Error!"); return false;}
    }

    initializeManagers() {
         console.log("[Game] Init Managers...");
         let allManagersDefined = true;
         const managers = { UIManager, Input, stateMachine, loadManager, Network, Effects }; // Objects expected globally
         for (const name in managers) { if (typeof managers[name] === 'undefined') { console.error(`!!! Manager is undefined: ${name}`); allManagersDefined = false; } }
         if (!allManagersDefined) { console.error("One or more managers are undefined! Check file load order/content."); return false; }
         try { if (!UIManager.initialize()) throw new Error("UIManager fail init"); Input.init(this.controls); Effects.initialize(this.scene); console.log("[Game] Managers Initialized."); return true; }
         catch (e) { console.error("Manager Init Error:", e); UIManager.showError("Game Setup Error!", 'loading'); return false; }
    }

    bindOtherStateTransitions() { // Setup listeners for state changes -> UI changes
        if(typeof UIManager!=='undefined') UIManager.bindStateListeners(stateMachine); else console.error("UIManager missing");
        stateMachine.on('transition', (data) => {
           if(data.to === 'homescreen' && data.from === 'playing') { if(typeof Effects !== 'undefined') Effects.removeGunViewModel(); bullets.forEach(b => b.remove()); bullets = []; } // Cleanup on leaving game
           else if (data.to === 'playing') { if(typeof UIManager !== 'undefined' && players[localPlayerId]) { UIManager.updateHealthBar(players[localPlayerId].health); } if (typeof Effects !== 'undefined') Effects.attachGunViewModel(); } // Setup on entering game
        });
         console.log("[Game] Other State Listeners Bound");
    }

    addEventListeners() { // Add global event listeners
        console.log("[Game] Add global listeners...");
        if (UIManager.joinButton && typeof Network !== 'undefined' && typeof Network.attemptJoinGame === 'function') { UIManager.joinButton.addEventListener('click', Network.attemptJoinGame); console.log("[Game] 'click' listener added to joinButton."); }
        else { console.error("Join button or network missing!"); }
        window.addEventListener('resize', this.handleResize.bind(this)); // Use method from this class
        // Input listeners are attached in Input.init() now
        console.log("[Game] Global Listeners added.");
    }

    update(deltaTime) { // Main game logic update tick
        if (stateMachine.is('playing')) {
            if (typeof updateLocalPlayer === 'function' && localPlayerId && players[localPlayerId]) { updateLocalPlayer(deltaTime); } else if (localPlayerId && !players[localPlayerId] && stateMachine.is('playing')) { /* console.warn("Local player data missing") */ }
            if (typeof updateRemotePlayers === 'function') { updateRemotePlayers(deltaTime); }
            if (typeof updateBullets === 'function') { updateBullets(deltaTime); }
            if (typeof Effects !== 'undefined' && typeof Effects.update === 'function') { Effects.update(deltaTime); }
            // if (typeof checkHealthPackCollision === 'function') { checkHealthPackCollision(); } // Health packs removed
        }
    }

    animate() { // Main rendering loop
        requestAnimationFrame(() => this.animate());
        const dT = this.clock ? this.clock.getDelta() : 0.016;
        // if (this.frameCount++ % this.debugLogFrequency === 0) { console.log(`Anim State: ${stateMachine.currentState}`); }
        this.update(dT); // Update game logic
        if (this.renderer && this.scene && this.camera) { try { this.renderer.render(this.scene, this.camera); } catch (e) { console.error("Render error:", e); } } // Render frame
    }

    handleResize() { // Handle window resize
        if(this.camera){ this.camera.aspect = window.innerWidth / window.innerHeight; this.camera.updateProjectionMatrix(); }
        if(this.renderer) this.renderer.setSize(window.innerWidth, window.innerHeight);
    }
}

// --- START THE GAME ---
function runGame() {
     console.log("Running game...");
     try { const gameInstance = new Game(); gameInstance.start(); window.onresize = () => gameInstance.handleResize(); } // Make resize global
     catch (e) { console.error("Error creating Game instance:", e); document.body.innerHTML = "<p style='color:red;'>GAME INIT FAILED</p>"; }
}
// Use DOMContentLoaded to ensure HTML/scripts are ready
if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', runGame); }
else { runGame(); }

console.log("game.js loaded");
