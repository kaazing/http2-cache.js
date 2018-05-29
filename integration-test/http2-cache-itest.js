/* global console */


describe('http2-proxy', function () {
    
    it('should attempt proxyfied GET request and fallback', function (done) {

        XMLHttpRequest.configuration.options.accelerationStrategy = 'connected';
      
        XMLHttpRequest.proxy(["http://localhost:7080/config"]);
        var xhr = new XMLHttpRequest();

        var statechanges = 0;
        xhr.onloadstart = function () {
            xhr.onprogress = function () {
                xhr.onload = function () {
                    xhr.onloadend = function () {
                        done();
                    };
                };
            };
        };

        xhr.onerror = function (err) {
             throw err;
        };

        xhr.open('GET', 'http://localhost:7080/path/proxy', true);
        xhr.send(null);
    });

    it('should attempt proxyfied GET request and trigger error', function (done) {

        XMLHttpRequest.configuration.options.accelerationStrategy = 'always';
      
        XMLHttpRequest.proxy(["http://localhost:7080/config"]);
        var xhr = new XMLHttpRequest();

        var statechanges = 0;
        xhr.onloadstart = function () {
            xhr.onprogress = function () {
                xhr.onload = function () {
                    xhr.onloadend = function () {
                        throw new Error('Should not reach onloadend');
                    };
                };
            };
        };

        xhr.onerror = function (err) {
            done();
        };

        xhr.open('GET', 'http://localhost:7080/path/proxy', true);
        xhr.send(null);
    });

});

