// docs/utils.js (REGENERATED v2 - Ensure Global Access)

// Linear interpolation
function lerp(a, b, t) {
    const clampedT = Math.max(0, Math.min(1, t));
    return a + (b - a) * clampedT;
}

// Clamp value between min and max
function clamp(value, min, max) {
    if (min > max) { [min, max] = [max, min]; }
    return Math.max(min, Math.min(value, max));
}

// Random float between min (inclusive) and max (exclusive)
function randomFloat(min, max) {
    if (typeof min !== 'number' || typeof max !== 'number' || !isFinite(min) || !isFinite(max)) { return 0; }
    if (min >= max) { return min; }
    return Math.random() * (max - min) + min;
}

// Random integer between min (inclusive) and max (inclusive)
function randomInt(min, max) {
    if (typeof min !== 'number' || typeof max !== 'number' || !isFinite(min) || !isFinite(max)) { return 0; }
    min = Math.ceil(min);
    max = Math.floor(max);
    if (min > max) { return max; }
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Export functions globally if not using modules
// This ensures they are available to other scripts loaded via <script>
if (typeof window !== 'undefined') {
    window.lerp = lerp;
    window.clamp = clamp;
    window.randomFloat = randomFloat;
    window.randomInt = randomInt;
}

console.log("utils.js loaded (Using Global Scope)");
