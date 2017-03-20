var parseCacheControl = require('./utils.js').parseCacheControl;
//
// var REQUEST_CACHE_CONTROL_DIRECTIVES = [
//     'max-age',
//     'max-stale',
//     'min-fresh',
//     'no-cache',
//     'transform',
//     'only-if-cached'
// ];

var RequestInfo = function (method, url, headers) {
    this.method = method; // ^ is not valid in method or url
    this.url = url;
    this.headers = headers;
    this.cacheDirectives = parseCacheControl(this.headers['cache-control']);
};



module.exports = RequestInfo;