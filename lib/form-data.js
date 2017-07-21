var xhr = require('./xhr');

function FormData() {
	this.data = [];
}

FormData.prototype.append = function(key, value) {
	this.data.push([key, value]);
};


FormData.prototype.entries = function() {
	return this.data;
};

module.exports = {
    FormData: FormData
};