/* global XMLHttpRequest */

module.exports = function Http2CacheClientInstance(xhr) {

	var Configuration = require('./configuration.js'),
		enableXHROverH2 = require('./xhr.js').enableXHROverH2;

	enableXHROverH2(xhr, new Configuration({
		debug: false // true='info' or (info|debug|trace)
	}));

	return xhr;

};


