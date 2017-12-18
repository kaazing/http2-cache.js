
var http = require('http'),
    generateRandAlphaNumStr = require('./../test/test-utils.js').generateRandAlphaNumStr,
    lengthInUtf8Bytes = require('./../test/test-utils.js').lengthInUtf8Bytes,
    getSocketServer = require('./../test/test-utils.js').getSocketServer,
    getConfigServer = require('./../test/test-utils.js').getConfigServer;


var socketServerOps = {
    //hostname: '192.168.6.143',
    hostname: 'localhost',
    port: 7081
};

var configServerOps = {
    config: {
        'transport': 'ws://' + socketServerOps.hostname + ':' + socketServerOps.port + '/path',
        'proxy': [
            'http://cache-endpoint/'
        ]
    },
    port: 7080      
};

getConfigServer(configServerOps);


getSocketServer(socketServerOps, function (request, response) {

    if (request.url.startsWith("/charof")) {
        var charSize = parseInt(request.url.replace("/charof", ""), 10) || 8192;
        var charBody = generateRandAlphaNumStr(charSize);
        var charLength = lengthInUtf8Bytes(charBody);
        response.writeHead(200, {
            "Content-Type": 'text/plain; charset=utf-8'
        });
        var buf = Buffer.from(charBody, 'utf8');
        response.write(buf);
        response.end();
    } else {

        var message = JSON.stringify(configServerOps.config);
        response.setHeader('Content-Type', 'application/json');
        response.setHeader('Content-Length', message.length);
        response.setHeader('Cache-Control', 'private, max-age=0');
        response.write(message);
        response.end();
    }
});
