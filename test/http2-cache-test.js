if (typeof exports !== 'undefined') {
    if (typeof XMLHttpRequest === 'undefined') {
        XMLHttpRequest = require("xhr2").XMLHttpRequest;
    }
} else {
    XMLHttpRequest = Window.XMLHttpRequest;
}
require("../lib/http2-proxy");
var assert = require('assert');
var sinon = require('sinon');
var http = require('http');

describe('XMLHttpRequest (Proxy)', function () {

    var validConfig1 = [{
        "url": "http://cache-endpoint1/"
    }];

    var validConfig2 = [{
        "url": "http://cache-endpoint2/",
        "options": {
            "transport": "ws://localhost:8080/ws2"
        }
    }];

    describe('.proxy()', function () {

        beforeEach(function (done) {
            this.xhr = new XMLHttpRequest();

            const PORT = 8080;

            function handleRequest(request, response) {
                if (request.url === "/validConfig1") {
                    response.setHeader('Content-Encoding', 'application/json; charset=utf-8');
                    response.end(JSON.stringify(validConfig1));
                } else if (request.url === "/validConfig2") {
                    response.setHeader('Content-Encoding', 'application/json; charset=utf-8');
                    response.end(JSON.stringify(validConfig2));
                } else {
                    response.statusCode = 404;
                    response.end();
                }
            }

            this.server = http.createServer(handleRequest);

            this.server.listen(PORT, function () {
                done();
            });
        });

        afterEach(function (done) {
            this.server.close(done);
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

        it('should load config', function (done) {
            XMLHttpRequest.proxy(["http://localhost:8080/validConfig1"]);
            this.stub = sinon.stub(XMLHttpRequest, "_addConfig", function (config) {
                assert.equal(config, JSON.stringify(validConfig1));
                XMLHttpRequest._addConfig.restore();
                done();
            });
        });

        it('should load multiple configs', function (done) {
            XMLHttpRequest.proxy(["http://localhost:8080/validConfig1", "http://localhost:8080/validConfig2"]);
            this.stub = sinon.stub(XMLHttpRequest, "_addConfig", function (config) {
                // Multiple calls to arbitrary functions not currently supported, thus
                // the if/else work around here: https://github.com/sinonjs/sinon/issues/118
                if (config === JSON.stringify(validConfig1)) {
                    assert.equal(config, JSON.stringify(validConfig1));
                } else {
                    assert.equal(config, JSON.stringify(validConfig2));
                    XMLHttpRequest._addConfig.restore();
                    done();
                }
            });
        });
    });

    describe('_addConfig()', function () {
        it('should throw error on invalid json', function () {
            assert.throws(function () {
                XMLHttpRequest._addConfig("Not JSON");
            });
        });

        it.skip('should open connection to push service URL', function () {
            XMLHttpRequest._addConfig(JSON.stringify(validConfig1));
        });

        it.skip('should open connection to push service URL with transport option', function () {
            XMLHttpRequest._addConfig(validConfig2);
        });

        it.skip('should throw error if unrecognized option in config', function () {
            //TODO
        });
    });

    it.skip('sends push promise to cache', function () {

    });

    it.skip('notifies cache when promise stream is closed', function () {

    });

    it.skip('supports multiple promises at once', function () {

    });

});
