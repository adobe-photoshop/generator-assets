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
        FileManager = require("./filemanager"),
        AdjustmentLayer = require("./dom/layer").AdjustmentLayer;

    var ERRORS_FILE = "errors.txt";

    // The asset manager maintains a set of assets for a given document. On initialization,
    // it parses the layers' names into a set of components, requests renderings of each of
    // those components from the render manager, and organizes the rendered assets into the
    // appropriate files and folders. When the document changes, it requests that the appropriate
    // components be re-rendered or moved into the right place. It also manages error reporting.

    function AssetManager(generator, config, logger, document, renderManager) {
        this._generator = generator;
        this._config = config;
        this._logger = logger;
        this._document = document;

        this._renderManager = renderManager;
        this._fileManager = new FileManager(generator, config, logger);

        this._handleChange = this._handleChange.bind(this);
    }

    util.inherits(AssetManager, EventEmitter);

    AssetManager.prototype._renderPromises = null;

    AssetManager.prototype._renderManager = null;

    AssetManager.prototype._fileManager = null;

    AssetManager.prototype._componentManager = null;

    AssetManager.prototype._cleanupDerivedComponents = function (componentId) {
        this._componentManager.getDerivedComponents(componentId).forEach(function (derivedComponent) {
            if (this._hasPendingRender(derivedComponent.id)) {
                this._renderManager.cancel(derivedComponent.id);
            }
            
            this._fileManager.removeFileWithin(derivedComponent.assetPath);
        }, this);
    };

    AssetManager.prototype._cleanup = function () {
        if (this._componentManager && this._fileManager.basePath) {
            // Clear out the removed layer components;
            // remove the assets from the old components and/or cancel their renders
            this._document.layers.visit(function (layer) {
                if (!layer.group) {
                    return;
                }

                var componentsToRemove = this._componentManager.getComponentsByLayer(layer.id);
                Object.keys(componentsToRemove).forEach(function (componentId) {
                    this._cleanupDerivedComponents(componentId);
                }, this);
            }.bind(this));
        }
    };

    AssetManager.prototype._init = function () {
        this._renderPromises = {};
        this._componentManager = new ComponentManager(this._generator, this._config, this._logger);
        this._fileManager.updateBasePath(this._document);
        this._fileManager.removeFileWithin(ERRORS_FILE);
        this._renderManager.cancelAll(this._document.id);

        var layerIdsWithComponents = [];
        this._document.layers.visit(function (layer) {
            // Don't visit the top-level LayerGroup
            if (!layer.group) {
                return;
            }

            var hasValidComponent = false;

            this._componentManager.findAllComponents(layer).forEach(function (result) {
                var component = result.component;
                if (component) {
                    try {
                        this._componentManager.addComponent(layer, component);
                        hasValidComponent = true;
                    } catch (ex) {
                        this._reportLayerError(layer, ex.message);
                    }
                } else if (result.errors) {
                    result.errors.forEach(function (error) {
                        this._reportLayerError(layer, error);
                    }.bind(this));
                }
            }, this);

            if (hasValidComponent) {
                layerIdsWithComponents.push(layer.id);
            }
        }.bind(this));

        layerIdsWithComponents.forEach(function (layerId) {
            var basicComponents = this._componentManager.getBasicComponentsByLayer(layerId);
            basicComponents.forEach(function (component) {
                var derivedComponents = this._componentManager.getDerivedComponents(component.id);
                derivedComponents.forEach(function (component) {
                    this._requestRender(component);
                }, this);
            }, this);
        }, this);
    };

    AssetManager.prototype._reset = function () {
        this._cleanup();
        this._init();
    };

    AssetManager.prototype._requestRender = function (component) {
        // FIXME: the document and layer might need to be cloned so that they
        // don't change in the middle of rendering
        var renderPromise = this._renderManager.render(component);

        this._renderPromises[component.id] = renderPromise;

        renderPromise
            .then(function (tmpPath) {
                if (tmpPath) {
                    this._fileManager.moveFileInto(tmpPath, component.assetPath);
                }
            }.bind(this))
            .fail(function (err) {
                if (err) {
                    this._logger.warn("Failed to render component `%s` for layer %d: %s",
                        component.name, component.layer.id, err);
                } else {
                    this._logger.log("Canceled render of component '%s' for layer %d",
                        component.name, component.layer.id);
                }
            }.bind(this))
            .finally(function () {
                delete this._renderPromises[component.id];
            }.bind(this))
            .done();
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

    AssetManager.prototype._reportLayerError = function (layer, err) {
        var datetime = new Date().toLocaleString(),
            message = "[" + datetime + "] Layer \"" + layer.name + "\": " + err + "\n";

        this._fileManager.appendWithin(ERRORS_FILE, message);
    };

    /**
     * Handle the document's change events. If the document is closed, finish
     * processing. If layers are changed, reparse those layers and their
     * dependencies to into components, and add the layer ids to the work set.
     */
    AssetManager.prototype._handleChange = function (change) {
        this._logger.debug("handleChange:", change);

        if (change.file) {
            if (this._document.saved && !change.file.hasOwnProperty("previousSaved")) {
                // If the file has been renamed, asset generation will be disabled, so do nothing here
                return;
            }
            this._fileManager.updateBasePath(this._document);
        }

        if (change.resolution) {
            this._reset();
        }

        function getDependentLayers(layer) {
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
            });

            // Close the set of changed layers with their dependencies
            var dependentLayers = changedLayerIds.reduce(function (dependentLayers, id) {
                var layerChange = change.layers[id],
                    layer = layerChange.layer;
                
                return getDependentLayers(layer).reduce(function (dependentLayers, layer) {
                    dependentLayers[layer.id] = layer;
                    return dependentLayers;
                }, dependentLayers);
            }.bind(this), {});

            var specificationsByLayer = Object.keys(dependentLayers).reduce(function (specifications, layerId) {
                var layer = dependentLayers[layerId],
                    validSpecifications = [];

                this._componentManager.findAllComponents(layer)
                    .forEach(function (specification) {
                        var component = specification.component,
                            errors = specification.errors;

                        if (component) {
                            validSpecifications.push(component);
                        } else if (errors) {
                            errors.forEach(function (error) {
                                this._reportLayerError(layer, error);
                            }, this);
                        }
                    }, this);

                if (validSpecifications.length > 0) {
                    specifications[layer.id] = validSpecifications;
                }

                return specifications;
            }.bind(this), {});

            var resetRequired = Object.keys(specificationsByLayer).some(function (layerId) {
                var layer = dependentLayers[layerId];

                if (layer instanceof AdjustmentLayer) {
                    return true;
                }

                var specifications = specificationsByLayer[layerId];
                return specifications.some(function (specification) {
                    return specification.hasOwnProperty("default");
                });
            }, this);

            if (resetRequired) {
                this._reset();
                return;
            }

            // Compute the set of removed layers;
            // subtract the removed layers from the set of changed layers above 
            var removedLayerIds = changedLayerIds.filter(function (layerId) {
                var layerChange = change.layers[layerId];
                if (layerChange.type === "removed") {
                    if (specificationsByLayer.hasOwnProperty(layerId)) {
                        delete specificationsByLayer[layerId];
                    }
                    return true;
                }
            }, this);

            // Clear out the removed layer components;
            // remove the assets from the old components and/or cancel their renders
            removedLayerIds.forEach(function (layerId) {
                var componentsToRemove = this._componentManager.getComponentsByLayer(layerId);

                Object.keys(componentsToRemove).forEach(function (componentId) {
                    this._cleanupDerivedComponents(componentId);
                    this._componentManager.removeComponent(componentId);
                }, this);
            }, this);

            Object.keys(specificationsByLayer).forEach(function (layerId) {
                var layer = dependentLayers[layerId],
                    currentComponents = specificationsByLayer[layerId],
                    previousComponents = this._componentManager.getComponentsByLayer(layerId);

                Object.keys(previousComponents).forEach(function (componentId) {
                    this._cleanupDerivedComponents(componentId);
                    this._componentManager.removeComponent(componentId);
                }, this);

                currentComponents.forEach(function (component) {
                    try {
                        var componentId = this._componentManager.addComponent(layer, component);
                        this._componentManager.getDerivedComponents(componentId).forEach(function (derivedComponent) {
                            this._requestRender(derivedComponent);
                        }, this);
                    } catch (ex) {
                        this._reportLayerError(layer, ex.message);
                    }
                }, this);
            }, this);
        }
    };

    /**
     * Start generating assets for the document. All assets for the document will
     * be regenerated initially, and new assets will continually be regenerated
     * as a result of document changes.
     */
    AssetManager.prototype.start = function () {
        this._document.on("change", this._handleChange);
        this._init();
    };

    /**
     * Stop generating assets for the document. Note that this does not delete any
     * existing assets, but document changes will be ignored and existing assets will
     * not be updated.
     */
    AssetManager.prototype.stop = function () {
        this._document.removeListener("change", this._handleChange);
        this._renderManager.cancelAll(this._document.id);
        this._fileManager.cancelAll();
    };

    module.exports = AssetManager;
}());