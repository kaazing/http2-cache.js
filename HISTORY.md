Version history
===============

### 0.2.8

- Implement AccelerationStrategy default to "always" can be "connected"
AccelerationStrategy value "always" means always/don't make requests if they are proxied but no ws connection is open and value "connected" means make requests when connected via websocket.


### 0.2.7

- We non longer commit index.js generated file


### 0.2.3

- We non run postinstall to build index.js
