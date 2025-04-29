// docs/utils.js (REGENERATED v2 - Ensure Global Access)

// Linear interpolation
function lerp(a, b, t) {
    // Ensure t is clamped between 0 and 1 for standard lerp behavior
    const clampedT = Math.max(0, Math.min(1, t));
    return a + (b - a) * clampedT;
}

// Clamp value between min and max
function clamp(value, min, max) {
    // Ensure min <= max
    if (min > max) {
        console.warn(`clamp(): min (${min}) was greater than max (${max}). Swapping them.`);
        [min, max] = [max, min]; // Swap using array destructuring
    }
    return Math.max(min, Math.min(value, max));
}

// Random float between min (inclusive) and max (exclusive)
function randomFloat(min, max) {
    // Ensure min and max are valid numbers
    if (typeof min !== 'number' || typeof max !== 'number' || !isFinite(min) || !isFinite(max)) {
        console.error("Invalid input for randomFloat (non-numeric or infinity):", min, max);
        return 0; // Return a default value
    }
    // Ensure min is less than max
    if (min >= max) {
        // console.warn("randomFloat: min value is greater than or equal to max value.");
        // Return min if min >= max, as range is zero or negative
        return min;
    }
    return Math.random() * (max - min) + min;
}

// Random integer between min (inclusive) and max (inclusive)
function randomInt(min, max) {
     // Ensure min and max are valid numbers
    if (typeof min !== 'number' || typeof max !== 'number' || !isFinite(min) || !isFinite(max)) {
        console.error("Invalid input for randomInt (non-numeric or infinity):", min, max);
        return 0; // Return default
    }
    min = Math.ceil(min);   // Ensure min is an integer >= input min
    max = Math.floor(max); // Ensure max is an integer <= input max
    // Ensure min is less than or equal to max after ceil/floor
    if (min > max) {
        // If ceiling of min is greater than floor of max, no integer exists in the range.
        // This can happen e.g., randomInt(5.8, 5.2) -> min=6, max=5
        // console.warn(`randomInt: No integer exists between ceil(${minInput}) and floor(${maxInput}). Returning floor(max).`);
        // Return one of the bounds, perhaps floor(max) is reasonable?
        return max; // Or could return min, or throw error depending on desired behavior
    }
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Export functions globally if not using modules
if (typeof window !== 'undefined') {
    window.lerp = lerp;
    window.clamp = clamp;
    window.randomFloat = randomFloat;
    window.randomInt = randomInt;
}

console.log("utils.js loaded (REGENERATED v2 - Ensure Global)");
