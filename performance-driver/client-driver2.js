var http2 = require('http2.js');

function Client(pushUri, transportUri){
    var self = this;
    self.state = "INIT";
    self.pushUri = pushUri;
    self.transportUri = transportUri;

    self.transport = websocket(transportUri, "h2", {
        perMessageDeflate: this.debug === false
    });

    self.transport.on('close', function () {
        self.state = "ERROR (transport close)"
    });

    self.agent = new Agent({
        log: self._log
    });

    self.cache = {};
    self.intervals = [];
    self.urlStats = {};

    self.openPushPromiseStream();
}

cp = Client.prototype;

cp.onPush = function(pushRequest)
{
    var self = this;
    var requestPath = pushRequest.url.path;
    self.cache[requestPath] = "revalidating";

    pushRequest.on('end', function(){
        self.cache[requestPath] = "not-revalidating";
    });

    pushRequest.on('error', function(){
        self.cache[requestPath] = "not-revalidating";
    });
};

cp.openPushPromiseStream = function(){
    var self = this;

    var request = http2.raw.request({
        hostname: pushUri.hostname,
        port: pushUri.port,
        path: pushUri.path,
        transportUrl: transportUri,
        transport: transport,
        agent: self.agent
    }, function (response) {

        response.on('finish', function () {
            // TODO consider throwing hard exception?
            self.state = "ERROR (push finish)\"";
        });

        response.on('error', function () {
            // TODO consider throwing hard exception?
            self.state = "ERROR (push error)";
        });

        response.on('open', function () {
            self.state = "RUNNING";
        });

    });

    request.on('push', function(pushRequest) {
        self.onPush(pushRequest);
    });
};

cp.request = function(url)
{
    var self = this;
    var stats = self.urlStats[url.path];
    if (!stats)
    {
        stats = self.urlStats[url.path] = {};
    }
    // TODO start time

    if (self.cache[url.path] === "revalidating")
    {
        // TODO record cache hit
    }
    else
    {
        // TODO record cache miss

        var request = http2.raw.request({
            hostname: url.hostname,
            port: url.port,
            path: url.path,
            transportUrl: transportUri,
            transport: transport,
            agent: self.agent
        }, function (response) {

            response.on('finish', function () {
                // TODO end time and record response //
                stats['success'] = stats['success'] ? stats['success']++ : 1;
                self.state = "ERROR (push finish)\"";
            });

            response.on('error', function () {
                stats['error'] = stats['error'] ? stats['error']++ : 1;
                self.state = "ERROR (push error)";
            });

            response.on('open', function () {

            });

        });

        request.on('push', function(pushRequest) {
            self.onPush(pushRequest);
        });
    }
};

cp.poll = function(url, interval)
{
    var self = this;
    self.intervals[url.path] = setInterval(
        function () {
            self.request(url)
        }, interval
    )
};

var parseUri = function (href) {
    var uri = (href instanceof url.constructor) ? href : url.parse(href);
    uri.port = resolvePort(uri);


    if (
        uri.hostname === null &&
        typeof window !== 'undefined'
    ) {
        uri.protocol = window.location.protocol;
        uri.hostname = window.location.hostname;
        uri.port = window.location.port;
        uri.host = uri.hostname + ':' + uri.port;
        uri.href = uri.protocol + "//" + uri.host + uri.href;
    }

    // Define uri.origin
    uri.origin = uri.hostname + ":" + uri.port;

    // Check if host match origin (example.com vs example.com:80)
    if (uri.host !== uri.origin) {
        // Fix href to include default port
        uri.href = uri.href.replace(uri.protocol + "//" + uri.host, uri.protocol + "//" + uri.origin);
        // Fix host to include default port
        uri.host = uri.hostname + ":" + uri.port;
    }

    return uri;
};

var NUM_OF_CLIENTS = 2;
var pushUri = parseUri("https://");
var transportUri = parseUri("wss://");
var testURL1 = parseUri("wss://");
var clients = [];

for (var i = 0; i < NUM_OF_CLIENTS; i++)
{
    // init
    clients.push(new Client(pushUri, transportUri));
}

for (var i = 0; i < NUM_OF_CLIENTS; i++)
{
    // init
    clients[i].poll(testURL1, 2000);
}
for (var i = 0; i < NUM_OF_CLIENTS; i++)
{
    // init
    clients[i].poll(testURL2, 2000);
}

function processResults(){
    for(var i = 0; i < NUM_OF_CLIENTS; i++)
    {
        var client = clients[i];
        if (client.state == "RUNNING")
        {
            // TODO get stats
        }
        else {
            // TODO error
        }
    }
}

setTimeout(function(){
    processResults();
});