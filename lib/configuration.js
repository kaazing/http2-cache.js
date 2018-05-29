var websocket = require('websocket-stream'),
    keys = require('object-keys'),
    assign = require('object-assign'),
    http2 = require('http2.js'),
    util = require('util'),
    EventEmitter = require('events').EventEmitter,
    InvalidStateError = require('./errors.js').InvalidStateError,
    RequestInfo = require('./cache.js').RequestInfo,
    Cache = require('./cache.js').Cache,
    Agent = require('./agent').Agent,
    logger = require('./logger'),
    parseUrl = require('./utils').parseUrl,
    dataToType = require('./utils').dataToType,
    getOrigin = require('./utils.js').getOrigin,
    mergeTypedArrays = require('./utils.js').mergeTypedArrays,
    defaultPort = require('./utils.js').defaultPort,
    runningInWorker = require('./utils.js').runningInWorker,
    CacheListener = require('./cache-listener').CacheListener;

// Save global self to worker
/* global self:true */
var runInWorker = runningInWorker(),
    worker = runInWorker ? self : null;
/* global self:false */

// Detect current script to be injected in worker, null in worker.
var currentScript = (function () {
    if (typeof document !== 'undefined' && runInWorker !== true) {
        return (document.currentScript || (function () {
            var scripts = document.getElementsByTagName('script');
            return scripts[scripts.length - 1];
        }()));
    }
}());

//////////////////////////////////////////// Configuration ////////////////////////////////////////////

function Configuration(options) {
    var self = this;

    // Init default options
    self.options = assign({}, self.defaultOptions);
    
    // Set options
    this.setOptions(options);

    EventEmitter.call(this);
        
    // Map of Url to transport
    self._proxyMap = {};

    // Map of PushUrl ro PushRequest
    self._pushRequests = {};
    
    self._activeConfigurationCnt = 0;
    self._activeTransportConnections = {};
            
    // Init debug/log
    self._log = logger.consoleLogger;
    self.setDebugLevel(self.options.clientLogLevel || self.options.debug);

    // Init Cache
    self.cache = options.cache || new Cache({
        debug: self.debug,
        log: self._log
    });

    self.cacheListener = new CacheListener(self);

    self.agent = new Agent({
        log: self._log
    });

    // Init worker listener
    if (self.runInWorker === true) {
        self.initWorker();
    }
}

util.inherits(Configuration, EventEmitter);

var confProto = Configuration.prototype;

confProto.runInWorker = runInWorker;

confProto.defaultOptions =  {
    // Logger debugLevel true='info' or (info|debug|trace)
    debug: false,                   
    // Reconnect settings
    reconnect: true,
    reconnectInterval: 100,
    maximumReconnectInterval: 4000,
    // AccelerationStrategy could be "always"  or "connected"
    // Value always means always/don't make requests if they are proxied but no ws connection is open. Wait for the connection to open instead.
    // Value connected means make requests when connected via websocket.
    accelerationStrategy: 'always', 
};

confProto.debug = false;

confProto.setOptions = function (options) {
    assign(this.options, options);
    return this;
};


confProto.setDebugLevel = function (level) {
    var that = this;

    level = typeof level === 'string' ? level : level === true ? 'info' : null;

    // Init debug/log
    if (that._log && that._log.hasOwnProperty('debugLevel')) {
        that._log.debugLevel = level;
    }
    
    // Sync current options value
    that.options.debug = level;

    // Sync and cast has boolean
    that.debug = !!that.options.debug; 
};

confProto.configuring = function () {
    this._activeConfigurationCnt++;
};

confProto.configured = function () {
    this._activeConfigurationCnt--;
    if (this._activeConfigurationCnt === 0) {
        this.emit('completed');
    }
};

confProto.isConfiguring = function () {
    return this._activeConfigurationCnt > 0;
};

