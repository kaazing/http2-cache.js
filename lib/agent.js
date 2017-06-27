/* global console */
var OutgoingRequest = require('http2').OutgoingRequest;
var Agent = require('http2').Agent;
var Endpoint = require('http2').protocol.Endpoint;
var url = require('url');

function Http2CacheAgent() {
    Agent.apply(this, arguments);
}

Http2CacheAgent.prototype = Object.create(Agent.prototype, {
    // Overide Server here
    request: {
        value: function request(options, callback) {

            if (typeof options === 'string') {
                options = url.parse(options);
            } else {
                options = Object.assign({}, options);
            }

            options.method = (options.method || 'GET').toUpperCase();
            options.protocol = options.protocol || 'https:';
            options.host = options.hostname || options.host || 'localhost';
            options.port = options.port || 443;
            options.path = options.path || '/';

            if (!options.plain && options.protocol === 'http:') {
                this._log.error('Trying to negotiate client request with Upgrade from HTTP/1.1');
                this.emit('error', new Error('HTTP1.1 -> HTTP2 upgrade is not yet supported.'));
            }

            var request = new OutgoingRequest(this._log);

            if (callback) {
                request.on('response', callback);
            }

            // Re-use transportUrl endPoint if specified
            var key = ([
                options.transportUrl
            ]).join(':');

            // * There's an existing HTTP/2 connection to this host
            var endpoint;
            if (key in this.endpoints && this.endpoints[key]) {
                endpoint = this.endpoints[key];
                request._start(endpoint.createStream(), options);
            }

            // * HTTP/2 over generic stream transport
            else if (options.transport) {
                endpoint = new Endpoint(this._log, 'CLIENT', this._settings);
                endpoint.socket = options.transport;

                var self = this;

                endpoint.socket.on('error', function(error) {
                    self._log.error('Socket error: ' + error.toString());
                    request.emit('error', error);
                });

                endpoint.on('error', function(error) {
                    self._log.error('Connection error: ' + error.toString());
                    request.emit('error', error);
                });

                endpoint.socket.on('close', function(error) {
                    // DPW This is sort of a hack to protect against
                    // the reuse of a endpoint that has the underlying
                    // connection closed.  It would probably be better
                    // to implement this near lin 933 (if (key in this.endpoints))
                    // by checking the endpoint state (requires new API to expose)

                    // Alternatively, this could be a bug with my WS connection
                    // not emitting an error when it is unexpectedly closed ??
                    delete self.endpoints[key];
                });

                this.endpoints[key] = endpoint;
                endpoint.pipe(endpoint.socket).pipe(endpoint);
                request._start(endpoint.createStream(), options);

            // Fallback
            } else {
                request = Agent.prototype.request.apply(this, arguments);
            }

            return request;
        }
    }
});

exports.Agent = Http2CacheAgent;