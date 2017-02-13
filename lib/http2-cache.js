(function () {

    // TODO consider adding montage collections to dependency (map, weak map, ie 10 and 11)

    // Save original XHR methods
    var xhrProto = XMLHttpRequest.prototype;


    // constructor
    // Object.defineProperty(xhrProto, "_constructor", {
    //     value: XMLHttpRequest.prototype.constructor,
    //     enumerable: false
    // });

    // open
    Object.defineProperty(xhrProto, "_open", {
        value: XMLHttpRequest.prototype.open,
        enumerable: false,
        configurable: true // for testing
    });

    // Misc Functions
    Object.defineProperty(XMLHttpRequest, "_addConfig", {
        value: function (config) {
            config = JSON.parse(config);
            var cntI = config.length;
            for (var i = 0; i < cntI; i++) {
                xhrProto._configs = config;
            }
        },
        enumerable: false,
        configurable: true // for testing
    });

    Object.defineProperty(XMLHttpRequest, "_addConfigByUrl", {
        value: function (url) {
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
                }
            }, true);
            xhr.send();

        },
        enumerable: false
    });

    Object.defineProperty(XMLHttpRequest, "_getConfig", {
        value: function () {
            return xhrProto._configs;
        },
        enumerable: true
    });

    // Add proxy() method
    XMLHttpRequest.proxy = function (urls) {
        if (urls instanceof Array) {
            var cntI = urls.length;
            for (var i = 0; i < cntI; i++) {
                this._addConfigByUrl(urls[i]);
            }
        } else {
            throw new Error("proxy(): Invalid arg.")
        }
    };


}).call(this);