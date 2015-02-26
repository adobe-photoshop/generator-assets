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

    var Bounds = require("./bounds"),
        Raw = require("./raw");

    function Mask(document, raw) {
        this._document = document;

        if (raw.hasOwnProperty("bounds")) {
            this._setBounds(raw.bounds);
        }

        if (raw.hasOwnProperty("enabled")) {
            this._setEnabled(raw.enabled);
        } else {
            this._setEnabled(true);
        }

        if (raw.hasOwnProperty("extendWithWhite")) {
            this._setExtendWithWhite(raw.extendWithWhite);
        }
    }

    Object.defineProperties(Mask.prototype, {
        "bounds": {
            get: function () { return this._bounds; }
        },
        "enabled": {
            get: function () { return this._enabled; }
        },
        "extendWithWhite": {
            get: function () { return this._extendWithWhite; }
        }
    });

    Mask.prototype._bounds = null;

    Mask.prototype._enabled = null;

    Mask.prototype._extendWithWhite = null;

    Mask.prototype._setBounds = function (rawBounds) {
        this._bounds = new Bounds(rawBounds);
    };

    Mask.prototype._updateBounds = function (rawBounds) {
        return this._bounds._applyChange(rawBounds);
    };

    Mask.prototype._setEnabled = function (rawEnabled) {
        this._enabled = rawEnabled;
    };

    Mask.prototype._updateEnabled = function (rawEnabled) {
        var previous = this._enabled;
        this._setEnabled(rawEnabled);

        return {
            previous: previous
        };
    };

    Mask.prototype._setExtendWithWhite = function (rawExtendWithWhite) {
        this._extendWithWhite = rawExtendWithWhite;
    };

    Mask.prototype._updateExtendWithWhite = function (rawExtendWithWhite) {
        var previous = this._extendWithWhite;
        this._setExtendWithWhite(rawExtendWithWhite);

        return {
            previous: previous
        };
    };

    Mask.prototype._applyChange = function (rawChange) {
        var changes = {},
            change;

        if (rawChange.hasOwnProperty("bounds")) {
            change = this._updateBounds(rawChange.bounds);
            if (change) {
                changes.bounds = change;
            }
        }

        if (rawChange.hasOwnProperty("enabled")) {
            changes.enabled = this._updateEnabled(rawChange.enabled);
        }

        if (rawChange.hasOwnProperty("extendWithWhite")) {
            changes.extendWithWhite = this._updateExtendWithWhite(rawChange.extendWithWhite);
        }

        if (Object.keys(changes).length > 0) {
            return changes;
        }
    };

    Mask.prototype.toRaw = function () {
        return Raw.toRaw(this, [
            "bounds",
            "enabled",
            "extendWithWhite"
        ]);
    };

    module.exports = Mask;
}());
