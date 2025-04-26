// docs/stateMachine.js

const stateMachine = {
    currentState: 'uninitialized',
    states: ['uninitialized', 'loading', 'homescreen', 'joining', 'playing', 'error'],
    listeners: {}, // { eventName: [callback1, callback2] }

    transitionTo: function(newState, options = {}) {
        if (this.states.indexOf(newState) === -1) { console.error(`[State] Invalid transition: ${newState}`); return; }
        if (newState === this.currentState && !(newState === 'loading' && options.error)) return; // Prevent redundant unless error
        const oldState = this.currentState;
        console.log(`[State] Transition: ${oldState} -> ${newState}`);
        this.currentState = newState;
        this.emit(newState, options); // Emit specific state event
        this.emit('transition', { from: oldState, to: newState, options: options}); // Emit generic event
    },
    on: function(eventName, callback) { if (!this.listeners[eventName]) this.listeners[eventName] = []; this.listeners[eventName].push(callback); },
    emit: function(eventName, options = {}) { if (this.listeners[eventName]) this.listeners[eventName].forEach(callback => { try { callback(options); } catch(e) { console.error(`Error in listener for ${eventName}:`, e); } }); },
    is: function(state) { return this.currentState === state; }
};
window.stateMachine = stateMachine; // Explicitly export globally
console.log("stateMachine.js loaded");
