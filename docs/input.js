// docs/input.js

// Manages keyboard and mouse state globally

const Input = {
    keys: {}, mouseButtons: {}, controls: null, // Reference to PointerLockControls
    lastDashTime: 0, isDashing: false, dashDirection: new THREE.Vector3(),

    init: function(controlsRef) { // Accepts the controls object
        if (!controlsRef) { console.error("[Input] Controls reference needed!"); return; }
        this.controls = controlsRef;
        document.addEventListener('keydown', this.handleKeyDown.bind(this));
        document.addEventListener('keyup', this.handleKeyUp.bind(this));
        document.addEventListener('mousedown', this.handleMouseDown.bind(this));
        document.addEventListener('mouseup', this.handleMouseUp.bind(this));
        console.log("[Input] Initialized.");
    },

    handleKeyDown: function(event) {
        this.keys[event.code] = true;
        // Ensure CONFIG and stateMachine are available
        if (typeof CONFIG === 'undefined' || typeof stateMachine === 'undefined') return;
        if(event.code==='ShiftLeft'&&!event.repeat&&!this.isDashing&&(Date.now()-this.lastDashTime>CONFIG.DASH_COOLDOWN*1000)&&stateMachine.is('playing')){this.startDash();}
        if(event.code==='Space'&&!event.repeat){event.preventDefault(); if(typeof isOnGround!=='undefined'&&isOnGround&&stateMachine.is('playing')){velocityY=CONFIG.JUMP_FORCE;isOnGround=false;}}
    },
    handleKeyUp: function(event) { this.keys[event.code] = false; },
    handleMouseDown: function(event) {
         this.mouseButtons[event.button] = true;
         // Ensure stateMachine and shoot function exist
         if (typeof stateMachine === 'undefined') return;
         if (stateMachine.is('playing') && !this.controls?.isLocked) { this.controls?.lock(); }
         else if (stateMachine.is('playing') && this.controls?.isLocked && event.button === 0) { if(typeof shoot === 'function') shoot(); }
    },
    handleMouseUp: function(event) { this.mouseButtons[event.button] = false; },
    startDash: function() {
         if(typeof CONFIG === 'undefined' || typeof stateMachine === 'undefined') return; // Check dependencies
         console.log("Dash!"); this.isDashing = true; this.lastDashTime = Date.now();
         let iDir = new THREE.Vector3();
         if(this.keys['KeyW']){iDir.z=-1;} if(this.keys['KeyS']){iDir.z=1;} if(this.keys['KeyA']){iDir.x=-1;} if(this.keys['KeyD']){iDir.x=1;}
         if(iDir.lengthSq()===0){iDir.z=-1;} iDir.normalize();
         if(this.controls?.getObject()) { this.dashDirection.copy(iDir).applyQuaternion(this.controls.getObject().quaternion); }
         setTimeout(() => { this.isDashing = false; }, CONFIG.DASH_DURATION * 1000);
    }
};
window.Input = Input; // Export globally
console.log("input.js loaded");
