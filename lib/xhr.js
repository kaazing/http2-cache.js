var Promise = require('bluebird');
var http2 = require('http2');
var redefine = require('./utils').redefine;
var dataToType = require('./utils').dataToType;
var RequestInfo = require('./cache.js').RequestInfo;
var parseUrl = require('./utils').parseUrl;
var getOrigin = require('./utils').getOrigin;
var InvalidStateError = require('./utils').InvalidStateError;

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

function enableXHROverH2(xhrProto, configuration){

    Object.defineProperty(XMLHttpRequest, 'proxy', {
        enumerable: true,
        configurable: false,
        value: function(configs){
            configuration.configure(configs);
        }
    });

    redefine(xhrProto, "_open", XMLHttpRequest.prototype.open);

    redefine(xhrProto, 'open', function (method, url, async, username, password) {
        // https://xhr.spec.whatwg.org/#the-open%28%29-method
        method = method.toUpperCase();
        if (HTTP_METHODS.indexOf(method.toUpperCase()) < 0) {
            throw new SyntaxError("Invalid method: " + method);
        }
        // parse so we know it is valid
        var parseurl = parseUrl(url);

        if (async === 'undefined') {
            async = true;
        } else if (async === false) {
            throw new SyntaxError("Synchronous is not supported");
        }

        this.__method = method;
        this.__url = url;
        this.__async = async;
        this.__headers = {};
        if (parseurl.host && username && password) {
            this.__username = username;
            this.__password = password;
        }

        var self = this;

        if (self.onreadystatechange) {
            self.__orscDelegate = self.onreadystatechange;
            self.onreadystatechange = function () {
                if (self.__lastreadystate !== 1 || self.readyState !== 1) {
                    self.__lastreadystate = self.readyState;
                    self.__orscDelegate();
                }
            };
        }

        this._changeState(XMLHttpRequest.OPENED);
    });

    redefine(xhrProto, "_setRequestHeader", XMLHttpRequest.prototype.setRequestHeader);

    redefine(xhrProto, 'setRequestHeader', function (name, value) {
        // https://xhr.spec.whatwg.org/#the-setrequestheader%28%29-method
        // We don't check state here because it is deferred
        if (this._state !== "opened") {
            throw new InvalidStateError("Can not setRequestHeader on unopened XHR");
        }
        var lcname = name.toLowerCase();
        if (HTTP2_FORBIDDEN_HEADERS.indexOf(lcname) > 0 || (lcname.lastIndexOf('sec-', 0) === 0 && lcname.replace('sec-', '').indexOf(lcname) > 0) || (lcname.lastIndexOf('proxy-', 0) === 0 && lcname.replace('proxy-', '').indexOf(lcname) > 0))
        {
            throw new SyntaxError("Forbidden Header: " + name);
        }
        this.__headers[name] = value;
    });

    redefine(xhrProto, "_send", XMLHttpRequest.prototype.send);

    redefine(xhrProto, '_changeState', function (s, options) {
        var self = this;
        switch (s) {
            case XMLHttpRequest.UNSENT:
                this._state = s;
                redefine(this, 'readyState', 0);
                if (this.onreadystatechange) {
                    this.onreadystatechange();
                }
                break;
            case XMLHttpRequest.OPENED:
                this._state = s;
                redefine(this, 'readyState', 1);
                if (this.onreadystatechange) {
                    this.onreadystatechange();
                }
                break;
            case XMLHttpRequest.HEADERS_RECEIVED:
                this._state = s;
                // assert options.response TODO
                var statusCode = options.response.statusCode;
                redefine(this, 'status', statusCode);
                var statusMessage = http2.STATUS_CODES[statusCode];
                if (statusMessage) {
                    redefine(this, 'statusText', statusMessage);
                } else {
                    console.warn('Unknown STATUS CODE: ' + statusCode);
                }
                redefine(this, 'readyState', 2);
                if (this.onreadystatechange) {
                    this.onreadystatechange();
                }
                break;
            case XMLHttpRequest.LOADING:
                this._state = s;
                // assert options.response && options.data TODO
                redefine(this, 'response', function () {
                    return dataToType(options.response.data, self.responseType);
                }());
                redefine(this, 'readyState', 3);
                if (this.onreadystatechange) {
                    this.onreadystatechange();
                }
                break;
            case XMLHttpRequest.DONE:
                this._state = s;
                // assert options.response && options.data TODO
                redefine(this, 'readyState', 4);
                if (this.onreadystatechange) {
                    this.onreadystatechange();
                }
                break;
            default:
                throw new InvalidStateError("Unexpect XHR _changeState: " + s);
            // https://xhr.spec.whatwg.org/#suggested-names-for-events-using-the-progressevent-interface
            // case "loadstart":
            //     break;
            // case "progress":
            //     break;
            // case "error":
            //     break;
            // case "abort":
            //     break;
            // case "error":
            //     break;
            // case "timeout":
            //     break;
            // case "load":
            //     break;
            // case "loadend":
            //     break;
            // default:
            //     var msg = "Unexpect XHR _changeState: " + s;
            //     console.error(msg);
            //     throw new Error(msg);
        }
    });

    redefine(xhrProto, '_onCachedResponse', function (response) {
        this._changeState(XMLHttpRequest.HEADERS_RECEIVED, {'response': response});
        this._changeState(XMLHttpRequest.LOADING, {'response': response});
        this._changeState(XMLHttpRequest.DONE, {'response': response});
    });

    redefine(xhrProto, 'sendViaHttp2', function send0(destination, body, proxyTransportUrl) {
        var self = this;
        var requestInfo = new RequestInfo(self.__method, getOrigin(destination.href) + destination.path);
        configuration.getCache().match(requestInfo).bind(self).then(
            self._onCachedResponse,
            function () {
                var self = this;
                // Need to make the request your self
                configuration.cache.put(requestInfo, new Promise(function (resolve, reject) {
                    if (body) {
                        // https://xhr.spec.whatwg.org/#the-send%28%29-method
                        if (body instanceof HTMLElement) {
                            if (!self.__headers['Content-Encoding']) {
                                self.__headers['Content-Encoding'] = 'UTF-8';
                            }
                            if (!self.__headers['Content-Type']) {
                                self.__headers['Content-Type'] = 'text/html; charset=utf-8';
                            }
                        } else {
                            // only other option in spec is a String
                            if (!self.__headers['Content-Encoding']) {
                                self.__headers['Content-Encoding'] = 'UTF-8';
                            }
                        }
                    }
                    var request = http2.raw.request({
                        // protocol has already been matched by getting transport url
                        // protocol: destination.protocol,
                        hostname: destination.hostname,
                        port: destination.port,
                        method: self.__method,
                        path: destination.path,
                        headers: self.__headers,
                        // auth: self.__headers // TODO AUTH
                        // TODO, change transport to createConnection
                        transport: function () {
                            return configuration.getTransport(proxyTransportUrl);
                        }
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
                            resolve(response);
                            self._changeState(XMLHttpRequest.DONE);
                        });
                    });

                    request.on('error', function (e) {
                        // TODO, handle error
                        // self._changeState('error');
                        reject(e);
                    });

                    // add to cache when receive pushRequest
                    request.on('push', configuration.onPush);

                    if (body) {
                        request.end(body);
                    } else {
                        request.end();
                    }
                }));
            }
        );
    });

    redefine(xhrProto, 'send', function (body) {
        var self = this;
        if (configuration.isConfiguring()) {
            // console.log("Sending XHR via native stack");
            configuration.once('completed', function () {
                self.send(body);
            });
        } else {
            var destination = parseUrl(this.__url);
            var o = getOrigin(destination);
            var proxyTransportUrl = configuration.getTransportUrl(o);
            if (proxyTransportUrl) {
                self.sendViaHttp2(destination, body, proxyTransportUrl);
            } else {
                this._open(this.__method,
                    this.__url,
                    this.__async,
                    this.__username,
                    this.__password);
                // TODO set headers
                this._send(body);
            }

        }
    });

    redefine(xhrProto, '_state', 'unsent');
}

module.exports = {
    enableXHROverH2: enableXHROverH2
};