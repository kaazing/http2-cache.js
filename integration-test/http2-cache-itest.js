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
require("../lib/http2-proxy");

describe('http2-proxy', function () {

    it('should.load.config.and.start.push.stream', function (done) {
        XMLHttpRequest.proxy(["http://localhost:7080/config1"]);
    });

    // it('should load config 2 and start stream for pushs when h2PushPath is set in config', function (done) {
    //     XMLHttpRequest.proxy(["http://localhost:7080/config1"]);
    // });
    //
    // it('should proxy GET request', function (done) {
    //     var message = "Hello, Dave. You're looking well today.";
    //     XMLHttpRequest.proxy(["http://localhost:7080/config2"]);
    //     var xhr = new XMLHttpRequest();
    //
    //     var statechanges = 0;
    //     xhr.onreadystatechange = function () {
    //         assert.equal(++statechanges, xhr.readyState);
    //         if (xhr.readyState >= 2) {
    //             assert.equal(xhr.status, 200);
    //             assert.equal(xhr.statusText, "OK");
    //         }
    //         // TODO assert message
    //         if (xhr.readyState >= 3) {
    //             assert.equal(xhr.response, message);
    //         }
    //         if (xhr.readyState === 4 && xhr.status === 200) {
    //             done();
    //         }
    //     };
    //     xhr.open('GET', 'https://cache-endpoint2/path', true);
    //
    //     xhr.send(null);
    //
    // });
    //
    // it('should proxy GET request with event listeners', function (done) {
    //     var message = "Hello, Dave. You're looking well today.";
    //     XMLHttpRequest.proxy(["http://localhost:7080/config2"]);
    //     var xhr = new XMLHttpRequest();
    //
    //     xhr.onloadstart = function () {
    //         xhr.onprogress = function () {
    //             xhr.onload = function () {
    //                 assert.equal(xhr.status, 200);
    //                 assert.equal(xhr.statusText, "OK");
    //                 xhr.onloadend = function () {
    //                     assert.equal(xhr.response, message);
    //                     done();
    //                 };
    //             };
    //         };
    //     };
    //
    //     xhr.open('GET', 'https://cache-endpoint2/withListeners', true);
    //
    //     xhr.send(null);
    //
    // });
    //
    //
    // it('should not proxy different origin GET requests', function (done) {
    //     XMLHttpRequest.proxy(["http://localhost:7080/config2"]);
    //     var xhr = new XMLHttpRequest();
    //     var xhr2 = new XMLHttpRequest();
    //
    //     var doneCnt = 0;
    //     function doneN(n) {
    //         if (++doneCnt === n) {
    //             done();
    //         }
    //     }
    //
    //     var statechanges = 0;
    //     xhr.onreadystatechange = function () {
    //         assert.equal(xhr.readyState, ++statechanges);
    //         if (xhr.readyState >= 2) {
    //             assert.equal(200, xhr.status);
    //             assert.equal("OK", xhr.statusText);
    //         }
    //         if (xhr.readyState === 4 && xhr.status === 200) {
    //             doneN(3);
    //         }
    //     };
    //
    //     xhr.onloadstart = function () {
    //         xhr.onprogress = function () {
    //             xhr.onload = function () {
    //                 xhr.onloadend = function () {
    //                     doneN(3);
    //                 };
    //             };
    //         };
    //     };
    //
    //     var statechanges2 = 0;
    //     xhr2.onreadystatechange = function () {
    //         assert.equal(xhr2.readyState, ++statechanges2);
    //         if (xhr2.readyState >= 2) {
    //             assert.equal(xhr2.status, 200);
    //             assert.equal(xhr2.statusText, "OK");
    //         }
    //         if (xhr2.readyState === 4 && xhr2.status === 200) {
    //             xhr2.addEventListener('load', function () {
    //                 doneN(3);
    //             });
    //         }
    //     };
    //
    //     xhr.open('GET', 'http://localhost:7080/config2', true);
    //     xhr.send(null);
    //     xhr2.open('GET', 'http://localhost:7080/config1', true);
    //     xhr2.send(null);
    // });
    //
    // it('should use pushed results in cache', function (done) {
    //     var message = "Affirmative, Dave. I read you. ";
    //     var xhr = new XMLHttpRequest();
    //     s1OnRequest = function (request, response) {
    //         assert.equal(request.url, 'stream', 'should be on streaming url');
    //         var pr = response.push({
    //             'path': '/pushedCache1'
    //         });
    //         pr.setHeader('Content-Type', 'text/html');
    //         pr.setHeader('Content-Length', message.length);
    //         pr.setHeader('Cache-Control', 'private, max-age=5');
    //         pr.write(message);
    //         pr.end();
    //         var statechanges = 0;
    //         xhr.onreadystatechange = function () {
    //             assert.equal(xhr.readyState, ++statechanges);
    //             if (xhr.readyState >= 2) {
    //                 assert.equal(xhr.status, 200);
    //                 assert.equal(xhr.statusText, "OK");
    //             }
    //
    //             if (xhr.readyState >= 3) {
    //                 assert.equal(xhr.response, message);
    //             }
    //
    //             if (xhr.readyState === 4 && xhr.status === 200) {
    //                 done();
    //             }
    //         };
    //         xhr.open('GET', 'http://cache-endpoint1/pushedCache1', true);
    //         // There is a race between xhr.js and push with out subscribe
    //         xhr.subscribe(function () {
    //             xhr.unsubscribe();
    //             xhr.send(null);
    //         });
    //     };
    //     XMLHttpRequest.proxy(["http://localhost:7080/config1"]);
    // });
    //
    // it('should cache GET request and reusue', function (done) {
    //     var message = "Hello, Dave. You're looking well today.";
    //     var requestCount = 0;
    //     s2OnRequest = function (request, response) {
    //         if (++requestCount === 1) {
    //             // TODO check request headers and requests responses
    //             assert.equal(request.url, '/cachedGetRequest');
    //             response.setHeader('Content-Type', 'text/html');
    //             response.setHeader('Content-Length', message.length);
    //             response.setHeader('Cache-Control', 'private, max-age=5');
    //             response.write(message);
    //             response.end();
    //         } else {
    //             throw new Error("Should only get 1 request");
    //         }
    //     };
    //     XMLHttpRequest.proxy(["http://localhost:7080/config2"]);
    //     var firstRequest = new XMLHttpRequest();
    //
    //     var statechanges = 0;
    //     firstRequest.onreadystatechange = function () {
    //         assert.equal(++statechanges, firstRequest.readyState);
    //         if (firstRequest.readyState >= 2) {
    //             assert.equal(firstRequest.status, 200);
    //             assert.equal(firstRequest.statusText, "OK");
    //         }
    //         if (firstRequest.readyState >= 3) {
    //             assert.equal(firstRequest.response, message);
    //         }
    //         if (firstRequest.readyState === 4 && firstRequest.status === 200) {
    //             var secondRequest = new XMLHttpRequest();
    //
    //             var statechanges2 = 0;
    //             secondRequest.onreadystatechange = function () {
    //                 assert.equal(++statechanges2, secondRequest.readyState);
    //                 if (secondRequest.readyState >= 2) {
    //                     assert.equal(secondRequest.status, 200);
    //                     assert.equal(secondRequest.statusText, "OK");
    //                 }
    //                 if (secondRequest.readyState >= 3) {
    //                     assert.equal(secondRequest.response, message);
    //                 }
    //                 if (secondRequest.readyState === 4 && secondRequest.status === 200) {
    //                     done();
    //                 }
    //             };
    //             secondRequest.open('GET', 'https://cache-endpoint2/cachedGetRequest', true);
    //             secondRequest.send(null);
    //         }
    //     };
    //     firstRequest.open('GET', 'https://cache-endpoint2/cachedGetRequest', true);
    //
    //     firstRequest.send(null);
    //
    // });

});

