
# http2-cache.js

[![Build Status](https://travis-ci.org/kaazing/http2-cache.js.svg?branch=develop)](http://travis-ci.org/kaazing/http2-cache.js)

[![npm version](https://img.shields.io/npm/v/http2-cache.svg?style=flat)](https://www.npmjs.com/package/http2-cache)


#### This library is pre 1.0.0, much of the functionality is not yet fully implemented.

This library provides a user-space based HTTP/2 client implementation and cache that slots
in under traditional network Browser APIs such as XHR (eventually Fetch).  This project is
intended to be useful for 1. providing HTTP/2 emulation when not natively available and 
2. allowing backends to pre-populate a browser-side cache via HTTP/2 push.

This project is designed to be 100% spec compliant.  It should be removable without loss 
of functionality when there is universal support for HTTP/2 with a consistent H2-cache 
implementation.

### Design

HTTP/2 (RFC-7540) runs in userspace by running it on top of WebSocket.  An HTTP (RFC-7234) in
memory cache implementation stores cacheable responses.  The XHR API can be configured to route
a subset of requests via this transport stack.

A consistent implementation for caching HTTP/2 push requests has not yet emerged.  See
[discussion](https://docs.google.com/document/d/1v3rjj0DMDTocUtZSjOwdwt8D-yhCw6R5SVaax4MPgMc/edit)
for current the state of the world. This HTTP/2 implementation will not use the cache for
any request (Including HTTP/2 pushed) that contains the 
[request cache-directive "no-cache"](https://tools.ietf.org/html/rfc7234#section-5.2.1.4). 
HTTP/2 pushed requests that do not include this directive may have their HTTP/2 stream aborted
by the client if the cache already contains a cached response for that request.  I.E. use the
request cache-directive "no-cache" when doing cache-busting.  This should work in all cases where
you want to do a cache replacement.

HTTP/2 push requests require an established stream to send the push request.  The API provides a
means to open a long-lived upstream request to an arbitrary location that may be used to send
push requests.  Alternatively, streams may be left open for sending future pushed responses via
"long-pushing", that is sending the push promise for a future response, prior to completing the
response to an existing request.  I.e. always maintain one response in flight, by sending the push
promise for it prior to completing a response.

### API/Usage

The API attaches to the XMLHttpRequest object.  

```javascript
XMLHttpRequest.proxy([urls of configurations])
```

The `proxy([urls of configurations])` triggers fetching of JSON configurations on the backend
server.  The configurations should be of the following form:

```
{
    // Logger debugLevel true='info' or (info|debug|trace)
    "clientLogLevel": false,
    // Transport endpoint
    "transport": "wss://where-the-underlying-ws-transport-connects:443/",
    // Transport push path
    "push": "optional-path-that-is-opened-for-pushes",
    // Transport reconnect settings
    "reconnect": true,
    "reconnectInterval": 100,
    "maximumReconnectInterval": 4000,
    // AccelerationStrategy default to "always" can be "connected"
    // - Value "always" means always/don't make requests if they are proxied but no ws connection is open. 
    // - Value "connected" means make requests when connected via websocket.
    "accelerationStrategy": "always",
    "proxy": [
      "http://origin-to-send-via-http2:80/path/",
      "http://origin-to-send-via-http2:80/path2/",
      "http://other-origin-to-send-via-http2:80"
    ]
}
```

In full

```
<script type="text/javascript" src="http2-cache.js"></script>
<script type="text/javascript">
    XMLHttpRequest.proxy(["http://localhost:8000/config"]);
</script>
```

### Build

The integration tests require Java JDK 8 be installed.

```
npm install
```

### Browser Compatibility 

TODO automation tests and testing in full, currently have checked chrome and firefox latest by hand.

### Native Browser Implementations

The example directory contains a simple Web App which tests whether the browser
supports native HTTP2 push with SPEC compliant caching.


Start origin
```
http-server -c-1
```

Start data server
```
 node server.js 
```

Visit page `https://localhost:8080/` (Note: need to trust TLS cert)



### Integration Tests

TODO -- These tests are not complete. 
