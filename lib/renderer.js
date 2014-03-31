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

    var fs = require("fs"),
        util = require("util");

    var tmp = require("tmp"),
        Q = require("q");



    function _getTempPath() {
        return Q.ninvoke(tmp, "tmpName");
    }

    /**
     * Abstract renderer class for a given document. Converts components to assets on disk.
     * 
     * @constructor
     * @param {Generator} generator
     * @param {object} config
     * @param {Logger} logger
     * @param {Document} document
     */
    function BaseRenderer(generator, config, logger, document) {
        this._generator = generator;
        this._document = document;
        this._logger = logger;

        if (config.hasOwnProperty("use-smart-scaling")) {
            this._useSmartScaling = !!config["use-smart-scaling"];
        }

        if (config.hasOwnProperty("include-ancestor-masks")) {
            this._includeAncestorMasks = !!config["include-ancestor-masks"];
        }
    }

    /**
     * Convert a value in a given unit, at particular resolution, to a value in pixels per inch.
     *
     * @param {number} value
     * @param {string} unit
     * @param {number} ppi 
     * @return {number}
     */
    BaseRenderer.prototype._convertToPixels = function (value, unit, ppi) {
        if (!value || !unit || unit === "px") {
            return value;
        }
        
        if (unit === "in") {
            return value * ppi;
        } else if (unit === "mm") {
            return (value / 25.4) * ppi;
        } else if (unit === "cm") {
            return (value / 2.54) * ppi;
        } else {
            this._logger.error("An invalid length unit was specified: " + unit);
        }
    };

    /**
     * Render a given component to an asset
     * 
     * @param {Layer} layer
     * @param {Component} component
     * @return {Promise.<string>} Resolves with the temporary path of the new asset once rendering is complete.
     */
    BaseRenderer.prototype.render = function () { /* layer, component, ...*/
        var dataPromise = this._getData.apply(this, arguments),
            pathPromise = _getTempPath();

        return Q.all([dataPromise, pathPromise])
            .spread(this._writeData.bind(this))
            .thenResolve(pathPromise);
    };

    /**
     * SVG asset renderer.
     * 
     * @constructor
     * @extends BaseRenderer
     */
    function SVGRenderer(generator, config, logger, document) {
        BaseRenderer.call(this, generator, config, logger, document);
    }

    util.inherits(SVGRenderer, BaseRenderer);

    /**
     * Get SVG data for the given component.
     * 
     * @private
     * @param {Layer] layer
     * @param {Component} component
     * @return {Promise.<string>} Resolves with the SVG data.
     */
    SVGRenderer.prototype._getData = function (layer, component) {
        var scale = component.scale || 1;

        return this._generator.getSVG(layer.id, scale, layer.document.id)
            .then(function (jsonObj) {
                return decodeURIComponent(jsonObj.svgText);
            });
    };

    /**
     * Write the render data to disk at the given path.
     * 
     * @private
     * @param {string} data
     * @param {string} path Temporary path at which to write data
     * @return {Promise} Resolves when data has been written
     */
    SVGRenderer.prototype._writeData = function (data, path) {
        return Q.nfcall(fs.writeFile, path, data, { encoding: "utf8" });
    };

    /**
     * Return a new SVGRenderer object.
     */
    function createSVGRenderer(generator, config, logger, document) {
        return new SVGRenderer(generator, config, logger, document);
    }

    /**
     * Pixmap asset renderer.
     * 
     * @constructor
     * @extends BaseRenderer
     */
    function PixmapRenderer(generator, config, logger, document) {
        BaseRenderer.call(this, generator, config, logger, document);
    }

    util.inherits(PixmapRenderer, BaseRenderer);

    /**
     * Get pixmap data for the given component.
     * 
     * @private
     * @param {Layer] layer
     * @param {Component} component
     * @return {Promise.<Object.<pixmap: Pixmap, settings: object>>} Resolves with the pixmap data and settings
     */
    PixmapRenderer.prototype._getData = function (layer, component) {
        var ppi = this._document.resolution;

        var getSettingsWithExactBounds = function () {
            return layer.getExactBounds().then(function (exactBounds) {
                if (exactBounds.right <= exactBounds.left || exactBounds.bottom <= exactBounds.top) {
                    throw new Error("Refusing to render pixmap with zero bounds.");
                }

                var scaleSettings = {
                        width:  this._convertToPixels(component.width,  component.widthUnit, ppi),
                        height: this._convertToPixels(component.height, component.heightUnit, ppi),
                        scaleX: component.scaleX || component.scale,
                        scaleY: component.scaleY || component.scale,
                        // Backwards compatibility
                        scale:  component.scale
                    },
                    // Mask
                    maskBounds = layer.mask && layer.mask.bounds,
                    // Static: User provided
                    staticBounds  = this._generator.getDeepBounds(layer),
                    // Visible: User provided + effects
                    visibleBounds = exactBounds,
                    // Padded: User provided + effects + padding through layer mask
                    paddedBounds  = !maskBounds ? exactBounds : {
                        left:   Math.min(exactBounds.left,   maskBounds.left),
                        top:    Math.min(exactBounds.top,    maskBounds.top),
                        right:  Math.max(exactBounds.right,  maskBounds.right),
                        bottom: Math.max(exactBounds.bottom, maskBounds.bottom)
                    },
                    pixmapSettings = this._generator.getPixmapParams(scaleSettings, staticBounds,
                        visibleBounds, paddedBounds);

                pixmapSettings.useSmartScaling = this._useSmartScaling;
                pixmapSettings.includeAncestorMasks = this._includeAncestorMasks;

                return pixmapSettings;
            }.bind(this));
        }.bind(this);

        function getSettingsWithApproximateBounds() {
            return new Q({
                inputRect: layer.bounds,
                outputRect: layer.bounds
            });
        }

        var settingsPromise;
        if (component.scale === 1 &&
            !(layer.mask && layer.mask.enabled) &&
            !(layer.layerEffects && layer.layerEffects.isEnabled())) {
            settingsPromise = getSettingsWithApproximateBounds();
        } else {
            settingsPromise = getSettingsWithExactBounds();
        }

        return settingsPromise.then(function (pixmapSettings) {
            return this._generator.getPixmap(this._document.id, layer.id, pixmapSettings).then(function (pixmap) {
                var padding = pixmapSettings.hasOwnProperty("getPadding") ?
                        pixmapSettings.getPadding(pixmap.width, pixmap.height) : undefined,
                    quality = component.quality,
                    format = component.extension,
                    settings = {
                        quality: quality,
                        format: format,
                        ppi: ppi,
                        padding: padding
                    };

                return {
                    pixmap: pixmap,
                    settings: settings
                };
            });
        }.bind(this));
    };

    /**
     * Write the render data to disk at the given path.
     * 
     * @private
     * @param {Object.<pixmap: Pixmap, settings: object>} data
     * @param {string} path Temporary path at which to write data
     * @return {Promise} Resolves when data has been written
     */
    PixmapRenderer.prototype._writeData = function (data, path) {
        return this._generator.savePixmap(data.pixmap, path, data.settings);
    };

    /**
     * Return a new PixmapRenderer object.
     */
    function createPixmapRenderer(generator, config, logger, document) {
        return new PixmapRenderer(generator, config, logger, document);
    }

    exports.createPixmapRenderer = createPixmapRenderer;
    exports.createSVGRenderer = createSVGRenderer;
}());