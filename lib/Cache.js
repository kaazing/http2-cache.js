const Promise = require("bluebird");
const Map = require("collections/map");

//////////////      Cache           ////////////
var Cache = function () {
    this.requestToResponse = new Map();
};

const cp = Cache.prototype;

function resolvePort(u) {
    var parse = (u instanceof url.constructor) ? u : parseUrl(u);
    var port = parse.port;
    if (port == null) {
        var s = parse.scheme;
        if (s === "ws" || s === "http") {
            port = 80;
        } else {
            port = 443;
        }
    }
    return port;
}

cp.match = function (requestInfo) {
    var self = this;
    return new Promise(function (resolve, reject) {
        var responsePromise = self.requestToResponse.get(requestInfo.key);
        if (requestInfo.isCacheable() && responsePromise) {
            const onResponse = function (response) {
                if (Cache.isCacheableResponse(response)) {
                    resolve(response);
                } else {
                    reject();
                }
            };

            const onError = function (e) {
                reject(e);
            };

            responsePromise.then(onResponse, onError);
        } else {
            reject();
        }
    })
};

Cache.isCacheableResponse = function (response) {
    // contains an Expires header field (see Section 5.3), or
    //
    // *  contains a max-age response directive (see Section 5.2.2.8), or
    //
    // *  contains a s-maxage response directive (see Section 5.2.2.9)
    // and the cache is shared, or
    //
    // *  contains a Cache Control Extension (see Section 5.2.3) that
    // allows it to be cached, or
    //
    // *  has a status code that is defined as cacheable by default (see
    // Section 4.2.2), or


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

cp.put = function (requestInfo, responsePromise) {
    if (requestInfo.isCacheable()) {
        const requestToResponse = this.requestToResponse;
        requestToResponse.set(requestInfo.key, responsePromise);

        const onResponse = function (response) {
            if (!Cache.isCacheableResponse(response)) {
                requestToResponse.delete(responsePromise);
            }
        };

        const onResponseError = function () {
            requestToResponse.remove(requestInfo.key);
        };

        responsePromise.then(onResponse, onResponseError);
    }
};

cp.delete = function (requestInfo) {

};

module.exports = Cache;

//////////////      RequestInfo     ////////////
var RequestInfo = function (method, url) {
    this.key = method + '^' + url; // ^ is not valid in method or url
};

const NOT_CACHEABLE = new RequestInfo(null, null);

RequestInfo.prototype.isCacheable = function () {
    return this.key !== NOT_CACHEABLE.key
};

// RequestInfo.fromRequest = function (request) {
//     // https://tools.ietf.org/html/rfc7234#section-3
//     if (request.method.toLowerCase() !== "get") {
//         return NOT_CACHEABLE;
//     }
//     if (request.headers['Cache-Control']) {
//         var directives = request.headers['Cache-Control'].split(',');
//         var cntI = directives.length;
//         for (var i = 0; i < cntI; i++) {
//             switch (directives[i].toLowerCase()) {
//                 case 'no-store':
//                     return NOT_CACHEABLE;
//                 // THIS is a private cache
//                 // case 'private':
//                 //     return NOT_CACHEABLE;
//                 default:
//                 // NOOP
//             }
//         }
//     }
//     return new RequestInfo(request.method, request.host + request.path)
// };

module.exports = {
    Cache: Cache,
    RequestInfo: RequestInfo
};

