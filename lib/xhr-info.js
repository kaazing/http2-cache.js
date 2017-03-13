/**
 * Weak hashmap from instance to properties, so internal properties aren't exposed
 */
var WeakMap = require("collections/weak-map");

var XhrInfo = function () {
    this.storage = new WeakMap();
};

XhrInfo.prototype.get = function (k, p, d) {
    if (!this.storage.has(k)) {
        return null;
    } else {
        return this.storage.get(k, d)[p];
    }
};

XhrInfo.prototype.put = function (k, p, v) {
    if (!this.storage.has(k)) {
        // lazy init
        this.storage.set(k, {});
    }
    return this.storage.get(k)[p] = v;
};

XhrInfo.prototype.clean = function (k) {
    this.storage.delete(k);
};

module.exports = XhrInfo;