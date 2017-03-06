var url = require('url');
var parseUrl = url.parse;

var redefine = function (obj, prop, value) {
    Object.defineProperty(obj, prop, {
        enumerable: obj.propertyIsEnumerable(prop),
        value: value,
        configurable: true
    });
};

var definePrivate = function (obj, prop, value) {
    Object.defineProperty(obj, prop, {
        enumerable: false,
        value: value,
        configurable: true
    });
};

var definePublic = function (obj, prop, value) {
    Object.defineProperty(obj, prop, {
        enumerable: true,
        value: value,
        configurable: true
    });
};

var resolvePort = function (u) {
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

var getOrigin = function (u) {
    u = (u instanceof url.constructor) ? u : parseUrl(u);
    return u.protocol + '//' + u.host + ':' + resolvePort(u);
};

var dataToType = function (data, type) {
    // https://developer.mozilla.org/en-US/docs/Web/API/XMLHttpRequest/responseType
    switch (type) {
        case "arraybuffer":
            // TODO, make TextEncoder a singleton
            return new TextEncoder('UTF-8').encode(data);
        case "blob":
            return new Blob(data);
        case "document":
            return document.implementation.createDocument('http://www.w3.org/1999/xhtml', 'html', data);
        case "json":
            return JSON.parse(data);
        case "":
        case "text":
            return data;
        default:
            return new InvalidStateError("Unexpect Response Type: " + type);
    }
};

function InvalidStateError(message) {
    this.name = 'InvalidStateError';
    this.message = message;
    this.stack = (new Error()).stack;
}

//////////////////////////////////////////      Exports                     //////////////////////////////////////////
module.exports = {
    redefine: redefine,
    definePrivate: definePrivate,
    definePublic: definePublic,
    resolvePort: resolvePort,
    getOrigin: getOrigin,
    dataToType: dataToType,
    InvalidStateError: InvalidStateError,
    SyntaxError: SyntaxError,
    parseUrl: parseUrl
};

