// docs/input.js

const Input = { // Keep as const
    keys: {}, mouseButtons: {}, controls: null, lastDashTime: 0, isDashing: false, dashDirection: new THREE.Vector3(),

    init: function(controlsRef) { /* ... Same init logic ... */ },
    handleKeyDown: function(event) { /* ... Same logic ... */ },
    handleKeyUp: function(event) { /* ... Same logic ... */ },
    handleMouseDown: function(event) { /* ... Same logic ... */ },
    handleMouseUp: function(event) { /* ... Same logic ... */ },
    startDash: function() { /* ... Same logic ... */ }
}; // End Input object

// <<< EXPORT TO GLOBAL SCOPE >>>
window.Input = Input;
// <<< ------------------------ >>>

console.log("input.js loaded");