confProto.getTransport = function (url) {
    var that = this,
        uri = parseUrl(url),
        activeTransportConnections = that._activeTransportConnections,
        hasExistingTransport = activeTransportConnections.hasOwnProperty(uri.href),
        hasActiveTransport =  hasExistingTransport && !!activeTransportConnections[uri.href].writable;
    
    if (
        hasExistingTransport === false || 
            hasActiveTransport === false
    ) {

        // Cleanup on first existing transtort re-connection attempt.
        if (hasExistingTransport) {

            if (that.debug) {
                that._log.info("Re-Opening transport: " + uri.href);
            }

            // Clear pending revalidates 
            that.cache.clearRevalidates();

        } else {
            if (that.debug) {
                that._log.info("Opening transport: " + uri.href);
            }            
        }

        if (uri.protocol === 'ws:' || uri.protocol === 'wss:') {
            activeTransportConnections[uri.href] = websocket(uri.href, "h2", {
                // TODO, maybe enable perMessageDeflate in production or on debug??
                perMessageDeflate: that.debug === false
            });

        } else if(uri.protocol === 'tcp:') {
            activeTransportConnections[uri.href] = require('net').connect({
                'host' : uri.hostname,
                'port' : uri.port
            });
        } else {
            throw new Error('Unrecognized transport protocol: ' + uri.protocol + ', for transport: ' + uri.href);
        }

        // On transport error remove Urls attached to transport and add on re-open
        var transport = activeTransportConnections[uri.href];
        transport.on('error', function () {
            
            // Clear urls attached to proxyTransportUrl
            if (that.options.accelerationStrategy === 'connected') {

                var proxyUrls = that.getTransportUrls(url);

                // Remove urls transport
                proxyUrls.forEach(that.removeTransportUrl.bind(that));

                // Restore urls for that transport once on connected again
                transport.on('open', function () {
                    that.addTransportUrls(proxyUrls, url);
                });
            }
        });
    }

    return activeTransportConnections[uri.href];
};

confProto.addTransportUrl = function (url, transport) {
    var uri = parseUrl(url); // Enforce
    this._proxyMap[uri.href] = transport;
    return this;
};

confProto.addTransportUrls = function (urls, transport) {
    var that = this;
    urls.forEach(function (url) {
        that.addTransportUrl(url, transport);
    });
    return this;
};

confProto.removeTransportUrl = function (url) {
    var uri = parseUrl(url); // Enforce
    delete this._proxyMap[uri.href];
    return this;
};

confProto.getTransportUrl = function (url) {

    var uri = parseUrl(url); // Enforce
    var proxyUrl = keys(this._proxyMap).reduce(function (result, value) {
        // Check that transport uri match beginning of uri
        return uri.href.indexOf(value) === 0 ? value : result;
    }, false);

    return proxyUrl && this._proxyMap[proxyUrl];
};

confProto.getTransportUrls = function (transport) {
    var _proxyMap = this._proxyMap,
        proxyUrls = keys(_proxyMap).filter(function (url) {
            return transport === _proxyMap[url];
        });
    return proxyUrls;
};

confProto.onPush = function (pushRequest) {
    var that = this,
        cache = that.cache,
        origin = getOrigin(pushRequest.scheme + "://" + pushRequest.headers.host);
    
    // Create href
    pushRequest.href = origin + pushRequest.url;

    if (that.debug) {
        that._log.info("Received push promise for: " + pushRequest.href);
    }

    // TODO pass pushRequest for future dedup pending requestInfo
    var requestInfo = new RequestInfo(pushRequest.method, pushRequest.href, pushRequest.headers);

    cache.revalidate(requestInfo);

    pushRequest.on('response', function (response) {

        // TODO match or partial move to _sendViaHttp2 xhr.js to avoid maintain both
        response.on('data', function (data) {
            response.data = mergeTypedArrays(response.data, data);
        });
        
        response.on('end', function () {
            cache.put(requestInfo, response).then(function () {
                that._log.debug("Cache updated via push for proxied XHR(" + pushRequest.href + ")");
            }, function (cacheError) {
                that._log.debug("Cache error via push for proxied XHR(" + pushRequest.href + "):" + cacheError.message);                            
            }).then(function () {
                // Clear requestInfo revalidate state
                cache.validated(requestInfo);
            });
        });

        response.on('error', function (e) {
            that._log.warn("Server push stream error: " + e);

            // Clear requestInfo revalidate state
            cache.validated(requestInfo);
        });
    });
};

