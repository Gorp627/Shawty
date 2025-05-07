// docs/js/network.js
const network = {
    SERVER_URL: `wss://${location.hostname === 'localhost' || location.hostname === '127.0.0.1' ? 'localhost:3000' : 'gametest-psxl.onrender.com'}`, // Auto-detects localhost vs Render
    socket: null,
    myPlayerId: null,
    messageQueue: [],
    isConnected: false,
    onConnectedCallback: null,
    onDisconnectedCallback: null,
    onMessageCallback: null,


    connect: function(onConnected, onMessage, onDisconnected) {
        this.onConnectedCallback = onConnected;
        this.onMessageCallback = onMessage;
        this.onDisconnectedCallback = onDisconnected;

        ui.updateLoadingProgress("Connecting to server...");
        console.log("Attempting to connect to:", this.SERVER_URL);

        this.socket = new WebSocket(this.SERVER_URL);

        this.socket.onopen = () => {
            console.log('WebSocket connection established.');
            this.isConnected = true;
            // The server now sends 'connectionAck' first. Client should wait for that.
        };

        this.socket.onmessage = (event) => {
            const data = JSON.parse(event.data);
            // console.log('Network received:', data);

            if (data.type === 'connectionAck') {
                 ui.updateLoadingProgress("Connected! Ready to play.");
                 if (this.onConnectedCallback) this.onConnectedCallback();
                 this.processMessageQueue(); // Send any queued messages (like join request)
            } else {
                if (this.onMessageCallback) this.onMessageCallback(data);
            }

            if (data.type === 'gameState') { // Initial full state
                this.myPlayerId = data.yourId;
            }
        };

        this.socket.onclose = (event) => {
            console.warn('WebSocket connection closed.', event.code, event.reason);
            this.isConnected = false;
            this.myPlayerId = null;
            ui.displayCenterEvent("Disconnected from server.", 6000);
            if (this.onDisconnectedCallback) this.onDisconnectedCallback();
            // Optional: Attempt to reconnect
            setTimeout(() => {
                ui.updateLoadingProgress("Attempting to reconnect...");
                this.connect(this.onConnectedCallback, this.onMessageCallback, this.onDisconnectedCallback);
            }, 5000);
        };

        this.socket.onerror = (error) => {
            console.error('WebSocket Error:', error);
            ui.updateLoadingProgress("Connection error. Please refresh.");
            // this.socket might be null here if error occurs before open
            if (this.socket && this.socket.readyState !== WebSocket.OPEN && this.socket.readyState !== WebSocket.CONNECTING) {
                 if (this.onDisconnectedCallback) this.onDisconnectedCallback(); // Treat error as disconnect
            }
        };
    },

    send: function(data) {
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            this.socket.send(JSON.stringify(data));
        } else if (data.type === 'join') { // Queue join requests if not connected yet
            console.log("Socket not open. Queuing message:", data.type);
            this.messageQueue.push(data);
        } else {
            console.warn("Socket not open. Cannot send message:", data.type);
        }
    },
    
    processMessageQueue: function() {
        while(this.messageQueue.length > 0) {
            const msg = this.messageQueue.shift();
            console.log("Processing queued message:", msg.type);
            this.send(msg);
        }
    },

    joinGame: function(name, character) {
        this.send({ type: 'join', name, character });
    },

    sendInput: function(inputState, playerRotationQuaternion) { // Send quaternion directly
        this.send({
            type: 'input',
            state: inputState,
            rotation: { // Send as plain object for JSON
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
