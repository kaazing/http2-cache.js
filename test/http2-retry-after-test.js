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

    it('should proxy GET request with event listeners', function (done) {
        var message = "Hello, Dave. You're looking well today.";
        socketOnRequest = function (request, response) {
            // TODO check request headers and requests responses
            // TODO check request headers and requests responses
            assert.equal(request.url, '/withListeners');
            response.setHeader('Cache-Control', 'private, max-age=0');
            response.writeHead(200, {
                'Content-Type': 'text/html',
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

        xhr.open('GET', 'http://cache-endpoint2/withListeners', true);

        xhr.send(null);
    });

    it('should proxy GET request with event listeners in case of 503', function (done) {
        var message = "Hello, Dave. You're looking well today.";
        socketOnRequest = function (request, response) {
            // TODO check request headers and requests responses
            // TODO check request headers and requests responses
            assert.equal(request.url, '/retryAfter');
            response.writeHead(503, {
                'Content-Type': 'text/html',
                'Content-Length': message.length,
                'Retry-After': 100
            });
            response.write(message);
            response.end();
        };
        XMLHttpRequest.proxy(["http://localhost:7080/config"]);
        var xhr = new XMLHttpRequest();

        xhr.onloadstart = function () {
            xhr.onprogress = function () {
                xhr.onload = function () {
                    assert.equal(xhr.status, 503);
                    assert.equal(xhr.statusText, "Service Unavailable");
                    assert.equal(xhr.getResponseHeader('retry-after'), 100);
                    xhr.onloadend = function () {
                        assert.equal(xhr.response, message);
                        done();
                    };
                };
            };
        };

        xhr.open('GET', 'http://cache-endpoint2/retryAfter', true);

        xhr.send(null);
    });
});
