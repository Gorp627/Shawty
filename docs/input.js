// docs/input.js

// Manages keyboard and mouse state globally

const Input = {
    keys: {}, mouseButtons: {}, controls: null, lastDashTime: 0, isDashing: false, dashDirection: new THREE.Vector3(),

    init: function(controlsRef) {
        if (!controlsRef) { console.error("[Input] Controls reference is required for init!"); return; }
        this.controls = controlsRef;
        document.addEventListener('keydown', this.handleKeyDown.bind(this));
        document.addEventListener('keyup', this.handleKeyUp.bind(this));
        document.addEventListener('mousedown', this.handleMouseDown.bind(this));
        document.addEventListener('mouseup', this.handleMouseUp.bind(this));
        console.log("[Input] Initialized.");
    },

    handleKeyDown: function(event) {
        this.keys[event.code] = true;
        if (event.code === 'ShiftLeft' && !event.repeat && !this.isDashing && (Date.now() - this.lastDashTime > CONFIG.DASH_COOLDOWN * 1000) && stateMachine.is('playing')) { this.startDash(); }
        if (event.code === 'Space' && !event.repeat) { event.preventDefault(); if (isOnGround && stateMachine.is('playing')) { velocityY = CONFIG.JUMP_FORCE; isOnGround = false; }}
    },
    handleKeyUp: function(event) { this.keys[event.code] = false; },
    handleMouseDown: function(event) {
         this.mouseButtons[event.button] = true;
         if (stateMachine.is('playing') && !this.controls?.isLocked) { this.controls?.lock(); }
         else if (stateMachine.is('playing') && this.controls?.isLocked && event.button === 0) { if(typeof shoot === 'function') shoot(); }
    },
    handleMouseUp: function(event) { this.mouseButtons[event.button] = false; },
    startDash: function() {
         console.log("Dash!"); this.isDashing = true; this.lastDashTime = Date.now();
         let intendedDir = new THREE.Vector3();
         if(this.keys['KeyW']){intendedDir.z = -1;} if(this.keys['KeyS']){intendedDir.z = 1;} if(this.keys['KeyA']){intendedDir.x = -1;} if(this.keys['KeyD']){intendedDir.x = 1;}
         if(intendedDir.lengthSq() === 0){intendedDir.z = -1;} intendedDir.normalize();
         if(this.controls?.getObject()) { this.dashDirection.copy(intendedDir).applyQuaternion(this.controls.getObject().quaternion); }
         setTimeout(() => { this.isDashing = false; /* console.log("Dash end."); */ }, CONFIG.DASH_DURATION * 1000);
    }
};

// Export to global scope
window.Input = Input;

console.log("input.js loaded");
