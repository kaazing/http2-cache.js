function PushCacheClient(url, initDict) {
    this._eventSource = new EventSource(url, initDict);
    this._eventSource.onopen = this.onopen;
    this._eventSource.onopen = this.onmessage;
    this._eventSource.onopen = this.onerror;
    this._eventSource.onopen = this.close;
    this._eventSource.addEventListener = this.addEventListener;

}

PushCacheClient.prototype.onopen = function () {
};

PushCacheClient.prototype.onmessage = function(){
    //TODO
};

PushCacheClient.prototype.onerror = function(){
    //TODO
};

PushCacheClient.prototype.close = function(){
    this._eventSource.close();
};

PushCacheClient.prototype.addEventListener(eventType, listener){

}