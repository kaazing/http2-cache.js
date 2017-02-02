if (typeof exports !== 'undefined') {
    if(typeof XMLHttpRequest === 'undefined'){
        XMLHttpRequest = require("xhr2").XMLHttpRequest;
    }
}else{
    XMLHttpRequest = Window.XMLHttpRequest;
}

function PushCacheClient(url, options) {
    this._url = url;
    this._options = options;
}

if (typeof exports !== 'undefined') {
    module.exports = PushCacheClient;
}