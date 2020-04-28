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
  debugLevel: 'log', // 'log|debug|trace'
  log: console.log,
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
    return this; 
  },
  // Displayed when debugLevel is trace only
  trace: function (data, ctx) {
    var debug = console.debug || console.info;
    if (consoleLogger.debugLevel === 'trace') {
      return consoleLogger.debug(data, ctx);
    } 
    return this; 
  },
  // Trace only
  child: function(msg) {
    if (consoleLogger.debugLevel === 'trace') {
      return console.info(msg);
    } 
    return this; 
  }
};

module.exports = {
  consoleLogger: consoleLogger,
  defaultLogger: defaultLogger
};