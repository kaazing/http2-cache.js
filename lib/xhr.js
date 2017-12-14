var http2 = require('http2.js'),
    keys = require('object-keys'),
    redefine = require('./utils').redefine,
    defineGetter = require('./utils').defineGetter,
    definePublic = require('./utils').definePublic,
    definePrivate = require('./utils').definePrivate,
    dataToType = require('./utils').dataToType,
    defaultPort = require('./utils').defaultPort,
    RequestInfo = require('./cache.js').RequestInfo,
    parseUrl = require('./utils').parseUrl,
    serializeXhrBody = require('./utils').serializeXhrBody,
    getOrigin = require('./utils').getOrigin,
    mergeTypedArrays = require('./utils').mergeTypedArrays,
    InvalidStateError = require('./errors.js').InvalidStateError,
    DOMException = require('./errors.js').DOMException,
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

    definePublic(XMLHttpRequest, 'configuration', configuration);
    definePublic(XMLHttpRequest, 'proxy', function (configs) {
        return configuration.configure(configs);
    });

    function redefineProtoInfo(xhrProto, xhrInfo, property, initalValue) {
        var originalProperty = "_" + property;
        Object.defineProperty(xhrProto, originalProperty, Object.getOwnPropertyDescriptor(xhrProto, property));

        Object.defineProperty(xhrProto, property, {
            get: function () {
                return xhrInfo.get(this, property) || this[originalProperty] || initalValue;
            },
            set: function (value) {
                xhrInfo.put(this, property, value);
            }
        });
    }

    redefineProtoInfo(xhrProto, xhrInfo, "responseType", '');
    redefineProtoInfo(xhrProto, xhrInfo, "readyState", 0);
    redefineProtoInfo(xhrProto, xhrInfo, "timeout");
    
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

        // Reset ready state
        xhrInfo.put(this, 'lastreadystate', XMLHttpRequest.OPENED);

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

    definePrivate(xhrProto, '_changeState', function (state, options) {
        var self = this;

        switch (state) {
            case XMLHttpRequest.UNSENT:
                break;
            case XMLHttpRequest.OPENED:
                break;
            case XMLHttpRequest.HEADERS_RECEIVED:
                var statusCode = options.response.statusCode;
                defineGetter(this, 'status', function () {
                    return statusCode;
                });
                var statusMessage = http2.STATUS_CODES[statusCode];
                if (statusMessage) {
                    this.statusText = statusMessage;
                } else {
                    configuration._log.warn('Unknown STATUS CODE: ' + statusCode);
                }
                break;
            case XMLHttpRequest.LOADING:
                this.__dispatchEvent(new ProgressEvent('progress'));
                break;
            case XMLHttpRequest.DONE:
                redefine(this, 'getResponseHeader', function(header) {
                    return options.response.headers[header.toLowerCase()];
                });
                redefine(this, 'getAllResponseHeaders', function() {
                    var responseHeaders = options.response.headers;
                    return keys(responseHeaders).filter(function (responseHeader) {
                        return responseHeader !== 'toString';
                    }).map(function (responseHeader) {
                        return responseHeader + ': ' + responseHeaders[responseHeader];
                    }).join("\n");
                });
                this.__dispatchEvent(new ProgressEvent('load'));
                this.__dispatchEvent(new ProgressEvent('loadend'));
                break;
            default:
                throw new InvalidStateError("Unexpected XHR _changeState: " + state);
        }

        switch (state) {
            case XMLHttpRequest.UNSENT:
            case XMLHttpRequest.OPENED:
                break;
            default:
            this.readyState = state;
            if (this.readyState !== state) {
                throw new Error('Unable to update readyState ' +  this.readyState + ' vs ' + state);
            }
        }
        this.__dispatchEvent(new ProgressEvent('readystatechange'));
    });

    // Expose response and responseText with cached dataToType
    function defineXhrResponse(xhr, response) {

        xhr._response = xhr._response || xhr.response;

        defineGetter(xhr, 'response', function () {
            // Render as responseType
            var responseType = xhrInfo.get(xhr, 'responseType') || '';
            return dataToType(response.data, responseType);
        });
        
        defineGetter(xhr, 'responseText', function () {

            var responseType = xhrInfo.get(xhr, 'responseType') || '';
            if (responseType !== '' && responseType !== 'text') {
                throw new DOMException("Failed to read the 'responseText' property from 'XMLHttpRequest': The value is only accessible if the object's 'responseType' is '' or 'text' (was '" + responseType + "')");
            }

            // Force text rendering
            return dataToType(response.data, 'text');
        });
    }

    definePrivate(xhrProto, '_sendViaHttp2', function (destination, body, proxyTransportUrl) {

        var self = this,
            cache = configuration.cache,
            requestUrl = getOrigin(destination.href) + destination.path,
            requestMethod = xhrInfo.get(self, 'method'),
            requestHeaders = xhrInfo.get(self, 'headers'),
            requestInfo = new RequestInfo(requestMethod, requestUrl, requestHeaders);
        
        // TODO reset response
        // TODO change getCache to readonly property
        
        cache.match(requestInfo).then(function (response) {
            if (response) {

                if (configuration.debug) {
                    configuration._log.debug("Using cache result for XHR(" + destination.href + ")");
                }

                // Export cached response
                defineXhrResponse(self, response);

                self.__dispatchEvent(new ProgressEvent('loadstart'));
                self._changeState(XMLHttpRequest.HEADERS_RECEIVED, {'response': response});
                self._changeState(XMLHttpRequest.LOADING, {'response': response});
                self._changeState(XMLHttpRequest.DONE, {'response': response});

            } else {

                // Need to make the request your self
                if (body) {

                    // https://xhr.spec.whatwg.org/#the-send%28%29-method
                    if (
                        typeof HTMLElement !== 'undefined' &&
                            body instanceof HTMLElement
                    ) {
                        if (!requestHeaders.has('content-encoding')) {
                            requestHeaders.set('content-encoding', 'UTF-8');
                        }

                        if (!requestHeaders.has('content-type')) {
                            requestHeaders.set('content-type', 'text/html; charset=utf-8');
                        }
                    } else {
                        // Set default encoding
                        // TODO use document encoding
                        if (!requestHeaders.has('content-encoding')) {
                            requestHeaders.set('content-encoding', 'UTF-8');
                        }
                    }

                    // only other option in spec is a String
                    // inject content-length TODO remove this as should not be required
                    requestHeaders.set('content-length', body.toString().length);
                }

                // TODO use isRevalidating and store request in cache.revalidate 
                // cache.isRevalidating(requestInfo)

                // Naive Timeout implementation
                var timeout = xhrInfo.get(self, 'timeout'),
                    timeoutTimer = xhrInfo.get(self, 'timeoutTimer');

                if (timeout) {
                    var otoDelegate = self.ontimeout;
                    self.ontimeout = function () {

                        // Clear requestInfo revalidate state
                        cache.validated(requestInfo);

                        // TODO abort
                        xhrInfo.put(self, 'timeoutOccured', true);
                        otoDelegate();
                    };

                    clearTimeout(timeoutTimer);
                    xhrInfo.put(self, 'timeoutOccured', false);

                    timeoutTimer = setTimeout(self.ontimeout, timeout);
                    xhrInfo.put(self, 'timeoutTimer', timeoutTimer);
                }

                var transport = configuration.getTransport(proxyTransportUrl);

                var request = http2.raw.request({
                    agent: configuration.agent,
                    // protocol has already been matched by getting transport url
                    // protocol: destination.protocol,
                    hostname: destination.hostname,
                    port: destination.port,
                    path: destination.path,
                    method: requestMethod,
                    headers: requestHeaders.toObject(),
                    // auth: self.__headers // TODO AUTH
                    // TODO, change transport to createConnection
                    transport: transport,
                    transportUrl: proxyTransportUrl
                    // TODO timeout if syncronization set
                    // timeout: self.__timeout
                }, function (response) {

                    var timeoutOccured = xhrInfo.get(self, 'timeoutOccured'),
                        timeoutTimer = xhrInfo.get(self, 'timeoutTimer');

                    // Naive Timeout implementation
                    if (timeoutOccured) {
                        return;
                    }
                    
                    clearTimeout(timeoutTimer);

                    // Export live response
                    defineXhrResponse(self, response);

                    self._changeState(XMLHttpRequest.HEADERS_RECEIVED, {'response': response});

                    response.on('data', function (data) {
                        response.data = mergeTypedArrays(response.data, data);
                        self._changeState(XMLHttpRequest.LOADING, {'response': response});
                    });

                    response.on('finish', function () {

                        if (configuration.debug) {
                            configuration._log.debug("Got response for proxied XHR(" + destination.href + ")");
                        }

                        cache.put(requestInfo, response).then(function () {
                            configuration._log.debug("Cache updated for proxied XHR(" + destination.href + ")");
                        }).catch(function (cacheError) {
                            configuration._log.debug("Cache error for proxied XHR(" + destination.href + "):" + cacheError.message);                            
                        }).then(function () {
                            self._changeState(XMLHttpRequest.DONE, {
                                'response': response
                            });

                            // Clear requestInfo revalidate state
                            cache.validated(requestInfo);  
                        });
                    });
                });

                // TODO Why ?
                request.on('error', function (/*e*/) {

                    // Clear requestInfo revalidate state
                    cache.validated(requestInfo);

                    // TODO, handle error
                    //self._changeState('error');

                    self.__dispatchEvent(new ProgressEvent('error'));
                });

                // add to cache when receive pushRequest
                request.on('push', function(respo) {
                    configuration.onPush(respo);
                });
                
                request.end(body || null);

                // Set requestInfo revalidate state
                // TODO pass request for future dedup pending requestInfo
                cache.revalidate(requestInfo);

                self.__dispatchEvent(new ProgressEvent('loadstart'));
            }
        });
    });

    redefine(xhrProto, 'send', function (body) {
        
        var self = this,
            url = xhrInfo.get(self, 'url');

        if (configuration.isConfiguring()) {

            if (configuration.debug) {
                configuration._log.debug("Delaying XHR(" + url + ") until configuration completes");
            }

            configuration.once('completed', function () {
                self.send(body);
            });

        } else {

            var destination = parseUrl(url),
                proxyTransportUrl = configuration.getTransportUrl(destination);

            if (proxyTransportUrl) {

                if (configuration.debug) {
                    configuration._log.debug("Proxying XHR(" + url + ") via " + proxyTransportUrl);
                }

                // Fix support for FormData if not null and object
                if (body && typeof body === "object") {
                    body = serializeXhrBody(xhrInfo, body);   
                }
                
                self._sendViaHttp2(destination, body, proxyTransportUrl);

            } else {

                if (configuration.debug) {
                    configuration._log.debug("Sending XHR(" + url + ") via native stack");
                }

                self._open(xhrInfo.get(self, 'method'),
                    url,
                    xhrInfo.get(self, 'async'),
                    xhrInfo.get(self, 'username'),
                    xhrInfo.get(self, 'password')
                );

                // Restore responseType
                self._responseType = xhrInfo.get(self, 'responseType') || '';

                // Reset Headers
                var requestHeaders = xhrInfo.get(self, 'headers');
                requestHeaders.forEach(function (value, key) {  
                    self._setRequestHeader(key, value);                  
                }, self);           

                // Fix support for http2.js only if FormData is not defined and not null
                if (body && typeof FormData === "undefined") {
                    body = serializeXhrBody(xhrInfo, body);   
                }

                self._send(body);
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
