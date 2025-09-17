// State management for the application
class StateManager {
    static saveCheckState(state) {
        // Save each piece of state individually
        sessionStorage.setItem('condition', state.condition);
        sessionStorage.setItem('who', state.who);
        sessionStorage.setItem('what', state.what ?? '');
        sessionStorage.setItem('duration', state.duration ?? '');
        sessionStorage.setItem('meds', state.meds ?? '');
        sessionStorage.setItem('action', state.action ?? '');
        sessionStorage.setItem('answers', JSON.stringify(state.answers || {}));
        sessionStorage.setItem('flags', JSON.stringify(state.flags || []));
        sessionStorage.setItem('cautions', JSON.stringify(state.cautions || []));
    }

    static getStoredState() {
        return {
            condition: sessionStorage.getItem('condition'),
            who: sessionStorage.getItem('who'),
            what: sessionStorage.getItem('what'),
            duration: sessionStorage.getItem('duration'),
            meds: sessionStorage.getItem('meds'),
            action: sessionStorage.getItem('action'),
            answers: JSON.parse(sessionStorage.getItem('answers') || '{}'),
            flags: JSON.parse(sessionStorage.getItem('flags') || '[]'),
            cautions: JSON.parse(sessionStorage.getItem('cautions') || '[]')
        };
    }

    static clearState() {
        sessionStorage.removeItem('condition');
        sessionStorage.removeItem('who');
        sessionStorage.removeItem('what');
        sessionStorage.removeItem('duration');
        sessionStorage.removeItem('meds');
        sessionStorage.removeItem('action');
        sessionStorage.removeItem('answers');
        sessionStorage.removeItem('flags');
        sessionStorage.removeItem('cautions');
    }

    static validateState() {
        const required = ['condition', 'who'];
        const state = this.getStoredState();
        return required.every(key => state[key]);
    }
}

// Make StateManager available globally
window.StateManager = StateManager;
