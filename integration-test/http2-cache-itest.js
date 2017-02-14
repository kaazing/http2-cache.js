if (typeof exports !== 'undefined') {
    if (typeof XMLHttpRequest === 'undefined') {
        XMLHttpRequest = require("xhr2").XMLHttpRequest;
    }
} else {
    XMLHttpRequest = Window.XMLHttpRequest;
}
require("../lib/http2-cache");
var assert = require('assert');
var sinon = require('sinon');
var http = require('http');

describe('XMLHttpRequest (Proxy)', function () {

    var validConfig1 = [{
        "url": "http://cache-endpoint1/",
    }];

    var validConfig2 = [{
        "url": "http://cache-endpoint2/",
        "options": {
            "transport": "ws://localhost:8080/ws2"
        }
    }];

});
