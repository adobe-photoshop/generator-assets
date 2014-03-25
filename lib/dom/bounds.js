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

    function Bounds(raw) {
        this._top = raw.top;
        this._right = raw.right;
        this._bottom = raw.bottom;
        this._left = raw.left;

        Object.defineProperties(this, {
            "top": {
                get: function () { return this._top; },
                enumerable: true
            },
            "right": {
                get: function () { return this._right; },
                enumerable: true
            },
            "bottom": {
                get: function () { return this._bottom; },
                enumerable: true
            },
            "left": {
                get: function () { return this._left; },
                enumerable: true
            }
        });
    }

    Bounds.prototype._top = null;

    Bounds.prototype._right = null;

    Bounds.prototype._bottom = null;

    Bounds.prototype._left = null;

    Bounds.prototype._setTop = function (rawTop) {
        this._top = parseInt(rawTop, 10);
    };

    Bounds.prototype._updateTop = function (rawTop) {
        var previous = this._top;
        this._setTop(rawTop);

        if (previous !== this.top) {
            return {
                previous: previous
            };
        }
    };

    Bounds.prototype._setRight = function (rawRight) {
        this._right = parseInt(rawRight, 10);
    };

    Bounds.prototype._updateRight = function (rawRight) {
        var previous = this._right;
        this._setRight(rawRight);

        if (previous !== this.right) {
            return {
                previous: previous
            };
        }
    };

    Bounds.prototype._setBottom = function (rawBottom) {
        this._bottom = parseInt(rawBottom, 10);
    };

    Bounds.prototype._updateBottom = function (rawBottom) {
        var previous = this._bottom;
        this._setBottom(rawBottom);

        if (previous !== this.bottom) {
            return {
                previous: previous
            };
        }
    };

    Bounds.prototype._setLeft = function (rawLeft) {
        this._left = parseInt(rawLeft, 10);
    };

    Bounds.prototype._updateLeft = function (rawLeft) {
        var previous = this._left;
        this._setLeft(rawLeft);

        if (previous !== this.left) {
            return {
                previous: previous
            };
        }
    };

    Bounds.prototype._applyChange = function (rawChange) {
        var changes = {};

        if (rawChange.hasOwnProperty("top")) {
            changes.top = this._updateTop(rawChange.top);
        }

        if (rawChange.hasOwnProperty("right")) {
            changes.right = this._updateRight(rawChange.right);
        }

        if (rawChange.hasOwnProperty("bottom")) {
            changes.bottom = this._updateBottom(rawChange.bottom);
        }

        if (rawChange.hasOwnProperty("left")) {
            changes.left = this._updateLeft(rawChange.left);
        }

        return changes;
    };

    module.exports = Bounds;
}());