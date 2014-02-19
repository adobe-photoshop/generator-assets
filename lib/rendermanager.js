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

    var os = require("os");

    var Q = require("q");

    var renderer = require("./renderer");

    var createSVGRenderer = renderer.createSVGRenderer,
        createPixmapRenderer = renderer.createPixmapRenderer;

    var CHANGE_DELAY = 300,
        MAX_JOBS = os.cpus().length;

    /**
     * Manages asynchonous rendering jobs across all active documents.
     * 
     * @constructor
     * @param {Generator} generator
     * @param {object} config
     * @param {Logger} logger
     */
    function RenderManager(generator, config, logger) {
        this._generator = generator;
        this._config = config;
        this._logger = logger;

        this._svgRenderers = {};
        this._pixmapRenderers = {};

        this._componentsByDocument = {};
        this._pending = {};
        this._working = {};
    }

    /**
     * @type {Generator}
     */
    RenderManager.prototype._generator = null;

    /**
     * @type {object}
     */
    RenderManager.prototype._config = null;

    /**
     * @type {Logger}
     */
    RenderManager.prototype._logger = null;

    /**
     * Per-document set of SVGRenderer objects
     * 
     * @type {Object.<number: SVGRenderer>}
     */
    RenderManager.prototype._svgRenderers = null;

    /**
     * Per-document set of PixmapRenderer objects
     * 
     * @type {Object.<number: PixmapRenderer>}
     */
    RenderManager.prototype._pixmapRenderers = null;

    /**
     * @type {?number}
     */
    RenderManager.prototype._changeTimer = null;

    /**
     * Return, creating if necessary, an SVG renderer for the given document.
     *
     * @private
     * @param {Document} document
     * @return {SVGRenderer}
     */
    RenderManager.prototype._getSVGRenderer = function (document) {
        if (!this._svgRenderers.hasOwnProperty(document.id)) {
            this._svgRenderers[document.id] =
                createSVGRenderer(this._generator, this._config, this._logger, document);
        }

        return this._svgRenderers[document.id];
    };

    /**
     * Return, creating if necessary, a Pixmap renderer for the given document.
     * 
     * @private
     * @param {Document} document
     * @return {PixmapRenderer}
     */
    RenderManager.prototype._getPixmapRenderer = function (document) {
        if (!this._pixmapRenderers.hasOwnProperty(document.id)) {
            this._pixmapRenderers[document.id] =
                createPixmapRenderer(this._generator, this._config, this._logger, document);
        }

        return this._pixmapRenderers[document.id];
    };

    /**
     * If the work set is non-empty, begin processing it by removing one layer
     * id, rendering its components, and then recursively processing the rest
     * of the work set.
     * 
     * @private
     */
    RenderManager.prototype._processNextPending = function () {
        var working = Object.keys(this._working);
        if (working.length >= MAX_JOBS) {
            return;
        }

        var keys = Object.keys(this._pending);
        if (keys.length > 0) {
            // Pick a component to process from the pending set
            var componentId = keys[0],
                job = this._pending[componentId];

            delete this._pending[componentId];
            this._working[componentId] = job;

            var deferred = job.deferred,
                component = job.component,
                layer = component.layer,
                document = layer.document;

            this._logger.info("Rendering %d-%d-%s; %d pending", document.id, layer.id, componentId, keys.length - 1);
            this._renderComponent(document, layer, component)
                .then(function (path) {
                    deferred.resolve(path);
                }, function (err) {
                    deferred.reject(err);
                })
                .finally(function () {
                    delete this._working[componentId];

                    if (this._componentsByDocument.hasOwnProperty(document.id)) {
                        delete this._componentsByDocument[document.id][componentId];

                        if (Object.keys(this._componentsByDocument[document.id]).length === 0) {
                            delete this._componentsByDocument[document.id];
                        }
                    }

                    this._processNextPending();
                }.bind(this))
                .done();

            this._processNextPending();
        } else {
            this._changeTimer = null;
        }
    };

    /**
     * Render all the components of a layer.
     *
     * @private
     * @param {Document} document
     * @param {Layer} layer
     * @param {Component} component
     * @return {Promise.<string>} Resolves with the temporary path of the new asset once rendering is complete.
     */
    RenderManager.prototype._renderComponent = function (document, layer, component) {
        var renderer;

        if (component.extension === "svg") {
            renderer = this._getSVGRenderer(document);
        } else {
            renderer = this._getPixmapRenderer(document);
        }

        return renderer.render(layer, component);
    };

    /**
     * Render the given component to an asset at a temporary location in the filesystem.
     * 
     * @param {Component} component 
     * @return {Promise.<string>} Resolves with the temporary path of the new asset once rendering is complete.
     */
    RenderManager.prototype.render = function (component) {
        if (this._pending.hasOwnProperty(component.id)) {
            throw new Error("Render already pending for component: " + component.id);
        }

        var deferred = Q.defer(),
            layer = component.layer,
            document = layer.document;

        this._pending[component.id] = {
            deferred: deferred,
            component: component
        };

        if (!this._componentsByDocument.hasOwnProperty(document.id)) {
            this._componentsByDocument[document.id] = {};
        }
        this._componentsByDocument[document.id][component.id] = true;

        if (!this._changeTimer) {
            this._changeTimer = setTimeout(function () {
                this._processNextPending();
            }.bind(this), CHANGE_DELAY);
        }

        return deferred.promise;
    };

    /**
     * Cancel a pending render job for the given component. If the promise
     * returned from RenderManager.render is still pending, canceling the job
     * causes the promise to be rejected without an error message.
     * 
     * @see RenderManager.prototype.render
     * @param {number} componentId
     */
    RenderManager.prototype.cancel = function (componentId) {
        var job,
            set;

        if (this._pending.hasOwnProperty(componentId)) {
            set = this._pending;
        } else if (this._working.hasOwnProperty(componentId)) {
            set = this._working;
        } else {
            return;
        }

        job = set[componentId];
        delete set[componentId];

        var deferred = job.deferred,
            component = job.component,
            layer = component.layer,
            document = layer.document,
            documentComponents = this._componentsByDocument[document.id];

        delete documentComponents[componentId];
        if (Object.keys(documentComponents).length === 0) {
            delete this._componentsByDocument[document.id];
        }

        // TODO: Update renderers to test for cancellation at async entry points
        deferred.reject();
    };

    /**
     * Cancel all of a given document's render jobs.
     * 
     * @see RenderManager.prototype.render
     */
    RenderManager.prototype.cancelAll = function (documentId) {
        if (this._componentsByDocument.hasOwnProperty(documentId)) {
            Object.keys(this._componentsByDocument[documentId]).forEach(function (componentId) {
                this.cancel(componentId);
            }, this);
        }
    };

    module.exports = RenderManager;
}());