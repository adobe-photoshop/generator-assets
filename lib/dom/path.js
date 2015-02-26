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

    function Path(document, raw) {
        this._document = document;

        if (raw.hasOwnProperty("bounds")) {
            this._setBounds(raw.bounds);
        }

        if (raw.hasOwnProperty("defaultFill")) {
            this._setDefaultFill(raw.defaultFill);
        }

        // TODO: It doesn't look PS sends info about whether a vector mask is enabled yet.
        if (raw.hasOwnProperty("enabled")) {
            this._setEnabled(raw.enabled);
        } else {
            this._setEnabled(true);
        }

        if (raw.hasOwnProperty("pathComponents")) {
            this._setPathComponents(raw.pathComponents);
        }
    }

    Object.defineProperties(Path.prototype, {
        "bounds": {
            get: function () { return this._bounds; }
        },
        "defaultFill": {
            get: function () { return this._defaultFill; }
        },
        "enabled": {
            get: function () { return this._enabled; }
        },
        "pathComponents": {
            get: function () { return this._pathComponents; }
        }
    });

    Path.prototype._bounds = null;

    Path.prototype._defaultFill = null;

    Path.prototype._pathComponents = null;

    Path.prototype._setBounds = function (rawBounds) {
        this._bounds = new Bounds(rawBounds);
    };

    Path.prototype._updateBounds = function (rawBounds) {
        return this._bounds._applyChange(rawBounds);
    };

    Path.prototype._setEnabled = function (rawEnabled) {
        this._enabled = rawEnabled;
    };

    Path.prototype._updateEnabled = function (rawEnabled) {
        var previous = this._enabled;
        this._setEnabled(rawEnabled);

        return {
            previous: previous
        };
    };

    Path.prototype._setDefaultFill = function (raw) {
        this._defaultFill = raw;
    };

    Path.prototype._updateDefaultFill = function (raw) {
        var previous = this._defaultFill;
        this._setPathComponents(raw);

        return {
            previous: previous
        };
    };

    Path.prototype._setPathComponents = function (raw) {
        this._pathComponents = raw;
    };

    Path.prototype._updatePathComponents = function (raw) {
        var previous = this._pathComponents;
        this._setPathComponents(raw);

        return {
            previous: previous
        };
    };

    Path.prototype._applyChange = function (rawChange) {
        var changes = {},
            change;

        if (rawChange.hasOwnProperty("bounds")) {
            change = this._updateBounds(rawChange.bounds);
            if (change) {
                changes.bounds = change;
            }
        }

        if (rawChange.hasOwnProperty("defaultFill")) {
            changes.defaultFill = this._updateDefaultFill(rawChange.defaultFill);
        }

        if (rawChange.hasOwnProperty("enabled")) {
            changes.enabled = this._updateEnabled(rawChange.enabled);
        }

        if (rawChange.hasOwnProperty("pathComponents")) {
            change = this._updatePathComponents(rawChange.pathComponents);
            if (change) {
                changes.pathComponents = change;
            }
        }

        if (Object.keys(changes).length > 0) {
            return changes;
        }
    };

    Path.prototype.toRaw = function () {
        return Raw.toRaw(this, [
            "bounds",
            "defaultFill",
            "enabled",
            "pathComponents"
        ]);
    };

    module.exports = Path;
}());
