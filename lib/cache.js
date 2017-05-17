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
    this._firstExpiresRequestInfo = new SortedArrayMap();
    this._requestInfoResponses = new Map();
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
            var responses = self._requestInfoResponses.get(requestInfo.hash);
            if (responses) {
                var values = responses.values();
                var v = values.next();
                while (!v.done) {
                    if (satisfiesRequest(requestInfo, v.value)) {
                        response = v.value;
                        break;
                    }
                    v = values.next();
                }
            }
        }
        resolve(response);
    });
};

cp._expireOld = function () {
    var c = new Date().getTime();
    var keys = this._firstExpiresRequestInfo.keys();
    var k = keys.next();
    while (!k.done) {
        if (k.value < c) {
            var hash = this._firstExpiresRequestInfo.get(k.value);
            var responses = this._requestInfoResponses.get(hash);
            responses._expireOld();
            var nextExpiration = responses.keys().next();
            if (this._debug) {
                console.log("Evicting a request on hash: " + hash + ", that expires at:" + k.value);
            }
            if (nextExpiration.done) {
                if (this._debug) {
                    console.log("No more entries for hash: " + hash + ", removing");
                }
                this._firstExpiresRequestInfo.delete(k.value);
            } else {
                this._firstExpiresRequestInfo.set(nextExpiration.value, responses);
                if (this._debug) {
                    console.log("Another entry for: " + hash + ", adding ");
                }
            }
        } else {
            break;
        }
        k = keys.next();
    }
};

cp.put = function (requestInfo, response) {
    var self = this;
    return new Promise(function (resolve, reject) {
        if (!isCacheableResponse(response)) {
            reject(new TypeError("Not Cacheable response"));
        } else {
            var expiringMap = self._requestInfoResponses.get(requestInfo.hash);
            if (!expiringMap) {
                expiringMap = new ExpiringMap();
                self._requestInfoResponses.set(requestInfo.hash, expiringMap);
            }

            // getStaleTimeInSecondsSinceEpoch(response).then(function (expiringTime) {
            //     expiringMap.set(expiringTime, response);
            //     var firstToExpire = expiringMap.keys().next();
            //     self._firstExpiresRequestInfo.set(firstToExpire.value, requestInfo.hash);
            //     resolve();
            // }).catch(reject);

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
                expiringMap.set(cacheUntil, response);
                var firstToExpire = expiringMap.keys().next();
                self._firstExpiresRequestInfo.set(firstToExpire.value, requestInfo.hash);
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
