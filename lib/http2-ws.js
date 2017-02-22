(function () {

    function http2() {

    }

    ////// Underlying connection handling
    Object.defineProperty(http2, "Connection", {
        value: function (config) {
            // TODO, add options: https://nodejs.org/api/http.html#http_http_get_options_callback
            var ws = new WebSocket("ws:" + config.host + ":" + config.port);
            this._ws = ws;
            var _this = this;
            this._streaming = true;


            ws.onopen = function () {
                _this.streaming = true;
            };

            ws.onmessage = function (evt) {
                if (evt.type === "arraybuffer") {
                    var data = evt.data;
                } else {
                    throw "Unsupported Type";
                }
            };

            ws.onerror = ws.onclose = function () {
                // TODO error handling
                throw "not implemented"
            };

        },
        enumerable: false,
        configurable: true
    });

    ////// http2 API
    http2.createAgent = function (config) {
        return new http2.Connection(config);
    };

    http2.get = function (options, onResponse) {
        // TODO, add options: https://nodejs.org/api/http.html#http_http_get_options_callback


    }


}).call(this);