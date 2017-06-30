var url = require('url'),
    parseUrl = require('url').parse,
    InvalidStateError = require('./errors').InvalidStateError;


var redefine = function (obj, prop, value) {
    if (obj[prop]) {
        // TODO, consider erasing scope/hiding (enumerable: false)
        obj["_" + prop] = obj[prop];
    }
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
    u = (u instanceof url.constructor) ? u : parseUrl(u);
    var port = u.port;
    if (port === null) {
        if (u.protocol === "ws:" || u.protocol === "http:") {
            port = 80;
        } else {
            port = 443;
        }
    }
    return port;
};

var getOrigin = function (u) {
    u = (u instanceof url.constructor) ? u : parseUrl(u);
    return u.protocol + '//' + u.hostname + ':' + resolvePort(u);
};

var defaultPort = function (u, port) {
    var parse = (u instanceof url.constructor) ? u : parseUrl(u);
    if (!port) {
        port = resolvePort(u);
    }
    u = (u instanceof url.constructor) ? u : parseUrl(u);
    return u.protocol + '//' + u.host + ':' + port + parse.path;
};

function Utf8ArrayToStr(array) {
    var out, i, len;
    out = "";
    len = array.length;
    i = 0;
    /* jshint ignore:start */
    var c, char2, char3;
    while (i < len) {
        c = array[i++];
        switch (c >> 4) {
            case 0:
            case 1:
            case 2:
            case 3:
            case 4:
            case 5:
            case 6:
            case 7:
                // 0xxxxxxx
                out += String.fromCharCode(c);
                break;
            case 12:
            case 13:
                // 110x xxxx   10xx xxxx
                char2 = array[i++];
                out += String.fromCharCode(((c & 0x1F) << 6) | (char2 & 0x3F));
                break;
            case 14:
                // 1110 xxxx  10xx xxxx  10xx xxxx
                char2 = array[i++];
                char3 = array[i++];
                out += String.fromCharCode(((c & 0x0F) << 12) |
                    ((char2 & 0x3F) << 6) |
                    ((char3 & 0x3F) << 0));
                break;
        }
    }

    return out;
    /* jshint ignore:end */
}

var mergeTypedArrays = function (a, b) {
    // Checks for truthy values on both arrays
    if(!a && !b) {
        throw 'Please specify valid arguments for parameters a and b.';  
    }

    // Checks for truthy values or empty arrays on each argument
    // to avoid the unnecessary construction of a new array and
    // the type comparison
    if(!b || b.length === 0) {
        return a;
    }

    if(!a || a.length === 0) {
        return b;
    }

    // Make sure that both typed arrays are of the same type
    if(Object.prototype.toString.call(a) !== Object.prototype.toString.call(b)) {
        throw 'The types of the two arguments passed for parameters a and b do not match.';
    }

    var c = new a.constructor(a.length + b.length);
    c.set(a);
    c.set(b, a.length);

    return c;
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
            if (data instanceof Uint8Array) {
                return Utf8ArrayToStr(data);
            }
            return data;
        default:
            return new InvalidStateError("Unexpected Response Type: " + type);
    }
};

var caseInsensitiveEquals = function (str1, str2) {
    return str1.toUpperCase() === str2.toUpperCase();
};

module.exports = {
    Utf8ArrayToStr: Utf8ArrayToStr,
    parseUrl: parseUrl,
    redefine: redefine,
    definePrivate: definePrivate,
    definePublic: definePublic,
    resolvePort: resolvePort,
    getOrigin: getOrigin,
    dataToType: dataToType,
    defaultPort: defaultPort,
    caseInsensitiveEquals: caseInsensitiveEquals,
    mergeTypedArrays: mergeTypedArrays
};


