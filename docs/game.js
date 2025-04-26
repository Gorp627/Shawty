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
        else console.error("LoadManager missing!");
        if(typeof Network !== 'undefined' && typeof Network.init === 'function') Network.init(); // Use Network object
        else console.error("Network or Network.init missing!");
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
              // Assign to globals AFTER creation
             scene = this.scene; camera = this.camera; renderer = this.renderer; controls = this.controls; clock = this.clock;
              // Lighting
              const ambL = new THREE.AmbientLight(0xffffff, 0.7); scene.add(ambL); const dirL = new THREE.DirectionalLight(0xffffff, 1.0); dirL.position.set(15, 20, 10); dirL.castShadow = true; dirL.shadow.mapSize.width=1024; dirL.shadow.mapSize.height=1024; scene.add(dirL); scene.add(dirL.target);
              console.log("[Game] Core Components OK."); return true;
         } catch(e) { console.error("Core Component Init Error:", e); if(typeof UIManager!=='undefined') UIManager.showError("Graphics Init Error!", 'loading'); else alert("Graphics Init Error!"); return false;}
    }

    initializeManagers() {
         console.log("[Game] Init Managers...");
         // Check if manager objects exist on window
         if(typeof UIManager === 'undefined' || typeof Input === 'undefined' || typeof stateMachine === 'undefined' || typeof loadManager === 'undefined' || typeof Network === 'undefined' || typeof Effects === 'undefined') {
              console.error("One or more managers are undefined! Check script files and load order.");
              // Attempt to show error via body manipulation if UIManager is missing
              if (typeof UIManager === 'undefined' || !UIManager.showError) {
                   document.body.innerHTML = "<p style='color:red; text-align:center;'>MANAGER LOAD ERROR</p>";
              } else {
                  UIManager.showError("Manager Load Error!", 'loading');
              }
              return false; // Stop initialization
         }
          try {
               if (!UIManager.initialize()) throw new Error("UIManager failed init"); // Check return value
               Input.init(this.controls);
               Effects.initialize(this.scene);
               // Network is initialized in start() after managers load
               console.log("[Game] Managers Initialized."); return true;
          } catch (e) { console.error("Manager Init Error:", e); UIManager.showError("Game Setup Error!", 'loading'); return false; }
    }

    bindStateTransitions() {
        if(typeof UIManager!=='undefined') UIManager.bindStateListeners(stateMachine); else console.error("UIManager missing for state binding");
        if (typeof loadManager !== 'undefined') {
            loadManager.on('ready', () => { if(Network.isConnected() && stateMachine.is('loading')) { stateMachine.transitionTo('homescreen', {playerCount: UIManager.playerCountSpan?.textContent ?? '?'}); } else if (stateMachine.is('joining')) { Network.sendJoinDetails(); }});
            loadManager.on('error', (data) => { stateMachine.transitionTo('loading', {message: `FATAL: Asset Error!<br/>${data.message||''}`, error: true}); });
        } else { console.error("LoadManager missing for state binding"); }
        stateMachine.on('transition', (data) => {
           if(data.to === 'homescreen' && data.from === 'playing') { if(typeof Effects !== 'undefined') Effects.removeGunViewModel(); bullets.forEach(b => b.remove()); bullets = []; } // Use Effects object
           else if (data.to === 'playing') { if(typeof UIManager !== 'undefined' && players[localPlayerId]) { UIManager.updateHealthBar(players[localPlayerId].health); } if (typeof Effects !== 'undefined') Effects.attachGunViewModel(); } // Use Effects object
        });
         console.log("[Game] State Listeners Bound");
    }

    addEventListeners() {
        console.log("[Game] Add global listeners...");
        if (UIManager.joinButton && typeof Network !== 'undefined' && typeof Network.attemptJoinGame === 'function') { UIManager.joinButton.addEventListener('click', Network.attemptJoinGame); console.log("[Game] 'click' listener added to joinButton."); }
        else { console.error("Join button or network missing!"); }
        window.addEventListener('resize', this.handleResize.bind(this));
        // Input listeners handled by Input.init() now
        console.log("[Game] Global Listeners added.");
    }

    update(deltaTime) {
        if (stateMachine.is('playing')) {
            if (typeof updateLocalPlayer === 'function' && localPlayerId && players[localPlayerId]) { updateLocalPlayer(deltaTime); } else if (localPlayerId && !players[localPlayerId] && stateMachine.is('playing')) { /* console.warn("Local player ID but no data") */ }
            if (typeof updateRemotePlayers === 'function') { updateRemotePlayers(deltaTime); }
            if (typeof updateBullets === 'function') { updateBullets(deltaTime); }
             if (typeof Effects !== 'undefined' && typeof Effects.update === 'function') { Effects.update(deltaTime); }
             // if (typeof checkHealthPackCollision === 'function') { checkHealthPackCollision(); } // Health packs removed
        }
    }

    animate() {
        requestAnimationFrame(() => this.animate());
        const dT = this.clock ? this.clock.getDelta() : 0.016;
        // if (this.frameCount++ % this.debugLogFrequency === 0) { console.log(`Anim State: ${stateMachine.currentState}`); }
        this.update(dT);
        if (this.renderer && this.scene && this.camera) { try { this.renderer.render(this.scene, this.camera); } catch (e) { console.error("Render error:", e); } }
    }

    handleResize() { if(this.camera){ this.camera.aspect = window.innerWidth / window.innerHeight; this.camera.updateProjectionMatrix(); } if(this.renderer) this.renderer.setSize(window.innerWidth, window.innerHeight); }
}

function runGame() { console.log("Running game..."); try { const gameInstance = new Game(); gameInstance.start(); window.onresize = () => gameInstance.handleResize(); } catch (e) { console.error("Error creating Game instance:", e); document.body.innerHTML = "<p style='color:red;'>GAME INIT FAILED</p>"; }}
if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', runGame); } else { runGame(); }

console.log("game.js loaded");
