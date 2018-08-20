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

describe('http2-auth-push', function () {

    var config = {
        'transport': 'ws://localhost:7081/path',
        'proxy': [
            'http://cache-endpoint2/',
            'http://cache-endpoint3/',
            'http://localhost:7080/path/proxy'
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

    it('does reuses same auth on push promises', function (done) {
        var path = '/auth';
        var message = "Hello, Dave. You're looking well today.";
        socketOnRequest = function (request, response) {
            // TODO check request headers and requests responses
            assert.equal(request.url, path);
            response.setHeader('Cache-Control', 'stale-while-revalidate=1000');
            response.writeHead(200, {
                'Content-Type': 'text/plain',
                'Content-Length': message.length
            });
            response.write(message);
            response.end();

            var pr = response.push({
                'path': '/cache-endpoint2',
                'protocol': 'http:'
            });
            // pr.setHeader('Content-Type', 'text/html');
            // pr.setHeader('Content-Length', messages[0].length);
            // pr.setHeader('Cache-Control', 'max-age=500');
            // pr.setHeader('Date', new Date());
            // pr.write(messages[0]);
            // pr.end();

            // force failure if called again
            socketOnRequest = null;
        };

        XMLHttpRequest.proxy(["http://localhost:7080/config"]);

        var sendSameAuthShouldGetCache = function()
        {
            var xhr = new XMLHttpRequest();
            xhr.setRequestHeader('Authorization', 'auth1');
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
        };


        var xhr = new XMLHttpRequest();
        xhr.setRequestHeader('Authorization', 'auth1');
        xhr.onloadstart = function () {
            xhr.onprogress = function () {
                xhr.onload = function () {
                    assert.equal(xhr.status, 200);
                    assert.equal(xhr.statusText, "OK");
                    xhr.onloadend = function () {
                        assert.equal(xhr.response, message);
                        sendSameAuthShouldGetCache();
                    };
                };
            };
        };

        xhr.open('GET', 'http://cache-endpoint2' + path, true);

        xhr.send(null);
    });

    it('does not reuses different auth on push promises', function (done) {
        var path = '/auth';
        var message = "Hello, Dave. You're looking well today.";
        socketOnRequest = function (request, response) {
            // TODO check request headers and requests responses
            assert.equal(request.url, path);
            response.setHeader('Cache-Control', 'stale-while-revalidate=1000');
            response.writeHead(200, {
                'Content-Type': 'text/plain',
                'Content-Length': message.length
            });
            response.write(message);
            response.end();

            var pr = response.push({
                'path': '/cache-endpoint2',
                'protocol': 'http:'
            });
            // pr.setHeader('Content-Type', 'text/html');
            // pr.setHeader('Content-Length', messages[0].length);
            // pr.setHeader('Cache-Control', 'max-age=500');
            // pr.setHeader('Date', new Date());
            // pr.write(messages[0]);
            // pr.end();

            // force failure if called again
            socketOnRequest = function (request, response) {
                // TODO check request headers and requests responses
                assert.equal(request.url, path);
                response.setHeader('Cache-Control', 'stale-while-revalidate=1000');
                response.writeHead(200, {
                    'Content-Type': 'text/plain',
                    'Content-Length': message.length
                });
                response.write(message);
                response.end();
                done();
            };
        };

        XMLHttpRequest.proxy(["http://localhost:7080/config"]);

        var sendSameAuthShouldGetCache = function()
        {
            var xhr = new XMLHttpRequest();
            xhr.setRequestHeader('Authorization', 'auth2');
            xhr.onloadstart = function () {
                xhr.onprogress = function () {
                    xhr.onload = function () {
                        assert.equal(xhr.status, 200);
                        assert.equal(xhr.statusText, "OK");
                        xhr.onloadend = function () {
                            assert.equal(xhr.response, message);
                            // done();
                        };
                    };
                };
            };

            xhr.open('GET', 'http://cache-endpoint2' + path, true);

            xhr.send(null);
        };


        var xhr = new XMLHttpRequest();
        xhr.setRequestHeader('Authorization', 'auth1');
        xhr.onloadstart = function () {
            xhr.onprogress = function () {
                xhr.onload = function () {
                    assert.equal(xhr.status, 200);
                    assert.equal(xhr.statusText, "OK");
                    xhr.onloadend = function () {
                        assert.equal(xhr.response, message);
                        sendSameAuthShouldGetCache();
                    };
                };
            };
        };

        xhr.open('GET', 'http://cache-endpoint2' + path, true);

        xhr.send(null);
    });
});
