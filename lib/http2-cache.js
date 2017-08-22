(function (root) {

    var Configuration = require('./configuration.js'),
        enableXHROverH2 = require('./xhr.js').enableXHROverH2;

    var configuration = new Configuration({
    	debug: false // true='log' or (log|debug|trace)
    });
    enableXHROverH2(XMLHttpRequest, configuration);

    // To update debug level after injection:
    //- XMLHttpRequest.configuration.setDebugLevel('debug');
    //- XMLHttpRequest.configuration.setDebugLevel('trace');

}(this));
