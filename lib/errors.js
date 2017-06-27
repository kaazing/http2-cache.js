function InvalidStateError(message) {
    this.name = 'InvalidStateError';
    this.message = message;
    this.stack = (new Error()).stack;
}

function TypeError(message) {
    this.name = 'TypeError';
    this.message = message;
    this.stack = (new Error()).stack;
}

module.exports = {
    InvalidStateError: InvalidStateError,
    TypeError: TypeError,
    SyntaxError: SyntaxError
};