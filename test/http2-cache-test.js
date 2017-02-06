if (typeof exports !== 'undefined') {
    if (typeof XMLHttpRequest === 'undefined') {
        XMLHttpRequest = require("xhr2").XMLHttpRequest;
    }
    HttpCache = require("../lib/HttpCache");
} else {
    XMLHttpRequest = Window.XMLHttpRequest;
}
require("../lib/http2-cache");
var assert = require('assert');
var sinon = require('sinon');
// var http2 = require('spdy');
// var https = require('https');
var http = require('http');
// var fs = require('fs');

describe('XMLHttpRequest (Proxy)', function () {

    var validConfig1 = [{
        "url": "http://cache-endpoint1/",
        "options": {
            "transport": "ws://localhost:8080/ws"
        }
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

            this.stub = sinon.stub(XMLHttpRequest, "_addConfig");
            const PORT=8080;

            function handleRequest(request, response){
                if(request.url === "/validConfig1"){
                    response.setHeader('Content-Encoding','application/json; charset=utf-8');
                    response.end(JSON.stringify(validConfig1));
                } else if(request.url === "/validConfig2"){
                    response.setHeader('Content-Encoding','application/json; charset=utf-8');
                    response.end(validConfig2, "application/json");
                } else {
                    response.statusCode = 404;
                    response.end();
                }
            }

            this.server = http.createServer(handleRequest);

            this.server.listen(PORT, function(){
                done();
            });
        });

        afterEach(function (done) {
            this.server.close(done);
            XMLHttpRequest._addConfig.restore();
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
            // this.stub.withArgs(JSON.toString(validConfig1)).calls(done);
            setTimeout(function(){done();}, 1000);
        });

        // it('should load multiple configs', function () {
        //     XMLHttpRequest.proxy(["http://localhost:8080/validConfig1", "http://localhost:8080/validConfig2"]);
        // });

        it.skip('overrides window.XMLHttpRequest', function () {

        });
    });

    describe.skip('._add()', function () {

        it("should parse single config and open url", function () {
            //TODO
        });

        it("should parse multiple configs and open url", function () {
            //TODO
        });

        it("throws exception on unrecognized options", function () {

        });

        it("throws exception when transport is not set", function () {

        });


        it('establish a http2 stream to push cache server url', function () {

        });

        it('reconnects http2 to server url on failure', function () {

        });


    });

    it.skip('sends push promise to cache', function () {

    });

    it.skip('notifies cache when promise stream is closed', function () {

    });

    it.skip('supports multiple promises at once', function () {

    });

});
