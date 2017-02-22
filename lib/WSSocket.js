(function () {

    // TODO fix this if statement
    // var W3CWebSocket = (window && window.WebSocket) ? window.WebSocket : require('websocket').w3cwebsocket;
    var W3CWebSocket = require('websocket').w3cwebsocket;

    function WSSocket() {
        this.listeners = {};
        this.listeners.data = [];
        this.listeners.close = [];
        this.readableStream = [];
    }

    var WSSproto = WSSocket.prototype;

    WSSproto.on = function (evt, fun) {
        if (evt === "data") {
            this.listeners.data.push(fun);
        }
        else {
            throw "Not implemented yet";
        }
        // open
        // error
        // closed
        // message
    };

    Object.defineProperty(WSSproto, '_ondata', {
            value: function (data) {
                var cntI = this.listeners.data.length;
                for (var i = 0; i < cntI; i++) {
                    // TODO consider catching errors and calling all listeners
                    this.listeners.data[i](data);
                }
            },
            enumerable: false
        }
    );

    Object.defineProperty(WSSproto, '_onclose', {
            value: function () {
                var cntI = this.listeners.close.length;
                for (var i = 0; i < cntI; i++) {
                    // TODO consider catching errors and calling all listeners
                    this.listeners.close[i]();
                }
            },
            enumerable: false
        }
    );

    WSSproto.connect = function (requestUrl, requestedProtocols, origin, headers, requestOptions) {
        this.ws = new WebSocket(requestUrl, requestedProtocols);
        this.ws.onopen = function () {

        };
        this.ws.onmessage = function (evt) {
            this._ondata(evt);
        };
        this.ws.onclose = function () {
            this._onclose();
        };
    };

    WSSproto.abort = function () {
        throw "not implemented yet";
        // TODO
    };

    WSSproto.pipe = function (to) {
        to.on('data', to);
    };

    module.exports = WSSocket;


}).call(this);