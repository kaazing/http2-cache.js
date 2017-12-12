// Karma configuration
// Generated on Tue Mar 07 2017 13:59:10 GMT-0800 (PST)

module.exports = function(config) {
  config.set({

    // base path, that will be used to resolve files and exclude
    basePath: '.',

    //browserNoActivityTimeout: 20000,

    // frameworks to use
    // available frameworks: https://npmjs.org/browse/keyword/karma-adapter
    frameworks : ['mocha', 'sinon-chai', 'mocha-webworker'],

    // list of files / patterns to load in the browser
    files: [
      {pattern: 'dist/http2-cache.js', included: true},
      //{pattern: 'integration-test/*-itest.js', included: true},
      {pattern: 'integration-test/*-test.js', included: true}
    ],

    // list of files to exclude
    exclude: [
    ],

    // preprocess matching files before serving them to the browser
    // available preprocessors: https://npmjs.org/browse/keyword/karma-preprocessor
    preprocessors: {
       // '*.js': 'coverage'
    },

    // test results reporter to use
    // possible values: 'dots', 'progress'
    // available reporters: https://npmjs.org/browse/keyword/karma-reporter
    reporters: ['coverage', 'progress'],

    coverageReporter: {
        type: 'html',
        dir: 'coverage'
    },

    // web server port
    port: 9876,

    // enable / disable colors in the output (reporters and logs)
    colors: true,

    // level of logging
    // possible values: config.LOG_DISABLE || config.LOG_ERROR || config.LOG_WARN || config.LOG_INFO || config.LOG_DEBUG
    logLevel: config.LOG_INFO,

    // enable / disable watching file and executing tests whenever any file changes
    autoWatch: true,

    // start these browsers
    // available browser launchers: https://npmjs.org/browse/keyword/karma-launcher
    //browsers: ['PhantomJS', 'Chrome', 'Firefox', 'Safari'],
    // start these browsers
    // available browser launchers: https://npmjs.org/browse/keyword/karma-launcher
    //browsers: ['PhantomJS', 'Chrome', 'Firefox', 'Safari'],
    browsers: ['Chrome'],

    // you can define custom flags
    customLaunchers: {
        firefoxLauncher: {
            base: 'Firefox',
            prefs: {
                'security.ssl.enable_ocsp_stapling': false
            }
        },
        Chrome_without_security: {
            base: 'Chrome',
            flags: [
                '--ignore-certificate-errors=true',
                '--user-data-dir=./tmp',
                '--allow-insecure-localhost',
                '--allow-running-insecure-content'
            ]
        },
        Chrome_travis_ci: {
            base: 'Chrome',
            flags: [
                '--no-sandbox',
                '--ignore-certificate-errors=true',
                '--user-data-dir=./tmp',
                '--allow-insecure-localhost',
                '--allow-running-insecure-content'
            ]
        }
    },

    // Continuous Integration mode
    // if true, Karma captures browsers, runs the tests and exits
    singleRun: false,

    // Concurrency level
    // how many browser should be started simultaneous
    concurrency: Infinity,

    plugins: [
        'karma-mocha',
        'karma-sinon-chai',
        'karma-mocha-webworker',
        'karma-coverage',
        'karma-chrome-launcher',
        'karma-firefox-launcher'
    ]
  });
};
