// docs/stateMachine.js

const stateMachine = {
    currentState: 'uninitialized',
    states: ['uninitialized', 'loading', 'homescreen', 'joining', 'playing', 'error'],
    listeners: {},

    transitionTo: function(newState, options = {}) {
        if (this.states.indexOf(newState) === -1) { console.error(`[State] Invalid state transition: ${newState}`); return; }
        if (newState === this.currentState && !(newState === 'loading' && options.error)) return;
        const oldState = this.currentState;
        console.log(`[State] Transition: ${oldState} -> ${newState}`);
        this.currentState = newState;
        this.emit(newState, options);
        this.emit('transition', { from: oldState, to: newState, options: options});
    },
    on: function(eventName, callback) { if (!this.listeners[eventName]) this.listeners[eventName] = []; this.listeners[eventName].push(callback); },
    emit: function(eventName, options = {}) { if (this.listeners[eventName]) this.listeners[eventName].forEach(callback => callback(options)); },
    is: function(state) { return this.currentState === state; }
};

console.log("stateMachine.js loaded");
