// docs/game.js - Main Game Orchestrator

class Game {
    constructor() {
        this.scene = null; this.camera = null; this.renderer = null; this.controls = null; this.clock = null;
        this.players = players; this.bullets = bullets; this.keys = keys; // Use globals from config
        this.frameCount = 0; this.debugLogFrequency = 180;
        console.log("[Game] Instance created.");
    }

    start() {
        console.log("[Game] Starting...");
        // Initialize core THREE.js components FIRST, including loaders
        if (!this.initializeCoreComponents()) {
             // Error handling already done inside initializeCoreComponents
             return;
        }
        // Initialize other managers AFTER core components (like loaders) exist
        if (!this.initializeManagers()) {
            // Error handling already done inside initializeManagers
            return;
        }


        // Bind LoadManager Listener AFTER managers are confirmed defined
        console.log("[Game] Binding LoadManager listeners...");
        if (typeof loadManager !== 'undefined') {
            loadManager.on('ready', () => {
                console.log("[Game] LoadManager 'ready' event received.");
                // Logic to transition state is now primarily handled within LoadManager.checkCompletion itself
                // It checks Network.isConnected() internally before transitioning to homescreen.
                // This listener might still be useful for other 'ready' actions if needed later.
                 if (typeof Network !== 'undefined' && Network.isConnected()) {
                     // Assets became ready AFTER socket was already connected
                     console.log("[Game] Assets ready and socket already connected. LoadManager should handle transition.");
                 } else if (typeof stateMachine !== 'undefined' && stateMachine.is('loading')) {
                    // Assets ready, but socket not yet connected. Stay in loading.
                    console.log("[Game] Assets ready, waiting for socket connection...");
                    // UIManager.showLoading("Connecting..."); // Ensure loading message reflects this
                 }
            });
            loadManager.on('error', (data) => {
                console.error("[Game] LoadManager 'error' event received.");
                if(typeof stateMachine!=='undefined') stateMachine.transitionTo('loading',{message:`FATAL: Asset Error!<br/>${data.message||''}`,error:true});
            });
            console.log("[Game] LoadManager listeners attached.");
        } else {
            console.error("LoadManager missing!");
             if(typeof stateMachine!=='undefined') stateMachine.transitionTo('loading',{message:`FATAL: LoadManager Missing!`,error:true});
            return; // Cannot proceed without LoadManager
        }

        this.bindOtherStateTransitions();
        if(typeof stateMachine!=='undefined') stateMachine.transitionTo('loading'); else console.error("stateMachine missing!");

        // Initialize Network AFTER core components and managers (except LoadManager assets)
        console.log("[Game] Initializing Network...");
        if(typeof Network!=='undefined' && typeof Network.init==='function') {
            Network.init();
        } else {
            console.error("Network missing or invalid!");
            if(typeof stateMachine!=='undefined') stateMachine.transitionTo('loading',{message:`FATAL: Network Module Failed!`,error:true});
            return; // Cannot proceed without Network
        }

        // Start loading assets AFTER core components (loaders) and LoadManager listeners are set up
        console.log("[Game] Starting asset load via LoadManager...");
        if(typeof loadManager!=='undefined') {
            loadManager.startLoading(); // Now the loader should exist
        } else {
             console.error("LoadManager missing - cannot start loading!");
             // State machine should already be showing an error from earlier checks
        }


        this.addEventListeners();
        this.animate();
        console.log("[Game] Started successfully setup.");
    }

