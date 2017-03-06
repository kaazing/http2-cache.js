var util = require('util');
var url = require('url');
var Promise = require("bluebird");
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

//////////////////////////////////////////      Exports                     //////////////////////////////////////////
module.exports = {
    define: define,
    resolvePort: resolvePort,
    getOrigin: getOrigin,
    parseUrl:  parseUrl
};

