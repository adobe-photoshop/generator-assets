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

    var util = require("util"),
        assert = require("assert");

    var Bounds = require("./bounds"),
        Mask = require("./mask"),
        Path = require("./path"),
        LayerEffects = require("./layereffects"),
        Raw = require("./raw");

    var EXACT_BOUNDS_SETTINGS = {
        boundsOnly: true
    };

    var _setSmartObject = function (raw) {
        this._smartObject = raw;
    };

    var _updateSmartObject = function (raw) {
        var previous = this._smartObject;
        this._setSmartObject(raw);

        return {
            previous: previous
        };
    };

    var _setFill = function (raw) {
        this._fill = raw;
    };

    var _updateFill = function (raw) {
        var previous = this._fill;
        this._setFill(raw);

        return {
            previous: previous
        };
    };

    /**
     * Abstract base class for representing layers in a document. This should not
     * be instantiated directly.
     * 
     * @constructor
     * @private
     * @param {Document} document
     * @param {?LayerGroup} group The parent layer group of this layer. Null if the layer
     *      is directly contained by the Document.
     * @param {object} raw Raw description of the layer.
     */
    function BaseLayer(document, group, raw) {
        this._document = document;
        this._logger = document._logger;

        if (group) {
            this._setGroup(group);
        }

        var handledProperties = this._handledProperties || {},
            property;

        for (property in raw) {
            if (raw.hasOwnProperty(property) && !handledProperties.hasOwnProperty(property)) {
                switch (property) {
                case "id":
                    this._id = raw.id;
                    break;
                case "name":
                    this._setName(raw.name);
                    break;
                case "bounds":
                    this._setBounds(raw.bounds);
                    break;
                case "boundsWithFX":
                    this._setBoundsWithFX(raw.boundsWithFX);
                    break;
                case "visible":
                    this._setVisible(raw.visible);
                    break;
                case "clipped":
                    this._setClipped(raw.clipped);
                    break;
                case "mask":
                    this._setMask(raw.mask);
                    break;
                case "layerEffects":
                    this._setLayerEffects(raw.layerEffects);
                    break;
                case "generatorSettings":
                    this._setGeneratorSettings(raw.generatorSettings);
                    break;
                case "blendOptions":
                    this._setBlendOptions(raw.blendOptions);
                    break;
                case "protection":
                    this._setProtection(raw.protection);
                    break;
                case "path":
                    this._setPath(raw.path);
                    break;
                case "type":
                    this._setType(raw.type);
                    break;
                case "index":
                case "added":
                    // ignore these properties
                    break;
                default:
                    this._logger.warn("Unhandled property in raw constructor:", property, raw[property]);
                }
            }
        }
    }

    Object.defineProperties(BaseLayer.prototype, {
        "document": {
            get: function () { return this._document; },
            set: function () { throw new Error("Cannot set document"); }
        },
        "id": {
            get: function () { return this._id; },
            set: function () { throw new Error("Cannot set id"); }
        },
        "name": {
            get: function () { return this._name; },
            set: function () { throw new Error("Cannot set name"); }
        },
        "bounds": {
            get: function () { return this._bounds; },
            set: function () { throw new Error("Cannot set bounds"); }
        },
        "boundsWithFX": {
            get: function () { return this._boundsWithFX; },
            set: function () { throw new Error("Cannot set boundsWithFX"); }
        },
        "visible": {
            get: function () { return this._visible; },
            set: function () { throw new Error("Cannot set visible"); }
        },
        "clipped": {
            get: function () { return this._clipped; },
            set: function () { throw new Error("Cannot set clipped"); }
        },
        "mask": {
            get: function () { return this._mask; },
            set: function () { throw new Error("Cannot set mask"); }
        },
        "layerEffects": {
            get: function () { return this._layerEffects; },
            set: function () { throw new Error("Cannot set layerEffects"); }
        },
        "generatorSettings": {
            get: function () { return this._generatorSettings; },
            set: function () { throw new Error("Cannot set generatorSettings"); }
        },
        "blendOptions": {
            get: function () { return this._blendOptions; },
            set: function () { throw new Error("Cannot set blendOptions"); }
        },
        "protection": {
            get: function () { return this._protection; },
            set: function () { throw new Error("Cannot set protection"); }
        },
        "path": {
            get: function () { return this._path; },
            set: function () { throw new Error("Cannot set path"); }
        },
        "group": {
            get: function () { return this._group; },
            set: function () { throw new Error("Cannot set group"); }
        },
        "type": {
            get: function () { return this._type; },
            set: function () { throw new Error("Cannot set type"); }
        }
    });

    BaseLayer.prototype._document = null;

    BaseLayer.prototype._group = null;
    
    BaseLayer.prototype._type = null;

    BaseLayer.prototype._id = null;

    BaseLayer.prototype._name = null;

    BaseLayer.prototype._bounds = null;

    BaseLayer.prototype._boundsWithFX = null;

    BaseLayer.prototype._visible = null;

    BaseLayer.prototype._clipped = null;

    BaseLayer.prototype._mask = null;

    BaseLayer.prototype._layerEffects = null;

    BaseLayer.prototype._generatorSettings = null;

    BaseLayer.prototype._blendOptions = null;

    BaseLayer.prototype._protection = null;

    BaseLayer.prototype._path = null;

    BaseLayer.prototype._setGroup = function (group) {
        this._group = group;
    };
    
    BaseLayer.prototype._setType = function (type) {
        this._type = type;
    };

    BaseLayer.prototype._setName = function (rawName) {
        this._name = rawName;
    };

    BaseLayer.prototype._updateName = function (rawName) {
        var previous = this._name;
        this._setName(rawName);

        return {
            previous: previous
        };
    };

    BaseLayer.prototype._setBounds = function (rawBounds) {
        this._bounds = new Bounds(rawBounds);
    };

    BaseLayer.prototype._updateBounds = function (rawBounds) {
        return this._bounds._applyChange(rawBounds);
    };

    BaseLayer.prototype._setBoundsWithFX = function (rawBoundsWithFX) {
        this._boundsWithFX = new Bounds(rawBoundsWithFX);
    };

    BaseLayer.prototype._updateBoundsWithFX = function (rawBoundsWithFX) {
        return this._bounds._applyChange(rawBoundsWithFX);
    };

    BaseLayer.prototype._setVisible = function (rawVisible) {
        this._visible = rawVisible;
    };

    BaseLayer.prototype._updateVisible = function (rawVisible) {
        var previous = this._visible;
        this._setVisible(rawVisible);

        return {
            previous: previous
        };
    };

    BaseLayer.prototype._setClipped = function (rawClipped) {
        this._clipped = rawClipped;
    };

    BaseLayer.prototype._updateClipped = function (rawClipped) {
        var previous = this._clipped;
        this._setClipped(rawClipped);

        return {
            previous: previous
        };
    };

    BaseLayer.prototype._setMask = function (rawMask) {
        this._mask = new Mask(this._document, rawMask);
    };

    BaseLayer.prototype._updateMask = function (rawMask) {
        if (rawMask.removed) {
            var previous = this._mask;

            delete this._mask;
            return {
                previous: previous
            };
        } else if (this._mask) {
            return this._mask._applyChange(rawMask);
        } else {
            this._setMask(rawMask);
            return {
                previous: null
            };
        }
    };

    BaseLayer.prototype._setLayerEffects = function (rawLayerEffects) {
        this._layerEffects = new LayerEffects(this._document, rawLayerEffects);
    };

    BaseLayer.prototype._updateLayerEffects = function (rawLayerEffects) {
        if (this._layerEffects) {
            return this._layerEffects._applyChange(rawLayerEffects);
        } else {
            this._setLayerEffects(rawLayerEffects);

            return {
                previous: null
            };
        }
    };

    BaseLayer.prototype._setGeneratorSettings = function (rawGeneratorSettings) {
        this._generatorSettings = rawGeneratorSettings;
    };

    BaseLayer.prototype._updateGeneratorSettings = function (rawGeneratorSettings) {
        var previous = this._generatorSettings;
        this._setGeneratorSettings(rawGeneratorSettings);

        return {
            previous: previous
        };
    };

    BaseLayer.prototype._setBlendOptions = function (raw) {
        this._blendOptions = raw;
    };

    BaseLayer.prototype._updateBlendOptions = function (raw) {
        var previous = this._blendOptions;
        this._setBlendOptions(raw);

        return {
            previous: previous
        };
    };

    BaseLayer.prototype._setProtection = function (raw) {
        this._protection = raw;
    };

    BaseLayer.prototype._updateProtection = function (raw) {
        var previous = this._protection;
        this._setProtection(raw);

        return {
            previous: previous
        };
    };

    BaseLayer.prototype._setPath = function (raw) {
        this._path = new Path(this._document, raw);
    };

    BaseLayer.prototype._updatePath = function (raw) {
        if (raw.removed) {
            var previous = this._path;

            delete this._path;
            return {
                previous: previous
            };
        } else if (this._path) {
            return this._path._applyChange(raw);
        } else {
            this._setMask(raw);
            return {
                previous: null
            };
        }
    };

    BaseLayer.prototype.toString = function () {
        return this.id + ":" + (this.name || "-");
    };

    BaseLayer.prototype.getSize = function () {
        return 1;
    };

    BaseLayer.prototype._detach = function () {
        if (!this.group) {
            return;
        }

        var parent = this.group,
            id = this.id,
            index = -1;

        parent.layers.some(function (child, i) {
            if (child.id === id) {
                index = i;
                return true;
            }
        }, this);

        assert(index > -1, "Unable to detach layer from parent");
        parent.layers.splice(index, 1);
    };

    /**
     * Update this layer object with the given raw change description and return
     * a set of change descriptions, keyed by property that changed.
     *
     * @private
     * @param {object} rawChange
     * @return {{string: object}}
     */
    BaseLayer.prototype._applyChange = function (rawChange) {
        assert.strictEqual(this.id, rawChange.id, "Layer ID mismatch: this " + this.id + "; change " + rawChange.id);

        if (rawChange.hasOwnProperty("changed")) {
            throw new Error("Unknown change");
        }

        var handledProperties = this._handledProperties || {},
            handledEvents = this._handledEvents || {},
            changes = {},
            change,
            property;

        for (property in rawChange) {
            if (rawChange.hasOwnProperty(property) &&
                !handledProperties.hasOwnProperty(property) &&
                !handledEvents.hasOwnProperty(property)) {
                switch (property) {
                case "id":
                    // do nothing
                    break;
                case "name":
                    change = this._updateName(rawChange.name);
                    if (change) {
                        changes.name = change;
                    }
                    break;
                case "bounds":
                    change = this._updateBounds(rawChange.bounds);
                    if (change) {
                        changes.bounds = change;
                    }
                    break;
                case "boundsWithFX":
                    change = this._updateBoundsWithFX(rawChange.boundsWithFX);
                    if (change) {
                        changes.boundsWithFX = change;
                    }
                    break;
                case "visible":
                    change = this._updateVisible(rawChange.visible);
                    if (change) {
                        changes.visible = change;
                    }
                    break;
                case "clipped":
                    change = this._updateClipped(rawChange.clipped);
                    if (change) {
                        changes.clipped = change;
                    }
                    break;
                case "mask":
                    change = this._updateMask(rawChange.mask);
                    if (change) {
                        changes.mask = change;
                    }
                    break;
                case "layerEffects":
                    change = this._updateLayerEffects(rawChange.layerEffects);
                    if (change) {
                        changes.layerEffects = change;
                    }
                    break;
                case "generatorSettings":
                    change = this._updateGeneratorSettings(rawChange.generatorSettings);
                    if (change) {
                        changes.generatorSettings = change;
                    }
                    break;
                case "blendOptions":
                    change = this._updateBlendOptions(rawChange.blendOptions);
                    if (change) {
                        changes.blendOptions = change;
                    }
                    break;
                case "protection":
                    change = this._updateProtection(rawChange.protection);
                    if (change) {
                        changes.protection = change;
                    }
                    break;
                case "path":
                    change = this._updatePath(rawChange.path);
                    if (change) {
                        changes.path = change;
                    }
                    break;
                case "metaDataOnly":
                    changes.metaDataOnly = !!rawChange.metaDataOnly;
                    break;
                case "added":
                case "removed":
                case "type":
                case "index":
                case "layersAdjusted":
                case "clipGroup":
                    // handled elsewhere; do nothing
                    break;
                default:
                    this._logger.warn("Unhandled property in raw change:", property, rawChange[property]);
                }
            }
        }

        return changes;
    };

    /**
     * Apply the given visitor function to this layer, returning the return
     * value from that application.
     * 
     * @param {function(BaseLayer): boolean} visitor
     * @return {boolean} Whether the parent should halt visitation
     */
    BaseLayer.prototype.visit = function (visitor) {
        return visitor(this);
    };

    /**
     * Asynchonously request exact bounds for the given layer. This is a
     * relatively expensive operation. Ideally, the outcome would be cached and
     * reused, and cleared when this layer or any dependent layer is changed.
     * 
     * @param {boolean} cache Whether to update this layers bounds with the result
     * @return {Promise.<Bounds>}
     */
    BaseLayer.prototype.getExactBounds = function (cache) {
        var document = this._document,
            generator = document._generator;

        return generator.getPixmap(document.id, this.id, EXACT_BOUNDS_SETTINGS)
            .get("bounds")
            .then(function (rawBounds) {
                if (cache) {
                    this._updateBounds(rawBounds);
                }
                return new Bounds(rawBounds);
            }.bind(this));
    };

    /**
     * Get the set of layers that are dependent on this layer. Currently just
     * returns a set of layers that includes this layer and all its parents, as
     * well as the next sibling layer if this layer is clipped.
     *
     * @param {{number: Layer}=} dependents Accumulation parameter; internal only.
     * @return {{number: Layer}} The set of dependent layers, which may include
     *      this layer, indexed by Layer ID.
     */
    BaseLayer.prototype.getDependentLayers = function (dependents) {
        dependents = dependents || {};

        // Ignore the top-level layer group
        if (this.document.layers !== this) {
            dependents[this.id] = this;
        }

        if (this.group) {
            this.group.getDependentLayers(dependents);

            if (this.clipped) {
                var id = this.id,
                    localIndex = -1,
                    sibling;

                this.group.layers.some(function (layer, index) {
                    if (layer.id === id) {
                        localIndex = index;
                        return true;
                    }
                }, this);

                if (this.group.layers.length > localIndex + 1) {
                    sibling = this.group.layers[localIndex + 1];
                    dependents[sibling.id] = sibling;
                }
            }
        }

        return dependents;
    };
    
    /**
     * Gets the bounds of the regular bitmap layer mask if one is applied. If no mask is applied
     * or the mask is disabled then it returns undefined
     *
     * @return {{Bounds} || undefined } The bounds of the bitmap mask or undefined if not mask
     */
    BaseLayer.prototype.getBitmapMaskBounds = function () {
        return this.mask && this.mask.enabled && this.mask.bounds;
    };
        
    /**
     * Gets the bounds of the vector mask if one is applied. If no vector mask is applied
     * then it returns undefined
     *
     * @return {{Bounds} || undefined } The bounds of the vector mask or undefined if not mask
     */
    BaseLayer.prototype.getVectorMaskBounds = function () {
        return this.path && this.path.bounds;
    };
    
    /**
     * Gets the union of the layer mask and layer vector mask for the total area that 
     * should be masked
     *
     * @return {{Bounds} || undefined } The bounds of the vector mask or undefined if not mask
     */
    BaseLayer.prototype.getTotalMaskBounds = function () {
        var maskBounds = this.getBitmapMaskBounds(),
            vectorMaskBounds = this.getVectorMaskBounds();
        if (maskBounds && maskBounds.isEmpty()) {
            maskBounds = undefined;
        }
        if (vectorMaskBounds && vectorMaskBounds.isEmpty()) {
            vectorMaskBounds = undefined;
        }
        if (maskBounds && vectorMaskBounds) {
            return maskBounds.union(vectorMaskBounds);
        }
        
        return maskBounds || vectorMaskBounds;
    };

    BaseLayer.prototype.toRaw = function () {
        return Raw.toRaw(this, [
            "id",
            "name",
            "bounds",
            "boundsWithFX",
            "visible",
            "clipped",
            "mask",
            "layerEffects",
            "generatorSettings",
            "blendOptions",
            "protection",
            "path",
            "type"
        ]);
    };
    

    function Layer(document, group, raw) {
        BaseLayer.call(this, document, group, raw);

        if (raw.hasOwnProperty("smartObject")) {
            this._setSmartObject(raw.smartObject);
        }
    }
    util.inherits(Layer, BaseLayer);

    Object.defineProperties(Layer.prototype, {
        "smartObject": {
            get: function () { return this._smartObject; },
            set: function () { throw new Error("Cannot set smartObject"); }
        }
    });

    Layer.prototype._handledProperties = {
        "pixels": true,
        "smartObject": true
    };

    Layer.prototype._handledEvents = {
        "pixels": true
    };

    Layer.prototype._setSmartObject = _setSmartObject;

    Layer.prototype._updateSmartObject = _updateSmartObject;

    Layer.prototype._applyChange = function (raw) {
        var changes = BaseLayer.prototype._applyChange.call(this, raw),
            change;

        if (raw.hasOwnProperty("smartObject")) {
            change = this._updateSmartObject(raw.smartObject);
            if (change) {
                changes.smartObject = change;
            }
        }

        if (raw.hasOwnProperty("pixels")) {
            changes.pixels = !!raw.pixels;
        }

        if (Object.keys(changes).length > 0) {
            return changes;
        }
    };

    Layer.prototype.toRaw = function () {
        var baseLayer = BaseLayer.prototype.toRaw.call(this);
        var layer = Raw.toRaw(this, [
            "smartObject"
        ]);
        Raw.assign(layer, baseLayer);
        return layer;
    };

    function BackgroundLayer(document, group, raw) {
        BaseLayer.call(this, document, group, raw);
    }
    util.inherits(BackgroundLayer, BaseLayer);

    BackgroundLayer.prototype._handledProperties = {
        "pixels": true
    };

    BackgroundLayer.prototype._handledEvents = {
        "pixels": true
    };

    BackgroundLayer.prototype._applyChange = function (raw) {
        var changes = BaseLayer.prototype._applyChange.call(this, raw);

        if (raw.hasOwnProperty("pixels")) {
            changes.pixels = !!raw.pixels;
        }

        if (Object.keys(changes).length > 0) {
            return changes;
        }
    };

    function ShapeLayer(document, group, raw) {
        BaseLayer.call(this, document, group, raw);

        if (raw.hasOwnProperty("fill")) {
            this._setFill(raw.fill);
        }

        if (raw.hasOwnProperty("strokeStyle")) {
            this._setStrokeStyle(raw.strokeStyle);
        }
    }
    util.inherits(ShapeLayer, BaseLayer);

    Object.defineProperties(ShapeLayer.prototype, {
        "fill": {
            get: function () { return this._fill; },
            set: function () { throw new Error("Cannot set fill"); }
        },
        "strokeStyle": {
            get: function () { return this._strokeStyle; },
            set: function () { throw new Error("Cannot set strokeStyle"); }
        }
    });

    ShapeLayer.prototype._handledProperties = {
        "fill": true,
        "strokeStyle": true
    };

    ShapeLayer.prototype._setFill = _setFill;

    ShapeLayer.prototype._updateFill = _updateFill;

    ShapeLayer.prototype._setStrokeStyle = function (raw) {
        this._strokeStyle = raw;
    };

    ShapeLayer.prototype._updateStrokeStyle = function (raw) {
        var previous = this._strokeStyle;
        this._setStrokeStyle(raw);

        return {
            previous: previous
        };
    };

    ShapeLayer.prototype._applyChange = function (raw) {
        var changes = BaseLayer.prototype._applyChange.call(this, raw),
            change;

        if (raw.hasOwnProperty("fill")) {
            change = this._updateFill(raw.fill);
            if (change) {
                changes.fill = change;
            }
        }

        if (raw.hasOwnProperty("strokeStyle")) {
            change = this._updateStrokeStyle(raw.strokeStyle);
            if (change) {
                changes.strokeStyle = change;
            }
        }

        if (Object.keys(changes).length > 0) {
            return changes;
        }
    };

    ShapeLayer.prototype.toRaw = function () {
        var baseLayer = BaseLayer.prototype.toRaw.call(this);
        var layer = Raw.toRaw(this, [
            "fill",
            "strokeStyle"
        ]);
        Raw.assign(layer, baseLayer);
        return layer;
    };
    
    /**
     * Overrides the base implemenation because shape layers don't have vector masks, the 
     * path property describes the shape itself
     *
     * @return { undefined } always undefined for shape layers
     */
    ShapeLayer.prototype.getVectorMaskBounds = function () {
        return undefined;
    };

    function TextLayer(document, group, raw) {
        BaseLayer.call(this, document, group, raw);

        if (raw.hasOwnProperty("text")) {
            this._setText(raw.text);
        }
    }
    util.inherits(TextLayer, BaseLayer);

    Object.defineProperties(TextLayer.prototype, {
        "text": {
            get: function () { return this._text; },
            set: function () { throw new Error("Cannot set text"); }
        }
    });

    TextLayer.prototype._handledProperties = {
        "text": true
    };

    TextLayer.prototype._setText = function (raw) {
        this._text = raw;
    };

    TextLayer.prototype._updateText = function (raw) {
        var previous = this._text;
        this._setText(raw);

        return {
            previous: previous
        };
    };

    TextLayer.prototype._applyChange = function (raw) {
        var changes = BaseLayer.prototype._applyChange.call(this, raw),
            change;

        if (raw.hasOwnProperty("text")) {
            change = this._updateText(raw.text);
            if (change) {
                changes.text = change;
            }
        }

        if (Object.keys(changes).length > 0) {
            return changes;
        }
    };

    TextLayer.prototype.toRaw = function () {
        var baseLayer = BaseLayer.prototype.toRaw.call(this);
        var layer = Raw.toRaw(this, [
            "text"
        ]);
        Raw.assign(layer, baseLayer);
        return layer;
    };

    function AdjustmentLayer(document, group, raw) {
        BaseLayer.call(this, document, group, raw);

        this._setAdjustment(raw.adjustment);
    }
    util.inherits(AdjustmentLayer, BaseLayer);

    Object.defineProperties(AdjustmentLayer.prototype, {
        "adjustment": {
            get: function () { return this._adjustment; },
            set: function () { throw new Error("Cannot set adjustment"); }
        }
    });

    AdjustmentLayer.prototype._handledProperties = {
        "adjustment": true,
        "fill": true
    };

    AdjustmentLayer.prototype._setAdjustment = function (raw) {
        this._adjustment = raw;
    };

    AdjustmentLayer.prototype._updateAdjustment = function (raw) {
        var previous = this._adjustment;
        this._setAdjustment(raw);

        return {
            previous: previous
        };
    };

    AdjustmentLayer.prototype.getDependentLayers = function () {
        var dependents = BaseLayer.prototype.getDependentLayers.call(this);

        if (!this.clipped) {
            this.document.layers.visit(function (layer) {
                if (this.id === layer.id) {
                    return true;
                }

                dependents[layer.id] = layer;
            }.bind(this));
        }
        

        return dependents;
    };

    AdjustmentLayer.prototype._setFill = _setFill;

    AdjustmentLayer.prototype._updateFill = _updateFill;

    AdjustmentLayer.prototype._applyChange = function (raw) {
        var changes = BaseLayer.prototype._applyChange.call(this, raw),
            change;

        if (raw.hasOwnProperty("adjustment")) {
            change = this._updateAdjustment(raw.adjustment);
            if (change) {
                changes.adjustment = change;
            }
        }

        if (Object.keys(changes).length > 0) {
            return changes;
        }
    };

    AdjustmentLayer.prototype.toRaw = function () {
        var baseLayer = BaseLayer.prototype.toRaw.call(this);
        var layer = Raw.toRaw(this, [
            "adjustment"
        ]);
        Raw.assign(layer, baseLayer);
        return layer;
    };

    function SmartObjectLayer(document, group, raw) {
        BaseLayer.call(this, document, group, raw);

        this._setSmartObject(raw.smartObject);
        this._setTimeContent(raw.timeContent);
    }
    util.inherits(SmartObjectLayer, BaseLayer);

    Object.defineProperties(SmartObjectLayer.prototype, {
        "smartObject": {
            get: function () { return this._smartObject; },
            set: function () { throw new Error("Cannot set fill"); }
        },
        "timeContent": {
            get: function () { return this._timeContent; },
            set: function () { throw new Error("Cannot set timeContent"); }
        }
    });

    SmartObjectLayer.prototype._handledProperties = {
        "smartObject": true,
        "timeContent": true
    };

    SmartObjectLayer.prototype._setSmartObject = _setSmartObject;

    SmartObjectLayer.prototype._updateSmartObject = _updateSmartObject;

    SmartObjectLayer.prototype._setTimeContent = function (raw) {
        this._timeContent = raw;
    };

    SmartObjectLayer.prototype._updateTimeContent = function (raw) {
        var previous = this._timeContent;
        this._setTimeContent(raw);

        return {
            previous: previous
        };
    };

    SmartObjectLayer.prototype._applyChange = function (raw) {
        var changes = BaseLayer.prototype._applyChange.call(this, raw),
            change;

        if (raw.hasOwnProperty("smartObject")) {
            change = this._updateSmartObject(raw.smartObject);
            if (change) {
                changes.smartObject = change;
            }
        }

        if (raw.hasOwnProperty("timeContent")) {
            change = this._updateTimeContent(raw.timeContent);
            if (change) {
                changes.timeContent = change;
            }
        }

        if (Object.keys(changes).length > 0) {
            return changes;
        }
    };

    SmartObjectLayer.prototype.toRaw = function () {
        var baseLayer = BaseLayer.prototype.toRaw.call(this);
        var layer = Raw.toRaw(this, [
            "smartObject",
            "timeContent"
        ]);
        Raw.assign(layer, baseLayer);
        return layer;
    };

    /**
     * Represents a LayerGroup. 
     * 
     * @extends BaseLayer
     * @constructor
     * @param {Document} document The parent document for this LayerGroup
     * @param {?LayerGroup} group The parent LayerGroup for this LayerGroup, null
     *      only if this is the top-level LayerGroup associated with a Document. 
     * @param {object} raw The raw description of the LayerGroup used for initialization.
     */
    function LayerGroup(document, group, raw) {
        BaseLayer.call(this, document, group, raw);

        var targetIndex = 0;

        this.layers = [];
        if (raw.hasOwnProperty("layers")) {
            raw.layers
                .sort(function (l1, l2) {
                    return l1.index - l2.index;
                })
                .forEach(function (rawLayer) {
                    var layer = createLayer(this.document, this, rawLayer);

                    targetIndex += layer.getSize() - 1;

                    this.addLayerAtIndex(layer, targetIndex);

                    targetIndex++;
                }, this);
        }
    }
    util.inherits(LayerGroup, BaseLayer);

    LayerGroup.prototype._handledProperties = {
        "layers": true
    };

    /**
     * The total size of the LayerGroup and all of its children, where the size
     * of a LayerGroup is the sum of the sizes of its children + 2, and the size
     * of a non-group layer is 1.
     * 
     * @see BaseLayer.prototype.getSize
     * @return {number} The size of the LayerGroup
     */
    LayerGroup.prototype.getSize = function () {
        return this.layers.reduce(function (size, layer) {
            return size + layer.getSize();
        }, 2);
    };

    LayerGroup.prototype.toString = function () {
        var result = BaseLayer.prototype.toString.call(this),
            length = this.layers.length;

        result += " [";
        this.layers.forEach(function (layer, index) {
            result += layer.toString();
            if (index !== length - 1) {
                result += ", ";
            }
        });
        result += "]";

        return result;
    };

    /**
     * Attach a new child layer under this LayerGroup at a given index. Not all
     * indices are valid for all LayerGroups and child layers; an exception is
     * raised if the index is invalid. If the child layer is successfully attached,
     * the child's group property is set to this LayerGroup.
     * 
     * @param {Layer} childToAdd The child layer to add to this LayerGroup
     * @param {number} targetIndex The index at which to attach the child
     */
    LayerGroup.prototype.addLayerAtIndex = function (childToAdd, targetIndex) {
        var currentIndex = childToAdd.getSize() - 1,
            nextIndex = currentIndex,
            child;

        // Invariant: currentIndex <= targetIndex
        var index;
        for (index = 0; index < this.layers.length; index++) {
            if (targetIndex <= currentIndex) {
                break;
            }

            // currentIndex < targetIndex
            child = this.layers[index];
            nextIndex += child.getSize();

            // nextIndex <= targetIndex
            if (targetIndex < nextIndex && child instanceof LayerGroup) {
                // currentIndex < targetIndex < nextIndex
                child.addLayerAtIndex(childToAdd, targetIndex - (currentIndex + 1));
                return;
            }

            //currentIndex <= targetIndex
            currentIndex = nextIndex;
        }

        assert.strictEqual(currentIndex, targetIndex, "Invalid insertion index: " + targetIndex);
        childToAdd._setGroup(this);
        this.layers.splice(index, 0, childToAdd);
    };

    /**
     * Find among this LayerGroup and all of its children a layer at the
     * given index. Returns null if no layer is found.
     * 
     * @param {number} targetIndex Index of the layer to find
     * @return {?Layer} The layer at the given index
     */
    LayerGroup.prototype.findLayerAtIndex = function (targetIndex) {
        if (this.layers.length === 0) {
            return null;
        }

        var child = this.layers[0],
            currentIndex = this.layers[0].getSize() - 1,
            nextIndex = currentIndex;

        if (targetIndex < currentIndex && child instanceof LayerGroup) {
            return child.findLayerAtIndex(targetIndex - 1);
        }

        var index;
        for (index = 1; index < this.layers.length; index++) {
            if (targetIndex <= currentIndex) {
                break;
            }

            child = this.layers[index];
            nextIndex += child.getSize();
            if (targetIndex < nextIndex) {
                return child.findLayerAtIndex(targetIndex - (currentIndex + 2));
            } else {
                currentIndex = nextIndex;
            }
        }

        if (targetIndex === currentIndex) {
            return child;
        }
    };

    /**
     * Find among this LayerGroup and all of its children a layer with the given
     * ID. Returns null if no layer is found; and otherwise a record containing
     * a reference to the layer and its index.
     * 
     * @param {number} id The ID of the layer to find
     * @return {?{layer: Layer, index: number}}
     */
    LayerGroup.prototype.findLayer = function (id) {
        var currentIndex = 0,
            result;

        this.layers.some(function (child) {
            if (child instanceof LayerGroup) {
                currentIndex++;
                result = child.findLayer(id);
                if (result) {
                    result.index += currentIndex;
                    return true;
                } else {
                    currentIndex += child.getSize() - 2;
                }
            }

            if (child.id === id) {
                result = {
                    layer: child,
                    index: currentIndex
                };
                return true;
            }

            currentIndex++;
        });

        return result;
    };

    LayerGroup.prototype._applyChange = function (rawLayerChange, changedLayers, parentIndex) {
        var rawLayerChanges = rawLayerChange.layers;

        if (rawLayerChange.hasOwnProperty("layers")) {
            // Size of the complete layer group, after layer additions
            var finalSize = this.getSize();

            // Apply structural changes in increasing index order
            rawLayerChanges.sort(function (l1, l2) {
                return l1.index - l2.index;
            });

            rawLayerChanges.forEach(function (rawLayerChange) {
                var id = rawLayerChange.id,
                    child;

                if (rawLayerChange.added) {
                    child = createLayer(this.document, this, rawLayerChange);
                    changedLayers[id].layer = child;
                } else {
                    if (!changedLayers.hasOwnProperty(id)) {
                        if (rawLayerChange.removed) {
                            return;
                        } else {
                            throw new Error("Can't find changed layer:", id);
                        }
                    }

                    child = changedLayers[id].layer;
                }

                // recursively apply each child layer's changes
                var changes = child._applyChange(rawLayerChange, changedLayers, rawLayerChange.index);
                if (changes) {
                    changedLayers[child.id].changes = changes;
                }

                // Augment the size of this group with the size of the child to be added
                if (changedLayers[id].type === "added" || changedLayers[id].type === "moved") {
                    finalSize += child.getSize();
                }
            }, this);

            // The offset at which children in this group should be added
            var offset;
            if (parentIndex === undefined) {
                offset = 0;
            } else {
                offset = parentIndex - (finalSize - 2);
            }

            // Add the child at the new index
            rawLayerChanges.forEach(function (rawLayerChange) {
                var id = rawLayerChange.id;
                if (!changedLayers.hasOwnProperty(id)) {
                    return;
                }

                var change = changedLayers[id];
                if (change.type === "added" || change.type === "moved") {
                    var index = rawLayerChange.index,
                        relativeIndex = index - offset,
                        child = change.layer;

                    change.previousGroup = child.group;
                    this.addLayerAtIndex(child, relativeIndex);
                }
            }, this);
        }

        return BaseLayer.prototype._applyChange.call(this, rawLayerChange);
    };

    /**
     * Apply the given visitor function to each layer contained within this
     * LayerGroup, including this LayerGroup itself if it is not the Document's
     * top-level layer group. Visitation is stopped if the visitor function ever
     * returns true. Layers are visited in index order (i.e., from the bottom of
     * the layers panel to the top).
     * 
     * @param {function(BaseLayer): boolean} visitor
     * @return {boolean} Whether visitation was explicitly halted
     */
    LayerGroup.prototype.visit = function (visitor) {
        var terminated = this.layers.some(function (layer) {
            return layer.visit(visitor);
        }, this);

        if (terminated) {
            return true;
        }

        // Do not traverse the top-level layer group
        if (this.document.layers === this) {
            return terminated;
        }

        return BaseLayer.prototype.visit.call(this, visitor);
    };

    LayerGroup.prototype.toRaw = function () {
        var layer = BaseLayer.prototype.toRaw.call(this);
        if (this.layers) {
            layer.layers = this.layers.map(function (layer) {
                return layer.toRaw();
            });
        }
        return layer;
    };

    /**
     * Create a new layer object of the appropriate type for the given raw
     * description. The new layer is not attached to its parent layer. 
     * 
     * @param {Document} document The parent document for the new layer
     * @param {?BaseLayer} parent The parent layer for the new layer
     * @param {object} rawLayer The raw description of the new layer
     * @return {BaseLayer} A subtype of the abstract BaseLayer class.
     */
    function createLayer(document, parent, rawLayer) {
        if (!parent && !rawLayer.hasOwnProperty("type")) {
            return new LayerGroup(document, null, rawLayer);
        }

        switch (rawLayer.type) {
        case "layerSection":
            return new LayerGroup(document, parent, rawLayer);
        case "layer":
            return new Layer(document, parent, rawLayer);
        case "shapeLayer":
            return new ShapeLayer(document, parent, rawLayer);
        case "textLayer":
            return new TextLayer(document, parent, rawLayer);
        case "adjustmentLayer":
            return new AdjustmentLayer(document, parent, rawLayer);
        case "smartObjectLayer":
            return new SmartObjectLayer(document, parent, rawLayer);
        case "backgroundLayer":
            return new BackgroundLayer(document, parent, rawLayer);
        default:
            throw new Error("Unknown layer type:", rawLayer.type);
        }
    }

    exports.createLayer = createLayer;

    exports.Layer = Layer;
    exports.LayerGroup = LayerGroup;
    exports.ShapeLayer = ShapeLayer;
    exports.TextLayer = TextLayer;
    exports.AdjustmentLayer = AdjustmentLayer;
    exports.SmartObjectLayer = SmartObjectLayer;
    exports.BackgroundLayer = BackgroundLayer;
}());