// open h2 pull channel
confProto.openH2StreamForPush = function (pushUrl, proxyTransportUrl) {
    
    var that = this,
        options = that.options,
        pushUri = parseUrl(pushUrl);

    that._log.debug('Opening h2 channel for Push Promises: ' + pushUri.href);

    var transport = that.getTransport(proxyTransportUrl),
        // Create _pushRequests entry with failures and connect states
        pushRequest = that._pushRequests[pushUri.href] = that._pushRequests[pushUri.href] || {
            failures: [],
            reconnectTimer: null,
            opened: false,
            connecting: false
        },

        reopenH2StreamForPush = function (reason) {
            that._log.info(pushUrl + " push channel closed.");

            // Mark as closed
            pushRequest.opened = false;

            // Clear pending revalidates 
            that.cache.clearRevalidates();

            // Will reconnect only if reason provided
            if (reason) {

                that._log.warn("Push channel stream reason: " + reason);
                pushRequest.failures.push(reason);

                if (options.reconnect && !pushRequest.connecting) {
                    
                    // Get min time between maximumReconnectInterval and failures*reconnectInterval
                    var reOpendelay = Math.min(
                        pushRequest.failures.length * options.reconnectInterval, 
                        options.maximumReconnectInterval
                    );
                    
                    that._log.info("Push channel stream will re-open in " + reOpendelay + "ms .");

                    clearTimeout(pushRequest.reconnectTimer);
                    pushRequest.reconnectTimer = setTimeout(
                        that.openH2StreamForPush.bind(that, pushUrl, proxyTransportUrl),
                        reOpendelay
                    );

                } else {
                    that._log.warn("Push channel stream already connecting.");
                }
            }
        },

        openH2StreamForPush = function () {

            that._log.info("Push channel will open: " + pushUri.href);

            if (pushRequest.opened) {
                throw new Error("Server push stream already opened for push "+ pushUri.href);
            } else if (pushRequest.connecting) {
                throw new Error("Server push stream is already connecting for push "+ pushUri.href);
            }

            pushRequest.connecting = true;
            pushRequest.opened = false;

            var request = http2.raw.request({
                hostname: pushUri.hostname,
                port: pushUri.port,
                path: pushUri.path,
                transportUrl: proxyTransportUrl,
                transport: transport,
                agent: that.agent
            }, function (response) {

                that._log.debug("Push channel connected: " + pushUri.href);

                // Set push request connected (not open)
                pushRequest.connecting = false;

                response.on('open', function () {
                    // Reset failures on push open not before
                    pushRequest.opened = true;
                    pushRequest.failures.length = 0;
                });

                response.on('finish', function (err) {
                    // Reconnect on finish
                    reopenH2StreamForPush(err);
                });

                response.on('close', function (err) {
                    // Reconnect on finish
                    reopenH2StreamForPush(err);
                });

                response.on('error', function (err) {
                    that._log.error("Push channel response closed: ", err);
                    // Reconnect on error
                    reopenH2StreamForPush(err);
                });
            });

            // Reconnect on error
            request.on('error', function (err) {
                that._log.error("Push channel request error: ", err);
                pushRequest.connecting = false;
                reopenH2StreamForPush(err);
            });

            // add to cache when receive pushRequest
            request.on('push', function (request) {
                that._log.debug("Push channel received: " + request);

                // Trigger Configuration default push listener
                that.onPush(request);

                // Allow to subscribe to push from configuration for debug
                that.emit('push', request);
            });

            request.end();

            // Reconnect on trasnport close
            transport.on('close', function (err) {
                // TODO err can be null, can reopenH2StreamForPush only reopen with reason
                // Should reopenH2StreamForPush re-open even on proper close ?
                that._log.debug("Push channel request transport closed: ", err);
                pushRequest.connecting = false;
                reopenH2StreamForPush(err);
            });

            pushRequest.request = request;

            return pushRequest.request;
        };

    return openH2StreamForPush();
};

