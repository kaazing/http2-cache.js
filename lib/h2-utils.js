const util = require('util');
const EventEmitter = require('events').EventEmitter;

const define = function (obj, prop, value) {
    Object.defineProperty(obj, prop, {
        enumerable: obj.propertyIsEnumerable(prop),
        value: value,
        configurable: true
    });
};


//////////////////////////////////////////      ConfEmitter           //////////////////////////////////////////

/*
 * If configuration is taking place, wait on all requests
 */
function ConfEmitter() {
    this.activeConfigurationCnt = 0;
    EventEmitter.call(this);
}

util.inherits(ConfEmitter, EventEmitter);

ConfEmitter.prototype.increment = function () {
    this.activeConfigurationCnt++;
};

ConfEmitter.prototype.decrement = function () {
    this.activeConfigurationCnt--;
    if (this.activeConfigurationCnt == 0) {
        this.emit('completed');
    }
};

ConfEmitter.prototype.configuring = function () {
    return this.activeConfigurationCnt > 0;
};


//////////////////////////////////////////      Exports           //////////////////////////////////////////
module.exports = {
    define: define,
    ConfEmitter: ConfEmitter
};