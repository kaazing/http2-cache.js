var Promise = require('bluebird');
var resolvePort = require("./utils.js").resolvePort;
var parseUrl = require("./utils.js").parseUrl;
var getOrigin = require("./utils.js").getOrigin;
var websocket = require('websocket-stream');
var http2 = require('http2');
var RequestInfo = require('./cache.js').RequestInfo;
var Cache = require('./cache.js').Cache;
var util = require('util');
var EventEmitter = require('events').EventEmitter;
var InvalidStateError = require('./utils').InvalidStateError;

/*
 * If configuration is taking place, wait on all requests
 */
function Configuration() {
    this.activeConfigurationCnt = 0;
    this.proxyMap = {};
    EventEmitter.call(this);
    this.activeWSConnections = {};
    this.cache = new Cache();
}

util.inherits(Configuration, EventEmitter);

var confProto = Configuration.prototype;

confProto.increment = function () {
    this.activeConfigurationCnt++;
};

confProto.decrement = function () {
    this.activeConfigurationCnt--;
    if (this.activeConfigurationCnt === 0) {
        this.emit('completed');
    }
};

confProto.isConfiguring = function () {
    return this.activeConfigurationCnt > 0;
};


confProto.getTransport = function (url) {
    if (!this.activeWSConnections[url] || !this.activeWSConnections[url].writable) {
        // TODO, maybe enable perMessageDeflate in production
        // console.log("Opening WS transport: " + url);
        this.activeWSConnections[url] = websocket(url, "http2", {perMessageDeflate: false});
    }
    return this.activeWSConnections[url];
};

confProto.getTransportUrl = function(origin){
    return this.proxyMap[origin];
};

// open h2 pull channel
confProto.openH2StreamForPush = function (hostname, port, path, transport, origin) {
    // console.log('Opening h2 channel for pushing: ' + originHostname + ':' + originPort + '/' +pullPath);
    var self = this;
    var request = http2.raw.request({
        hostname: hostname,
        port: port,
        path: path,
        transport: function () {
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

    this.proxyMap[origin] = proxyTransportUrl;

    if (proxyH2PushPath) {
        var wsTransport = this.getTransport(proxyTransportUrl);
        this.openH2StreamForPush(proxyUrl.hostname, resolvePort(proxyUrl), proxyH2PushPath, wsTransport, origin);
    }
};

// add config by url
confProto.fetchConfig = function (url) {
    var xhr = new XMLHttpRequest();
    xhr._open('GET', url);
    this.increment();
    var self = this;
    xhr.addEventListener("readystatechange", function () {
        if (xhr.readyState === XMLHttpRequest.DONE) {
            var status = xhr.status;
            if (status !== 200) {
                throw new InvalidStateError('Failed to load configuration ' + url + ', status code: ' + status);
            }
            self.addConfig(xhr.response);
            self.decrement();
        }
    }, true);
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

confProto.getCache = function () {
    return this.cache;
};

confProto.onPush = function(pushRequest, origin) {
    var self = this;
    this.cache.match(pushRequest).then(function (response) {
        console.warn("Server pushed an already cached result or an un cache-able response: " + response);
        pushRequest.close();
    }, function () {
        var requestInfo = origin ? new RequestInfo(pushRequest.method, origin + pushRequest.url) : new RequestInfo(pushRequest.method, getOrigin(pushRequest) + pushRequest.url);
        self.cache.put(requestInfo, new Promise(function (resolve, reject) {

            pushRequest.on('response', function (response) {

                response.on('data', function (data) {
                    if (response.data) {
                        response.data += data;
                    } else {
                        response.data = data;
                    }
                });

                response.on('end', function () {
                    resolve(response);
                });

                response.on('error', function (e) {
                    reject(e);
                });

            });
        }));
    });
};

module.exports = Configuration;
