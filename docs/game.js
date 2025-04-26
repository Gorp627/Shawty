// docs/game.js - Main Game Orchestrator

class Game {
    constructor() {
        // Assign directly from globals defined in config.js
        this.scene = scene;
        this.camera = camera;
        this.renderer = renderer;
        this.controls = controls;
        this.clock = clock;
        this.players = players;
        this.bullets = bullets;
        // this.localPlayerId = localPlayerId; // Get from Network module
        this.keys = keys; // From Input module

        this.frameCount = 0;
        this.debugLogFrequency = 180;

        console.log("[Game] Instance created.");
    }

    // Called after DOM is ready
    start() {
        console.log("[Game] Starting...");
        // Initialize managers and core components
        if (!this.initializeCoreComponents() || !this.initializeManagers()) {
             return; // Stop if essential setup fails
        }

        this.bindStateTransitions(); // Listen to state changes

        stateMachine.transitionTo('loading'); // Initial state

        // Start loading assets via manager
        if(typeof loadManager !== 'undefined') loadManager.startLoading();
        else console.error("LoadManager missing!");

        // Start Socket.IO connection via network module
        if(typeof Network !== 'undefined' && typeof Network.connect === 'function') Network.connect();
        else console.error("Network or Network.connect missing!");

        this.addEventListeners(); // Add global listeners

        // Start the main animation loop
        this.animate();
        console.log("[Game] Started successfully.");
    }

    initializeCoreComponents() {
         console.log("[Game] Init Core Components...");
         try {
             // Assign from globals already potentially created in config.js or init previously
             this.scene = this.scene || new THREE.Scene();
             this.scene.background = new THREE.Color(0x6699cc);
             this.scene.fog = new THREE.Fog(0x6699cc, 0, 200);
             this.camera = this.camera || new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
             this.clock = this.clock || new THREE.Clock();
             const canvas = document.getElementById('gameCanvas'); if (!canvas) throw new Error("Canvas missing!");
             this.renderer = this.renderer || new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
             this.renderer.setSize(window.innerWidth, window.innerHeight); this.renderer.shadowMap.enabled = true;

              // Assign globals needed by other modules too
             scene = this.scene; camera = this.camera; renderer = this.renderer; clock = this.clock;

              // Lighting
              const ambL = new THREE.AmbientLight(0xffffff, 0.7); scene.add(ambL);
              const dirL = new THREE.DirectionalLight(0xffffff, 1.0); dirL.position.set(15, 20, 10); dirL.castShadow = true; dirL.shadow.mapSize.width=1024; dirL.shadow.mapSize.height=1024; scene.add(dirL); scene.add(dirL.target); // Target needed? Maybe not always.

              // Controls
              this.controls = this.controls || new THREE.PointerLockControls(this.camera, document.body);
              this.controls.addEventListener('lock', function () { console.log('Locked'); });
              this.controls.addEventListener('unlock', function () { console.log('Unlocked'); if (stateMachine.is('playing')) stateMachine.transitionTo('homescreen', {playerCount: UIManager?.playerCountSpan?.textContent ?? '?'}); });
               controls = this.controls; // Make available globally

              console.log("[Game] Core Components OK."); return true;
         } catch(e) { console.error("Core Component Init Error:", e); UIManager.showError("Graphics Init Error!", 'loading'); return false;}
    }

    initializeManagers() {
         console.log("[Game] Init Managers...");
         if(typeof UIManager === 'undefined' || typeof Input === 'undefined' || typeof stateMachine === 'undefined' || typeof loadManager === 'undefined' || typeof Network === 'undefined' || typeof Effects === 'undefined') {
              console.error("One or more managers are undefined!"); return false;
         }
          try {
               if (!UIManager.initialize()) throw new Error("UIManager failed init");
               Input.init(this.controls);
               Effects.initialize(this.scene);
               Network.init(); // Initializes socket handlers etc.
                console.log("[Game] Managers OK."); return true;
          } catch (e) { console.error("Manager Init Error:", e); UIManager.showError("Game Setup Error!", 'loading'); return false; }
    }

