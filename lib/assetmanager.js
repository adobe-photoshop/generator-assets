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

    var events = require("events"),
        os = require("os"),
        util = require("util"),
        META_PLUGIN_ID = "crema";

    var Q = require("q");

    var ComponentManager = require("./componentmanager"),
        FileManager = require("./filemanager"),
        ErrorManager = require("./errormanager");

    var MAX_PATH_LENGTH = os.platform() === "darwin" ? 255 : 260;

    /**
     * The asset manager maintains a set of assets for a given document. On
     * initialization, it parses the layers' names into a set of components,
     * requests renderings of each of those components from the render manager,
     * and organizes the rendered assets into the appropriate files and folders.
     * When the document changes, it requests that the appropriate components be
     * re-rendered or moved into the right place. It also manages error reporting.
     *
     * @constructor
     * @param {Generator} generator
     * @param {object} config
     * @param {Logger} logger
     * @param {Document} document
     * @param {RenderManager} renderManager
     */
    function AssetManager(generator, config, logger, document, renderManager) {
        events.EventEmitter.call(this);

        this._generator = generator;
        this._config = config;
        this._logger = logger;
        this._document = document;
        this._metaDataRoot = config["meta-data-root"] || META_PLUGIN_ID;

        this._renderManager = renderManager;
        this._fileManager = new FileManager(generator, config, logger);
        this._errorManager = new ErrorManager(generator, config, logger, this._fileManager);
    }

    util.inherits(AssetManager, events.EventEmitter);

    /**
     * The set of promises for components currently being rendered. The map is
     * keyed on componetIds, and maps to Promises that resolve with the temporary
     * path of the rendered asset.
     *
     * @type {{number: Promise.<string>}}
     */
    AssetManager.prototype._renderPromises = null;

    /**
     * The unordered set of promises from the fileManager for assets being moved into place.
     *
     * @type {Array.<Promise>}
     */
    AssetManager.prototype._filePromises = null;

    /**
     * @type {RenderManager}
     */
    AssetManager.prototype._renderManager = null;

    /**
     * @type {FileManager}
     */
    AssetManager.prototype._fileManager = null;

    /**
     * @type {ErrorManager}
     */
    AssetManager.prototype._errorManager = null;

    /**
     * @type {ComponentManager}
     */
    AssetManager.prototype._componentManager = null;

    /**
     * Cancel render jobs and remove assets for all the components derived from
     * the basic component referred to by the given componentId.
     * 
     * @private
     * @param {string} componentId
     */
    AssetManager.prototype._cleanupDerivedComponents = function (componentId) {
        if (this._componentManager.getComponent(componentId)) {
            this._componentManager.getDerivedComponents(componentId).forEach(function (derivedComponent) {
                if (this._hasPendingRender(derivedComponent.id)) {
                    this._renderManager.cancel(derivedComponent.id);
                }

                this._fileManager.removeFileWithin(derivedComponent.assetPath);
            }, this);
        }
    };

    /**
     * Cleanup render jobs and assets for all layers in the given document.
     *
     * @private
     */
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
    
    /**
     * Add components related to a give layer comp
     * 
     * @private
     * @param {object} comp a layer comp
     * @param {Document} doc the target document
     * @param {object} compComponents a lookup of components by component Id
     */
    AssetManager.prototype._addComponentsForComp = function (comp, doc, compComponents) {
        this._componentManager.findAllComponents(comp).forEach(function (result) {
            if (result.component) {
                if (!result.component.default) {
                    try {
                        result.component.document = doc;
                        result.component.comp = comp;
                        result.component.assetPath = result.component.file;
                        this._componentManager.addLayerCompComponent(result.component);
                        compComponents.push(result.component);
                    } catch (err) {
                        this._errorManager.addError(comp, err.message, this._errorManager.LAYER_COMP);
                    }
                } else {
                    this._errorManager.addError(
                        comp,
                        "Default spec in layer comp names are unsupported.",
                        this._errorManager.LAYER_COMP
                    );
                }
            } else {
                if (result.errors) {
                    result.errors.forEach(function (errMsg) {
                        this._errorManager.addError(comp, errMsg, this._errorManager.LAYER_COMP);
                    }.bind(this));
                    
                } else {
                    console.warn("result.component not found, instead " + JSON.stringify(result));
                }
            }
        }.bind(this));
    };

    /**
     * Add a component for rendering an entire document.
     *
     * @private
     * @param {object} documentComponent The target document's asset settings.
     * @param {Document} document The target document.
     */
    AssetManager.prototype._addComponentForDocument = function (documentComponent, document, documentComponents) {
        documentComponent.document = document;
        this._componentManager.addDocumentComponent(documentComponent);
        documentComponents.push(documentComponent);
    };

    /**
     * Private getting to retrieve the document wide meta data
     * 
     * @private
     * @return {docMeta} - parsed doc meta object or undefined if not there or parser error
     */
    AssetManager.prototype._getDocumentMetaData = function () {
        var docMetaRaw = this._document._generatorSettings && this._document._generatorSettings[this._metaDataRoot];
        
        if (docMetaRaw && docMetaRaw.json) {
            try {
                return JSON.parse(docMetaRaw.json);
            } catch (ex) {
                this._logger.error("_getDocumentMetaData failed to parse json: %s", ex.message);
            }
        }
    };
    
    /**
     * Initialize the default layer support from the document level meta-data
     * 
     * @private
     */
    AssetManager.prototype._initDefaultMetaComponents = function (docMeta) {
        this._logger.info("default components enabled");
            
        this._componentManager.resetDefaultMetaComponents();
        //read the default layer spec
        if (docMeta.scaleSettings) {
            docMeta.scaleSettings.forEach(function (spec) {

                //make the spec as-expected for component manager

                if (typeof spec.folder === "string") {
                    spec.folder = [spec.folder];
                }
                if (!spec.file) {
                    spec.file = "";
                }

                this._componentManager.addDefaultMetaComponent(spec);
            }, this);
        }
    };
    
    /**
     * Initialize all the components from each layer
     * 
     * @private
     * @return {Array} array of layer ID that were added
     */
    AssetManager.prototype._initComponents = function () {
        var layerIdsWithComponents = [];
        
        this._document.layers.visit(function (layer) {
            // Don't visit the top-level LayerGroup
            if (!layer.group) {
                return;
            }

            var hasValidComponent = false;
            
            try {
                this._componentManager.findAllComponents(layer).forEach(function (result) {
                    var component = result.component;
                    if (component) {
                        try {
                            this._componentManager.addComponent(layer, component);
                            hasValidComponent = true;
                        } catch (ex) {
                            this._errorManager.addError(layer, ex.message);
                        }
                    } else if (result.errors) {
                        result.errors.forEach(function (error) {
                            this._errorManager.addError(layer, error);
                        }.bind(this));
                    }
                }, this);
            } catch (ex) {
                this._errorManager.addError(layer, ex.message);
            }

            if (hasValidComponent) {
                layerIdsWithComponents.push(layer.id);
            }
        }.bind(this));
        
        return layerIdsWithComponents;
    };
    
    /**
     * Initialize this AssetManager instance, completely resetting internal state
     * and re-rendering the components of all layers. This does NOT delete any
     * existing assets; for that @see AssetManager.prototype._cleanup.
     * 
     * @private
     */
    AssetManager.prototype._init = function () {
        this._renderPromises = {};
        this._filePromises = [];
        this._componentManager = new ComponentManager(this._generator, this._config);
        this._fileManager.updateBasePath(this._document);
        this._errorManager.removeAllErrors();
        this._renderManager.cancelAll(this._document.id);
        
        var layerIdsWithComponents = [],
            compComponents = [],
            comps = this._document._comps,
            docMeta = this._getDocumentMetaData(),
            documentComponents = [],
            documentAssetSettings = docMeta && docMeta.assetSettings;

        if (docMeta && docMeta.metaEnabled) {
            this._initDefaultMetaComponents(docMeta);
        }
        
        layerIdsWithComponents = this._initComponents();
        this._requestRenderForLayers(layerIdsWithComponents);

        if (comps) {
            comps.forEach(function (comp) {
                this._addComponentsForComp(comp, this._document, compComponents);
            }.bind(this));
            this._requestRenderForComponents(compComponents);
        }

        if (documentAssetSettings) {
            documentAssetSettings.forEach(function (settings) {
                this._addComponentForDocument(settings, this._document, documentComponents);
            }.bind(this));
            this._requestRenderForComponents(documentComponents);
        }

        this._errorManager.reportErrors();
    };
    
    /**
     * Request render for for each derived component based on each layer in 
     * layerIdsWithComponents
     * 
     * @private
     * @param {Array} layerIdsWithComponents to be rendered
     */
    AssetManager.prototype._requestRenderForLayers = function (layerIdsWithComponents) {
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
    
    /**
     * Request render for each component in components
     * 
     * @private
     * @param {Array} components
     */
    AssetManager.prototype._requestRenderForComponents = function (components) {
        components.forEach(function (component) {
            this._requestRender(component);
        }, this);
    };

    /**
     * Completely reset assets for this document, first attempting to removing
     * existing assets and then regenerating all current assets.
     * 
     * @private
     */
    AssetManager.prototype._reset = function () {
        this._cleanup();
        this._init();
    };

    /**
     * Report non-catastrophic errors
     * @private
     * @param {Array.<string>} errors
     */
    AssetManager.prototype._reportSoftErrors = function (errors, component) {
        if (!errors || !errors.length) {
            return;
        }

        errors.forEach(function (err) {
            this._errorManager.addErrorForComponent(component, err);
        }.bind(this));

        this._errorManager.reportErrors();
    };
    
    /**
     * Request that the given component be rendered into an asset.
     * 
     * @private
     * @param {Component} component
     */
    AssetManager.prototype._requestRender = function (component) {
        // Crude check for components whose eventual path will be too long
        if (this._fileManager.basePath) {
            var candidatePathLength = this._fileManager.basePath.length + component.assetPath.length + 1;
            if (candidatePathLength >= MAX_PATH_LENGTH) {
                this._errorManager.addErrorForComponent(component, "Asset path is too long: " + component.assetPath);
                return;
            }
        }
        
        // FIXME: the document and layer might need to be cloned so that they
        // don't change in the middle of rendering
        var renderPromise = this._renderManager.render(component);

        this._renderPromises[component.id] = renderPromise;

        renderPromise
            .then(function (renderResult) {
                var tmpPath = renderResult.path;
                this._reportSoftErrors(renderResult.errors, component);
                if (tmpPath) {
                    var filePromise = this._fileManager.moveFileInto(tmpPath, component.assetPath);
                    this._filePromises.push(filePromise);
                    this._logger.info("Render complete: %s", component.assetPath);
                } else {
                    this._logger.warn("Render finished without path: %s", component.assetPath);
                }
            }.bind(this))
            .fail(function (err) {
                if (err) {
                    this._logger.error("Render failed: %s", component.assetPath, err);
                } else {
                    this._logger.info("Render canceled: %s", component.assetPath);
                }
            }.bind(this))
            .finally(function () {
                delete this._renderPromises[component.id];

                // If we've processed all our render job then wait for all the
                // file movement to finish to emit an "idle" event
                if (Object.keys(this._renderPromises).length === 0) {
                    Q.allSettled(this._filePromises).finally(function () {
                        this.emit("idle");
                    }.bind(this));
                    this._filePromises = [];
                }
            }.bind(this))
            .done();
    };

    /**
     * Determine whether or not the given component has a rendering job in flight.
     * 
     * @private
     * @param {string} componentId
     * @return {boolean}
     */
    AssetManager.prototype._hasPendingRender = function (componentId) {
        if (this._renderPromises.hasOwnProperty(componentId)) {
            var promise = this._renderPromises[componentId];

            if (promise.inspect().state === "pending") {
                return true;
            }
        }

        return false;
    };
    
    /**
     * Start generating assets for the document. All assets for the document will
     * be regenerated initially, and new assets will continually be regenerated
     * as a result of document changes.
     */
    AssetManager.prototype.start = function () {
        this._init();
    };

    /**
     * Stop generating assets for the document. Note that this does not delete any
     * existing assets, but document changes will be ignored and existing assets will
     * not be updated.
     */
    AssetManager.prototype.stop = function () {
        this._renderManager.cancelAll(this._document.id);
        this._fileManager.cancelAll();
    };

    module.exports = AssetManager;
}());
