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

    var renderer = require("./renderer");

    var createSVGRenderer = renderer.createSVGRenderer,
        createPixmapRenderer = renderer.createPixmapRenderer;

    var CHANGE_DELAY = 1000,
        MAX_JOBS = os.cpus().length;

    function RenderManager(generator) {
        this._generator = generator;

        this._svgRenderers = {};
        this._pixmapRenderers = {};

        this._componentsByDocument = {};
        this._pending = {};
        this._working = {};
    }

    util.inherits(RenderManager, events.EventEmitter);

    RenderManager.prototype._generator = null;

    RenderManager.prototype._svgRenderers = null;

    RenderManager.prototype._pixmapRenderers = null;

    RenderManager.prototype._changeTimer = null;

    RenderManager.prototype._jobCounter = 0;

    RenderManager.prototype._getSVGRenderer = function (document) {
        if (!this._svgRenderers.hasOwnProperty(document.id)) {
            this._svgRenderers[document.id] = createSVGRenderer(this._generator, document);
        }

        return this._svgRenderers[document.id];
    };

    RenderManager.prototype._getPixmapRenderer = function (document) {
        if (!this._pixmapRenderers.hasOwnProperty(document.id)) {
            this._pixmapRenderers[document.id] = createPixmapRenderer(this._generator, document);
        }

        return this._pixmapRenderers[document.id];
    };

    /**
     * If the work set is non-empty, begin processing it by removing one layer
     * id, rendering its components, and then recursively processing the rest
     * of the work set.
     */
    RenderManager.prototype._processNextPending = function () {
        var keys = Object.keys(this._pending);

        if (keys.length >= MAX_JOBS) {
            return;
        }

        if (keys.length > 0) {
            // Pick a component to process from the pending set
            var componentId = keys[0],
                job = this._pending[componentId];

            delete this._pending[componentId];
            this._working[componentId] = job;

            var document = job.document,
                layer = job.layer,
                component = job.component,
                deferred = job.deferred;

            this._renderComponent(document, layer, component)
                .then(function (path) {
                    console.log("Finished rendering component %d for layer %d to path %s.",
                        componentId, layer.id, path);
                    deferred.resolve(path);
                }, function (err) {
                    console.warn("Failed to render layer " + layer.id, err.stack);
                    deferred.reject(err);
                })
                .finally(function () {
                    delete this._working[componentId];

                    delete this._componentsByDocument[job.document][componentId];
                    if (Object.keys(this._componentsByDocument[job.document]).length === 0) {
                        delete this._componentsByDocument[job.document];
                    }

                    this._processNextPending();
                }.bind(this));

            this._processNextPending();
        } else {
            console.log("Rendering quiesced.");
            this._changeTimer = null;
        }
    };

    /**
     * Render all the components of a layer.
     */
    RenderManager.prototype._renderComponent = function (document, layer, component) {
        var boundsSettings = {
            boundsOnly: true
        };

        console.log("Rendering layer %d", layer.id);
        if (component.extension === "svg") {
            return this._getPixmapRenderer(document)
                .render(layer, component);
        } else {
            return this._generator.getPixmap(document.id, layer.id, boundsSettings)
                .get("bounds")
                .then(function (exactBounds) {
                    if (exactBounds.right <= exactBounds.left || exactBounds.bottom <= exactBounds.top) {
                        throw new Error("Refusing to render pixmap with zero bounds.");
                    }
                    
                    return this._getPixmapRenderer(document).render(layer, component, exactBounds);
                }.bind(this));
        }
    };

    RenderManager.prototype.render = function (document, layer, component, componentId) {
        if (this._pending.hasOwnProperty(componentId)) {
            throw new Error("Render already pending for component: %d", componentId);
        }

        var deferred = Q.defer();

        this._pending[componentId] = {
            deferred: deferred,
            document: document,
            layer: layer,
            component: component
        };

        if (!this._componentsByDocument.hasOwnProperty(document.id)) {
            this._componentsByDocument[document.id] = {};
        }
        this._componentsByDocument[document.id] = componentId;

        if (!this._changeTimer) {
            this._changeTimer = setTimeout(function () {
                this._processNextPending();
            }.bind(this), CHANGE_DELAY);
        }

        return deferred.promise;
    };

    RenderManager.prototype.cancel = function (componentId) {
        var job,
            set;

        if (this._pending.hasOwnProperty(componentId)) {
            set = this._pending;
        } else if (this._working.hasOwnProperty(componentId)) {
            set = this._working;
        }

        job = set[componentId];
        delete set[componentId];

        var documentComponents = this._componentsByDocument[job.document.id];

        delete documentComponents[componentId];
        if (Object.keys(documentComponents).length === 0) {
            delete this._componentsByDocument[job.document.id];
        }

        // TODO: Update renderers to test for cancellation at async entry points
        job.deferred.reject();
    };

    /**
     * Stop rendering this document's layer components. 
     */
    RenderManager.prototype.cancelAll = function (documentId) {
        Object.keys(this._componentsByDocument[documentId]).forEach(function (componentId) {
            this.cancel(componentId);
        }, this);
    };

    module.exports = RenderManager;
}());