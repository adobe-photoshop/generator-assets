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
        return this.id + ":" + (this.name || "-");
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

        var targetIndex = 0;

        this.layers = [];
        if (raw.hasOwnProperty("layers")) {
            raw.layers
                .sort(function (l1, l2) {
                    return l1.index - l2.index;
                })
                .forEach(function (rawLayer) {
                    var layer = createLayer(this, rawLayer),
                        children;

                    if (layer instanceof LayerGroup) {
                        children = layer.getChildren().length + 1;
                    } else {
                        children = 0;
                    }

                    targetIndex += children;

                    this.addLayerAtIndex(layer, targetIndex);

                    targetIndex++;
                }, this);
        }
    }
    util.inherits(LayerGroup, BaseLayer);

    LayerGroup.prototype.getChildren = function () {
        return this.layers.reduce(function (children, layer) {
            children.push(layer);

            if (layer instanceof LayerGroup) {
                children = children.concat(layer.getChildren());
            }

            return children;
        }.bind(this), []);
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

    LayerGroup.prototype.removeLayer = function (id) {
        var child = this.findLayer(id);

        if (!child) {
            throw new Error("No such layer:", id);
        }

        var parent = child.group;
        parent.layers.some(function (layer, index) {
            if (layer.id === id) {
                this.layers.splice(index, 1);
                return true;
            }
        }, parent);

        return child;
    };

    LayerGroup.prototype.addLayerAtIndex = function (childToAdd, targetIndex) {
        var currentIndex = childToAdd instanceof LayerGroup ? childToAdd.getChildren().length + 1 : 0,
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
            if (child instanceof LayerGroup) {
                nextIndex += child.getChildren().length + 2;
            } else {
                nextIndex++;
            }

            // nextIndex <= targetIndex
            if (targetIndex < nextIndex && child instanceof LayerGroup) {
                // currentIndex < targetIndex < nextIndex
                return child.addLayerAtIndex(childToAdd, targetIndex - (currentIndex + 1));
            }

            //currentIndex <= targetIndex
            currentIndex = nextIndex;
        }

        assert.strictEqual(currentIndex, targetIndex, "Invalid insertion index: " + targetIndex);
        childToAdd.group = this;
        return this.layers.splice(index, 0, childToAdd);
    };

    LayerGroup.prototype.findLayer = function (id) {
        var currentIndex = 0,
            result,
            child;

        // Invariant: currentIndex <= targetIndex
        var index;
        for (index = 0; index < this.layers.length; index++) {
            child = this.layers[index];

            if (child instanceof LayerGroup) {
                currentIndex += child.getChildren().length + 1;
            }

            if (child.id === id) {
                return {
                    layer: child,
                    index: currentIndex
                };
            }

            if (child instanceof LayerGroup) {
                result = child.findLayer(id);
                if (result) {
                    return result;
                }
            }

            currentIndex++;
        }

        return null;
    };

    LayerGroup.prototype.applyChanges = function (affectedLayers, rawLayerChanges, parentIndex) {
        console.log("Preparing changes to layer %d [", this.id);

        var finalSize = this.getChildren().length;

        rawLayerChanges.forEach(function (rawLayerChange) {

            if (!rawLayerChange.hasOwnProperty("index")) {
                return;
            }

            var id = rawLayerChange.id,
                child;

            if (rawLayerChange.added) {
                child = createLayer(this, rawLayerChange);
                affectedLayers[id] = { layer : child };
            } else {
                if (!affectedLayers.hasOwnProperty(id)) {
                    console.warn("Skipping group end layer:", id);
                    return;
                }

                child = affectedLayers[id].layer;
            }

            if (rawLayerChange.hasOwnProperty("layers")) {
                child.applyChanges(affectedLayers, rawLayerChange.layers, rawLayerChange.index);
            }
            
            if (!rawLayerChange.removed) {
                if (child instanceof LayerGroup) {
                    finalSize += child.getChildren().length;
                }
                finalSize++;
            }
        }, this);

        var offset;
        if (parentIndex === undefined) {
            offset = 0;
        } else {
            offset = parentIndex - finalSize;
        }

        rawLayerChanges.forEach(function (rawLayerChange) {
            if (!rawLayerChange.hasOwnProperty("index")) {
                return;
            }
            
            var id = rawLayerChange.id,
                index = rawLayerChange.index,
                relativeIndex = index - offset;

            if (!rawLayerChange.removed) {
                if (!affectedLayers.hasOwnProperty(id)) {
                    console.warn("Skipping group end layer:", id);
                    return;
                }

                var child = affectedLayers[id].layer;
                this.addLayerAtIndex(child, relativeIndex);
            }
        }, this);

        console.log("Done ]");
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

        this.layers = new LayerGroup(this, raw);

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

    Document.prototype.collectAffectedLayers = function (rawLayerChanges, init) {
        init = init || {};

        rawLayerChanges.sort(function (l1, l2) {
            return l1.index - l2.index;
        });

        return rawLayerChanges.reduce(function (removed, rawLayerChange) {
            if (!rawLayerChange.hasOwnProperty("index")) {
                return removed;;
            }

            if (rawLayerChange.hasOwnProperty("layers")) {
                this.collectAffectedLayers(rawLayerChange.layers, removed);
            }

            if (!rawLayerChange.hasOwnProperty("added")) {
                var id = rawLayerChange.id,
                    result = this.layers.findLayer(id);

                if (!result) {
                    console.warn("Can't find removed layer:", id);
                    return removed;
                }

                removed[id] = result;
            }

            return removed;
        }.bind(this), init);
    };

    Document.prototype.removeAffectedLayers = function (affectedLayers) {
        var layers = Object.keys(affectedLayers).map(function (id) {
            return affectedLayers[id];
        });

        layers.sort(function (l1, l2) {
            return l1.index - l2.index;
        });

        layers.forEach(function (layerRec) {
            var layer = layerRec.layer,
                id = layer.id;

            console.log("Removing layer:", layer.id);
            // remove the layer from its current position
            var parent = layer.group,
                index = -1;

            parent.layers.some(function (child, i) {
                if (child.id === id) {
                    index = i;
                    return true;
                }
            });

            assert(index > -1, "Can't find layer to remove!");

            parent.layers.splice(index, 1);
        });
    };

    Document.prototype.applyChange = function (change) {
        assert.strictEqual(this.id, change.id, "Document ID mismatch");
        assert.strictEqual(this.version, change.version, "Version mismatch.");

        if (change.count <= this.count) {
            console.warn("Skipping out of order change.");
            return;
        }

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
            var affectedLayers = this.collectAffectedLayers(change.layers);

            this.removeAffectedLayers(affectedLayers);

            this.layers.applyChanges(affectedLayers, change.layers);
        }
    };

    Document.prototype.toString = function () {
        return "Document " + this.id + ": " + this.layers.toString();
    };

    module.exports = Document;
}());