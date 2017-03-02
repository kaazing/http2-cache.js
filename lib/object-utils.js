exports.define = function (obj, prop, value) {
    Object.defineProperty(obj, prop, {
        enumerable: obj.propertyIsEnumerable(prop),
        value: value,
        configurable: true
    });
};

