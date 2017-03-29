var http = require('http'),
    websocket = require('websocket-stream');

function getWSTransportServer() {
    return {
        transport: function (options, start) {
            var lastSocketKey = 0;
            var socketMap = {};
            var httpServer = http.createServer();
            options.server = httpServer;

            var res = websocket.createServer(options, start);
            res.listen = function (options, cb) {
                var listener = httpServer.listen(options, cb);
                listener.on('connection', function (socket) {
                    /* generate a new, unique socket-key */
                    var socketKey = ++lastSocketKey;
                    /* add socket when it is connected */
                    socketMap[socketKey] = socket;
                    socket.on('close', function () {
                        /* remove socket when it is closed */
                        delete socketMap[socketKey];
                    });
                });
            };

            res.close = function (cb) {
                Object.keys(socketMap).forEach(function (socketKey) {
                    socketMap[socketKey].destroy();
                });
                httpServer.close(cb);
            };
            return res;
        }
    };
}

module.exports = {
    getWSTransportServer: getWSTransportServer
};