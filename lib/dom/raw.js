/*
 * Copyright (c) 2014 Adobe Systems Incorporated. All rights reserved.
 *
 * Permission is hereby granted, free of charge, to any person obtaining a
 * copy of this software and associated documentation files (the "Software"),
 * to deal in the Software without restriction, including without limitation
 * the rights to use, copy, modify, merge, publish, distribute, sublicense,
 * and/or sell copies of the Software, and to permit persons to whom the
 * Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
 * FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
 * DEALINGS IN THE SOFTWARE.
 *
 */

(function () {
    "use strict";

    var Raw = function () {};

    Raw.prototype.toRaw = function (object, keys) {
        var result = {};
        keys.forEach(function (key) {
            var value = object[key];

            if (value === null || value === undefined) {
                return;
            }

            if (typeof value === "object" && value.toRaw) {
                result[key] = value.toRaw();
                return;
            }

            result[key] = value;
        });
        return result;
    };

    Raw.prototype.assign = function (obj1, obj2) {
        Object.keys(obj2).forEach(function (key) {
            obj1[key] = obj2[key];
        });
    };

    // Used for debugging to easily diff JSON.
    Raw.prototype.sortJSON = function (object) {
        var result,
            i,
            keys,
            key,
            value;

        if (typeof object !== "object" || object === null) {
            return object;
        }

        if (Array.isArray(object)) {
            result = [];
            for (i = 0; i < object.length; i++) {
                result[i] = this.sortJSON(object[i]);
            }
            return result;
        }

        result = {};
        keys = Object.keys(object).sort();
        for (i = 0; i < keys.length; i++) {
            key = keys[i];
            value = object[key];
            result[key] = this.sortJSON(value);
        }
        return result;
    };

    module.exports = new Raw();
}());
