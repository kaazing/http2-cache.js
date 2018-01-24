var assert = chai.assert;

//var largeRequestCharSize = 1024 * 1024 * 5; // ~ 5MB
var largeRequestCharSize = 1024 * 1000; // ~ 1000Kb
var hostname = window.location.hostname;
describe('http2-cache', function () {

    it('proxy() with empty params throws exception', function () {
        assert.throws(function () {
            XMLHttpRequest.proxy();
        });
    });

    it('proxy() with no arrays throws exception', function () {
        assert.throws(function () {
                XMLHttpRequest.proxy("http://url");
            }
        );
    });

    it('proxy() with invalid params throws exception', function () {
        assert.throws(function () {
            XMLHttpRequest.proxy([1]);
        });
    });

    describe('http-cache regular (no worker)', function () {

        describe('Pure XHR', function () {

            it('should proxy GET request small', function (done) {
                
                var xhr = new XMLHttpRequest();
                
                xhr.onloadstart = function () {
                    xhr.onprogress = function () {
                        xhr.onload = function () {
                            assert.equal(xhr.status, 200);
                            assert.equal(typeof xhr.response, 'string');
                            assert.notEqual(xhr.response.lentgh, 0);
                            assert.equal(typeof JSON.parse(xhr.response), 'object');
                            assert.equal(xhr.getResponseHeader('content-type'), 'application/json');
                            done();
                        };
                    };
                };

                xhr.onerror = function (err) {
                    throw new TypeError('Network request failed');
                };
                xhr.open('GET', 'http://' +  hostname + ':7080/config', true);
                xhr.send(null);
            });

            it('should proxy GET request large (string)', function (done) {

                var xhr = new XMLHttpRequest();
                
                xhr.onloadstart = function () {
                    xhr.onprogress = function () {
                        xhr.onload = function () {
                            assert.equal(xhr.status, 200);
                            //assert.equal(typeof xhr.response, 'string');
                            assert.notEqual(xhr.response.lentgh, 0);
                            assert.equal(xhr.getResponseHeader('content-type'), 'text/plain; charset=utf-8');
                            done();
                        };
                    };
                };

                xhr.onerror = function (err) {
                    throw new TypeError('Network request failed');
                };
                xhr.open('GET', 'http://' +  hostname + ':7080/charof' + largeRequestCharSize, true);
                xhr.send(null);
            }); 

            it('should proxy GET request large (gzip+string)', function (done) {

                var xhr = new XMLHttpRequest();
                
                xhr.onloadstart = function () {
                    xhr.onprogress = function () {
                        xhr.onload = function () {
                            assert.equal(xhr.status, 200);
                            //assert.equal(typeof xhr.response, 'string');
                            assert.notEqual(xhr.response.lentgh, 0);
                            assert.equal(xhr.getResponseHeader('content-type'), 'text/plain; charset=utf-8');
                            done();
                        };
                    };
                };

                xhr.onerror = function (err) {
                    throw new TypeError('Network request failed');
                };
                xhr.open('GET', 'http://' +  hostname + ':7080/gzip/charof' + largeRequestCharSize, true);
                
                // not required to work, and cause
                // http2-cache.js:2059 Refused to set unsafe header "accept-encoding"
                //xhr.setRequestHeader('accept-encoding','gzip');
                xhr.send(null);
            }); 

            it('should proxy GET request large (arraybuffer)', function (done) {

                var xhr = new XMLHttpRequest();
                
                xhr.responseType = 'arraybuffer';
                xhr.onloadstart = function () {
                    xhr.onprogress = function () {
                        xhr.onload = function () {
                            assert.equal(xhr.status, 200);
                            assert.equal(typeof xhr.response, 'object');
                            assert.notEqual(xhr.response.lentgh, 0);
                            assert.equal(xhr.getResponseHeader('content-type'), 'text/plain; charset=utf-8');
                            done();
                        };
                    };
                };

                xhr.onerror = function (err) {
                    throw new TypeError('Network request failed');
                };
                xhr.open('GET', 'http://' +  hostname + ':7080/charof' + largeRequestCharSize, true);
                xhr.send(null);
            });
        });

        describe('HTTP2.js XHR', function () {

            it('configure http2 proxy, and worker (wait 250)', function (done) {
                XMLHttpRequest.configuration.useWorker = false;
                XMLHttpRequest.configuration.terminateWorker(true);                
                XMLHttpRequest.proxy(["http://" +  hostname + ":7080/config"]);
                setTimeout(done, 250);
            });

            it('should proxy GET request small', function (done) {
                
                var xhr = new XMLHttpRequest();
                
                xhr.onloadstart = function () {
                    xhr.onprogress = function () {
                        xhr.onload = function () {
                            assert.equal(xhr.status, 200);
                            assert.equal(typeof xhr.response, 'string');
                            assert.notEqual(xhr.response.lentgh, 0);
                            assert.equal(typeof JSON.parse(xhr.response), 'object');
                            assert.equal(xhr.getResponseHeader('content-type'), 'application/json');
                            done();
                        };
                    };
                };

                xhr.onerror = function (err) {
                    throw new TypeError('Network request failed');
                };
                xhr.open('GET', 'http://cache-endpoint/config', true);
                xhr.send(null);
            });

            it('should proxy GET request large (string)', function (done) {
                
                var xhr = new XMLHttpRequest();
                
                xhr.onloadstart = function () {
                    xhr.onprogress = function () {
                        xhr.onload = function () {
                            assert.equal(xhr.status, 200);
                            assert.equal(typeof xhr.response, 'string');
                            assert.notEqual(xhr.response.lentgh, 0);
                            assert.equal(xhr.getResponseHeader('content-type'), 'text/plain; charset=utf-8');
                            done();
                        };
                    };
                };

                xhr.onerror = function (err) {
                    throw new TypeError('Network request failed');
                };
                xhr.open('GET', 'http://cache-endpoint/charof' + largeRequestCharSize, true);
                xhr.send(null);
            });

            it('should proxy GET request large (gzip+string)', function (done) {
                
                var xhr = new XMLHttpRequest();
                
                xhr.onloadstart = function () {
                    xhr.onprogress = function () {
                        xhr.onload = function () {
                            assert.equal(xhr.status, 200);
                            assert.equal(typeof xhr.response, 'string');
                            assert.notEqual(xhr.response.lentgh, 0);
                            assert.equal(xhr.getResponseHeader('content-type'), 'text/plain; charset=utf-8');
                            done();
                        };
                    };
                };

                xhr.onerror = function (err) {
                    throw new TypeError('Network request failed');
                };
                xhr.open('GET', 'http://localhost:7080/gzip/charof' + largeRequestCharSize, true);

                // not required to work, and cause
                // http2-cache.js:2059 Refused to set unsafe header "accept-encoding"
                //xhr.setRequestHeader('accept-encoding','gzip');
                xhr.send(null);
            });

            it('should proxy GET request large (arraybuffer)', function (done) {
                
                var xhr = new XMLHttpRequest();
                xhr.responseType = 'arraybuffer';
                
                xhr.onloadstart = function () {
                    xhr.onprogress = function () {
                        xhr.onload = function () {
                            assert.equal(xhr.status, 200);
                            assert.equal(typeof xhr.response, 'object');
                            assert.notEqual(xhr.response.lentgh, 0);
                            assert.equal(xhr.getResponseHeader('content-type'), 'text/plain; charset=utf-8');
                            done();
                        };
                    };
                };

                xhr.onerror = function (err) {
                    throw new TypeError('Network request failed');
                };
                xhr.open('GET', 'http://cache-endpoint/charof' + largeRequestCharSize, true);
                xhr.send(null);
            });
        });
    });

    describe('HTTP2.js using Worker', function () {

        it('configure http2 proxy, and worker (wait 250)', function (done) {
            XMLHttpRequest.configuration.useTransferable = false;
            XMLHttpRequest.configuration.useWorker = true;
            XMLHttpRequest.configuration.terminateWorker(true);
            XMLHttpRequest.proxy(["http://" +  hostname + ":7080/config"]);
            setTimeout(done, 250);
        });

        it('should proxy GET request small', function (done) {
            
            var xhr = new XMLHttpRequest();
            
            xhr.onloadstart = function () {
                xhr.onprogress = function () {
                    xhr.onload = function () {
                        assert.equal(xhr.status, 200);
                        assert.equal(typeof xhr.response, 'string');
                        assert.notEqual(xhr.response.lentgh, 0);
                        assert.equal(typeof JSON.parse(xhr.response), 'object');
                        assert.equal(xhr.getResponseHeader('content-type'), 'application/json');
                        done();
                    };
                };
            };

            xhr.onerror = function (err) {
                throw new TypeError('Network request failed');
            };
            xhr.open('GET', 'http://cache-endpoint/config', true);
            xhr.send(null);
        });

        it('should proxy GET request large (string)', function (done) {
            
            var xhr = new XMLHttpRequest();
            
            xhr.onloadstart = function () {
                xhr.onprogress = function () {
                    xhr.onload = function () {
                        assert.equal(xhr.status, 200);
                        assert.equal(typeof xhr.response, 'string');
                        assert.notEqual(xhr.response.lentgh, 0);
                        assert.equal(xhr.getResponseHeader('content-type'), 'text/plain; charset=utf-8');
                        done();
                    };
                };
            };

            xhr.onerror = function (err) {
                throw new TypeError('Network request failed');
            };
            xhr.open('GET', 'http://cache-endpoint/charof' + largeRequestCharSize, true);
            xhr.send(null);
        });

        // TODO Fail somehow
        xit('should proxy GET request large (gzip+string)', function (done) {
            
            var xhr = new XMLHttpRequest();
            
            xhr.onloadstart = function () {
                xhr.onprogress = function () {
                    xhr.onload = function () {
                        assert.equal(xhr.status, 200);
                        assert.equal(typeof xhr.response, 'string');
                        assert.notEqual(xhr.response.lentgh, 0);
                        assert.equal(xhr.getResponseHeader('content-type'), 'text/plain; charset=utf-8');
                        done();
                    };
                };
            };

            xhr.onerror = function (err) {
                throw new TypeError('Network request failed');
            };
            xhr.open('GET', 'http://cache-endpoint/gzip/charof' + largeRequestCharSize, true);
            xhr.setRequestHeader('accept-encoding','gzip');
            xhr.send(null);
        });

        it('should proxy GET request large (arraybuffer)', function (done) {
            
            var xhr = new XMLHttpRequest();
            xhr.responseType = 'arraybuffer';
            
            xhr.onloadstart = function () {
                xhr.onprogress = function () {
                    xhr.onload = function () {
                        assert.equal(xhr.status, 200);
                        assert.equal(typeof xhr.response, 'object');
                        assert.notEqual(xhr.response.lentgh, 0);
                        assert.equal(xhr.getResponseHeader('content-type'), 'text/plain; charset=utf-8');
                        done();
                    };
                };
            };

            xhr.onerror = function (err) {
                throw new TypeError('Network request failed');
            };
            xhr.open('GET', 'http://cache-endpoint/charof' + largeRequestCharSize, true);
            xhr.send(null);
        });
    });

    describe('HTTP2.js using Worker (Transferable ArrayBuffer)', function () {

        it('configure http2 proxy, and worker (wait 250)', function (done) {
            XMLHttpRequest.configuration.useTransferable = true;
            XMLHttpRequest.configuration.useWorker = true;
            XMLHttpRequest.configuration.terminateWorker(true);
            XMLHttpRequest.proxy(["http://" +  hostname + ":7080/config"]);
            setTimeout(done, 250);
        });

        it('should proxy GET request small', function (done) {
            
            var xhr = new XMLHttpRequest();
            
            xhr.onloadstart = function () {
                xhr.onprogress = function () {
                    xhr.onload = function () {
                        assert.equal(xhr.status, 200);
                        assert.equal(typeof xhr.response, 'string');
                        assert.notEqual(xhr.response.lentgh, 0);
                        assert.equal(typeof JSON.parse(xhr.response), 'object');
                        assert.equal(xhr.getResponseHeader('content-type'), 'application/json');
                        done();
                    };
                };
            };

            xhr.onerror = function (err) {
                throw new TypeError('Network request failed');
            };
            xhr.open('GET', 'http://cache-endpoint/config', true);
            xhr.send(null);
        });

        it('should proxy GET request large (string)', function (done) {
            
            var xhr = new XMLHttpRequest();
            XMLHttpRequest.configuration.useTransferable = true;
            
            xhr.onloadstart = function () {
                xhr.onprogress = function () {
                    xhr.onload = function () {
                        assert.equal(xhr.status, 200);
                        assert.equal(typeof xhr.response, 'string');
                        assert.notEqual(xhr.response.lentgh, 0);
                        assert.equal(xhr.getResponseHeader('content-type'), 'text/plain; charset=utf-8');
                        done();
                    };
                };
            };

            xhr.onerror = function (err) {
                throw new TypeError('Network request failed');
            };
            xhr.open('GET', 'http://cache-endpoint/charof' + largeRequestCharSize, true);
            xhr.send(null);
        });

        // TODO Fail somehow
        xit('should proxy GET request large (string+gzip)', function (done) {
            
            var xhr = new XMLHttpRequest();
            XMLHttpRequest.configuration.useTransferable = true;
            
            xhr.onloadstart = function () {
                xhr.onprogress = function () {
                    xhr.onload = function () {
                        assert.equal(xhr.status, 200);
                        assert.equal(typeof xhr.response, 'string');
                        assert.notEqual(xhr.response.lentgh, 0);
                        assert.equal(xhr.getResponseHeader('content-type'), 'text/plain; charset=utf-8');
                        done();
                    };
                };
            };

            xhr.onerror = function (err) {  
                throw new TypeError('Network request failed');
            };
            xhr.open('GET', 'http://cache-endpoint/gzip/charof' + largeRequestCharSize, true);
            xhr.setRequestHeader('accept-encoding','gzip');
            xhr.send(null);
        });

        it('should proxy GET request large (arraybuffer)', function (done) {
            
            var xhr = new XMLHttpRequest();
            XMLHttpRequest.configuration.useTransferable = true;
            xhr.responseType = 'arraybuffer';
            
            xhr.onloadstart = function () {
                xhr.onprogress = function () {
                    xhr.onload = function () {
                        assert.equal(xhr.status, 200);
                        assert.equal(typeof xhr.response, 'object');
                        assert.notEqual(xhr.response.lentgh, 0);
                        assert.equal(xhr.getResponseHeader('content-type'), 'text/plain; charset=utf-8');
                        done();
                    };
                };
            };

            xhr.onerror = function (err) {
                throw new TypeError('Network request failed');
            };
            xhr.open('GET', 'http://cache-endpoint/charof' + largeRequestCharSize, true);
            xhr.send(null);
        });
    });
});
