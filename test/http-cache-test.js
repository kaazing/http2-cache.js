/* global console */
var chai = require('chai');
var assert = chai.assert;

/* jshint ignore:start */
if (typeof XMLHttpRequest === 'undefined') {
    XMLHttpRequest = require("xhr2").XMLHttpRequest;   
}
/* jshint ignore:end */
require("../lib/http2-cache");

var parseCacheControl = require('../lib/cache.js').parseCacheControl,
    RequestInfo = require('../lib/cache.js').RequestInfo,
    satisfiesRequest = require('../lib/cache.js').satisfiesRequest,
    isCacheableResponse = require('../lib/cache.js').isCacheableResponse,
    Cache = require('../lib/cache.js').Cache;

describe('http-cache', function () {

    it.skip('satisfiesRequest(requestInfo, response)', function () {
        var requestInfo = new RequestInfo("GET", "https://example.com/", {});
        // TODO, confirm url has scheme and host etc
        assert.equal(satisfiesRequest(requestInfo, {'href': "https://example.com/"}), true);
        assert.equal(satisfiesRequest(requestInfo, {'href': "https://notexample.com/"}), false);
    });

    it('isCacheableResponse(response)', function () {
        assert.equal(isCacheableResponse({'headers': {'cache-control': 'max-age=30'}, 'statusCode': 200}), true);
        assert.equal(isCacheableResponse({'headers': {'cache-control': 'not-one-I-know'}, 'statusCode': 200}), false);
    });

    // TODO better testing of max age and stale-while-revalidate
    // it('getStaleTimeInSecondsSinceEpoch(response)', function (done) {
    //     getExpirationTimeOfResponse({
    //         'headers': {
    //             'cache-control': 'max-age=30',
    //             'date': 'Mon Mar 27 2017 15:24:52 GMT-0700 (PDT)'
    //         }
    //     }).then(function (expiresAt) {
    //         assert.equal(expiresAt, 1490653522);
    //         done();
    //     });
    // });

    it('Cache returns match', function (done) {
        var cache = new Cache();
        var response1 = {
            'href': 'https://example.com/', 
            'headers': {
                'cache-control': 
                'max-age=30', 
                'date': new Date()}, 
                'statusCode': 200
            };
        var requestInfo = new RequestInfo("GET", "https://example.com/", {});
        cache.put(requestInfo, response1).then(function () {
            cache.match(requestInfo).then(function (r) {
                assert.equal(r, response1);
                done();
            });
        });
    });

    it('Cache returns null on no-cache request directive', function (done) {
        var cache = new Cache();
        var response1 = {
            'href': 'https://example.com/', 
            'headers': {
                'cache-control': 
                'max-age=30', 
                'date': new Date()}, 
                'statusCode': 200
            };
        var requestInfo = new RequestInfo("GET", "https://example.com/", {'cache-control': 'no-cache'});
        cache.put(requestInfo, response1).then(function () {
            cache.match(requestInfo).then(function (r) {
                assert.equal(r, null);
                done();
            });
        });
    });

    it('Cache returns no match', function (done) {
        var cache = new Cache();
        var response1 = {
            'headers': {'cache-control': 'max-age=30', 'date': new Date()}, 
            'statusCode': 200
        };
        var requestInfo = new RequestInfo("GET", "https://example.com/", {});
        var requestInfo2 = new RequestInfo("GET", "https://example2.com/", {});
        cache.put(requestInfo, response1).then(function () {
            cache.match(requestInfo2).then(function (r) {
                assert.equal(r, null);
                done();
            });
        });
    });

    it('Cache returns no match when expires', function (done) {
        var cache = new Cache();
        var response1 = {
            'href': 'https://example.com/',
            'headers': {'cache-control': 'max-age=1', 'date': new Date()},
            'statusCode': 200
        };
        var requestInfo = new RequestInfo("GET", "https://example.com/", {});
        cache.put(requestInfo, response1).then(
            setTimeout(
                function () {
                    cache.match(requestInfo).then(function (r) {
                        assert.equal(r, null);
                        done();
                    });
                }, 1100)
        );
    });

    it('Cache update fail when no cachable statusCode provided', function (done) {
        var cache = new Cache();
        var response1 = {
            'href': 'https://example.com/',
            'headers': {'cache-control': 'max-age=1', 'date': new Date()},
            'statusCode': 500
        };
        var requestInfo = new RequestInfo("GET", "https://example.com/", {});
        cache.put(requestInfo, response1).catch(function (err) {
            assert.equal(err.message, 'Not Cacheable response');
            done();
        });
    });

    it('Cache match when Authorization header does match', function (done) {
        var cache = new Cache();
        var response1 = {
            'href': 'https://example.com/',
            'headers': {
                'cache-control': 'max-age=1', 
                'date': new Date()
            },
            'statusCode': 200
        };
        var requestInfo1 = new RequestInfo("GET", "https://example.com/", {
            'Authorization': 'MyFirstToken'
        });

        var requestInfo2 = new RequestInfo("GET", "https://example.com/", {
            'Authorization': 'MyFirstToken'
        });
        cache.put(requestInfo1, response1).then(function () {
            cache.match(requestInfo2).then(function (r) {
                assert.equal(r, response1);
                done();
            });
        });
    });

    it('Cache match fail when Authorization header does not match', function (done) {
        var cache = new Cache();
        var response1 = {
            'href': 'https://example.com/',
            'headers': {
                'cache-control': 'max-age=1', 
                'date': new Date()
            },
            'statusCode': 200
        };
        var requestInfo1 = new RequestInfo("GET", "https://example.com/", {
            'Authorization': 'MyFirstToken'
        });

        var requestInfo2 = new RequestInfo("GET", "https://example.com/", {
            'Authorization': 'MySecondToken'
        });
        cache.put(requestInfo1, response1).then(function () {
            cache.match(requestInfo2).then(function (r) {
                assert.equal(r, null);
                done();
            });
        });
    });

    it('Cache match fail when Authorization header does not match, unless cache-control: public', function (done) {
        var cache = new Cache();
        var response1 = {
            'href': 'https://example.com/public',
            'headers': {
                'cache-control': 'public, max-age=1', 
                'date': new Date()
            },
            'statusCode': 200
        };
        var requestInfo1 = new RequestInfo("GET", "https://example.com/public", {
            'Authorization': 'MyFirstToken'
        });

        var requestInfo2 = new RequestInfo("GET", "https://example.com/public", {
            'Authorization': 'MySecondToken'
        });
        cache.put(requestInfo1, response1).then(function () {
            cache.match(requestInfo2).then(function (r) {
                assert.equal(r, response1);
                done();
            });
        });
    });

    it('Cache update fail when no cachable statusCode provided after a cachable statusCode and return inital cached response', function (done) {
        var cache = new Cache();
        var response1 = {
            'href': 'https://example.com/', 
            'headers': {
                'cache-control': 
                'max-age=30', 
                'date': new Date()}, 
                'statusCode': 200
            };
        var response2 = {
            'href': 'https://example.com/', 
            'headers': {
                'date': new Date()}, 
                'statusCode': 400
            };
        var requestInfo = new RequestInfo("GET", "https://example.com/", {});
        cache.put(requestInfo, response1).then(function () {
            cache.match(requestInfo).then(function (r) {
                assert.equal(r, response1);
                cache.put(requestInfo, response2).catch(function (err) {
                    assert.equal(err.message, 'Not Cacheable response');

                    // Here is check cache has been clear
                    cache.match(requestInfo).then(function (r) {
                        assert.equal(r, response1);
                        done();
                    });
                });
            });
        });
    });

    // https://github.com/roryf/parse-cache-control/blob/master/LICENSE
    it('should parse cache control', function () {
        var header = parseCacheControl('must-revalidate, max-age=3600');
        assert.ok(header);
        assert.equal(header['must-revalidate'], true);
        assert.equal(header['max-age'], 3600);

        header = parseCacheControl('must-revalidate, max-age="3600"');
        assert.ok(header);
        assert.equal(header['must-revalidate'], true);
        assert.equal(header['max-age'], 3600);

        header = parseCacheControl('must-revalidate, s-maxage="3601", max-age="3600"');
        assert.ok(header);
        assert.equal(header['must-revalidate'], true);
        assert.equal(header['max-age'], 3601);
        assert.equal(header['s-maxage'], 3601);

        header = parseCacheControl('must-revalidate, s-maxage="3600", max-age="3601"');
        assert.ok(header);
        assert.equal(header['must-revalidate'], true);
        assert.equal(header['max-age'], 3601);
        assert.equal(header['s-maxage'], 3601);

        header = parseCacheControl('must-revalidate max-age=3600');
        assert.equal(header, null);

        header = parseCacheControl('must-revalidate, b =3600');
        assert.equal(header, null);

        header = parseCacheControl('must-revalidate, max-age=a3600');
        assert.equal(header, null);

        header = parseCacheControl('public, max-age=3600');
        assert.equal(header['public'], true);
        assert.equal(header['max-age'], 3600);

        header = parseCacheControl(123);
        assert.equal(header, null);

        header = parseCacheControl(null);
        assert.equal(header, null);

        header = parseCacheControl(undefined);
        assert.equal(header, null);
    });
});