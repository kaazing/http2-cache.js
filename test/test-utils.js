var http = require('http'),
    http2 = require('http2'),
    websocket = require('websocket-stream');

function createDummyServer(options, start) {
    if (typeof http.createServer === 'undefined') {

        var socket = {
            on: function () {},
            once: function () {},
            listen: function (options, done) {
                setTimeout(done);
                return socket;
            },
            close: function (done) {
                setTimeout(done);
            }
        };

        if (typeof start === 'function') {
            setTimeout(start.bind(null, socket));
        }

        return socket;

    } else {
        return http.createServer(options);
    }
}

function getSocketServer(options, onRequest, start) {
    var http2Server;
    if (typeof websocket.createServer === 'undefined') {
        return createDummyServer(options, start);
    } else {
        http2Server = http2.raw.createServer({
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
        });
        http2Server.listen(options.port, function (){
            console.log("Listening on " + options.port);
            start();
        });   
    }

    return http2Server;
}

function getConfigServer(options, start) {

    var configServer;
    if (typeof http.createServer === 'undefined') {
        return createDummyServer(options, start);

    } else {

        /*global console */
        configServer = http.createServer(function (request, response) {

            var path = request.url;
            
            if (path === '/config') {
                response.writeHead(200, {'Content-Type': 'application/json'});
                response.end(JSON.stringify(options.config));
            } else if (path === '/headers') {
                response.writeHead(200, {'Content-Type': 'application/json'});
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

                        response.writeHead(200, {'Content-Type': 'text/html'});
                        response.end(body);
                    });

                } else {

                    response.writeHead(200, {'Content-Type': 'application/json'});
                    response.end(JSON.stringify({
                        data: Date.now()
                    }));
                }

            } else {
                console.warn("Request for unknown path: " + path);
                response.writeHead(404);
                response.end("Not Found");
            }
        });
        configServer.listen(options.port, function (){
            console.log("Listening on " + options.port);
            start();
        });
    }
    return configServer;
}

function unicodeStringToTypedArray(s) {
    var escstr = encodeURIComponent(s);
    var binstr = escstr.replace(/%([0-9A-F]{2})/g, function(match, p1) {
        return String.fromCharCode('0x' + p1);
    });
    var ua = new Uint8Array(binstr.length);
    Array.prototype.forEach.call(binstr, function (ch, i) {
        ua[i] = ch.charCodeAt(0);
    });
    return ua;
}

function generateRandAlphaNumStr(len) {
    var rdmString = "";
    while (rdmString.length < len) {
        rdmString += Math.random().toString(36).substr(2);
    }
    return rdmString;
}

function lengthInUtf8Bytes(str) {
  // Matches only the 10.. bytes that are non-initial characters in a multi-byte sequence.
  var m = encodeURIComponent(str).match(/%[89ABab]/g);
  return str.length + (m ? m.length : 0);
}


module.exports = {
    generateRandAlphaNumStr: generateRandAlphaNumStr,
    lengthInUtf8Bytes: lengthInUtf8Bytes,
    unicodeStringToTypedArray: unicodeStringToTypedArray,
    getConfigServer: getConfigServer,
    getSocketServer: getSocketServer
};