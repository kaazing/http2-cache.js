(function () {
    const url = require('url');
    const redefine = require('./object-utils').redefine;

    // TODO consider adding montage collections to dependency (map, weak map, ie 10 and 11)

    var http2 = require('http2');
    var websocket = require('websocket-stream');
    // Save original XHR methods
    var xhrProto = XMLHttpRequest.prototype;
    var cache = {};

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

    // Misc Functions
    redefine(XMLHttpRequest, "_addConfig", function (config) {
        config = JSON.parse(config);
        if (!this._openWS) {
            // lazy instantiate
            this._openWS = {};
        }
        var wsUrl = config.options.transport;

        if (!this._openWS[wsUrl]) {
            // open ws connection if not already done
            this._openWS[wsUrl] = websocket(wsUrl, "http2");
        }
        var wsTransport = this._openWS[wsUrl];

        // Note, assuming same port for now
        var wsPort = url.parse(wsUrl).port;

        var request = http2.raw.request({
            url: config.options.url,
            transport: function () {
                return wsTransport;
            }
        }, function (response) {
            response.on('finish', function () {
                // TODO, reopen stream perhaps
            });
        });

        // add to cache when receive pushRequest
        request.on('push', function (pushRequest) {

            var key = pushRequest.host + ':' + wsPort + '/' + pushRequest.url;
            console.log("dpw adding " + key + " to cache");
            cache[key] = {request: pushRequest};

            // set result of cache on response
            pushRequest.on('response', function (response) {

                cache[key]['response'] = response;

                response.on('data', function (data) {
                    console.log("got data!!");
                    // Hmm should it be toString() TODO
                    cache[key]['body'] = data.toString();
                });


                // remove from cache when stream is closed
                // TODO consider removal from cache, when stream finishes
                // response.on('finish', function () {
                //     cache[key] = {};
                // });
            });

        });
        request.end();

    });

    redefine(XMLHttpRequest, "_addConfigByUrl", function (url, callback) {
        var xhr = new XMLHttpRequest();
        xhr.open('GET', url);
        // TODO // Try with map instead of switch lookup event type
        // have to implement handle event
        xhr.addEventListener("readystatechange", function () {
            if (xhr.readyState === XMLHttpRequest.DONE) {
                var status = xhr.status;
                if (status !== 200) {
                    throw new Error("proxy(): configuration status code: " + status);
                }
                XMLHttpRequest._addConfig.call(this, xhr.response);
                callback();
            }
        }, true);
        xhr.send();

    });

    redefine(XMLHttpRequest, "_getConfig", function () {
        return xhrProto._configs;
    });

    // Add proxy() method
    XMLHttpRequest.proxy = function (urls, callback) {
        if (urls instanceof Array) {
            var cntI = urls.length;
            var completed = 0;
            for (var i = 0; i < cntI; i++) {
                this._addConfigByUrl(urls[i], function () {
                    completed++;
                    if (callback) {
                        if (cntI == completed) {
                            callback();
                        }
                    }
                });
            }
        } else {
            throw new Error("proxy(): Invalid arg.")
        }
    };


}).call(this);