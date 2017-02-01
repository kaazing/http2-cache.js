var assert = require('assert');
var XMLHttpRequestProxy = require("../lib/XMLHttpRequestProxy");
XMLHttpRequest = require("xhr2").XMLHttpRequest;
var sinon = require('sinon');

describe('XMLHttpRequestProxy', function () {

    beforeEach(function(){
        this.xhr = sinon.useFakeXMLHttpRequest();
        var requests = this.requests = [];

        this.xhr.onCreate = function (xhr) {
            requests.push(xhr);
        };
    });

    afterEach(function() {
        this.xhr.restore();
    });

    describe('.proxy()', function () {

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
            new XMLHttpRequestProxy.prototype.proxy(["https://configuration"]);
            assert.equal(this.requests.length, 1);
            assert.equal(this.requests[0].url, "https://configuration");
            console.log("------");
            console.log(this.requests[0]);
            console.log(this.requests[0].onload("what"));
            console.log(this.requests[0]);
        });

        it('should load multiple configs', function () {
            new XMLHttpRequestProxy.prototype.proxy(["https://configuration", "https://configuration2"]);
            assert.equal(this.requests.length, 2);
            assert.equal(this.requests[0].url, "https://configuration");
            assert.equal(this.requests[1].url, "https://configuration2");
        });

        it('should load single config', function () {
            // XMLHttpRequest = sinon.mock(XMLHttpRequest);
            new XMLHttpRequestProxy.prototype.proxy(["https://configuration"]);

        });

        it('should load multiple config', function () {

        });
    });


});
