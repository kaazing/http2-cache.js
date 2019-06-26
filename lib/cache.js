var logger = require('./logger'),
    PassThrough = require('stream').PassThrough,
    keys = require('object-keys'),
    Map = require("collections/map");

// https://github.com/roryf/parse-cache-control/blob/master/LICENSE
/*
 Cache-Control   = 1#cache-directive
 cache-directive = token [ "=" ( token / quoted-string ) ]
 token           = [^\x00-\x20\(\)<>@\,;\:\\"\/\[\]\?\=\{\}\x7F]+
 quoted-string   = "(?:[^"\\]|\\.)*"
*/
//                             1: directive                                        =   2: token                                              3: quoted-string

function parseMaxAge(maxAge) {
    // Only parse once
    if (typeof maxAge === 'number') {
        return maxAge;
    }
    return parseInt(maxAge, 10);
}

function getMaxAgeHeaderName(header) {
    if (header['max-age'] && header['s-maxage']) {
        // Get bigest value of both
        return parseInt(header['max-age'], 10) < parseInt(header['s-maxage'], 10) ? 's-maxage' : 'max-age';
    } else {
        return 'max-age';
    }
}

var PARSE_CACHE_CONTROL_REG = /(?:^|(?:\s*\,\s*))([^\x00-\x20\(\)<>@\,;\:\\"\/\[\]\?\=\{\}\x7F]+)(?:\=(?:([^\x00-\x20\(\)<>@\,;\:\\"\/\[\]\?\=\{\}\x7F]+)|(?:\"((?:[^"\\]|\\.)*)\")))?/g;
function parseCacheControl(field) {

    if (typeof field !== 'string') {
        return null;
    }

    var header = {};
    var error = field.replace(PARSE_CACHE_CONTROL_REG, function ($0, $1, $2, $3) {
        var value = $2 || $3;
        header[$1] = value ? value.toLowerCase() : true;
        return '';
    });

    var maxAgeHeaderName = getMaxAgeHeaderName(header),
        maxAge = header[maxAgeHeaderName];

    if (maxAge) {
        maxAge = parseMaxAge(maxAge);
        if (isNaN(maxAge)) {
            return null;
        } else if (maxAge) {

            if (header['s-maxage']) {
                header['s-maxage'] = maxAge;
            }

            header['max-age'] = maxAge;
        }   
    }

    return (error ? null : header);
}

function getCacheControlHeaders(response) {
    return response.headers['cache-control'];
}

//////////////////////////////////////////// Request Info ////////////////////////////////////////////

function getRequestInfoHeaders(requestInfo, headers) {

    // Make headers and Object to match response (see parseCacheControl and getCacheControlHeaders)
    if (headers instanceof Map) {
        var headerMap = headers;
        headers = {};
        headerMap.forEach(function(value, key) {
             headers[key] = value;
        });
    }

    // Create read-only prop on headers Object
    var requestInfoHeaders = requestInfo.headers || {};
    if (headers) {
        Object.keys(headers).forEach(function(key) {
            Object.defineProperty(requestInfoHeaders, key, {
                configurable: false,
                writable: false,
                value: headers[key]
            });
        });   
    }

    return requestInfoHeaders;
}


var RequestInfo = function (method, href, headers) {
    var self = this;
    self.method = method;
    self.href = href;
    self.headers = getRequestInfoHeaders(self, headers);

    var cacheControlHeader = getCacheControlHeaders(self);
    self.cacheDirectives = parseCacheControl(cacheControlHeader);

    // TODO add header or body to hash or use sequense ?
    self.hash = self.method + '^' + self.href;

};

var privateCacheHashHeaders = ['authorization'];
RequestInfo.prototype.getResponseHash = function (cacheResponseDirectives) {

    // TODO use self.cacheDirectives?
    var self = this,
        hash = self.hash;

    // Use getResponseHash only if cacheControlHeader not public
    if (
        !cacheResponseDirectives || 
            cacheResponseDirectives && (
                cacheResponseDirectives.public !== true || 
                    cacheResponseDirectives.private === true
            )
    ) {
        privateCacheHashHeaders.forEach(function (requestHashHeader) {
            if (self.headers.hasOwnProperty(requestHashHeader)) {
                hash += '^' + requestHashHeader + '=' + self.headers[requestHashHeader];
            }
        });
    }

    // DEBUG:
    //console.log(self.href, cacheResponseDirectives, hash);

    return hash;
};

//////////////////////////////////////////// Cache ////////////////////////////////////////////

function Cache(options) {
    var self = this;
    options = options || {};

    // Init debug/log
    self.debug = options.debug;
    self._log = options.log || (self.debug ? logger.consoleLogger : logger.defaultLogger);

    // mapping from hash of request info to time ordered list or responses
    this._requestInfoToResponses = new Map();
    this._requestInfoRevalidating = new Map();
}

var cp = Cache.prototype;

cp.setDebug = function (debug) {
    this._debug = debug;
};

