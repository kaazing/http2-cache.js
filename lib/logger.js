/* global console */

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
  debugLevel: 'info', // 'info|debug|trace'
  fatal: console.error,
  error: console.error,
  warn : console.warning || console.info,
  info : function (data, ctx) {
    var debug = console.debug || console.info;
    if (
      consoleLogger.debugLevel === 'info' || 
        consoleLogger.debugLevel === 'trace' || 
          consoleLogger.debugLevel === 'debug'
    ) {
          var args = (typeof ctx === 'string' ? [ctx, data] : arguments);
          debug.apply(console, args);
    } 
  },
  debug: function (data, ctx) {
    var debug = console.debug || console.info;
    if (
      consoleLogger.debugLevel === 'trace' || 
        consoleLogger.debugLevel === 'debug'
    ) {
          var args = (typeof ctx === 'string' ? [ctx, data] : arguments);
          debug.apply(console, args);
    } 
  },
  // Trace only
  trace: function (data, ctx) {
    var debug = console.debug || console.info;
    if (consoleLogger.debugLevel === 'trace') {
      consoleLogger.debug(data, ctx);
    } 
  },
  // Trace only
  child: function(msg) {
    if (consoleLogger.debugLevel === 'trace') {
      console.info(msg);
    } 
  	return this; 
  }
};

module.exports = {
	consoleLogger: consoleLogger,
	defaultLogger: defaultLogger
};