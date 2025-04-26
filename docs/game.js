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
                console.log("[Game] LoadManager 'ready' event received. All required assets loaded.");
                // Assets are ready. If we are in 'joining' state AND socket is connected, send details.
                // Network.sendJoinDetails might be called here or within Network.attemptJoinGame or socket 'connect' handler
                // based on exact timing. Let's ensure it's called if conditions are met now.
                if (typeof stateMachine !== 'undefined' && stateMachine.is('joining') && Network.isConnected()){
                    console.log("[Game] Assets ready while joining and connected, ensuring join details are sent.");
                    Network.sendJoinDetails(); // Ensure details sent if assets finish loading *while* joining
                } else if (typeof stateMachine !== 'undefined' && stateMachine.is('loading') && Network.isConnected()){
                    // If assets finish while loading and socket is connected, transition to homescreen
                     console.log("[Game] Assets ready and socket connected. Transitioning to homescreen.");
                     if (typeof UIManager !== 'undefined') {
                        stateMachine.transitionTo('homescreen', { playerCount: UIManager.playerCountSpan?.textContent ?? '?' });
                     } else {
                         stateMachine.transitionTo('homescreen');
                     }
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
                 // ** FIX: Do NOT automatically transition state on unlock **
                 // If we unlock while playing, the player might just be pausing briefly.
                 // Let UI handle pause menus or going back to main menu explicitly.
                 // if (typeof stateMachine !== 'undefined' && stateMachine.is('playing')) {
                 //      const currentCount = UIManager?.playerCountSpan?.textContent ?? '?';
                 //      stateMachine.transitionTo('homescreen', {playerCount: currentCount});
                 // }
             });
             controls = this.controls; // Assign global

             // --- Loaders (CRITICAL: Initialize here!) ---
             dracoLoader = new THREE.DRACOLoader(); // Assign global
             dracoLoader.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/libs/draco/'); // Use CDN path
             dracoLoader.setDecoderConfig({ type: 'js' });
             dracoLoader.preload();

             loader = new THREE.GLTFLoader(); // Assign global
             loader.setDRACOLoader(dracoLoader); // Link DRACOLoader to GLTFLoader
             console.log("[Game] Loaders Initialized (GLTF + DRACO).");


             // --- Lighting ---
             const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
             scene.add(ambientLight);
             const directionalLight = new THREE.DirectionalLight(0xffffff, 1.0);
             directionalLight.position.set(15, 20, 10);
             directionalLight.castShadow = true;
             directionalLight.shadow.mapSize.width = 1024;
             directionalLight.shadow.mapSize.height = 1024;
             scene.add(directionalLight);
             scene.add(directionalLight.target);

             console.log("[Game] Core Components OK.");
             return true; // Success

         } catch(e) {
             console.error("!!! Core Component Initialization Error:", e);
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
         if(typeof UIManager ==='undefined'||typeof Input ==='undefined'||typeof stateMachine ==='undefined'||typeof loadManager ==='undefined'||typeof Network ==='undefined'||typeof Effects ==='undefined') {
              console.error("!!! One or more required managers are undefined! Check script load order and execution.");
              if (typeof UIManager !=='undefined' && UIManager.showError){
                  UIManager.showError("FATAL: Manager Script Load Error!", 'loading');
              } else {
                  document.body.innerHTML = "<p style='color:red; font-size: 1.5em; text-align: center;'>FATAL: MANAGER SCRIPT LOAD ERROR</p>";
              }
              return false; // Failure
         }

         try {
             if (!UIManager.initialize()) throw new Error("UIManager failed initialization");
             Input.init(this.controls);
             Effects.initialize(this.scene);
             console.log("[Game] Managers Initialized.");
             return true; // Success
         }
         catch (e) {
             console.error("!!! Manager Initialization Error:", e);
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

        stateMachine.on('transition', (data) => {
             console.log(`[Game State Listener] Transition: ${data.from} -> ${data.to}`);
             if (data.to === 'homescreen' && data.from === 'playing') {
                 // Clean up when leaving the playing state
                 if (typeof Effects !== 'undefined') Effects.removeGunViewModel();
                 bullets.forEach(b => b.remove());
                 bullets = [];
                 if(players[localPlayerId]) players[localPlayerId].health = 0; // Reset local health conceptual value
                 // Ensure controls are unlocked if they were locked
                 if (controls?.isLocked) controls.unlock();

             } else if (data.to === 'playing') {
                 // Setup when entering the playing state
                 if (typeof UIManager !== 'undefined' && players[localPlayerId]) {
                     UIManager.updateHealthBar(players[localPlayerId].health);
                 }
                 // ** FIX: Check prerequisites before attaching gun **
                 console.log("[Game] Attempting to attach gun view model on state transition to 'playing'.");
                 console.log(`[Game] Prerequisites check: gunModel=${!!gunModel}, camera=${!!camera}, CONFIG=${!!CONFIG}`);
                 if (typeof Effects !== 'undefined' && gunModel && gunModel !== 'error' && camera && typeof CONFIG !== 'undefined') {
                     Effects.attachGunViewModel(); // Attach the gun view model ONLY if ready
                 } else {
                     console.warn("[Game] Could not attach gun view model immediately: Prerequisites not met.");
                     // Potential fallback: Try attaching later if gunModel loads late? Needs careful handling.
                 }
             } else if (data.to === 'loading' && data.options?.error) {
                 console.error("Transitioned to loading state WITH ERROR:", data.options.message);
                 if (controls?.isLocked) controls.unlock();
             }
        });
        console.log("[Game] Other State Listeners Bound");
    }

    addEventListeners() {
        console.log("[Game] Add global listeners...");
        if (UIManager && UIManager.joinButton && typeof Network !== 'undefined' && typeof Network.attemptJoinGame === 'function') {
             UIManager.joinButton.addEventListener('click', Network.attemptJoinGame);
             console.log("[Game] 'click' listener added to joinButton.");
        } else {
            console.error("!!! Could not add joinButton listener: UIManager or Network missing/invalid!");
            if (UIManager && UIManager.showError) {
                UIManager.showError("Join button broken!", 'homescreen');
            }
        }
        window.addEventListener('resize', this.handleResize.bind(this));
        console.log("[Game] Global Listeners added.");
    }

    update(deltaTime) {
        if (stateMachine.is('playing')) {
            if (typeof updateLocalPlayer === 'function' && localPlayerId && players[localPlayerId]) {
                 // Wrap in try-catch to prevent one error from crashing the loop
                 try {
                    updateLocalPlayer(deltaTime);
                 } catch (e) {
                     console.error("Error during updateLocalPlayer:", e);
                     // Optional: Transition to an error state?
                     // stateMachine.transitionTo('error', { message: "Player update failed" });
                 }
            }
            if (typeof updateRemotePlayers === 'function') {
                try {
                    updateRemotePlayers(deltaTime);
                } catch (e) {
                    console.error("Error during updateRemotePlayers:", e);
                }
            }
            if (typeof updateBullets === 'function') {
                try {
                    updateBullets(deltaTime);
                } catch (e) {
                    console.error("Error during updateBullets:", e);
                }
            }
            if (typeof Effects !== 'undefined' && typeof Effects.update === 'function') {
                try {
                    Effects.update(deltaTime);
                } catch (e) {
                    console.error("Error during Effects.update:", e);
                }
            }
        }
    }

    animate() {
        requestAnimationFrame(()=>this.animate());
        const deltaTime = this.clock ? this.clock.getDelta() : 0.016;

        this.update(deltaTime); // Run game logic updates

        if(this.renderer && this.scene && this.camera) {
            try {
                this.renderer.render(this.scene, this.camera);
            } catch (e) {
                console.error("!!! Render error:", e);
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
    }

} // End Game Class


// --- Global Entry Point ---
function runGame() {
    console.log("--- runGame() triggered ---");
    try {
        const gameInstance = new Game();
        gameInstance.start();
        window.onresize = () => gameInstance.handleResize();
    } catch (e) {
        console.error("!!! Error creating Game instance:", e);
        document.body.innerHTML = "<p style='color:red; font-size: 1.5em; text-align: center;'>GAME INITIALIZATION FAILED. Check Console.</p>";
    }
}

// --- DOM Ready Execution ---
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', runGame);
    console.log("DOM not ready, scheduling runGame on DOMContentLoaded.");
} else {
    console.log("DOM ready, running runGame immediately.");
    runGame();
}

console.log("game.js loaded and executed");
