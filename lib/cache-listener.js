var redefine = require('./utils').redefine;
var Promise = require("bluebird");

function CacheListener(cache) {

    redefine(cache.prototype, 'put', function (k, v) {
        var self = this;
        return new Promise(function (resolve, reject) {
            self._put(k, v).then(resolve).catch(reject);
        });
    });
}

