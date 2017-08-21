/* global console */
var assert = chai.assert;

describe('http2-proxy', function () {

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
});
