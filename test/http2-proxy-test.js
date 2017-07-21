/* global console */

/* jshint ignore:start */
XMLHttpRequest = require("xhr2").XMLHttpRequest;
/* jshint ignore:end */
require("../lib/http2-cache");

var assert = require('assert'),
    createServer = require('../lib/server').createServer,
    http = require('http'),
    http2 = require('http2'),
    getWSTransportServer = require('./test-utils.js').getWSTransportServer;

describe('H2 Proxy', function () {

    var config1 = {
        'transport': 'ws://localhost:7081/',
        'pushURL': 'http://cache-endpoint1/stream',
        'proxy': [
            'http://cache-endpoint1/'
        ]
    };

    var config2 = {
        'transport': 'ws://localhost:7082/path',
        'proxy': [
            'http://cache-endpoint2/'
        ]
    };

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
        // s1OnRequest = function (request, response) {
        //     throw "Unexpected event: " + request + " " + response;
        // };
        //
        // s2OnRequest = function (request, response) {
        //     throw "Unexpected event " + request + " " + response;
        // };

        var completed = 0;

        function doneOn2() {
            completed++;
            if (completed === 2) {
                done();
            }
        }

        // start config1 http2 server
        s1 = createServer(getWSTransportServer(), function (request, response) {
            s1OnRequest(request, response);
        });
        s1.listen(7081, doneOn2);

        // start config2 http2 server
        s2 = createServer(getWSTransportServer(), function (request, response) {
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

    it('proxy() with empty params throws exception', function () {
        assert.throws(function () {
            XMLHttpRequest.proxy();
        });
    });

    it('proxy() with no arrays throws exception', function () {
        assert.throws(function () {
                XMLHttpRequest.proxy("http://url");
            }
        );
    });

    it('proxy() with invalid params throws exception', function () {
        assert.throws(function () {
            XMLHttpRequest.proxy([1]);
        });
    });

    it('should load config and start stream for pushs when h2PushPath is set in config', function (done) {
        s1OnRequest = function (request) {
            assert.equal(request.url, '/stream', 'should be on streaming url');
            done();
        };
        XMLHttpRequest.proxy(["http://localhost:7080/config1"]);
    });

    it('should load config 2 and start stream for pushs when h2PushPath is set in config', function (done) {
        s1OnRequest = function (request) {
            assert.equal(request.url, '/stream', 'should be on streaming url');
            done();
        };
        XMLHttpRequest.proxy(["http://localhost:7080/config1"]);
    });

    it('should load multiple configs', function (done) {
        s1OnRequest = function (request) {
            assert.equal(request.url, '/stream', 'should be on streaming url');
            done();
        };
        s2OnRequest = function () {
            throw new Error("should never be here");
        };
        XMLHttpRequest.proxy(["http://localhost:7080/config1", "http://localhost:7080/config2"]);
    });

    it('should load inline configs', function (done) {
        s1OnRequest = function () {
            throw new Error("should never be here");
        };
        s2OnRequest = function () {
            throw new Error("should never be here");
        };
        XMLHttpRequest.proxy(
            [
                {
                    'transport': 'ws://localhost:7082/path',
                    'proxy': [
                        'http://cache-endpoint2/'
                    ]
                }
            ]
        );
        done();
    });

    it('should expose current configuration', function (done) {
        s1OnRequest = function (request) {
            assert.equal(request.url, '/stream', 'should be on streaming url');
            done();
        };
        s2OnRequest = function () {
            throw new Error("should never be here");
        };
        XMLHttpRequest.configuration.addConfig({
            'transport': 'ws://localhost:7081/',
            'pushURL': 'http://cache-endpoint1/stream',
            'proxy': [
                'http://cache-endpoint1/'
            ]
        });
    });
});
