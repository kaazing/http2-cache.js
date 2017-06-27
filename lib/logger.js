// Logging
// -------

// Logger shim, used when no logger is provided by the user.
function noop() {}
var defaultLogger = {
  fatal: noop,
  error: noop,
  warn : noop,
  info : noop,
  debug: noop,
  trace: noop,

  child: function() { return this; }
};

var consoleLogger = {
  fatal: console.error,
  error: console.error,
  warn : console.warning || console.info,
  info : console.info,
  debug: console.debug || console.info,
  trace: console.trace,

  child: function(info) { 
  	console.info(info);
  	return this; 
  }
};

module.exports = {
	consoleLogger: consoleLogger,
	defaultLogger: defaultLogger
};