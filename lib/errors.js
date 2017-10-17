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

function DOMException(message) {    
	this.name = 'DOMException';
    this.message = message;
    this.stack = (new Error()).stack;
}

module.exports = {
	DOMException: DOMException,
    InvalidStateError: InvalidStateError,
    TypeError: TypeError
};