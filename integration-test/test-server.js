
var getSocketTestServer = require('./../test/test-utils.js').getSocketTestServer,
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

// Start test websocket+http2 server
getSocketTestServer(socketServerOps);

// Start config http
getConfigServer(configServerOps);
