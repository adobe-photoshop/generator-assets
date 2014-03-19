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
        EventEmitter = require("events").EventEmitter;

    var ComponentManager = require("./componentmanager"),
        FileManager = require("./filemanager");

    // The asset manager maintains a set of assets for a given document. On initialization,
    // it parses the layers' names into a set of components, requests renderings of each of
    // those components from the render manager, and organizes the rendered assets into the
    // appropriate files and folders. When the document changes, it requests that the appropriate
    // components be re-rendered or moved into the right place. It also manages error reporting.

    function AssetManager(generator, config, document, renderManager) {
        this._generator = generator;
        this._document = document;
        this._renderManager = renderManager;
        this._fileManager = new FileManager();

        this._handleChange = this._handleChange.bind(this);
        this.unpause();
    }

    util.inherits(AssetManager, EventEmitter);

    AssetManager.prototype._renderPromises = null;

    AssetManager.prototype._renderManager = null;

    AssetManager.prototype._fileManager = null;

    AssetManager.prototype._componentManager = null;

    AssetManager.prototype._reset = function () {
        this._renderPromises = {};
        this._componentManager = new ComponentManager();
        this._fileManager.updateBasePath(this._document.file);

        this._document.layers.visit(function (layer) {
            // Don't visit the top-level LayerGroup
            if (layer.group) {
                var components = this._componentManager.addAllComponents(layer),
                    componentIds = Object.keys(components);

                componentIds.forEach(function (componentId) {
                    this._requestRender(components[componentId]);
                }, this);
            }
        }.bind(this));
    };

    AssetManager.prototype._requestRender = function (component) {
        // FIXME: the document and layer might need to be cloned so that they
        // don't change in the middle of rendering
        var renderPromise = this._renderManager.render(component);

        this._renderPromises[component.id] = renderPromise;

        renderPromise
            .then(this._handleRenderResponse.bind(this, component.id))
            .fail(this._handleRenderFailure.bind(this, component.id))
            .finally(function () {
                delete this._renderPromises[component.id];
            }.bind(this))
            .done();
    };

    AssetManager.prototype._cancelRender = function (componentId) {
        this._renderManager.cancel(componentId);
    };

    AssetManager.prototype._hasPendingRender = function (componentId) {
        if (this._renderPromises.hasOwnProperty(componentId)) {
            var promise = this._renderPromises[componentId];

            if (promise.inspect().state === "pending") {
                return true;
            }
        }

        return false;
    };

    AssetManager.prototype._handleRenderResponse = function (componentId, tmpPath) {
        if (tmpPath) {
            var component = this._componentManager.getComponent(componentId);

            this._fileManager.moveFileInto(tmpPath, component.assetPath);
        }
    };

    AssetManager.prototype._handleRenderFailure = function (componentId, err) {
        var component = this._componentManager.getComponent(componentId);

        if (err) {
            console.warn("Failed to render component %d for layer %d: %s", component.id, component.layer.id, err.stack);
        } else {
            console.log("Canceled render of component '%s' for layer %d", component.name, component.layer.id);
        }
    };

    /**
     * Handle the document's change events. If the document is closed, finish
     * processing. If layers are changed, reparse those layers and their
     * dependencies to into components, and add the layer ids to the work set.
     */
    AssetManager.prototype._handleChange = function (change) {
        console.log("handleChange:", change);

        if (change.file) {
            this._fileManager.updateBasePath(this._document.file);
        }

        if (change.ppi) {
            this._reset();
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
            var changedLayerIds = Object.keys(change.layers).map(function (key) {
                return parseInt(key, 10);
            }),
                changedLayerComponents = {};

            // Compute the set of all changed layers and their dependencies;
            // parse the new layers into components
            changedLayerIds.forEach(function (id) {
                var layerChange = change.layers[id],
                    layer = layerChange.layer,
                    dependentLayers = getDependentLayers(layer);
                
                dependentLayers.forEach(function (layer) {
                    changedLayerComponents[layer.id] = this._componentManager.findAllComponents(layer);
                }, this);
            }, this);

            // Compute the set of removed layers;
            // subtract the removed layers from the set of changed layers above 
            var removedLayerIds = changedLayerIds.filter(function (layerId) {
                var layerChange = change.layers[layerId];
                if (layerChange.type === "removed") {
                    if (changedLayerComponents.hasOwnProperty(layerId)) {
                        delete changedLayerComponents[layerId];
                    }
                    return true;
                }
            }, this);

            // Clear out the removed layer components;
            // remove the assets from the old components and/or cancel their renders
            removedLayerIds.forEach(function (layerId) {
                var componentsToRemove = this._componentManager.getComponentsByLayer(layerId);

                Object.keys(componentsToRemove)
                    .map(function (key) {
                        return parseInt(key, 10);
                    })
                    .forEach(function (componentId) {
                        var component = componentsToRemove[componentId];

                        if (this._hasPendingRender(componentId)) {
                            this._cancelRender(componentId);
                        }

                        this._componentManager.removeComponent(componentId);

                        this._fileManager.removeFileWithin(component.assetPath);
                    }, this);
            }, this);

            // Update remaining changed layer components, requesting new assets as appropriate
            // TODO: detect renamings and move existing assets instead of regenerating
            Object.keys(changedLayerComponents).map(function (key) {
                return parseInt(key, 10);
            }).forEach(function (layerId) {
                var layer = change.layers[layerId].layer,
                    currentComponents = changedLayerComponents[layerId],
                    previousComponents = this._componentManager.getComponentsByLayer(layerId);

                Object.keys(previousComponents).forEach(function (componentId) {
                    var component = previousComponents[componentId];
                    if (this._hasPendingRender(component.id)) {
                        this._cancelRender(component.id);
                    }
                    
                    this._componentManager.removeComponent(component.id);
                    this._fileManager.removeFileWithin(component.assetPath);
                }, this);

                currentComponents.forEach(function (component) {
                    this._componentManager.addComponent(layer, component);
                    this._requestRender(component);
                }, this);
            }, this);
        }
    };

    AssetManager.prototype.unpause = function () {
        this._document.on("change", this._handleChange);
        this._reset();
    };

    AssetManager.prototype.pause = function () {
        this._document.removeListener("change", this._handleChange);
        this._renderManager.cancelAll(this._document.id);
    };

    module.exports = AssetManager;
}());