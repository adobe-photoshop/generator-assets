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
        assert = require("assert"),
        events = require("events");

    function BaseLayer(group, raw) {
        this.group = group;

        this.id = raw.id;
        this.index = raw.index;
        this.type = raw.type;
        this.name = raw.name;
        this.bounds = raw.bounds;
        this.visible = raw.visible;
        this.clipped = raw.clipped;
        this.mask = raw.mask;
        this.generatorSettings = raw.generatorSettings; // FIXME
    }

    BaseLayer.prototype.toString = function () {
        return "Layer " + this.id + "@" + this.index;
    };

    BaseLayer.prototype.findLayer = function (id) {
        if (this.id === id) {
            return [this];
        }
    };

    BaseLayer.prototype.setName = function (name) {
        if (this.name !== name) {
            var previousName = name;
            this.name = name;
            return ["rename", name, previousName];
        }
    };

    BaseLayer.prototype.applyChange = function (change) {
        assert.strictEqual(this.id, change.id, "Layer ID mismatch.");

        var changes = [],
            result;

        if (change.hasOwnProperty("name")) {
            result = this.setName(change.name);
            if (change) {
                changes.push(changes);
            }
        }

        return changes;
    };

    function Layer(group, raw) {
        BaseLayer.call(this, group, raw);
        this.pixels = raw.pixels;
    }
    util.inherits(Layer, BaseLayer);

    function BackgroundLayer(group, raw) {
        BaseLayer.call(this, group, raw);
        this.protection = raw.protection;
        this.pixels = raw.pixels;
    }
    util.inherits(BackgroundLayer, BaseLayer);

    function ShapeLayer(group, raw) {
        BaseLayer.call(this, group, raw);
        this.fill = raw.fill;
        this.path = raw.path;
    }
    util.inherits(ShapeLayer, BaseLayer);

    function TextLayer(group, raw) {
        BaseLayer.call(this, group, raw);
        this.text = raw.text;
    }
    util.inherits(TextLayer, BaseLayer);

    function AdjustmentLayer(group, raw) {
        BaseLayer.call(this, group, raw);
        this.adjustment = raw.adjustment;
    }
    util.inherits(AdjustmentLayer, BaseLayer);

    function SmartObjectLayer(group, raw) {
        BaseLayer.call(this, group, raw);
        this.smartObject = raw.smartObject;
        this.timeContent = raw.timeContent;
    }
    util.inherits(SmartObjectLayer, BaseLayer);

    function LayerGroup(group, raw) {
        BaseLayer.call(this, group, raw);
        this.blendOptions = raw.blendOptions;

        this.layers = [];
        raw.layers.forEach(function (rawLayer) {
            var layer = createLayer(this, rawLayer);
            this.addLayer(layer);
        }, this);
    }
    util.inherits(LayerGroup, BaseLayer);

    LayerGroup.prototype.toString = function () {
        var result = BaseLayer.prototype.toString.call(this),
            length = this.layers.length;

        if (length > 0) {
            result += " [";
            this.layers.forEach(function (layer, index) {
                result += layer.toString();
                if (index !== length - 1) {
                    result += ", ";
                }
            });
            result += "]";
        }
        return result;
    };

    LayerGroup.prototype.findLayer = function (id) {
        if (this.id === id) {
            return [this];
        } else {
            return this.layers.some(function (layer) {
                var result = layer.findLayer(id);
                if (result) {
                    result.push(this);
                    return result;
                }
            }, this);
        }
    };

    LayerGroup.prototype.addLayer = function (layer) {
        if (!layer.hasOwnProperty("index")) {
            throw new Error("Layer has no index.");
        }

        var index = layer.index,
            layers = this.layers;

        if (layers.length === 0) {
            layers.push(layer);
            return;
        }

        layers.some(function (current) {
            if (index < current.index) {
                layers.splice(index, 0, layer);
                return true;
            } else if (index === current.index) {
                throw new Error("Layer already exists at the specified index.");
            }
        }, this);
    };

    function createLayer(parent, rawLayer) {
        switch (rawLayer.type) {
            case "layerSection":
                return new LayerGroup(parent, rawLayer);
            case "layer":
                return new Layer(parent, rawLayer);
            case "shapeLayer":
                return new ShapeLayer(parent, rawLayer);
            case "textLayer":
                return new TextLayer(parent, rawLayer);
            case "adjustmentLayer":
                return new AdjustmentLayer(parent, rawLayer);
            case "smartObjectLayer":
                return new SmartObjectLayer(parent, rawLayer);
            case "backgroundLayer":
                return new BackgroundLayer(parent, rawLayer);
            default:
                throw new Error("Unknown layer type:", rawLayer.type);
        }
    }

    function Document(raw) {
        this.version = raw.version;
        this.timeStamp = raw.timeStamp;
        this.count = raw.count;
        this.id = raw.id;

        this.setFile(raw.file);

        if (raw.hasOwnProperty("bounds")) {
            this.setBounds(raw.bounds);
        }

        if (raw.hasOwnProperty("selection")) {
            this.setSelection(raw.selection);
        }

        this.resolution = raw.resolution;
        this.globalLight = raw.globalLight;
        this.generatorSettings = raw.generatorSettings; // FIXME

        this.layers = raw.layers.map(function (rawLayer) {
            return createLayer(this, rawLayer);
        }, this);

        this.placed = raw.placed;
        this.comps = raw.comps;
    }

    util.inherits(Document, events.EventEmitter);

    Document.prototype.setSelection = function (selection) {
        var previousSelection = Object.keys(this.selection || {}),
            disequal = previousSelection.length !== selection.length ||
                previousSelection.some(function (sel, ind) {
                    return sel !== selection[ind];
                });

        if (disequal) {
            this.selection = selection.reduce(function (prev, curr) {
                prev[curr] = true;
                return prev;
            }.bind(this), {});
            this.emit("selection", this.selection, previousSelection);
        }
    };

    Document.prototype.setBounds = function (bounds) {
        var previousBounds = this.bounds || {},
            disequal = previousBounds.top !== bounds.top ||
                previousBounds.right !== bounds.right ||
                previousBounds.bottom !== bounds.bottom ||
                previousBounds.left !== bounds.left;

        if (disequal) {
            this.bounds = bounds;
            this.emit("bounds", this.bounds, bounds);
        }
    };

    Document.prototype.setFile = function (file) {
        var previousFile = this.file;
        if (previousFile !== file) {
            this.file = file;
            this.emit("file", file, previousFile);
        }
    };

    Document.prototype.setClosed = function (closed) {
        var prevClosed = this.closed;

        if (prevClosed !== closed) {
            this.closed = closed;
            this.emit("closed", this.closed);
        }
    };

    Document.prototype.applyChange = function (change) {
        assert.strictEqual(this.id, change.id, "Document ID mismatch");
        assert.strictEqual(this.version, change.version, "Version mismatch.");
        assert(this.count < change.count, "Out of order count.");
        assert(this.timeStamp <= change.timeStamp, "Out of order timestamp.");

        this.count = change.count;
        this.timeStamp = change.timeStamp;

        if (change.hasOwnProperty("file")) {
            this.setFile(change.file);
        }

        if (change.hasOwnProperty("selection")) {
            this.setSelection(change.selection);
        }

        if (change.hasOwnProperty("bounds")) {
            this.setBounds(change.bounds);
        }

        if (change.hasOwnProperty("closed")) {
            this.setClosed(change.closed);
        }

        if (change.hasOwnProperty("layers")) {
            change.layers.forEach(function (rawLayerChange) {
                // var layer = this.getLayer(rawLayerChange.id),
                //     changes = layer.applyChange(rawLayerChange);

                // changes.forEach(function (changeArgs) {
                //     changeArgs.push(layer);
                //     this.emit.apply(this, changeArgs);
                // }, this);
            }, this);
        }
    };

    Document.prototype.toString = function () {
        var result = "Document " + this.id,
            length = this.layers.length;

        if (length > 0) {
            result += " [";
            this.layers.forEach(function (layer, index) {
                result += layer.toString();
                if (index !== length - 1) {
                    result += ", ";
                }
            });
            result += "]";
        }
        return result;
    };

    module.exports = Document;
}());