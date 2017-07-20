var http2 = require('http2'),
    redefine = require('./utils').redefine,
    definePrivate = require('./utils').definePrivate,
    dataToType = require('./utils').dataToType,
    defaultPort = require('./utils').defaultPort,
    RequestInfo = require('./cache.js').RequestInfo,
    parseUrl = require('./utils').parseUrl,
    serializeXhrBody = require('./utils').serializeXhrBody,
    getOrigin = require('./utils').getOrigin,
    InvalidStateError = require('./errors.js').InvalidStateError,
    XhrInfo = require('./xhr-info.js'),
    Map = require("collections/map");

var HTTP2_FORBIDDEN_HEADERS = ['accept-charset',
    'accept-encoding',
    'access-control-request-headers',
    'access-control-request-method',
    'connection',
    'content-length',
    'cookie',
    'cookie2',
    'date',
    'dnt',
    'expect',
    'host',
    'keep-alive',
    'origin',
    'referer',
    'te',
    'trailer',
    'transfer-encoding',
    'upgrade',
    'via'];

var HTTP_METHODS = [
    'GET',
    'OPTIONS',
    'HEAD',
    'POST',
    'PUT',
    'DELETE',
    'TRACE',
    'CONNECT'
];

// ProgressEvent
function ProgressEvent(type) {
    this.type = type;
    this.target = null;
}

ProgressEvent.prototype.bubbles = false;

ProgressEvent.prototype.cancelable = false;

ProgressEvent.prototype.target = null;