// parse config json
confProto.parseConfig = function (config) {
    try {
        config = typeof config === 'string' ? JSON.parse(config) : config;
    } catch (JsonErr) {
        throw new Error('Unable to parse config: ' + config);
    }
    return config;
};

confProto.useWorker = typeof Worker !== 'undefined';

// add config by json
/*
{
    // Logger debugLevel true='info' or (info|debug|trace)
    "clientLogLevel": false,
    // Transport endpoint
    "transport": "wss://where-the-underlying-ws-transport-connects:443/",
    // Transport push path
    "push": "optional-path-that-is-connected-for-pushes",
    // Transport reconnect settings
    "reconnect": true,
    "reconnectInterval": 100,
    "maximumReconnectInterval": 4000,
    // AccelerationStrategy could be "always"  or "connected"
    // Value always means always/don't make requests if they are proxied but no ws connection is open. Wait for the connection to open instead.
    // Value connected means make requests when connected via websocket.
    "accelerationStrategy": "always",
    "proxy": [
      "http://origin-to-send-via-http2:80/path/",
      "http://origin-to-send-via-http2:80/path2/",
      "http://other-origin-to-send-via-http2:80"
    ]
}
*/
confProto.addConfig = function (config) {
    var self = this;

    config = self.parseConfig(config);
        
    // Legacy with warning
    if (config.pushURL) {
        self._log.warn('XMLHttpRequest Http2-Cache configuration "pushURL" is now "push"');
        config.push = config.pushURL;
        delete config.pushURL;
    }

    // Update clientLogLevel
    if (config.hasOwnProperty('clientLogLevel')) {
        that.setDebugLevel(config.clientLogLevel);
        // Update option to reflect client state
        that.options.clientLogLevel = config.clientLogLevel;
    }

    config.worker = typeof config.worker === 'undefined' ? 
                         self.useWorker : config.worker;

    if (
        config.worker !== false &&
            self.runInWorker === false
    ) {

        // Create worker if missing
        self.registerWorker(config.worker);

        self.configuring();
        
        // Call addConfig
        self.channel.port1.postMessage({
            method: 'addConfig',
            params: {
                config: config
            }
        }); 

        this.addConfigTransportUrls(config);

    } else {

        if (config.channel) {
            self.channel = config.channel;
        }

        this.addConfigTransportUrls(config);

        if (config.push) {
            self.openH2StreamForPush(parseUrl(defaultPort(config.push)), config.transport);
        }   
    }
};

confProto.terminateWorker = function () {
    var self = this;
    if (typeof self.worker !== 'undefined') {
        self.worker.terminate();
        delete self.worker;
    }

    if (typeof self.channel !== 'undefined') {
        self.channel.port1.close();
        self.channel.port2.close();
        delete self.channel;
    }
};

confProto.registerWorker = function (worker) {
    var self = this;

    // Only one
    this.terminateWorker();

    // TODO detect location
    if (typeof Worker === 'undefined') {
        throw new Error('Worker not supported');
    } else if (worker instanceof Worker) {
        self.worker = worker;
    } else if (typeof worker === 'string') {
        worker = self.worker = new Worker(worker);
    } else if (typeof worker === 'boolean') {
        if (
            currentScript !== null && 
                typeof currentScript.src !== 'undefined'
        ) {
            worker = self.worker = new Worker(currentScript.src);
        } else {
            throw new Error('Unable to detect http2-cache script location');
        }
    } else {
        throw new Error('Invalid worker options.');
    }

    if (typeof self.channel !== 'undefined') {
        throw new Error('Channel already open.');
    }

    // TODO close MessageChannel
    var channel = self.channel = new MessageChannel();

    // TODO add push event support

    channel.port1.onmessage = function (event) {
        //console.log('channel onmessage', event);
        var data = event.data;
        if (
            typeof data === 'object' &&
                typeof data.method === 'string' 
        ) {
            if (data.method === 'configured') {
                self.configured();
            } else {
                throw new Error('Unknow method: ' + data.method);
            }
        } else {
            throw new Error('Unknow event:' + event);
        }
    };

    worker.postMessage({
        method: 'registerWorkerPort',
        params: {
            port: channel.port2
        }
    }, [channel.port2]);
};

