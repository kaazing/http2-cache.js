/* globals chai:true */
var assert = chai.assert;

describe('http2-proxy', function () {

    describe('accelerationStrategy', function () {
        
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

    describe('http2-proxy encoding', function () {

        it('should GET request with arraybuffer and render image', function (done) {
            var xhr = new XMLHttpRequest();
            xhr.responseType = 'arraybuffer';

            var statechanges = 0;
            xhr.onloadstart = function () {
                xhr.onprogress = function () {
                    xhr.onload = function () {
                        xhr.onloadend = function () {
                            assert.equal(xhr.status, 200);
                            assert.equal(typeof xhr.response, 'object');
                            assert.equal(xhr.getResponseHeader('content-type'), 'image/png; charset=utf-8');

                            var blob = new Blob([xhr.response], {type: 'image/png'});
                            var url = URL.createObjectURL(blob);

                            var img = document.createElement('img');
                            img.src = url;
                            img.onload = function () {
                                done();
                            };
                            img.onerror = function () {
                                throw Error('Unable to laod image');
                            };
                            document.body.appendChild(img);
                        };
                    };
                };
            };

            xhr.onerror = function (err) {
                 throw err;
            };  

            var imageUrl = './assets/cc83018365788ae445c3afd31aca20be.png';
            xhr.open('GET', imageUrl, true);
            xhr.send(null);
        });

        it('should GET request with blob and render image', function (done) {
            var xhr = new XMLHttpRequest();
            xhr.responseType = 'blob';

            var statechanges = 0;
            xhr.onloadstart = function () {
                xhr.onprogress = function () {
                    xhr.onload = function () {
                        xhr.onloadend = function () {
                            assert.equal(xhr.status, 200);
                            assert.equal(typeof xhr.response, 'object');
                            assert.equal(xhr.getResponseHeader('content-type'), 'image/png; charset=utf-8');

                            var url = URL.createObjectURL(xhr.response);

                            var img = document.createElement('img');
                            img.src = url;
                            img.onload = function () {
                                done();
                            };
                            img.onerror = function () {
                                throw Error('Unable to laod image');
                            };
                            document.body.appendChild(img);
                        };
                    };
                };
            };

            xhr.onerror = function (err) {
                 throw err;
            };  

            var imageUrl = './assets/cc83018365788ae445c3afd31aca20be.png';
            xhr.open('GET', imageUrl, true);
            xhr.send(null);
        });
    });
});

