// docs/js/network.js
const network = {
    SERVER_URL: `wss://${location.hostname === 'localhost' || location.hostname === '127.0.0.1' ? 'localhost:3000' : 'gametest-psxl.onrender.com'}`,
    socket: null,
    myPlayerId: null,
    messageQueue: [],
    isConnected: false,
    onConnectedCallback: null,
    onDisconnectedCallback: null,
    onMessageCallback: null, // This will be mainController.onServerMessage


    connect: function(onConnected, onMessage, onDisconnected) {
        this.onConnectedCallback = onConnected;
        this.onMessageCallback = onMessage; // This is mainController.onServerMessage
        this.onDisconnectedCallback = onDisconnected;

        if (window.ui) window.ui.updateLoadingProgress("Connecting to server...");
        console.log("Attempting to connect to:", this.SERVER_URL);

        try {
            this.socket = new WebSocket(this.SERVER_URL);
        } catch (e) {
            console.error("WebSocket creation failed:", e);
            if (window.ui) window.ui.updateLoadingProgress("Connection failed. Check console.");
            if (this.onDisconnectedCallback) this.onDisconnectedCallback();
            return;
        }


        this.socket.onopen = () => {
            console.log('WebSocket connection established.');
            this.isConnected = true;
            // Server sends 'connectionAck' first
        };

        this.socket.onmessage = (event) => {
            let data;
            try {
                data = JSON.parse(event.data);
            } catch (e) {
                console.error("Failed to parse message from server:", event.data, e);
                return;
            }
            // console.log('Network received:', data.type); // Log only type for brevity

            if (data.type === 'connectionAck') {
                 if (window.ui) window.ui.updateLoadingProgress("Connected! Ready to play.");
                 if (this.onConnectedCallback) this.onConnectedCallback();
                 this.processMessageQueue();
            } else {
                if (this.onMessageCallback) {
                    this.onMessageCallback(data); // Pass all other messages to mainController
                }
            }
        };

        this.socket.onclose = (event) => {
            console.warn('WebSocket connection closed.', event.code, event.reason);
            this.isConnected = false;
            this.myPlayerId = null; // Reset player ID on disconnect
            if (window.ui) window.ui.displayCenterEvent("Disconnected from server.", 6000);
            if (this.onDisconnectedCallback) this.onDisconnectedCallback();
            
            // Optional: Reconnect logic (be careful with infinite loops)
            // setTimeout(() => {
            //     if (window.ui) window.ui.updateLoadingProgress("Attempting to reconnect...");
            //     this.connect(this.onConnectedCallback, this.onMessageCallback, this.onDisconnectedCallback);
            // }, 5000);
        };

        this.socket.onerror = (error) => {
            console.error('WebSocket Error:', error);
            if (window.ui) window.ui.updateLoadingProgress("Connection error. Please refresh or check server.");
            if (this.socket && this.socket.readyState !== WebSocket.OPEN && this.socket.readyState !== WebSocket.CONNECTING) {
                 if (this.onDisconnectedCallback) this.onDisconnectedCallback();
            }
        };
    },

    send: function(data) {
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            this.socket.send(JSON.stringify(data));
        } else if (data.type === 'join' && !this.isConnected && this.socket && this.socket.readyState === WebSocket.CONNECTING) {
            console.log("Socket connecting. Queuing message:", data.type);
            this.messageQueue.push(data);
        } else if (!this.isConnected) {
             console.warn("Socket not connected or connecting. Cannot send, queuing message:", data.type);
             this.messageQueue.push(data); // Queue other messages if not connected too
        }
        else {
            console.warn("Socket not open (state: " + this.socket.readyState + "). Cannot send message:", data.type);
        }
    },
    
    processMessageQueue: function() {
        while(this.messageQueue.length > 0) {
            const msg = this.messageQueue.shift();
            console.log("Processing queued message:", msg.type);
            this.send(msg); // This will now use the open socket
        }
    },

    joinGame: function(name, character) {
        this.send({ type: 'join', name, character });
    },

    sendInput: function(inputState, playerRotationQuaternion) {
        this.send({
            type: 'input',
            state: inputState,
            rotation: { 
                x: playerRotationQuaternion.x,
                y: playerRotationQuaternion.y,
                z: playerRotationQuaternion.z,
                w: playerRotationQuaternion.w
            }
        });
    },

    sendShoot: function(aimDirection, isGunPropelActive) {
        this.send({ type: 'shoot', aimDir: aimDirection, gunPropel: isGunPropelActive });
    },

    sendChatMessage: function(message) {
        this.send({ type: 'chat', message });
    }
};

window.network = network; // Make network object globally accessible
