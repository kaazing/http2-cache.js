var websocket = require('websocket-stream'),
    keys = require('object-keys'),
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

// Save global self to worker;
/* global self:true */
var worker = runningInWorker() ? self : null,
    runInWorker = worker !== null;
/* global self:false */

//////////////////////////////////////////// Configuration ////////////////////////////////////////////
function Configuration(options) {
    var self = this;
    self.options = (options || {});

    EventEmitter.call(this);
    
    self._activeConfigurationCnt = 0;
    self._proxyMap = {};
    self._activeTransportConnections = {};
            
    // Init debug/log
    self.debug = self.options.debug;
    self._log = logger.consoleLogger;

    self.setDebugLevel(self.options.debugLevel || self.options.debug);

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

confProto.setDebugLevel = function (level) {

    level = typeof level === 'string' ? level : level === true ? 'info' : null;

    // Init debug/log
    if (this._log && this._log.hasOwnProperty('debugLevel')) {
        this._log.debugLevel = level;
    }
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

    var self = this,
        hasExistingTransport = self._activeTransportConnections.hasOwnProperty(url),
        hasActiveTransport =  hasExistingTransport && !!self._activeTransportConnections[url].writable;
    
    if (
        hasExistingTransport === false || 
            hasActiveTransport === false
    ) {

        // Cleanup on first existing transtort re-connection attempt.
        if (hasExistingTransport) {

            if (this.debug) {
                this._log.info("Re-Opening transport: " + url);
            }

            // Clear pending revalidates 
            this.cache.clearRevalidates();

        } else {
            if (this.debug) {
                this._log.info("Opening transport: " + url);
            }            
        }

        var parsedUrl = parseUrl(url);
        if(parsedUrl.protocol === 'ws:' || parsedUrl.protocol === 'wss:'){
            // TODO, maybe enable perMessageDeflate in production or on debug??
            this._activeTransportConnections[url] = websocket(url, "h2", {
                perMessageDeflate: this.debug === false
            });
        } else if(parsedUrl.protocol === 'tcp:'){
            this._activeTransportConnections[url] = require('net').connect({
                'host' : parsedUrl.hostname,
                'port' : parsedUrl.port
            });
        } else {
            throw new Error('Unrecognized transport protocol: ' + parsedUrl.protocol + ', for transport: ' + url);
        }
    }

    return this._activeTransportConnections[url];
};

confProto.addTransportUrl = function (url, transport) {
    
    url = parseUrl(url); // Enforce
    this._proxyMap[url.href] = transport;

    return this;
};

confProto.getTransportUrl = function (url) {

    url = parseUrl(url); // Enforce

    var proxyUrl = keys(this._proxyMap).reduce(function (result, value) {
        // Check that transport url match beginning of url
        return url.href.indexOf(value) === 0 ? value : result;
    }, false);

    return proxyUrl && this._proxyMap[proxyUrl];
};

confProto.onPush = function (pushRequest) {
    var self = this,
        cache = self.cache,
        origin = getOrigin(pushRequest.scheme + "://" + pushRequest.headers.host);
    
    // Create href
    pushRequest.href = origin + pushRequest.url;

    if (self.debug) {
        self._log.info("Received push promise for: " + pushRequest.href);
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
                self._log.debug("Cache updated via push for proxied XHR(" + pushRequest.href + ")");
            }, function (cacheError) {
                self._log.debug("Cache error via push for proxied XHR(" + pushRequest.href + "):" + cacheError.message);                            
            }).then(function () {
                // Clear requestInfo revalidate state
                cache.validated(requestInfo);
            });
        });

        response.on('error', function (e) {
            self._log.warn("Server push stream error: " + e);

            // Clear requestInfo revalidate state
            cache.validated(requestInfo);
        });
    });
};

