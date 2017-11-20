var url = require('url');
var http2 = require('http2.js');
var websocket = require('websocket-stream');
var Agent = require('../lib/agent').Agent;
var logger = require('../lib/logger');
var parseUrl = require('../lib/utils').parseUrl;

function Client(pushUri, transportUri) {
    var self = this;
    self.state = "INIT";
    self.pushUri = pushUri;
    self.transportUri = transportUri;

    self.transport = websocket(transportUri, "h2", {
        perMessageDeflate : this.debug === false
    });

    self.transport.on('close', function () {
        self.state = "CLOSE (transport close)";
    });

    self._log = logger.consoleLogger;

    self.agent = new Agent({
        log : self._log
    });

    self.cache = {};
    self.intervals = [];
    self.urlStats = {};

    self.openPushPromiseStream();
}

var cp = Client.prototype;

cp.onPush = function (pushRequest) {
    var self = this;
    var requestPath = pushRequest.url.path;
    self.cache[requestPath] = "revalidating";

    pushRequest.on('end', function () {
        self.cache[requestPath] = "not-revalidating";
    });

    pushRequest.on('error', function () {
        self.cache[requestPath] = "not-revalidating";
    });
};

cp.openPushPromiseStream = function () {
    var self = this;

    self._log.info("Push channel will open: " + self.pushUri.href);

    var request = http2.raw.request({
        hostname : self.pushUri.hostname,
        port : self.pushUri.port,
        path : self.pushUri.path,
        transportUrl : self.transportUri,
        transport : self.transport,
        agent : self.agent
    }, function (response) {
        self._log.info("Push channel opened: " + self.pushUri.href);

        response.on('data', function (data) {
            self._log.info("data is: " + data);
        });

        response.on('finish', function () {
            // TODO consider throwing hard exception?
            self.state = "FINISH (push finish)\"";
        });

        response.on('error', function () {
            // TODO consider throwing hard exception?
            self.state = "ERROR (push error)";
        });

        response.on('open', function () {
            self.state = "RUNNING";
        });

    });

//    request.on('response', function(response) {
//        self._log.info("respone is: " + response);
//      });

    request.on('push', function (pushRequest) {//where does pushRequest come from?
        self._log.info("state is: " + self.state);
        self.onPush(pushRequest);
    });

    request.end();
};

cp.request = function (url) {
    var self = this;
    var stats = self.urlStats[url.path];
    if (!stats) {
        stats = self.urlStats[url.path] = {};
    }
    // TODO start time
    if (self.cache[url.path] === "revalidating") {
        // TODO record cache hit
    } else {
        // TODO record cache miss

        var request = http2.raw.request({
            hostname : url.hostname,
            port : url.port,
            path : url.path,
            transportUrl : self.transportUri,
            transport : self.transport,
            agent : self.agent
        }, function (response) {

            response.on('finish', function () {
                // TODO end time and record response //
                stats['success'] = stats['success'] ? stats['success']++ : 1;
            });

            response.on('error', function () {
                stats['error'] = stats['error'] ? stats['error']++ : 1;
                self.state = "ERROR (push error)";
            });

            response.on('open', function () {

            });

        });

        request.on('push', function (pushRequest) {//where does pushRequest come from?
            self.onPush(pushRequest);
        });

        request.end();
    }
};

cp.poll = function (url, interval) {
    var self = this;
    self.intervals[url.path] = setInterval(function () {
        self.request(url);
    }, interval);
};

var NUM_OF_CLIENTS = 1;
var pushUri = parseUrl("https://rest-accelerator.example.com:8081/event-stream");
var transportUri = parseUrl("wss://rest-accelerator.example.com:8081/");
var testURL1 = parseUrl("https://origin-server.example.com:8080/sizeof100");
var clients = [];

for (var i = 0; i < NUM_OF_CLIENTS; i++) {
    // init
    clients.push(new Client(pushUri, transportUri));
}

for (var i = 0; i < NUM_OF_CLIENTS; i++) {
    // init
    clients[i].poll(testURL1, 5000);
}

function processResults() {
    for (var i = 0; i < NUM_OF_CLIENTS; i++) {
        var client = clients[i];
        if (client.state === "RUNNING") {
            // TODO get stats
        } else {
            // TODO error
        }
    }
}

setTimeout(function () {
    processResults();
});