Version history
===============

### 0.2.16 (2018-12-xx) 
* Use http2.js^4.0.5 from npm to fix SETTINGS_MAX_CONCURRENT_STREAMS

### 0.2.15 (2018-12-06)
* Fix possible cache hit on POST|PUT|DELETE (via #118)

### 0.2.14 (2018-12-06)
* Fix bad merge on revalidate Cache

### 0.2.13 (2018-12-05)

* Cancel duplicate push promises streams #111 (via #113)
* Force new authorization value through cache #112 (via #114).
* Handle Etag to allow server sending NotModified 304 responses #116 (via #115)

### 0.2.12 (2018-07-18) Maintenance release
* Use http2.js^4.0.4 from npm instead of kaazing/http2.js#v4.0.3

### 0.2.11 (2018-07-18) 

* Update to http2.js 4.0.3 to add support on request for `retry-after` header on `503|429|302` status code.

### 0.2.10

* Fix FormData 'multipart/form-data' boundary support.
  Note: FormData limited support, only string supported

### 0.2.8

* Implement AccelerationStrategy default to "always" can be "connected"
AccelerationStrategy value "always" means always/don't make requests if they are proxied but no ws connection is open and value "connected" means make requests when connected via websocket.

### 0.2.7

* We non longer commit index.js generated file

### 0.2.3

* We non run postinstall to build index.js
