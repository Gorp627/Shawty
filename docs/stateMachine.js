// docs/stateMachine.js (Add Character Select State v3)

const stateMachine = {
    currentState: 'uninitialized',
    states: ['uninitialized', 'loading', 'homescreen', 'characterSelect', 'joining', 'playing', 'error'],
    listeners: {}, // { eventName: [callback1, callback2] }
    options: {}, // Store options passed during the last transition

    transitionTo: function(newState, options = {}) {
        if (this.states.indexOf(newState) === -1) {
            console.error(`[StateMachine] Invalid transition target state: ${newState}`);
            return;
        }

        // Prevent redundant transitions, EXCEPT for 'loading' state if new options indicate an error
        const isNewErrorOnLoading = (newState === 'loading' && options.error && !this.options.error);
        if (newState === this.currentState && !isNewErrorOnLoading && newState !== 'loading') {
             // Allow re-transition to loading even without error (e.g., updating loading message)
            // console.log(`[StateMachine] State already '${newState}'. Skipping transition.`);
            return;
        }

        const oldState = this.currentState;
        console.log(`[StateMachine] Transitioning: ${oldState} -> ${newState}`, options); // Log transition and options
        this.currentState = newState;
        this.options = options; // Store options for potential checks by listeners

        // Emit specific state event first (e.g., 'loading', 'playing')
        this.emit(newState, options);

        // Emit generic 'transition' event with details afterwards
        this.emit('transition', { from: oldState, to: newState, options: options });
    },

    // Register an event listener
    on: function(eventName, callback) {
        if (typeof callback !== 'function') {
             console.error(`[StateMachine] Attempted to register non-function callback for event: ${eventName}`);
             return;
        }
        if (!this.listeners[eventName]) {
            this.listeners[eventName] = [];
        }
        this.listeners[eventName].push(callback);
    },

    // Emit an event to all its listeners
    emit: function(eventName, options = {}) {
        if (this.listeners[eventName]) {
            // console.log(`[StateMachine] Emitting event: ${eventName}`, options); // Optional: Log emitted events
            // Use slice() to prevent issues if a listener modifies the array during iteration
            this.listeners[eventName].slice().forEach(callback => {
                try {
                    callback(options); // Pass options data to the listener
                } catch (e) {
                    console.error(`[StateMachine] Error in listener for event '${eventName}':`, e);
                }
            });
        }
    },

    // Check if the current state matches the given state
    is: function(state) {
        return this.currentState === state;
    }
};

// Export globally if not using modules
if (typeof window !== 'undefined') {
    window.stateMachine = stateMachine;
}
console.log("stateMachine.js loaded (v3 - Character Select State)");
