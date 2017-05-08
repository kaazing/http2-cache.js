/* jshint ignore:start */
if (typeof exports !== 'undefined') {
    if (typeof XMLHttpRequest === 'undefined') {
        XMLHttpRequest = require("xhr2").XMLHttpRequest;
    }
} else {
    XMLHttpRequest = Window.XMLHttpRequest;
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
                    'transport': 'tcp://localhost:8080',
                    'debug': 'true'
                }
            }));
        });
        configServer.listen(8081, done);
    });

    after(function (done) {
        configServer.close(done);
    });

    // it('should.cache.push.promise', function (done) {
    //     XMLHttpRequest.proxy(["http://localhost:8081/config1"]);
    //
    //     function fetchCachedPush() {
    //         var xhr = new XMLHttpRequest();
    //         xhr.open("GET", "http://localhost:8080/");
    //         xhr.addEventListener("load", function () {
    //             console.log("DPW: here " + xhr.responseText);
    //             done();
    //         });
    //         xhr.send();
    //     }
    //
    //     var xhr = new XMLHttpRequest();
    //     xhr.addEventListener("load", function () {
    //         console.log("DPW: here " + xhr.responseText);
    //         fetchCachedPush();
    //     });
    //     xhr.open("GET", "http://localhost:8080/data");
    //     xhr.send();
    // });

    it('should.be.able.to.make.two.requests', function (done) {
        XMLHttpRequest.proxy(["http://localhost:8081/config1"]);

        function fetchSecondTime() {
            var xhr = new XMLHttpRequest();
            xhr.open("GET", "http://localhost:8080/data");
            xhr.addEventListener("load", function () {
                console.log("DPW: here " + xhr.responseText);
                done();
            });
            xhr.send();
        }

        var xhr = new XMLHttpRequest();
        xhr.addEventListener("load", function () {
            console.log("DPW: here " + xhr.responseText);
            fetchSecondTime();
        });
        xhr.open("GET", "http://localhost:8080/data");
        xhr.send();
    });

});

