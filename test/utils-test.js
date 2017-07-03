/* global console */
var mergeTypedArrays = require('../lib/utils').mergeTypedArrays,
	Utf8ArrayToStr = require('../lib/utils').Utf8ArrayToStr,
    unicodeStringToTypedArray = require('./test-utils').unicodeStringToTypedArray,
    generateRandAlphaNumStr = require('./test-utils').generateRandAlphaNumStr;

var assert = require('assert');

describe('utils', function () {

	describe('Utf8ArrayToStr', function () {
		it('should convert Utf8Array to string', function () {
			var aStr = generateRandAlphaNumStr(2500),
				a = unicodeStringToTypedArray(aStr);
			 assert.equal(Utf8ArrayToStr(a), aStr);
		});
	});	
});
