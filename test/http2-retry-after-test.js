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

describe('http2-xhr-retry-after', function () {

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

    it('does a request and gets a response for statusCode 200 without `retry-after` header', function (done) {
        var path = '/retryAfter';
        var message = "Hello, Dave. You're looking well today.";
        socketOnRequest = function (request, response) {
            // TODO check request headers and requests responses
            assert.equal(request.url, path);
            response.setHeader('Cache-Control', 'private, max-age=0');
            response.writeHead(200, {
                'Content-Type': 'text/plain',
                'Content-Length': message.length
            });
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

        xhr.open('GET', 'http://cache-endpoint2' + path, true);

        xhr.send(null);
    });

    it('does a request and gets a response for statusCode 503 without `retry-after` header', function (done) {
        var path = '/retryAfter';
        var errorMessage = 'Service is NOT available';
        socketOnRequest = function (request, response) {
            // TODO check request headers and requests responses
            assert.equal(request.url, path);
            response.writeHead(503, {
                'Content-Type': 'text/plain',
                'Content-Length': errorMessage.length
            });
            response.write(errorMessage);
            response.end();
        };
        XMLHttpRequest.proxy(["http://localhost:7080/config"]);
        var xhr = new XMLHttpRequest();

        xhr.onloadstart = function () {
            xhr.onprogress = function () {
                xhr.onload = function () {
                    assert.equal(xhr.status, 503);
                    assert.equal(xhr.statusText, "Service Unavailable");
                    //assert.equal(xhr.getResponseHeader('retry-after'), 5);
                    xhr.onloadend = function () {
                        assert.equal(xhr.response, errorMessage);
                        done();
                    };
                };
            };
        };

        xhr.open('GET', 'http://cache-endpoint2' + path, true);

        xhr.send(null);
    });

    it('does a request and gets a response statusCode 200 with `retry-after` header in seconds and statusCode 503', function (done) {
        var path = '/retryAfter-' + Date.now();
        var retryAfterDelay = 5;
        var retryAfterDelayMs = retryAfterDelay * 1000;
        var restartDate = (Date.now() + retryAfterDelayMs);

        var message = "Hello, Dave. You're looking well today.";
        var errorMessage = 'Service is NOT available';
        socketOnRequest = function (request, response) {
            // TODO check request headers and requests responses
            var requestDate = Date.now();
            assert.equal(request.url, path);

            if (requestDate < restartDate) {
                response.setHeader('retry-after', retryAfterDelay);
                response.writeHead(503);
                response.write(errorMessage);
                response.end(); 
            } else {
                response.writeHead(200);
                response.write(message);
                response.end(); 
            }
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

        xhr.open('GET', 'http://cache-endpoint2' + path, true);

        xhr.send(null);
    }).timeout(10000);
});