function getExpireTime(response, cacheDirectives, revalidating) {
    
    var maxAgeAt = -1,
        staleButRevalidateAt = -1;


    var date = response.headers.date;
    if (!date) {
        // TODO RFC error here, maybe we should ignore the request
        date = new Date().getTime();
    } else {
        date = new Date(date).getTime();
    }

    if (cacheDirectives['max-age']) {
        maxAgeAt = date + (cacheDirectives['max-age'] * 1000);
    }

    if (revalidating && cacheDirectives['stale-while-revalidate']) {
        staleButRevalidateAt = date + (cacheDirectives['stale-while-revalidate'] * 1000);
    }

    return maxAgeAt > staleButRevalidateAt ? maxAgeAt : staleButRevalidateAt;
}

function satisfiesRequest(requestInfo, candidate, candidateHash, revalidating) {

    var currentTime = new Date().getTime(), // TODO get time from requestInfo ?
        cacheControlHeaders = getCacheControlHeaders(candidate),
        cacheResponseDirectives = parseCacheControl(cacheControlHeaders),
        responseHash = requestInfo.getResponseHash(cacheResponseDirectives);

    return getExpireTime(candidate, cacheResponseDirectives, revalidating) > currentTime && 
        responseHash === candidateHash;
}

var CACHEABLE_BY_DEFAULT_STATUS_CODES = [200, 203, 204, 206, 300, 301, 404, 405, 410, 414, 501];

function isCacheableResponse(response, cacheResponseDirectives) {

    if (CACHEABLE_BY_DEFAULT_STATUS_CODES.indexOf(response.statusCode) === -1) {
        return false;
    }

    var cacheControlHeaders = getCacheControlHeaders(response);
    if (cacheControlHeaders) {
        cacheResponseDirectives = cacheResponseDirectives || parseCacheControl(cacheControlHeaders);
        if (cacheResponseDirectives['max-age']) {
            return true;
        } else if(cacheResponseDirectives['stale-while-revalidate']) {
            return true;
        }
    }
    return false;
}



/*
The corresponding RFC 2616 in section 9.5 (POST) allows the caching of the response to a 
POST message, if you use the appropriate headers. Responses to this method are not cacheable, 
unless the response includes appropriate Cache-Control or Expires header fields. However, the 303 (See Other) 
response can be used to direct the user agent to retrieve a cacheable resource.

Note that the same RFC states explicitly in section 13 (Caching in HTTP) that a cache must invalidate the 
corresponding entity after a POST request.

Some HTTP methods MUST cause a cache to invalidate an entity. This is either the entity referred to by the 
Request-URI, or by the Location or Content-Location headers (if present). These methods are:

  - PUT
  - DELETE
  - POST
It's not clear to me how these specifications can allow meaningful caching.
*/

var CACHEABLE_BY_DEFAULT_METHODS = ['GET', 'HEAD', 'TRACE', 'OPTIONS', 'CONNECT'];

function isCacheableRequest(requestInfo, requestCacheDirectives) {
    if (CACHEABLE_BY_DEFAULT_METHODS.indexOf(requestInfo.method) === -1) {
        return false;
    }

    if (
        !requestCacheDirectives || 
            // Bypass cache
            (!requestCacheDirectives['no-cache'] && !requestCacheDirectives['no-store'])
    ) {
        return true;
    }    

    return false;
}

cp.match = function (requestInfo/*, options*/) {

    var self = this;
    return new Promise(function (resolve, reject) {
        var response = null;

        if (!(requestInfo instanceof RequestInfo)) {
            reject(new TypeError("Invalid requestInfo argument"));
        } else {

            var requestCacheDirectives = requestInfo.cacheDirectives,
                requestIsRevalidating = self.isRevalidating(requestInfo);

            // Only lookup in cache if request is cacheable
            // TODO issue with PUSH does POST|PUT|DELETE can even be push ?
            if (isCacheableRequest(requestInfo, requestCacheDirectives)) {

                var candidate, candidateHash,
                    candidates = self._requestInfoToResponses.get(requestInfo.hash) || new Map(),
                    cadidatesHashs = candidates.keys();

                while (
                    response === null &&
                        (candidateHash = cadidatesHashs.next()) &&
                            (candidateHash.done === false)
                ) {

                    candidate = candidateHash.value && 
                                    candidates.get(candidateHash.value);

                    if (
                        candidate && 
                            satisfiesRequest(requestInfo, candidate, candidateHash.value, requestIsRevalidating)
                    ) {
                        response = candidate;
                    }
                }                
            }
            
            resolve(response);   
        }
    });
};

function isExpired(candidate, currentTime) {
    var cacheControlHeaders = getCacheControlHeaders(candidate),
        cacheResponseDirectives = parseCacheControl(cacheControlHeaders);
    return getExpireTime(candidate, cacheResponseDirectives) < currentTime;
}

cp.clearExpired = function () {
    var self = this;
    self._requestInfoToResponses.forEach(function (candidates) {
        candidates.forEach(function (response, requestInfoHash) {
            var currentTime = new Date().getTime();
            if (isExpired(response, currentTime)) {
                if (self._debug) {
                    self._log.debug("Evicted Response from cache for requestInfo Hash: " + requestInfoHash);
                }
                self._requestInfoToResponses.delete(requestInfoHash);
            }
        });
    });
};

