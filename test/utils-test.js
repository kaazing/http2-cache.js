var parseCacheControl = require('../lib/utils').parseCacheControl;
var assert = require('assert');

describe('H2 Proxy', function () {

    it('parseCacheControl', function () {
        var header = parseCacheControl('must-revalidate, max-age=3600');
        assert.ok(header);
        assert.equal(header['must-revalidate'], true);
        assert.equal(header['max-age'], 3600);

        header = parseCacheControl('must-revalidate, max-age="3600"');
        assert.ok(header);
        assert.equal(header['must-revalidate'], true);
        assert.equal(header['max-age'], 3600);

        header = parseCacheControl('must-revalidate, b =3600');
        assert.equal(header, null);

        header = parseCacheControl('must-revalidate, max-age=a3600');
        assert.equal(header, null);

        header = parseCacheControl(123);
        assert.equal(header, null);

        header = parseCacheControl(null);
        assert.equal(header, null);

        header = parseCacheControl(undefined);
        assert.equal(header, null);
    });
});
