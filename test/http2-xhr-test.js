/* global console */
var chai = require('chai');
var assert = chai.assert;

/* jshint ignore:start */
if (typeof XMLHttpRequest === 'undefined') {
    XMLHttpRequest = require("xhr2").XMLHttpRequest;
}
/* jshint ignore:end */

require("../lib/http2-cache");

var FormData = require("../lib/form-data").FormData,
    InvalidStateError = require('../lib/errors.js').InvalidStateError,
    getSocketServer = require('./test-utils.js').getSocketServer,
    getConfigServer = require('./test-utils').getConfigServer,
    generateRandAlphaNumStr = require('./test-utils').generateRandAlphaNumStr,
    lengthInUtf8Bytes = require('./test-utils').lengthInUtf8Bytes;

describe('http2-xhr', function () {

    var config = {
        'transport': 'ws://localhost:7081/path',
        'proxy': [
            'http://cache-endpoint2/',
            'http://cache-endpoint3/',
            'http://localhost:7080/path/proxy',
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

    it('should proxy GET request', function (done) {
        var message = "Hello, Dave. You're looking well today.";
        var date =  new Date().toString();
        socketOnRequest = function (request, response) {
            // TODO check request headers and requests responses
            assert.equal(request.url, '/path');
            response.setHeader('Content-Type', 'text/html');
            response.setHeader('Content-Length', message.length);
            response.setHeader('Cache-Control', 'private, max-age=0');
            response.setHeader('date', date);
            response.write(message);
            response.end();
        };
        XMLHttpRequest.proxy(["http://localhost:7080/config"]);
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

            if (xhr.readyState >= 3) {
                assert.equal(xhr.response, message);
            }
            if (xhr.readyState === 4 && xhr.status === 200) {
                assert.equal(xhr.getResponseHeader('content-type'), 'text/html');
                assert.equal(xhr.getAllResponseHeaders(), 'content-type: text/html\ncontent-length: ' + message.length + '\ncache-control: private, max-age=0\ndate: ' + date);
                done();
            }
        };
        xhr.open('GET', 'http://cache-endpoint2/path', true);

        xhr.send(null);

    });

    it('should receive trailer headers', function (done) {
        var message = "Hello, Akram. You're looking well today.";
        var date =  new Date().toString();
        var responseTrailers = { 'etag': '123123' };
        socketOnRequest = function (request, response) {
            // TODO check request headers and requests responses
            assert.equal(request.url, '/trailers');
            response.setHeader('Content-Type', 'text/html');
            response.setHeader('Content-Length', message.length);
            response.setHeader('Cache-Control', 'private, max-age=0');
            response.setHeader('date', date);
            response.write(message);
            response.addTrailers(responseTrailers);
            response.end();
        };
        XMLHttpRequest.proxy(["http://localhost:7080/config"]);
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

            if (xhr.readyState >= 3) {
                assert.equal(xhr.response, message);
            }
            if (xhr.readyState === 4 && xhr.status === 200) {
                assert.equal(xhr.getResponseHeader('etag'), '123123');
                assert.equal(xhr.getAllResponseHeaders(), 'content-type: text/html\ncontent-length: ' + message.length + '\ncache-control: private, max-age=0\ndate: ' + date + '\netag: 123123');
                done();
            }
        };
        xhr.open('GET', 'http://cache-endpoint2/trailers', true);

        xhr.send(null);

    });

    it('should timeout proxyfied GET request', function (done) {

        var date =  new Date().toString(),
            requestCount = 0,
            timeout = 100;
        socketOnRequest = function (request, response) {
            if (++requestCount === 1) {
                // Will be sent to late.
                setTimeout(function () {
                    var message = '{"date": ' + Date.now() + '};';
                    assert.equal(request.url, '/path/proxy');
                    response.setHeader('Content-Type', 'application/json');
                    response.setHeader('Content-Length', message.length);
                    response.setHeader('Cache-Control', 'private, max-age=0');
                    response.setHeader('date', date);
                    response.write(message);
                    response.end();
                }, timeout + 1);
            } else {
                throw new Error("Should only get 1 request");
            }
        };
        XMLHttpRequest.proxy(["http://localhost:7080/config"]);
        var xhr = new XMLHttpRequest();

        var statechanges = 0;
        xhr.onreadystatechange = function () {
            ++statechanges;
            if (xhr.readyState >= 2) {
                assert.equal(xhr.status, 0);
                assert.equal(xhr.statusText, "");
            }

            if (xhr.readyState === 4) {
                throw new Error("Should not call onreadystatechange readyState 4");
            }
        };

        xhr.ontimeout = function () {
            assert.equal(xhr.response, null);

            // Make sure xhr.readyState === 4 is never called
            setTimeout(done, 100);
        };

        xhr.open('GET', 'http://localhost:7080/path/proxy', true);
        xhr.timeout = timeout;
        xhr.send(null);

    });

    it('should proxy GET request with event listeners', function (done) {
        var message = "Hello, Dave. You're looking well today.";
        socketOnRequest = function (request, response) {
            // TODO check request headers and requests responses
            assert.equal(request.url, '/withListeners');
            response.setHeader('Content-Type', 'text/html');
            response.setHeader('Content-Length', message.length);
            response.setHeader('Cache-Control', 'private, max-age=0');
            response.write(message);
            response.end();
        };
        XMLHttpRequest.proxy(["http://localhost:7080/config"]);
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
    
    it('should proxy GET request status', function (done) {
        var message = "Hello, Dave. You're looking well today.";
        socketOnRequest = function (request, response) {
            // TODO check request headers and requests responses
            assert.equal(request.url, '/pathNotFound');
            response.writeHead(404, {
                'Content-Type': 'text/html',
                'Content-Length': message.length
            });
            response.write(message);
            response.end();
        };
        XMLHttpRequest.proxy(["http://localhost:7080/config"]);
        var xhr = new XMLHttpRequest();

        var statechanges = 0;
        xhr.onreadystatechange = function () {
            ++statechanges;
            // TODO !==1 is due to bug
            if(statechanges !== 1){
                assert.equal(statechanges, xhr.readyState);
            }
            if (xhr.readyState >= 2) {
                assert.equal(xhr.status, 404);
                assert.equal(xhr.statusText, "Not Found");
            }
            // TODO assert message
            if (xhr.readyState >= 3) {
                assert.equal(xhr.response, message);
            }
            if (xhr.readyState === 4 && xhr.status === 404) {
                //assert.equal(xhr.getResponseHeader('content-type'), 'text/html');
                //assert.equal(xhr.getAllResponseHeaders()['content-type'], 'text/html');
                done();
            }
        };
        xhr.open('GET', 'http://cache-endpoint2/pathNotFound', true);

        xhr.send(null);
    });

    it('should proxy POST request with event listeners', function (done) {
        var message = "Hello, Dave. You're looking well today.";
        socketOnRequest = function (request, response) {

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
        XMLHttpRequest.proxy(["http://localhost:7080/config"]);
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

    it('should only proxy path match GET requests', function (done) {
        XMLHttpRequest.proxy(["http://localhost:7080/config"]);
        var message = "Affirmative, Dave. I read you. ";
        var requestCount = 0;
        socketOnRequest = function (request, response) {
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

        var statechangesocket = 0;
        xhr2.onreadystatechange = function () {
             assert.equal(xhr2.readyState, statechangesocket++);
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

    it('should only proxy path match POST requests (application/x-www-form-urlencoded)', function (done) {
        XMLHttpRequest.proxy(["http://localhost:7080/config"]);
    
        var formData = {
            username: "Chris",
            lastname: "Bob",
            gender: "male",
        };

        var requestCount = 0;
        socketOnRequest = function (request, response) {
            if (++requestCount === 1) {
                assert.equal(request.url, '/path/proxy');
                assert.equal(request.method, 'POST');

                var body = [];
                request.on('data', function(chunk) {
                  body.push(chunk);
                }).on('end', function() {

                    // at this point, `body` has the entire request body stored in it as a string
                    body = Buffer.concat(body).toString();

                    assert.equal("username=Chris&lastname=Bob&gender=male", body);

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
                assert.equal("username=Chris&lastname=Bob&gender=male", xhr.responseText);
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

        var statechangesocket = 0;
        xhr2.onreadystatechange = function () {
             assert.equal(xhr2.readyState, statechangesocket++);
            if (xhr2.readyState >= 2) {
                assert.equal(xhr2.status, 200);
                assert.equal(xhr2.statusText, "OK");
            }
            if (xhr2.readyState === 4 && xhr2.status === 200) {
                xhr2.addEventListener('load', function () {
                    assert.equal("username=Chris&lastname=Bob&gender=male", xhr2.responseText);
                    doneN(3);
                });
            }
        };          

        xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
        xhr.open('POST', 'http://localhost:7080/path/proxy', true);
        xhr.send(formData);

        xhr2.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
        xhr2.open('POST', 'http://localhost:7080/path/notproxy?query=1', true);
        xhr2.send(formData);
    });

    it('should only proxy path match POST requests (multipart/form-data)', function (done) {
        XMLHttpRequest.proxy(["http://localhost:7080/config"]);
    
        var formData = new FormData();
        formData.append('username', 'Chris');
        formData.append('lastname', 'Bob');
        formData.append('gender', 'male');  

        var seed = formData._TestBoundary = (+(new Date()) + 3).toString(16);

        var requestCount = 0;
        socketOnRequest = function (request, response) {
            if (++requestCount === 1) {
                assert.equal(request.url, '/path/proxy');
                assert.equal(request.method, 'POST');

                var body = [];
                request.on('data', function(chunk) {
                  body.push(chunk);
                }).on('end', function() {

                    // at this point, `body` has the entire request body stored in it as a string
                    body = Buffer.concat(body).toString();

                    assert.equal('\r\n------webkitformboundary' + seed + 
                        '\r\nContent-Disposition: form-data; name="username"\r\n\r\nChris\r\n------webkitformboundary' + seed + 
                        '\r\nContent-Disposition: form-data; name="lastname"\r\n\r\nBob\r\n------webkitformboundary' + seed +  
                        '\r\nContent-Disposition: form-data; name="gender"\r\n\r\nmale\r\n------webkitformboundary' + seed + '--', body);

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
                assert.equal('\r\n------webkitformboundary' + seed + 
                        '\r\nContent-Disposition: form-data; name="username"\r\n\r\nChris\r\n------webkitformboundary' + seed + 
                        '\r\nContent-Disposition: form-data; name="lastname"\r\n\r\nBob\r\n------webkitformboundary' + seed +  
                        '\r\nContent-Disposition: form-data; name="gender"\r\n\r\nmale\r\n------webkitformboundary' + seed + '--', xhr.responseText);
                doneN(2);
            }
        };

        xhr.onloadstart = function () {
            xhr.onprogress = function () {
                xhr.onload = function () {
                    xhr.onloadend = function () {
                        doneN(2);
                    };
                };
            };
        };
  

        xhr.open('POST', 'http://localhost:7080/path/proxy', true);
        xhr.send(formData);
    });

    it('should cache GET request and reuse (with default port)', function (done) {
        var message = "Hello, Dave. You're looking well today.";
        var requestCount = 0;
        socketOnRequest = function (request, response) {
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
                assert.equal(firstRequest.response, message);
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
        socketOnRequest = function (request, response) {
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
                assert.equal(firstRequest.response, message);
            }
            if (firstRequest.readyState === 4 && firstRequest.status === 200) {
                assert.equal(firstRequest.response, message);

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

    it('should not cache GET request and not reuse if error', function (done) {
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
                assert.equal(request.url, '/cachedGetRequestWithError');
                response.writeHead(404, {
                    'Content-Type': 'text/html',
                    'Content-Length': messages[0].length
                });
                response.write(messages[0]);
                response.end();
            } else if (requestCount === 2) {
                // TODO check request headers and requests responses
                assert.equal(request.url, '/cachedGetRequestWithError');
                response.setHeader('Content-Type', 'text/html');
                response.setHeader('Content-Length', messages[1].length);
                response.setHeader('Cache-Control', 'private, max-age=5');
                response.write(messages[1]);
                response.end();
            } else {
                throw new Error("Should only get 2 request");
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
                assert.equal(firstRequest.status, 404);
                assert.equal(firstRequest.statusText, "Not Found");
            }
            if (firstRequest.readyState >= 3) {
                assert.equal(firstRequest.response, messages[0]);
            }
            if (firstRequest.readyState === 4 && firstRequest.status === 404) {
                assert.equal(firstRequest.response, messages[0]);

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
                        assert.equal(secondRequest.response, messages[1]);
                    }
                    if (secondRequest.readyState === 4 && secondRequest.status === 200) {
                        assert.equal(secondRequest.response, messages[1]);
                        done();
                    }
                };
                secondRequest.open('GET', 'http://cache-endpoint2:80/cachedGetRequestWithError', true);
                secondRequest.send(null);
            }
        };

        firstRequest.open('GET', 'http://cache-endpoint2:80/cachedGetRequestWithError', true);

        firstRequest.send(null);
    });

    it('should return responseType when proxyfied', function (done) {

        var message = '{"message": "Hello, Dave. You\'re looking well today."}';
        var date =  new Date().toString();
        var responseTypes = [
            {
                requestType: 'arraybuffer',
                responseType: 'ArrayBuffer'
            },
            {
                requestType: 'text',
                responseType: 'String'
            },
            {
                requestType: 'json',
                responseType: 'Object'
            },
            /*
            {
                requestType: 'blob',
                responseType: 'Blob'
            },
            {
                requestType: 'document',
                responseType: 'HTMLNode'
            }
            */
        ];

        socketOnRequest = function (request, response) {
             // TODO check request headers and requests responses
            assert.equal(request.url, '/path/proxy/responseType');
            response.setHeader('Content-Type', 'application/json');
            response.setHeader('Content-Length', message.length);
            response.setHeader('Cache-Control', 'private, max-age=0');
            response.setHeader('date', date);
            response.write(message);
            response.end();
        };

        var doneCnt = 0;

        function doneN(n) {
            if (++doneCnt === n) {
                done();
            }
        }

        responseTypes.forEach(function (assertType) {
            XMLHttpRequest.proxy(["http://localhost:7080/config"]);
            var xhr = new XMLHttpRequest();

            var statechanges = 0;
            xhr.onreadystatechange = function () {
                ++statechanges;

                if (xhr.readyState >= 2) {
                    assert.equal(xhr.status, 200);
                    assert.equal(xhr.statusText, "OK");
                }

                if (xhr.readyState === 4 && xhr.status === 200) {
                    assert.equal(xhr.responseType, assertType.requestType);
                    assert.equal(xhr.response.constructor.name, assertType.responseType);
                    doneN(responseTypes.length);
                }
            };

            xhr.open('GET', 'http://localhost:7080/path/proxy/responseType', true);
            xhr.responseType = assertType.requestType;
            xhr.send(null);
        });
    });

    /* Ignoring the test since we removed the code where we are throwing an exception
    it('should return Throw InvalidStateError when responseText is used with invalid responseType', function (done) {
        
        var message = '{"message": "Hello, Dave. You\'re looking well today."}';
        var date =  new Date().toString();
        socketOnRequest = function (request, response) {
            // TODO check request headers and requests responses
            assert.equal(request.url, '/path/proxy/responseTypeBadText');
            response.setHeader('Content-Type', 'application/json');
            response.setHeader('Content-Length', message.length);
            response.setHeader('Cache-Control', 'private, max-age=0');
            response.setHeader('date', date);
            response.write(message);
            response.end();
        };
        XMLHttpRequest.proxy(["http://localhost:7080/config"]);
        var xhr = new XMLHttpRequest();

        var statechanges = 0;
        xhr.onreadystatechange = function () {
            ++statechanges;

            if (xhr.readyState >= 2) {
                assert.equal(xhr.status, 200);
                assert.equal(xhr.statusText, "OK");
            }

            if (xhr.readyState === 4 && xhr.status === 200) {
                assert.equal(xhr.responseType, 'json');
                assert.equal(typeof xhr.response, 'object');
                try {
                    var responseText = xhr.responseText;
                } catch (err) {
                    assert.equal(err instanceof InvalidStateError, true);
                    done();   
                }
            }
        };
        
        xhr.open('GET', 'http://localhost:7080/path/proxy/responseTypeBadText', true);
        xhr.responseType = 'json';
        xhr.send(null);
    });
    */

    it('should return responseType when NOT proxyfied', function (done) {

        var date =  new Date().toString();
        var responseTypes = [
            {
                requestType: 'arraybuffer',
                responseType: 'ArrayBuffer'
            },
            {
                requestType: 'text',
                responseType: 'String'
            },
            {
                requestType: 'json',
                responseType: 'Object'
            },
            /*
            {
                requestType: 'blob',
                responseType: 'Blob'
            },
            {
                requestType: 'document',
                responseType: 'HTMLNode'
            }
            */
        ];

        socketOnRequest = function (request, response) {
            throw new Error("Should only proxy '/path/proxy' not '" + request.url + "'");
        };

        var doneCnt = 0;

        function doneN(n) {
            if (++doneCnt === n) {
                done();
            }
        }

        responseTypes.forEach(function (assertType) {
            XMLHttpRequest.proxy(["http://localhost:7080/config"]);
            var xhr = new XMLHttpRequest();

            var statechanges = 0;
            xhr.onreadystatechange = function () {
                ++statechanges;

                if (xhr.readyState >= 2) {
                    assert.equal(xhr.status, 200);
                    assert.equal(xhr.statusText, "OK");
                }

                if (xhr.readyState === 4 && xhr.status === 200) {
                    assert.equal(assertType.requestType, xhr.responseType);
                    assert.equal(assertType.responseType, xhr.response.constructor.name);
                    doneN(responseTypes.length);
                }
            };

            xhr.open('GET', 'http://localhost:7080/path/responseType', true);
            xhr.responseType = assertType.requestType;
            xhr.send(null);
        });
    });

    it('should cache GET request and reuse for response larger than MAX_PAYLOAD_SIZE', function (done) {

        var requestCount = 0;
        var MAX_PAYLOAD_SIZE = 4096;

        var length = MAX_PAYLOAD_SIZE * 10;
        var message = generateRandAlphaNumStr(length);

        socketOnRequest = function (request, response) {
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
        XMLHttpRequest.proxy(["http://localhost:7080/config"]);
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

                var statechangesocket = 0;
                secondRequest.onreadystatechange = function () {
                    ++statechangesocket;
                    if(statechangesocket !== 1) {
                        assert.equal(statechangesocket, secondRequest.readyState);
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

    // This test should take between 2000ms and 3000ms timeout above can be a sign of performance regression.
    }).timeout(10000);
});