    initializeCoreComponents() {
         console.log("[Game] Init Core Components...");
         try {
             // --- Essential Scene Setup ---
             this.scene = new THREE.Scene();
             this.scene.background = new THREE.Color(0x6699cc);
             this.scene.fog = new THREE.Fog(0x6699cc, 0, 200); // Near, Far
             scene = this.scene; // Assign global

             // --- Camera ---
             this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
             camera = this.camera; // Assign global

             // --- Clock ---
             this.clock = new THREE.Clock();
             clock = this.clock; // Assign global

             // --- Renderer ---
             const canvas = document.getElementById('gameCanvas');
             if (!canvas) throw new Error("Canvas element #gameCanvas not found!");
             this.renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
             this.renderer.setSize(window.innerWidth, window.innerHeight);
             this.renderer.shadowMap.enabled = true; // Enable shadows
             renderer = this.renderer; // Assign global

             // --- Controls ---
             this.controls = new THREE.PointerLockControls(this.camera, document.body);
             this.controls.addEventListener('lock', function () { console.log('[Controls] Locked'); });
             this.controls.addEventListener('unlock', function () {
                 console.log('[Controls] Unlocked');
                 // If we unlock while playing, go back to the homescreen
                 if (typeof stateMachine !== 'undefined' && stateMachine.is('playing')) {
                      const currentCount = UIManager?.playerCountSpan?.textContent ?? '?';
                      stateMachine.transitionTo('homescreen', {playerCount: currentCount});
                 }
             });
             controls = this.controls; // Assign global

             // --- Loaders (CRITICAL: Initialize here!) ---
             dracoLoader = new THREE.DRACOLoader(); // Assign global
             // Path depends on where you host the draco decoder files relative to your HTML
             // Often it's '/node_modules/three/examples/js/libs/draco/' or similar CDN path
             dracoLoader.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/libs/draco/'); // Use CDN path
             dracoLoader.setDecoderConfig({ type: 'js' }); // Use JS decoder
             dracoLoader.preload(); // Preload decoder module

             loader = new THREE.GLTFLoader(); // Assign global
             loader.setDRACOLoader(dracoLoader); // Link DRACOLoader to GLTFLoader
             console.log("[Game] Loaders Initialized (GLTF + DRACO).");


             // --- Lighting ---
             const ambientLight = new THREE.AmbientLight(0xffffff, 0.7); // Soft ambient light
             scene.add(ambientLight);
             const directionalLight = new THREE.DirectionalLight(0xffffff, 1.0); // Brighter directional light
             directionalLight.position.set(15, 20, 10); // Position the light
             directionalLight.castShadow = true; // Allow shadow casting
             // Configure shadow properties (optional but recommended)
             directionalLight.shadow.mapSize.width = 1024; // default 512
             directionalLight.shadow.mapSize.height = 1024; // default 512
             // directionalLight.shadow.camera.near = 0.5; // default 0.5
             // directionalLight.shadow.camera.far = 50; // default 500
             scene.add(directionalLight);
             scene.add(directionalLight.target); // Target for the light often follows the scene origin or a specific object

             console.log("[Game] Core Components OK.");
             return true; // Success

         } catch(e) {
             console.error("!!! Core Component Initialization Error:", e);
             // Try to use UIManager, otherwise fallback to alert
             if(typeof UIManager !=='undefined' && UIManager.showError) {
                 UIManager.showError("FATAL: Graphics Initialization Error!", 'loading');
             } else {
                 alert("FATAL: Graphics Initialization Error! Check Console.");
                 document.body.innerHTML = "<p style='color:red; font-size: 1.5em; text-align: center;'>FATAL: Graphics Initialization Error!</p>";
             }
             return false; // Failure
         }
    }

    initializeManagers() {
         console.log("[Game] Init Managers...");
         // Check if manager scripts have loaded and exposed their objects
         if(typeof UIManager ==='undefined'||typeof Input ==='undefined'||typeof stateMachine ==='undefined'||typeof loadManager ==='undefined'||typeof Network ==='undefined'||typeof Effects ==='undefined') {
              console.error("!!! One or more required managers are undefined! Check script load order and execution.");
              // Attempt to show error via UIManager if it exists, otherwise basic message
              if (typeof UIManager !=='undefined' && UIManager.showError){
                  UIManager.showError("FATAL: Manager Script Load Error!", 'loading');
              } else {
                  document.body.innerHTML = "<p style='color:red; font-size: 1.5em; text-align: center;'>FATAL: MANAGER SCRIPT LOAD ERROR</p>";
              }
              return false; // Failure
         }

         try {
             // Initialize managers that have an init method
             if (!UIManager.initialize()) throw new Error("UIManager failed initialization");
             Input.init(this.controls); // Pass controls reference to Input manager
             Effects.initialize(this.scene); // Pass scene reference to Effects manager
             // stateMachine, loadManager, Network are objects/modules initialized differently or don't need an explicit init call here
             console.log("[Game] Managers Initialized.");
             return true; // Success
         }
         catch (e) {
             console.error("!!! Manager Initialization Error:", e);
             // Use UIManager if available
             if(typeof UIManager !=='undefined' && UIManager.showError) {
                UIManager.showError("FATAL: Game Setup Error!", 'loading');
             } else {
                 alert("FATAL: Game Setup Error! Check Console.");
                 document.body.innerHTML = "<p style='color:red; font-size: 1.5em; text-align: center;'>FATAL: Game Setup Error!</p>";
             }
             return false; // Failure
         }
    }

