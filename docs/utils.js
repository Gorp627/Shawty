// docs/utils.js

function lerp(a, b, t) { return a + (b - a) * t; }
function clamp(value, min, max) { return Math.max(min, Math.min(value, max)); }
function randomFloat(min, max) { return Math.random() * (max - min) + min; }
function randomInt(min, max) { min = Math.ceil(min); max = Math.floor(max); return Math.floor(Math.random() * (max - min + 1)) + min; }

// REMOVED createImpactParticle function

console.log("utils.js loaded (Impact Particle Removed)");
