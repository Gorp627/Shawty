// docs/js/network.js
// No Three.js imports should be in this file

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

    console.log(`Attempting to connect to server at ${serverUrl}`);
    socket = io(serverUrl, {
         transports: ['websocket'], // Prefer websockets
         reconnectionAttempts: 5,
         timeout: 10000, // Connection timeout
    });

    // --- Socket Event Listeners ---
    socket.on('connect', () => {
        console.log('Socket connected! ID:', socket.id);
        console.log('Emitting joinGame event with name:', name);
        socket.emit('joinGame', { name: name });
        if (onConnectCallback) onConnectCallback();
    });

    socket.on('disconnect', (reason) => {
        console.warn('Socket disconnected. Reason:', reason);
        if (onDisconnectCallback) onDisconnectCallback(reason);
        socket = null; // Clear reference
    });

    socket.on('connect_error', (err) => {
        console.error('Socket Connection Error:', err.message, err.data);
        // Optionally show an error message to the user
        // alert(`Failed to connect to the server: ${err.message}`);
    });

    socket.on('assignId', (id) => {
        console.log('Received assignId event:', id);
        if (onAssignIdCallback) onAssignIdCallback(id);
    });

    socket.on('currentState', (state) => {
        console.log('Received currentState event:', Object.keys(state).length, 'players');
        if (onStateUpdateCallback) onStateUpdateCallback(state, false); // false = full update
    });

    socket.on('playerJoined', (playerData) => {
        console.log('Received playerJoined event:', playerData.id);
        if (onPlayerJoinedCallback) onPlayerJoinedCallback(playerData);
    });

    socket.on('playerLeft', (playerId) => {
        console.log('Received playerLeft event:', playerId);
        if (onPlayerLeftCallback) onPlayerLeftCallback(playerId);
    });

    socket.on('playerMoved', (data) => {
        // console.log('Received playerMoved event:', data.id); // Very spammy
        if (onStateUpdateCallback) {
            const singlePlayerState = {};
            // Ensure we only include relevant fields for a move update
            singlePlayerState[data.id] = { position: data.position, rotation: data.rotation };
            onStateUpdateCallback(singlePlayerState, true); // true = partial update
        }
    });

     socket.on('playerShot', (data) => {
        // console.log('Received playerShot event:', data.shooterId); // Spammy
        if (onPlayerShotCallback) onPlayerShotCallback(data);
    });

    socket.on('playerDied', (data) => {
         console.log("Received playerDied event from server:", data);
        if (onPlayerDiedCallback) onPlayerDiedCallback(data);
    });

     socket.on('respawn', (data) => { // For local player
        console.log("Received respawn event (for local player):", data);
        if (onRespawnCallback) onRespawnCallback(data);
    });

     socket.on('playerRespawned', (data) => { // For remote players
        console.log("Received playerRespawned event (for remote player):", data);
        if (onPlayerRespawnedCallback) onPlayerRespawnedCallback(data);
    });

    socket.on('applyPropulsion', (data) => {
        console.log("Received applyPropulsion event:", data);
        if (onApplyPropulsionCallback) onApplyPropulsionCallback(data);
    });

}

// --- Functions to Emit Events ---
export function sendPlayerUpdate(data) {
    if (socket?.connected) {
        // console.log("Sending playerUpdate:", data); // Very spammy
        socket.emit('playerUpdate', data);
    } else {
        // console.warn("Cannot send playerUpdate: Socket not connected.");
    }
}

export function sendShootEvent(data) {
     if (socket?.connected) {
        // console.log("Sending shoot event:", data); // Spammy
        socket.emit('shoot', data);
    } else {
         console.warn("Cannot send shoot event: Socket not connected.");
    }
}

export function sendPlayerDiedEvent(data) {
    if (socket?.connected) {
        console.log("Sending playerDied event:", data);
        socket.emit('playerDied', data);
    } else {
         console.warn("Cannot send playerDied event: Socket not connected.");
    }
}

export function isConnected() {
    return socket?.connected ?? false;
}
