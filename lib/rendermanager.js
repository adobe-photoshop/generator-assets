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

    function RenderManager(generator, config) {
        this._generator = generator;
        this._config = config;

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

    RenderManager.prototype._getSVGRenderer = function (document) {
        if (!this._svgRenderers.hasOwnProperty(document.id)) {
            this._svgRenderers[document.id] = createSVGRenderer(this._generator, this._config, document);
        }

        return this._svgRenderers[document.id];
    };

    RenderManager.prototype._getPixmapRenderer = function (document) {
        if (!this._pixmapRenderers.hasOwnProperty(document.id)) {
            this._pixmapRenderers[document.id] = createPixmapRenderer(this._generator, this._config, document);
        }

        return this._pixmapRenderers[document.id];
    };

    /**
     * If the work set is non-empty, begin processing it by removing one layer
     * id, rendering its components, and then recursively processing the rest
     * of the work set.
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

            console.log("Rendering %d-%d-%d; %d pending", document.id, layer.id, componentId, keys.length - 1);
            this._renderComponent(document, layer, component)
                .then(function (path) {
                    deferred.resolve(path);
                }, function (err) {
                    console.warn("Failed to render layer " + layer.id, err.stack);
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
     */
    RenderManager.prototype._renderComponent = function (document, layer, component) {
        if (component.extension === "svg") {
            return this._getPixmapRenderer(document)
                .render(layer, component);
        } else {
            return layer.getExactBounds().then(function (exactBounds) {
                if (exactBounds.right <= exactBounds.left || exactBounds.bottom <= exactBounds.top) {
                    console.warn("Refusing to render pixmap with zero bounds.");
                    return;
                }

                return this._getPixmapRenderer(document)
                    .render(layer, component, exactBounds);
            }.bind(this));
        }
    };

    RenderManager.prototype.render = function (component) {
        if (this._pending.hasOwnProperty(component.id)) {
            throw new Error("Render already pending for component: %d", component.id);
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
            layer = job.component,
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
     * Stop rendering this document's layer components. 
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