// open h2 pull channel
confProto.openH2StreamForPush = function (pushUrl, proxyTransportUrl) {
    
    var self = this,
        pushUri = parseUrl(pushUrl);

    if (self.debug) {
        self._log.info('Opening h2 channel for Push Promises: ' + pushUrl);
    }

    var openH2StreamForPush, reopenH2StreamForPush, // expression not function,
        request,
        reconnectFailures = [],
        reconnectAutoDelay = self.options.reconnectAutoDelay || 100,
        reconnectAuto = self.options.reconnectAuto || true,
        reconnectTimer =  null,
        opened = false,
        reopening = false;

    reopenH2StreamForPush = function reopenH2StreamForPush(err) {
        opened = false;
        self._log.info(pushUrl + " push channel closed.");

        // Clear pending revalidates 
        self.cache.clearRevalidates();

        if (err) {
            self._log.warn("Push channel stream error: " + err);
            reconnectFailures.push(err);

            if (reconnectAuto && !reopening) {
                var reOpendelay = reconnectFailures.length * reconnectAutoDelay;
                
                self._log.info("Push channel stream will re-open in " + reOpendelay + "ms .");

                clearTimeout(reconnectTimer);
                reconnectTimer = setTimeout(
                    openH2StreamForPush,
                    reOpendelay
                );

            } else {
                self._log.warn("Push channel stream already reopening.");
            }
        }
    };

    openH2StreamForPush = function () {

        self._log.info("Push channel will open: " + pushUri.href);

        if (opened) {
            throw new Error("Server push stream already opened.");
        }

        reopening = true;
        opened = true;

        var transport = self.getTransport(proxyTransportUrl);

        var request = http2.raw.request({
            hostname: pushUri.hostname,
            port: pushUri.port,
            path: pushUri.path,
            transportUrl: proxyTransportUrl,
            transport: transport,
            agent: self.agent
        }, function (response) {
            reopening = false;

            self._log.debug("Push channel opened: " + pushUri.href);
            
            response.on('finish', function (err) {
                // TODO finished 
                reconnectFailures.length = 0;
                reopenH2StreamForPush(err, pushUri);
            });

            response.on('error', function (err) {
                reopenH2StreamForPush(err, pushUri);
            });

            response.on('open', function () {
                opened = true;
                reconnectFailures.length = 0;
            });

            transport.on('close', function (err) {
                opened = false;
                reconnectFailures.length = 0;
                reopenH2StreamForPush(err, pushUri);
            });
        });

        request.on('error', function (err) {
            reopening = false;
            reopenH2StreamForPush(err, pushUri);
        });

        // add to cache when receive pushRequest
        request.on('push', function (pushRequest) {
            self._log.debug("Push channel received: " + pushRequest);
            self.onPush(pushRequest);
        });

        request.end();

        return request;
    };

    request = openH2StreamForPush(pushUri);

    return request;
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

// add config by json
confProto.addConfig = function (config) {
    var self = this;

    // Decode config
    config = self.parseConfig(config);
        
    // Legacy with warning
    if (config.pushURL) {
        self._log.warn('XMLHttpRequest Http2-Cache configuration "pushURL" is now "push"');
        config.push = config.pushURL;
        delete config.pushURL;
    }

    self.setDebugLevel(self.clientLogLevel || config.clientLogLevel);

    if (
        typeof config.worker !== 'undefined' &&
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
        worker = self.worker = new Worker('/dist/http2-Cache.js');
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

                // TODO force transferable responsetype
                // xhr.responseType = 'arraybuffer';

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
                                xhr.responseRaw.data : 
                                    String(xhr.response));
                    }

                    // Use Sharebuffer to prevent copy
                    var transferable = [],
                        // TODO Enable via config ? 
                        useTransferable = false; // Disabled for now

                    // DONE fix Uncaught DataCloneError: Failed to execute 'postMessage' on 'Worker': Value at index 0 does not have a transferable type.
                    // - https://chromium.googlesource.com/chromium/blink/+/72fef91ac1ef679207f51def8133b336a6f6588f/LayoutTests/fast/events/message-port-clone.html                        
                    // DONE fix Uncaught (in promise) DOMException: Failed to execute 'postMessage' on 'MessagePort': An ArrayBuffer is neutered and could not be cloned.                    
                    // - https://stackoverflow.com/questions/38169672/why-are-transfered-buffers-neutered-in-javascript/38283644 
                    // DONE fix Firefox InvalidStateError: An attempt was made to use an object that is not, or is no longer, usable (http://localhost:8086/dist/http2-Cache.js:942)
                    // - Parse header only when XMLHttpRequest.DONE
                    if (
                        useTransferable &&
                            options.response && 
                                options.response.data &&
                                    options.response.data.buffer
                    ) {
                        options.response.buffer = dataToType(options.response.data, 'arraybuffer');
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
    for(var i = 0, l = config.proxy.length; i < l; i++) {
        this.addTransportUrl(config.proxy[i], config.transport);
    }
};

// add config by url
confProto.fetchConfig = function (url) {
    var xhr = new XMLHttpRequest();
    // TODO, consider using semi-public API??
    xhr._open('GET', url);
    this.configuring();
    var self = this;
    xhr.addEventListener("load", function () {
        if (xhr.readyState === XMLHttpRequest.DONE) {
            var status = xhr.status;
            if (status !== 200) {
                throw new InvalidStateError('Failed to load configuration ' + url + ', status code: ' + status);
            }
            self.addConfig(xhr.response);
            self.configured();
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
