// docs/game.js - Main Game Orchestrator

class Game {
    constructor() {
        this.scene = null; this.camera = null; this.renderer = null; this.controls = null; this.clock = null; // Assign in init
        this.players = players; // Use global from config.js
        this.bullets = bullets; // Use global from config.js
        this.keys = keys;       // Use global from config.js
        this.frameCount = 0; this.debugLogFrequency = 180;
        console.log("[Game] Instance created.");
    }

    start() {
        console.log("[Game] Starting...");
        if (!this.initializeCoreComponents() || !this.initializeManagers()) {
            console.error("[Game] Initialization failed. Stopping.");
            return;
        }
        this.bindStateTransitions();
        stateMachine.transitionTo('loading'); // Initial state trigger
        if(typeof loadManager !== 'undefined') loadManager.startLoading();
        if(typeof Network !== 'undefined' && typeof Network.init === 'function') Network.init(); // Connect socket
        this.addEventListeners();
        this.animate();
        console.log("[Game] Started successfully.");
    }

    initializeCoreComponents() {
         console.log("[Game] Init Core Components...");
         try {
             this.scene = new THREE.Scene(); this.scene.background = new THREE.Color(0x6699cc); this.scene.fog = new THREE.Fog(0x6699cc, 0, 200);
             this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
             this.clock = new THREE.Clock();
             const canvas = document.getElementById('gameCanvas'); if (!canvas) throw new Error("Canvas missing!");
             this.renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true }); this.renderer.setSize(window.innerWidth, window.innerHeight); this.renderer.shadowMap.enabled = true;
             this.controls = new THREE.PointerLockControls(this.camera, document.body);
             this.controls.addEventListener('lock', function () { console.log('Locked'); });
             this.controls.addEventListener('unlock', function () { console.log('Unlocked'); if (stateMachine.is('playing')) stateMachine.transitionTo('homescreen', {playerCount: UIManager?.playerCountSpan?.textContent ?? '?'}); });

              // Assign to globals used by other modules AFTER they are created
             scene = this.scene; camera = this.camera; renderer = this.renderer; controls = this.controls; clock = this.clock;

              // Lighting
              const ambL = new THREE.AmbientLight(0xffffff, 0.7); scene.add(ambL); const dirL = new THREE.DirectionalLight(0xffffff, 1.0); dirL.position.set(15, 20, 10); dirL.castShadow = true; dirL.shadow.mapSize.width=1024; dirL.shadow.mapSize.height=1024; scene.add(dirL); scene.add(dirL.target);

              console.log("[Game] Core Components OK."); return true;
         } catch(e) { console.error("Core Component Init Error:", e); if(typeof UIManager !== 'undefined') UIManager.showError("Graphics Init Error!", 'loading'); else alert("Graphics Init Error!"); return false;}
    }

    initializeManagers() {
         console.log("[Game] Init Managers...");
         let allManagersDefined = true;
         const managers = { UIManager, Input, stateMachine, loadManager, Network, Effects }; // Objects expected globally

         // Check each one specifically
         for (const name in managers) {
              if (typeof managers[name] === 'undefined') {
                   console.error(`!!! Manager is undefined: ${name}`); // <<< LOG WHICH ONE
                   allManagersDefined = false;
              }
         }

         if (!allManagersDefined) {
             console.error("One or more essential managers are undefined! Check script load order and file content.");
             return false; // Stop initialization
         }

          try {
               UIManager.initialize(); // Initializes UI element references
               Input.init(this.controls); // Needs controls
               Effects.initialize(this.scene); // Needs scene
               // Network.init(); // Network now initialized in start() explicitly AFTER managers load
               console.log("[Game] Managers Initialized."); return true;
          } catch (e) { console.error("Manager Init Error:", e); UIManager.showError("Game Setup Error!", 'loading'); return false; }
    }

    // Setup state transitions -> UI updates
    bindStateTransitions() { /* ... Same ... */ }
    // Add global event listeners
    addEventListeners() { /* ... Same ... */ }
    // Main update loop, called by animate
    update(deltaTime) { /* ... Same ... */ }
    // Main render loop
    animate() { /* ... Same ... */ }
    // Handle Resize
    handleResize() { /* ... Same ... */ }
}

// --- START THE GAME ---
function runGame() { console.log("Running game..."); const gameInstance = new Game(); gameInstance.start(); window.onresize = () => gameInstance.handleResize(); }
if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', runGame); } else { runGame(); }

console.log("game.js loaded");
