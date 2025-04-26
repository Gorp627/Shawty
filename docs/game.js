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
        if (!this.initializeCoreComponents() || !this.initializeManagers()) { return; }

        // Bind LoadManager Listener AFTER managers are confirmed defined
        console.log("[Game] Binding LoadManager listeners...");
        if (typeof loadManager !== 'undefined') {
            loadManager.on('ready', () => { console.log("[Game] LoadManager 'ready' event received."); if(typeof Network!=='undefined'&&Network.isConnected()){if(typeof stateMachine!=='undefined')stateMachine.transitionTo('homescreen',{playerCount:UIManager.playerCountSpan?.textContent??'?'});}else{console.log("[Game] Assets ready, waiting socket...");if(typeof stateMachine!=='undefined')stateMachine.transitionTo('loading',{message:'Connecting...'});}});
            loadManager.on('error', (data) => { if(typeof stateMachine!=='undefined')stateMachine.transitionTo('loading',{message:`FATAL: Asset Error!<br/>${data.message||''}`,error:true});});
            console.log("[Game] LoadManager listeners attached.");
        } else { console.error("LoadManager missing!"); return; }

        this.bindOtherStateTransitions();
        if(typeof stateMachine!=='undefined')stateMachine.transitionTo('loading'); else console.error("stateMachine missing!");

        console.log("[Game] Starting asset load via LoadManager...");
        if(typeof loadManager!=='undefined')loadManager.startLoading(); else console.error("LoadManager missing!");

        if(typeof Network!=='undefined'&&typeof Network.init==='function')Network.init(); else console.error("Network missing!");

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
             this.controls.addEventListener('unlock', function () { console.log('Unlocked'); if (typeof stateMachine !== 'undefined' && stateMachine.is('playing')) stateMachine.transitionTo('homescreen', {playerCount: UIManager?.playerCountSpan?.textContent ?? '?'}); });
             scene = this.scene; camera = this.camera; renderer = this.renderer; controls = this.controls; clock = this.clock; // Assign globals
             const ambL = new THREE.AmbientLight(0xffffff, 0.7); scene.add(ambL); const dirL = new THREE.DirectionalLight(0xffffff, 1.0); dirL.position.set(15, 20, 10); dirL.castShadow = true; dirL.shadow.mapSize.width=1024; dirL.shadow.mapSize.height=1024; scene.add(dirL); scene.add(dirL.target);
             console.log("[Game] Core Components OK."); return true;
         } catch(e) { console.error("Core Component Init Error:", e); if(typeof UIManager!=='undefined') UIManager.showError("Graphics Init Error!", 'loading'); else alert("Graphics Init Error!"); return false;}
    }

    initializeManagers() {
         console.log("[Game] Init Managers...");
         if(typeof UIManager==='undefined'||typeof Input==='undefined'||typeof stateMachine==='undefined'||typeof loadManager==='undefined'||typeof Network==='undefined'||typeof Effects==='undefined') {
              console.error("One or more managers are undefined!");
              if (typeof UIManager==='undefined'||!UIManager.showError){document.body.innerHTML="<p style='color:red;'>MANAGER LOAD ERROR</p>";}else{UIManager.showError("Manager Load Error!",'loading');} return false;
         }
         try { if (!UIManager.initialize()) throw new Error("UIManager failed init"); Input.init(this.controls); Effects.initialize(this.scene); console.log("[Game] Managers Initialized."); return true; }
         catch (e) { console.error("Manager Init Error:", e); UIManager.showError("Game Setup Error!", 'loading'); return false; }
    }

    bindOtherStateTransitions() { if(typeof UIManager!=='undefined') UIManager.bindStateListeners(stateMachine); else console.error("UIManager missing"); stateMachine.on('transition', (data) => { if(data.to === 'homescreen' && data.from === 'playing') { if(typeof Effects !== 'undefined') Effects.removeGunViewModel(); bullets.forEach(b => b.remove()); bullets = []; } else if (data.to === 'playing') { if(typeof UIManager !== 'undefined' && players[localPlayerId]) { UIManager.updateHealthBar(players[localPlayerId].health); } if (typeof Effects !== 'undefined') Effects.attachGunViewModel(); }}); console.log("[Game] State Listeners Bound"); }
    addEventListeners() { console.log("[Game] Add global listeners..."); if (UIManager && UIManager.joinButton && typeof Network !== 'undefined' && typeof Network.attemptJoinGame === 'function') { UIManager.joinButton.addEventListener('click', Network.attemptJoinGame); console.log("[Game] 'click' listener added to joinButton."); } else { console.error("Join button or network missing!"); } window.addEventListener('resize', this.handleResize.bind(this)); console.log("[Game] Global Listeners added."); }
    update(dT) { if (stateMachine.is('playing')) { if (typeof updateLocalPlayer === 'function' && localPlayerId && players[localPlayerId]) updateLocalPlayer(dT); if (typeof updateRemotePlayers === 'function') updateRemotePlayers(dT); if (typeof updateBullets === 'function') updateBullets(dT); if (typeof Effects !== 'undefined') Effects.update(dT); } }
    animate() { requestAnimationFrame(()=>this.animate()); const dT=this.clock?this.clock.getDelta():0.016; this.update(dT); if(this.renderer&&this.scene&&this.camera){try{this.renderer.render(this.scene,this.camera);}catch(e){console.error("Render error:",e);}}}
    handleResize() { if(this.camera){this.camera.aspect=window.innerWidth/window.innerHeight;this.camera.updateProjectionMatrix();} if(this.renderer)this.renderer.setSize(window.innerWidth,window.innerHeight);}
} // End Game Class

function runGame() { console.log("Running game..."); try { const gI = new Game(); gI.start(); window.onresize = () => gI.handleResize(); } catch (e) { console.error("Error creating Game instance:", e); document.body.innerHTML = "<p style='color:red;'>GAME INIT FAILED</p>"; }}
if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', runGame); } else { runGame(); }
console.log("game.js loaded");
