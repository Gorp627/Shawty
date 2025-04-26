// docs/game.js - Main Game Orchestrator

class Game {
    constructor() {
        // Three.js Components (assuming globals exist - set by config/core)
        this.scene = scene;
        this.camera = camera;
        this.renderer = renderer;
        this.controls = controls;
        this.clock = clock;

        // Game Logic Components (assuming globals exist)
        this.players = players;
        this.bullets = bullets;
        this.localPlayerId = localPlayerId;
        this.localPlayerName = localPlayerName;
        this.localPlayerPhrase = localPlayerPhrase;
        this.keys = keys; // From Input module

        this.frameCount = 0;
        this.debugLogFrequency = 180; // Log state roughly every 3 seconds

        console.log("[Game] Instance created.");
    }

    // Called after DOM is ready and core Three.js setup is done in core.js->init
    start() {
        console.log("[Game] Starting...");
        if (!this.scene || !this.camera || !this.renderer || !this.clock) {
             console.error("[Game] FATAL: Missing required Three.js components!");
             UIManager.showError("Graphics Init Error!", 'loading'); // Show error via UI Manager
             return;
        }
        if (typeof UIManager === 'undefined' || typeof Input === 'undefined' || typeof stateMachine === 'undefined' || typeof loadManager === 'undefined' || typeof Network === 'undefined') {
            console.error("[Game] FATAL: Required managers (UI, Input, State, Load, Network) not loaded!");
             UIManager.showError("Script Load Error!", 'loading');
             return;
        }

        // Initialize Managers
        if (!UIManager.initialize()) return; // Stop if UI elements missing
        Input.init(this.controls); // Pass controls reference to Input manager
        Effects.initialize(this.scene); // Pass scene reference to Effects manager
        Network.init(); // Setup socket connections and handlers

        // Bind state listeners after managers initialized
        this.bindStateTransitions();

        // Initial state setup
        stateMachine.transitionTo('loading');

        // Start loading assets
        loadManager.startLoading();

        // Start the main animation loop
        this.animate();
        console.log("[Game] Started successfully.");
    }

    // Setup state transitions -> UI updates
    bindStateTransitions() {
        stateMachine.on('loading', (opts) => UIManager.showLoading(opts.message, opts.error, opts.assets));
        stateMachine.on('homescreen', (opts) => UIManager.showHomescreen(opts.playerCount));
        stateMachine.on('joining', (opts) => UIManager.showJoining(opts.waitingForAssets));
        stateMachine.on('playing', () => {
            UIManager.showGame();
             // Attach gun after DOM elements visible, controls should exist
             if(typeof attachGunViewModel === 'function') attachGunViewModel();
        });
        stateMachine.on('transition', (data) => {
             // Optional: General handler for any transition
             if(data.to === 'homescreen' && data.from === 'playing') {
                 // Handle leaving the game - maybe clear some state?
                 if(typeof removeGunViewModel === 'function') removeGunViewModel();
                 bullets.forEach(b => b.remove()); bullets = []; // Clear leftover bullets
             } else if (data.to === 'playing') {
                  if(typeof updateHealthBar === 'function' && this.players[this.localPlayerId]) {
                       updateHealthBar(this.players[this.localPlayerId].health); // Ensure health bar is current
                  }
             }
        });

         // Listen for Load Manager events
         loadManager.on('ready', () => {
             // Assets ready, if socket connected -> homescreen
             if(Network.isConnected() && stateMachine.is('loading')) {
                  stateMachine.transitionTo('homescreen', {playerCount: UIManager.playerCountSpan?.textContent ?? '?'});
             } else if (stateMachine.is('joining')) {
                  Network.sendJoinDetails(); // Proceed with join if waiting
             }
         });
          loadManager.on('error', (data) => {
               stateMachine.transitionTo('loading', {message: `FATAL: Asset Error!<br/>${data.message||''}`, error: true});
         });
    }

    // Main update loop, called by animate
    update(deltaTime) {
        // Throttled debug log
        // if (this.frameCount++ % this.debugLogFrequency === 0) {
        //     console.log(`Update Tick. State: ${stateMachine.currentState}`);
        // }

        // Only run game updates if in playing state
        if (stateMachine.is('playing')) {
            // Update local player (movement, physics, shooting checks, health pack collision)
            if (this.localPlayerId && this.players[this.localPlayerId] && typeof updateLocalPlayer === 'function') {
                 updateLocalPlayer(deltaTime);
            }

            // Update remote players (interpolation)
            if (typeof updateRemotePlayers === 'function') {
                 updateRemotePlayers(deltaTime);
            }

            // Update bullets (movement, lifetime, client collision detection)
            if (typeof updateBullets === 'function') {
                 updateBullets(deltaTime);
            }

             // Update Effects (muzzle flash fade, particles)
             if (typeof Effects !== 'undefined' && typeof Effects.update === 'function') {
                Effects.update(deltaTime);
            }
        }
    }

    // Main render loop
    animate() {
        requestAnimationFrame(() => this.animate()); // Use arrow func to preserve 'this' context

        const dT = this.clock ? this.clock.getDelta() : 0.016; // Get delta time

        this.update(dT); // Call main update logic

        if (this.renderer && this.scene && this.camera) {
            try { this.renderer.render(this.scene, this.camera); } catch (e) { console.error("Render error:", e); }
        }
    }

    // --- Utility/Event Handling attached to document/window ---
    handleResize() {
        if(this.camera){ this.camera.aspect = window.innerWidth / window.innerHeight; this.camera.updateProjectionMatrix(); }
        if(this.renderer) this.renderer.setSize(window.innerWidth, window.innerHeight);
    }
}

// --- Start the Game ---
// Ensure the DOM is ready, then create and start the game
function runGame() {
     const gameInstance = new Game();
     gameInstance.start();
     // Make resize available globally or handle differently if needed
     window.onresize = () => gameInstance.handleResize();
}

if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', runGame); }
else { runGame(); }

console.log("game.js loaded");
