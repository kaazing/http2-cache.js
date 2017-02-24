var assert = require('assert');
var sinon = require('sinon');
var http2 = require('http2');
var websocket = require('websocket-stream');

describe('http2', function () {

    describe('push to multiple streams', function () {
        it('should perform http2 push over server streams when response left open', function (done) {

            var path = '/x';
            var message = 'Hello world';
            var portnum = 1239;
            var mainResponseReceived = false;
            // client
            function startClient() {
                var request = http2.raw.request({
                    plain: true,
                    host: 'localhost',
                    port: portnum,
                    path: path,
                    transport: function () {
                        return websocket('ws://localhost:' + portnum);
                    }
                }, function (response) {
                    response.on('data', function (data) {
                        mainResponseReceived = true;
                    });
                });

                var pushCnt = 0;
                request.on('push', function (pushRequest) {
                    pushRequest.on('response', function (response) {
                        response.on('data', function(data){
                            console.log("dpw data " + data);
                        });
                        response.on('finish', function () {
                            if (++pushCnt == 2 && mainResponseReceived) {
                                done();
                            }
                        });
                    });
                });
                request.end();
            }

            // server
            var server = http2.raw.createServer({
                transport: "websocket"
            }, function (request, response) {
                assert.equal(request.url, path);

                // Keep response open
                response.setHeader('Content-Type', 'text/html; charset=UTF-8');
                response.write('ping');

                // send pushed responses
                var pushResponse = response.push(
                    {
                        path: 'response1'
                    }
                );
                pushResponse.setHeader('Content-Type', 'text/html');
                pushResponse.setHeader('Content-Length', message.length);
                pushResponse.setHeader('Cache-Control', 'private, max-age=0');
                pushResponse.write(message);
                setTimeout(function () {
                    pushResponse.end();
                }, 1000);

                // send pushed responses
                var pushResponse2 = response.push(
                    {
                        path: 'response2'
                    }
                );
                pushResponse2.setHeader('Content-Type', 'text/html');
                pushResponse2.setHeader('Content-Length', message.length);
                pushResponse2.setHeader('Cache-Control', 'private, max-age=0');
                pushResponse2.write(message);
                setTimeout(function () {
                    pushResponse2.end();
                }, 1000);
            });

            server.listen(portnum, startClient);
        });

    });

});