/**
 * Clear all requestInfos from revalidation.
 */
cp.clearRevalidates = function () {
    this._requestInfoRevalidating = new Map();
};

/**
 * Check if a given requestInfo is currently revalidating.
 */
cp.isRevalidating = function (requestInfo) {
    return !!this._requestInfoRevalidating.get(requestInfo.hash);
};

/**
 * Add given requestInfo to revalidating.
 */
cp.revalidate = function (requestInfo, request) {
    var self = this,
        revalidate = self._requestInfoRevalidating.get(requestInfo.hash) || [],
        requestStream = request || revalidate.length + 1;

    // TODO special behavior ?
    if (self._requestInfoRevalidating.get(requestInfo.hash)) {
        if (self._debug) {
            self._log.debug("Updated requestInfo for revalidating with hash: " + requestInfo.hash);
        }
    } else {
        if (self._debug) {
            self._log.debug("Added requestInfo to revalidate with hash: " + requestInfo.hash);
        }
    }

    // Push Request|PushRequest|Number
    revalidate.push(requestStream);

    self._requestInfoRevalidating.set(requestInfo.hash, revalidate);
};

/**
 * Clear given requestInfo from revalidation.
 */
cp.validated = function (requestInfo, request) {
    var self = this,
        revalidate = self._requestInfoRevalidating.get(requestInfo.hash) || [],
        requestStream = request || revalidate.length;

    if (revalidate.length > 0) {

        // Push Request|PushRequest|Number
        var requestStreamIndex = revalidate.indexOf(requestStream);

        if (requestStreamIndex === -1) {
            console.error('Invalid state unable to validate:' + requestStream);
            self._requestInfoRevalidating.delete(requestInfo.hash);
            return false;
        }

        // Remove request from revalidate
        revalidate.splice(requestStreamIndex, 1);

        if (self._debug) {
            self._log.debug("Evicted requestInfo from revalidate with hash: " + requestInfo.hash);
        }

        if (revalidate.length > 0) {

            // TODO WIP:
            // If the http2-cache.js gets 2 push promises for the same url opened, it should cancel one of them.
            // Related:
            // - https://github.com/nodejs/node/issues/445
            self._log.debug("First revalidate ended close all previous request stream for hash: " + requestInfo.hash);

            revalidate.reduce(function (revalidate, requestStream, requestStreamIndex) {
                // OutgoingRequest->IncomingMessage->PassThrough should be instance of Stream
                // Related:
                // - https://github.com/nodejs/node/issues/445#issuecomment-381383291
                // - https://github.com/nodejs/node/issues/2994
                // TODO instanceof IncomingResponse?
                if (requestStream && requestStream.stream) {
                    self._log.debug("Closing request stream for href " + requestInfo.href + " and hash: " + requestInfo.hash);

                    // Related:
                    // - https://groups.google.com/forum/#!msg/nodejs/eGukJUQrOBY/URD8I7tNxRUJ
                    // - https://stackoverflow.com/questions/33411212/closing-http-response-stream-in-nodejs-before-it-ends
                    requestStream.end();

                    self._log.debug(requestInfo.href, 'previous requestStream destroyed');

                    // Remove from revalidate ?
                    //revalidate.splice(requestStreamIndex, 1);
                }

            }, revalidate);

            self._requestInfoRevalidating.set(requestInfo.hash, revalidate);
        } else {
            self._requestInfoRevalidating.delete(requestInfo.hash);   
        }
    }
};

/**
 * Check requestInfo response for cache update, then update cache if cachable.
 */
cp.put = function (requestInfo, response) {
    var self = this;
    return new Promise(function (resolve, reject) {
        // Check requestInfo type
        if (!(requestInfo instanceof RequestInfo)) {
            reject(new TypeError("Invalid requestInfo argument"));
        } else {

            var cacheControlHeaders = getCacheControlHeaders(response),
                cacheResponseDirectives = parseCacheControl(cacheControlHeaders);

            if (isCacheableResponse(response, cacheResponseDirectives) === false) {
                reject(new Error("Not Cacheable response"));
            } else {

                // Only store in cache if request is cacheable
                var requestCacheDirectives = requestInfo.cacheDirectives;
                if (isCacheableRequest(requestInfo, requestCacheDirectives) === true) {

                    var candidates = self._requestInfoToResponses.get(requestInfo.hash) || new Map(),
                        responseHash = requestInfo.getResponseHash(cacheResponseDirectives);

                    if (self._debug) {
                        self._log.debug("Adding cache entry to:" + requestInfo.hash + '/' + responseHash);
                    }

                    candidates.set(responseHash, response);
                    self._requestInfoToResponses.set(requestInfo.hash, candidates);
                }

                resolve();
            }
        }
    });
};

//////////////////////////////////////////// Exports ////////////////////////////////////////////
module.exports = {
    RequestInfo: RequestInfo,
    Cache: Cache,
    parseCacheControl: parseCacheControl,
    satisfiesRequest: satisfiesRequest,
    isCacheableRequest: isCacheableRequest,
    isCacheableResponse: isCacheableResponse,
};
