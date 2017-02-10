var transport = require('spdy-transport');

// NOTE: socket is some stream or net.Socket instance, may be an argument
// of `net.createServer`'s connection handler.

var server = transport.connection.create(socket, {
    protocol: 'http2',
    isServer: true
});


describe('XMLHttpRequest (Proxy)', function () {


    it.skip('supports multiple promises at once', function () {
        server.on('stream', function(stream) {
            console.log(stream.method, stream.path, stream.headers);
            stream.respond(200, {
                header: 'value'
            });

            stream.on('readable', function() {
                var chunk = stream.read();
                if (!chunk)
                    return;

                console.log(chunk);
            });

            stream.on('end', function() {
                console.log('end');
            });

            // And other node.js Stream APIs
            // ...
        });
    });

});
