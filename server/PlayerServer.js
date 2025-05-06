// server/PlayerServer.js
import * as CANNON from 'cannon-es';

const PLAYER_HEIGHT = 1.8; // Approximate player height
const PLAYER_RADIUS = 0.4; // Approximate player radius

export class PlayerServer {
    constructor(id, name, character, spawnPosition) {
        this.id = id;
        this.name = name;
        this.character = character; // e.g., "Shawty"
        this.health = 100;
        this.kills = 0;
        this.deaths = 0;

        // Physics Body (using a capsule shape)
        this.body = new CANNON.Body({
            mass: 70, // Player mass in kg
            position: new CANNON.Vec3(spawnPosition.x, spawnPosition.y, spawnPosition.z),
            shape: new CANNON.Sphere(PLAYER_RADIUS), // Simpler sphere for now, capsule is better but more complex to set up
            // TODO: For a capsule, you'd add multiple shapes or use a dedicated Capsule shape if available/created
            linearDamping: 0.9, // To prevent sliding forever
            angularDamping: 0.9,
            fixedRotation: true, // Prevents player from tipping over
        });
        this.body.id = id; // Link body to player id for collision identification

        this.input = {
            forward: false,
            backward: false,
            left: false,
            right: false,
            jump: false,
            dash: false,
        };

        this.velocity = new CANNON.Vec3();
        this.rotation = { y: 0, x: 0 }; // Yaw (y-axis), Pitch (x-axis for looking up/down)
        this.isGrounded = false;
        this.lastDashTime = 0;
        this.lastShootTime = 0;
    }

    getState() {
        return {
            id: this.id,
            name: this.name,
            character: this.character,
            position: { x: this.body.position.x, y: this.body.position.y, z: this.body.position.z },
            rotation: this.rotation, // Send this.rotation, not quaternion for simplicity on client
            health: this.health,
            kills: this.kills,
            deaths: this.deaths,
        };
    }

    applyInput(world) {
        const speed = 5;
        const jumpForce = 350; // Increased jump force
        const dashForce = 15; // Impulse magnitude
        const dashCooldown = 2000; // 2 seconds

        this.velocity.set(0, 0, 0);
        let moveDirection = new CANNON.Vec3();

        if (this.input.forward) moveDirection.z -= 1;
        if (this.input.backward) moveDirection.z += 1;
        if (this.input.left) moveDirection.x -= 1;
        if (this.input.right) moveDirection.x += 1;

        if (moveDirection.lengthSquared() > 0) { // Only apply movement if there's input
            moveDirection.normalize();
            
            // Transform direction to world space based on player's Y rotation
            const euler = new CANNON.Vec3(0, this.rotation.y, 0);
            const quaternion = new CANNON.Quaternion();
            quaternion.setFromEuler(euler.x, euler.y, euler.z);
            moveDirection = quaternion.vmult(moveDirection);

            this.velocity.x = moveDirection.x * speed;
            this.velocity.z = moveDirection.z * speed;
        }
        
        this.body.velocity.x = this.velocity.x;
        this.body.velocity.z = this.velocity.z;


        if (this.input.jump && this.isGrounded) {
            this.body.velocity.y = 0; // Reset vertical velocity before jump
            this.body.applyImpulse(new CANNON.Vec3(0, jumpForce, 0), this.body.position);
            this.isGrounded = false;
            this.input.jump = false; // Consume jump input
        }

        if (this.input.dash && Date.now() - this.lastDashTime > dashCooldown) {
            this.lastDashTime = Date.now();
            let dashDirection = new CANNON.Vec3(0,0,-1); // Default forward dash
            if (moveDirection.lengthSquared() > 0) {
                dashDirection = moveDirection.clone(); // Dash in current movement direction
            } else {
                 // If not moving, dash forward relative to player's orientation
                const euler = new CANNON.Vec3(0, this.rotation.y, 0);
                const quaternion = new CANNON.Quaternion();
                quaternion.setFromEuler(euler.x, euler.y, euler.z);
                dashDirection = quaternion.vmult(new CANNON.Vec3(0,0,-1)); // Forward vector
            }
            
            dashDirection.normalize();
            const dashImpulse = dashDirection.scale(dashForce);
            this.body.applyImpulse(dashImpulse, this.body.position);
            this.input.dash = false; // Consume dash input
        }
    }

    takeDamage(amount, world, gameInstance) {
        this.health -= amount;
        if (this.health <= 0) {
            this.health = 0;
            return true; // Player died
        }
        return false; // Player still alive
    }

    // Call this periodically in server game loop
    update(world) {
        // Check if grounded (simple raycast down)
        const rayFrom = this.body.position.clone();
        const rayTo = this.body.position.clone();
        rayTo.y -= PLAYER_RADIUS + 0.2; // Ray slightly longer than radius
        
        const result = new CANNON.RaycastResult();
        // world.raycastClosest(rayFrom, rayTo, {}, result); // This needs a collision filter
        // For simplicity, assume grounded if Y velocity is very small near ground
        // A more robust check is needed for actual ground detection
        // this.isGrounded = result.hasHit;
        this.isGrounded = Math.abs(this.body.velocity.y) < 0.5; // Very basic ground check
    }
}
