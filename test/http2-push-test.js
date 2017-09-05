/* global console */
var chai = require('chai');
var assert = chai.assert;

/* jshint ignore:start */
if (typeof XMLHttpRequest === 'undefined') {
    XMLHttpRequest = require("xhr2").XMLHttpRequest;   
}
/* jshint ignore:end */
require("../lib/http2-cache");

var assert = require('assert'),
    http = require('http'),
    http2 = require('http2.js'),
    getSocketServer = require('./test-utils.js').getSocketServer,
    getConfigServer = require('./test-utils').getConfigServer;

describe('http2-push', function () {

    var config = {
        'push': 'http://cache-endpoint1/stream',
        'transport': 'ws://localhost:7081/',
        'proxy': [
            'http://cache-endpoint1/',
            'http://cache-endpoint4/'
        ]
    };

    var configServer;

    before(function (done) {
        configServer = getConfigServer({
            config: config,
            port: 7080
        }, done);
    });


    after(function (done) {
        configServer.close(done);
    });

    var socket;
    var socketOnRequest;

    beforeEach(function (done) {
        // starts the 2 h2overWs servers
        socketOnRequest = function (request, response) {
            throw new Error("socketOnRequest Unexpected request: " + request.url);
        };

        // start config http2 server
        socket = getSocketServer({
            port: 7081
        }, function (request, response) {
            socketOnRequest(request, response);
        }, done);
    });

    afterEach(function (done) {
        socket.close(done);
    });

    it('should not proxy different origin GET requests and pass headers', function (done) {
        XMLHttpRequest.proxy(["http://localhost:7080/config"]);
        var xhr = new XMLHttpRequest();
        var xhr2 = new XMLHttpRequest();

        var doneCnt = 0;

        function doneN(n) {
            if (++doneCnt === n) {
                done();
            }
        }

        var statechanges = 0;
        xhr.onreadystatechange = function () {
            assert.equal(xhr.readyState, statechanges++);
            if (xhr.readyState >= 2) {
                assert.equal(200, xhr.status);
                assert.equal("OK", xhr.statusText);
            }
            if (xhr.readyState === 4 && xhr.status === 200) {
                assert.equal(JSON.stringify({
                    "content-type": "application/json",
                    "x-custom-header": "MyValue",
                    "connection": "keep-alive",
                    "host": "localhost:7080",
                    "content-length": "0"
                }), xhr.responseText);
                doneN(3);
            }
        };

        xhr.onloadstart = function () {
            xhr.onprogress = function () {
                xhr.onload = function () {
                    xhr.onloadend = function () {
                        doneN(3);
                    };
                };
            };
        };

        var statechanges2 = 0;
        xhr2.onreadystatechange = function () {
             assert.equal(xhr2.readyState, statechanges2++);
            if (xhr2.readyState >= 2) {
                assert.equal(xhr2.status, 200);
                assert.equal(xhr2.statusText, "OK");
            }
            if (xhr2.readyState === 4 && xhr2.status === 200) {
                xhr2.addEventListener('load', function () {
                    assert.equal(JSON.stringify(config), xhr2.responseText);
                    doneN(3);
                });
            }
        };

        xhr.open('GET', 'http://localhost:7080/headers', true);
        xhr.setRequestHeader('Content-Type', 'application/json');
        xhr.setRequestHeader('X-Custom-Header', 'MyValue');

        xhr.send(null);
        xhr2.open('GET', 'http://localhost:7080/config', true);
        xhr2.send(null);
    });

    it('should use pushed results in cache', function (done) {
        var message = "Affirmative, Dave. I read you. ";
        var date = new Date().toString();
        var xhr = new XMLHttpRequest();
        socketOnRequest = function (request, response) {
            assert.equal(request.url, '/stream', 'should be on streaming url');
            var pr = response.push({
                'path': '/pushedCache1',
                'protocol': 'http:'
            });
            pr.setHeader('Content-Type', 'text/html');
            pr.setHeader('Content-Length', message.length);
            pr.setHeader('Cache-Control', 'max-age=500');
            pr.setHeader('Date', date);
            pr.write(message);
            pr.end();
            var statechanges = 0;
            xhr.onreadystatechange = function () {
                ++statechanges;
                // TODO !=1 is due to bug
                if(statechanges !== 1) {
                    assert.equal(xhr.readyState, statechanges);
                }
                if (xhr.readyState >= 2) {
                    assert.equal(xhr.status, 200);
                    assert.equal(xhr.statusText, "OK");
                }

                if (xhr.readyState >= 3) {
                    assert.equal(xhr.response, message);
                }

                if (xhr.readyState === 4 && xhr.status === 200) {
                    assert.equal(xhr.getResponseHeader('content-type'), 'text/html');
                    assert.equal(xhr.getAllResponseHeaders(), 'content-type: text/html\ncontent-length: ' + message.length + '\ncache-control: max-age=500\ndate: ' + date);
                    done();
                }
            };
            xhr.open('GET', 'http://cache-endpoint1/pushedCache1', true);

            // There is a race between xhr.js and push with out subscribe
            xhr.subscribe(function () {
                xhr.unsubscribe();
                xhr.send(null);
            });
        };
        XMLHttpRequest.proxy(["http://localhost:7080/config"]);
    });

    it('should cache GET request and not reuse response if last push was invalid', function (done) {
        var messages = [
            "Hello, Dave. You're looking well today.",
            "Do you want to be my friend, Dave ?",
            "Affirmative, Dave. I read you. "
        ];
        var requestCount = 0;
        socketOnRequest = function (request, response) {
            requestCount++;
            if (requestCount === 1) {
                // TODO check request headers and requests responses
                assert.equal(request.url, '/stream');
                response.setHeader('Content-Type', 'text/html');
                response.setHeader('Content-Length', messages[0].length);
                response.setHeader('Cache-Control', 'private, max-age=5');
                response.write(messages[0]);
                response.end();

                var pr = response.push({
                    'path': '/cachedGetRequestAfterFailure',
                    'protocol': 'http:'
                });
                pr.writeHead(404, {
                    'Content-Type': 'text/html',
                    'Content-Length': messages[1].length
                });
                pr.write(messages[1]);
                pr.end();

            // Second request after disconnect from last PUST
            } else if (requestCount === 2) {
                // TODO check request headers and requests responses
                assert.equal(request.url, '/cachedGetRequestAfterFailure');
                response.setHeader('Content-Type', 'text/html');
                response.setHeader('Content-Length', messages[2].length);
                response.setHeader('Cache-Control', 'private, max-age=5');
                response.write(messages[2]);
                response.end();

            } else {
                throw new Error("Should only get 1 request");
            }
        };
        XMLHttpRequest.proxy(["http://localhost:7080/config"]);
        var firstRequest = new XMLHttpRequest();

        var statechanges = 0;
        firstRequest.onreadystatechange = function () {
            ++statechanges;
            if(statechanges !== 1) {
                assert.equal(statechanges, firstRequest.readyState);
            }
            if (firstRequest.readyState >= 2) {
                assert.equal(firstRequest.status, 200);
                assert.equal(firstRequest.statusText, "OK");
            }
            if (firstRequest.readyState >= 3) {
                // Get last message
                assert.equal(firstRequest.response, messages[2]);
            }

            if (firstRequest.readyState === 4 && firstRequest.status === 200) {
                var secondRequest = new XMLHttpRequest();

                var statechangesocket = 0;
                secondRequest.onreadystatechange = function () {
                    ++statechangesocket;
                    // TODO !==1 is due to bug
                    if(statechangesocket !== 1) {
                        assert.equal(statechangesocket, secondRequest.readyState);
                    }
                    if (secondRequest.readyState >= 2) {
                        assert.equal(secondRequest.status, 200);
                        assert.equal(secondRequest.statusText, "OK");
                    }
                    if (secondRequest.readyState >= 3) {
                        // Get last message
                        assert.equal(secondRequest.response, messages[2]);
                    }
                    if (secondRequest.readyState === 4 && secondRequest.status === 200) {
                        // Get last message
                        assert.equal(secondRequest.response, messages[2]);
                        done();
                    }
                };
                secondRequest.open('GET', 'http://cache-endpoint1/cachedGetRequestAfterFailure', true);
                secondRequest.send(null);
            }
        };

        firstRequest.open('GET', 'http://cache-endpoint1/cachedGetRequestAfterFailure', true);

        firstRequest.send(null);
    });

    it('should cache GET request and re-call onreadystatechange on pushed update', function (done) {
        var messages = [
            "Hello, Dave. You're looking well today.",
            "Do you want to be my friend, Dave ?"
        ];
        var requestCount = 0;
        socketOnRequest = function (request, response) {
            if (++requestCount === 1) {
                // TODO check request headers and requests responses
                assert.equal(request.url, '/stream');
                //assert.equal(request.headers['x-retry-after'], 10);

                var pr = response.push({
                    'path': '/cachedGetRequestWithPush',
                    'protocol': 'http:'
                });
                pr.setHeader('Content-Type', 'text/html');
                pr.setHeader('Content-Length', messages[0].length);
                pr.setHeader('Cache-Control', 'max-age=500');
                pr.setHeader('Date', new Date());
                pr.write(messages[0]);
                pr.end();

                setTimeout(function () {
                    var pr = response.push({
                        'path': '/cachedGetRequestWithPush',
                        'protocol': 'http:'
                    });
                    pr.setHeader('Content-Type', 'text/html');
                    pr.setHeader('Content-Length', messages[1].length);
                    pr.setHeader('Cache-Control', 'max-age=500');
                    pr.setHeader('Date', new Date());
                    pr.write(messages[1]);
                    pr.end();
                }, 1000);
            } else {
                throw new Error("Should only get 1 request");
            }
        };
        XMLHttpRequest.proxy(["http://localhost:7080/config"]);
        var firstRequest = new XMLHttpRequest();

        var statechanges = 0,
            statecomplete = 0;
        firstRequest.onreadystatechange = function () {
            ++statechanges;
            
            if (firstRequest.readyState >= 2) {
                assert.equal(firstRequest.status, 200);
                assert.equal(firstRequest.statusText, "OK");
            }
            if (firstRequest.readyState === 3) {
                assert.equal(firstRequest.response, messages[statecomplete]);
            }
            if (firstRequest.readyState === 4 && firstRequest.status === 200) {
                assert.equal(firstRequest.response, messages[statecomplete]);
                statecomplete++;
            }

            if (statecomplete === 1) {
                done();
            }
        };

        firstRequest.open('GET', 'http://cache-endpoint1/cachedGetRequestWithPush', true);
        firstRequest.setRequestHeader('X-Retry-After', 1);

        // There is a race between xhr.js and push with out subscribe
        firstRequest.subscribe(function () {
            firstRequest.send(null);
        });
    });
});