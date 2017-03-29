var parseCacheControl = require('../lib/cache.js').parseCacheControl,
    RequestInfo = require('../lib/cache.js').RequestInfo,
    satisfiesRequest = require('../lib/cache.js').satisfiesRequest,
    isCacheableResponse = require('../lib/cache.js').isCacheableResponse,
    getExpirationTimeOfResponse = require('../lib/cache.js').getExpirationTimeOfResponse,
    Cache = require('../lib/cache.js').Cache,
    assert = require('assert');

describe('Http Cache', function () {

    it('satisfiesRequest(requestInfo, response)', function () {
        var requestInfo = new RequestInfo("GET", "https://example.com/", {});
        // TODO, confirm url has scheme and host etc
        assert.equal(satisfiesRequest(requestInfo, {'url': "https://example.com/"}), true);
        assert.equal(satisfiesRequest(requestInfo, {'url': "https://notexample.com/"}), false);
    });

    it('isCacheableResponse(response)', function () {
        assert.equal(isCacheableResponse({'headers': {'cache-control': 'max-age=30'}}), true);
        assert.equal(isCacheableResponse({'headers': {'cache-control': 'not-one-I-know'}}), false);
    });

    it('getExpirationTimeOfResponse(response)', function (done) {
        getExpirationTimeOfResponse({
            'headers': {
                'cache-control': 'max-age=30',
                'date': 'Mon Mar 27 2017 15:24:52 GMT-0700 (PDT)'
            }
        }).then(function (expiresAt) {
            assert.equal(expiresAt, 1490653522);
            done();
        });
    });

    it('Cache returns match', function (done) {
        var cache = new Cache();
        var response1 = {'url': 'https://example.com/', 'headers': {'cache-control': 'max-age=30', 'date': new Date()}};
        var requestInfo = new RequestInfo("GET", "https://example.com/", {});
        cache.put(requestInfo, response1).then(
            function () {
                cache.match(requestInfo).then(function (r) {
                    assert.equal(r, response1);
                    done();
                });
            }
        );
    });

    it('Cache returns null on no-cache request directive', function (done) {
        var cache = new Cache();
        var response1 = {'url': 'https://example.com/', 'headers': {'cache-control': 'max-age=30', 'date': new Date()}};
        var requestInfo = new RequestInfo("GET", "https://example.com/", {'cache-control': 'no-cache'});
        cache.put(requestInfo, response1).then(
            function () {
                cache.match(requestInfo).then(function (r) {
                    assert.equal(r, null);
                    done();
                });
            }
        );
    });

    it('Cache returns no match', function (done) {
        var cache = new Cache();
        var response1 = {
            'url': 'https://example2.com/',
            'headers': {'cache-control': 'max-age=30', 'date': new Date()}
        };
        var requestInfo = new RequestInfo("GET", "https://example.com/", {});
        cache.put(requestInfo, response1).then(
            function () {
                cache.match(requestInfo).then(function (r) {
                    assert.equal(r, null);
                    done();
                });
            }
        );
    });

    it('Cache returns no match when expires', function (done) {
        var cache = new Cache();
        var response1 = {
            'url': 'https://example.com/',
            'headers': {'cache-control': 'max-age=1', 'date': new Date()}
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

        header = parseCacheControl('must-revalidate, b =3600');
        assert.equal(header, null);

        header = parseCacheControl('must-revalidate, max-age=a3600');
        assert.equal(header, null);

        header = parseCacheControl(123);
        assert.equal(header, null);

        header = parseCacheControl(null);
        assert.equal(header, null);

        header = parseCacheControl(undefined);
        assert.equal(header, null);
    });
});