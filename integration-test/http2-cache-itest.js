/* globals chai:true */
var assert = chai.assert;

describe('http2-proxy', function () {

    xdescribe('accelerationStrategy', function () {
        
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

        xit('should attempt proxyfied GET request and trigger error', function (done) {

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

        // Test image for debug image/png
        var DEBUG_BASE64_IMG = 
        "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAB1klEQVR42n2TzytEURTHv3e8N1joRhZG" + 
        "zJsoCjsLhcw0jClKWbHwY2GnLGUlIfIP2IjyY2djZTHSMJNQSilFNkz24z0/Ms2MrnvfvMu8mcfZvPvu" + 
        "Pfdzz/mecwgKLNYKb0cFEgXbRvwV2s2HuWazCbzKA5LvNecDXayBjv9NL7tEpSNgbYzQ5kZmAlSXgsGG" + 
        "XmS+MjhKxDHgC+quyaPKQtoPYMQPOh5U9H6tBxF+Icy/aolqAqLP5wjWd5r/Ip3YXVILrF4ZRYAxDhCO" + 
        "J/yCwiMI+/xgjOEzmzIhAio04GeGayIXjQ0wGoAuQ5cmIjh8jNo0GF78QwNhpyvV1O9tdxSSR6PLl51F" + 
        "nIK3uQ4JJQME4sCxCIRxQbMwPNSjqaobsfskm9l4Ky6jvCzWEnDKU1ayQPe5BbN64vYJ2vwO7CIeLIi3" + 
        "ciYAoby0M4oNYBrXgdgAbC/MhGCRhyhCZwrcEz1Ib3KKO7f+2I4iFvoVmIxHigGiZHhPIb0bL1bQApFS" + 
        "9U/AC0ulSXrrhMotka/lQy0Ic08FDeIiAmDvA2HX01W05TopS2j2/H4T6FBVbj4YgV5+AecyLk+Ctvms" + 
        "QWK8WZZ+Hdf7QGu7fobMuZHyq1DoJLvUqQrfM966EU/qYGwAAAAASUVORK5CYII=";

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
                            assert.equal( xhr.response instanceof ArrayBuffer, true);
                            assert.equal(xhr.getResponseHeader('content-type'), 'image/png; charset=utf-8');

                            var binary = xhr.response; // ArrayBuffer
                            var blob = new Blob([binary], {type: 'image/png'});
                            var url = URL.createObjectURL(blob);

                            var img = document.createElement('img');
                            img.src = url;
                            img.onload = function () {
                                done();
                            };
                            img.onerror = function () {
                                throw Error('Unable to load image');
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
                            assert.equal( xhr.response instanceof Blob, true);
                            assert.equal(xhr.getResponseHeader('content-type'), 'image/png; charset=utf-8');

                            var url = URL.createObjectURL(xhr.response);

                            var img = document.createElement('img');
                            img.src = url;
                            img.onload = function () {
                                done();
                            };
                            img.onerror = function () {
                                throw Error('Unable to load image');
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

        it('should GET request with text and render image using dataURL', function (done) {
            var xhr = new XMLHttpRequest();
            xhr.responseType = "text";

            function stringToBase64 (inputStr) {
                var bbLen = 3,
                    enCharLen = 4,
                    inpLen = inputStr.length,
                    inx = 0,
                    jnx,
                    keyStr = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz" + "0123456789+/=",
                    output = "",
                    paddingBytes = 0;
                
                var bytebuffer = new Array (bbLen),
                    encodedCharIndexes = new Array (enCharLen);

                while (inx < inpLen) {

                    for (jnx = 0; jnx < bbLen; ++jnx) {
                        /*--- Throw away high-order byte, as documented at:
                          https://developer.mozilla.org/En/Using_XMLHttpRequest#Handling_binary_data
                        */
                        if (inx < inpLen) {
                            bytebuffer[jnx] = inputStr.charCodeAt (inx++) & 0xff;
                        } else {
                            bytebuffer[jnx] = 0;
                        }
                    }

                    /*--- Get each encoded character, 6 bits at a time.
                        index 0: first  6 bits
                        index 1: second 6 bits
                                    (2 least significant bits from inputStr byte 1
                                     + 4 most significant bits from byte 2)
                        index 2: third  6 bits
                                    (4 least significant bits from inputStr byte 2
                                     + 2 most significant bits from byte 3)
                        index 3: forth  6 bits (6 least significant bits from inputStr byte 3)
                    */
                    encodedCharIndexes[0] = bytebuffer[0] >> 2;
                    encodedCharIndexes[1] = ( (bytebuffer[0] & 0x3) << 4)   |  (bytebuffer[1] >> 4);
                    encodedCharIndexes[2] = ( (bytebuffer[1] & 0x0f) << 2)  |  (bytebuffer[2] >> 6);
                    encodedCharIndexes[3] = bytebuffer[2] & 0x3f;

                    //--- Determine whether padding happened, and adjust accordingly.
                    paddingBytes          = inx - (inpLen - 1);
                    switch (paddingBytes) {
                        case 1:
                            // Set last character to padding char
                            encodedCharIndexes[3] = 64;
                            break;
                        case 2:
                            // Set last 2 characters to padding char
                            encodedCharIndexes[3] = 64;
                            encodedCharIndexes[2] = 64;
                            break;
                        default:
                            break; // No padding - proceed
                    }

                    /*--- Now grab each appropriate character out of our keystring,
                        based on our index array and append it to the output string.
                    */
                    for (jnx = 0; jnx < enCharLen; ++jnx) {
                        output += keyStr.charAt ( encodedCharIndexes[jnx] );
                    }
                }

                return output;
            }

            function str2ab(str) {
              var buf = new ArrayBuffer(str.length*2); // 2 bytes for each char
              var bufView = new Uint16Array(buf);
              for (var i=0, strLen=str.length; i<strLen; i++) {
                bufView[i] = str.charCodeAt(i);
              }
              return buf;
            }

            var statechanges = 0;
            xhr.onloadstart = function () {
                xhr.onprogress = function () {
                    xhr.onload = function () {
                        xhr.onloadend = function () {
                            assert.equal(xhr.status, 200);
                            assert.equal(typeof xhr.response, 'string');
                            assert.equal(xhr.getResponseHeader('content-type'), 'image/png; charset=utf-8');

                            var base64 = stringToBase64(xhr.response); // ArrayBuffer
                            var url = 'data:image/png;base64,' + base64;

                            var img = document.createElement('img');
                            img.src = url;
                            img.onload = function () {
                                done();
                            };
                            img.onerror = function () {
                                throw Error('Unable to load image');
                            };
                            document.body.appendChild(img);
                        };
                    };
                };
            };

            xhr.onerror = function (err) {
                 throw err;
            };  

            // Required
            xhr.overrideMimeType('text/plain; charset=x-user-defined');

            var imageUrl = './assets/cc83018365788ae445c3afd31aca20be.png';
            xhr.open('GET', imageUrl, true);
            xhr.send(null);
        });

        it('should GET request with string and render image', function (done) {
            var xhr = new XMLHttpRequest();
            xhr.responseType = "text";

            function rawStringToBuffer( str ) {
                var idx, len = str.length, arr = new Array( len );
                for ( idx = 0 ; idx < len ; ++idx ) {
                    arr[ idx ] = str.charCodeAt(idx) & 0xFF;
                }
                // You may create an ArrayBuffer from a standard array (of values) as follows:
                return new Uint8Array( arr ).buffer;
            }

            function str2ab(str) {
              var buf = new ArrayBuffer(str.length*2); // 2 bytes for each char
              var bufView = new Uint16Array(buf);
              for (var i=0, strLen=str.length; i<strLen; i++) {
                bufView[i] = str.charCodeAt(i);
              }
              return buf;
            }

            var statechanges = 0;
            xhr.onloadstart = function () {
                xhr.onprogress = function () {
                    xhr.onload = function () {
                        xhr.onloadend = function () {
                            assert.equal(xhr.status, 200);
                            assert.equal(typeof xhr.response, 'string');
                            assert.equal(xhr.getResponseHeader('content-type'), 'image/png; charset=utf-8');

                            var binary = rawStringToBuffer(xhr.response);
                            var blob = new Blob([binary], {type: 'image/png'});
                            var url = URL.createObjectURL(blob);

                            var img = document.createElement('img');
                            img.src = url;
                            img.onload = function () {
                                done();
                            };
                            img.onerror = function () {
                                throw Error('Unable to load image');
                            };
                            document.body.appendChild(img);
                        };
                    };
                };
            };

            xhr.onerror = function (err) {
                 throw err;
            };  

            // Required
            xhr.overrideMimeType('text/plain; charset=x-user-defined');

            var imageUrl = './assets/cc83018365788ae445c3afd31aca20be.png';
            xhr.open('GET', imageUrl, true);
            xhr.send(null);
        });
    });
});

