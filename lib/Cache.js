var Promise = require("bluebird");
var Map = require("collections/map");

var Cache = function () {
    this.requestToResponse = new Map();
};

var cp = Cache.prototype;

/*
 * Returns a Promise that resolves to the response associated with
 * the first matching request in the Cache object.
 */
cp.match = function (requestInfo) {
    var self = this;
    return new Promise(function (resolve, reject) {
        var responsePromise = self.requestToResponse.get(requestInfo.key);
        if (requestInfo.isCacheable() && responsePromise) {
            var onResponse = function (response) {
                if (isCacheableResponse(response)) {
                    resolve(response);
                } else {
                    reject();
                }
            };

            var onError = function (e) {
                reject(e);
            };

            responsePromise.then(onResponse, onError);
        } else {
            reject();
        }
    });
};

/*
 * Takes both a request and its response promise and adds it to the given cache.
 * It takes the response promise because we don't want the system to be getting / pushing
 * two requests at the same time.
 */
cp.put = function (requestInfo, responsePromise) {
    if (requestInfo.isCacheable()) {
        var requestToResponse = this.requestToResponse;
        requestToResponse.set(requestInfo.key, responsePromise);

        var onResponse = function (response) {
            if (!isCacheableResponse(response)) {
                requestToResponse.delete(responsePromise);
            }
        };

        var onResponseError = function (e) {
            console.log(e.stack);
            requestToResponse.delete(requestInfo.key);
        };

        responsePromise.then(onResponse, onResponseError);
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
 * and the cache is shared, or
 *
 * contains a Cache Control Extension (see Section 5.2.3) that
 * allows it to be cached, or
 *
 * has a status code that is defined as cacheable by default (see
 * Section 4.2.2), or
 */
function isCacheableResponse(response) {
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
}

module.exports = Cache;

//////////////////////////////////////////      RequestInfo     //////////////////////////////////////////



