/**
 * Starts k3po for integration tests
 *
 */
const spawn = require('child_process').spawn;
var fs = require('fs');
var readline = require('readline');
var args = process.argv.slice(2);

var outputFile = './builds/integration-test/k3po-out.log';
var pidFile = './builds/integration-test/k3po.pid';
var config = './integration-test/k3po/pom.xml';
var mvn = 'mvn';
var successline = "K3PO started";

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
            console.log("Killing K3PO, PID = " + line);
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

    console.log("Starting K3PO via mvn " + config);

    var out = fs.createWriteStream(outputFile);
    const child = spawn(mvn,
        ['k3po:start', '-Dmaven.k3po.daemon=false', '-f', config]
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
            console.log("Started K3PO");
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
        console.log("Failed to start K3PO");
        process.kill(child.pid, 'SIGHUP');
        process.exit(-1);
    });
}
