if (typeof exports !== 'undefined') {
    if (typeof XMLHttpRequest === 'undefined') {
        XMLHttpRequest = require("xhr2").XMLHttpRequest;
    }
} else {
    XMLHttpRequest = Window.XMLHttpRequest;
}

if (typeof PushCacheClient === 'undefined') {
    PushCacheClient = require("../lib/PushCacheClient");
}

function XMLHttpRequestProxy() {

}

XMLHttpRequestProxy.prototype.proxy = function (urls) {
    if (urls instanceof Array) {
        for (var i = 0; i < urls.length; i++) {
            var url = urls[i];
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
    } else {
        throw new Error("proxy(): Invalid arg.")
    }
};

XMLHttpRequestProxy.prototype._add = function (config) {
    console.log("f");
    for (var i = 0; i < config.length; i++) {
        new PushCacheClient(config[i].url, config[i].options);
    }
};

if (typeof exports !== 'undefined') {
    module.exports = XMLHttpRequestProxy;
}


