var http = require('http'),
    http2 = require('http2.js'),
    websocket = require('websocket-stream');

/* jshint ignore:start */
if (typeof XMLHttpRequest === 'undefined') {
    XMLHttpRequest = require("xhr2").XMLHttpRequest;   
}

function _createRemoteSocketServer(options, onRequest, onStart) {
    var xhrConfig = new XMLHttpRequest();
    
    if (typeof onStart === 'function') {
        setTimeout(onStart.bind(null));
    }

    return {        
        close: function (done) {
            if (typeof done === 'function') {
                setTimeout(done.bind(null));
            }
        }
    };
}

function _getSocketServer(options, onRequest, onStart) {
    return http2.raw.createServer({
        transport: function (options, start) {

            var lastSocketKey = 0;
            var socketMap = {};
            var httpServer = http.createServer();
            options.server = httpServer;

            var res = websocket.createServer(options, start);
            res.listen = function (options, cb) {
                var listener = httpServer.listen(options, cb);
                listener.on('connection', function (socket) {
                    /* generate a new, unique socket-key */
                    var socketKey = ++lastSocketKey;
                    /* add socket when it is connected */
                    socketMap[socketKey] = socket;
                    socket.on('close', function () {
                        /* remove socket when it is closed */
                        delete socketMap[socketKey];
                    });
                });
            };

            res.close = function (cb) {
                Object.keys(socketMap).forEach(function (socketKey) {
                    socketMap[socketKey].destroy();
                });
                httpServer.close(cb);
            };
            return res;
        }
    }, function (request, response) {
        onRequest(request, response);
    }).listen(options.port, function (){
        console.log("Listening on " + options.port);
        if (typeof onStart === 'function') {
            onStart();
        }
    });   
}

function _getRemoteConfigServer(options, onStart) {
    var xhrConfig = new XMLHttpRequest();
    
    if (typeof onStart === 'function') {
        setTimeout(onStart.bind(null));
    }

    return {        
        close: function (done) {
            if (typeof done === 'function') {
                setTimeout(done.bind(null));
            }
        }
    };
}

var defaultResponseHeaders = {
    "Access-Control-Allow-Headers": [
        'Origin',
        'DNT',
        'Keep-Alive',
        'User-Agent',
        'X-Requested-With',
        'X-XSRF-TOKEN',
        'Cache-Control',
        "Content-Type",
        "Content-Length",
        'Accept',
        'Authorization',
        'Access-Control-Expose-Headers',
        'x-requested-custom',
        'x-my-custom',
        'If-Match',
        'If-Modified-Since',
        'If-None-Match',
        'If-Range',
        'If-Unmodified-Since'
    ].join(','),
    'Access-Control-Allow-Origin': '*',
    "Access-Control-Allow-Methods": ['PUT', 'POST', 'GET', 'DELETE', 'OPTIONS'].join(','),
    "Access-Control-Allow-Credentials": true
};


function generateRandAlphaNumStr(len) {
    var rdmString = "";
    while (rdmString.length < len) {
        rdmString += Math.random().toString(36).substr(2);
    }
    return rdmString;
}

var UTF8_BYTES_REG = /%[89ABab]/g;
function lengthInUtf8Bytes(str) {
  // Matches only the 10.. bytes that are non-initial characters in a multi-byte sequence.
  var m = encodeURIComponent(str).match(UTF8_BYTES_REG);
  return str.length + (m ? m.length : 0);
}


function sendResponse(request, response, body) {
    response.writeHead(200, Object.assign({
        "Content-Type": 'text/plain; charset=utf-8',
        // TODO 'Content-Length' via lengthInUtf8Bytes ?
    }, defaultResponseHeaders));
    var buf = Buffer.from(body, 'utf8');
    response.write(buf);
    response.end();
}

var zlib = require('zlib');
function sendGzipResponse(request, response, body) {

    var acceptEncoding = request.headers['accept-encoding'];
    if (!acceptEncoding) {
        acceptEncoding = '';
    }

    // Note: this is not a conformant accept-encoding parser.
    // See http://www.w3.org/Protocols/rfc2616/rfc2616-sec14.html#sec14.3
    if (acceptEncoding.match(/\bdeflate\b/)) {
        response.writeHead(200, Object.assign({
            "Content-Type": 'text/plain; charset=utf-8',
            "content-encoding": 'deflate'
        }, defaultResponseHeaders));
        response.write(Buffer.from(zlib.deflateSync(body)));
        response.end();
    } else if (acceptEncoding.match(/\bgzip\b/)) {
        response.writeHead(200, Object.assign({
            "Content-Type": 'text/plain; charset=utf-8',
            "content-encoding": 'gzip'
        }, defaultResponseHeaders));
        response.write(Buffer.from(zlib.gzipSync(body)));
        response.end();
    } else {
        send(request, response, body);
    }
}

