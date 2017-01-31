if (Window.XMLHttpRequest) {
    XMLHttpRequest.proxy = new XMLHttpRequestProxy();
} else {
    console.log("Window.XMLHttpRequest is not defined, can't attach http2-cache.js");
}