confProto.initWorker = function () {
    //console.log('initWorker');
    var self = this;
    worker.addEventListener('message', function (event) {
        //console.log('initWorker message', event);
        var data = event.data;
        if (
            typeof data === 'object' &&
                typeof data.method === 'string' 
        ) {
            if (data.method === 'registerWorkerPort') {
                self.registerWorkerPort(data.params.port);
            } else {
                throw new Error('Unknow method: ' + data.method);
            }
        } else {
            throw new Error('Unknow event:' + event);
        }
    });  
};

/**
 * XmlHttpRequest's getAllResponseHeaders() method returns a string of response
 * headers according to the format described here:
 * http://www.w3.org/TR/XMLHttpRequest/#the-getallresponseheaders-method
 * This method parses that string into a user-friendly key/value pair object.
 */
function parseResponseHeaders(headerStr) {
  var headers = {};
  if (!headerStr) {
    return headers;
  }
  var headerPairs = headerStr.split('\u000d\u000a');
  for (var i = 0, len = headerPairs.length; i < len; i++) {
    var headerPair = headerPairs[i];
    var index = headerPair.indexOf('\u003a\u0020');
    if (index > 0) {
      var key = headerPair.substring(0, index);
      var val = headerPair.substring(index + 2);
      headers[key] = val;
    }
  }
  return headers;
}

confProto.registerWorkerPort = function (port) {
    // TODO check typeof port
    //console.log('registerWorkerPort', port);
    var self = this;
    port.onmessage = function (event) {
        //console.log('registerWorkerPort onmessage', event);
        var data = event.data;
        if (
            typeof data === 'object' &&
                typeof data.method === 'string' 
        ) {
            if (data.method === 'addConfig') {
                var result = self.addConfig(data.params.config);    
                port.postMessage({
                    method: 'configured',
                    params: data.params
                });
            } else if (data.method === 'sendViaChannel') {

                // TODO map not only on _sendViaHttp2 but pure xhr in worker also
                var xhr = new XMLHttpRequest();

                xhr.responsetype = event.data.params.responseType;

                // Share worker client
                xhr.addEventListener('readystatechange', function () {
                    var state = xhr.readyState,
                        options = {
                            response: {}
                        };

                    if (state === XMLHttpRequest.HEADERS_RECEIVED) {
                        options.response.statusCode = parseInt(xhr.status, 10);
                    }

                    if (state === XMLHttpRequest.DONE) {
                        options.response.headers = (xhr.responseRaw ? 
                                xhr.responseRaw.headers : 
                                    parseResponseHeaders(xhr.getAllResponseHeaders() || ""));
                    }

                    if (state >= XMLHttpRequest.LOADING) {
                        options.response.data = (xhr.responseRaw ? 
                                xhr.responseRaw.data : xhr.response);
                    }

                    // Use Sharebuffer to prevent copy
                    var transferable = [],
                        // TODO Enable via config ? 
                        useTransferable = !!this.useTransferable; // Disabled for now

                    // DONE fix Uncaught DataCloneError: Failed to execute 'postMessage' on 'Worker': Value at index 0 does not have a transferable type.
                    // - https://chromium.googlesource.com/chromium/blink/+/72fef91ac1ef679207f51def8133b336a6f6588f/LayoutTests/fast/events/message-port-clone.html                        
                    // DONE fix Uncaught (in promise) DOMException: Failed to execute 'postMessage' on 'MessagePort': An ArrayBuffer is neutered and could not be cloned.                    
                    // - https://stackoverflow.com/questions/38169672/why-are-transfered-buffers-neutered-in-javascript/38283644 
                    // DONE fix Firefox InvalidStateError: An attempt was made to use an object that is not, or is no longer, usable (http://localhost:8086/dist/http2-cache.js:942)
                    // - Parse header only when XMLHttpRequest.DONE
                    if (
                        useTransferable &&
                            options.response && 
                                options.response.data
                    ) {
                        
                        options.response.buffer = (options.response.data instanceof ArrayBuffer) ? 
                                options.response.data : dataToType(options.response.data, 'arraybuffer');
                        delete options.response.data;

                        transferable.push(options.response.buffer);
                    }
                    
                    data.params.port.postMessage({
                        method: '_changeState',
                        params: {
                            state: state,
                            options: options
                        }
                    }, transferable);
                });

                if (event.data.params.headers) {
                    event.data.params.headers.forEach(function (value, key) {  
                        self.setRequestHeader(key, value);                  
                    }, self);   
                }

                xhr.open(event.data.params.method, event.data.params.url);
                xhr.send(event.data.params.body);

                data.params.port.postMessage({
                    method: 'willSendViaChannel',
                    params: event.data.params.url
                }); 

            } else {
                throw new Error('Unknow method: ' + data.method);
            }
        } else {
            throw new Error('Unknow event:' + event);
        }
    };
};

