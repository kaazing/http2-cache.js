if (typeof exports !== 'undefined') {
    if (typeof XMLHttpRequest === 'undefined') {
        XMLHttpRequest = require("xhr2").XMLHttpRequest;
    }
    HttpCache = require("../lib/HttpCache");
} else {
    XMLHttpRequest = Window.XMLHttpRequest;
}

function XMLHttpRequestProxy() {
    this._cache = HttpCache();
}

XMLHttpRequestProxy.prototype.proxy = function (urls) {

    function getConfig(url) {
        var xhr = new XMLHttpRequest();
        xhr.open('GET', url);
        xhr.onreadystatechange = function () {
            if (xhr.readyState === XMLHttpRequest.DONE) {
                var status = xhr.status;
                if (status !== 200) {
                    throw new Error("proxy(): configuration status code: " + status);
                }
                var responseType = xhr.responseType;
                if (responseType !== "json") {
                    throw new Error("proxy(): configuration returned " + responseType);
                }
                XMLHttpRequestProxy.prototype._add.call(this, xhr.response);
            }
        };
        xhr.send();
    }

    if (urls instanceof Array) {
        for (var i = 0; i < urls.length; i++) {
            getConfig(urls[i]);
        }
    } else {
        throw new Error("proxy(): Invalid arg.")
    }
};

XMLHttpRequestProxy.prototype._add = function (config) {
    for (var i = 0; i < config.length; i++) {
    }
};

if (typeof exports !== 'undefined') {
    module.exports = XMLHttpRequestProxy;
}


