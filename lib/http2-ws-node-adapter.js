(function () {

    var transport = exports;

    // TODO figure out how to do with abbreviated path
    transport.utils = require('../node_modules/spdy-transport/lib/spdy-transport/protocol/http2/index');

    transport.utils = require('../node_modules/spdy-transport/lib/spdy-transport/utils');

    transport.protocol = {};
    transport.protocol.base = require('../node_modules/spdy-transport/lib/spdy-transport/protocol/base');

    transport.protocol.http2 = require('../node_modules/spdy-transport/lib/spdy-transport/protocol/http2');

    // Window
    transport.Window = require('../node_modules/spdy-transport/lib/spdy-transport/window');

    // Priority Tree
    transport.Priority = require('../node_modules/spdy-transport/lib/spdy-transport/priority');

    // Export Connection and Stream
    transport.Stream = require('../node_modules/spdy-transport/lib/spdy-transport/stream').Stream;
    transport.Connection = require('../node_modules/spdy-transport/lib/spdy-transport/connection').Connection;

    transport.connection = transport.Connection
}).call(this);