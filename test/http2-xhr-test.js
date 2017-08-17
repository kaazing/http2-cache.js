/* global console */

var XMLHttpRequest = require("xhr2").XMLHttpRequest;
var FormData = require("../lib/form-data").FormData;

require("../lib/http2-cache");

var assert = require('assert'),
    http = require('http'),
    http2 = require('http2'),
    getWSTransportServer = require('./test-utils').getWSTransportServer,
    generateRandAlphaNumStr = require('./test-utils').generateRandAlphaNumStr,
    lengthInUtf8Bytes = require('./test-utils').lengthInUtf8Bytes;

describe('H2 XHR', function () {

    var config1 = {
        'push': 'http://cache-endpoint1/stream',
        'transport': 'ws://localhost:7081/',
        'proxy': [
            'http://cache-endpoint1/',
            'http://cache-endpoint4/'
        ]
    };

    var config2 = {
        'transport': 'ws://localhost:7082/path',
        'proxy': [
            'http://cache-endpoint2/',
            'http://cache-endpoint3/'
        ]
    };

    var config3 = {
        'transport': 'ws://localhost:7082/path',
        'proxy': [
            'http://localhost:7080/path/proxy'
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
            } else if (path === '/config2') {
                response.writeHead(200, {'Content-Type': 'application/json'});
                response.end(JSON.stringify(config2));
            } else if (path === '/config3') {
                response.writeHead(200, {'Content-Type': 'application/json'});
                response.end(JSON.stringify(config3));
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
    var s2;
    var s1OnRequest;
    var s2OnRequest;

    beforeEach(function (done) {
        // starts the 2 h2overWs servers
        s1OnRequest = function (request, response) {
            throw new Error("s1OnRequest Unexpected request: " + request.url);
        };

        s2OnRequest = function (request, response) {
            throw new Error("s2OnRequest Unexpected request: " + request.url);
        };

        var completed = 0;

        function doneOn2() {
            completed++;
            if (completed === 2) {
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
            if (completed === 2) {
                done();
            }
        }

        s1.close(doneOn2);
        s2.close(doneOn2);
    });

    it('should proxy GET request', function (done) {
        var message = "Hello, Dave. You're looking well today.";
        s2OnRequest = function (request, response) {
            // TODO check request headers and requests responses
            assert.equal(request.url, '/path');
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
            ++statechanges;
            // TODO !==1 is due to bug
            if(statechanges !== 1){
                assert.equal(statechanges, xhr.readyState);
            }
            if (xhr.readyState >= 2) {
                assert.equal(xhr.status, 200);
                assert.equal(xhr.statusText, "OK");
            }
            // TODO assert message
            if (xhr.readyState >= 3) {
                assert.equal(xhr.response, message);
            }
            if (xhr.readyState === 4 && xhr.status === 200) {
                assert.equal(xhr.getResponseHeader('content-type'), 'text/html');
                assert.equal(xhr.getAllResponseHeaders()['content-type'], 'text/html');
                done();
            }
        };
        xhr.open('GET', 'http://cache-endpoint2/path', true);

        xhr.send(null);

    });

    it('should proxy GET request with event listeners', function (done) {
        var message = "Hello, Dave. You're looking well today.";
        s2OnRequest = function (request, response) {
            // TODO check request headers and requests responses
            assert.equal(request.url, '/withListeners');
            response.setHeader('Content-Type', 'text/html');
            response.setHeader('Content-Length', message.length);
            response.setHeader('Cache-Control', 'private, max-age=0');
            response.write(message);
            response.end();
        };
        XMLHttpRequest.proxy(["http://localhost:7080/config2"]);
        var xhr = new XMLHttpRequest();

        xhr.onloadstart = function () {
            xhr.onprogress = function () {
                xhr.onload = function () {
                    assert.equal(xhr.status, 200);
                    assert.equal(xhr.statusText, "OK");
                    xhr.onloadend = function () {
                        assert.equal(xhr.response, message);
                        done();
                    };
                };
            };
        };

        xhr.open('GET', 'http://cache-endpoint2/withListeners', true);

        xhr.send(null);

    });

    it('should proxy POST request with event listeners', function (done) {
        var message = "Hello, Dave. You're looking well today.";
        s2OnRequest = function (request, response) {

            // TODO check request headers and requests responses
            assert.equal(request.url, '/payload');
            assert.equal(request.headers['content-type'], 'application/x-www-form-urlencoded');
            assert.equal(request.method, 'POST');
            
            var body = [];
            request.on('data', function(chunk) {
              body.push(chunk);
            }).on('end', function() {

                // at this point, `body` has the entire request body stored in it as a string
                body = Buffer.concat(body).toString();

                response.setHeader('Content-Type', 'text/html');
                response.setHeader('Content-Length', message.length);
                response.setHeader('Cache-Control', 'private, max-age=0');
                response.write(body);
                response.end();
            });
        };
        XMLHttpRequest.proxy(["http://localhost:7080/config2"]);
        var xhr = new XMLHttpRequest();

        xhr.onloadstart = function () {
            xhr.onprogress = function () {
                xhr.onload = function () {
                    assert.equal(xhr.status, 200);
                    assert.equal(xhr.statusText, "OK");
                    xhr.onloadend = function () {
                        assert.equal(xhr.response, message);
                        done();
                    };
                };
            };
        };

        xhr.open('POST', 'http://cache-endpoint2/payload', true);
        xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
        xhr.send(message);

    });

    it('should not proxy different origin GET requests and pass headers', function (done) {
        XMLHttpRequest.proxy(["http://localhost:7080/config2"]);
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

    it('should only proxy path match GET requests', function (done) {
        XMLHttpRequest.proxy(["http://localhost:7080/config3"]);
        var message = "Affirmative, Dave. I read you. ";
        var requestCount = 0;
        s2OnRequest = function (request, response) {
            if (++requestCount === 1) {
                // TODO check request headers and requests responses
                assert.equal(request.url, '/path/proxy');
                response.setHeader('Content-Type', 'text/html');
                response.setHeader('Content-Length', message.length);
                response.setHeader('Cache-Control', 'private, max-age=5');
                response.write(message);
                response.end();
            } else {
                throw new Error("Should only proxy '/path/proxy' not '" + request.url + "'");
            }
        };

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
            if (xhr.readyState >= 2) {
                assert.equal(200, xhr.status);
                assert.equal("OK", xhr.statusText);
            }
            if (xhr.readyState === 4 && xhr.status === 200) {
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
                    doneN(3);
                });
            }
        };

        xhr.open('GET', 'http://localhost:7080/path/proxy', true);
        xhr.send(null);
        xhr2.open('GET', 'http://localhost:7080/path/notproxy?query=1', true);
        xhr2.send(null);
    });

    it('should only proxy path match POST requests', function (done) {
        XMLHttpRequest.proxy(["http://localhost:7080/config3"]);
    
        var formData = new FormData();
        formData.append('username', 'Chris');
        formData.append('username', 'Bob');
        formData.append('gender', 'male');  

        var requestCount = 0;
        s2OnRequest = function (request, response) {
            if (++requestCount === 1) {
                assert.equal(request.url, '/path/proxy');
                assert.equal(request.method, 'POST');

                var body = [];
                request.on('data', function(chunk) {
                  body.push(chunk);
                }).on('end', function() {

                    // at this point, `body` has the entire request body stored in it as a string
                    body = Buffer.concat(body).toString();

                    assert.equal("username=Chris&username=Bob&gender=male", body);

                    response.setHeader('Content-Type', 'text/html');
                    response.setHeader('Content-Length', body.length);
                    response.setHeader('Cache-Control', 'private, max-age=0');
                    response.write(body);
                    response.end();
                });
            } else {
                throw new Error("Should only proxy '/path/proxy' not '" + request.url + "'");
            }
        };

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
            if (xhr.readyState >= 2) {
                assert.equal(200, xhr.status);
                assert.equal("OK", xhr.statusText);
            }
            if (xhr.readyState === 4 && xhr.status === 200) {
                assert.equal("username=Chris&username=Bob&gender=male", xhr.responseText);
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
                    assert.equal("username=Chris&username=Bob&gender=male", xhr2.responseText);
                    doneN(3);
                });
            }
        };      

        xhr.open('POST', 'http://localhost:7080/path/proxy', true);
        xhr.send(formData);
        xhr2.open('POST', 'http://localhost:7080/path/notproxy?query=1', true);
        xhr2.send(formData);
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

    it('should cache GET request and reuse (with default port)', function (done) {
        var message = "Hello, Dave. You're looking well today.";
        var requestCount = 0;
        s2OnRequest = function (request, response) {
            if (++requestCount === 1) {
                // TODO check request headers and requests responses
                assert.equal(request.url, '/cachedGetRequest');
                response.setHeader('Content-Type', 'text/html');
                response.setHeader('Content-Length', message.length);
                response.setHeader('Cache-Control', 'private, max-age=5');
                response.write(message);
                response.end();
            } else {
                throw new Error("Should only get 1 request");
            }
        };
        XMLHttpRequest.proxy(["http://localhost:7080/config2"]);
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
                assert.equal(firstRequest.response, message);
            }
            if (firstRequest.readyState === 4 && firstRequest.status === 200) {
                var secondRequest = new XMLHttpRequest();

                var statechanges2 = 0;
                secondRequest.onreadystatechange = function () {
                    ++statechanges2;
                    // TODO !==1 is due to bug
                    if(statechanges2 !== 1) {
                        assert.equal(statechanges2, secondRequest.readyState);
                    }
                    if (secondRequest.readyState >= 2) {
                        assert.equal(secondRequest.status, 200);
                        assert.equal(secondRequest.statusText, "OK");
                    }
                    if (secondRequest.readyState >= 3) {
                        assert.equal(secondRequest.response, message);
                    }
                    if (secondRequest.readyState === 4 && secondRequest.status === 200) {
                        assert.equal(secondRequest.response, message);
                        done();
                    }
                };
                secondRequest.open('GET', 'http://cache-endpoint2/cachedGetRequest', true);
                secondRequest.send(null);
            }
        };

        firstRequest.open('GET', 'http://cache-endpoint2/cachedGetRequest', true);

        firstRequest.send(null);
    });

    it('should cache GET request and reuse (with port)', function (done) {
        var message = "Hello, Dave. You're looking well today.";
        var requestCount = 0;
        s2OnRequest = function (request, response) {
            if (++requestCount === 1) {
                // TODO check request headers and requests responses
                assert.equal(request.url, '/cachedGetRequestWithPort');
                response.setHeader('Content-Type', 'text/html');
                response.setHeader('Content-Length', message.length);
                response.setHeader('Cache-Control', 'private, max-age=5');
                response.write(message);
                response.end();
            } else {
                throw new Error("Should only get 1 request");
            }
        };
        XMLHttpRequest.proxy(["http://localhost:7080/config2"]);
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
                assert.equal(firstRequest.response, message);
            }
            if (firstRequest.readyState === 4 && firstRequest.status === 200) {
                assert.equal(firstRequest.response, message);

                var secondRequest = new XMLHttpRequest();
                var statechanges2 = 0;
                secondRequest.onreadystatechange = function () {
                    ++statechanges2;
                    // TODO !==1 is due to bug
                    if(statechanges2 !== 1) {
                        assert.equal(statechanges2, secondRequest.readyState);
                    }
                    if (secondRequest.readyState >= 2) {
                        assert.equal(secondRequest.status, 200);
                        assert.equal(secondRequest.statusText, "OK");
                    }
                    if (secondRequest.readyState >= 3) {
                        assert.equal(secondRequest.response, message);
                    }
                    if (secondRequest.readyState === 4 && secondRequest.status === 200) {
                        assert.equal(secondRequest.response, message);
                        done();
                    }
                };
                secondRequest.open('GET', 'http://cache-endpoint2:80/cachedGetRequestWithPort', true);
                secondRequest.send(null);
            }
        };

        firstRequest.open('GET', 'http://cache-endpoint2:80/cachedGetRequestWithPort', true);

        firstRequest.send(null);
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

    it('should cache GET request and reuse for response larger than MAX_PAYLOAD_SIZE', function (done) {

        var requestCount = 0;
        var MAX_PAYLOAD_SIZE = 4096;

        var length = MAX_PAYLOAD_SIZE * 50;
        var message = generateRandAlphaNumStr(length);

        s2OnRequest = function (request, response) {
            if (++requestCount === 1) {
                // TODO check request headers and requests responses
                assert.equal(request.url, '/cachedGetLargeRequest');
                response.setHeader('Content-Type', 'text/html');
                response.setHeader('Content-Length', lengthInUtf8Bytes(message));
                response.setHeader('Cache-Control', 'private, max-age=5');
                response.write(message);
                response.end();
            } else {
                throw new Error("Should only get 1 request");
            }
        };
        XMLHttpRequest.proxy(["http://localhost:7080/config2"]);
        var firstRequest = new XMLHttpRequest();

        var statechanges = 0;
        var loadingchanges = 0,
            framesSizes = [];
        firstRequest.onreadystatechange = function () {
            ++statechanges;
            if (firstRequest.readyState >= 2) {
                assert.equal(firstRequest.status, 200);
                assert.equal(firstRequest.statusText, "OK");
            }

            if (firstRequest.readyState === 3) {
                framesSizes.push(firstRequest.responseText.length);
                loadingchanges++;
            }
            if (firstRequest.readyState === 4 && firstRequest.status === 200) {
                var secondRequest = new XMLHttpRequest();

                var statechanges2 = 0;
                secondRequest.onreadystatechange = function () {
                    ++statechanges2;
                    if(statechanges2 !== 1) {
                        assert.equal(statechanges2, secondRequest.readyState);
                    }
                    if (secondRequest.readyState >= 2) {
                        assert.equal(secondRequest.status, 200);
                        assert.equal(secondRequest.statusText, "OK");
                    }
                    // Expect cached frame and to only append once
                    if (secondRequest.readyState === 3) {

                        // Should match last decoded size from firstRequest
                        assert.equal(framesSizes[loadingchanges - 1], secondRequest.responseText.length);

                        // Catch double secondRequest.readyState === 3 by making test above fail subsequently
                        loadingchanges = -1;
                    }

                    if (secondRequest.readyState === 4 && secondRequest.status === 200) {
                        assert.equal(secondRequest.responseText, message);
                        assert.equal(secondRequest.responseText.length, message.length);
                        assert.equal(secondRequest.response, secondRequest.responseText);
                        done();
                    }
                };
                secondRequest.open('GET', 'http://cache-endpoint2/cachedGetLargeRequest', true);
                secondRequest.send(null);
            }
        };

        firstRequest.open('GET', 'http://cache-endpoint2/cachedGetLargeRequest', true);

        firstRequest.send(null);
    });
});
