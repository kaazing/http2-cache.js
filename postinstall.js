/*
 * _postinstall.js is a script that runs automatically after the `npm install`
 * command to run bower install as follow up task.
 *
 * @author: Anselm Hannemann
 * @date: 2014-02-24
 *
 */

// Get platform from node
var os = require('os');
var platform = os.platform();

if (platform === 'darwin' || platform == 'linux') {
  // Call child process and execute
  var exec = require('child_process').exec;

  exec('node node_modules/browserify/bin/cmd.js ./lib/http2-cache.js -o ./index.js', function (error, stdout, stderr) {
    console.log('Browserify dependencies');

    if (stdout) {
      console.log(stdout); 
    }

    if (error !== null) {
      console.log(error);
    } else {
      console.log('Browserify was successful.');
    }
  });

  return;
} else if (platform === 'win32') {
  var exec = require('child_process').exec;

  exec('node.exe node_modules/browserify/bin/cmd.js ./lib/http2-cache.js -o ./index.js', function (error, stdout, stderr) {
    console.log('Browserify dependencies');

    if (stdout) {
      console.log(stdout); 
    }

    if (error !== null) {
      console.log(error);
    } else {
      console.log('Browserify was successful.');
    }
  });

  return;
}

console.error('Unknown environment. Please log an issue at https://github.com/use-init/init/issues:', platform);
process.exit(1);