function _getConfigServer(options, onStart) {

    return http.createServer(function (request, response) {

        var path = request.url;
        
        if (path === '/config') {
            response.writeHead(200, Object.assign({
                'Content-Type': 'application/json'
            }, defaultResponseHeaders));
            response.end(JSON.stringify(options.config));
        } else if (path === '/headers') {
            response.writeHead(200, Object.assign({
                'Content-Type': 'application/json'
            }, defaultResponseHeaders));
            var requestHeader = request.headers;
            delete requestHeader["user-agent"];
            response.end(JSON.stringify(request.headers));
        } else if (path.indexOf('/path') === 0) {
            var body;
            if (request.method === "POST") {
                body = [];
                request.on('data', function(chunk) {
                  body.push(chunk);
                }).on('end', function() {

                    // at this point, `body` has the entire request body stored in it as a string
                    body = Buffer.concat(body).toString();

                    response.writeHead(200, Object.assign({
                        'Content-Type': 'text/html'
                    }, defaultResponseHeaders));
                    response.end(body);
                });

            } else {
                response.writeHead(200, Object.assign({
                    'Content-Type': 'application/json'
                }, defaultResponseHeaders));
                response.end(JSON.stringify({
                    data: Date.now()
                }));
            }
        } else if (path.startsWith("/charof")) {
            var charSize = parseInt(request.url.replace("/charof", ""), 10) || 8192;
            var charBody = generateRandAlphaNumStr(charSize);
            var charLength = lengthInUtf8Bytes(charBody);
            sendResponse(request, response, charBody);

        } else if (path.startsWith("/gzip/charof")) {
            var charSize = parseInt(request.url.replace("/gzip/charof", ""), 10) || 8192;
            var charBody = generateRandAlphaNumStr(charSize);
            var charLength = lengthInUtf8Bytes(charBody);
            sendGzipResponse(request, response, charBody);

        } else {
            response.writeHead(404);
            response.end("Not Found");
        }
    }).listen(options.port, function () {
        console.log("Listening on " + options.port);
        if (typeof onStart === 'function') {
            onStart();
        }
    });
}


var UNICODE_BYTES_REG = /%([0-9A-F]{2})/g;
function unicodeStringToTypedArray(s) {
    var escstr = encodeURIComponent(s);
    var binstr = escstr.replace(UNICODE_BYTES_REG, function(match, p1) {
        return String.fromCharCode('0x' + p1);
    });
    var ua = new Uint8Array(binstr.length);
    Array.prototype.forEach.call(binstr, function (ch, i) {
        ua[i] = ch.charCodeAt(0);
    });
    return ua;
}

function getConfigServer(options, onStart) {
    if (
        typeof window !== 'undefined' || 
            typeof WorkerGlobalScope !== 'undefined' && self instanceof WorkerGlobalScope
    ) {
        return _getRemoteConfigServer(options, onStart);
    } else {
        return _getConfigServer(options, onStart);
    }
}


function getSocketServer(options, onRequest, onStart) {
    if (
        typeof window !== 'undefined' || 
            typeof WorkerGlobalScope !== 'undefined' && self instanceof WorkerGlobalScope
    ) {
        return _createRemoteSocketServer(options, onRequest, onStart);
    } else {
        return _getSocketServer(options, onRequest, onStart);
    }
}

function getSocketTestServer(options, onStart) {
    return getSocketServer(options, function (request, response) {

        if (request.url.startsWith("/charof")) {
            var charSize = parseInt(request.url.replace("/charof", ""), 10) || 8192,
                charBody = generateRandAlphaNumStr(charSize),
                charLength = lengthInUtf8Bytes(charBody);
            sendResponse(request, response, charBody);
        } else if (request.url.startsWith("/gzip/charof")) {
            var charGzipSize = parseInt(request.url.replace("/charof", ""), 10) || 8192,
                charGzipBody = generateRandAlphaNumStr(charGzipSize);
            //send(request, response, charBody);
            sendGzipResponse(request, response, charGzipBody);
        } else {
            response.writeHead(404);
            response.end("Not Found");
        }
    }, onStart);
}

module.exports = {
    sendResponse: sendResponse,
    sendGzipResponse: sendGzipResponse,
    generateRandAlphaNumStr: generateRandAlphaNumStr,
    lengthInUtf8Bytes: lengthInUtf8Bytes,
    unicodeStringToTypedArray: unicodeStringToTypedArray,
    getConfigServer: getConfigServer,
    getSocketTestServer: getSocketTestServer,
    getSocketServer: getSocketServer
};