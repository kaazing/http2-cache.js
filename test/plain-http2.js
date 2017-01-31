//
// var assert = require('assert'),
//     http2 = require('spdy'),
//     https = require('https'),
//     fs = require('fs');
//
// var options = {
//     // Private key
//     key: fs.readFileSync(__dirname + '/keys/server.key'),
//
//     // Fullchain file or cert file (prefer the former)
//     cert: fs.readFileSync(__dirname + '/keys/server.crt'),
//
//
//     spdy: {
//         protocols: ['h2'],
//         plain: false,
//
//         // **optional**
//         // Parse first incoming X_FORWARDED_FOR frame and put it to the
//         // headers of every request.
//         // NOTE: Use with care! This should not be used without some proxy that
//         // will *always* send X_FORWARDED_FOR
//         'x-forwarded-for': true,
//
//         connection: {
//             windowSize: 1024 * 1024, // Server's window size
//
//             // **optional** if true - server will send 3.1 frames on 3.0 *plain* spdy
//             autoSpdy31: false
//         }
//     }
// };
// process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
// describe('http2', function () {
//     describe('push', function () {
//
//         it('should work between client and server', function (done) {
//             var pushResponse = http2.createServer(options, function (req, res) {
//                     var stream = res.push('/main.js', {
//                         status: 200, // optional
//                         method: 'GET', // optional
//                         request: {
//                             accept: '*/*'
//                         },
//                         response: {
//                             'content-type': 'application/javascript',
//                             'push-header': 'push-header-value'
//                         }
//                     });
//                     stream.on('error', function () {
//                         console.log("there is a error??");
//                     });
//                     stream.end('alert("hello from push stream!");');
//
//                     res.setHeader("dpw-response-header2", 'value2');
//                     res.end('<script src="/main.js"></script>');
//                     console.log("there should be a push in flight");
//                 }).listen(3000);
//
//             var agent = http2.createAgent({
//                 host: 'localhost',
//                 port: 3000
//             });
//
//             var clientReq = https.get({
//                 host: 'localhost',
//                 agent: agent
//             }, function (response) {
//                 console.log("there is a response!!");
//                 // console.log(response);
//                 // Here it goes like with any other node.js HTTP request
//                 // ...
//                 // And once we're done - we may close TCP connection to server
//                 // NOTE: All non-closed requests will die!
//                 // agent.close();
//             });
//
//             var clientReq2 = https.get({
//                 host: 'localhost',
//                 agent: agent
//             }, function (response) {
//                 // console.log("there is a response ================================= !!");
//                 //console.log(" dpw " + response.headers.toString());
//                 // console.log(response);
//                 // console.log(" ================================= !!");
//                 // Here it goes like with any other node.js HTTP request
//                 // ...
//                 // And once we're done - we may close TCP connection to server
//                 // NOTE: All non-closed requests will die!
//                 // agent.close();
//             });
//             var cnt = 1;
//
//             clientReq.on('push', function (stream) {
//                 console.log("there is a push??");
//                 stream.on('error', function (err) {
//                     // Handle error
//                 });
//                 cnt++;
//                 if (cnt == 2) {
//                     done();
//                     pushResponse.close();
//                 }
//             });
//             clientReq2.on('push', function (stream) {
//                 console.log("there is a push??");
//                 console.log(
//                     "DPW - PUSH REQUEST \n"
//                     + stream.method + "\n"
//                     + stream.headers + "\n"
//                 );
//                 stream.on('error', function (err) {
//                     // Handle error
//                 });
//                 stream.on('response', function (status, headers) {
//                     console.log("PEACH GOT HEADERS!!!!");
//                     console.log("PEACH: " + headers["push-header"]);
//                 });
//                 stream.on('headers', function (status, headers) {
//                     console.log("PEACH GOT HEADERS!!!!");
//                     console.log("PEACH2: " + headers);
//                 });
//                 stream.on('data', function (chunk) {
//                     console.log('got %d bytes of data' + chunk, chunk.length);
//                     console.log(
//                         "DPW - PUSH RESPONSE \n"
//                         + stream.method + "\n"
//                         + stream.headers + "\n"
//                     );
//                 });
//                 cnt++;
//                 if (cnt == 2) {
//                     done();
//                 }
//             });
//         });
//     });
// });
