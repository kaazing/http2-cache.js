var util = require('util');
var EventEmitter = require('events').EventEmitter;
var url = require('url');

var parseUrl =  url.parse;

var define = function (obj, prop, value) {
    Object.defineProperty(obj, prop, {
        enumerable: obj.propertyIsEnumerable(prop),
        value: value,
        configurable: true
    });
};

var resolvePort = function(u) {
    var parse = (u instanceof url.constructor) ? u : parseUrl(u);
    var port = parse.port;
    if (port === null) {
        var s = parse.scheme;
        if (s === "ws" || s === "http") {
            port = 80;
        } else {
            port = 443;
        }
    }
    return port;
};

var getOrigin = function(u) {
    u = (u instanceof url.constructor) ? u : parseUrl(u);
    return u.protocol + '//' + u.host + ':' + resolvePort(u);
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
    if (this.activeConfigurationCnt === 0) {
        this.emit('completed');
    }
};

ConfEmitter.prototype.configuring = function () {
    return this.activeConfigurationCnt > 0;
};


//////////////////////////////////////////      Exports           //////////////////////////////////////////
module.exports = {
    define: define,
    resolvePort: resolvePort,
    getOrigin: getOrigin,
    ConfEmitter: ConfEmitter,
    parseUrl:  parseUrl
};