function enableXHROverH2(XMLHttpRequest, configuration) {

    var xhrProto = XMLHttpRequest.prototype;
    var xhrInfo = new XhrInfo();

    Object.defineProperty(XMLHttpRequest, 'proxy', {
        enumerable: true,
        configurable: false,
        value: function (configs) {
            return configuration.configure(configs);
        }
    });

    Object.defineProperty(XMLHttpRequest, 'configuration', {
        enumerable: true,
        configurable: false,
        get: function () {
            return configuration;
        }
    });

    redefine(xhrProto, 'open', function (method, url, async, username, password) {
        // https://xhr.spec.whatwg.org/#the-open%28%29-method
        method = method.toUpperCase();
        if (HTTP_METHODS.indexOf(method.toUpperCase()) < 0) {
            throw new SyntaxError("Invalid method: " + method);
        }
        // parse so we know it is valid
        var parseurl = parseUrl(url);

        if (async === undefined) {
            async = true;
        } else if (async === false) {
            throw new SyntaxError("Synchronous is not supported");
        }

        xhrInfo.put(this, 'method', method);
        xhrInfo.put(this, 'url', url);
        xhrInfo.put(this, 'async', async);
        xhrInfo.put(this, 'headers', new Map());
        if (parseurl.host && username && password) {
            xhrInfo.put(this, 'username', username);
            xhrInfo.put(this, 'password', password);
        }

        var self = this;

        /*
         * We need to fire opened event here but native library might
         * recall open, so we do this
         */
        if (self.onreadystatechange) {
            var orscDelegate = self.onreadystatechange;
            self.onreadystatechange = function () {
                if (xhrInfo.get(this, 'lastreadystate') !== 1 || self.readyState !== 1) {
                    xhrInfo.put(this, 'lastreadystate', self.readyState);
                    orscDelegate();
                }
            };
        }

        this._changeState(XMLHttpRequest.OPENED);
    });

    redefine(xhrProto, 'setRequestHeader', function (name, value) {
        if (this.readyState > 2) {
            throw new InvalidStateError("Can not setRequestHeader on unopened XHR");
        }
        var lcname = name.toLowerCase();
        if (HTTP2_FORBIDDEN_HEADERS.indexOf(lcname) > 0 || (lcname.lastIndexOf('sec-', 0) === 0 && lcname.replace('sec-', '').indexOf(lcname) > 0) || (lcname.lastIndexOf('proxy-', 0) === 0 && lcname.replace('proxy-', '').indexOf(lcname) > 0)) {
            throw new SyntaxError("Forbidden Header: " + name);
        }
        // Each header field consists of a name followed by a colon (":") and the field value. Field names are
        // case-insensitive.
        // We standardize to lowercase for ease
        xhrInfo.get(this, 'headers').set(lcname, value);
    });

    definePrivate(xhrProto, '_changeState', function (s, options) {

        switch (s) {
            case XMLHttpRequest.UNSENT:
                break;
            case XMLHttpRequest.OPENED:
                break;
            case XMLHttpRequest.HEADERS_RECEIVED:
                var statusCode = options.response.statusCode;
                redefine(this, 'status', statusCode);
                var statusMessage = http2.STATUS_CODES[statusCode];
                if (statusMessage) {
                    this.statusText = statusMessage;
                } else {
                    configuration._log.warn('Unknown STATUS CODE: ' + statusCode);
                }
                break;
            case XMLHttpRequest.LOADING:
                var self = this;
                // assert options.response && options.data TODO
                this.response = (function () {
                    return dataToType(options.response.data, self.responseType);
                }());

                redefine(self, 'responseText', dataToType(options.response.data, self.responseType));
                this.__dispatchEvent(new ProgressEvent('progress'));
                break;
            case XMLHttpRequest.DONE:
                redefine(this, 'getResponseHeader', function(header){
                    return options.response.headers[header.toLowerCase()];
                });
                redefine(this, 'getAllResponseHeaders', function(){
                    return options.response.headers;
                });
                this.__dispatchEvent(new ProgressEvent('load'));
                this.__dispatchEvent(new ProgressEvent('loadend'));
                break;
            default:
                throw new InvalidStateError("Unexpected XHR _changeState: " + s);
        }
        switch (s) {
            case XMLHttpRequest.UNSENT:
            case XMLHttpRequest.OPENED:
                break;
            default:
                // BUG: we don't fire open (1) correctly
                // No way to override and then get back
                // i.e. xhr.open() then xhr.send(url)
                // @ send we proxy or not
                redefine(this, 'readyState', s);
        }

        this.__dispatchEvent(new ProgressEvent('readystatechange'));
    });

    definePrivate(xhrProto, '_sendViaHttp2', function (destination, body, proxyTransportUrl) {
        var self = this;
        var requestInfo = new RequestInfo(xhrInfo.get(self, 'method'), getOrigin(destination.href) + destination.path, xhrInfo.get(self, 'headers'));
        // TODO change getCache to readonly property
        configuration.cache.match(requestInfo).bind(self).then(
            function (response) {
                if (response) {
                    if (configuration.debug) {
                        configuration._log.debug("Using cache result for XHR(" + destination.href + ")");
                    }
                    this.__dispatchEvent(new ProgressEvent('loadstart'));
                    this._changeState(XMLHttpRequest.HEADERS_RECEIVED, {'response': response});
                    this._changeState(XMLHttpRequest.LOADING, {'response': response});
                    this._changeState(XMLHttpRequest.DONE, {'response': response});
                } else {
                    // Need to make the request your self
                    if (body) {

                        // https://xhr.spec.whatwg.org/#the-send%28%29-method
                        if (
                            typeof HTMLElement !== 'undefined' &&
                                body instanceof HTMLElement
                        ) {
                            if (!xhrInfo.get(self, 'headers').has('content-encoding')) {
                                xhrInfo.get(self, 'headers').set('content-encoding', 'UTF-8');
                            }
                            if (!xhrInfo.get(self, 'headers').has('content-type')) {
                                xhrInfo.get(self, 'headers').set('content-type', 'text/html; charset=utf-8');
                            }
                        } else {
                            // Set default encoding
                            // TODO use document encoding
                            if (!xhrInfo.get(self, 'headers').has('content-encoding')) {
                                xhrInfo.get(self, 'headers').set('content-encoding', 'UTF-8');
                            }
                        }

                        // only other option in spec is a String
                        // inject content-length TODO remove this as should not be required
                        xhrInfo.get(self, 'headers').set('content-length', body.toString().length);
                    }
                    var transport = configuration.getTransport(proxyTransportUrl);
                    var request = http2.raw.request({
                        agent: configuration.agent,
                        // protocol has already been matched by getting transport url
                        // protocol: destination.protocol,
                        hostname: destination.hostname,
                        port: destination.port,
                        method: xhrInfo.get(self, 'method'),
                        path: destination.path,
                        headers: xhrInfo.get(self, 'headers').toObject(),
                        // auth: self.__headers // TODO AUTH
                        // TODO, change transport to createConnection
                        transport: transport,
                        transportUrl: proxyTransportUrl
                        // TODO timeout if syncronization set
                        // timeout: self.__timeout
                    }, function (response) {
                        self._changeState(XMLHttpRequest.HEADERS_RECEIVED, {'response': response});
                        response.on('data', function (data) {
                            if (response.data) {
                                response.data += data;
                            } else {
                                response.data = data;
                            }
                            self._changeState(XMLHttpRequest.LOADING, {'response': response});
                        });
                        response.on('finish', function () {
                            if (configuration.debug) {
                                configuration._log.debug("Got response for proxied XHR(" + destination.href + ")");
                            }

                            configuration.cache.put(requestInfo, response)
                                .catch(function () {
                                    // NOOP
                                })
                                .finally(function () {
                                    self._changeState(XMLHttpRequest.DONE, {'response': response});
                                });
                        });
                    });

                    request.on('error', function (/*e*/) {
                        // TODO, handle error
                        // self._changeState('error');
                    });

                    // add to cache when receive pushRequest
                    request.on('push', function(respo){
                        configuration.onPush(respo);
                    });
                    // response.on('push', configuration.onPush);

                    if (body) {
                        request.end(body);
                    } else {
                        request.end();
                    }
                    self.__dispatchEvent(new ProgressEvent('loadstart'));
                }
            }
        );
    });

    redefine(xhrProto, 'send', function (body) {
        var url = xhrInfo.get(this, 'url');
        var self = this;

        // Also fix support for node-http2 FormData
        body = serializeXhrBody(body);

        if (configuration.isConfiguring()) {
            if (configuration.debug) {
                configuration._log.debug("Delaying XHR(" + url + ") until configuration completes");
            }
            configuration.once('completed', function () {
                self.send(body);
            });
        } else {

            var destination = parseUrl(url);
            var proxyTransportUrl = configuration.getTransportUrl(destination);
            if (proxyTransportUrl) {
                if (configuration.debug) {
                    configuration._log.debug("Proxying XHR(" + url + ") via " + proxyTransportUrl);
                }
                this._sendViaHttp2(destination, body, proxyTransportUrl);
            } else {
                if (configuration.debug) {
                    configuration._log.debug("Sending XHR(" + url + ") via native stack");
                }
                this._open(xhrInfo.get(this, 'method'),
                    url,
                    xhrInfo.get(this, 'async'),
                    xhrInfo.get(this, 'username'),
                    xhrInfo.get(this, 'password'));
                // TODO set headers
                this._send(body);
            }

        }
    });

    redefine(xhrProto, 'addEventListener', function (eventType, listener) {
        if (!this.__listeners) {
            this.__listeners = {};
            this.__listenedToEvents = new Set();
        }
        eventType = eventType.toLowerCase();
        if (!this.__listeners[eventType]) {
            this.__listeners[eventType] = [];
        }
        this.__listeners[eventType].push(listener);
        this.__listenedToEvents.add(eventType);
        // TODO try catch addEventListener?? for browsers that don't support it
        this._addEventListener(eventType, listener);
        return void 0;
    });

    redefine(xhrProto, 'removeEventListener', function (eventType, listener) {
        var index;
        eventType = eventType.toLowerCase();
        if (this.__listeners[eventType]) {
            index = this.__listeners[eventType].indexOf(listener);
            if (index !== -1) {
                this.__listeners[eventType].splice(index, 1);
            }
        }
        // TODO try catch _removeEventListener?? for browsers that don't support it
        this._removeEventListener(eventType, listener);
        return void 0;
    });

    definePrivate(xhrProto, '__dispatchEvent', function (event) {
        var eventType, j, len, listener, listeners;
        event.currentTarget = event.target = this;
        eventType = event.type;
        if (this.__listeners) {
            if ((listeners = this.__listeners[eventType])) {
                for (j = 0, len = listeners.length; j < len; j++) {
                    listener = listeners[j];
                    listener.call(this, event);
                }
            }
        }
        if ((listener = this["on" + eventType])) {
            listener.call(this, event);
        }
        return void 0;

    });

    /*
     * Maybe in the future this will be made public, but it is needed for testing now
     * TODO Work in Progress (Design needed)
     */
    definePrivate(xhrProto, 'subscribe', function (cb) {
        // assert this._state ===  XMLHttpRequest.OPENED
        var url = defaultPort(xhrInfo.get(this, 'url'));
        // once? or do we have API for unsubscribe?
        // https://nodejs.org/api/events.html#events_emitter_removelistener_eventname_listener
        var subscription = function (requestUrl) {
            // TODO should we go through xhr lifecycle again ??
            if (requestUrl === url) {
                cb();
            }
        };
        configuration.cacheListener.on('cached', subscription);

        // TODO: Will only works once, not with multiple subscription
        definePrivate(xhrProto, 'unsubscribe', function () {
            configuration.cacheListener.removeListener('cached', subscription);
        });
    });
}

module.exports = {
    enableXHROverH2: enableXHROverH2
};
