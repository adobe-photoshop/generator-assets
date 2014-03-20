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
        if (raw.hasOwnProperty("bevelEmboss")) {
            this._setBevelEmboss(raw.bevelEmboss);
        }

        if (raw.hasOwnProperty("frameFX")) {
            this._setFrameFX(raw.frameFX);
        }

        if (raw.hasOwnProperty("chromeFX")) {
            this._setChromeFX(raw.chromeFX);
        }

        if (raw.hasOwnProperty("innerShadow")) {
            this._setInnerShadow(raw.innerShadow);
        }
        
        if (raw.hasOwnProperty("dropShadow")) {
            this._setDropShadow(raw.dropShadow);
        }

        if (raw.hasOwnProperty("solidFill")) {
            this._setSolidFill(raw.solidFill);
        }

        if (raw.hasOwnProperty("gradientFill")) {
            this._setGradientFill(raw.gradientFill);
        }

        if (raw.hasOwnProperty("patternFill")) {
            this._setPatternFill(raw.patternFill);
        }

        if (raw.hasOwnProperty("innerGlow")) {
            this._setInnerGlow(raw.innerGlow);
        }

        if (raw.hasOwnProperty("outerGlow")) {
            this._setOuterGlow(raw.outerGlow);
        }
    }

    Object.defineProperties(LayerEffects.prototype, {
        "bevelEmboss": {
            get: function () { return this._bevelEmboss; },
            set: function () { throw new Error("Cannot set bevelEmboss"); }
        },
        "frameFX": {
            get: function () { return this._frameFX; },
            set: function () { throw new Error("Cannot set frameFX"); }
        },
        "chromeFX": {
            get: function () { return this._chromeFX; },
            set: function () { throw new Error("Cannot set chromeFX"); }
        },
        "dropShadow": {
            get: function () { return this._dropShadow; },
            set: function () { throw new Error("Cannot set dropShadow"); }
        },
        "innerShadow": {
            get: function () { return this._innerShadow; },
            set: function () { throw new Error("Cannot set innerShadow"); }
        },
        "solidFill": {
            get: function () { return this._solidFill; },
            set: function () { throw new Error("Cannot set solidFill"); }
        },
        "gradientFill": {
            get: function () { return this._gradientFill; },
            set: function () { throw new Error("Cannot set gradientFill"); }
        },
        "patternFill": {
            get: function () { return this._patternFill; },
            set: function () { throw new Error("Cannot set patternFill"); }
        },
        "innerGlow": {
            get: function () { return this._innerGlow; },
            set: function () { throw new Error("Cannot set innerGlow"); }
        },
        "outerGlow": {
            get: function () { return this._outerGlow; },
            set: function () { throw new Error("Cannot set outerGlow"); }
        }
    });

    LayerEffects.prototype._bevelEmboss = null;

    LayerEffects.prototype._chromeFX = null;

    LayerEffects.prototype._frameFX = null;

    LayerEffects.prototype._dropShadow = null;

    LayerEffects.prototype._innerShadow = null;

    LayerEffects.prototype._solidFill = null;

    LayerEffects.prototype._gradientFill = null;

    LayerEffects.prototype._patternFill = null;

    LayerEffects.prototype._innerGlow = null;

    LayerEffects.prototype._outerGlow = null;

    LayerEffects.prototype._setBevelEmboss = function (rawBevelEmboss) {
        this._bevelEmboss = rawBevelEmboss;
    };

    LayerEffects.prototype._updateBevelEmboss = function (rawBevelEmboss) {
        var previous = this._bevelEmboss;
        this._setBevelEmboss(rawBevelEmboss);

        return {
            previous: previous
        };
    };

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

    LayerEffects.prototype._setChromeFX = function (rawChromeFX) {
        this._chromeFX = rawChromeFX;
    };

    LayerEffects.prototype._updateChromeFX = function (rawChromeFX) {
        var previous = this._chromeFX;
        this._setChromeFX(rawChromeFX);

        return {
            previous: previous
        };
    };

    LayerEffects.prototype._setInnerShadow = function (rawInnerShadow) {
        this._innerShadow = rawInnerShadow;
    };

    LayerEffects.prototype._updateInnerShadow = function (rawInnerShadow) {
        var previous = this._innerShadow;
        this._setInnerShadow(rawInnerShadow);

        return {
            previous: previous
        };
    };

    LayerEffects.prototype._setDropShadow = function (rawDropShadow) {
        this._dropShadow = rawDropShadow;
    };

    LayerEffects.prototype._updateDropShadow = function (rawDropShadow) {
        var previous = this._dropShadow;
        this._setDropShadow(rawDropShadow);

        return {
            previous: previous
        };
    };

    LayerEffects.prototype._setSolidFill = function (rawSolidFill) {
        this._solidFill = rawSolidFill;
    };

    LayerEffects.prototype._updateSolidFill = function (rawSolidFill) {
        var previous = this._solidFill;
        this._setSolidFill(rawSolidFill);

        return {
            previous: previous
        };
    };

    LayerEffects.prototype._setGradientFill = function (rawGradientFill) {
        this._gradientFill = rawGradientFill;
    };

    LayerEffects.prototype._updateGradientFill = function (rawGradientFill) {
        var previous = this._gradientFill;
        this._setGradientFill(rawGradientFill);

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

    LayerEffects.prototype._setInnerGlow = function (rawInnerGlow) {
        this._innerGlow = rawInnerGlow;
    };

    LayerEffects.prototype._updateInnerGlow = function (rawInnerGlow) {
        var previous = this._innerGlow;
        this._setInnerGlow(rawInnerGlow);

        return {
            previous: previous
        };
    };

    LayerEffects.prototype._setOuterGlow = function (rawOuterGlow) {
        this._outerGlow = rawOuterGlow;
    };

    LayerEffects.prototype._updateOuterGlow = function (rawOuterGlow) {
        var previous = this._outerGlow;
        this._setOuterGlow(rawOuterGlow);

        return {
            previous: previous
        };
    };

    LayerEffects.prototype._applyChange = function (rawChange) {
        var changes = {};

        if (rawChange.hasOwnProperty("bevelEmboss")) {
            changes.bevelEmboss = this._updateBevelEmboss(rawChange.bevelEmboss);
        }

        if (rawChange.hasOwnProperty("frameFX")) {
            changes.frameFX = this._updateFrameFX(rawChange.frameFX);
        }

        if (rawChange.hasOwnProperty("chromeFX")) {
            changes.chromeFX = this._updateChromeFX(rawChange.chromeFX);
        }

        if (rawChange.hasOwnProperty("innerShadow")) {
            changes.innerShadow = this._updateInnerShadow(rawChange.innerShadow);
        }

        if (rawChange.hasOwnProperty("dropShadow")) {
            changes.dropShadow = this._updateDropShadow(rawChange.dropShadow);
        }

        if (rawChange.hasOwnProperty("solidFill")) {
            changes.solidFill = this._updateSolidFill(rawChange.solidFill);
        }

        if (rawChange.hasOwnProperty("gradientFill")) {
            changes.gradientFill = this._updateGradientFill(rawChange.gradientFill);
        }

        if (rawChange.hasOwnProperty("patternFill")) {
            changes.patternFill = this._updatePatternFill(rawChange.patternFill);
        }

        if (rawChange.hasOwnProperty("innerGlow")) {
            changes.innerGlow = this._updateInnerGlow(rawChange.innerGlow);
        }

        if (rawChange.hasOwnProperty("outerGlow")) {
            changes.outerGlow = this._updateOuterGlow(rawChange.outerGlow);
        }

        return changes;
    };

    module.exports = LayerEffects;
}());