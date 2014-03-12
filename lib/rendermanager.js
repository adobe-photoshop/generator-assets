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
        util = require("util");

    var analysis = require("./analysis"),
        renderer = require("./renderer");

    var createSVGRenderer = renderer.createSVGRenderer,
        createPixmapRenderer = renderer.createPixmapRenderer;

    function RenderManager(generator, document) {
        this._generator = generator;
        this._document = document;
        this._svgRenderer = createSVGRenderer(generator, document);
        this._pixmapRenderer = createPixmapRenderer(generator, document);
        this._components = {};
        this._changes = [];
        this._renderQueue = [];


        this._document.on("change", this._handleChange.bind(this));
        this._init();
    }

    util.inherits(RenderManager, events.EventEmitter);

    RenderManager.prototype._init = function () {
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
                    this._renderQueue.push({
                        id: id,
                        components: this._components[id]
                    });
                }
            }
        }.bind(this));

        this._processRenderQueue();
    };

    RenderManager.prototype._processRenderQueue = function () {
        if (this._renderQueue.length > 0) {
            var workObj = this._renderQueue.shift(),
                layerId = workObj.id,
                layer = this._document.findLayer(layerId).layer,
                components = workObj.components,
                boundsSettings = {
                    boundsOnly: true
                };

            this._generator.getPixmap(this._document.id, layerId, boundsSettings)
                .then(function (pixmapInfo) {
                    var exactBounds = pixmapInfo.bounds;

                    return components.map(function (component) {
                        return this._renderComponent(layer, component, exactBounds);
                    }, this);
                });
        }
    };

    RenderManager.prototype._renderComponent = function (layer, component, bounds) {
        if (component.extension === "svg") {
            return this._svgRenderer.render(layer, component);
        } else {
            return this._pixmapRenderer.render(layer, component, bounds);
        }
    };

    RenderManager.prototype._handleChange = function (change) {
        console.log("handleChange:", change);
    };

    RenderManager.prototype.finish = function () {
        this._document.off("change");
    };

    module.exports = RenderManager;
}());