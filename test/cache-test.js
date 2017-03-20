// var Cache = require('../lib/cache.js');
var RequestInfo = require('../lib/request-info.js');
var Cache = require('../lib/cache.js');
var assert = require('assert');

describe('HTTP Cache', function () {

    var privateCache = new Cache(false);
    var sharedCache = new Cache(true);
    var putRequest = new RequestInfo('PUT', 'http://example.com', {});
    var getRequest = new RequestInfo('GET', 'http://example.com', {});
    var getNoCacheRequest = new RequestInfo('GET', 'http://example.com', {'cache-control': 'no-store'});


    it('canUseACachedResponse', function () {
        assert.equal(privateCache.isCacheableRequest(putRequest), false);
        assert.equal(privateCache.isCacheableRequest(getRequest), true);
        assert.equal(privateCache.isCacheableRequest(getNoCacheRequest), false);
        assert.equal(sharedCache.isCacheableRequest(putRequest), false);
        assert.equal(sharedCache.isCacheableRequest(getRequest), true);
        assert.equal(sharedCache.isCacheableRequest(getNoCacheRequest), false);
    });

    it('_cacheResponse', function () {
        assert.equal(privateCache._cacheResponse({
            getHeaders: function () {
                return {'cache-control': 'no-store'};
            },
            isValid: function () {
                return true;
            }
        }), true);
        assert.equal(privateCache._cacheResponse({
            getHeaders: function () {
                return {'cache-control': 'no-store'};
            },
            isValid: function () {
                return false;
            }
        }), false);
    });
});
