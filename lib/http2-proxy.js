(function () {

    var Cache = require('./cache.js').Cache,
        Configuration = require('./configuration.js'),
        enableXHROverH2 = require('./xhr.js').enableXHROverH2;

    var cache = new Cache();
    var configuration = new Configuration(cache);

    enableXHROverH2(XMLHttpRequest.prototype, configuration);

}).call(this);
