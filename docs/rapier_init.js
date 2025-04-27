// docs/rapier_init.js

// Dynamically import the Rapier library
import RAPIER from 'https://cdn.skypack.dev/@dimforge/rapier3d-compat';

// Wait for Rapier to initialize (load Wasm)
RAPIER.init().then(() => {
    console.log("[Rapier Init] Rapier WASM loaded successfully.");
    // Make the RAPIER object globally accessible
    window.RAPIER = RAPIER;

    // Signal that Rapier is ready using a custom event and flag
    window.dispatchEvent(new CustomEvent('rapier-ready'));
    window.isRapierReady = true;

}).catch(error => {
    console.error("!!! FATAL: Failed to load Rapier WASM !!!", error);
    document.body.innerHTML = "<p style='color:red; font-size: 1.5em; text-align: center;'>FATAL ERROR: Could not load physics engine.</p>";
});
