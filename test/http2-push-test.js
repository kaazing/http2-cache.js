/* global console */

var XMLHttpRequest = require("xhr2").XMLHttpRequest;

require("../lib/http2-cache");

var assert = require('assert'),
    http = require('http'),
    http2 = require('http2'),
    getWSTransportServer = require('./test-utils').getWSTransportServer;

describe('H2 XHR', function () {

    var config1 = {
        'push': 'http://cache-endpoint1/stream',
        'transport': 'ws://localhost:7081/',
        'proxy': [
            'http://cache-endpoint1/',
            'http://cache-endpoint4/'
        ]
    };

    var configServer;

    before(function (done) {
        configServer = http.createServer(function (request, response) {

            var path = request.url;
            //console.log('configServer', path);
            if (path === '/config1') {
                response.writeHead(200, {'Content-Type': 'application/json'});
                response.end(JSON.stringify(config1));
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
        configServer.listen(7080, done);
    });

    after(function (done) {
        configServer.close(done);
    });

    var s1;
    var s1OnRequest;

    beforeEach(function (done) {
        // starts the 2 h2overWs servers
        s1OnRequest = function (request, response) {
            throw new Error("s1OnRequest Unexpected request: " + request.url);
        };

        // start config1 http2 server
        s1 = http2.raw.createServer(getWSTransportServer(), function (request, response) {
            s1OnRequest(request, response);
        });
        s1.listen(7081, done);
    });

    afterEach(function (done) {
        s1.close(done);
    });

    it('should not proxy different origin GET requests and pass headers', function (done) {
        XMLHttpRequest.proxy(["http://localhost:7080/config1"]);
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
                    assert.equal(JSON.stringify(config1), xhr2.responseText);
                    doneN(3);
                });
            }
        };

        xhr.open('GET', 'http://localhost:7080/headers', true);
        xhr.setRequestHeader('Content-Type', 'application/json');
        xhr.setRequestHeader('X-Custom-Header', 'MyValue');

        xhr.send(null);
        xhr2.open('GET', 'http://localhost:7080/config1', true);
        xhr2.send(null);
    });

    it('should use pushed results in cache', function (done) {
        var message = "Affirmative, Dave. I read you. ";
        var xhr = new XMLHttpRequest();
        s1OnRequest = function (request, response) {
            assert.equal(request.url, '/stream', 'should be on streaming url');
            var pr = response.push({
                'path': '/pushedCache1',
                'protocol': 'http:'
            });
            pr.setHeader('Content-Type', 'text/html');
            pr.setHeader('Content-Length', message.length);
            pr.setHeader('Cache-Control', 'max-age=500');
            pr.setHeader('Date', new Date());
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
                    assert.equal(xhr.getAllResponseHeaders()['content-type'], 'text/html');
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
        XMLHttpRequest.proxy(["http://localhost:7080/config1"]);
    });

    it('should cache GET request and re-call onreadystatechange on pushed update', function (done) {
        var messages = [
            "Hello, Dave. You're looking well today.",
            "Do you want to be my friend, Dave ?"
        ];
        var requestCount = 0;
        s1OnRequest = function (request, response) {
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
        XMLHttpRequest.proxy(["http://localhost:7080/config1"]);
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