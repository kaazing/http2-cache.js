/* jshint ignore:start */
var XMLHttpRequest
function client()
{
    (function() {
    var https = require("https");
    var fs = require("fs");
    var trustedCa = [
        '/Users/David/Documents/projects/reactivity/pdc-accelerator/development/origin-server/certs/public.crt',
        '/Users/David/Documents/projects/reactivity/pdc-accelerator/tls-keys/public-trust/democa.crt'
    ];
    trustedCa.forEach(function (ca) {
        https.globalAgent.options.ca = https.globalAgent.options.ca || [];
        https.globalAgent.options.ca.push(fs.readFileSync(ca));
    });

    var XMLHttpRequest = require("xhr2").XMLHttpRequest;
         XMLHttpRequest = Object.assign({}, XMLHttpRequest);
    var createClient = require("../lib/http2-cache-client");
    XMLHttpRequest = createClient(XMLHttpRequest);
    /* jshint ignore:end */

    XMLHttpRequest.proxy([
        {
            "push": "https://rest-accelerator.example.com:8081/event-stream",
            "transport": "wss://rest-accelerator.example.com:8081/",
            "clientLogLevel": "debug",
            "proxy": [
                "https://testemops.pdc.org:443/",
                "https://devemops.pdc.org:443/",
                "https://devrapids.pdc.org:443/",
                "https://origin-server.example.com:8080/"
            ]
        }
    ]);

    var requests = 0;

    function doRequestResponse() {
        var xhr = new XMLHttpRequest();
        xhr.onreadystatechange = function () {
            if (xhr.readyState === 4) {
                requests++;
                if (requests == 10) {
                    console.log("response");
                    clearInterval(interval);
                }
            }
        };
        xhr.open('GET', "https://origin-server.example.com:8080/sizeof100");
        xhr.send('');
    }

    var interval = setInterval(
        function()
        {
            doRequestResponse();
        }, 1000)
    })();
}


const NUM_OF_CLIENTS = 2;
for (var i = 0; i < NUM_OF_CLIENTS; i++)
{
    console.log("client " + i);
    client();
}
