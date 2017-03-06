/*
 * TODO: https://fetch.spec.whatwg.org/#requestinfo
 */

var RequestInfo = function (method, url) {
    this.key = method + '^' + url; // ^ is not valid in method or url
};

var NOT_CACHEABLE = new RequestInfo(null, null);

RequestInfo.prototype.isCacheable = function () {
    return this.key !== NOT_CACHEABLE.key;
};

module.exports = RequestInfo;