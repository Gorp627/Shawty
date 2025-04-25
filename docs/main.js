// docs/main.js - Hyper Minimal Test

console.log("Minimal main.js START");

// --- Config ---
const SERVER_URL = 'https://gametest-psxl.onrender.com';

// --- Globals ---
let scene, camera, renderer, clock;
let socket;
let infoDiv;

// --- Init ---
function init() {
    console.log("init() called");
    infoDiv = document.getElementById('info');
    if (!infoDiv) { console.error("! info div not found"); return; }

    try {
        scene = new THREE.Scene();
        scene.background = new THREE.Color(0x337799); // Different background color

        camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        camera.position.z = 5; // Place camera back a bit

        const canvas = document.getElementById('gameCanvas');
        if (!canvas) { console.error("! gameCanvas not found"); return; }
        renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
        renderer.setSize(window.innerWidth, window.innerHeight);

        clock = new THREE.Clock();

        // Add a simple cube to see something
        const geometry = new THREE.BoxGeometry(1, 1, 1);
        const material = new THREE.MeshBasicMaterial({ color: 0x00ff00 }); // Green cube
        const cube = new THREE.Mesh(geometry, material);
        scene.add(cube);

        console.log("Three.js setup minimal OK");
    } catch(e) {
        console.error("!!! Three.js Init FAILED:", e);
        if(infoDiv) infoDiv.textContent = "Graphics Init Error!";
        return; // Stop if graphics fail
    }

    // Setup Socket.IO
    try {
        console.log(`Connecting to Socket.IO: ${SERVER_URL}`);
        socket = io(SERVER_URL, { transports: ['websocket'], autoConnect: true });

        socket.on('connect', function() {
            console.log('Socket connected! ID:', socket.id);
            if(infoDiv) infoDiv.textContent = `Connected: ${socket.id}`;
        });

        socket.on('disconnect', function(reason) {
            console.warn('Disconnected:', reason);
            if(infoDiv) infoDiv.textContent = `Disconnected: ${reason}`;
        });

        socket.on('connect_error', function(err) {
            console.error('Socket Connect Error:', err.message);
            if(infoDiv) infoDiv.textContent = `Connection Failed: ${err.message}`;
        });
         console.log("Socket listeners attached.");
    } catch(e) {
         console.error("!!! Socket.IO Init FAILED:", e);
         if(infoDiv) infoDiv.textContent = "Network Init Error!";
         return; // Stop if socket setup fails
    }


    // Basic Animate Loop
    function animate() {
        requestAnimationFrame(animate);
        // Basic render, no complex logic yet
        if (renderer && scene && camera) {
            scene.rotation.y += 0.005; // Rotate scene slightly to show it's running
            renderer.render(scene, camera);
        }
    }

    // Add Resize Listener
    window.addEventListener('resize', function() {
         if(camera){camera.aspect=window.innerWidth/window.innerHeight;camera.updateProjectionMatrix();}
         if(renderer)renderer.setSize(window.innerWidth,window.innerHeight);
    });

    console.log("Starting minimal animate loop.");
    animate();
}

// --- Start ---
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init(); // DOMContentLoaded has already fired
}

console.log("Minimal main.js END");
