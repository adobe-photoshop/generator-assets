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

    var util = require("util");
    
    var MENU_ID = "css-document-menu-string";
    var MENU_LABEL = "Copy Layer CSS to Clipboard";
    
    function interpolateValue(beginValue, endValue, fraction) {
        return fraction * (endValue - beginValue) + beginValue;
    }

    function radians(degrees) {
        return degrees * Math.PI / 180;
    }

    function degrees(radians) {
        return radians / Math.PI * 180;
    }
    
    function getPSGradientLength(width, height, angle) {
        while (angle < 0) {
            angle += 360;
        }

        angle %= 360;

        var hl = Math.abs(height / 2 / Math.cos(radians(angle)));
        var hw = Math.abs(width / 2 / Math.sin(radians(angle)));

        if (hw < hl) {
            return hw;
        }

        return hl;
    }

    function SONToCSS(generator, config, logger, documentManager) {
        this._generator = generator;
        this._config = config;
        this._logger = logger;
        this._documentManager = documentManager;
        this.classnames = [];

        this._currentDocument = null;
        this._currentSelectionListener = null;

        var self = this;

        function onMenuClick(event) {
            var menu = event.generatorMenuChanged;
            if (!menu) {
                return;
            }

            if (menu.name === MENU_ID) {
                self.convert({});
            }
        }

        function onActiveDocumentChange(docID) {
            // Disable listener for prior document
            if (self._currentDocument) {
                self._currentDocument.removeListener("selection", self._currentSelectionListener);
                self._currentDocument = null;
                self._currentSelectionListener = null;
            }

            if (!docID) { // no current document, so disable menu
                self._generator.toggleMenu(MENU_ID, false, false);
            } else {
                self._documentManager.getDocument(docID)
                .then(function (doc) {
                    self._currentDocument = doc;

                    self._currentSelectionListener = function () {
                        var enabled = Object.keys(doc.selection).length > 0;
                        self._generator.toggleMenu(MENU_ID, enabled, false);
                    };

                    doc.on("selection", self._currentSelectionListener);

                    // Update menu by pretending to fire a selection event
                    self._currentSelectionListener();

                });
            }
        }

        // for export to CSS
        self._generator.addMenuItem(MENU_ID, MENU_LABEL, true, false);
        self._generator.onPhotoshopEvent("generatorMenuChanged", onMenuClick);
        self._documentManager.on("activeDocumentChanged", onActiveDocumentChange);

    }

    SONToCSS.prototype.getLength = function (unit) {
        if (unit !== undefined) {
            return unit + "px";
        }
    };

    SONToCSS.prototype.getLengthFunction = function (name) {
        return (function () {
            return function (layer) {
                if (layer[name] !== undefined) {
                    return layer[name] + "px";
                }
            };
        })();
    };
    
    SONToCSS.prototype.getColor = function (c, alpha, rgbonly, width, height) {
        if (c === undefined) {
            return undefined;
        }
        if (alpha === undefined) {
            alpha = 1;
        }
            
        if (c.type === "rgb") {
            if (alpha < 1) {
                return "rgba(" + Math.round(c.red * 255) + ", " +
                    Math.round(c.green * 255) + ", " +
                    Math.round(c.blue * 255) + ", " +
                    alpha + ")";
            } else {
                return "rgb(" + Math.round(c.red * 255) + ", " +
                    Math.round(c.green * 255) + ", " +
                    Math.round(c.blue * 255) + ")";
            }
        } else if (rgbonly) {
            // throw?
            return undefined;
        } else if (c.type === "angle-gradient") {
            var grad = "";
            switch (c.gradientType) {
                case "linear":
                    grad = "linear-gradient(";
                    //if (c.angle)
                    grad += c.angle + "deg, ";
                    break;
                case "radial":
                    grad = "radial-gradient(circle, ";
                    break;
                default:
                    // ?? throw or create image ?
            }
            
            // solve midpoints first
            // TODO!
            
            var colors = c.colorstops.map(function (stop) {
                return {r: stop.color.red, g: stop.color.green, b: stop.color.blue, p: stop.position};
            });
            var alphastops = c.alphastops.map(function (stop) {
                return {alpha: stop.alpha * alpha, position: stop.position};
            });
            
            var color;
            // add alpha stop with right colors
            alphastops.forEach(function (stop) {
                for (var x = 0; x < colors.length; x++) {
                    if (colors[x].p === stop.position) {
                        colors[x].a = stop.alpha;
                        break;
                    } else if (colors[x].p > stop.position) {
                        color = { p: stop.position, a: stop.alpha};
                        if (x === 0) {
                            color.r = colors[x].r;
                            color.g = colors[x].g;
                            color.b = colors[x].b;
                        } else {
                            var fraction = (color.p - colors[x - 1].p) / (colors[x].p - colors[x - 1].p);
                            color.r = interpolateValue(colors[x - 1].r, colors[x].r, fraction);
                            color.g = interpolateValue(colors[x - 1].g, colors[x].g, fraction);
                            color.b = interpolateValue(colors[x - 1].b, colors[x].b, fraction);
                        }
                        colors.splice(x, 0, color);
                        break;
                    }
                }
                
                if (x === colors.length) {
                    color = { p: stop.position, a: stop.alpha};
                    color.r = colors[x - 1].r;
                    color.g = colors[x - 1].g;
                    color.b = colors[x - 1].b;
                    colors.push(color);
                }
            });
            
            // calculate missing alpha
            for (var x = 0; x < colors.length; x++) {
                if (colors[x].a === undefined) {
                    if (x === 0) {
                        colors[x].a = colors[x + 1].a;
                    } else if (x === colors.length - 1) {
                        colors[x].a = colors[x - 1].a;
                    } else {
                        for (var y = x + 1 ; y < colors.length; y++) {
                            if (colors[y].a !== undefined) {
                                break;
                            }
                        }
                        var fraction = (colors[x].p - colors[x - 1].p) / (colors[y].p - colors[x - 1].p);
                        colors[x].a = interpolateValue(colors[x - 1].a, colors[y].a, fraction);
                    }
                }
            }

            var multiplier;
            var length;
            var pslength;
            
            if (c.gradientType === "linear") {
                // adjust stop position for %#$#^#$^# CSS positioning
                pslength = getPSGradientLength(width, height, c.angle);
                
                var hyp = Math.sqrt(width * width / 4 + height * height / 4);
                var baseangle = degrees(Math.asin(width / 2 / hyp));
                var angle = c.angle;
    
                // normalize angle
                while (angle < 0) {
                    angle += 360;
                }
                angle %= 360;
    
                var reducedAngle = angle % 180;
                if (reducedAngle > 90) {
                    reducedAngle = 180 - reducedAngle;
                }
                if (reducedAngle <= baseangle) {
                    length = hyp * Math.cos(radians(baseangle - reducedAngle));
                } else {
                    length = hyp * Math.cos(radians(reducedAngle - baseangle));
                }
                    
                var offset = (length - pslength) / length / 2;
                multiplier = pslength / length;
                
                colors.forEach(function (stop) {
                    stop.p = offset + stop.p * multiplier;
                });
            } else if (c.gradientType === "radial") {
                length = Math.sqrt(width * width + height * height) / 2;
                pslength = getPSGradientLength(width, height, c.angle);
                
                multiplier = pslength / length;
                
                colors.forEach(function (stop) {
                    stop.p = stop.p * multiplier;
                });
            }
            
            colors.forEach(function (stop) {
                if (stop.a === 1) {
                    grad += "rgb(" + Math.round(stop.r * 255) + ", " +
                            Math.round(stop.g * 255) + ", " +
                            Math.round(stop.b * 255) + ") " + Math.round(stop.p * 100) + "%, ";
                } else {
                    grad += "rgba(" + Math.round(stop.r * 255) + ", " +
                            Math.round(stop.g * 255) + ", " +
                            Math.round(stop.b * 255) + ", " +
                            stop.a + ") " + Math.round(stop.p * 100) + "%, ";
                }
            });
            
            grad = grad.slice(0, -2) + ")";
            
            return grad;
        }
    };
    
    SONToCSS.prototype.getBlendMode = function (layer) {
        switch (layer.blendMode) {
            case "pass-Through":
            case "normal":
            case "multiply":
            case "screen":
            case "overlay":
            case "darken":
            case "lighten":
            case "color-dodge":
            case "color-burn":
            case "hard-light":
            case "soft-light":
            case "difference":
            case "exclusion":
            case "hue":
            case "saturation":
            case "color":
            case "luminosity":
                return layer.blendMode;
            default:
                // throw?
        }
        
        return undefined;
    };
    
    SONToCSS.prototype.toCSS = function (SON) {
        var self = this;
        var css = {};
        
        var commonFetchers = {
            "required": {
                "top" : this.getLengthFunction ("top"),
                "left" : this.getLengthFunction ("left"),
                "width" : this.getLengthFunction ("width"),
                "height" : this.getLengthFunction ("height"),
                "position": function () { return "absolute"; }
            },
            "optional": {
                "opacity": function (layer) { return layer.opacity; },
                "mix-blend-mode": this.getBlendMode
            }
        };
        
        var specificFetchers = {
            "shape-layer" : {
                required: {},
                optional: {
                    "background": function (layer) {
                        return self.getColor(layer.color, layer.fillOpacity, false, layer.width, layer.height);
                    },
                    "border-radius": function (layer) {
                        if (layer.topLeftRadius === undefined) {
                            return undefined;
                        }
                        
                        var retval = self.getLength(layer.topLeftRadius);
                        if ((layer.topRightRadius === undefined) &&
                            (layer.bottomLeftRadius === undefined) &&
                            (layer.bottomRightRadius === undefined)) {
                            return retval;
                        }
                        
                        if (layer.topRightRadius === undefined) {
                            retval += " " + self.getLength(layer.topLeftRadius);
                        } else {
                            retval += " " + self.getLength(layer.topRightRadius);
                        }
                            
                        if (layer.bottomRightRadius === undefined) {
                            retval += " " + self.getLength(layer.topLeftRadius);
                        } else {
                            retval += " " + self.getLength(layer.bottomRightRadius);
                        }
                        
                        if (layer.bottomLeftRadius === undefined) {
                            retval += " " + self.getLength(layer.topLeftRadius);
                        } else {
                            retval += " " + self.getLength(layer.bottomLeftRadius);
                        }
                            
                        return retval;
                    },
                    "effects": function (layer) {
                        if (layer.layerEffects === undefined) {
                            return undefined;
                        }
                        
                        var retval = {};
                        var s;

                        layer.layerEffects.forEach(function (effect) {
                            if (effect.type === "inner-shadow") {
                                s  = "inset ";
                                s += self.getLength(-Math.cos(Math.PI * effect.angle / 180) * effect.distance);
                                s += " " + self.getLength(Math.sin(Math.PI * effect.angle / 180) * effect.distance);
                                s += " " + self.getLength(effect.blur);
                                s += " " + self.getLength(effect.spread);
                                s += " " + self.getColor(effect.color, effect.opacity, true);
                                if (retval["box-shadow"] !== undefined) {
                                    retval["box-shadow"] += ", " + s;
                                } else {
                                    retval["box-shadow"] = s;
                                }
                            } else if (effect.type === "drop-shadow") {
                                s  = self.getLength(-Math.cos(Math.PI * effect.angle / 180) * effect.distance);
                                s += " " + self.getLength(Math.sin(Math.PI * effect.angle / 180) * effect.distance);
                                s += " " + self.getLength(effect.blur);
                                s += " " + self.getLength(effect.spread);
                                s += " " + self.getColor(effect.color, effect.opacity, true);
                                if (retval["box-shadow"] !== undefined) {
                                    retval["box-shadow"] += ", " + s;
                                } else {
                                    retval["box-shadow"] = s;
                                }
                            }
                        });
                        
                        return retval;
                    },
                    "border": function (layer) {
                        if (layer.stroke === undefined) {
                            return undefined;
                        }
                            
                        var s = layer.stroke;
                        if (s.dashes && s.dashes.length) {
                            return undefined; // TODO
                        }
                            
                        if (s.lineJoin !== "miter") {
                            return undefined; // TODO
                        }
                            
                        var retval = {};
                        
                        retval["border-style"] = "solid";
                        retval["border-width"] = self.getLength(s.lineWidth);
                        retval["border-color"] = self.getColor(s.color, s.alpha, true);
                        
                        return retval;
                    }
                }
            },
            "text-layer" : {
                required: {},
                optional: {
                    "margin" : function () { return "0"; },
                    "effects": function (layer) {
                        if (layer.layerEffects === undefined) {
                            return undefined;
                        }
                        
                        var retval = {};
                        layer.layerEffects.forEach(function (effect) {
                            if (effect.type === "drop-shadow") {
                                var s  = self.getLength(-Math.cos(Math.PI * effect.angle / 180) * effect.distance);
                                s += " " + self.getLength(Math.sin(Math.PI * effect.angle / 180) * effect.distance);
                                s += " " + self.getLength(effect.blur);
                                
                                s += " " + self.getColor(effect.color, effect.opacity, true);
                                retval["text-shadow"] = s;
                            }
                        });
                        
                        return retval;
                    }
                },
                nthchild: {
                    "color": function (layer) {
                        if (layer["font-color"] === undefined) {
                            return undefined;
                        }
                        return layer["font-color"].map(function (color) {
                            return self.getColor(color, layer.fillOpacity, true);
                        });
                    },
                    "font-family": function (layer) {
                        if (layer["font-family"] === undefined) {
                            return undefined;
                        }
                        return layer["font-family"];
                    },
                    "font-size": function (layer) {
                        if (layer["font-size"] === undefined) {
                            return undefined;
                        }
                        return layer["font-size"].map(function (font) {
                            return font + "pt";
                        });
                    },
                    "font-style": function (layer) {
                        if (layer["font-style"] === undefined) {
                            return undefined;
                        }
                        return layer["font-style"];
                    },
                    "font-weight": function (layer) {
                        if (layer["font-weight"] === undefined) {
                            return undefined;
                        }
                        return layer["font-weight"];
                    },
                    "text-align": function (layer) {
                        if (layer["font-align"] === undefined) {
                            return undefined;
                        }
                        return layer["font-align"];
                    }
                }
            },
            "group-layer" : {
                required: {},
                optional: {}
            }
        };
        
        function unroll(result, property, input) {
            if (typeof input === "string") {
                result[property] = input;
            } else {
                for (var x in input) {
                    if (input.hasOwnProperty(x)) {
                        result[x] = input[x];
                    }
                }
            }
        }
        
        function parseLayer(layer) {
            var retval = {};
            css[layer.name] = retval;
            for (var property in commonFetchers.required) {
                if (commonFetchers.required.hasOwnProperty(property)) {
                    unroll(retval, property, commonFetchers.required[property](layer));
                }
            }
            
            var value;
            for (property in commonFetchers.optional) {
                if (commonFetchers.optional.hasOwnProperty(property)) {
                    value = commonFetchers.optional[property](layer);
                    if (value !== undefined) {
                        unroll(retval, property, value);
                    }
                }
            }
            
            var specificFetcher = specificFetchers[layer.type];
            var f;

            if (specificFetcher !== undefined) {
                for (property in specificFetcher.required) {
                    if (specificFetcher.required.hasOwnProperty(property)) {
                        f = specificFetcher.required[property];
                        unroll(retval, property, (typeof f === "string")? layer[f] : f(layer));
                    }
                }
            
                for (property in specificFetcher.optional) {
                    if (specificFetcher.optional.hasOwnProperty(property)) {
                        f = specificFetcher.optional[property];
                        value = (typeof f === "string")? layer[f] : f(layer);
                        if (value !== undefined) {
                            unroll(retval, property, value);
                        }
                    }
                }
                
                if (specificFetcher.nthchild !== undefined) {
                    for (property in specificFetcher.nthchild) {
                        if (specificFetcher.nthchild.hasOwnProperty(property)) {
                            var array = specificFetcher.nthchild[property](layer);
                            if (array !== undefined) {
                                for (var x = 0; x < array.length; x++) {
                                    var spanname = layer.name + " span:nth-child(" + (x + 1) + ")";
                                    if (css[spanname] === undefined) {
                                        css[spanname] = {};
                                    }
                                    css[spanname][property] = array[x];
                                }
                            }
                        }
                    }
                }
            }
            
            if (layer.type === "group-layer") {
                layer.layers.forEach(parseLayer);
            }

        }
        
        SON.forEach(parseLayer);

        return css;
    };

    SONToCSS.prototype.toCSSText = function (son) {
        var _formatContext = {
            indent: "  ", /* Default to 2 spaces*/
            terminator: "\n",
            encoding: "utf8",
            generateSelectors: true
        };
        
        function Line(ctx) {
            var _c = ctx;
            var _l = [];
            var _indent = 0;
            /*jshint validthis:true */
            
            function _toBuffer() {
                return new Buffer(_l.join(""), _c.encoding);
            }
            
            // New line begins; generate indents
            this.begin = function () {
                _l = [];
                for (var i = 0; i < _indent; i++) {
                    _l.push(_c.indent);
                }
            };
            
            // Opening line begins: lines after this one must be indented
            this.open = function () {
                this.begin();
                _indent++;
            };
            
            // Closing line begins; remove an indent firt
            this.close = function () {
                _indent--;
                this.begin();
            };
            
            this.write = function () {
                var args = Array.prototype.slice.call(arguments);
                _l.push(util.format.apply(null, args));
            };
            
            // Line ends; return buffer, reset our line buffer
            this.end = function () {
                _l.push(_c.terminator);
                var ret = _toBuffer();
                _l = [];
                return ret;
            };

            // Line ends with an extra terminator
            this.endln = function () {
                _l.push(_c.terminator);
                return this.end();
            };

            this.crlf = function () {
                return this.end();
            };
        }

        var _lines = [];
        var line = new Line(_formatContext);
        
        var format = function (s) {
            line.begin();
            line.write(s);
            return line.end();
        };
        
        for (var rule in son) {
            if (son.hasOwnProperty(rule)) {
                _lines.push(format("." + rule + " {"));
                line.open();
                for (var cssrule in son[rule]) {
                    if (son[rule].hasOwnProperty(cssrule)) {
                        _lines.push(format(cssrule + ": " + son[rule][cssrule] + ";"));
                    }
                }
                line.close();
                _lines.push(format("}"));
            }
        }
        
        return Buffer.concat(_lines).toString(_formatContext.encoding);
    };

    SONToCSS.prototype.convert = function () {
        var self = this,
            docID = self._documentManager.getActiveDocumentID();

        if (docID) {
            self._generator._getStyleInfo(docID, { selectedLayers: true }).then(
                function (son) {
                    var cssom = self.toCSS(son.layers);
                    var css = self.toCSSText(cssom);
                    self._generator.copyToClipboard(css);
                }).done();
        }
    };
 
    module.exports = SONToCSS;
}());
