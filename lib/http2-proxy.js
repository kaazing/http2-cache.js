(function () {

    var Configuration = require('./configuration.js');
    var enableXHROverH2 = require('./xhr.js').enableXHROverH2;

    var configuration = new Configuration();
    console.log(enableXHROverH2);
    enableXHROverH2(XMLHttpRequest.prototype, configuration);
    // TODO enable fetch over HTTP2

}).call(this);
