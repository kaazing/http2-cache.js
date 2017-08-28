
var http = require('http');

var getWSTransportServer = require('./../test/test-utils').getWSTransportServer,
    getHTTPConfigServer = require('./../test/test-utils').getHTTPConfigServer;

var httpServers = {},
	socketServers = {},

http.createServer(function (request, response) {

    var path = request.url,
    	params = {
    		config: {},
    		port: 8080
    	};
    
    if (path === '/socketServer/create') {

    } else if (path === '/socketServer/close') {

    } else if (path === '/httpServer/create') {

    } else if (path === '/httpServer/close') {
    	
    } else {
        console.warn("Request for unknown path: " + path);
        response.writeHead(404);
        response.end("Not Found");
    }
});
configServer.listen(options.port, function (){
    console.log("Listening on " + options.port);
});