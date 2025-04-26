// docs/stateMachine.js

const stateMachine = {
    currentState: 'uninitialized',
    states: ['uninitialized', 'loading', 'homescreen', 'joining', 'playing', 'error'],
    listeners: {}, // { eventName: [callback1, callback2] }

    transitionTo: function(newState, options = {}) {
        if (this.states.indexOf(newState) === -1) {
            console.error(`[State] Invalid state transition attempted: ${newState}`);
            return;
        }
        if (newState === this.currentState && !(newState === 'loading' && options.error)) {
             // console.warn(`[State] Already in state: ${newState}`);
             return;
        }

        const oldState = this.currentState;
        console.log(`[State] Transition: ${oldState} -> ${newState}`);
        this.currentState = newState;
        this.emit(newState, options); // Emit event *for the new state*
        this.emit('transition', { from: oldState, to: newState, options: options}); // Emit generic transition event
    },

    on: function(eventName, callback) { if (!this.listeners[eventName]) { this.listeners[eventName] = []; } this.listeners[eventName].push(callback); },
    emit: function(eventName, options = {}) { if (this.listeners[eventName]) { this.listeners[eventName].forEach(callback => callback(options)); } },
    is: function(state) { return this.currentState === state; }
};

console.log("stateMachine.js loaded");
