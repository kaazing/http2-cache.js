var Dict = require("collections/dict"),
    logger = require('./logger'),
    Promise = require("bluebird");

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

    var maxAgeHeaderName = getMaxAgeHeaderName(header) ,
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
    Object.keys(headers).keys(function(key) {
        Object.defineProperty(requestInfo.headers, key, {
            configurable: false,
            writable: false,
            value: headers[key]
        });
    });

    return headers;
}

var privateCacheHashHeaders = ['Authorization'];
var RequestInfo = function (method, href, headers) {
    var self = this;
    self.method = method;
    self.href = href;
    self.headers = getRequestInfoHeaders(self, headers);

    var cacheControlHeader = getCacheControlHeaders(self)
    self.cacheDirectives = parseCacheControl(cacheControlHeader);

    self.hash = self.method + '^' + self.href;

    // Use requestHashHeaders only if cacheControlHeader not public
    // TODO cacheDirectives default ?
    if (
        self.cacheDirectives && 
            self.cacheDirectives.public !== true
    ) {
        privateCacheHashHeaders.forEach(function (requestHashHeader) {
            if (self.headers.hasOwnProperty(requestHashHeader)) {
                self.hash += self.headers[requestHashHeader];
            }
        });
    }
};

// var rip = RequestInfo.prototype;


//////////////////////////////////////////// Cache ////////////////////////////////////////////

function Cache(options) {
    var self = this;
    options = options || {};

    // Init debug/log
    self.debug = options.debug;
    self._log = options.log || (self.debug ? logger.consoleLogger : logger.defaultLogger);

    // mapping from hash of request info to time ordered list or responses
    this._requestInfoToResponse = new Dict();
}

var cp = Cache.prototype;

function getExpireTime(response) {
    var cacheControlHeaders = getCacheControlHeaders(response);
    var maxAgeAt = -1;
    var staleButRevalidateAt = -1;
    if (cacheControlHeaders) {
        var date = response.headers.date;
        if (!date) {
            // RFC error here, maybe we should ignore the request
            date = new Date().getTime();
        } else {
            date = new Date(date).getTime();
        }
        var dateInSeconds = date;
        var directives = parseCacheControl(cacheControlHeaders);
        if (directives['max-age']) {
            maxAgeAt = date + (directives['max-age'] * 1000);
        }
        if (directives['stale-while-revalidate']) {
            staleButRevalidateAt = dateInSeconds + (directives['stale-while-revalidate'] * 1000);
        }
    }
    return maxAgeAt > staleButRevalidateAt ? maxAgeAt : staleButRevalidateAt;
}

function isExpired(response, currentTime) {
    return getExpireTime(response) < currentTime;
}

function satisfiesRequest(/*requestInfo, response*/) {
    // TODO
    return true;
}

var CACHEABLE_BY_DEFAULT_STATUS_CODES = [200, 203, 204, 206, 300, 301, 404, 405, 410, 414, 501];
function isCacheableResponse(response) {
    if (CACHEABLE_BY_DEFAULT_STATUS_CODES.indexOf(response.statusCode) === -1) {
        return false;
    }
    var cacheControlHeaders = getCacheControlHeaders(response);
    if (cacheControlHeaders) {
        var directives = parseCacheControl(cacheControlHeaders);
        if (directives['max-age']) {
            return true;
        } else if(directives['stale-while-revalidate']) {
            return true;
        }
    }
    return false;
}

cp.match = function (requestInfo/*, options*/) {

    var self = this;
    return new Promise(function (resolve, reject) {
        var response = null;

        if (!requestInfo instanceof RequestInfo) {
            reject(new TypeError("Invalid requestInfo argument"))
        } else {
            var requestCacheDirectives = requestInfo.cacheDirectives;
            if (requestCacheDirectives === null || !requestCacheDirectives['no-cache']) {
                var candidate = self._requestInfoToResponse.get(requestInfo.hash);
                if (candidate && satisfiesRequest(requestInfo, candidate) && !isExpired(candidate, new Date().getTime())) {
                    response = candidate;
                }
            }
            resolve(response);   
        }
    });
};

cp._expireOld = function () {
    var self = this;
    self._requestInfoToResponse.forEach(function (response, request) {
        var currentTime = new Date().getTime();
        if (isExpired(response, currentTime)) {
            if (self._debug) {
                self._log.debug("Evicted Response from cache for: " + request);
            }
            self._requestInfoToResponse.delete(request);
        }
    });
};

cp.put = function (requestInfo, response) {
    var self = this;
    return new Promise(function (resolve, reject) {
        // Check requestInfo type
        if (!requestInfo instanceof RequestInfo) {
            reject(new TypeError("Invalid requestInfo argument"))
        } else if (!isCacheableResponse(response)) {
            reject(new Error("Not Cacheable response"));
        } else {
            if (self._debug) {
                self._log.debug("Adding cache entry to:" + requestInfo.hash);
            }
            self._requestInfoToResponse.set(requestInfo.hash, response);
            resolve();
        }
    });
};

cp.setDebug = function (debug) {
    this._debug = debug;
};

//////////////////////////////////////////// Exports ////////////////////////////////////////////
module.exports = {
    RequestInfo: RequestInfo,
    Cache: Cache,
    parseCacheControl: parseCacheControl,
    satisfiesRequest: satisfiesRequest,
    isCacheableResponse: isCacheableResponse,
};
