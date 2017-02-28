(function () {
    // TODO consider adding montage collections to dependency (map, weak map, ie 10 and 11)

    const url = require('url');
    const http2 = require('http2');
    const websocket = require('websocket-stream');

    const cache = {};
    const activeWSConnections = {};

    // can't respond to requests when loading config(s), ie numOfConfigurations > 0
    var numOfConfigurations = 0;

    // re-use ws connections to same url
    function getActiveWSConnection(url) {
        if (!activeWSConnections[url] || !activeWSConnections[url].writable) {
            // TODO, maybe enable perMessageDeflate in production
            // console.log("Opening WS transport: " + url);
            activeWSConnections[url] = websocket(url, "http2", {perMessageDeflate: false});
        }
        return activeWSConnections[url];
    }

    function handlePush(pushRequest) {
        // console.log("Received push: " + pushRequest);
        var key = originHostname + ':' + originPort + '/' + pushRequest.url;
        cache[key] = {request: pushRequest};
        cache[key]['response'] = null;
        cache[key]['data'] = null;

        // set result of cache on response
        pushRequest.on('response', function (response) {
            cache[key]['response'] = response;

            response.on('data', function (data) {
                console.log("DPW to fix: got data!!");
                cache[key]['body'] = data.toString();
            });


            // remove from cache when stream is closed?
            // TODO consider removal from cache, when stream finishes
            // response.on('finish', function () {
            //     cache[key] = {};
            // });
        });

    }

    // open h2 pull channel
    function openH2Pull(originHostname, originPort, pullPath, transport){
        // console.log('Opening h2 channel for pushing: ' + originHostname + ':' + originPort + '/' +pullPath);
        var request = http2.raw.request({
            hostname: originHostname,
            port: originPort,
            path: pullPath,
            transport: function () {
                return transport;
            }
        }, function (response) {
            response.on('data', function(){

            });
            response.on('finish', function () {
                // TODO, reopen stream perhaps
                console.warn('h2 pull stream closed, perhaps we should reopen: ' + originHostname + ' ' + originPort + ' ' + pullPath);
            });
        });
        // add to cache when receive pushRequest
        request.on('push', handlePush);
        request.end();
    }

    function getOriginPort(u){
        var parse = url.parse(u);
        var originPort = parse.port;
        if(originPort == null){
            var s = parse.scheme;
            if(s === "ws" || s === "http"){
                originPort = 80;
            }else{
                originPort = 443;
            }
        }
        return originPort;
    }

    // add config by json
    function addConfig(config) {
        config = JSON.parse(config);
        var proxyUrl = config.url;
        var proxyTransportUrl = config.options.transport;
        var proxyH2PushPath = config.options.h2PushPath;

        if (proxyH2PushPath) {
            // TODO pre create
            var wsTransport = getActiveWSConnection(proxyTransportUrl);
            openH2Pull(url.parse(proxyUrl).hostname, getOriginPort(proxyUrl), proxyH2PushPath, wsTransport);
        }
    }

    // add config by url
    function addConfigByUrl(url) {
        var xhr = new XMLHttpRequest();
        xhr.open('GET', url);
        numOfConfigurations++;
        xhr.addEventListener("readystatechange", function () {
            if (xhr.readyState === XMLHttpRequest.DONE) {
                var status = xhr.status;
                numOfConfigurations--;
                if (status !== 200) {
                    throw new Error('Failed to load configuration ' + url + ', status code: ' + status);
                }
                addConfig(xhr.response);
            }
        }, true);
        xhr.send();
    }

    // add configs by an array of urls
    function addConfigs(urls) {
        if (urls instanceof Array) {
            var cntI = urls.length;
            for (var i = 0; i < cntI; i++) {
                addConfigByUrl(urls[i]);
            }
        } else {
            throw new Error('proxy(): Invalid arg.');
        }
    }

    Object.defineProperty(XMLHttpRequest, 'proxy', {
        enumerable: true,
        configurable: false,
        value: addConfigs
    });

}
).call(this);