/* global console */
var chai = require('chai');
var assert = chai.assert;

/* jshint ignore:start */
if (typeof XMLHttpRequest === 'undefined') {
    XMLHttpRequest = require("xhr2").XMLHttpRequest;   
}
/* jshint ignore:end */
require("../lib/http2-cache");

var getSocketServer = require('./test-utils.js').getSocketServer,
    getConfigServer = require('./test-utils.js').getConfigServer;

describe('http2-proxy', function () {

    var config = {
        'transport': 'ws://localhost:7081/',
        'push': 'http://cache-endpoint1/stream',
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
    var configServer, configServer2;

    before(function (done) {

        var completed = 0;

        function doneOn2() {
            completed++;
            if (completed === 2) {
                done();
            }
        }

        configServer = getConfigServer({
            config: config,
            port: 7080
        }, doneOn2);

        configServer2 = getConfigServer({
            config: config2,
            port: 7090
        }, doneOn2);
    });

    after(function (done) {

        var completed = 0;

        function doneOn2() {
            completed++;
            if (completed === 2) {
                done();
            }
        }

        configServer.close(doneOn2);
        configServer2.close(doneOn2);
    });


    var socket;
    var socket2;
    var socketOnRequest;
    var socket2OnRequest;

    beforeEach(function (done) {
        // starts the 2 h2overWs servers
        socketOnRequest = function (request, response) {
            throw new Error("socketOnRequest Unexpected request: " + request.url);
        };
        //
        socket2OnRequest = function (request, response) {
            throw new Error("socket2OnRequest Unexpected request: " + request.url);
        };

        var completed = 0;

        function doneOn2() {
            completed++;
            if (completed === 2) {
                done();
            }
        }

        // start config http2 server
        socket = getSocketServer({
            port: 7081
        }, function (request, response) {
            socketOnRequest(request, response);
        }, doneOn2);

        // start config2 http2 server
        socket2 = getSocketServer({
            port: 7082
        }, function (request, response) {
            socket2OnRequest(request, response);
        }, doneOn2);
    });

    afterEach(function (done) {

        var completed = 0;

        function doneOn2() {
            completed++;
            if (completed === 2) {
                done();
            }
        }

        socket.close(doneOn2);
        socket2.close(doneOn2);
    });

    it('proxy() with empty params throws exception', function () {
        assert.throws(function () {
            XMLHttpRequest.proxy();
        });
    });

    it('should load config and start stream for pushs when h2PushPath is set in config', function (done) {
        socketOnRequest = function (request) {
            assert.equal(request.url, '/stream', 'should be on streaming url');
            done();
        };
        XMLHttpRequest.proxy(["http://localhost:7080/config"]);
    });
});