/* jshint ignore:start */
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
var assert = require('assert');
/* jshint ignore:end */
var http = require('http');

require("../lib/http2-cache.js");

describe('http2-proxy', function () {

    var configServer;

    before(function (done) {
        configServer = http.createServer(function (request, response) {
            response.writeHead(200, {'Content-Type': 'application/json'});
            response.end(JSON.stringify({
                'url': 'http://localhost:8080/',
                'options': {
                    'transport': 'ws://localhost:8080/'
                }
            }));
        });
        configServer.listen(8081, done);
    });

    after(function (done) {
        configServer.close(done);
    });

    it('should.support.long.pushing', function (done) {
        XMLHttpRequest.proxy(["http://localhost:8081/config1"]);

        var cnt = 0;

        var run = function () {
            var xhr = new XMLHttpRequest();
            xhr.addEventListener("load", function () {
                cnt++;
                console.log("here " + xhr.responseText);
                if (cnt === 3) {
                    clearInterval(interval);
                    done();
                }
            });
            xhr.open("GET", "http://localhost:8080/");
            xhr.send();

        };
        var interval = setInterval(run, 2000);


    });


});

