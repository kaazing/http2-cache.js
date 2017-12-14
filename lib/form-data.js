var xhr = require('./xhr');


function makeIterator(array) {
    var nextIndex = 0;
    
    return {
       next: function() {
           return nextIndex < array.length ?
               {value: array[nextIndex++], done: false} :
               {done: true};
       }
    };
}

function FormData() {
	this.data = [];
}

FormData.prototype.append = function(key, value) {
	this.data.push([key, value]);
};


FormData.prototype.entries = function() {
	return makeIterator(this.data);
};

module.exports = {
    FormData: FormData
};