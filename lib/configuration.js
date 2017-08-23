var websocket = require('websocket-stream'),
    http2 = require('node-http2'),
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
    var self = this;
    options = options || {};

    EventEmitter.call(this);
    
    self._activeConfigurationCnt = 0;
    self._proxyMap = {};
    self._activeTransportConnections = {};
            
    // Init debug/log
    self.debug = options.debug;
    self._log = logger.consoleLogger;

    self.setDebugLevel(options.debugLevel || options.debug);

    // Init Cache
    self.cache = options.cache || new Cache({
        debug: self.debug,
        log: self._log
    });
    self.cacheListener = new CacheListener(self);

    self.agent = new Agent({
        log: self._log
    });
        
    
}

util.inherits(Configuration, EventEmitter);

var confProto = Configuration.prototype;

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
    if (!this._activeTransportConnections[url] || !this._activeTransportConnections[url].writable) {
        if (this.debug) {
            this._log.info("Opening transport: " + url);
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
        }else{
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

    var proxyUrl = Object.keys(this._proxyMap).reduce(function (result, value) {
        // Check that transport url match beginning of url
        return url.href.indexOf(value) === 0 ? value : result;
    }, false);

    return proxyUrl && this._proxyMap[proxyUrl];
};

confProto.onPush = function (pushRequest) {
    var self = this;
    var origin = getOrigin(pushRequest.scheme + "://" + pushRequest.headers.host);
    pushRequest.href = origin + pushRequest.url;
    if (self.debug) {
        self._log.info("Received push promise for: " + pushRequest.href);
    }

    pushRequest.on('response', function (response) {
        // TODO match or partial move to _sendViaHttp2 xhr.js to avoid maintain both
        response.on('data', function (data) {
            response.data = mergeTypedArrays(response.data, data);
        });

        var requestInfo = origin ? new RequestInfo(pushRequest.method, origin + pushRequest.url, pushRequest.headers) :
            new RequestInfo(pushRequest.method, getOrigin(pushRequest) + pushRequest.url, pushRequest.headers);
        response.on('end', function () {
            self.cache.put(requestInfo, response).catch(function () {
                // NOOP
            });
        });

        response.on('error', function (e) {
            self._log.warn("Server push stream error: " + e);
        });
    });

};

// open h2 pull channel
confProto.openH2StreamForPush = function (pushUrl, proxyTransportUrl) {
    if (this.debug) {
        this._log.info('Opening h2 channel for Push Promises: ' + pushUrl);
    }
    var self = this,
        transport = this.getTransport(proxyTransportUrl);

    var request = http2.raw.request({
        agent: self.agent,
        hostname: pushUrl.hostname,
        port: pushUrl.port,
        path: pushUrl.path,
        transportUrl: proxyTransportUrl,
        transport: transport
    }, function (response) {
        if(self.debug){
            self._log.info("push channel opened: " + pushUrl);
        }
        var reopen = function () {
            self._log.warn(pushUrl + " push channel closed reopening");
            // TODO progressive back off??
            // probably on request.on('error');
            self.openH2StreamForPush(pushUrl, proxyTransportUrl);
        };
        response.on('finish', reopen);
        response.on('error', reopen);
        response.on('open', reopen);
    });

    // add to cache when receive pushRequest
    request.on('push', function (pushRequest) {
        self.onPush(pushRequest);
    });
    request.end();
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
        
    // Decode config
    config = this.parseConfig(config);

    // Legacy with warning
    if (config.pushURL) {
        this._log.warn('XMLHttpRequest Http2-Cache configuration "pushURL" is now "push"');
        config.push = config.pushURL;
        delete config.pushURL;
    }

    var proxyTransportUrl = config.transport;
    var pushUrl = config.push;
    this.clientLogLevel = this.clientLogLevel || config.clientLogLevel;
    this.cache.setDebug(this.clientLogLevel);

    var cntI = config.proxy.length;
    for(var i = 0; i < cntI; i++) {
        this.addTransportUrl(config.proxy[i], proxyTransportUrl);
    }

    if (pushUrl) {
        this.openH2StreamForPush(parseUrl(defaultPort(pushUrl)), proxyTransportUrl);
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