    // Setup state transitions -> UI updates
    bindStateTransitions() {
         if(typeof UIManager !== 'undefined') UIManager.bindStateListeners(stateMachine); else console.error("UIManager missing for state binding");

         // Listen for LoadManager events
         if (typeof loadManager !== 'undefined') {
              loadManager.on('ready', () => { if(Network.isConnected() && stateMachine.is('loading')) { stateMachine.transitionTo('homescreen', {playerCount: UIManager.playerCountSpan?.textContent ?? '?'}); } else if (stateMachine.is('joining')) { Network.sendJoinDetails(); }});
              loadManager.on('error', (data) => { stateMachine.transitionTo('loading', {message: `FATAL: Asset Error!<br/>${data.message||''}`, error: true}); });
          } else { console.error("LoadManager missing for state binding"); }

         // Additional transition logic
          stateMachine.on('transition', (data) => {
             if(data.to === 'homescreen' && data.from === 'playing') {
                  if(typeof removeGunViewModel === 'function') removeGunViewModel(); // Use core function
                  bullets.forEach(b => b.remove()); bullets = [];
             } else if (data.to === 'playing') {
                  if(typeof updateHealthBar === 'function' && this.players[localPlayerId]) { // Use global player state
                       updateHealthBar(this.players[localPlayerId].health);
                  }
                   // Attach gun in playing state
                    if (typeof attachGunViewModel === 'function') attachGunViewModel(); // Use core function
             }
          });
    }

    // Add global event listeners
     addEventListeners() {
         console.log("[Game] Add global listeners...");
         if (UIManager.joinButton && typeof Network !== 'undefined' && typeof Network.attemptJoinGame === 'function') {
             UIManager.joinButton.addEventListener('click', Network.attemptJoinGame);
              console.log("[Game] 'click' listener added to joinButton.");
         } else { console.error("Join button or network missing!"); }
          window.addEventListener('resize', this.handleResize.bind(this)); // Use method from this class
         // Input handled by Input module now document.addEventListener('keydown', onKeyDown);
         // document.addEventListener('keyup', onKeyUp);
         // document.addEventListener('mousedown', onMouseDown);
         console.log("[Game] Global Listeners added.");
     }

    // Main update loop, called by animate
    update(deltaTime) {
        // Only run game updates if in playing state
        if (stateMachine.is('playing')) {
            if (localPlayerId && players[localPlayerId] && typeof updateLocalPlayer === 'function') updateLocalPlayer(deltaTime);
            if (typeof updateRemotePlayers === 'function') updateRemotePlayers(deltaTime); // Separate remote player updates
            if (typeof updateBullets === 'function') updateBullets(deltaTime); // Separate bullet updates
             if (typeof updateEffects === 'function') updateEffects(deltaTime); // Effects update
              if (typeof checkHealthPackCollision === 'function') checkHealthPackCollision(); // Check local player against packs
        }
    }

    // Main render loop
    animate() {
        requestAnimationFrame(() => this.animate());
        const dT = this.clock ? this.clock.getDelta() : 0.016;
        // if (this.frameCount++ % this.debugLogFrequency === 0) { console.log(`Anim State: ${stateMachine.currentState}`); }

        this.update(dT); // Call main update logic

        if (this.renderer && this.scene && this.camera) {
            try { this.renderer.render(this.scene, this.camera); } catch (e) { console.error("Render error:", e); }
        }
    }

    handleResize() {
        if(this.camera){ this.camera.aspect = window.innerWidth / window.innerHeight; this.camera.updateProjectionMatrix(); }
        if(this.renderer) this.renderer.setSize(window.innerWidth, window.innerHeight);
    }
}

// --- START THE GAME ---
function runGame() {
     console.log("Running game...");
     const gameInstance = new Game();
     gameInstance.start();
}

// Use DOMContentLoaded to ensure HTML is ready before creating Game instance
if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', runGame); }
else { runGame(); }

console.log("game.js loaded");
