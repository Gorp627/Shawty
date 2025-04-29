// docs/rapier_init.js (REGENERATED v2 - No changes needed)

// Dynamically import the Rapier library
// Using Skypack CDN for compatibility
import RAPIER from 'https://cdn.skypack.dev/@dimforge/rapier3d-compat';

console.log("[Rapier Init] Starting Rapier WASM initialization...");

// Wait for Rapier to initialize (load Wasm)
RAPIER.init().then(() => {
    console.log("[Rapier Init] Rapier WASM loaded and initialized successfully.");

    // Make the RAPIER object globally accessible
    // Ensure it's assigned to window for access by non-module scripts
    window.RAPIER = RAPIER;

    // Signal that Rapier is ready using a custom event and a global flag
    // The flag is useful for immediate checks, the event for listeners.
    window.isRapierReady = true; // Set flag first
    window.dispatchEvent(new CustomEvent('rapier-ready')); // Dispatch event after flag is set
    console.log("[Rapier Init] Dispatched 'rapier-ready' event and set global flag 'isRapierReady'.");

}).catch(error => {
    console.error("!!! FATAL: Failed to load or initialize Rapier WASM !!!", error);
    // Display a clear error message to the user
    document.body.innerHTML = `<p style='color:red; font-size: 1.5em; text-align: center; padding: 20px;'>FATAL ERROR: Could not load the physics engine (Rapier3D).<br/>Please check the console (F12) for details and ensure your browser supports WebAssembly.</p>`;
    // Potentially try to inform other parts of the application
    window.isRapierReady = false; // Explicitly set flag to false on error
    // Dispatch an error event?
    window.dispatchEvent(new CustomEvent('rapier-error', { detail: error }));
    console.error("[Rapier Init] Dispatched 'rapier-error' event.");
});
