var http2 = require('http2');
var fs = require('fs');
var path = require('path');
var parseUrl = require('url').parse;

var options = {
    key: fs.readFileSync('./resources/localhost.key'),
    cert: fs.readFileSync('./resources/localhost.crt')
};

var basePath = ['/compatibitity-check.html', 'index.html', '/']

var test1 = {
    'push': function (response) {
        var body = 'success';
        var push = response.push('/test1result');
        push.writeHead(200,
            {
                'Content-Type': 'text/html',
                'Content-Length': body.length,
                'Cache-Control': 'no-store, max-age=5'
            }
        );
        push.end(body);
    }
};

var test2 = {
    idMapping: {}
};

function getDate(){
    return new Date();
}

var testbase = {
    'response': function (request, response) {
        // TODO, SECURITY BUG IN NOT CHECKING USER DATA AND THEN ECHOING, USE ONLY FOR LOCAL TESTING
        // console.log(request.url);
        if (basePath.indexOf(request.url) > -1) {
            // send result
            test1.push(response);
            var filePath = path.join(__dirname, 'test.html');
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



            switch (pathname) {
                // SHOULD be on H2
                case '/test0result':
                    var result = "not on h2";
                    if (response.push) {
                        result = "success";
                    }
                    response.writeHead(200, {
                        'Content-Type': 'text/html',
                        'Content-Length': result.length
                    });
                    response.end(result);
                    break;

                // SHOULD cache on cache-able push promise
                case '/test1result':
                    var result = 'fail: should never request this';
                    response.writeHead(200, {
                        'Content-Type': 'text/html',
                        'Content-Length': result.length
                    });
                    response.end(result);
                    break;

                // MAY cancel cache-able push promise if already has it cached
                case '/test2start':
                    var testId = parseUrl(request.url).query.split("=")[1];
                    if (!test2.idMapping[testId]) {
                        test2.idMapping[testId] = 1;
                    } else {
                        test2.idMapping[testId]++;
                    }
                    // console.log(testId + " sent push " + test2.idMapping[testId] + " times")
                    var body = 'success' + test2.idMapping[testId];
                    var push = response.push('/test2result_' + testId);
                    push.writeHead(200,
                        {
                            'Content-Type': 'text/html',
                            'Content-Length': body.length,
                            'Cache-Control': 'no-store, max-age=5',
                            'Date:' : getDate()
                        }
                    );
                    push.end(body);


                    var message = 'sent push promises';
                    response.writeHead(200, {
                        'Content-Type': 'text/html',
                        'Content-Length': message.length,
                        'Date:' : getDate()
                    });
                    response.end(message);
                    break;
                // SHOULD bypass cache on push promise with no-cache
                case '/test3start':
                    var testId = parseUrl(request.url).query.split("=")[1];
                    if (!test2.idMapping[testId]) {
                        test2.idMapping[testId] = 1;
                    } else {
                        test2.idMapping[testId]++;
                    }
                    // console.log(testId + " sent push " + test2.idMapping[testId] + " times");
                    var body = 'success' + test2.idMapping[testId];
                    var push = response.push(
                        {
                            path: '/test3result_' + testId,
                            headers: {'Cache-Control': 'no-cache'}
                        }
                    );

                    var date = getDate();
                    push.writeHead(200,
                        {
                            'Content-Type': 'text/html',
                            'Content-Length': body.length,
                            'Cache-Control': 'no-store, max-age=5',
                            'Date:' : date
                        }
                    );
                    console.log("sent push with date: " + date + " for /test3result_" + testId + " with body: " + body);
                    push.end(body);

                    var message = 'sent push promises';
                    response.writeHead(200, {
                        'Content-Type': 'text/html',
                        'Content-Length': message.length,
                        'Date:' : getDate()
                    });
                    response.end(message);
                    break;
                // SHOULD support "Long Push"
                default:
                    // test2: interesting firefox behavior
                    console.log("got unexpected request indicating bug for:" + request.url);
                    if (pathname.indexOf('test2result') > -1 || pathname.indexOf('test3result')) {
                        var message = 'FAIL / BUG (Ignored PUSH PROMISES!!)';
                        response.writeHead(200, {
                            'Content-Type': 'text/html',
                            'Content-Length': message.length
                        });
                        response.end(message);
                    } else {
                        // error out
                        console.log("got unexpected request " + pathname);
                        throw new Error('this should be overloaded in all tests');
                    }

            }
        }
    }
};

http2.createServer(options, testbase.response).listen(8080);


