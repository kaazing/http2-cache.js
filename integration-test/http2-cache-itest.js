if (typeof exports !== 'undefined') {
    if (typeof XMLHttpRequest === 'undefined') {
        XMLHttpRequest = require("xhr2").XMLHttpRequest;
    }
    if (typeof WebSocket === 'undefined') {
        WebSocket = require('websocket').w3cwebsocket;
    }
} else {
    XMLHttpRequest = Window.XMLHttpRequest;
    WebSocket = Window.WebSocket;
}
var sinon = require('sinon');
var chai = require('chai');
require("../lib/http2-proxy.js");

describe('http2-proxy', function () {

    it('long.pushing.with.cache.busting', function (done) {
        XMLHttpRequest.proxy(["http://localhost:8081/config1"]);
        XMLHttpRequest
    });


});

