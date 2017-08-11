/* global console */
var mergeTypedArrays = require('../lib/utils').mergeTypedArrays,
	Utf8ArrayToStr = require('../lib/utils').Utf8ArrayToStr,
	parseUrl = require('../lib/utils').parseUrl,
	FormData = require('../lib/form-data').FormData,
	serializeXhrBody = require('../lib/utils').serializeXhrBody,
    unicodeStringToTypedArray = require('./test-utils').unicodeStringToTypedArray,
    generateRandAlphaNumStr = require('./test-utils').generateRandAlphaNumStr;

var assert = require('assert');

describe('utils', function () {

	describe('parseUrl', function () {
		it('should parse url with custom port', function () {
			var url = "https://example.com:8080/path?query=1",
				uri = parseUrl(url);
			assert.equal(uri.host, "example.com:8080");
			assert.equal(uri.href, url);
		});

		it('should parse url with default https port', function () {
			var url = "https://example.com/path?query=1",
				uri = parseUrl(url);
			assert.equal(uri.host, "example.com:443");
			assert.equal(uri.href, url);
		});

		it('should parse url with default http port', function () {
			var url = "http://example.com/path?query=1",
				uri = parseUrl(url);
			assert.equal(uri.host, "example.com:80");
			assert.equal(uri.href, url);
		});
	});	

	describe('Utf8ArrayToStr', function () {
		it('should convert Utf8Array to string', function () {
			var aStr = generateRandAlphaNumStr(2500),
				a = unicodeStringToTypedArray(aStr);
			assert.equal(Utf8ArrayToStr(a), aStr);
		});
	});	

	describe('mergeTypedArrays', function () {
		it('should merge Utf8Array', function () {
		 	var aStr = generateRandAlphaNumStr(2500),
		 		bStr = generateRandAlphaNumStr(2500),
		 		a = unicodeStringToTypedArray(aStr),
		 		b = unicodeStringToTypedArray(bStr),
		 		c = unicodeStringToTypedArray(aStr + bStr);
	        assert.equal(Utf8ArrayToStr(mergeTypedArrays(a, b)), Utf8ArrayToStr(c));
	    });
	});

	describe('serializeXhrBody', function () {
		it('should merge serialize Xhr Body', function () {
		 	var formData = new FormData();
	        formData.append('username', 'Chris');
	        formData.append('username', 'Bob');
	        formData.append('gender', 'male');  
	        assert.equal(serializeXhrBody({}, formData), "username=Chris&username=Bob&gender=male");
	    });
	});
});
