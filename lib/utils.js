var url = require('url'),
    util = require("util"),
    InvalidStateError = require('./errors').InvalidStateError;


var resolvePort = function (u) {
    u = (u instanceof url.constructor) ? u : url.parse(u);
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
/* global console */
var parseUrl = function (href) {
    var uri = (href instanceof url.constructor) ? href : url.parse(href);
    uri.port = resolvePort(uri);


    if (
        uri.hostname === null &&
            typeof window !== 'undefined'
    ) {
        uri.protocol = window.location.protocol;
        uri.hostname = window.location.hostname;
        uri.port = window.location.port;
        uri.host = uri.hostname + ':' + uri.port;
        uri.href = uri.protocol + "//" + uri.host + uri.href;
    }

    // Define uri.origin
    uri.origin = uri.hostname + ":" + uri.port;
 
    // Check if host match origin (example.com vs example.com:80)
    if (uri.host !== uri.origin) {
        // Fix href to include default port
        uri.href = uri.href.replace(uri.protocol + "//" + uri.host, uri.protocol + "//" + uri.origin);
        // Fix host to include default port
        uri.host = uri.hostname + ":" + uri.port;
    }

    return uri;
};

var redefine = function (obj, prop, value) {

    if (obj[prop]) {
        // TODO, consider erasing scope/hiding (enumerable: false)
        obj["_" + prop] = obj[prop];
    }

    Object.defineProperty(obj, prop, {
        value: value,
        enumerable: obj.propertyIsEnumerable(prop),
        configurable: true
    });
};

var defineGetter = function (obj, prop, getter) {

    if (obj[prop]) {
        // TODO, consider erasing scope/hiding (enumerable: false)
        obj["_" + prop] = obj[prop];
    }

    Object.defineProperty(obj, prop, {
        enumerable: true,
        configurable: true,
        get: getter
    });
};

var definePrivate = function (obj, prop, value) {
    Object.defineProperty(obj, prop, {
        value: value,
        enumerable: false,
        configurable: true
    });
};

var definePublic = function (obj, prop, value) {
    Object.defineProperty(obj, prop, {
        value: value,
        enumerable: true,
        configurable: true
    });
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
    return u.protocol + '//' + u.hostname + ':' + port + parse.path;
};

// Import String.fromCodePoint polyfill
require('string.fromcodepoint');

var Utf8ArrayToStr = function (array) {
    var c, char2, char3, char4,
        out = "",
        len = array.length,
        i = 0;
        
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
            case 15:
            // 1111 0xxx 10xx xxxx 10xx xxxx 10xx xxxx
            char2 = array[i++];
            char3 = array[i++];
            char4 = array[i++];
            out += String.fromCodePoint(((c & 0x07) << 18) | ((char2 & 0x3F) << 12) | ((char3 & 0x3F) << 6) | (char4 & 0x3F));
                break;
        }
    }

    return out;
};


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

    // On NodeJS < v4 TypeArray.set is not working as expected, 
    // starting NodeJS 6+ TypeArray.set.length is 1 and works properly.
    if (c.set.length > 0) {
        c.set(a, 0);
        c.set(b, a.length);
    // TypedArray.set relly on deprecated Buffer.set on NodeJS < 6 and producing bad merge
    // Using forEach and Native Setter instead  
    } else {
        a.forEach(function (byte, index) { c[index] = byte; });
        b.forEach(function (byte, index) { c[a.length + index] = byte; });
    }
    
    return c;
};

var toArrayBuffer = function (buf) {
    var ab = new ArrayBuffer(buf.length),
        view = new Uint8Array(ab);

    for (var i = 0; i < buf.length; ++i) {
        view[i] = buf[i];
    }

    return ab;
};

var dataToType = function (data, type) {
    // https://developer.mozilla.org/en-US/docs/Web/API/XMLHttpRequest/responseType
    switch (type) {
        case "":
        case "text":
            if (data instanceof Uint8Array) {
                return Utf8ArrayToStr(data);
            }
            return data;
        case "json":
            return JSON.parse(data);
        case "arraybuffer":
            return toArrayBuffer(data);
        case "blob":
            if (typeof Blob !== 'undefined') {
                return new Blob(data);
            } else {
                throw new InvalidStateError("Unsupported Response Type: " + type);
            }
            break;
        case "document":
            if (
                typeof document !== 'undefined' &&
                    typeof document.implementation !== 'undefined' &&
                        typeof document.implementation.createDocument === 'function'
            ) {
                return document.implementation.createDocument('http://www.w3.org/1999/xhtml', 'html', data);
            } else {
                throw new InvalidStateError("Unsupported Response Type: " + type);
            }
            break;
        default:
            throw new InvalidStateError("Unexpected Response Type: " + type);
    }
};

var caseInsensitiveEquals = function (str1, str2) {
    return str1.toUpperCase() === str2.toUpperCase();
};

var serializeXhrBody = function (xhrInfo, body) {


    if (
        typeof body === 'object' &&
            typeof body.entries === 'function'
    ) {
        
        // Display the key/value pairs
        var bodyParts = [],
            pairEntry, partPair,
            iterator = body.entries();

        // TODO detect FormData vs POST 
        // FormData serialization
        // application/x-www-form-urlencoded and multipart/form-data.
        // https://gist.github.com/joyrexus/524c7e811e4abf9afe56
        if (1) {

            var boundary = "----webkitformboundary";
            boundary += (+(new Date())).toString(16);

            while (
                (pairEntry = iterator.next()) &&
                    pairEntry.done === false
            ) {
                partPair = pairEntry.value;

                if (typeof partPair[1] !== "string") {
                    throw new Error("FormData limited support, only string supported");
                }

                var field = util.format('\r\n--%s\r\n', boundary);
                field += util.format('Content-Disposition: form-data; name="%s"\r\n\r\n', partPair[0]);
                field += partPair[1];
                bodyParts.push(field);
            }

            bodyParts.push(util.format('\r\n--%s--', boundary));
            body = bodyParts.join('');

            xhrInfo.setRequestHeader('Content-Length', body.length);
            xhrInfo.setRequestHeader('Content-Type', 'multipart/form-data; boundary=' + boundary);


        } else {

            while (
                (pairEntry = iterator.next()) &&
                    pairEntry.done === false
            ) {
                partPair = pairEntry.value;

                if (typeof partPair[1] !== "string") {
                    throw new Error("FormData limited support, only string supported");
                }

                bodyParts.push(encodeURIComponent(partPair[0]) + '=' + encodeURIComponent(partPair[1]));
            }

            body = bodyParts.join('&');   
        }
        
        xhrInfo.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
    }

    return body;
};

module.exports = {
    parseUrl: parseUrl,
    redefine: redefine,
    defineGetter: defineGetter,
    definePrivate: definePrivate,
    definePublic: definePublic,
    resolvePort: resolvePort,
    getOrigin: getOrigin,
    dataToType: dataToType,
    defaultPort: defaultPort,
    serializeXhrBody: serializeXhrBody,
    caseInsensitiveEquals: caseInsensitiveEquals,
    mergeTypedArrays: mergeTypedArrays,
    Utf8ArrayToStr: Utf8ArrayToStr
};


