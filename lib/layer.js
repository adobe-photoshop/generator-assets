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

    var LayerEffects = require("./layereffects");

    var EXACT_BOUNDS_SETTINGS = {
        boundsOnly: true
    };

    function BaseLayer(document, group, raw) {
        this._document = document;
        this._id = raw.id;

        if (group) {
            this._setGroup(group);
        }

        if (raw.hasOwnProperty("name")) {
            this._setName(raw.name);
        }
        
        if (raw.hasOwnProperty("bounds")) {
            this._setBounds(raw.bounds);
        }

        if (raw.hasOwnProperty("boundsWithFX")) {
            this._setBoundsWithFX(raw.boundsWithFX);
        }

        if (raw.hasOwnProperty("visible")) {
            this._setVisible(raw.visible);
        }
        
        if (raw.hasOwnProperty("clipped")) {
            this._setClipped(raw.clipped);
        }

        if (raw.hasOwnProperty("mask")) {
            this._setMask(raw.mask);
        }

        if (raw.hasOwnProperty("layerEffects")) {
            this._setLayerEffects(raw.layerEffects);
        }

        if (raw.hasOwnProperty("generatorSettings")) {
            this._setGeneratorSettings(raw.generatorSettings);
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

    BaseLayer.prototype._clearCachedData = function () {
        this._exactBoundsPromise = null;
    };

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
        this._bounds = rawBounds;
    };

    BaseLayer.prototype._updateBounds = function (rawBounds) {
        var previous = this._bounds;
        this._setBounds(rawBounds);

        return {
            previous: previous
        };
    };

    BaseLayer.prototype._setBoundsWithFX = function (rawBoundsWithFX) {
        this._boundsWithFX = rawBoundsWithFX;
    };

    BaseLayer.prototype._updateBoundsWithFX = function (rawBoundsWithFX) {
        var previous = this._boundsWithFX;
        this._setBoundsWithFX(rawBoundsWithFX);

        return {
            previous: previous
        };
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
        this._mask = rawMask;
    };

    BaseLayer.prototype._updateMask = function (rawMask) {
        var previous = this._mask;
        this._setMask(rawMask);

        return {
            previous: previous
        };
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

    BaseLayer.prototype.toString = function () {
        return this.id + ":" + (this.name || "-");
    };

    BaseLayer.prototype.getSize = function () {
        return 1;
    };

    BaseLayer.prototype.setName = function (name) {
        if (this.name !== name) {
            var previousName = name;
            this.name = name;
            return ["rename", name, previousName];
        }
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

        this._clearCachedData();

        if (rawChange.hasOwnProperty("changed")) {
            throw new Error("Unknown change");
        }

        var changes = {};

        if (rawChange.hasOwnProperty("name")) {
            changes.name = this._updateName(rawChange.name);
        }

        if (rawChange.hasOwnProperty("bounds")) {
            changes.bounds = this._updateBounds(rawChange.bounds);
        }

        if (rawChange.hasOwnProperty("boundsWithFX")) {
            changes.bounds = this._updateBoundsWithFX(rawChange.boundsWithFX);
        }

        if (rawChange.hasOwnProperty("visible")) {
            changes.visible = this._updateVisible(rawChange.visible);
        }
        
        if (rawChange.hasOwnProperty("clipped")) {
            changes.clipped = this._updateClipped(rawChange.clipped);
        }

        if (rawChange.hasOwnProperty("mask")) {
            changes.mask = this._updateMask(rawChange.mask);
        }

        if (rawChange.hasOwnProperty("layerEffects")) {
            changes.layerEffects = this._updateLayerEffects(rawChange.layerEffects);
        }

        if (rawChange.hasOwnProperty("generatorSettings")) {
            changes.generatorSettings = this._updateGeneratorSettings(rawChange.generatorSettings);
        }

        if (rawChange.hasOwnProperty("pixels")) {
            changes.pixels = !!rawChange.pixels;
        }

        if (rawChange.hasOwnProperty("metaDataOnly")) {
            changes.metaDataOnly = !!rawChange.metaDataOnly;
        }

        return changes;
    };

    BaseLayer.prototype.visit = function (visitor) {
        return visitor(this);
    };

    BaseLayer.prototype.getExactBounds = function () {
        if (!this._exactBoundsPromise) {
            var document = this._document,
                generator = document._generator;

            this._exactBoundsPromise = generator.getPixmap(document.id, this.id, EXACT_BOUNDS_SETTINGS)
                .get("bounds")
                .fail(function () {
                    this._clearCachedData();
                }.bind(this))
                .done();
        }

        return this._exactBoundsPromise;
    };

    function Layer(document, group, raw) {
        BaseLayer.call(this, document, group, raw);
        this.pixels = raw.pixels;
    }
    util.inherits(Layer, BaseLayer);

    function BackgroundLayer(document, group, raw) {
        BaseLayer.call(this, document, group, raw);
        this.protection = raw.protection;
        this.pixels = raw.pixels;
    }
    util.inherits(BackgroundLayer, BaseLayer);

    function ShapeLayer(document, group, raw) {
        BaseLayer.call(this, document, group, raw);
        this.fill = raw.fill;
        this.path = raw.path;
    }
    util.inherits(ShapeLayer, BaseLayer);

    function TextLayer(document, group, raw) {
        BaseLayer.call(this, document, group, raw);
        this.text = raw.text;
    }
    util.inherits(TextLayer, BaseLayer);

    function AdjustmentLayer(document, group, raw) {
        BaseLayer.call(this, document, group, raw);
        this.adjustment = raw.adjustment;
    }
    util.inherits(AdjustmentLayer, BaseLayer);

    function SmartObjectLayer(document, group, raw) {
        BaseLayer.call(this, document, group, raw);
        this.smartObject = raw.smartObject;
        this.timeContent = raw.timeContent;
    }
    util.inherits(SmartObjectLayer, BaseLayer);

    function LayerGroup(document, group, raw) {
        BaseLayer.call(this, document, group, raw);
        this.blendOptions = raw.blendOptions;

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
                if (Object.keys(changes).length > 0) {
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
}());