var http2 = require('http2'),
	logger = require('./logger');

// TODO extend AGENT

function Http2CacheAgent() {
	http2.Agent.apply(this, arguments);
}

Http2CacheAgent.prototype = Object.create(http2.Agent.prototype, {
	// TODO override http2.Agent
});

exports.Agent = Http2CacheAgent;