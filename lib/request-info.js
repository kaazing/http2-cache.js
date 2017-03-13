/*
 * TODO: https://fetch.spec.whatwg.org/#requestinfo
 */

var NOT_CACHEABLE = null + '^' + null;

var RequestInfo = function (method, url, headers) {
    if(method && url && method.toUpperCase() === 'GET'){
        this.key = method + '^' + url; // ^ is not valid in method or url
    }else{
        this.key = NOT_CACHEABLE;
    }
    this.headers = headers;
};


RequestInfo.prototype.isCacheable = function () {
    return this.key !== NOT_CACHEABLE;
};

module.exports = RequestInfo;