XMLHttpRequest = require("xhr2").XMLHttpRequest;
require("../lib/http2-proxy");
var assert = require('assert');
var http = require('http');
var http2 = require('http2');
var websocket = require('websocket-stream');

describe('H2 Proxy', function () {

    var config1 = {
        'url': 'http://cache-endpoint1/',
        'options': {
            'transport': 'ws://localhost:7081/',
            'h2PushPath': 'stream'
        }
    };

    var config2 = {
        'url': 'https://cache-endpoint2/',
        'options': {
            'transport': 'ws://localhost:7082/path'
        }
    };

    function getWSTransportServer() {
        return {
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
        };
    }

    // serves the config files
    var configServer;

    before(function (done) {
        configServer = http.createServer(function (request, response) {
            var path = request.url;
            if (path === '/config1') {
                response.writeHead(200, {'Content-Type': 'application/json'});
                response.end(JSON.stringify(config1));
            } else if (path === '/config2') {
                response.writeHead(200, {'Content-Type': 'application/json'});
                response.end(JSON.stringify(config2));

            } else {
                console.warn("Request for unknown path: " + path);
                response.writeHead(404);
                response.end("Not Found");
            }
        });
        configServer.listen(7080, done);
    });

    after(function (done) {
        configServer.close(done);
    });


    var s1;
    var s2;
    var s1OnRequest;
    var s2OnRequest;

    beforeEach(function (done) {
        // starts the 2 h2overWs servers
        s1OnRequest = function (request, response) {
            throw "Unexpected event"
        };

        s2OnRequest = function (request, response) {
            throw "Unexpected event"
        };

        var completed = 0;

        function doneOn2() {
            completed++;
            if (completed == 2) {
                done();
            }
        }

        // start config1 http2 server
        s1 = http2.raw.createServer(getWSTransportServer(), function (request, response) {
            s1OnRequest(request, response);
        });
        s1.listen(7081, doneOn2);

        // start config2 http2 server
        s2 = http2.raw.createServer(getWSTransportServer(), function (request, response) {
            s2OnRequest(request, response);
        });
        s2.listen(7082, doneOn2);
    });

    afterEach(function (done) {

        var completed = 0;

        function doneOn2() {
            completed++;
            if (completed == 2) {
                done();
            }
        }

        s1.close(doneOn2);
        s2.close(doneOn2);
    });

    it('with empty params throws exception', function () {
        assert.throws(function () {
            XMLHttpRequest.proxy()
        });
    });

    it('with no arrays throws exception', function () {
        assert.throws(function () {
                XMLHttpRequest.proxy("https://url");
            }
        )
    });

    it('should load config and start stream for pushs when h2PushPath is set in config', function (done) {
        s1OnRequest = function (request, response) {
            assert.equal(request.url, 'stream', 'should be on streaming url');
            done();
        };
        XMLHttpRequest.proxy(["http://localhost:7080/config1"]);
    });

    it('should load config 2 and start stream for pushs when h2PushPath is set in config', function (done) {
        s1OnRequest = function (request, response) {
            assert.equal(request.url, 'stream', 'should be on streaming url');
            done();
        };
        XMLHttpRequest.proxy(["http://localhost:7080/config1"]);
    });

    it('should load multiple configs', function (done) {
        s1OnRequest = function (request, response) {
            assert.equal(request.url, 'stream', 'should be on streaming url');
            // wait is to confirm it doesn't make a request,
            // perhaps this test can be removed when we have more complex ones using same functionality
            setTimeout(function () {
                done();
            }, 200);
        };
        s2OnRequest = function (request, response) {
            throw "should never be here";
        };
        XMLHttpRequest.proxy(["http://localhost:7080/config1", "http://localhost:7080/config2"]);
    });

    it('should proxy GET request', function (done) {
        var message = "Hello, Dave. You're looking well today.";
        s2OnRequest = function (request, response) {
            // TODO check request headers and requests responses
            assert.equal(request.url, '/path', 'should be on streaming url');
            response.setHeader('Content-Type', 'text/html');
            response.setHeader('Content-Length', message.length);
            response.setHeader('Cache-Control', 'private, max-age=0');
            response.write(message);
            response.end();
        };
        XMLHttpRequest.proxy(["http://localhost:7080/config2"]);
        var xhr = new XMLHttpRequest();

        var statechanges = 0;
        xhr.onreadystatechange = function () {
            assert.equal(++statechanges, xhr.readyState);
            if (xhr.readyState >= 2) {
                assert.equal(200, xhr.status);
                assert.equal("OK", xhr.statusText);
                // TODO assert message
            }
            if (xhr.readyState == 4 && xhr.status == 200) {
                done();
            }
        };
        xhr.open('GET', 'https://cache-endpoint2/path', true);

        xhr.send(null);

    });


    it('should not proxy GET request to different origin', function (done) {
        XMLHttpRequest.proxy(["http://localhost:7080/config2"]);
        var xhr = new XMLHttpRequest();

        var statechanges = 0;
        xhr.onreadystatechange = function () {
            assert.equal(xhr.readyState, ++statechanges);
            if (xhr.readyState >= 2) {
                assert.equal(200, xhr.status);
                assert.equal("OK", xhr.statusText);
            }
            if (xhr.readyState == 4 && xhr.status == 200) {
                done();
            }
        };


        xhr.open('GET', 'http://localhost:7080/config2', true);

        xhr.send(null);

    });

    it('should not proxy GET request to different origin 2', function (done) {
        XMLHttpRequest.proxy(["http://localhost:7080/config2"]);
        var xhr = new XMLHttpRequest();

        var statechanges = 0;
        xhr.onreadystatechange = function () {
            assert.equal(xhr.readyState, ++statechanges);
            if (xhr.readyState >= 2) {
                assert.equal(200, xhr.status);
                assert.equal("OK", xhr.statusText);
            }
            if (xhr.readyState == 4 && xhr.status == 200) {
                done();
            }
        };
        xhr.open('GET', 'http://localhost:7080/config1', true);

        xhr.send(null);

    });
});
