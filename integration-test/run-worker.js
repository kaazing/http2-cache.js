/* globals self, importScripts, console, mocha:true */
self.global = self;

delete self.global;

importScripts('../../../node_modules/mocha/mocha.js');
importScripts('../../../node_modules/chai/chai.js');
importScripts('./../dist/http2-cache.js');

function MyReporter(runner) {
  var passes = 0;
  var failures = 0;

  runner.on('pass', function(test){
    passes++;
    console.log('pass: %s', test.fullTitle());
  });

  runner.on('fail', function(test, err){
    failures++;
    console.log('fail: %s -- error: %s', test.fullTitle(), err.message);
  });

  runner.on('end', function(){
    console.log('end: %d/%d', passes, passes + failures);
  });
}

mocha.setup({
  allowUncaught: true,
  ui: 'bdd',
  slow: 150,
  timeout: 15000,
  bail: false,
  reporter: MyReporter,
  ignoreLeaks: false
});

importScripts('./http2-worker-itest.js');

mocha.run();

