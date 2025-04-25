// docs/core.js

// ... (init function, animate loop, utilities, input handlers - SAME as Response #65) ...
function init() { /* ... Same ... */ }
function animate() { /* ... Same ... */ }
function onWindowResize() { /* ... Same ... */ }
function onKeyDown(event) { /* ... Same ... */ }
function onKeyUp(event) { /* ... Same ... */ }
function onMouseDown(event) { /* ... Same ... */ }


// --- View Model Functions ---
function attachGunViewModel() {
    if (!gunModel || gunModel === 'error' || !camera) { console.warn("Cannot attach gun: Model/camera missing/fail"); return; }
    if (gunViewModel && gunViewModel.parent === camera) return;
    if (gunViewModel) removeGunViewModel();

    try {
        gunViewModel = gunModel.clone();
        gunViewModel.scale.set(GUN_SCALE, GUN_SCALE, GUN_SCALE);
        gunViewModel.position.copy(GUN_POS_OFFSET);
        currentRecoilOffset.set(0,0,0);

        // *** ADD INITIAL Y ROTATION FOR GUN ***
        // Rotate 180 degrees (PI radians) around Y axis if it's facing backward
        gunViewModel.rotation.y = Math.PI;
        // Add other initial X or Z rotations if needed
        // gunViewModel.rotation.x = -Math.PI / 12; // Example: Slight tilt down
        // ************************************

        camera.add(gunViewModel); // Make gun child of camera
        console.log("Gun view model attached.");
    } catch (e) {
        console.error("Error attaching gun view model:", e);
        gunViewModel = null;
    }
}
function removeGunViewModel() { /* ... Same ... */ }


// ========================================================
// --- START THE APPLICATION ---
// ========================================================
if (document.readyState === 'loading') { console.log("DOM Loading..."); document.addEventListener('DOMContentLoaded', init); }
else { console.log("DOM Ready."); init(); }
console.log("core.js loaded");
