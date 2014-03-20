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

    function LayerEffects(raw) {
        if (raw.hasOwnProperty("frameFX")) {
            this._setFrameFX(raw.frameFX);
        }
        
        if (raw.hasOwnProperty("patternFill")) {
            this._setPatternFill(raw.patternFill);
        }
    }

    Object.defineProperties(LayerEffects.prototype, {
        "frameFX": {
            get: function () { return this._frameFX; },
            set: function () { throw new Error("Cannot set frameFX"); }
        },
        "patternFill": {
            get: function () { return this._patternFill; },
            set: function () { throw new Error("Cannot set patternFill"); }
        }
    });

    LayerEffects.prototype._frameFX = null;

    LayerEffects.prototype._patternFill = null;

    LayerEffects.prototype._setFrameFX = function (rawFrameFX) {
        this._frameFX = rawFrameFX;
    };

    LayerEffects.prototype._updateFrameFX = function (rawFrameFX) {
        var previous = this._frameFX;
        this._setFrameFX(rawFrameFX);

        return {
            previous: previous
        };
    };

    LayerEffects.prototype._setPatternFill = function (rawPatternFill) {
        this._patternFill = rawPatternFill;
    };

    LayerEffects.prototype._updatePatternFill = function (rawPatternFill) {
        var previous = this._patternFill;
        this._setPatternFill(rawPatternFill);

        return {
            previous: previous
        };
    };

    LayerEffects.prototype._applyChange = function (rawChange) {
        var changes = {};

        if (rawChange.hasOwnProperty("layerFX")) {
            changes.layerFX = this._updateLayerFX(rawChange.layerFX);
        }

        if (rawChange.hasOwnProperty("patternFill")) {
            changes.patternFill = this._updatePatternFill(rawChange.patternFill);
        }

        return changes;
    };

    module.exports = LayerEffects;
}());