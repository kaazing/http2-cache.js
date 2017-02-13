/**
 * Starts reactivity for integration tests
 *
 * TODO: There is a race between stop (ie. restart does not work), need to wait on confirmed stop
 *
 * TODO: Consider programming config here, rather then calling java and passing in js config to java js interpreter
 */
const spawn = require('child_process').spawn;
var fs = require('fs');
var readline = require('readline');
var args = process.argv.slice(2);

var outputFile = './builds/integration-test/reaktivity-out.log';
var pidFile = './builds/integration-test/reaktivity.pid';
var config = './integration-test/reaktivity/ws-echo-config.js';
var ryJava = './integration-test/java-artifacts-TODO-move/ry-develop-SNAPSHOT.jar';
var successline = "bound to";

var mkdir = function (dir) {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir);
    }
};

mkdir('./builds');
mkdir('./builds/integration-test/');

var rmIfExists = function (file) {
    if (fs.existsSync(file)) {
        fs.unlinkSync(file);
    }
};

// Kill by pid if pid file exists
if (fs.existsSync(pidFile)) {
    var lineReader = readline.createInterface({
        input: fs.createReadStream(pidFile)
    });
    lineReader.on('line', function (line) {
        try {
            console.log("Killing reaktivity, PID = " + line);
            process.kill(line, 'SIGHUP');
        } catch (e) {
            //NOOP
        }
    });
    lineReader.on('close', function () {
        rmIfExists(pidFile);
    });
}

// We always stop it, so haven't formalized stop command, instead all we do is check
// if asked to start
if (args[0] && args[0].indexOf('start') > -1) {
    rmIfExists(outputFile);

    console.log("Starting reaktivity with config " + config);

    var out = fs.createWriteStream(outputFile);
    const child = spawn('java',
        ['-jar', ryJava, '-script', config]
    );

    // save PID
    fs.writeFile(pidFile, child.pid, function (err) {
        if (err) {
            return console.log(err);
        }
    });

    child.unref();

    // check for success line
    child.stdout.on('data', function (data) {
        process.stdout.write(" " + data);
        if (data.indexOf(successline) > -1) {
            console.log("Started reaktivity");
            child.stdout.pipe(out);
            child.stdin.pipe(out);
            process.exit(0);
        }
    });

    child.stderr.on('data', function (data) {
        process.stdout.write(" " + data);
    });

    // fail is success line not read
    child.on('close', function (code) {
        console.log("Failed to start reaktivity");
        process.kill(child.pid, 'SIGHUP');
        process.exit(-1);
    });
}
