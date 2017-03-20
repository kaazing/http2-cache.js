var Promise = require("bluebird");
var Map = require("collections/map");
var EventEmitter = require('events').EventEmitter;
var util = require('util');
var parseCacheControl = require('./utils.js').parseCacheControl;

var Cache = function (sharedCache) {
    this.urlToReqResponse = new Map();
    EventEmitter.call(this);
    if (sharedCache) {
        this.isSharedCache = sharedCache;
    } else {
        this.isSharedCache = false;
    }
};

util.inherits(Cache, EventEmitter);

var cp = Cache.prototype;

/*
 * Returns a Promise that resolves to the response associated with
 * the first matching request in the Cache object.
 */
cp.match = function (requestInfo) {
    var self = this;
    return new Promise(function (resolve, reject) {
        var responsePromise = self.urlToReqResponse.get(requestInfo.url);
        if (self.canUseACachedResponse(requestInfo) && responsePromise) {
            responsePromise.then(function (response) {
                if (self.isCacheableResponse(response)) {
                    resolve(response);
                } else {
                    reject();
                }
            }, function (e) {
                reject(e);
            });
        } else {
            reject();
        }
    });
};

/*
 * Takes both a request and its response promise and adds it to the given _cache.
 * It takes the response promise because we don't want the system to be getting / pushing
 * two requests at the same time.
 */
cp.put = function (requestInfo, responsePromise) {
    var self = this;
    if (this.isCacheableRequest(requestInfo)) {
        var urlToReqResponse = this.urlToReqResponse;
        urlToReqResponse.set(requestInfo.url, responsePromise);

        responsePromise.then(function (response) {
            if (!self._cacheResponse(response)) {
                urlToReqResponse.delete(requestInfo.url);
            } else {
                self.emit('cached', requestInfo, response);
            }
        }).catch(function (e) {
            console.log(e.stack);
            urlToReqResponse.delete(requestInfo.url);
        });
    }
};

// TODO
// cp.delete = function (requestInfo) {
//
// };

/*
 * Checks to see if the response is cacheable, i.e.
 *
 * contains an Expires header field (see Section 5.3), or
 *
 * contains a max-age response directive (see Section 5.2.2.8), or
 *
 * contains a s-maxage response directive (see Section 5.2.2.9)
 * and the _cache is shared, or
 *
 * contains a Cache Control Extension (see Section 5.2.3) that
 * allows it to be cached, or
 *
 * has a status code that is defined as cacheable by default (see
 * Section 4.2.2), or
 */
cp.isCacheableResponse = function (response) {
    var cacheControlHeaders = response.headers['cache-control'];
    if (cacheControlHeaders) {
        var directives = cacheControlHeaders.split(/\s*,\s*/);
        var cntI = directives.length;
        for (var i = 0; i < cntI; i++) {
            if (directives[i].startsWith('max-age')) {
                return true;
            }
            else if (directives[i].startsWith('Expires')) {
                return true;
            }
            else if (directives[i].startsWith('s-maxage')) {
                return true;
            }
        }
    }
};


// https://tools.ietf.org/html/rfc7234#section-5.2.1
cp.isCacheableRequest = function (request) {
    // The request method is understood by the cache and defined as being
    // cacheable
    if (request.method !== 'GET') {
        return false;
    }
    if (request.cacheDirectives !== null) {
        // the "no-store" cache directive (see Section 5.2) does not appear
        // in request or response header fields, and
        if (request.cacheDirectives['no-store']) {
            return false;
        }
    }
    return true;
};

cp._cacheResponse = function (response) {

    // When presented with a request, a cache MUST NOT reuse a stored
    // response, unless:
    //
    // o  The presented effective request URI (Section 5.5 of [RFC7230]) and
    // that of the stored response match, and
    //
    // o  the request method associated with the stored response allows it
    // to be used for the presented request, and
    //
    // o  selecting header fields nominated by the stored response (if any)
    //     match those presented (see Section 4.1), and
    //
    // o  the presented request does not contain the no-cache pragma
    // (Section 5.4), nor the no-cache cache directive (Section 5.2.1),
    // unless the stored response is successfully validated
    // (Section 4.3), and
    //
    // o  the stored response does not contain the no-cache cache directive
    // (Section 5.2.2.2), unless it is successfully validated
    // (Section 4.3), and
    //
    // o  the stored response is either:
    //
    //      *  fresh (see Section 4.2), or
    //
    //      *  allowed to be served stale (see Section 4.2.4), or
    //
    //      *  successfully validated (see Section 4.3).

    // TODO, full implementation, but for now this
    // is for https://tools.ietf.org/html/rfc7540#section-8.2:

    // Pushed responses that are cacheable (see [RFC7234], Section 3) can be
    // stored by the client, if it implements an HTTP cache.  Pushed
    // responses are considered successfully validated on the origin server
    // (e.g., if the "no-cache" cache response directive is present
    // ([RFC7234], Section 5.2.2)) while the stream identified by the
    // promised stream ID is still open.

    // and https://tools.ietf.org/html/rfc7234#section-4

    var h = response.headers;
    var cd = parseCacheControl(h['cache-control']);
    if (cd) {
        if (cd['no-store']) {
            if (response.isValid && response.isValid()) {
                console.log("success");
                return true;
            }
        }
    }
    return false;
};

module.exports = Cache;
