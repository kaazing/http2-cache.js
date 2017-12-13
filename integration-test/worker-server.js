self.addEventListener('error', function (e) {
	console.log(e);
});

self.addEventListener('message', function (e) {
	console.log('worker msg', e);

	if (e.ports.length) {
    	e.ports[0].postMessage('reply to port');
	} else {
		postMessage('reply');
	}
});