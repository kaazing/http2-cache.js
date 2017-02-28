const redefine = require('./object-utils').redefine;

var xhrProto = XMLHttpRequest.prototype;

// constructor
// Object.defineProperty(xhrProto, "_constructor", {
//     value: XMLHttpRequest.prototype.constructor,
//     enumerable: false
// });

redefine(xhrProto, "_open", XMLHttpRequest.prototype.open);

redefine(xhrProto, 'open', function (method, url, async, username, password) {
    this.__method = method;
    this.__url = url;
    this.__async = async;
    this.__username = username;
    this.__password = password;
});

// Object.defineProperty(xhrProto, 'readyState', {
//     value: function () {
//         if(this.__isproxied){
//             return this.__readyState;
//         }else{
//             return this._readyState;
//         }
//     },
//     enumerable: true,
//     configurable: true // for testing
// });

redefine(xhrProto, "_setRequestHeader", XMLHttpRequest.prototype.open);

redefine(xhrProto, 'setRequestHeader', function () {
    throw "not implemented";
});

redefine(xhrProto, "_send", XMLHttpRequest.prototype.send);

redefine(xhrProto, 'send', function (body) {
        var parseUrl = url.parse(this.__url);
        var key = parseUrl.hostname + ':' + parseUrl.port + parseUrl.path;
        console.log(key);
        var cachedResult = cache[key];
        if (!body && this.__method === "GET" && cachedResult) {
            console.log("using cached response!!");
            redefine(this, 'readyState', 1);
            this.onreadystatechange();
            redefine(this, 'readyState', 2);
            // TODO proxy correct status
            redefine(this, 'status', 200);
            this.onreadystatechange();
            // todo headers
            redefine(this, 'readyState', 3);
            this.onreadystatechange();
            // todo listener for data
            var body = cache[key]['body'];
            redefine(this, 'response', body);
            redefine(this, 'readyState', 4);
            this.onreadystatechange();
        } else {
            this._open(this.__method,
                this.__url,
                this.__async,
                this.__username,
                this.__password);
            // TODO set headers
            this._send(body);
        }
    }
);