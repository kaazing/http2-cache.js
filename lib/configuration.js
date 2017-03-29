var websocket = require('websocket-stream'),
    http2 = require('http2'),

    util = require('util'),
    EventEmitter = require('events').EventEmitter,

    InvalidStateError = require('./errors.js').InvalidStateError,
    RequestInfo = require('./cache.js').RequestInfo,

    parseUrl = require('url').parse,
    resolvePort = require("./utils.js").resolvePort,
    getOrigin = require("./utils.js").getOrigin;

//////////////////////////////////////////// Configuration ////////////////////////////////////////////
function Configuration(cache) {
    this._activeConfigurationCnt = 0;
    this._proxyMap = {};
    this._activeWSConnections = {};
    this.cache = cache;
    this.debug = true;
    EventEmitter.call(this);
}

util.inherits(Configuration, EventEmitter);

var confProto = Configuration.prototype;

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
    if (!this._activeWSConnections[url] || !this._activeWSConnections[url].writable) {
        if (this.debug) {
            console.log("Opening WS transport: " + url);
        }
        // TODO, maybe enable perMessageDeflate in production or on debug??
        this._activeWSConnections[url] = websocket(url, "http2", {perMessageDeflate: false});
    }
    return this._activeWSConnections[url];
};

confProto.getTransportUrl = function (origin) {
    return this._proxyMap[origin];
};

confProto.onPush = function (pushRequest, origin) {
    var self = this;
    this.cache.match(pushRequest).then(function (response) {
        if (response) {
            console.warn("Server pushed an already cached result or an un cache-able request: " + response);
            pushRequest.close();
        } else {
            pushRequest.on('response', function (response) {

                response.on('data', function (data) {
                    if (response.data) {
                        response.data += data;
                    } else {
                        response.data = data;
                    }
                });

                response.on('end', function () {
                    self.cache.put(requestInfo, response).catch(function(){
                        // NOOP
                    });
                });

                response.on('error', function (e) {
                    console.warn("Server push stream error: " + e);
                });
            });
            var requestInfo = origin ? new RequestInfo(pushRequest.method, origin + pushRequest.url, pushRequest.headers) : new RequestInfo(pushRequest.method, getOrigin(pushRequest) + pushRequest.url, pushRequest.headers);
        }
    });
};

// open h2 pull channel
confProto.openH2StreamForPush = function (hostname, port, path, transport, origin) {
    if (this.debug) {
        console.log('Opening h2 channel for pushing: ' + hostname + ':' + port + '/' + path);
    }
    var self = this;
    var request = http2.raw.request({
        hostname: hostname,
        port: port,
        path: path,
        createConnection: function () {
            return transport;
        }
    }, function (response) {
        response.on('finish', function () {
            console.warn('h2 pull stream closed, perhaps we should reopen: ' + hostname + ' ' + port + ' ' + path);
            // TODO progressive back off??
            // probably on request.on('error');
            this.openH2StreamForPush(hostname, port, path, transport, origin);
        });
    });

    // add to cache when receive pushRequest
    request.on('push', function (pushRequest) {
        self.onPush(pushRequest, origin, this.cache);
    });
    request.end();
};

// add config by json
confProto.addConfig = function (config) {
    config = JSON.parse(config);
    var proxyUrl = config.url;
    var proxyTransportUrl = config.options.transport;
    var proxyH2PushPath = config.options.h2PushPath;

    proxyUrl = parseUrl(proxyUrl);
    var origin = getOrigin(proxyUrl);

    this._proxyMap[origin] = proxyTransportUrl;

    if (proxyH2PushPath) {
        var wsTransport = this.getTransport(proxyTransportUrl);
        this.openH2StreamForPush(proxyUrl.hostname, resolvePort(proxyUrl), proxyH2PushPath, wsTransport, origin);
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
            this.fetchConfig(urls[i]);
        }
    } else {
        throw new SyntaxError('Invalid arg: ' + urls);
    }
};

module.exports = Configuration;
