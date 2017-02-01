function XMLHttpRequestProxy() {

}

XMLHttpRequestProxy.prototype.proxy = function (urls) {
    if (urls instanceof Array) {
        urls.forEach(function (url) {
            var xhr = new XMLHttpRequest();
            xhr.open('GET', url);
            xhr.onerror = function () {
                // TODO, consider recovery in case
                throw new Error("proxy(): error fetching config");
            };
            xhr.onabort = function () {
                // TODO, consider recovery in case
                throw new Error("proxy(): error fetching config, aborted");
            };
            xhr.ontimeout = function () {
                // TODO, consider recovery in case
                throw new Error("proxy(): timeout fetching config");
            };
            xhr.onload = function () {
                console.log("loaded");
            };
            xhr.send();
        });
    } else {
        throw new Error("proxy(): Invalid arg.")
    }
};

XMLHttpRequestProxy.prototype._add = function (config) {

};

module.exports = XMLHttpRequestProxy;