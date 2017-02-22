// var transport = require('../lib/http2-ws.js');
// var assert = require('assert');
// var socket = require('../lib/WsSocket.js');
//
// // NOTE: socket is some stream or net.Socket instance, may be an argument
// // of `net.createServer`'s connection handler.
//
// describe('XMLHttpRequest (Proxy)', function () {
//
//     it('does something cool', function(){
//         // TODO instantiate socket
//         transport.connection.create(new socket("ws://localhost:8080"), {
//             protocol: 'http2',
//             windowSize: 256,
//             isServer: false
//         });
//
//         client.start(4);
//
//         client.request({
//             path: '/parent'
//         }, function (err, stream) {
//             assert(!err);
//
//             stream.on('pushPromise', function (push) {
//                 assert.equal(push.path, '/push');
//                 assert.equal(client.getCounter('push'), 1);
//                 push.on('response', function (status, headers) {
//                     assert.equal(status, 201);
//                     done()
//                 })
//             })
//         })
//     });
//     // it.skip('supports multiple promises at once', function () {
//     //     server.on('stream', function(stream) {
//     //         console.log(stream.method, stream.path, stream.headers);
//     //         stream.respond(200, {
//     //             header: 'value'
//     //         });
//     //
//     //         stream.on('readable', function() {
//     //             var chunk = stream.read();
//     //             if (!chunk)
//     //                 return;
//     //
//     //             console.log(chunk);
//     //         });
//     //
//     //         stream.on('end', function() {
//     //             console.log('end');
//     //         });
//     //
//     //         // And other node.js Stream APIs
//     //         // ...
//     //     });
//     // });
//
// });
