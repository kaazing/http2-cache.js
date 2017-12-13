/* global XMLHttpRequest */
(function (root) {

    if (typeof XMLHttpRequest === 'undefined') {
        throw new Error('XMLHttpRequest is not supported.');
    }

    if (typeof XMLHttpRequest.configuration === 'undefined') {

        var Configuration = require('./configuration.js'),
            enableXHROverH2 = require('./xhr.js').enableXHROverH2;

        enableXHROverH2(XMLHttpRequest, new Configuration({
            debug: false // true='info' or (info|debug|trace)
        }));

        // To update debug level after injection:
        //- XMLHttpRequest.configuration.setDebugLevel('info');
        //- XMLHttpRequest.configuration.setDebugLevel('debug');
        //- XMLHttpRequest.configuration.setDebugLevel('trace');
    }

}(this));
