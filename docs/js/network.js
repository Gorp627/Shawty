// docs/js/network.js
// Removed unnecessary import: import * as THREE from '...';

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
let onApplyPropulsionCallback = null;
let onPlayerRespawnedCallback = null; // Added for completeness


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
    onApplyPropulsionCallback = callbacks.onApplyPropulsion;
    onPlayerRespawnedCallback = callbacks.onPlayerRespawned; // Store new callback

    socket = io(serverUrl, {
         transports: ['websocket'], // Force websockets if desired/needed
         reconnectionAttempts: 5, // Example: Limit reconnection attempts
    });

    socket.on('connect', () => {
        console.log('Connected to server!', socket.id);
        socket.emit('joinGame', { name: name });
        if (onConnectCallback) onConnectCallback();
    });

    socket.on('disconnect', (reason) => {
        console.log('Disconnected from server. Reason:', reason);
        if (onDisconnectCallback) onDisconnectCallback(reason);
        socket = null;
    });

    socket.on('assignId', (id) => {
        console.log('Assigned ID:', id);
        if (onAssignIdCallback) onAssignIdCallback(id);
    });

    socket.on('currentState', (state) => {
        console.log('Received current state:', state);
        if (onStateUpdateCallback) onStateUpdateCallback(state, false); // Indicate full update
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
        if (onStateUpdateCallback) {
            const singlePlayerState = {};
            singlePlayerState[data.id] = { position: data.position, rotation: data.rotation }; // Only include pos/rot
            onStateUpdateCallback(singlePlayerState, true); // Indicate partial update
        }
    });

     socket.on('playerShot', (data) => {
        if (onPlayerShotCallback) onPlayerShotCallback(data);
    });

    socket.on('playerDied', (data) => {
         console.log("Network received playerDied event:", data);
        if (onPlayerDiedCallback) onPlayerDiedCallback(data);
    });

     socket.on('respawn', (data) => { // For local player
        console.log("Network received respawn event:", data);
        if (onRespawnCallback) onRespawnCallback(data);
    });

     socket.on('playerRespawned', (data) => { // For remote players
        console.log("Network received playerRespawned event:", data);
        if (onPlayerRespawnedCallback) onPlayerRespawnedCallback(data);
    });


    socket.on('applyPropulsion', (data) => {
        console.log("Network received applyPropulsion event:", data);
        if (onApplyPropulsionCallback) onApplyPropulsionCallback(data);
    });


    socket.on('connect_error', (err) => {
        console.error('Connection Error:', err.message);
        // Show error to user? Attempt manual reconnect?
    });

     socket.on('disconnect', (reason) => {
        console.error('Socket disconnected:', reason);
         if (reason === 'io server disconnect') {
             // the disconnection was initiated by the server, you need to reconnect manually
             // socket.connect(); // Might not be wise without conditions
             alert("Server disconnected you.");
         }
        // else the socket will automatically try to reconnect
        if (onDisconnectCallback) onDisconnectCallback(reason);
    });
}

export function sendPlayerUpdate(data) {
    if (socket?.connected) { // Optional chaining and check connected status
        socket.emit('playerUpdate', data);
    }
}

export function sendShootEvent(data) {
     if (socket?.connected) {
        socket.emit('shoot', data);
    }
}

export function sendPlayerDiedEvent(data) {
    if (socket?.connected) {
        socket.emit('playerDied', data);
    }
}

export function isConnected() {
    return socket?.connected ?? false; // Return false if socket is null/undefined
}
