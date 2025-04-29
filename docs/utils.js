// docs/utils.js (REGENERATED v2 - No changes needed)

// Linear interpolation
function lerp(a, b, t) {
    return a + (b - a) * t;
}

// Clamp value between min and max
function clamp(value, min, max) {
    return Math.max(min, Math.min(value, max));
}

// Random float between min (inclusive) and max (exclusive)
function randomFloat(min, max) {
    // Ensure min and max are valid numbers
    if (typeof min !== 'number' || typeof max !== 'number') {
        console.error("Invalid input for randomFloat:", min, max);
        return 0;
    }
    // Ensure min is less than max
    if (min >= max) {
        // console.warn("randomFloat: min value is greater than or equal to max value.");
        // Swap them or return min? Returning min is safer.
        return min;
    }
    return Math.random() * (max - min) + min;
}

// Random integer between min (inclusive) and max (inclusive)
function randomInt(min, max) {
     // Ensure min and max are valid numbers
    if (typeof min !== 'number' || typeof max !== 'number') {
        console.error("Invalid input for randomInt:", min, max);
        return 0;
    }
    min = Math.ceil(min);
    max = Math.floor(max);
    // Ensure min is less than or equal to max after ceil/floor
    if (min > max) {
        // console.warn("randomInt: min value is greater than max value after ceil/floor.");
        // Let's swap them for robustness, though input should ideally be correct.
        [min, max] = [max, min]; // Swap using array destructuring
        // console.warn(`Swapped min/max for randomInt. New min=${min}, max=${max}`);
    }
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

// You might add other utility functions here as needed, e.g.,
// - Vector math helpers (if not using THREE's extensively)
// - Debounce/throttle functions
// - Formatting functions

console.log("utils.js loaded (REGENERATED v2)");
