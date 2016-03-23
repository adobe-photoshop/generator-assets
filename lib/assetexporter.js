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

/*jslint vars: true, node: true, plusplus: true, devel: true, nomen: true, indent: 4*/

(function () {
    "use strict";
    
    var Q = require("q"),
        path = require("path"),
        Renderer = require("./renderer"),
        DocumentManager = require("./documentmanager"),
        FileManager = require("./filemanager"),
        ConcurrencyLimiter = require("./concurrency-limiter"),
        FileUtils = require("./fileutils");

    /**
     * High level asset extract API, used for on-demand generation
     */
    function AssetExporter(generator, config, logger) {
        this._generator = generator;
        this._config = config;
        this._logger = logger;
        var options = { clearCacheOnChange: true,
                getDocumentInfoFlags: {
                    getTextStyles: false,
                    compInfo: false,
                    getCompLayerSettings:false
                }
            };

        this._documentManager = new DocumentManager(generator, config, logger, options);
        this._concurrencyLimiter = new ConcurrencyLimiter();
        this._fileManagers = {};
    }
        
    /**
     * Generator
     * @type {Generator}
     */
    AssetExporter.prototype._generator = null;

    /**
     * Plugin config
     * @type {object}
     */
    AssetExporter.prototype._config = null;

    /**
     * Plugin Logger
     * @type {Logger}
     */
    AssetExporter.prototype._logger = null;

    /**
     * Instance of a DocumentManager from generator-assets
     * @type {DocumentManager}
     */
    AssetExporter.prototype._documentManager = null;

    /**
     * Instance of a ConcurrencyLimiter to throttle the component generations
     * TODO this was absorbed from crema and may be duplicative of existing limiting controls already in place?
     * @type {DocumentManager}
     */
    AssetExporter.prototype._concurrencyLimiter = null;

    /**
     * Map of file managers, one per document, keyed by document ID
     * @type {{number: FileManager}}
     */
    AssetExporter.prototype._fileManagers = null;

    /**
     * Get this document's fileManager from local store, or build it
     *
     * @param {Document} document
     * @return {FileManager} instance of FileManager
     */
    AssetExporter.prototype.getFileManager = function (document) {
        if (this._fileManagers.hasOwnProperty(document.id)) {
            return this._fileManagers[document.id];
        } else {
            var fileManager = new FileManager(this._generator, this._config, this._logger);

            fileManager.updateBasePath(document);
            fileManager._queue.unpause();

            var _changeHandler = function (change) {
                if (change.file) {
                    fileManager.updateBasePath(document);
                }
            };

            // TODO clean these up eventually?
            // Or maybe the underlying document gets cleaned up by DocumentManager?
            document.on("change", _changeHandler);

            this._fileManagers[document.id] = fileManager;
            return fileManager;
        }
    };
    
    /**
     * Renders a component object, representing an asset, to a temporary location
     * @param {Document} document
     * @param {!Component} component
     * @param {number} component.documentId Document to export, or if layerId is defined, the document that the layerId
     *      belongs to.
     * @param {number=} component.layerId Layer to export.
     * @param {!string} component.extension The type of asset to export (e.g. "jpg").
     * @param {number=} component.quality Quality settings for the exported asset.
     *      For extension "png", set quality to 8 to produce a PNG-8 image.
     *      For extension "jpg", set quality from 0-100.
     * @param {number=} component.scale The scale of the exported asset.
     * @param {number=} component.width The width of the exported asset.
     * @param {number=} component.height The height of the exported asset.
     * return {Promise} Promise is resolved when the layer is finished rendering with the temp file location or buffer
     */
    AssetExporter.prototype.generateComponent = function (document, component) {
        component.document = document;

        if (component.layerId) {
            var result = document.layers.findLayer(component.layerId);
            if (!result) {
                throw new Error("Layer with id %d not found.", component.layerId);
            }

            component.layer = result.layer;
        }

        var rendererFactory = (component.extension === "svg") ?
                Renderer.createSVGRenderer : Renderer.createPixmapRenderer,
            renderer = rendererFactory(this._generator, this._config, this._logger, document);

        return this._concurrencyLimiter.enqueue(function () {
            // Prefer caller provided stream
            if (component.stream) {
                return renderer.renderToStream(component, component.stream);
            }
            return renderer.render(component);
        });
    };

    /**
     * Exports a component object, representing an asset, to its specified location.
     *
     * @param {!Component} component
     * @param {number} component.documentId Document to export, or if layerId is defined, the document that the layerId
     *      belongs to.
     * @param {number=} component.layerId Layer to export.
     * @param {!string} component.extension The type of asset to export (e.g. "jpg").
     * @param {!string} component.path The full destination path for the exported asset.
     * @param {number=} component.quality Quality settings for the exported asset.
     *      For extension "png", set quality to 8 to produce a PNG-8 image.
     *      For extension "jpg", set quality from 0-100.
     * @param {number=} component.scale The scale of the exported asset.
     * @param {number=} component.width The width of the exported asset.
     * @param {number=} component.height The height of the exported asset.
     * return {Promise} This promise is resolved when the layer is finished exporting.
     */
    AssetExporter.prototype.exportComponent = function (component) {
        var documentPromise;
        // Resolve documentId and layerId to DOM objects.
        if (component.documentId) {
            documentPromise = this.getDocument(component.documentId);
        } else {
            // This is for backwards compatibility - perhaps can be removed at some point...
            documentPromise = this.getActiveDocument().then(function (document) {
                component.documentId = document.id;
                return document;
            });
        }

        return documentPromise
            .then(function (document) {
                var generatePromise = this.generateComponent(document, component)
                    .catch(function (e) {
                        throw new Error("Error generating component: " + e.message);
                    });

                return [
                    generatePromise.get("path"),
                    this.getFileManager(document)
                ];
            }.bind(this))
            .spread(function (temporaryFilePath, fileManager) {
                if (component.path) {
                    // explicitly move to an absolute path
                    return fileManager.moveFileAbsolute(temporaryFilePath, component.path);
                } else if (component.fileName) {
                    // Use the fileManager's built in notion of a base directory
                    return fileManager.moveFileInto(temporaryFilePath, component.fileName);
                } else {
                    throw new Error("Can not save file without a path or fileName");
                }
            });
    };
    
    /**
     * Exports components objects, respresenting assets, to their specified locations.
     *
     * @param {Array} components See exportComponent for details about Component objects.
     *
     * return {Promise} Resolved when all components have either been exported or failed to export.
     */
    AssetExporter.prototype.exportComponents = function (components) {
        var promise = Q.allSettled(components.map(this.exportComponent, this));
        promise.spread(function (result) {
            // TODO: Put this in its own server call. It's a different concept than exporting a component.
            // If any file was successfully exported, show it in finder.
            if (result.state === "fulfilled") {
                FileUtils.openFolderOnceInOS(path.dirname(components[0].path));
            }
        });
        // TODO better error handling (like GS version does)?
        return promise;
    };

    /**
     * Gets a document by id.
     *
     * return {Promise} Resolved with the specified document or rejected if it is not available.
     */
    AssetExporter.prototype.getDocument = function (id) {
        return this._documentManager.getDocument(id);
    };

    /**
     * Gets the currently open document in Photoshop.
     *
     * return {Promise} Resolved with the active document or rejected if none is open.
     */
    AssetExporter.prototype.getActiveDocument = function () {
        return this._documentManager.getActiveDocument();
    };

    module.exports = AssetExporter;
}());