    bindOtherStateTransitions() {
        if(typeof UIManager!=='undefined' && typeof UIManager.bindStateListeners === 'function') {
            UIManager.bindStateListeners(stateMachine);
        } else {
            console.error("UIManager or bindStateListeners missing");
        }

        // Add specific game logic tied to state transitions
        stateMachine.on('transition', (data) => {
             console.log(`[Game State Listener] Transition: ${data.from} -> ${data.to}`);
             if (data.to === 'homescreen' && data.from === 'playing') {
                 // Clean up when leaving the playing state (e.g., player unlocked controls)
                 if (typeof Effects !== 'undefined') Effects.removeGunViewModel();
                 bullets.forEach(b => b.remove()); // Remove existing bullet meshes
                 bullets = []; // Clear bullet array
                 if(players[localPlayerId]) players[localPlayerId].health = 0; // Ensure local player is marked dead UI wise if needed
                 // Optionally clear other game elements
             } else if (data.to === 'playing') {
                 // Setup when entering the playing state
                 if (typeof UIManager !== 'undefined' && players[localPlayerId]) {
                     UIManager.updateHealthBar(players[localPlayerId].health); // Update health bar immediately
                 }
                 if (typeof Effects !== 'undefined') {
                     Effects.attachGunViewModel(); // Attach the gun view model
                 }
             } else if (data.to === 'loading' && data.options?.error) {
                 console.error("Transitioned to loading state WITH ERROR:", data.options.message);
                 // Potentially lock controls if they were locked
                 if (controls?.isLocked) controls.unlock();
             }
        });
        console.log("[Game] Other State Listeners Bound");
    }

    addEventListeners() {
        console.log("[Game] Add global listeners...");
        // Ensure UI elements and Network function exist before adding listener
        if (UIManager && UIManager.joinButton && typeof Network !== 'undefined' && typeof Network.attemptJoinGame === 'function') {
             UIManager.joinButton.addEventListener('click', Network.attemptJoinGame);
             console.log("[Game] 'click' listener added to joinButton.");
        } else {
            console.error("!!! Could not add joinButton listener: UIManager or Network missing/invalid!");
            // Maybe display an error to the user if UIManager is available
            if (UIManager && UIManager.showError) {
                UIManager.showError("Join button broken!", 'homescreen');
            }
        }

        // Window resize listener
        window.addEventListener('resize', this.handleResize.bind(this));
        console.log("[Game] Global Listeners added.");
    }

    update(deltaTime) {
        // Only run game logic updates when in the 'playing' state
        if (stateMachine.is('playing')) {
            // Make sure update functions exist before calling
            if (typeof updateLocalPlayer === 'function' && localPlayerId && players[localPlayerId]) {
                updateLocalPlayer(deltaTime);
            }
            if (typeof updateRemotePlayers === 'function') {
                updateRemotePlayers(deltaTime);
            }
            if (typeof updateBullets === 'function') {
                updateBullets(deltaTime);
            }
            if (typeof Effects !== 'undefined' && typeof Effects.update === 'function') {
                Effects.update(deltaTime); // For particle systems or other time-based effects
            }
        }
        // Add other state-specific updates here if needed (e.g., animations on homescreen)
    }

    animate() {
        requestAnimationFrame(()=>this.animate()); // Loop the animation
        const deltaTime = this.clock ? this.clock.getDelta() : 0.016; // Get time delta, provide fallback

        this.update(deltaTime); // Run game logic updates

        // Render the scene if components are ready
        if(this.renderer && this.scene && this.camera) {
            try {
                this.renderer.render(this.scene, this.camera);
            } catch (e) {
                console.error("!!! Render error:", e);
                // Optionally stop the loop or show a critical error message
                // For now, just log it.
            }
        }
    }

    handleResize() {
        if(this.camera) {
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();
        }
        if(this.renderer) {
            this.renderer.setSize(window.innerWidth, window.innerHeight);
        }
        // console.log("Handled resize"); // Optional: Log resize events
    }

} // End Game Class


// --- Global Entry Point ---
function runGame() {
    console.log("--- runGame() triggered ---");
    try {
        const gameInstance = new Game();
        gameInstance.start(); // Start the game initialization and loop
        // Re-assign resize handler to the instance method AFTER instance creation
        window.onresize = () => gameInstance.handleResize();
    } catch (e) {
        console.error("!!! Error creating Game instance:", e);
        document.body.innerHTML = "<p style='color:red; font-size: 1.5em; text-align: center;'>GAME INITIALIZATION FAILED. Check Console.</p>";
    }
}

// --- DOM Ready Execution ---
// Ensures HTML is parsed before scripts try to access elements
if (document.readyState === 'loading') { // Loading hasn't finished yet
    document.addEventListener('DOMContentLoaded', runGame);
    console.log("DOM not ready, scheduling runGame on DOMContentLoaded.");
} else { // `DOMContentLoaded` has already fired
    console.log("DOM ready, running runGame immediately.");
    runGame();
}

console.log("game.js loaded and executed");
