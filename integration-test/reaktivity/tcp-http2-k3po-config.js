var InetAddress = Java.type('java.net.InetAddress');
var HashMap = Java.type('java.util.HashMap');

var headers = new HashMap();
headers.put("upgrade", "websocket");
headers.put(":authority", "localhost:8080");

var port = 8080;
var address = InetAddress.getByName("127.0.0.1");

wsController.routeInputNew("http", 0, "http2", 0, null)
    .thenCompose(function (wsInputRef) {
        return httpController.routeInputNew("tcp", 0, "ws", wsInputRef, headers);
    })
    .thenCompose(function (httpInputRef) {
        return tcpController.routeInputNew("any", port, "http", httpInputRef, address);
    })
    .thenAccept(function () {
        print("WS echo bound to localhost:8080");
    });

