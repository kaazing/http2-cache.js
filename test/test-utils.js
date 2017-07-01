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

function unicodeStringToTypedArray(s) {
    var escstr = encodeURIComponent(s);
    var binstr = escstr.replace(/%([0-9A-F]{2})/g, function(match, p1) {
        return String.fromCharCode('0x' + p1);
    });
    var ua = new Uint8Array(binstr.length);
    Array.prototype.forEach.call(binstr, function (ch, i) {
        ua[i] = ch.charCodeAt(0);
    });
    return ua;
}

function generateRandAlphaNumStr(len) {
    var rdmString = "";
    while (rdmString.length < len) {
        rdmString += Math.random().toString(36).substr(2);
    }
    return rdmString;
}

function lengthInUtf8Bytes(str) {
  // Matches only the 10.. bytes that are non-initial characters in a multi-byte sequence.
  var m = encodeURIComponent(str).match(/%[89ABab]/g);
  return str.length + (m ? m.length : 0);
}


module.exports = {
    generateRandAlphaNumStr: generateRandAlphaNumStr,
    lengthInUtf8Bytes: lengthInUtf8Bytes,
    unicodeStringToTypedArray: unicodeStringToTypedArray,
    getWSTransportServer: getWSTransportServer
};