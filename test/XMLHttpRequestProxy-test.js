var XMLHttpRequestProxy = require("../lib/XMLHttpRequestProxy");
var assert = require('assert');
var sinon = require('sinon');

describe('XMLHttpRequestProxy', function () {

    var validConfig1 = [{
        "url": "http://push-service-url/",
        "options": {
            "transport": "ws://localhost"
        }
    }];

    var validConfig2 = [{
        "url": "http://push-service-url2/",
        "options": {
            "transport": "ws://localhost2"
        }
    }];

    describe('.proxy()', function () {

        beforeEach(function () {
            this.addStub = sinon.stub(XMLHttpRequestProxy.prototype, "_add");
            this.xhr = sinon.useFakeXMLHttpRequest();
            var requests = this.requests = [];
            this.xhr.onCreate = function (xhr) {
                requests.push(xhr);
            };
        });

        afterEach(function () {
            XMLHttpRequestProxy.prototype._add.restore();
            this.xhr.restore();
        });

        it('with empty params throws exception', function () {
            assert.throws(XMLHttpRequestProxy.prototype.proxy);
        });

        it('with no arrays throws exception', function () {
            assert.throws(function () {
                    new XMLHttpRequestProxy.prototype.proxy("https://url");
                }
            )
        });

        it('with no arrays throws exception', function () {
            assert.throws(function () {
                    new XMLHttpRequestProxy.prototype.proxy("https://url");
                }
            )
        });

        it('should load config', function () {
            var xhrp = new XMLHttpRequestProxy();
            xhrp.proxy(["https://configuration"]);
            assert.equal(this.requests.length, 1);
            assert.equal(this.requests[0].url, "https://configuration");

            this.requests[0].responseType = "json";
            this.requests[0].respond(200, {'Content-Type': 'application/json'}, JSON.stringify(validConfig1));
            assert.ok(this.addStub.withArgs(validConfig1).calledOnce);
        });

        it('should load multiple configs', function () {
            var xhrp = new XMLHttpRequestProxy();
            xhrp.proxy(["https://configuration", "https://configuration2"]);
            assert.equal(this.requests.length, 2);
            assert.equal(this.requests[0].url, "https://configuration");
            assert.equal(this.requests[1].url, "https://configuration2");
            this.requests[0].responseType = "json";
            this.requests[1].responseType = "json";
            this.requests[0].respond(200, {'Content-Type': 'application/json'}, JSON.stringify(validConfig1));
            this.requests[1].respond(200, {'Content-Type': 'application/json'}, JSON.stringify(validConfig2));
        });
    });

});
