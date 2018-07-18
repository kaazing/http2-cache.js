Version history
===============

### 0.2.11 (2018-07-18)

* Update to http2.js 4.0.3 to add support on request for `retry-after` header on `503|429|302` status code.

### 0.2.10

- Fix FormData 'multipart/form-data' boundary support.
  Note: FormData limited support, only string supported

### 0.2.8

- Implement AccelerationStrategy default to "always" can be "connected"
AccelerationStrategy value "always" means always/don't make requests if they are proxied but no ws connection is open and value "connected" means make requests when connected via websocket.


### 0.2.7

- We non longer commit index.js generated file


### 0.2.3

- We non run postinstall to build index.js
