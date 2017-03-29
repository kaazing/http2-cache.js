var Promise = require("bluebird"),
    EventEmitter = require('events').EventEmitter,
    util = require('util'),
    redefine = require('./utils').redefine;

function CacheListener(configuration) {
    var cl = this;
    redefine(configuration.cache, 'put', function (k, v) {
        var self = this;
        return new Promise(function (resolve, reject) {
            self._put(k, v).then(function () {
                if (configuration.debug) {
                    console.log("Cached response: " + k.href);
                }
                cl.emit('cached', k.href);
                resolve();
            }).catch(reject);
        });
    });

    redefine(configuration.cache, 'match', function (k) {
        var self = this;
        return new Promise(function (resolve, reject) {
            self._match(k).then(function (response) {
                if (configuration.debug) {
                    if(response){
                        console.log("Using cached response for request to: " + k.href);
                    }else{
                        console.log("Cache miss for request: " + k.href);
                    }

                }
                resolve(response);
            }).catch(reject);
        });
    });

    EventEmitter.call(this);
}

util.inherits(CacheListener, EventEmitter);


module.exports = {
    CacheListener: CacheListener
};