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

    LayerGroup.prototype.findLayer = function (id) {
        var children = this.getChildren(),
            child = children.some(function (layer) {
                if (layer.id === id) {
                    return layer;
                }
            });

        return child;
    };

    LayerGroup.prototype.findLayerAddress = function (id) {
        var result = null;
        return this.layers.some(function (child) {
            if (child.id === id) {
                result = [child, this];
                return true;
            } else if (child instanceof LayerGroup) {
                result = child.findLayerById(id);
                if (result) {
                    result.push(this);
                    return true;
                }
            }
        }, this);
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

    LayerGroup.prototype.indexOf = function (id) {
        var index = null;
        
        this.layers.some(function (child, i) {
            if (child.id === id) {
                index = i;
                return true;
            }
        });

        return index;
    };

    LayerGroup.prototype.findLayerAtIndex = function (targetIndex) {
        var currentIndex = 0,
            nextIndex = 0,
            child;

        var index;
        for (index = 0; index < this.layers.length; index++) {
            child = this.layers[index];

            if (targetIndex === currentIndex) {
                return child;
            }

            if (child instanceof LayerGroup) {
                nextIndex += child.getChildren().length + 2;
            } else {
                nextIndex++;
            }
            
            if (targetIndex < nextIndex) {
                return child.findLayerAtIndex(targetIndex - (currentIndex + 1));
            }

            currentIndex = nextIndex;
        }

        throw new Error("Invalid target index:", targetIndex);
    };

    LayerGroup.prototype.addLayerAtIndex = function (childToAdd, targetIndex) {
        var currentIndex = childToAdd instanceof LayerGroup ? childToAdd.getChildren().length + 1 : 0,
            nextIndex = currentIndex,
            grandchildren,
            child;

        // Invariant: currentIndex <= targetIndex
        var index;
        for (index = 0; index < this.layers.length; index++) {
            if (targetIndex === currentIndex) {
                break;
            }

            // currentIndex < targetIndex
            child = this.layers[index];
            if (child instanceof LayerGroup) {
                nextIndex += child.getChildren().length + 2;
            } else {
                nextIndex++;
            }
            
            if (targetIndex < nextIndex) {
                // currentIndex < targetIndex < nextIndex
                return child.addLayerAtIndex(childToAdd, targetIndex - (currentIndex + 1));
            }
            // nextIndex <= targetIndex

            //currentIndex <= targetIndex
            currentIndex = nextIndex;
        }

        assert.strictEqual(currentIndex, targetIndex, "Invalid insertion index");
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

    LayerGroup.prototype.moveLayer = function (id, targetIndex) {
        var results = this.findLayer(id),
            layer = results.layer,
            currentIndex = results.index;

        if (currentIndex === targetIndex) {
            return false;
        }

        layer.group.removeChild(id);

        this.addLayerAtIndex(targetIndex, layer);
        return true;
    };

    LayerGroup.prototype.applyChange = function (rawLayerChanges) {
        rawLayerChanges
            .sort(function (l1, l2) {
                return l1.index - l2.index;
            })
            .forEach(function (rawLayerChange) {

            });
        

        if (raw.hasOwnProperty("layers")) {
            raw.layers
                .sort(function (l1, l2) {
                    return l1.index - l2.index;
                })
                .forEach(function (rawLayerChange) {
                    // var layer = findLayer(rawLayerChange.id);
                    // layer.applyChange(rawLayerChange);
                });            
        }
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

    function _getAllLayerChanges(rawLayerChanges) {
        return rawLayerChanges.reduce(function (changes, rawLayerChange) {
            var thisChange = JSON.parse(JSON.stringify(rawLayerChange));

            if (rawLayerChange.hasOwnProperty("layers")) {
                changes.concat(_getAllLayerChanges(rawLayerChange.layers));
            }

            changes.push(thisChange);
            return changes;
        }, []);
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
            var allChanges = _getAllLayerChanges(change.layers);

            allChanges
                .sort(function (l1, l2) {
                    return l1.index - l2.index;
                })
                .forEach(function (rawLayerChange) {
                    console.log("Processing layer change: ", rawLayerChange);

                    var id = rawLayerChange.id,
                        targetIndex = rawLayerChange.index,
                        layer;

                    if (rawLayerChange.added) {
                        layer = createLayer(null, rawLayerChange); // FIXME
                        console.log("Adding layer:", layer);
                        this.layers.addLayerAtIndex(layer, targetIndex);
                        return;
                    }

                    var result = this.layers.findLayer(id),
                        currentIndex = result.index;

                    layer = result.layer,

                    console.log("Found layer: ", result);

                    if (rawLayerChange.removed) {
                        console.log("Removing layer:", layer);
                        // remove the layer from its current position
                        var parent = layer.group,
                            index;

                        parent.layers.some(function (child, i) {
                            if (child.id === id) {
                                index = i;
                                return true;
                            }
                        });

                        parent.layers.splice(index, 1);
                        return;
                    }

                    if (targetIndex === currentIndex) {
                        console.log("Layer position is already correct.");
                        return;
                    }

                    console.log("Moving layer to index:", targetIndex);
                    // remove the layer from its current position
                    var parent = layer.group,
                        index;

                    parent.layers.some(function (child, i) {
                        if (child.id === id) {
                            index = i;
                            return true;
                        }
                    });

                    parent.layers.splice(index, 1);

                    // re-add the layer at the specified index
                    this.layers.addLayerAtIndex(layer, targetIndex);
                }, this);
        }
    };

    Document.prototype.toString = function () {
        return "Document " + this.id + ": " + this.layers.toString();
    };

    module.exports = Document;
}());