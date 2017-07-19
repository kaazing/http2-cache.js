(function (root) {

    var Configuration = require('./configuration.js'),
        enableXHROverH2 = require('./xhr.js').enableXHROverH2;

    var configuration = new Configuration({
    	debug: true // true='info' or (info|debug|trace)
    });
    enableXHROverH2(XMLHttpRequest, configuration);

    // To update debug level after injection:
    //- XMLHttpRequest.configuration.setDebugLevel('debug');
    //- XMLHttpRequest.configuration.setDebugLevel('trace');

}(this));
