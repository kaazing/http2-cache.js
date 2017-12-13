
var http = require('http'),
    getSocketServer = require('./../test/test-utils.js').getSocketServer,
    getConfigServer = require('./../test/test-utils.js').getConfigServer;


var configServerOps = {
    config: {
        'transport': 'ws://localhost:7081/path',
        'worker': true,
        'proxy': [
            'http://cache-endpoint/',
            'http://localhost:7080/path/proxy',
        ]
    },
    port: 7080
};

getConfigServer(configServerOps);

var socketServerOps = {
	port: 7081
};

var message = JSON.stringify(configServerOps.config);
getSocketServer(socketServerOps, function (request, response) {
	response.setHeader('Content-Type', 'application/json');
    response.setHeader('Content-Length', message.length);
    response.setHeader('Cache-Control', 'private, max-age=0');
    response.write(message);
    response.end();
});