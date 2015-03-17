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

    var Raw = require("./raw");

    function Bounds(raw) {
        this._top = raw.top;
        this._right = raw.right;
        this._bottom = raw.bottom;
        this._left = raw.left;

        // These properties are defined directly on the Bounds instance so that,
        // when JSONified bounds objects are passed as parameters from Generator
        // to ExtendScript, the properties are defined in the JSON.
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
        var changes = {},
            change;

        if (rawChange.hasOwnProperty("top")) {
            change = this._updateTop(rawChange.top);
            if (change) {
                changes.top = change;
            }
        }

        if (rawChange.hasOwnProperty("right")) {
            change = this._updateRight(rawChange.right);
            if (change) {
                changes.right = change;
            }
        }

        if (rawChange.hasOwnProperty("bottom")) {
            change = this._updateBottom(rawChange.bottom);
            if (change) {
                changes.bottom = change;
            }
        }

        if (rawChange.hasOwnProperty("left")) {
            change = this._updateLeft(rawChange.left);
            if (change) {
                changes.left = change;
            }
        }

        if (Object.keys(changes).length > 0) {
            return changes;
        }
    };
    
    /**
     * Gets the width of the bounds
     * 
     * @return {number}
     */
    Bounds.prototype.width = function () {
        return this.right - this.left;
    };
    
    /**
     * Gets the height of the bounds
     * 
     * @return {number}
     */
    Bounds.prototype.height = function () {
        return this.bottom - this.top;
    };

    /**
     * Scale these bounds, yielding new bounds, using the given scalar. The new
     * bounds are positioned at the origin.
     * 
     * @param {number} scalar Factor by which the bounds should be scaled.
     * @return {Bounds}
     */
    Bounds.prototype.scale = function (scalar) {
        return new Bounds({
            top: 0,
            left: 0,
            bottom: this.height() * scalar,
            right: this.width() * scalar
        });
    };
    
    /**
     * get the intersection of this bounds and another
     * 
     * @param {Bounds} other bounds to check for intersections
     * @return {Bounds}
     */
    Bounds.prototype.intersect = function (other) {
        var intersect = new Bounds({
            top: Math.max(this.top, other.top),
            left: Math.max(this.left, other.left),
            bottom: Math.min(this.bottom, other.bottom),
            right: Math.min(this.right, other.right)
        });
        
        if (intersect.isEmpty()) {
            intersect = new Bounds({top: 0, left: 0, bottom: 0, right: 0});
        }
        return intersect;
    };
    
    /**
     * get the union of this bounds and another
     * 
     * @param {Bounds} other bounds to expand to contain
     * @return {Bounds}
     */
    Bounds.prototype.union = function (other) {
        return new Bounds({
            top: Math.min(this.top, other.top),
            left: Math.min(this.left, other.left),
            bottom: Math.max(this.bottom, other.bottom),
            right: Math.max(this.right, other.right)
        });
    };
    
    /**
     * does this define an area with a width and height
     * 
     * @return {bool}
     */
    Bounds.prototype.isEmpty = function () {
        var height = this.bottom - this.top,
            width = this.right - this.left;
        
        return !(Number.isFinite(height) && Number.isFinite(width) &&
                width > 0 && height > 0);
    };

    Bounds.prototype.toRaw = function () {
        return Raw.toRaw(this, [
            "top",
            "left",
            "bottom",
            "right"
        ]);
    };

    module.exports = Bounds;
}());
