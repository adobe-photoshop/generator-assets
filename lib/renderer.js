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

    var Bounds = require("./dom/bounds");


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

        if (config.hasOwnProperty("convert-color-space")) {
            this._convertColorSpace = !!config["convert-color-space"];
        }

        if (config.hasOwnProperty("allow-dither")) {
            this._allowDither = !!config["allow-dither"];
        }

        if (config.hasOwnProperty("use-psd-smart-object-pixel-scaling")) {
            this._forceSmartPSDPixelScaling = !!config["use-psd-smart-object-pixel-scaling"];
        }

        if (config.hasOwnProperty("use-pngquant")) {
            this._usePngquant = !!config["use-pngquant"];
        }

        if (config.hasOwnProperty("webp-lossless")) {
            this._webpLossless = !!config["webp-lossless"];
        }
        
        if (config.hasOwnProperty("clip-all-images-to-document-bounds")) {
            this._clipAllImagesToDocumentBounds = !!config["clip-all-images-to-document-bounds"];
        }
        
        if (config.hasOwnProperty("mask-adds-padding")) {
            this._masksAddPadding = !!config["mask-adds-padding"];
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
     * @type {boolean=}
     * If true, PS will convert color data to the document's color space before sending to
     * Generator. By default (when this is falsy), the "raw" RGB data is sent, which is 
     * usually what is desired.
     */
    BaseRenderer.prototype._convertColorSpace = undefined;

    /**
     * @type {boolean=}
     */
    BaseRenderer.prototype._allowDither = undefined;

    /**
     * @type {boolean=}
     */
    BaseRenderer.prototype._forceSmartPSDPixelScaling = undefined;

    /**
     * @type {boolean=}
     */
    BaseRenderer.prototype._usePngquant = true;

    /**
     * @type {boolean=}
     * Indicates whether webp assets should be compressed losslessly. By default,
     * they are not.
     */
    BaseRenderer.prototype._webpLossless = undefined;
    
    /**
     * @type {boolean=}
     * Indicates whether exported assets should get clipped to the document bounds or not,
     * defaults to true to clip the assets so it's more WYSIWYG
     */
    BaseRenderer.prototype._clipAllImagesToDocumentBounds = true;
    
    /**
     * @type {boolean=}
     * Indicates whether layer and vector masks that are larget than the layer size should
     * add padding to the exported image
     */
    BaseRenderer.prototype._masksAddPadding = true;

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

    /*jshint unused: false*/
    /**
     * Render a given component to an asset
     * 
     * @param {!Component} component If neither component.layer or component.comp is specified, this method renders the
     *      whole document.
     * @param {Layer=} component.layer Layer to render. Exclusive of component.comp.
     * @param {Object=} component.comp Layer comp to render. Exclusive of component.layer.
     * @return {Promise.<string>} Resolves with the temporary path of the new asset once rendering is complete.
     */
    BaseRenderer.prototype.render = function (component) {
        var dataPromise = this._getData.apply(this, arguments),
            pathPromise = _getTempPath();

        return Q.all([dataPromise, pathPromise])
            .spread(this._writeData.bind(this));
    };
    /*jshint unused: true*/

    /**
     * SVG asset renderer.
     * 
     * @constructor
     * @extends BaseRenderer
     */
    function SVGRenderer(generator, config, logger, document) {
        BaseRenderer.call(this, generator, config, logger, document);
        
        if (config.hasOwnProperty("svgomg-enabled")) {
            this._useSVGOMG = !!config["svgomg-enabled"];
        }
    }

    util.inherits(SVGRenderer, BaseRenderer);

    
    /**
     * Get SVG for a layerSpec using svgObjectModelGenerator. Returns a promise that resolves to an SVG string.
     * The SVG can optionally be scaled proportionately using the "scale" parameter of the "settings" object
     * 
     * WARNING, Breaking changes to this method will only result in bumping the "patch" number of 
     * generator-assets, not the "major" version.
     *
     * @param {!number} documentId Document ID (required)
     * @param {!number|{firstLayerIndex: number, lastLayerIndex: number, hidden: Array.<number>=}} layerSpec
     *     Either the layer ID of the desired layer as a number, or an object of the form {firstLayerIndex: number,
     *     lastLayerIndex: number, ?hidden: Array.<number>} specifying the desired index range, inclusive, and
     *     (optionally) an array of indices to hide. Note that the number form takes a layer ID, *not* a layer index.
     * @param {=Object} settings An object with params to request the pixmap
     * @param {?float} settings.scale  The factor by which to scale the SVG (1.0 for 100%)
     * @param {?float} settings.width  Desired width in pixels (optional)
     * @param {?float} settings.height  Desired height in pixels (optional)
     */
    SVGRenderer.prototype._getSVGOMG = function (documentId, layerSpec, settings) {
        
        var svgOMG = require("svgobjectmodelgenerator"),
            scale = settings && settings.hasOwnProperty("scale") ? settings.scale : 1,
            width = settings ? settings.width : undefined,
            height = settings ? settings.height : undefined,
            constrainToDocBounds = settings ? settings.constrainToDocBounds : undefined,
            cropRect = settings ? settings.cropRect : undefined,
            params,
            compId;

        documentId = parseInt(documentId, 10);
        if (!isFinite(documentId)) {
            return Q.reject("documentId must be a number in call to _getSVGOMG");
        }
        
        if (isFinite(parseInt(settings.compId, 10))) {
            compId = settings.compId;
        }
        
        params = {
            layerSpec: layerSpec,
            layerScale: scale,
            targetWidth: width,
            targetHeight: height,
            documentId: documentId,
            compId: compId,
            constrainToDocBounds: constrainToDocBounds,
            cropRect: cropRect
        };
        
        return svgOMG.getGeneratorSVG(this._generator, params).then(
            function (result) {
                return {
                    data: result.svgText,
                    errors: result.errors
                };
            });
    };

    
    /**
     * @type {boolean=}
     * Whether to use svgOMG library or built in JSX implementation for rendering SVGs
     * Configurable through the "svg-enabled" config flag, which defaults to true.
    **/
    SVGRenderer.prototype._useSVGOMG = true;
    
    /**
     * Get SVG data for the given component.
     * 
     * @private
     * @param {!Component} component If neither component.layer or component.comp is specified, this method gets the SVG
     *      data for the whole document.
     * @param {Layer=} component.layer Layer to get the SVG data for. Exclusive of component.comp.
     * @param {Object=} component.comp Layer comp to get the SVG data for. Exclusive of component.layer.
     * @return {Promise.<string>} Resolves with the SVG data.
     */
    SVGRenderer.prototype._getData = function (component) {
        var scale = component.scale || 1,
            settings = {
                scale: scale,
                width: component.width,
                height: component.height
            },
            layer = component.layer,
            layerComp = component.comp;
        
        if (this._useSVGOMG) {
            if (layer) {
                if (component.canvasWidth || component.canvasHeight) {
                    settings.cropRect = {
                        width: component.canvasWidth || layer.bounds.width(),
                        height: component.canvasHeight || layer.bounds.height()
                    };
                }
                     
                if (this._clipAllImagesToDocumentBounds) {
                    var clippedBounds = layer.bounds.intersect(this._document.bounds);
                    if (clippedBounds.right <= clippedBounds.left || clippedBounds.bottom <= clippedBounds.top) {
                        var err = new Error("Refusing to render SVG with bounds completely clipped.");
                        err.outsideDocumentBoundsError = true;
                        return Q.reject(err);
                    }
                    settings.constrainToDocBounds = true;
                }
                return this._getSVGOMG(layer.document.id, layer.id, settings);
            } else /* if either a layerComp or the whole document */ {
                settings.constrainToDocBounds = this._clipAllImagesToDocumentBounds;
                if (layerComp) {
                    settings.compId = layerComp.id;
                }
                return this._getSVGOMG(this._document.id, "all", settings);
            }
        } else {
            if (layer) {
                return this._generator.getSVG(layer.document.id, layer.id, settings).then(function (result) {
                    return {
                        data: result
                    };
                });
            } else {
                return Q.reject(new Error("SVG is not supported for layer comps with the current configuration."));
            }
        }
    };

    /**
     * Write the render data to disk at the given path.
     * 
     * @private
     * @param {object} renderResult
     * @param {string} path Temporary path at which to write data
     * @return {Promise} Resolves when data has been written
     */
    SVGRenderer.prototype._writeData = function (renderResult, path) {
        return Q.nfcall(fs.writeFile,
                        path,
                        renderResult.data,
                        { encoding: "utf8" }).thenResolve({path: path, errors: renderResult.errors});
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

        if (config.hasOwnProperty("interpolation-type")) {
            this._interpolationType = config["interpolation-type"];
        }
    }

    util.inherits(PixmapRenderer, BaseRenderer);

    /**
     * Interpolation method to use when scaling pixmaps. If defined, this should
     * take the value of one of the Generator.prototype.INTERPOLATION constants.
     * Otherwise, Photoshop's default interpolation method is used.
     * 
     * @private
     * @see Generator.prototype.getPixmap
     * @type {boolean=}
     */
    PixmapRenderer.prototype._interpolationType = undefined;

    /**
     * Get the exact bounds for the contents of the document.
     *
     * TODO: Once the DOM is moved to core, unify this with
     * Generator.prototype.getDeepBounds.
     *
     * @private
     * @param {Document} doc
     * @return {Bounds}
     */
    PixmapRenderer.prototype._getContentBounds = function (doc) {
        var bounds;
        
        doc.layers.visit(function (layer) {
            
            var childBounds = layer.bounds,
                maskBounds = layer.getTotalMaskBounds();
            
            if (childBounds && (childBounds.right - childBounds.left > 0 || childBounds.bottom - childBounds.top > 0)) {
                
                if (!bounds) {
                    bounds = childBounds;
                } else {
                    // Compute containing rect of the union of the bounds and maskBounds
                    bounds = bounds.union(childBounds);
                }
            }
            
            if (maskBounds) {
                bounds = bounds.intersect(maskBounds);
            }
            
        }, this);

        return new Bounds(bounds);
    };
    
    /**
     * Asynchronously get exact bounds for the given component. These bounds
     * should be used if layer pixmap is sized explicitly or is scaled by a
     * non-integral multiple or if there is a mask or there are enabled layer
     * effects.
     *
     * @private
     * @param {Component} component
     * @return {Promise.<{inputRect: Bounds, outputRect: Bounds, expectedWidth: number,
     *      expectedHeight: number, getPadding: function (number, number): number }>}
     */
    PixmapRenderer.prototype._getSettingsWithExactBounds = function (component) {
        var ppi = this._document.resolution,
            layer = component.layer,
            layerComp = component.comp,
            doc = component.document,
            resultDeferred = Q.defer(),
            boundsAcquiredPromise,
            pixmapSettings,
            boundsResult;
        
        if (layer) {
            boundsAcquiredPromise = layer.getExactBounds().then(function (exactBounds) {
                boundsResult = {
                    exactBounds: exactBounds,
                    maskBounds: undefined
                };
                return boundsResult;
            });
        } else {
            boundsResult = {
                exactBounds: this._getContentBounds(doc),
                maskBounds: doc.bounds
            };
            boundsAcquiredPromise = Q.resolve(boundsResult);
        }
        
        boundsAcquiredPromise.then(function (bndsIn) {

            var exactBounds = bndsIn.exactBounds,
                maskBounds = bndsIn.maskBounds,
                staticBounds,
                scaleSettings,
                visibleBounds,
                paddedBounds,
                clipToBounds;
            
            if (exactBounds.right <= exactBounds.left || exactBounds.bottom <= exactBounds.top) {
                throw new Error("Refusing to render pixmap with zero bounds.");
            }

            if (layerComp) {
                staticBounds = exactBounds;
            } else {
                maskBounds = layer.getTotalMaskBounds();
                staticBounds  = new Bounds(this._generator.getDeepBounds(layer));
            }
            
            if (this._clipAllImagesToDocumentBounds) {
                clipToBounds = this._document.bounds;
                var clippedBounds = exactBounds.intersect(clipToBounds);
                if (clippedBounds.right <= clippedBounds.left || clippedBounds.bottom <= clippedBounds.top) {
                    var err = new Error("Refusing to render pixmap with bounds completely clipped.");
                    err.outsideDocumentBoundsError = true;
                    throw err;
                }
            }
            
            scaleSettings = {
                width:  this._convertToPixels(component.width,  component.widthUnit, ppi),
                height: this._convertToPixels(component.height, component.heightUnit, ppi),
                scaleX: component.scaleX || component.scale,
                scaleY: component.scaleY || component.scale,
                // Backwards compatibility
                scale:  component.scale
            };
            // Visible: User provided + effects
            visibleBounds = exactBounds;
            // Padded: User provided + effects + padding through layer mask
            paddedBounds  = (maskBounds && this._masksAddPadding) ?
                                maskBounds.union(exactBounds) : exactBounds;
            
            pixmapSettings = this._generator.getPixmapParams(scaleSettings, staticBounds,
                    visibleBounds, paddedBounds, clipToBounds);
            
            resultDeferred.resolve(pixmapSettings);
        }.bind(this)).fail(resultDeferred.reject);
        
        return resultDeferred.promise;
    };

    /**
     * Synchronously get approximate bounds for the given component. These bounds
     * should only be used if pixmap is scaled by an integral multiple and if
     * there is no mask and there are no enabled layer effects.
     *
     * @private
     * @param {Component} component
     * @return {{inputRect: Bounds, outputRect: Bounds, expectedWidth: number,
     *      expectedHeight: number, getPadding: function (number, number): number }}
     */
    PixmapRenderer.prototype._getSettingsWithApproximateBounds = function (component) {
        var scalar = component.scale;
        if (!scalar) {
            scalar = 1;
        }

        var inputRect,
            paddedBounds,
            clipToBounds,
            layer = component.layer;
        
        if (layer) {
            inputRect = layer.bounds;
            paddedBounds = inputRect;
        } else { // layer comp
            inputRect = this._getContentBounds(component.document);
            paddedBounds = component.document.bounds;
        }

        var outputRect = inputRect.scale(scalar);
        if (outputRect.right <= outputRect.left || outputRect.bottom <= outputRect.top) {
            throw new Error("Refusing to render pixmap with zero bounds.");
        }
        
        if (this._clipAllImagesToDocumentBounds) {
            clipToBounds = this._document.bounds;
            var clippedBounds = inputRect.intersect(clipToBounds);
            if (clippedBounds.right <= clippedBounds.left || clippedBounds.bottom <= clippedBounds.top) {
                var err = new Error("Refusing to render pixmap with bounds completely clipped.");
                err.outsideDocumentBoundsError = true;
                throw err;
            }
        }

        var settings = {
            scaleX: scalar,
            scaleY: scalar
        };
        return this._generator.getPixmapParams(settings, inputRect, inputRect, paddedBounds, clipToBounds);
    };

    /**
     * Addjusts the extract parameters
     * 
     * @private
     * @param {Number} canvasWidth
     * @param {Number} canvasHeight
     * @param {Number} pixmapWidth
     * @param {Bounds} pixmapHeight
     * @param {x: number, y: number, width: number, height: number} convertSettings
     * @param {Number} canvasScale what to scale the canvas width and height by
     */
    
    PixmapRenderer.prototype._updateSettingsForCanvasSize = function (canvasWidth, canvasHeight,
                                                                       pixmapWidth, pixmapHeight,
                                                                       convertSettings, canvasScale) {
        var canvasScaledWidth = canvasWidth ? canvasWidth * canvasScale : 0,
            canvasScaledHeight = canvasHeight ? canvasHeight * canvasScale : 0,
            dx = canvasWidth ? canvasScaledWidth - pixmapWidth : 0,
            dy = canvasHeight ? canvasScaledHeight - pixmapHeight : 0,
            padding = convertSettings.padding || {top: 0, left: 0, right: 0, bottom: 0},
            extract = convertSettings.extract || {x:0, y:0, width: pixmapWidth, height: pixmapHeight};
        
        if (dx > 0) {
            padding.left += Math.floor(dx / 2);
            padding.right += Math.ceil(dx / 2);
        } else if (dx < 0) {
            extract.x -= Math.floor(dx / 2);
            extract.width = canvasScaledWidth;
        }
        
        if (dy > 0) {
            padding.top += Math.floor(dy / 2);
            padding.bottom += Math.ceil(dy / 2);
        } else if (dy < 0) {
            extract.y -= Math.floor(dy / 2);
            extract.height = canvasScaledHeight;
        }
        
        if ((padding.top || padding.left || padding.right || padding.bottom) ||
            (extract.width !== pixmapWidth || extract.height !== pixmapHeight)) {
            //shuffle padding out of the extract coordinates so they don't compete
            var clip, delta;
            if (padding.right) {
                clip = pixmapWidth - extract.width - extract.x;
                delta = Math.min(clip, padding.right);
                extract.width += delta;
                padding.right -= delta;
            }
            if (padding.bottom) {
                clip = pixmapHeight - extract.height - extract.y;
                delta = Math.min(clip, padding.bottom);
                extract.height += delta;
                padding.bottom -= delta;
            }
            if (padding.left) {
                delta = Math.min(extract.x, padding.left);
                extract.x -= delta;
                extract.width += delta;
                padding.left -= delta;
            }
            if (padding.top) {
                delta = Math.min(extract.y, padding.top);
                extract.y -= delta;
                extract.height += delta;
                padding.top -= delta;
            }
        }

        if (extract.width !== pixmapWidth || extract.height !== pixmapHeight) {
            convertSettings.extract = extract;
        } else {
            convertSettings.extract = null;
        }
        convertSettings.padding = padding;
    };
    

    /**
     * Ensure that that pixmap will be scaled uniformly by updating the input and 
     * output bounds to force Photoshop to perform a uniform transform. This is
     * necessary to ensure that any effects are correctly scaled.
     * 
     * @private
     * @param {{inputRect: object}, outputRect: object}} pixmapSettings
     */
    PixmapRenderer.prototype._ensureUniformTransform = function (pixmapSettings) {
        var inputRect = pixmapSettings.inputRect,
            outputRect = pixmapSettings.outputRect,
            inputHeight = inputRect.bottom - inputRect.top,
            inputWidth = inputRect.right - inputRect.left;

        if (inputHeight < inputWidth) {
            var outputWidth = outputRect.right - outputRect.left;

            pixmapSettings.inputRect = {
                top: inputRect.top,
                right: inputRect.right,
                bottom: inputRect.top + inputWidth,
                left: inputRect.left
            };

            pixmapSettings.outputRect = {
                top: outputRect.top,
                right: outputRect.right,
                bottom: outputRect.top + outputWidth,
                left: outputRect.left
            };
        } else {
            var outputHeight = outputRect.bottom - outputRect.top;

            pixmapSettings.inputRect = {
                top: inputRect.top,
                right: inputRect.left + inputHeight,
                bottom: inputRect.bottom,
                left: inputRect.left
            };

            pixmapSettings.outputRect = {
                top: outputRect.top,
                right: outputRect.left + outputHeight,
                bottom: outputRect.bottom,
                left: outputRect.left
            };
        }
    };
    
    /**
     * Get pixmap data for the given component.
     * 
     * @private
     * @param {!Component} component If neither component.layer nor component.comp is specified, this method gets the
     *      pixmap data for the whole document.
     * @param {Layer=} component.layer Layer to get the pixmap data for. Exclusive of component.comp.
     * @param {Object=} component.comp Layer comp to get the pixmap data for. Exclusive of component.layer.
     * @return {Promise.<{pixmap: Pixmap, settings: object}>} Resolves with the pixmap data and settings.
     */
    PixmapRenderer.prototype._getData = function (component) {
        // The exact bounds computation, which is expensive, is skipped if all of the
        // following conditions hold:
        // 1. The component is either not scaled, or is only scaled by an integral
        //    factor (i.e, 100%, 200%, etc.)
        // 2. The layer does not have an enabled mask
        // 3. The layer does not have any enabled layer effects
        // 4. The "include-ancestor-masks" config option is NOT set
        // 5. The layer has non-zero bounds. Sometimes they aren't computed and set to all 0's
        // 5. The layer is clipped, in which case layer.bounds id the clipped size and not the layer size
        var hasComplexTransform = (component.hasOwnProperty("scale") && component.scale % 1 !== 0) ||
                component.hasOwnProperty("width") || component.hasOwnProperty("height"),
            canvasDimensionsScale = 1,
            layer = component.layer,
            layerComp = component.comp,
            settingsPromise,
            resultPromise,
            isClipped = layer && layer.clipped,
            hasMask = layer && layer.getTotalMaskBounds(),
            includeAcestorMasks = layer && this._includeAncestorMasks,
            hasEffects = layer && layer.layerEffects && layer.layerEffects.isEnabled(),
            hasZeroBounds = layer && (!layer.bounds || (layer.bounds.top === 0 &&
                                                        layer.bounds.bottom === 0 &&
                                                        layer.bounds.left === 0 &&
                                                        layer.bounds.right === 0));
        
        //hasComplexTransform is the only part of this test that affects layerComp
        if (hasComplexTransform || hasMask || hasEffects || hasZeroBounds || isClipped || includeAcestorMasks) {
            //do the more expensive check
            settingsPromise = this._getSettingsWithExactBounds(component);
        } else {
            //we can get away with the faster check
            try {
                if (component.needsLayerBoundsUpdate) {
                    settingsPromise = component.layer.getExactBounds(true).then(function () {
                        delete component.needsLayerBoundsUpdate;
                        return Q.resolve(this._getSettingsWithApproximateBounds(component));
                    }.bind(this));
                } else {
                    // If not a layer, it's a layerComp or the whole document, and we want the doc bounds.
                    settingsPromise = Q.resolve(this._getSettingsWithApproximateBounds(component));
                }
            } catch (ex) {
                settingsPromise = Q.reject(ex);
            }
        }
        
        resultPromise = settingsPromise.then(function (pixmapSettings) {
            
            //build the getPixmap request with pixmapSettings
            
            var hasUniformTranform = component.hasOwnProperty("scale") ||
                (component.hasOwnProperty("width") && !component.hasOwnProperty("height")) ||
                (!component.hasOwnProperty("width") && component.hasOwnProperty("height"));

            // If we know the transform to be uniform before rounding errors, then
            // force the transform to appear uniform to Photoshop so that effects
            // are necessarily scaled.
            if (hasUniformTranform) {
                this._ensureUniformTransform(pixmapSettings);
            }
            
            
            if (this._useSmartScaling !== undefined) {
                pixmapSettings.useSmartScaling = this._useSmartScaling;
            }
            
            if (this._includeAncestorMasks !== undefined) {
                pixmapSettings.includeAncestorMasks = this._includeAncestorMasks;
            }

            if (this._convertColorSpace !== undefined) {
                pixmapSettings.convertToWorkingRGBProfile = this._convertColorSpace;
            }

            if (this._allowDither !== undefined) {
                pixmapSettings.allowDither = this._allowDither;
                if (this._allowDither) {
                    // force dithering, even if it is off in the user's color settings,
                    // since they explicitly enabled it in Generator
                    pixmapSettings.useColorSettingsDither = false;
                }
            }

            if (component.hasOwnProperty("interpolationType")) {
                pixmapSettings.interpolationType = component.interpolationType;
            } else if (this._interpolationType !== undefined) {
                pixmapSettings.interpolationType = this._interpolationType;
            }
            
            if (this._forceSmartPSDPixelScaling !== undefined) {
                pixmapSettings.forceSmartPSDPixelScaling = this._forceSmartPSDPixelScaling;
            }
            
            var fnHandlePixmap = function (pixmap) {
                var padding = pixmapSettings.hasOwnProperty("getPadding") ?
                        pixmapSettings.getPadding(pixmap.width, pixmap.height) : undefined,
                    extract =  pixmapSettings.hasOwnProperty("getExtractParamsForDocBounds") ?
                        pixmapSettings.getExtractParamsForDocBounds(pixmap.width, pixmap.height) : undefined,
                    quality = component.quality,
                    format = component.extension,
                    ppi = this._document.resolution,
                    settings = {
                        quality: quality,
                        format: format,
                        ppi: ppi,
                        padding: padding,
                        extract: extract
                    };
                
                this._updateSettingsForCanvasSize(component.canvasWidth, component.canvasHeight,
                                                  pixmap.width, pixmap.height,
                                                  settings, canvasDimensionsScale);
                
                if (this._usePngquant !== undefined) {
                    settings.usePngquant = this._usePngquant;
                }

                if (this._webpLossless !== undefined) {
                    settings.lossless = this._webpLossless;
                }

                return {
                    pixmap: pixmap,
                    settings: settings
                };
            }.bind(this);
            
            if (layer) {
                return this._generator.getPixmap(this._document.id, layer.id, pixmapSettings).then(fnHandlePixmap);
            } else /* if either a layerComp or the whole document */ {
                if (layerComp) {
                    pixmapSettings.compId = layerComp.id;
                }
                return this._generator.getDocumentPixmap(this._document.id, pixmapSettings).then(fnHandlePixmap);
            }
        }.bind(this));
        
        return resultPromise;
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
        return this._generator.savePixmap(data.pixmap,
                                          path,
                                          data.settings).thenResolve({ path: path });
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
