// docs/main.js - Minimal Test
console.log("Minimal main.js script started!");

function changeBackground() {
    console.log("Attempting to change background...");
    document.body.style.backgroundColor = "limegreen"; // Change to bright green
    const loading = document.getElementById('loadingScreen');
    if (loading) {
        loading.innerHTML = "<p>Minimal JS Loaded!</p>";
        loading.style.display = 'flex'; // Make sure loading screen is visible
         loading.style.color = 'black';
         loading.style.backgroundColor = 'yellow'; // Make it obvious
    } else {
        console.error("Could not find loadingScreen element!");
    }
    const home = document.getElementById('homeScreen');
    if(home) home.style.display = 'none'; // Hide home screen

     const gameUI = document.getElementById('gameUI');
     if(gameUI) gameUI.style.display = 'none'; // Hide game UI

      const canvas = document.getElementById('gameCanvas');
      if(canvas) canvas.style.display = 'none'; // Hide canvas

      console.log("Background change attempted. Check the screen color and loading text!");
}

// Run the function after the DOM is loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', changeBackground);
} else {
    changeBackground(); // DOMContentLoaded has already fired
}

console.log("Minimal main.js script finished!");
