// docs/core.js

// ========================================================
// INITIALIZATION FUNCTION DEFINITION
// ========================================================
function init() { /* ... Same checks and setup ... */ }

// --- Animation Loop ---
function animate() { /* ... Same ... */ }

// --- Utility Functions ---
function onWindowResize() { /* ... Same ... */ }

// --- Input Handlers ---
function onKeyDown(event) { /* ... Same ... */ }
function onKeyUp(event) { /* ... Same ... */ }
function onMouseDown(event) { /* ... Same ... */ }

// --- View Model Functions (Ensure Added to CAMERA) ---
function attachGunViewModel() {
    if (!gunModel || gunModel === 'error' || !camera) { console.warn("Cannot attach gun: Model/camera missing/fail"); return; }
    if (gunViewModel && gunViewModel.parent === camera) return; // Already attached to camera
    if (gunViewModel) removeGunViewModel(); // Clean up previous if any

    try {
        gunViewModel = gunModel.clone();
        gunViewModel.scale.set(GUN_SCALE, GUN_SCALE, GUN_SCALE);
        gunViewModel.position.copy(GUN_POS_OFFSET);
        currentRecoilOffset.set(0,0,0);
        // *** ATTACH TO CAMERA ***
        camera.add(gunViewModel);
        // ************************
        console.log("Gun view model attached TO CAMERA.");
    } catch (e) {
        console.error("Error attaching gun view model:", e);
        gunViewModel = null;
    }
}
function removeGunViewModel() {
    if (gunViewModel && camera) { // Check if gun exists AND camera exists
        try {
             // *** REMOVE FROM CAMERA ***
             camera.remove(gunViewModel);
             // **************************
             // Dispose resources if necessary (depends on cloning strategy)
             gunViewModel = null;
             console.log("Gun view model removed FROM CAMERA.");
        } catch (e) {
            console.error("Error removing gun view model:", e);
            gunViewModel = null;
        }
    }
}

// ========================================================
// --- START THE APPLICATION ---
// ========================================================
if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', init); } else { init(); }
console.log("core.js loaded");
