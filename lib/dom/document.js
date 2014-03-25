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
        events = require("events"),
        path = require("path");

    var createLayer = require("./layer").createLayer;

    /**
     * Model of a Photoshop document.
     * 
     * @constructor
     */
    function Document(generator, raw) {
        events.EventEmitter.call(this);
        
        this._generator = generator;
        this._id = raw.id;
        this._count = raw.count;
        this._timeStamp = raw.timeStamp;
        this._version = raw.version;

        if (raw.hasOwnProperty("file")) {
            this._setFile(raw.file);
        }

        if (raw.hasOwnProperty("bounds")) {
            this._setBounds(raw.bounds);
        }

        if (raw.hasOwnProperty("selection")) {
            this._setSelection(raw.selection);
        }

        if (raw.hasOwnProperty("resolution")) {
            this._setResolution(raw.resolution);
        }

        if (raw.hasOwnProperty("globalLight")) {
            this._setGlobalLight(raw.globalLight);
        }

        if (raw.hasOwnProperty("generatorSettings")) {
            this._setGeneratorSettings(raw.generatorSettings);
        }

        if (raw.hasOwnProperty("layers")) {
            this._setLayers(raw);
        }

        // if (raw.hasOwnProperty("comps")) {
        //     this._setComps(raw.comps);
        // }

        // if (raw.hasOwnProperty("placed")) {
        //     this._setPlaced(raw.placed);
        // }
    }

    util.inherits(Document, events.EventEmitter);

    Object.defineProperties(Document.prototype, {
        "id": {
            get: function () { return this._id; },
            set: function () { throw new Error("Cannot set id"); }
        },
        "count": {
            get: function () { return this._count; },
            set: function () { throw new Error("Cannot set count"); }
        },
        "timeStamp": {
            get: function () { return this._timeStamp; },
            set: function () { throw new Error("Cannot set timeStamp"); }
        },
        "version": {
            get: function () { return this._version; },
            set: function () { throw new Error("Cannot set version"); }
        },
        "file": {
            get: function () { return this._file; },
            set: function () { throw new Error("Cannot set file"); }
        },
        "name": {
            get: function () { return this._name; },
            set: function () { throw new Error("Cannot set name"); }
        },
        "extension": {
            get: function () { return this._extension; },
            set: function () { throw new Error("Cannot set extension"); }
        },
        "directory": {
            get: function () { return this._directory; },
            set: function () { throw new Error("Cannot set directory"); }
        },
        "saved": {
            get: function () { return !!this._directory; },
            set: function () { throw new Error("Cannot set saved"); }
        },
        "bounds": {
            get: function () { return this._bounds; },
            set: function () { throw new Error("Cannot set bounds"); }
        },
        "selection": {
            get: function () { return this._selection; },
            set: function () { throw new Error("Cannot set selection"); }
        },
        "resolution": {
            get: function () { return this._resolution; },
            set: function () { throw new Error("Cannot set resolution"); }
        },
        "globalLight": {
            get: function () { return this._globalLight; },
            set: function () { throw new Error("Cannot set globalLight"); }
        },
        "generatorSettings": {
            get: function () { return this._generatorSettings; },
            set: function () { throw new Error("Cannot set generatorSettings"); }
        },
        "layers": {
            get: function () { return this._layers; },
            set: function () { throw new Error("Cannot set layers"); }
        },
        "comps": {
            get: function () { return this._comps; },
            set: function () { throw new Error("Cannot set comps"); }
        },
        "placed": {
            get: function () { return this._placed; },
            set: function () { throw new Error("Cannot set placed"); }
        },
    });

    /**
     * @type {number}
     */
    Document.prototype._id = null;

    /**
     * @type {string}
     */
    Document.prototype._version = null;

    /**
     * @type {number}
     */
    Document.prototype._count = null;

    /**
     * @type {number}
     */
    Document.prototype._timeStamp = null;

    /**
     * @type {string}
     */
    Document.prototype._file = null;

    /**
     * @type {string}
     */
    Document.prototype._name = null;

    /**
     * @type {string}
     */
    Document.prototype._extension = null;

    /**
     * @type {string}
     */
    Document.prototype._directory = null;

    /**
     * @type {Bounds}
     */
    Document.prototype._bounds = null;

    /**
     * @type {Object.<number, boolean>}
     */
    Document.prototype._selection = null;

    /**
     * @type {number}
     */
    Document.prototype._resolution = null;

    /**
     * @type {{altitude: number, angle: number}}
     */
    Document.prototype._globalLight = null;

    /**
     * @type {string}
     */
    Document.prototype._generatorSettings = null;

    /**
     * @type {LayerGroup}
     */
    Document.prototype._layers = null;

    /**
     * @type {Object.<number, Object>}
     */
    Document.prototype._placed = null;

    /**
     * @type {Object.<number, Object>}
     */
    Document.prototype._comps = null;

    Document.prototype._setFile = function (rawFile) {
        this._file = rawFile;
        this._name = path.basename(rawFile);
        this._extension = path.extname(rawFile);

        if (rawFile.match(/[\/\\]/)) {
            this._directory = path.dirname(rawFile);
        } else {
            this._directory = null;
        }
    };

    Document.prototype._updateFile = function (rawFile) {
        var previousFile = this._file,
            previousName = this.name,
            previousExtension = this.extension,
            previousDirectory = this.directory,
            previousSaved = this.saved;

        if (previousFile !== rawFile) {
            this._setFile(rawFile);

            var change = {
                previous: previousFile
            };

            if (previousName !== this.name) {
                change.previousName = previousName;
            }

            if (previousExtension !== this.extension) {
                change.previousExtension = previousExtension;
            }

            if (previousDirectory !== this.directory) {
                change.previousDirectory = previousDirectory;
            }

            if (previousSaved !== this.saved) {
                change.previousSaved = previousSaved;
            }

            return change;
        }
    };

    Document.prototype._setSelection = function (rawSelection) {
        this._selection = rawSelection.reduce(function (prev, curr) {
            prev[curr] = true;
            return prev;
        }.bind(this), {});
    };

    Document.prototype._updateSelection = function (rawSelection) {
        var previousSelection = this._selection;
        this._setSelection(rawSelection);

        return {
            previous: previousSelection
        };
    };

    Document.prototype._setBounds = function (rawBounds) {
        this._bounds = rawBounds;
    };

    Document.prototype._updateBounds = function (rawBounds) {
        var previousBounds = this._bounds;
        this._setBounds(rawBounds);

        return {
            previous: previousBounds
        };
    };

    Document.prototype._setResolution = function (rawResolution) {
        var ppi = parseFloat(rawResolution);

        if (isNaN(ppi)) {
            ppi = 72;
        }

        this._resolution = ppi;
    };

    Document.prototype._updateResolution = function (rawResolution) {
        var previousResolution = this._resolution;
        this._setResolution(rawResolution);

        return {
            previous: previousResolution
        };
    };

    Document.prototype._setGlobalLight = function (rawGlobalLight) {
        this._globalLight = rawGlobalLight;
    };

    Document.prototype._updateGlobalLight = function (rawGlobalLight) {
        var previousGlobalLight = this._globalLight;
        this._setGlobalLight(rawGlobalLight);

        return {
            previous: previousGlobalLight
        };
    };

    Document.prototype._setGeneratorSettings = function (rawGeneratorSettings) {
        this._generatorSettings = rawGeneratorSettings;
    };

    Document.prototype._updateGeneratorSettings = function (rawGeneratorSettings) {
        var previousGeneratorSettings = this._generatorSettings;
        this._setGeneratorSettings(rawGeneratorSettings);

        return {
            previous: previousGeneratorSettings
        };
    };

    Document.prototype._setLayers = function (raw) {
        this._layers = createLayer(this, null, raw);
        this._validateLayerChanges(raw.layers);
    };

    Document.prototype._getChangedLayers = function (rawLayerChanges, changes) {
        changes = changes || {};

        rawLayerChanges.forEach(function (rawLayerChange) {
            var id = rawLayerChange.id,
                result;

            if (rawLayerChange.hasOwnProperty("layers")) {
                this._getChangedLayers(rawLayerChange.layers, changes);
            }

            if (rawLayerChange.added) {
                result = {
                    type: "added",
                    index: rawLayerChange.index
                };
            } else {
                result = this._layers.findLayer(id);

                if (!result) {
                    if (rawLayerChange.removed) {
                        // Phantom section/group end layer
                        return;
                    } else {
                        throw new Error("Can't find changed layer:", id);
                    }
                }

                if (rawLayerChange.removed) {
                    result.type = "removed";
                } else if (rawLayerChange.hasOwnProperty("index")) {
                    result.type = "moved";
                }
            }

            changes[id] = result;
        }, this);

        return changes;
    };

    Document.prototype._detachMovedLayers = function (changes) {
        Object.keys(changes)
            .reduce(function (filteredChanges, id) {
                var change = changes[id];

                if (change.type === "moved" || change.type === "removed") {
                    filteredChanges.push(change);
                }
                return filteredChanges;
            }, [])
            .sort(function (l1, l2) {
                return l1.index - l2.index;
            })
            .forEach(function (change) {
                // remove the layer from its current position
                change.layer._detach();
            });
    };

    Document.prototype._validateLayerChanges = function (rawLayerChanges) {
        rawLayerChanges.forEach(function (rawLayerChange) {
            if (rawLayerChange.hasOwnProperty("index")) {
                var index = rawLayerChange.index,
                    id = rawLayerChange.id,
                    result = this._layers.findLayer(id);

                if (rawLayerChange.removed) {
                    assert(!result, "Removed layer " + id + " still exists at index " + result.index);
                } else {
                    var message = "Layer " + id + " has index " + result.index + " instead of " + index;
                    assert.strictEqual(index, result.index, message);
                }

                if (rawLayerChange.hasOwnProperty("layers")) {
                    this._validateLayerChanges(rawLayerChange.layers);
                }
            }
        }, this);
    };

    Document.prototype._updateLayers = function (rawLayerChange) {
        // Find all the existing layers that need to be updated
        var changes = this._getChangedLayers(rawLayerChange.layers);

        // Remove them from the tree
        this._detachMovedLayers(changes);

        // Add or re-add new layers to the tree at their new indexes
        this._layers._applyChange(rawLayerChange, changes);

        this._validateLayerChanges(rawLayerChange.layers);

        return changes;
    };

    Document.prototype._applyChange = function (rawChange) {
        assert.strictEqual(this.id, rawChange.id, "Document ID mismatch");
        assert.strictEqual(this.version, rawChange.version, "Version mismatch.");

        if (this.timeStamp > rawChange.timeStamp ||
            (this.timeStamp === rawChange.timeStamp && this.count <= rawChange.count)) {
            console.warn("Skipping out of order change: this %d@%d; change %d@%d",
                this.count, this.timeStamp, rawChange.count, rawChange.timeStamp);
            return true;
        }

        if (rawChange.hasOwnProperty("changed")) {
            this.emit("error", "Unknown change");
            return false;
        }

        this._count = rawChange.count;
        this._timeStamp = rawChange.timeStamp;

        var changes = {},
            change;

        // updated properties
        if (rawChange.hasOwnProperty("file")) {
            change = this._updateFile(rawChange.file);
            if (change) {
                changes.file = change;
            }
        }

        if (rawChange.hasOwnProperty("globalLight")) {
            changes.globalLight = this._updateGlobalLight(rawChange.globalLight);
        }

        if (rawChange.hasOwnProperty("bounds")) {
            changes.bounds = this._updateBounds(rawChange.bounds);
        }

        if (rawChange.hasOwnProperty("resolution")) {
            changes.resolution = this._updateResolution(rawChange.resolution);
        }

        if (rawChange.hasOwnProperty("selection")) {
            changes.selection = this._updateSelection(rawChange.selection);
        }

        if (rawChange.hasOwnProperty("generatorSettings")) {
            changes.generatorSettings = this._updateGeneratorSettings(rawChange.generatorSettings);
        }

        if (rawChange.hasOwnProperty("layers")) {
            try {
                changes.layers = this._updateLayers(rawChange);
            } catch (ex) {
                this.emit("error", ex.message);
                return false;
            }
        }

        // if (rawChange.hasOwnProperty("comps")) {
        //     changes.comps = this._updateComps(rawChange.comps);
        // }

        // if (rawChange.hasOwnProperty("placed")) {
        //     changes.placed = this._updatePlaced(rawChange.placed);
        // }

        // // change notifications
        if (rawChange.hasOwnProperty("closed")) {
            changes.closed = !!rawChange.closed;
        }

        if (rawChange.hasOwnProperty("active")) {
            changes.active = !!rawChange.active;
        }

        if (rawChange.hasOwnProperty("merged")) {
            changes.merged = !!rawChange.merged;
        }

        if (rawChange.hasOwnProperty("flattened")) {
            changes.flattened = !!rawChange.flattened;
        }

        if (rawChange.hasOwnProperty("metaDataOnly")) {
            changes.metaDataOnly = !!rawChange.metaDataOnly;
        }


        if (Object.keys(changes).length > 0) {
            var changeName;
            for (changeName in changes) {
                if (changes.hasOwnProperty(changeName)) {
                    this.emit(changeName, changes[changeName], changes.timeStamp, changes.count);
                }
            }

            changes.id = rawChange.id;
            changes.timeStamp = rawChange.timeStamp;
            changes.count = rawChange.count;
            this.emit("change", changes);
        }

        return true;
    };

    Document.prototype.toString = function () {
        var layerStrings = this._layers.layers.map(function (l) {
            return l.toString();
        });
        
        return "Document " + this._id + " [" + layerStrings.join(", ") + "]";
    };

    module.exports = Document;
}());