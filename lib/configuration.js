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
    getOrigin = require('./utils.js').getOrigin,
    mergeTypedArrays = require('./utils.js').mergeTypedArrays,
    defaultPort = require('./utils.js').defaultPort,
    CacheListener = require('./cache-listener').CacheListener;

//////////////////////////////////////////// Configuration ////////////////////////////////////////////

function Configuration(options) {
    var that = this;

    // Init default options
    that.options = assign({}, that.defaultOptions);
    
    // Set options
    this.setOptions(options);

    EventEmitter.call(this);
    
    that._activeConfigurationCnt = 0;
    that._proxyMap = {};
    that._activeTransportConnections = {};
            
    // Init debug/log
    that._log = logger.consoleLogger;
    that.setDebugLevel(that.options.clientLogLevel || that.options.debug);

    // Init Cache
    that.cache = options.cache || new Cache({
        debug: that.debug,
        log: that._log
    });

    that.cacheListener = new CacheListener(that);

    that.agent = new Agent({
        log: that._log
    });
}

util.inherits(Configuration, EventEmitter);

var confProto = Configuration.prototype;

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

confProto.setOptions = function (options) {
    assign(this.options, options);
    return this;
};

confProto.debug = false;

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

    url = parseUrl(url);

    var that = this,
        hasExistingTransport = that._activeTransportConnections.hasOwnProperty(url.href),
        hasActiveTransport =  hasExistingTransport && !!that._activeTransportConnections[url.href].writable;
    
    if (
        hasExistingTransport === false || 
            hasActiveTransport === false
    ) {

        // Cleanup on first existing transtort re-connection attempt.
        if (hasExistingTransport) {

            if (that.debug) {
                that._log.info("Re-Opening transport: " + url.href);
            }

            // Clear pending revalidates 
            that.cache.clearRevalidates();

        } else {
            if (that.debug) {
                that._log.info("Opening transport: " + url.href);
            }            
        }

        if (url.protocol === 'ws:' || url.protocol === 'wss:') {
            that._activeTransportConnections[url.href] = websocket(url.href, "h2", {
                // TODO, maybe enable perMessageDeflate in production or on debug??
                perMessageDeflate: that.debug === false
            });

        } else if(url.protocol === 'tcp:') {
            that._activeTransportConnections[url.href] = require('net').connect({
                'host' : url.hostname,
                'port' : url.port
            });
        } else {
            throw new Error('Unrecognized transport protocol: ' + url.protocol + ', for transport: ' + url.href);
        }
    }

    return that._activeTransportConnections[url.href];
};

confProto.addTransportUrl = function (url, transport) {
    url = parseUrl(url); // Enforce
    this._proxyMap[url.href] = transport;

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
    url = parseUrl(url); // Enforce
    delete this._proxyMap[url.href];
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
        pushUri = parseUrl(pushUrl);

    if (that.debug) {
        that._log.info('Opening h2 channel for Push Promises: ' + pushUrl);
    }

    var openH2StreamForPush, reopenH2StreamForPush, // expression not function,
        request,
        reconnectFailures = [],
        options = that.options,
        reconnectTimer =  null,
        opened = false,
        reopening = false;

    var transport = that.getTransport(proxyTransportUrl);

    reopenH2StreamForPush = function (err) {
        opened = false;
        that._log.info(pushUrl + " push channel closed.");

        // Clear pending revalidates 
        that.cache.clearRevalidates();

        if (err) {
            that._log.warn("Push channel stream error: " + err);
            reconnectFailures.push(err);

            // Clear urls attached to proxyTransportUrl
            if (options.accelerationStrategy === 'connected') {

                var proxyUrls = that.getTransportUrls(proxyTransportUrl);

                // Remove urls transport
                proxyUrls.forEach(that.removeTransportUrl.bind(that));

                // Restore urls for that transport once on opened again
                transport.once('open', function () {
                    that.addTransportUrls(proxyUrls, proxyTransportUrl);
                });

                // Emit connectFailure for given proxyTransportUrl
                that.emit('connectFailure', proxyTransportUrl);
            }

            if (options.reconnect && !reopening) {
                
                // Get min time between maximumReconnectInterval and reconnectFailures*reconnectInterval
                var reOpendelay = Math.min(
                    reconnectFailures.length * options.reconnectInterval, 
                    options.maximumReconnectInterval
                );
                
                that._log.info("Push channel stream will re-open in " + reOpendelay + "ms .");

                clearTimeout(reconnectTimer);
                reconnectTimer = setTimeout(
                    openH2StreamForPush,
                    reOpendelay
                );

            } else {
                that._log.warn("Push channel stream already reopening.");
            }
        }
    };

    openH2StreamForPush = function () {

        that._log.info("Push channel will open: " + pushUri.href);

        if (opened) {
            throw new Error("Server push stream already opened.");
        }

        reopening = true;
        opened = true;

        var request = http2.raw.request({
            hostname: pushUri.hostname,
            port: pushUri.port,
            path: pushUri.path,
            transportUrl: proxyTransportUrl,
            transport: transport,
            agent: that.agent
        }, function (response) {
            reopening = false;

            that._log.debug("Push channel opened: " + pushUri.href);
            
            response.on('finish', function (err) {
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
            that._log.debug("Push channel received: " + pushRequest);
            that.onPush(pushRequest);
        });

        request.end();

        return request;
    };

    request = openH2StreamForPush();

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
/*
{
    // Logger debugLevel true='info' or (info|debug|trace)
    "clientLogLevel": false,
    // Transport endpoint
    "transport": "wss://where-the-underlying-ws-transport-connects:443/",
    // Transport push path
    "push": "optional-path-that-is-opened-for-pushes",
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
        
    var that = this;

    // Decode config
    config = that.parseConfig(config);

    // Legacy with warning
    if (config.pushURL) {
        that._log.warn('XMLHttpRequest Http2-Cache configuration "pushURL" is now "push"');
        config.push = config.pushURL;
        delete config.pushURL;
    }

    // Update clientLogLevel
    if (config.hasOwnProperty('clientLogLevel')) {
        that.setDebugLevel(config.clientLogLevel);
        // Update option to reflect client state
        that.options.clientLogLevel = config.clientLogLevel;
    }

    // Lookup for defaultOptions keys in config
    keys(that.defaultOptions).forEach(function (configOption) {
        if (config.hasOwnProperty(configOption)) {
            // Create config.options if do not exit only if mapping match once at least
            config.options = config.options || {}; 
            config.option[configOption] = config[configOption];
        } 
    });

    // Merge config options
    if (config.hasOwnProperty('options')) {
        that.setOptions(config.options);
    }

    // Install transport
    if (config.hasOwnProperty('transport')) {
        
        // Add transport proxyfied urls 
        if (config.hasOwnProperty('proxy')) {
            that.addTransportUrls(config.proxy, config.transport);
        }

        // Connect transport to push url
        if (config.hasOwnProperty('push')) {
            that.openH2StreamForPush(parseUrl(config.push), config.transport);
        }
    }
};

// add config by url
confProto.fetchConfig = function (url) {
    // TODO, consider using semi-public API??
    var that = this;
    var xhr = new XMLHttpRequest();
    xhr._open('GET', url);
    that.configuring();
    xhr.addEventListener("load", function () {
        if (xhr.readyState === XMLHttpRequest.DONE) {
            var status = xhr.status;
            if (status !== 200) {
                // Prevent configuration to be stale on config load failure
                that.configured();
                throw new InvalidStateError('Failed to load configuration ' + url + ', status code: ' + status);
            } else {
                that.addConfig(xhr.response);
                that.configured();   
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
