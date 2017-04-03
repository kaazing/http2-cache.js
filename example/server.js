var http2 = require('http2');
var fs = require('fs');
var path = require('path');
var parseUrl = require('url').parse;

var options = {
    key: fs.readFileSync('./resources/localhost.key'),
    cert: fs.readFileSync('./resources/localhost.crt')
};

var basePath = ['/native-support.html', 'index.html', '/'];

var tests = [
    {
        'name': "SHOULD_be_on_H2",
        'run': function (request, response) {
            var result = "not on h2";
            if (response.push) {
                result = "success";
            }
            response.writeHead(200, {
                'Content-Type': 'text/html',
                'Content-Length': result.length
            });
            response.end(result);
        }
    },
    {
        'name': "SHOULD_cache_on_cache-able_push_promise",
        'before': function (request, response) {
            var body = 'success';
            var push = response.push('/SHOULD_cache_on_cache-able_push_promise');
            push.writeHead(200,
                {
                    'Content-Type': 'text/html',
                    'Content-Length': body.length,
                    'Cache-Control': 'max-age=5'
                }
            );
            push.end(body);
        },
        'run': function (request, response) {
            var result = 'fail: should never request this';
            response.writeHead(200, {
                'Content-Type': 'text/html',
                'Content-Length': result.length
            });
            response.end(result);
        }
    },
    {
        'name': 'MAY_cancel_cache-able_push_promise_if_already_has_it_cached',
        'mappings': {},
        'run': function (request, response) {
            var testId = parseUrl(request.url).query.split("=")[1];
            if (!this.mappings[testId]) {
                this.mappings[testId] = 1;
            } else {
                this.mappings[testId]++;
            }
            var body = 'success' + this.mappings[testId];
            var push = response.push('/MAY_cancel_cache-able_push_promise_if_already_has_it_cached' + testId);
            push.writeHead(200,
                {
                    'Content-Type': 'text/html',
                    'Content-Length': body.length,
                    'Cache-Control': 'max-age=5',
                    'Date:': getDate()
                }
            );
            push.end(body);

            var message = 'should not display this message ever (this sent push)';
            response.writeHead(200, {
                'Content-Type': 'text/html',
                'Content-Length': message.length,
                'Date:': getDate()
            });
            response.end(message);
        }
    },
    {
        'name': 'SHOULD_bypass_cache_on_push_promise_with_no-cache',
        'mappings': {},
        'run': function (request, response) {
            var testId = parseUrl(request.url).query.split("=")[1];
            if (!this.mappings[testId]) {
                this.mappings[testId] = 1;
            } else {
                this.mappings[testId]++;
            }
            var body = 'success' + this.mappings[testId];
            var pushPath = '/SHOULD_bypass_cache_on_push_promise_with_no-cache' + testId;
            var push = response.push(
                {
                    path: pushPath,
                    headers: {'Cache-Control': 'no-cache'}
                }
            );

            var date = getDate();
            push.writeHead(200,
                {
                    'Content-Type': 'text/html',
                    'Content-Length': body.length,
                    'Cache-Control': 'max-age=5',
                    'Date:': date
                }
            );
            push.end(body);

            var message = 'should never display this message (sent push promise)';
            response.writeHead(200, {
                'Content-Type': 'text/html',
                'Content-Length': message.length,
                'Date:': getDate()
            });
            response.end(message);
        }
    },
    {
        'name': 'SHOULD_support_Long_Push',
        'mappings': {},
        'failMessage': 'failed (saw request it never should have)',
        'run': function (request, response) {
            var id = request.url.replace('/' + this.name, '');
            if (this.mappings[id]) {
                response.writeHead(200, {
                    'Content-Type': 'text/html',
                    'Content-Length': this.failMessage.size
                });
                response.end(this.failMessage);
            } else {
                this.mappings[id] = true;

                var self = this;

                var testurl = '/' + this.name + id;
                var cnt = 1;

                function pushPull(push, pushTimeout) {
                    var body = 'success' + cnt;
                    cnt++;
                    push.writeHead(200,
                        {
                            'Content-Type': 'text/html',
                            'Content-Length': body.length,
                            'Cache-Control': 'max-age=5',
                            'Date': new Date()
                        }
                    );
                    setTimeout(function () {
                        try {
                            var response = push.push("https://localhost:8080/" + testurl);
                            pushPull(response, 1000);
                            setTimeout(function () {
                                push.end(body);
                            }, 100);
                        } catch (e) {
                            if (e.message.includes('Sending illegal frame (PUSH_PROMISE) in CLOSED state')) {
                                self.mappings[id] = 'FAILED, server closed PUSH PROMISE';
                            }
                        }
                    }, pushTimeout);
                }

                var body = 'success0';
                response.writeHead(200,
                    {
                        'Content-Type': 'text/html',
                        'Content-Length': body.length,
                        'Cache-Control': 'max-age=5',
                        'Date': new Date()
                    }
                );
                var push = response.push(this.name);
                pushPull(push, 500);
                response.end(body);
            }
        }
    }
];

function getDate() {
    return new Date();
}

http2.createServer(options, function (request, response) {
    // TODO, SECURITY BUG IN NOT CHECKING USER DATA AND THEN ECHOING, USE ONLY FOR LOCAL TESTING
    if (basePath.indexOf(request.url) > -1) {
        // send result
        var lengthI = tests.length;
        for (var i = 0; i < lengthI; i++) {
            if (tests[i].before) {
                tests[i].before(request, response);
            }
        }

        var filePath = path.join(__dirname, 'index.html');
        var stat = fs.statSync(filePath);
        response.writeHead(200, {
            'Content-Type': 'text/html',
            'Content-Length': stat.size
        });
        var readStream = fs.createReadStream(filePath);
        readStream.pipe(response);
    } else if (request.url === '/favicon.ico') {
        var str = 'Not favicon';
        response.writeHead(404, {
            'Content-Type': 'text/html',
            'Content-Length': str.length
        });
        response.end(str);
    } else {
        var pathname = parseUrl(request.url).pathname;
        var success = false;
        var lengthI = tests.length;
        for (var i = 0; i < lengthI; i++) {
            if (pathname.indexOf('/' + tests[i].name) > -1) {
                try {
                    console.log("Running test logic: " + tests[i].name);
                    tests[i].run(request, response);
                    success = true;
                    break;
                } catch (e) {
                    break;
                }
            }
        }
        if (!success) {
            console.log("got unexpected request indicating bug for:" + request.url);
            var message = 'FAIL / BUG (Ignored PUSH PROMISES!!)';
            response.writeHead(200, {
                'Content-Type': 'text/html',
                'Content-Length': message.length
            });
            response.end(message);
        }

    }
}).listen(8080);

console.log("Listening on 8080");

