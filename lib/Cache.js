var Promise = require("bluebird");
var Map = require("collections/map");

var Cache = function () {
    this.nameToCacheMap = new Map();
};

var cp = Cache.prototype;

cp.match = function (request) {
    if (options) {
        throw new Error("options are not implemented");
    }
};

cp.put = function (request, response) {
};

cp.delete = function (request) {

};

module.exports = Cache;