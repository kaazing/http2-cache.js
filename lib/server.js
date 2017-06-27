/* global console */
var Server = require('http2').Server,
    logger = require('./logger');

function Http2CacheServer(options) {

    options = Object.assign({}, options);

    this._log = (options.log || logger.defaultLogger).child({
        component: 'http'
    });
    this._settings = options.settings;

    var start = this._start.bind(this);
    var fallback = this._fallback.bind(this);

    // HTTP2 over any generic transport
    if (options.transport) {
        this._mode = 'plain';
        this._server = options.transport(options, start);
        this._server.on('close', this.emit.bind(this, 'close'));
    } else {
        Server.apply(this, arguments);
    }
}

Http2CacheServer.prototype = Object.create(Server.prototype, {
    // Overide Server here
});

function createServer(options, requestListener) {
    if (typeof options === 'function') {
        requestListener = options;
        options = {};
    }

    if (options.pfx || (options.key && options.cert)) {
        throw new Error('options.pfx, options.key, and options.cert are nonsensical!');
    }

    options.plain = true;
    var server = new Http2CacheServer(options);

    if (requestListener) {
        server.on('request', requestListener);
    }

    return server;
}

module.exports = {
    Http2CacheServer: Http2CacheServer,
    createServer: createServer
};