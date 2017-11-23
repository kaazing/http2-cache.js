
var child_process = require('child_process');
var argv = process.argv;

var action = argv[2];
if (action === 'spawn') {	

	var spawn = require('child_process').spawn;
	var defaultNbProcess = 2,
		nbProcess = parseInt(argv[3], 10) || defaultNbProcess;

	while (nbProcess--) {
		// TODO pass argv
		
	    var client = spawn('node', ['bin/http2-cache', 'client']);
		client.stdout.on('data', function (data) {
		  console.log('stdout: ' + data.toString());
		});

		client.stderr.on('data', function (data) {
		  console.log('stderr: ' + data.toString());
		});

		client.on('exit', function (code) {
		  console.log('child process exited with code ' + code.toString());
		});
	}

} else if (action === 'server') {

	var http = require('http'),
		http2 = require('http2.js'),
    	websocket = require('websocket-stream');

	var options = {
		port: 7080
	};

	var http2Server = http2.raw.createServer({
        transport: function (options, start) {

            var lastSocketKey = 0;
            var socketMap = {};
            var httpServer = http.createServer();
            options.server = httpServer;

            var res = websocket.createServer(options, start);
            res.listen = function (options, cb) {
                var listener = httpServer.listen(options, cb);
                listener.on('connection', function (socket) {
                    /* generate a new, unique socket-key */
                    var socketKey = ++lastSocketKey;
                    /* add socket when it is connected */
                    socketMap[socketKey] = socket;
                    socket.on('close', function () {
                        /* remove socket when it is closed */
                        delete socketMap[socketKey];
                    });
                });
            };

            res.close = function (cb) {
                Object.keys(socketMap).forEach(function (socketKey) {
                    socketMap[socketKey].destroy();
                });
                httpServer.close(cb);
            };
            return res;
        }
    }, function (request, response) {
    	console.log(request)

    });

    http2Server.listen(options.port, function (){
        console.log("Listening on " + options.port);
    });  

} else if (action === 'client') {	

	var defaultOriginUrl = 'http://localhost:7080',
		defaultPushUrl = 'http://localhost:7080',
		defaultRestAccelUrl = 'ws://localhost:7081/',
		originUrl = argv[3] || defaultOriginUrl,
		restAccelUrl = argv[4] || defaultRestAccelUrl,
		pushUrl = argv[5] || defaultPushUrl;

	/* jshint ignore:start */
	if (typeof XMLHttpRequest === 'undefined') {
	    XMLHttpRequest = require("xhr2").XMLHttpRequest;   
	}
	/* jshint ignore:end */
	require("../lib/http2-cache");

	XMLHttpRequest.proxy([{
	    'transport': restAccelUrl,
	    'push': pushUrl,
	    'proxy': [
	        originUrl
	    ]
	}]);

	var xhr = new XMLHttpRequest();
	xhr.onreadystatechange = function () {
		console.log('readyState', xhr.readyState);
		if (xhr.readyState === 4 && xhr.status === 200) {

			// TODO display
			console.log('responseText', xhr.responseText);

			// Exit with ok
			process.exit(0);
		}
	};

	// Display better error
	xhr.onerror = function (err) {
		console.error(err);

		// Exit with error	
		process.exit(1);
	};

	xhr.open('GET', originUrl, true);
	xhr.send(null);	
}

