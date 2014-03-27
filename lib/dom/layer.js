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
        LayerEffects = require("./layereffects");

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
                case "index":
                case "type":
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
        "group": {
            get: function () { return this._group; },
            set: function () { throw new Error("Cannot set group"); }
        }
    });

    BaseLayer.prototype._id = null;

    BaseLayer.prototype._name = null;

    BaseLayer.prototype._bounds = null;

    BaseLayer.prototype._visible = null;

    BaseLayer.prototype._clipped = null;

    BaseLayer.prototype._mask = null;

    BaseLayer.prototype._generatorSettings = null;

    BaseLayer.prototype._setGroup = function (group) {
        this._group = group;
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
        this._mask = new Mask(rawMask);
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
        this._layerEffects = new LayerEffects(rawLayerEffects);
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
                case "metaDataOnly":
                    changes.metaDataOnly = !!rawChange.metaDataOnly;
                    break;
                case "added":
                case "removed":
                case "type":
                case "index":
                    // do nothing
                    break;
                default:
                    this._logger.warn("Unhandled property in raw change:", property, rawChange[property]);
                }
            }
        }

        return changes;
    };

    BaseLayer.prototype.visit = function (visitor) {
        return visitor(this);
    };

    BaseLayer.prototype.getExactBounds = function () {
        var document = this._document,
            generator = document._generator;

        return generator.getPixmap(document.id, this.id, EXACT_BOUNDS_SETTINGS)
            .get("bounds")
            .then(function (rawBounds) {
                return new Bounds(rawBounds);
            });
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

        if (raw.hasOwnProperty("path")) {
            this._setPath(raw.path);
        }
    }
    util.inherits(ShapeLayer, BaseLayer);

    Object.defineProperties(ShapeLayer.prototype, {
        "fill": {
            get: function () { return this._fill; },
            set: function () { throw new Error("Cannot set fill"); }
        },
        "path": {
            get: function () { return this._path; },
            set: function () { throw new Error("Cannot set path"); }
        }
    });

    ShapeLayer.prototype._handledProperties = {
        "fill": true,
        "path": true
    };

    ShapeLayer.prototype._setFill = function (raw) {
        this._fill = raw;
    };

    ShapeLayer.prototype._updateFill = function (raw) {
        var previous = this._fill;
        this._setFill(raw);

        return {
            previous: previous
        };
    };

    ShapeLayer.prototype._setPath = function (raw) {
        this._path = raw;
    };

    ShapeLayer.prototype._updatePath = function (raw) {
        var previous = this._path;
        this._setPath(raw);

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

        if (raw.hasOwnProperty("path")) {
            change = this._updatePath(raw.path);
            if (change) {
                changes.path = change;
            }
        }

        if (Object.keys(changes).length > 0) {
            return changes;
        }
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
        "adjustment": true
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

    LayerGroup.prototype.visit = function (visitor) {
        if (BaseLayer.prototype.visit.call(this, visitor)) {
            return true;
        }
            
        return this.layers.some(function (layer) {
            return layer.visit(visitor);
        }, this);
    };

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