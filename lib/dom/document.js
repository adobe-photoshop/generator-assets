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
        events = require("events"),
        path = require("path");

    var Bounds = require("./bounds"),
        Raw = require("./raw");

    var createLayer = require("./layer").createLayer;

    var DEBUG_TO_RAW_CONVERSION = false;
    
    var EXACT_BOUNDS_SETTINGS = {
        boundsOnly: true
    };

    var debugLogObject = function (objectName, object) {
        console.log("========== %s ==========", objectName);
        console.log(JSON.stringify(Raw.sortJSON(object), null, 4));
        console.log("========================");
    };

    /**
     * Model of a Photoshop document.
     * 
     * @constructor
     * @param {Generator} generator
     * @param {object} config
     * @param {Logger} logger
     * @param {object} raw Raw description of the document
     */
    function Document(generator, config, logger, raw) {
        if (DEBUG_TO_RAW_CONVERSION) {
            debugLogObject("raw", raw);
        }

        events.EventEmitter.call(this);
        
        this._generator = generator;
        this._config = config;
        this._logger = logger;


        var property;
        for (property in raw) {
            if (raw.hasOwnProperty(property)) {
                switch (property) {
                case "id":
                    this._id = raw.id;
                    break;
                case "count":
                    this._count = raw.count;
                    break;
                case "timeStamp":
                    this._timeStamp = raw.timeStamp;
                    break;
                case "version":
                    this._version = raw.version;
                    break;
                case "file":
                    this._setFile(raw.file);
                    break;
                case "bounds":
                    this._setBounds(raw.bounds);
                    break;
                case "selection":
                    // Resolving the selection depends on the layers; set it in a later pass
                    break;
                case "resolution":
                    this._setResolution(raw.resolution);
                    break;
                case "globalLight":
                    this._setGlobalLight(raw.globalLight);
                    break;
                case "generatorSettings":
                    this._setGeneratorSettings(raw.generatorSettings);
                    break;
                case "layers":
                    this._setLayers(raw.layers);
                    break;
                case "comps":
                    this._setComps(raw.comps);
                    break;
                case "placed":
                    this._setPlaced(raw.placed);
                    break;
                case "profile":
                case "mode":
                case "depth":
                    // Do nothing for these properties
                    // TODO could profile and/or mode be helpful for embedding color profile?
                    break;
                default:
                    this._logger.warn("Unhandled property in raw constructor:", property, raw[property]);
                }
            }
        }

        if (raw.hasOwnProperty("selection")) {
            this._setSelection(raw.selection);
        }

        if (DEBUG_TO_RAW_CONVERSION) {
            debugLogObject("document.toRaw", this.toRaw());
        }
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
        "basename": {
            get: function () { return path.basename(this.name, this.extension); },
            set: function () { throw new Error("Cannot set basename"); }
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
        }
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
     * @type {{string, Layer}}
     * Map of currently selected layers. Keys are layer IDs as strings, values are Layer objects
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
     * @type {{number, Object}}
     */
    Document.prototype._placed = null;

    /**
     * @type {{number, Object}}
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

    Document.prototype._setSelection = function (rawSelection) {
        this._selection = rawSelection.reduce(function (prev, index) {
            var layer = this.layers.findLayerAtIndex(index);

            if (!layer) {
                throw new Error("Unable to set selection: no layer found at index " + index);
            }

            // DEBUG: confirm that the found layer's computed index matches the target index
            // assert.strictEqual(index, this.layers.findLayer(layer.id).index);

            prev[layer.id] = layer;
            return prev;
        }.bind(this), {});
    };

    Document.prototype._setBounds = function (rawBounds) {
        this._bounds = new Bounds(rawBounds);
    };

    Document.prototype._setResolution = function (rawResolution) {
        var ppi = parseFloat(rawResolution);

        if (isNaN(ppi)) {
            ppi = 72;
        }

        this._resolution = ppi;
    };

    Document.prototype._setGlobalLight = function (rawGlobalLight) {
        this._globalLight = rawGlobalLight;
    };

    Document.prototype._setGeneratorSettings = function (rawGeneratorSettings) {
        this._generatorSettings = rawGeneratorSettings;
    };

    Document.prototype._setComps = function (raw) {
        this._comps = raw;
    };

    Document.prototype._setPlaced = function (raw) {
        this._placed = raw;
    };

    Document.prototype._setLayers = function (raw) {
        var rawLayer = {
            id: this.id,
            layers: raw
        };

        this._layers = createLayer(this, null, rawLayer);
    };

    Document.prototype.getExactBounds = function (layerCompId, maxDimension) {
        var generator = this._generator,
            settings = JSON.parse(JSON.stringify(EXACT_BOUNDS_SETTINGS));
        
        if (maxDimension) {
            settings.maxDimension = maxDimension;
        }
        
        if (isFinite(layerCompId)) {
            settings.compId = layerCompId;
        }

        return generator.getDocumentPixmap(this.id, settings)
            .get("bounds")
            .then(function (rawBounds) {
                return new Bounds(rawBounds);
            }.bind(this));
    };

    Document.prototype.toString = function () {
        var layerStrings = this._layers.layers.map(function (l) {
            return l.toString();
        });
        
        return "Document " + this._id + " [" + layerStrings.join(", ") + "]";
    };

    Document.prototype.toRaw = function () {
        var document = Raw.toRaw(this, [
            "id",
            "count",
            "timeStamp",
            "version",
            "file",
            "bounds",
            "resolution",
            "globalLight",
            "generatorSettings",
            "layers",
            "comps",
            "placed"
        ]);

        // Layers are nested in an extra LayerGroup for the document, so bring them up one level.
        document.layers = document.layers.layers;

        // The original docinfo selection is by layer index, which is harder to work with than by layer id.
        document._selectionById = Object.keys(this.selection).map(function (layerIdString) {
            return parseInt(layerIdString, 10);
        });

        return document;
    };

    module.exports = Document;
}());
