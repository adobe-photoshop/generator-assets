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

    function _clone(obj) {
        return JSON.parse(JSON.stringify(obj));
    }

    function LayerEffects(document, raw) {
        this._document = document;
        
        if (raw.hasOwnProperty("bevelEmboss")) {
            this._setBevelEmboss(raw.bevelEmboss);
        }

        if (raw.hasOwnProperty("frameFX")) {
            this._setFrameFX(raw.frameFX);
        }

        if (raw.hasOwnProperty("frameFXMulti")) {
            this._setFrameFXMulti(raw.frameFXMulti);
        }

        if (raw.hasOwnProperty("chromeFX")) {
            this._setChromeFX(raw.chromeFX);
        }

        if (raw.hasOwnProperty("innerShadow")) {
            this._setInnerShadow(raw.innerShadow);
        }

        if (raw.hasOwnProperty("innerShadowMulti")) {
            this._setInnerShadowMulti(raw.innerShadowMulti);
        }

        if (raw.hasOwnProperty("dropShadow")) {
            this._setDropShadow(raw.dropShadow);
        }

        if (raw.hasOwnProperty("dropShadowMulti")) {
            this._setDropShadowMulti(raw.dropShadowMulti);
        }

        if (raw.hasOwnProperty("solidFill")) {
            this._setSolidFill(raw.solidFill);
        }

        if (raw.hasOwnProperty("solidFillMulti")) {
            this._setSolidFillMulti(raw.solidFillMulti);
        }

        if (raw.hasOwnProperty("gradientFill")) {
            this._setGradientFill(raw.gradientFill);
        }

        if (raw.hasOwnProperty("gradientFillMulti")) {
            this._setGradientFillMulti(raw.gradientFillMulti);
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
        "enabled": {
            get: function () { return this.isEnabled(); },
            set: function () { throw new Error("Cannot set enabled"); }
        },
        "bevelEmboss": {
            get: function () { return this._bevelEmboss; },
            set: function () { throw new Error("Cannot set bevelEmboss"); }
        },
        "frameFX": {
            get: function () { return this._frameFX; },
            set: function () { throw new Error("Cannot set frameFX"); }
        },
        "frameFXMulti": {
            get: function () { return this._frameFXMulti; },
            set: function () { throw new Error("Cannot set frameFXMulti"); }
        },
        "chromeFX": {
            get: function () { return this._chromeFX; },
            set: function () { throw new Error("Cannot set chromeFX"); }
        },
        "dropShadow": {
            get: function () { return this._dropShadow; },
            set: function () { throw new Error("Cannot set dropShadow"); }
        },
        "dropShadowMulti": {
            get: function () { return this._dropShadowMulti; },
            set: function () { throw new Error("Cannot set dropShadowMulti"); }
        },
        "innerShadow": {
            get: function () { return this._innerShadow; },
            set: function () { throw new Error("Cannot set innerShadow"); }
        },
        "innerShadowMulti": {
            get: function () { return this._innerShadowMulti; },
            set: function () { throw new Error("Cannot set innerShadowMulti"); }
        },
        "solidFill": {
            get: function () { return this._solidFill; },
            set: function () { throw new Error("Cannot set solidFill"); }
        },
        "solidFillMulti": {
            get: function () { return this._solidFillMulti; },
            set: function () { throw new Error("Cannot set solidFillMulti"); }
        },
        "gradientFill": {
            get: function () { return this._gradientFill; },
            set: function () { throw new Error("Cannot set gradientFill"); }
        },
        "gradientFillMulti": {
            get: function () { return this._gradientFillMulti; },
            set: function () { throw new Error("Cannot set gradientFillMulti"); }
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

    LayerEffects.prototype._frameFXMulti = null;

    LayerEffects.prototype._dropShadow = null;

    LayerEffects.prototype._dropShadowMulti = null;

    LayerEffects.prototype._innerShadow = null;

    LayerEffects.prototype._innerShadowMulti = null;

    LayerEffects.prototype._solidFill = null;

    LayerEffects.prototype._solidFillMulti = null;

    LayerEffects.prototype._gradientFill = null;

    LayerEffects.prototype._gradientFillMulti = null;

    LayerEffects.prototype._patternFill = null;

    LayerEffects.prototype._innerGlow = null;

    LayerEffects.prototype._outerGlow = null;

    LayerEffects.prototype._setBevelEmboss = function (rawBevelEmboss) {
        if (!this.hasOwnProperty("_bevelEmboss")) {
            this._bevelEmboss = {
                enabled: false
            };
        }
        this._bevelEmboss.enabled = rawBevelEmboss.enabled;
    };

    LayerEffects.prototype._updateBevelEmboss = function (rawBevelEmboss) {
        var previous = _clone(this._bevelEmboss);
        this._setBevelEmboss(rawBevelEmboss);

        return {
            previous: previous
        };
    };

    LayerEffects.prototype._setFrameFX = function (rawFrameFX) {
        if (!this.hasOwnProperty("_frameFX")) {
            this._frameFX = {
                enabled: false
            };
        }
        this._frameFX.enabled = rawFrameFX.enabled;
    };

    LayerEffects.prototype._updateFrameFX = function (rawFrameFX) {
        var previous = _clone(this._frameFX);
        this._setFrameFX(rawFrameFX);

        return {
            previous: previous
        };
    };

    LayerEffects.prototype._setFrameFXMulti = function (rawFrameFXMulti) {
        if (!this.hasOwnProperty("_frameFXMulti")) {
            this._frameFXMulti = {
                enabled: false,
                effectsList : [{
                    enabled : this.hasOwnProperty("_frameFX") && this._frameFX.enabled
                }]
            };
        }

        for (var i = 0; i < rawFrameFXMulti.length; i++) {
            if (i >= this._frameFXMulti.effectsList.length) {
                this._frameFXMulti.effectsList.push({
                    enabled: null
                });
            }

            if (rawFrameFXMulti[i].enabled !== undefined) {
                this._frameFXMulti.effectsList[i] = {
                    enabled: rawFrameFXMulti[i].enabled
                };
            }
        }

        var lengthDifference = this._frameFXMulti.effectsList.length - rawFrameFXMulti.length;
        if (lengthDifference > 0) {
            this._frameFXMulti.effectsList.splice(rawFrameFXMulti.length, lengthDifference);
        }

        this._frameFXMulti.enabled = this._frameFXMulti.effectsList.some(function (effectItem) {
            return (effectItem.enabled === true);
        }, this);

    };

    LayerEffects.prototype._updateFrameFXMulti = function (rawFrameFXMulti) {
        var previous = _clone(this._frameFXMulti);
        this._setFrameFXMulti(rawFrameFXMulti);

        return {
            previous: previous
        };
    };

    LayerEffects.prototype._setChromeFX = function (rawChromeFX) {
        if (!this.hasOwnProperty("_chromeFX")) {
            this._chromeFX = {
                enabled: false
            };
        }
        this._chromeFX.enabled = rawChromeFX.enabled;
    };

    LayerEffects.prototype._updateChromeFX = function (rawChromeFX) {
        var previous = _clone(this._chromeFX);
        this._setChromeFX(rawChromeFX);

        return {
            previous: previous
        };
    };

    LayerEffects.prototype._setInnerShadow = function (rawInnerShadow) {
        if (!this.hasOwnProperty("_innerShadow")) {
            this._innerShadow = {
                enabled: false
            };
        }
        this._innerShadow.enabled = rawInnerShadow.enabled;
    };

    LayerEffects.prototype._updateInnerShadow = function (rawInnerShadow) {
        var previous = _clone(this._innerShadow);
        this._setInnerShadow(rawInnerShadow);

        return {
            previous: previous
        };
    };

    LayerEffects.prototype._setInnerShadowMulti = function (rawInnerShadowMulti) {
        if (!this.hasOwnProperty("_innerShadowMulti")) {
            this._innerShadowMulti = {
                enabled: false,
                effectsList : [{
                    enabled : this.hasOwnProperty("_innerShadow") && this._innerShadow.enabled
                }]
            };
        }

        for (var i = 0; i < rawInnerShadowMulti.length; i++) {
            if (i >= this._innerShadowMulti.effectsList.length) {
                this._innerShadowMulti.effectsList.push({
                    enabled: null
                });
            }

            if (rawInnerShadowMulti[i].enabled !== undefined) {
                this._innerShadowMulti.effectsList[i] = {
                    enabled: rawInnerShadowMulti[i].enabled
                };
            }
        }

        var lengthDifference = this._innerShadowMulti.effectsList.length - rawInnerShadowMulti.length;
        if (lengthDifference > 0) {
            this._innerShadowMulti.effectsList.splice(rawInnerShadowMulti.length, lengthDifference);
        }

        this._innerShadowMulti.enabled = this._innerShadowMulti.effectsList.some(function (effectItem) {
            return (effectItem.enabled === true);
        }, this);

    };

    LayerEffects.prototype._updateInnerShadowMulti = function (rawInnerShadowMulti) {
        var previous = _clone(this._innerShadowMulti);
        this._setInnerShadowMulti(rawInnerShadowMulti);

        return {
            previous: previous
        };
    };

    LayerEffects.prototype._setDropShadow = function (rawDropShadow) {
        if (!this.hasOwnProperty("_dropShadow")) {
            this._dropShadow = {
                enabled: false
            };
        }
        this._dropShadow.enabled = rawDropShadow.enabled;
    };

    LayerEffects.prototype._updateDropShadow = function (rawDropShadow) {
        var previous = _clone(this._dropShadow);
        this._setDropShadow(rawDropShadow);

        return {
            previous: previous
        };
    };

    LayerEffects.prototype._setDropShadowMulti = function (rawDropShadowMulti) {
        if (!this.hasOwnProperty("_dropShadowMulti")) {
            this._dropShadowMulti = {
                enabled: false,
                effectsList : [{
                    enabled : this.hasOwnProperty("_dropShadow") && this._dropShadow.enabled
                }]
            };
        }

        for (var i = 0; i < rawDropShadowMulti.length; i++) {
            if (i >= this._dropShadowMulti.effectsList.length) {
                this._dropShadowMulti.effectsList.push({
                    enabled: null
                });
            }

            if (rawDropShadowMulti[i].enabled !== undefined) {
                this._dropShadowMulti.effectsList[i] = {
                    enabled: rawDropShadowMulti[i].enabled
                };
            }
        }

        var lengthDifference = this._dropShadowMulti.effectsList.length - rawDropShadowMulti.length;
        if (lengthDifference > 0) {
            this._dropShadowMulti.effectsList.splice(rawDropShadowMulti.length, lengthDifference);
        }
        
        this._dropShadowMulti.enabled = this._dropShadowMulti.effectsList.some(function (effectItem) {
            return (effectItem.enabled === true);
        }, this);

    };

    LayerEffects.prototype._updateDropShadowMulti = function (rawDropShadowMulti) {
        var previous = _clone(this._dropShadowMulti);
        this._setDropShadowMulti(rawDropShadowMulti);

        return {
            previous: previous
        };
    };

    LayerEffects.prototype._setSolidFill = function (rawSolidFill) {
        if (!this.hasOwnProperty("_solidFill")) {
            this._solidFill = {
                enabled: false
            };
        }
        this._solidFill.enabled = rawSolidFill.enabled;
    };

    LayerEffects.prototype._updateSolidFill = function (rawSolidFill) {
        var previous = _clone(this._solidFill);
        this._setSolidFill(rawSolidFill);

        return {
            previous: previous
        };
    };

    LayerEffects.prototype._setSolidFillMulti = function (rawSolidFillMulti) {
        if (!this.hasOwnProperty("_solidFillMulti")) {
            this._solidFillMulti = {
                enabled: false,
                effectsList : [{
                    enabled : this.hasOwnProperty("_solidFill") && this._solidFill.enabled
                }]
            };
        }

        for (var i = 0; i < rawSolidFillMulti.length; i++) {
            if (i >= this._solidFillMulti.effectsList.length) {
                this._solidFillMulti.effectsList.push({
                    enabled: null
                });
            }

            if (rawSolidFillMulti[i].enabled !== undefined) {
                this._solidFillMulti.effectsList[i] = {
                    enabled: rawSolidFillMulti[i].enabled
                };
            }
        }

        var lengthDifference = this._solidFillMulti.effectsList.length - rawSolidFillMulti.length;
        if (lengthDifference > 0) {
            this._solidFillMulti.effectsList.splice(rawSolidFillMulti.length, lengthDifference);
        }

        this._solidFillMulti.enabled = this._solidFillMulti.effectsList.some(function (effectItem) {
            return (effectItem.enabled === true);
        }, this);

    };

    LayerEffects.prototype._updateSolidFillMulti = function (rawSolidFillMulti) {
        var previous = _clone(this._solidFillMulti);
        this._setSolidFillMulti(rawSolidFillMulti);

        return {
            previous: previous
        };
    };

    LayerEffects.prototype._setGradientFill = function (rawGradientFill) {
        if (!this.hasOwnProperty("_gradientFill")) {
            this._gradientFill = {
                enabled: false
            };
        }
        this._gradientFill.enabled = rawGradientFill.enabled;
    };

    LayerEffects.prototype._updateGradientFill = function (rawGradientFill) {
        var previous = _clone(this._gradientFill);
        this._setGradientFill(rawGradientFill);

        return {
            previous: previous
        };
    };

    LayerEffects.prototype._setGradientFillMulti = function (rawGradientFillMulti) {
        if (!this.hasOwnProperty("_gradientFillMulti")) {
            this._gradientFillMulti = {
                enabled: false,
                effectsList : [{
                    enabled : this.hasOwnProperty("_gradientFill") && this._gradientFill.enabled
                }]
            };
        }

        for (var i = 0; i < rawGradientFillMulti.length; i++) {
            if (i >= this._gradientFillMulti.effectsList.length) {
                this._gradientFillMulti.effectsList.push({
                    enabled: null
                });
            }

            if (rawGradientFillMulti[i].enabled !== undefined) {
                this._gradientFillMulti.effectsList[i] = {
                    enabled: rawGradientFillMulti[i].enabled
                };
            }
        }

        var lengthDifference = this._gradientFillMulti.effectsList.length - rawGradientFillMulti.length;
        if (lengthDifference > 0) {
            this._gradientFillMulti.effectsList.splice(rawGradientFillMulti.length, lengthDifference);
        }

        this._gradientFillMulti.enabled = this._gradientFillMulti.effectsList.some(function (effectItem) {
            return (effectItem.enabled === true);
        }, this);

    };

    LayerEffects.prototype._updateGradientFillMulti = function (rawGradientFillMulti) {
        var previous = _clone(this._gradientFillMulti);
        this._setGradientFillMulti(rawGradientFillMulti);

        return {
            previous: previous
        };
    };

    LayerEffects.prototype._setPatternFill = function (rawPatternFill) {
        if (!this.hasOwnProperty("_patternFill")) {
            this._patternFill = {
                enabled: false
            };
        }
        this._patternFill.enabled = rawPatternFill.enabled;
    };

    LayerEffects.prototype._updatePatternFill = function (rawPatternFill) {
        var previous = _clone(this._patternFill);
        this._setPatternFill(rawPatternFill);

        return {
            previous: previous
        };
    };

    LayerEffects.prototype._setInnerGlow = function (rawInnerGlow) {
        if (!this.hasOwnProperty("_innerGlow")) {
            this._innerGlow = {
                enabled: false
            };
        }
        this._innerGlow.enabled = rawInnerGlow.enabled;
    };

    LayerEffects.prototype._updateInnerGlow = function (rawInnerGlow) {
        var previous = _clone(this._innerGlow);
        this._setInnerGlow(rawInnerGlow);

        return {
            previous: previous
        };
    };

    LayerEffects.prototype._setOuterGlow = function (rawOuterGlow) {
        if (!this.hasOwnProperty("_outerGlow")) {
            this._outerGlow = {
                enabled: false
            };
        }
        this._outerGlow.enabled = rawOuterGlow.enabled;
    };

    LayerEffects.prototype._updateOuterGlow = function (rawOuterGlow) {
        var previous = _clone(this._outerGlow);
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

        if (rawChange.hasOwnProperty("frameFXMulti")) {
            changes.frameFXMulti = this._updateFrameFXMulti(rawChange.frameFXMulti);
        }

        if (rawChange.hasOwnProperty("chromeFX")) {
            changes.chromeFX = this._updateChromeFX(rawChange.chromeFX);
        }

        if (rawChange.hasOwnProperty("innerShadow")) {
            changes.innerShadow = this._updateInnerShadow(rawChange.innerShadow);
        }

        if (rawChange.hasOwnProperty("innerShadowMulti")) {
            changes.innerShadowMulti = this._updateInnerShadowMulti(rawChange.innerShadowMulti);
        }

        if (rawChange.hasOwnProperty("dropShadow")) {
            changes.dropShadow = this._updateDropShadow(rawChange.dropShadow);
        }

        if (rawChange.hasOwnProperty("dropShadowMulti")) {
            changes.dropShadowMulti = this._updateDropShadowMulti(rawChange.dropShadowMulti);
        }

        if (rawChange.hasOwnProperty("solidFill")) {
            changes.solidFill = this._updateSolidFill(rawChange.solidFill);
        }

        if (rawChange.hasOwnProperty("solidFillMulti")) {
            changes.solidFillMulti = this._updateSolidFillMulti(rawChange.solidFillMulti);
        }

        if (rawChange.hasOwnProperty("gradientFill")) {
            changes.gradientFill = this._updateGradientFill(rawChange.gradientFill);
        }

        if (rawChange.hasOwnProperty("gradientFillMulti")) {
            changes.gradientFillMulti = this._updateGradientFillMulti(rawChange.gradientFillMulti);
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

    LayerEffects.prototype.isEnabled = function (property) {
        if (property === undefined) {
            for (property in this) {
                if (this.hasOwnProperty(property)) {
                    if (this[property].enabled === true) {
                        return true;
                    }
                }
            }
            return false;
        }

        return this[property].enabled;
    };

    LayerEffects.prototype.toRaw = function () {
        return Raw.toRaw(this, [
            "enabled",
            "bevelEmboss",
            "frameFX",
            "frameFXMulti",
            "chromeFX",
            "dropShadow",
            "dropShadowMulti",
            "innerShadow",
            "innerShadowMulti",
            "solidFill",
            "solidFillMulti",
            "gradientFill",
            "gradientFillMulti",
            "patternFill",
            "innerGlow",
            "outerGlow"
        ]);
    };

    module.exports = LayerEffects;
}());
