function XMLHttpRequestProxy() {
    var xhr = new XMLHttpRequest();
    xhr.onreadystatechange = function () {
        if (xhr.readyState == 4) {
            done();
        }
    };
    xhr.open('GET', 'http://example.com', true);
    xhr.send(null);

}

XMLHttpRequestProxy.prototype.proxy = function (urls) {
    if (urls instanceof Array) {

    } else {
        throw new Error("proxy(): Invalid arg.")
    }
};

module.exports = XMLHttpRequestProxy;