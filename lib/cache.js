var SortedArrayMap = require("collections/sorted-array-map"),
    Map = require("collections/map"),
    Promise = require("bluebird");
// TypeError = require("./errors.js").TypeError;

//////////////////////////////////////////// Time Ordered Array ////////////////////////////////////////////

/**
 * Expires elements on map (removes them)
 */
// TODO, NIT: minor bug, doesn't deal with responses that expire at exact same time, instead delete the existing one
// which is technically ok (don't have to cache) but not ideal
function ExpiringMap() {
    this.backing = new SortedArrayMap();
}

var emp = ExpiringMap.prototype;

emp.set = function (expiration, value) {
    this._expireOld();
    return this.backing.set(expiration, value);
};

emp.values = function () {
    this._expireOld();
    return this.backing.values();
};

emp.keys = function () {
    this._expireOld();
    return this.backing.keys();
};

emp.get = function (kori, d) {
    return this.backing.get(kori, d);
};

emp._expireOld = function () {
    var c = new Date().getTime();
    var keys = this.backing.keys();
    var k = keys.next();
    while (!k.done) {
        if (k.value < c) {
            this.backing.delete(k.value);
        } else {
            break;
        }
        k = keys.next();
    }
};

//////////////////////////////////////////// Cache ////////////////////////////////////////////

function Cache() {
    // mapping from hash of request info to time ordered list or responses
    this._expiresToRequestInfo = new SortedArrayMap();
    this._requestInfoToResponse = new Map();
    this._debug = false;
}

var cp = Cache.prototype;

cp.match = function (requestInfo/*, options*/) {
    this._expireOld();
    var self = this;
    return new Promise(function (resolve/*, reject*/) {
        var response = null;
        var requestCacheDirectives = parseCacheControl(requestInfo.headers['cache-control']);
        if (requestCacheDirectives === null || !requestCacheDirectives['no-cache']) {
            var candidate = self._requestInfoToResponse.get(requestInfo.hash);
            if (candidate && satisfiesRequest(requestInfo, candidate)) {
                response = candidate;
            }
        }
        resolve(response);
    });
};

cp._expireOld = function () {
    var c = new Date().getTime();
    var keys = this._expiresToRequestInfo.keys();
    var k = keys.next();
    while (!k.done && k.value < c) {
        var requestInfo = this._expiresToRequestInfo.get(k.value);
        this._requestInfoToResponse.delete(requestInfo);
        this._expiresToRequestInfo.delete(k.value);
        k = keys.next();
    }
};

cp.put = function (requestInfo, response) {
    var self = this;
    return new Promise(function (resolve, reject) {
        if (!isCacheableResponse(response)) {
            reject(new TypeError("Not Cacheable response"));
        } else {
            var cacheControlHeaders = response.headers['cache-control'];
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
            var cacheUntil = maxAgeAt > staleButRevalidateAt ? maxAgeAt : staleButRevalidateAt;
            if(cacheUntil > 0) {
                if (self._debug) {
                    console.log("Adding cache entry to :" + requestInfo.hash + ", expires at:" + cacheUntil);
                }
                self._requestInfoToResponse.set(requestInfo.hash, response);
                self._expiresToRequestInfo.set(cacheUntil, requestInfo.hash);
                resolve();
            }else{
                reject("Not cacheable");
            }

        }
    });
};

cp.setDebug = function (debug) {
    this._debug = debug;
};

//////////////////////////////////////////// Request Info ////////////////////////////////////////////


var RequestInfo = function (method, href, headers) {
    this.method = method;
    this.href = href;
    this.headers = headers;
    this.cacheDirectives = parseCacheControl(this.headers['cache-control']);

    this.hash = this.method + '^' + this.href;
};

// var rip = RequestInfo.prototype;

//////////////////////////////////////////// Parse Cache Control Utils ////////////////////////////////////////////

function satisfiesRequest(/*requestInfo, response*/) {
    // TODO
    return true;
}

function isCacheableResponse(response) {
    var cacheControlHeaders = response.headers['cache-control'];
    if (cacheControlHeaders) {
        var directives = parseCacheControl(cacheControlHeaders);
        if (directives['max-age']) {
            return true;
        } else if(directives['stale-while-revalidate']){
            return true;
        }
    }
    return false;
}

// https://github.com/roryf/parse-cache-control/blob/master/LICENSE
function parseCacheControl(field) {

    if (typeof field !== 'string') {
        return null;
    }

    /*
     Cache-Control   = 1#cache-directive
     cache-directive = token [ "=" ( token / quoted-string ) ]
     token           = [^\x00-\x20\(\)<>@\,;\:\\"\/\[\]\?\=\{\}\x7F]+
     quoted-string   = "(?:[^"\\]|\\.)*"
     */

    //                             1: directive                                        =   2: token                                              3: quoted-string
    var regex = /(?:^|(?:\s*\,\s*))([^\x00-\x20\(\)<>@\,;\:\\"\/\[\]\?\=\{\}\x7F]+)(?:\=(?:([^\x00-\x20\(\)<>@\,;\:\\"\/\[\]\?\=\{\}\x7F]+)|(?:\"((?:[^"\\]|\\.)*)\")))?/g;

    var header = {};
    var error = field.replace(regex, function ($0, $1, $2, $3) {
        var value = $2 || $3;
        header[$1] = value ? value.toLowerCase() : true;
        return '';
    });

    if (header['max-age']) {
        try {
            var maxAge = parseInt(header['max-age'], 10);
            if (isNaN(maxAge)) {
                return null;
            }

            header['max-age'] = maxAge;
        }
        catch (err) {
        }
    }

    return (error ? null : header);
}

//////////////////////////////////////////// Exports ////////////////////////////////////////////
module.exports = {
    RequestInfo: RequestInfo,
    Cache: Cache,
    parseCacheControl: parseCacheControl,
    satisfiesRequest: satisfiesRequest,
    isCacheableResponse: isCacheableResponse,
};
