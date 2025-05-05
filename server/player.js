// server/player.js
let nextPlayerId = 0;

class Player {
    constructor(socketId, name = 'Shawty') {
        this.id = socketId; // Use socket ID as player ID
        this.name = name;
        this.model = 'Shawty1'; // Later could use avatar selection
        this.position = { x: 0, y: 90, z: 0 }; // Default position, will be set to spawn
        this.rotation = { x: 0, y: 0, z: 0 }; // Euler rotation
        this.health = 100;
        this.velocity = { x: 0, y: 0, z: 0 }; // For server-side movement/physics if needed
        this.isGrounded = false;
        // Add other state: score, ammo, current weapon, etc.
    }

    // Method to apply damage
    takeDamage(amount) {
        this.health -= amount;
        return this.health <= 0; // Return true if dead
    }

    // Reset state for respawn
    respawn(position) {
        this.health = 100;
        this.position = position;
        this.velocity = { x: 0, y: 0, z: 0 };
    }
}

module.exports = Player;
