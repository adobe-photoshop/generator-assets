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

    var os = require("os"),
        events = require("events"),
        util = require("util");

    var Q = require("q");

    var analysis = require("./analysis"),
        renderer = require("./renderer");

    var createSVGRenderer = renderer.createSVGRenderer,
        createPixmapRenderer = renderer.createPixmapRenderer;

    var CHANGE_DELAY = 1000,
        MAX_JOBS = os.cpus().length;

    function RenderManager(generator, document) {
        this._generator = generator;
        this._document = document;

        this._svgRenderer = createSVGRenderer(generator, document);
        this._pixmapRenderer = createPixmapRenderer(generator, document);

        this._document.on("change", this._handleChange.bind(this));
        this._reset();
    }

    util.inherits(RenderManager, events.EventEmitter);

    RenderManager.prototype._generator = null;

    RenderManager.prototype._document = null;

    RenderManager.prototype._svgRenderer = null;

    RenderManager.prototype._pixmapRenderer = null;

    RenderManager.prototype._changeTimer = null;

    RenderManager.prototype._components = null;

    RenderManager.prototype._workSet = null;

    RenderManager.prototype._currentJobs = 0;

    /**
     * Initialize the work set and layer components by re-parsing all the layers
     * in the document into components, and adding all the layers to the work set.
     */
    RenderManager.prototype._reset = function () {
        this._components = {};
        this._workSet = {};

        this._document.layers.visit(function (layer) {
            // Don't visit the top-level LayerGroup
            if (layer.group) {
                var id = layer.id,
                    results = analysis.analyzeLayerName(layer.name);

                this._components[id] = [];
                results.forEach(function (result) {
                    var component = result.component;

                    if (component.file) {
                        console.log("Found component for layer %d: %s", id, component.file);
                        this._components[id].push(component);
                    }
                    // TODO report errors
                }, this);

                if (this._components[id].length > 0) {
                    this._workSet[id] = true;
                }
            }
        }.bind(this));

        this._processWorkSet();
    };

    /**
     * If the work set is non-empty, begin processing it by removing one layer
     * id, rendering its components, and then recursively processing the rest
     * of the work set.
     */
    RenderManager.prototype._processWorkSet = function () {
        if (this._currentJobs >= MAX_JOBS) {
            return;
        }

        var keys = Object.keys(this._workSet).map(function (keyStr) {
            return parseInt(keyStr, 10);
        });

        if (keys.length > 0) {
            this._currentJobs++;
            // Pick a layer to process from the work set
            var layerId = keys[0];
            delete this._workSet[layerId];

            // Render the layer's components
            var layer = this._document.layers.findLayer(layerId).layer;

            this._renderLayer(layer)
                .fail(function (err) {
                    console.warn("Failed to render layer " + layerId, err.stack);
                })
                .then(function () {
                    this._currentJobs--;
                    this._processWorkSet();
                }.bind(this));

            this._processWorkSet();
        } else {
            console.log("Finished rendering.");
            this._changeTimer = null;
        }
    };

    /**
     * Render all the components of a layer.
     */
    RenderManager.prototype._renderLayer = function (layer) {
        var components = this._components[layer.id],
            boundsSettings = {
                boundsOnly: true
            };

        console.log("Rendering layer %d", layer.id);
        return this._generator.getPixmap(this._document.id, layer.id, boundsSettings)
            .then(function (pixmapInfo) {
                var exactBounds = pixmapInfo.bounds,
                    componentPromises = components.map(function (component) {
                        var renderPromise = this._renderComponent(layer, component, exactBounds);

                        renderPromise.then(function (path) {
                            this.emit("assetAdded", layer.id, path, component.folder, component.file);
                        }.bind(this), function (err) {
                            console.warn("Failed to render component for layer %d: %s", layer.id, err);
                        });

                        return renderPromise;
                    }, this);

                return Q.all(componentPromises);
            }.bind(this));
    };

    /**
     * Render a single layer component.
     */
    RenderManager.prototype._renderComponent = function (layer, component, bounds) {
        if (component.extension === "svg") {
            return this._svgRenderer.render(layer, component);
        } else {
            return this._pixmapRenderer.render(layer, component, bounds);
        }
    };


    /**
     * Handle the document's change events. If the document is closed, finish
     * processing. If layers are changed, reparse those layers and their
     * dependencies to into components, and add the layer ids to the work set.
     */
    RenderManager.prototype._handleChange = function (change) {
        console.log("handleChange:", change);

        if (change.closed) {
            this.finish();
            return;
        }

        function getDependentLayers(layer) {
            // If it's an adjustment layer, everything below the current position and 
            // everything below the previous position. For now, just add all the parents.
            var dependencies = layer.name ? [layer] : [];

            if (layer.group) {
                dependencies = dependencies.concat(getDependentLayers(layer.group));
            }

            return dependencies;
        }

        // if the layer was just renamed; then reparse it and figure out if component
        // settings have changed; if so, add it to the work set; otherwise, just
        // fire off any relevant rename events;

        if (change.layers) {
            var changedLayerIds = Object.keys(change.layers);
            // Add all changed layers and their dependencies to the work set
            changedLayerIds.forEach(function (id) {
                var layerChange = change.layers[id],
                    layer = layerChange.layer,
                    dependentLayers = getDependentLayers(layer);
                
                console.log("Layers dependent on %d: %s", layer.id, dependentLayers);
                dependentLayers.forEach(function (layer) {
                    var components = analysis.analyzeLayerName(layer.name);

                    this._components[layer.id] = components.reduce(function (components, componentRec) {
                        var component = componentRec.component,
                            errors = componentRec.errors;

                        if (component.file) {
                            console.log("Found changed component for layer %d: %s", layer.id, component.file);
                            components.push(component);
                        } else {
                            console.warn("Skipping component: ", component.name, errors);
                        }

                        return components;
                    }.bind(this), []);

                    this._workSet[layer.id] = true;
                }, this);
            }, this);

            changedLayerIds.forEach(function (id) {
                var layerChange = change.layers[id];
                if (layerChange.type === "removed") {
                    delete this._workSet[id];
                    delete this._components[id];
                    this.emit("layerRemoved", id);
                }
            }, this);
        }

        if (Object.keys(this._workSet).length > 0) {
            if (!this._changeTimer) {
                this._changeTimer = setTimeout(function () {
                    this._processWorkSet();
                }.bind(this), CHANGE_DELAY);
            }
        }
    };

    /**
     * Stop rendering this document's layer components. 
     */
    RenderManager.prototype.finish = function () {
        this._workSet = {};
        this._document.off("change");
    };

    module.exports = RenderManager;
}());