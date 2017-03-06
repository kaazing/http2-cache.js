(function () {

    var Cache = require('./cache.js');
    var Configuration = require('./configuration.js');
    var enableXHROverH2 = require('./xhr.js').enableXHROverH2;

    var cache = new Cache();
    var configuration = new Configuration(cache);

    enableXHROverH2(XMLHttpRequest.prototype, configuration);
    // TODO enable fetch over HTTP2

}).call(this);
