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


    /**
     * Asynchronously get a unique temporary path name.
     *
     * @private
     * @return {Promise.<string>}
     */
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
     * @type {boolean=}
     */
    BaseRenderer.prototype._useSmartScaling = undefined;

    /**
     * @type {boolean=}
     */
    BaseRenderer.prototype._includeAncestorMasks = undefined;

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
        var scale = component.scale || 1,
            settings = {
                scale: scale
            };

        return this._generator.getSVG(layer.document.id, layer.id, settings);
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
     * Asynchronously get exact bounds for the given component. These bounds
     * should be used if layer pixmap is sized explicitly or is scaled by a
     * non-integral multiple or if there is a mask or there are enabled layer
     * effects.
     *
     * @private
     * @param {Layer} layer
     * @param {Component} component
     * @return {Promise.<{inputRect: Bounds, outputRect: Bounds, expectedWidth: number,
     *      expectedHeight: number, getPadding: function (number, number): number }>}
     */
    PixmapRenderer.prototype._getSettingsWithExactBounds = function (layer, component) {
        var ppi = this._document.resolution;

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

            return pixmapSettings;
        }.bind(this));
    };

    /**
     * Synchronously get approximate bounds for the given component. These bounds
     * should only be used if layer pixmap is scaled by an integral multiple and if
     * there is no mask and there are no enabled layer effects.
     *
     * @private
     * @param {Layer} layer
     * @param {Component} component
     * @return {{inputRect: Bounds, outputRect: Bounds, expectedWidth: number,
     *      expectedHeight: number, getPadding: function (number, number): number }}
     */
    PixmapRenderer.prototype._getSettingsWithApproximateBounds = function (layer, component) {
        var scalar = component.scale;
        if (!scalar) {
            scalar = 1;
        }

        var inputRect = layer.bounds,
            outputRect = inputRect.scale(scalar);

        if (outputRect.right <= outputRect.left || outputRect.bottom <= outputRect.top) {
            throw new Error("Refusing to render pixmap with zero bounds.");
        }

        return {
            inputRect: inputRect,
            outputRect: outputRect,
            expectedWidth: outputRect.right - outputRect.left,
            expectedHeight: outputRect.bottom - outputRect.top,
            getPadding: function () {
                return {
                    top: 0,
                    right: 0,
                    bottom: 0,
                    left: 0
                };
            }
        };
    };

    /**
     * Get pixmap data for the given component.
     * 
     * @private
     * @param {Layer] layer
     * @param {Component} component
     * @return {Promise.<{pixmap: Pixmap, settings: object}>} Resolves with the pixmap data and settings
     */
    PixmapRenderer.prototype._getData = function (layer, component) {
        // The exact bounds computation, which is expensive, is skipped if all of the
        // following conditions hold:
        // 1. The component is either not scaled, or is only scaled by an integral
        //    factor (i.e, 100%, 200%, etc.)
        // 2. The layer does not have an enabled mask
        // 3. The layer does not have any enabled layer effects
        // 4. The "include-ancestor-masks" config option is NOT set
        var hasComplexTransform = (component.hasOwnProperty("scale") && component.scale % 1 !== 0) ||
                component.hasOwnProperty("width") || component.hasOwnProperty("height"),
            hasMask = layer.mask && layer.mask.enabled,
            hasEffects = layer.layerEffects && layer.layerEffects.isEnabled(),
            settingsPromise;

        if (hasComplexTransform || hasMask || hasEffects || this._includeAncestorMasks) {
            settingsPromise = this._getSettingsWithExactBounds(layer, component);
        } else {
            try {
                settingsPromise = new Q(this._getSettingsWithApproximateBounds(layer, component));
            } catch (ex) {
                settingsPromise = Q.reject(ex);
            }
        }

        return settingsPromise.then(function (pixmapSettings) {
            if (this._useSmartScaling !== undefined) {
                pixmapSettings.useSmartScaling = this._useSmartScaling;
            }
            
            if (this._includeAncestorMasks !== undefined) {
                pixmapSettings.includeAncestorMasks = this._includeAncestorMasks;
            }

            return this._generator.getPixmap(this._document.id, layer.id, pixmapSettings).then(function (pixmap) {
                var padding = pixmapSettings.hasOwnProperty("getPadding") ?
                        pixmapSettings.getPadding(pixmap.width, pixmap.height) : undefined,
                    quality = component.quality,
                    format = component.extension,
                    ppi = this._document.resolution,
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
            }.bind(this));
        }.bind(this));
    };

    /**
     * Write the render data to disk at the given path.
     * 
     * @private
     * @param {{pixmap: Pixmap, settings: object}} data
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