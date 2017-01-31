var assert = require('assert');
var XMLHttpRequest = require("xhr2").XMLHttpRequest;
var XMLHttpRequestProxy = require("../lib/XMLHttpRequestProxy");

describe('XMLHttpRequestProxy', function () {

    describe('.proxy()', function () {

        it('with empty params throws exception', function () {
            assert.throws(new XMLHttpRequestProxy().proxy);
        });

        it('with no arrays throws exception', function () {
            assert.throws(function () {
                    new XMLHttpRequestProxy().proxy("http://url");
                }
            )
        });

        it('should load config', function () {

        });
    });
});
