
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

/**
 * @param {http.ServerRequest} req
 * @param {http.ServerResponse} res
 * @return {boolean} Whether gzip encoding takes place
 */

var defaultResponseHeaders = {};
function send(request, response, body) {
    response.writeHead(200, Object.assign({
        "Content-Type": 'text/plain; charset=utf-8'
    }, defaultResponseHeaders));
    var buf = Buffer.from(body, 'utf8');
    response.write(buf);
    response.end();
}

var zlib = require('zlib');
function sendGzip(request, response, body) {
    var acceptEncoding = request.headers['accept-encoding'];
    if (!acceptEncoding) {
        acceptEncoding = '';
    }

    // Note: this is not a conformant accept-encoding parser.
    // See http://www.w3.org/Protocols/rfc2616/rfc2616-sec14.html#sec14.3
    if (acceptEncoding.match(/\bdeflate\b/)) {
        response.writeHead(200, Object.assign({
                "Content-Type": 'text/plain; charset=utf-8',
                "content-encoding": 'deflate'
        }, defaultResponseHeaders));
        var buf = Buffer.from(zlib.createDeflateRaw(body).toString('utf8'), 'utf8');
        response.write(buf);
        response.end();
    } else if (acceptEncoding.match(/\bgzip\b/)) {
        response.writeHead(200, Object.assign({
                "Content-Type": 'text/plain; charset=utf-8',
                "content-encoding": 'gzip'
        }, defaultResponseHeaders));
        var buf = Buffer.from(zlib.createGzip(body).toString('utf8'), 'utf8');
        response.write(buf);
        response.end();
    } else {
        send(request, response, body)
    }
};

getSocketServer(socketServerOps, function (request, response) {

    if (request.url.startsWith("/charof")) {
        var charSize = parseInt(request.url.replace("/charof", ""), 10) || 8192;
        var charBody = generateRandAlphaNumStr(charSize);
        var charLength = lengthInUtf8Bytes(charBody);
        send(request, response, charBody);

    } else if (request.url.startsWith("/gzip/charof")) {
        var charSize = parseInt(request.url.replace("/charof", ""), 10) || 8192;
        var charBody = generateRandAlphaNumStr(charSize);
        var charLength = lengthInUtf8Bytes(charBody);
        //send(request, response, charBody);
        sendGzip(request, response, charBody);
    } else {

        var message = JSON.stringify(configServerOps.config);
        response.setHeader('Content-Type', 'application/json');
        response.setHeader('Content-Length', message.length);
        response.setHeader('Cache-Control', 'private, max-age=0');
        response.write(message);
        response.end();
    }
});
