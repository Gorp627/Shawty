// docs/js/network.js
import * as THREE from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.module.js'; // Use module import

let socket = null;
let onConnectCallback = null;
let onDisconnectCallback = null;
let onStateUpdateCallback = null;
let onPlayerJoinedCallback = null;
let onPlayerLeftCallback = null;
let onAssignIdCallback = null;
let onPlayerShotCallback = null;
let onPlayerDiedCallback = null;
let onRespawnCallback = null;
let onApplyPropulsionCallback = null; // Callback for propulsion


export function connectToServer(serverUrl, name, callbacks) {
    // Store callbacks
    onConnectCallback = callbacks.onConnect;
    onDisconnectCallback = callbacks.onDisconnect;
    onStateUpdateCallback = callbacks.onStateUpdate;
    onPlayerJoinedCallback = callbacks.onPlayerJoined;
    onPlayerLeftCallback = callbacks.onPlayerLeft;
    onAssignIdCallback = callbacks.onAssignId;
    onPlayerShotCallback = callbacks.onPlayerShot;
    onPlayerDiedCallback = callbacks.onPlayerDied;
    onRespawnCallback = callbacks.onRespawn;
    onApplyPropulsionCallback = callbacks.onApplyPropulsion; // Store propulsion callback

    socket = io(serverUrl); // Connect using the provided URL

    socket.on('connect', () => {
        console.log('Connected to server!', socket.id);
        // Send join game message with player name
        socket.emit('joinGame', { name: name });
        if (onConnectCallback) onConnectCallback();
    });

    socket.on('disconnect', () => {
        console.log('Disconnected from server.');
        if (onDisconnectCallback) onDisconnectCallback();
        socket = null; // Clear socket reference
    });

    socket.on('assignId', (id) => {
        console.log('Assigned ID:', id);
        if (onAssignIdCallback) onAssignIdCallback(id);
    });

    socket.on('currentState', (state) => {
        // Handle initial game state (all players)
        console.log('Received current state:', state);
        if (onStateUpdateCallback) onStateUpdateCallback(state);
    });

    socket.on('playerJoined', (playerData) => {
        console.log('Player joined:', playerData.name, playerData.id);
        if (onPlayerJoinedCallback) onPlayerJoinedCallback(playerData);
    });

    socket.on('playerLeft', (playerId) => {
        console.log('Player left:', playerId);
        if (onPlayerLeftCallback) onPlayerLeftCallback(playerId);
    });

    socket.on('playerMoved', (data) => {
        // Handle updates for a single player's movement
        if (onStateUpdateCallback) {
            // Adapt the callback to handle single player updates
            const singlePlayerState = {};
            singlePlayerState[data.id] = data; // Create a state object with just this player
             // Note: This assumes onStateUpdateCallback can handle partial updates.
             // You might need a separate callback like onPlayerMovedCallback.
             // For simplicity here, reusing onStateUpdateCallback.
            onStateUpdateCallback(singlePlayerState, true); // Pass true to indicate partial update
        }
    });

     socket.on('playerShot', (data) => {
        if (onPlayerShotCallback) onPlayerShotCallback(data);
    });

    socket.on('playerDied', (data) => {
         console.log("Received playerDied event:", data);
        if (onPlayerDiedCallback) onPlayerDiedCallback(data);
    });

     socket.on('respawn', (data) => {
        console.log("Received respawn event:", data);
        if (onRespawnCallback) onRespawnCallback(data);
    });

     // Listen for propulsion event
    socket.on('applyPropulsion', (data) => {
        console.log("Received applyPropulsion event:", data);
        if (onApplyPropulsionCallback) onApplyPropulsionCallback(data);
    });


    socket.on('connect_error', (err) => {
        console.error('Connection Error:', err.message);
        // Optionally try to reconnect or show an error message to the user
    });
}

export function sendPlayerUpdate(data) {
    if (socket && socket.connected) {
        socket.emit('playerUpdate', data);
    }
}

export function sendShootEvent(data) {
     if (socket && socket.connected) {
        socket.emit('shoot', data); // Send propulsion flag and direction
    }
}

export function sendPlayerDiedEvent(data) {
    if (socket && socket.connected) {
        socket.emit('playerDied', data);
    }
}

export function isConnected() {
    return socket && socket.connected;
}