confProto.addConfigTransportUrls = function (config) {
    var self = this;
    // Lookup for defaultOptions keys in config
    keys(self.defaultOptions).forEach(function (configOption) {
        if (config.hasOwnProperty(configOption)) {
            // Create config.options if do not exit only if mapping match once at least
            config.options = config.options || {}; 
            config.options[configOption] = config[configOption];
        } 
    });

    // Merge config options
    if (config.hasOwnProperty('options') && config.options) {
        self.setOptions(config.options);
    }

    // Install transport
    if (config.hasOwnProperty('transport') && config.transport) {

        // Validate transport
        try {
            
            var transportUri = parseUrl(config.transport);
            
            // Add transport proxyfied urls 
            if (config.hasOwnProperty('proxy')) {
                self.addTransportUrls(config.proxy, transportUri);
            }

            // Connect transport to push url
            if (config.hasOwnProperty('push') && config.push) {
                self.openH2StreamForPush(parseUrl(config.push), transportUri);
            }

        } catch (err) {
            self._log.error('XMLHttpRequest Http2-Cache configuration "transport" error', err);
        }
    }
};

// add config by url
confProto.fetchConfig = function (url) {
    // TODO, consider using semi-public API??
    var self = this;
    var xhr = new XMLHttpRequest();
    xhr._open('GET', url);
    self.configuring();
    xhr.addEventListener("load", function () {
        if (xhr.readyState === XMLHttpRequest.DONE) {
            var status = xhr.status;
            if (status !== 200) {
                // Prevent configuration to be stale on config load failure
                self.configured();
                throw new InvalidStateError('Failed to load configuration ' + url + ', status code: ' + status);
            } else {
                self.addConfig(xhr.response);
                self.configured();   
            }
        }
    }, true);
    // TODO, consider using semi-public API??
    xhr._send();
};

// add configs by an array of urls
confProto.configure = function (urls) {
    if (urls instanceof Array) {
        var cntI = urls.length;
        for (var i = 0; i < cntI; i++) {
            if (typeof urls[i] === 'string') {
                this.fetchConfig(urls[i]);
            } else if (typeof urls[i] === 'object') {
                this.configuring();
                this.addConfig(urls[i]);
                this.configured();
            } else {
                throw new SyntaxError('Invalid arg: ' + urls);
            }
        }
    } else {
        throw new SyntaxError('Invalid arg: ' + urls);
    }
};

module.exports = Configuration;
