var SortedArrayMap = require("collections/sorted-array-map"),
    Map = require("collections/map"),
    Promise = require("bluebird");
    // TypeError = require("./Errors.js").TypeError;

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
    var c = new Date() / 1000;
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
    var c = new Date() / 1000;
    var keys = this._firstExpiresRequestInfo.keys();
    var k = keys.next();
    while (!k.done) {
        if (k.value < c) {
            var hash = this._firstExpiresRequestInfo.get(k.value);
            var responses = this._requestInfoResponses.get(hash);
            responses._expireOld();
            var nextExpiration = responses.keys().next();
            if (nextExpiration.done) {
                this._firstExpiresRequestInfo.delete(k.value);
            } else {
                this._firstExpiresRequestInfo.set(nextExpiration.value, responses[0]);
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
            getExpirationTimeOfResponse(response).then(function (expiringTime) {
                expiringMap.set(expiringTime, response);
                var firstToExpire = expiringMap.keys().next();
                self._firstExpiresRequestInfo.set(firstToExpire.value, requestInfo.hash);
                resolve();
            }).catch(reject);
        }
    });
};

//////////////////////////////////////////// Request Info ////////////////////////////////////////////


var RequestInfo = function (method, url, headers) {
    this.method = method;
    this.url = url;
    this.headers = headers;
    this.cacheDirectives = parseCacheControl(this.headers['cache-control']);

    this.hash = this.method + '^' + this.url;
};

// var rip = RequestInfo.prototype;

module.exports = {
    RequestInfo: RequestInfo,
    Cache: Cache,
    parseCacheControl: parseCacheControl,
    satisfiesRequest: satisfiesRequest,
    isCacheableResponse: isCacheableResponse,
    getExpirationTimeOfResponse: getExpirationTimeOfResponse
};


//////////////////////////////////////////// Parse Cache Control Utils ////////////////////////////////////////////

function satisfiesRequest(requestInfo, response) {
    // TODO add varies header
    return requestInfo.url === response.url;
}

function isCacheableResponse(response) {
    var cacheControlHeaders = response.headers['cache-control'];
    if (cacheControlHeaders) {
        var directives = parseCacheControl(cacheControlHeaders);
        if (directives['max-age']) {
            return true;
        }
    }
    return false;
}

function getExpirationTimeOfResponse(response) {
    return new Promise(function (resolve, reject) {
        var cacheControlHeaders = response.headers['cache-control'];
        var date = response.headers.date;
        if (!date) {
            // RFC error here, maybe we should ignore the request
            date = new Date();
        } else {
            date = new Date(date);
        }
        // convert date to seconds
        var dateInSeconds = date / 1000;
        if (cacheControlHeaders) {
            var expiresAt = -1;
            var directives = parseCacheControl(cacheControlHeaders);
            if (directives['max-age']) {
                expiresAt = dateInSeconds + directives['max-age'];
            }
            if (expiresAt >= 0) {
                resolve(expiresAt);
            }
        }
        reject(new Error("Already expired or not valid expiration"));
    });
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
