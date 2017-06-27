(function () {

    var Configuration = require('./configuration.js'),
        enableXHROverH2 = require('./xhr.js').enableXHROverH2;

    var configuration = new Configuration({
    	debug: true
    });
    enableXHROverH2(XMLHttpRequest.prototype, configuration);

}).call(this);
