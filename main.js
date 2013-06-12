/*
 * Copyright (c) 2013 Adobe Systems Incorporated. All rights reserved.
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
        resolve = require("path").resolve,
        mkdirp = require("mkdirp"),
        convert = require("./lib/convert"),
        xpm2png = require("./lib/xpm2png");

    var assetGenerationDir = null;

    function getUserHomeDirectory() {
        return process.env[(process.platform === "win32") ? "USERPROFILE" : "HOME"];
    }

    var _generator = null,
        _photoshopState = null;

    function requestStateUpdate() {
        _generator.getDocumentInfo().then(
            function () {
                _generator.publish("generator.info.psState", "Requested PS State");
            },
            function (err) {
                _generator.publish("generator.info.psState", "error requestiong state: " + err);
            });
    }        

    function savePixmap(pixmap, filename) {
        _generator.publish("assets.dump", filename);

        var args = ["-", "-size", pixmap.width + "x" + pixmap.height, "png:-"];
        var proc = convert(args, _generator._photoshop._applicationPath);
        var fileStream = fs.createWriteStream(filename);
        var stderr = "";

        proc.stderr.on("data", function (chunk) { stderr += chunk; });
        
        xpm2png(pixmap, proc.stdin.end.bind(proc.stdin));
        proc.stdout.pipe(fileStream);
        
        proc.stderr.on("close", function () {
            if (stderr) {
                _generator.publish("assets.error", "error from ImageMagick: " + stderr);
            }
        });
    }

    function handleImageChanged(message) {
        if (message.documentID && message.layerEvents) {
            message.layerEvents.forEach(function (e) {
//                var layerInfo = _generator._layerState[e.layerID];
                if (false) {
//                    var params = {layerID:e.layerID,
//                                  path:resolve( assetGenerationDir, layerInfo.layerChangedName ) };
//                    _generator.evaluateJSXFile("./jsx/layerSVG.jsx", params);
                }
                else {
                    _generator.getPixmap(e.layerID, 100).then(
                        function (pixmap) {
                            if (assetGenerationDir) {
                                savePixmap(
                                    pixmap,
                                    resolve(assetGenerationDir, message.documentID + "-" + e.layerID + ".png")
                                );
                            }
                        }, function (err) {
                            _generator.publish("assets.getPixmap", "Error: " + err);
                        });
                }
            });
        }
    }
    
    function handlePsInfoMessage(message) {
        if (message.body.hasOwnProperty("version")) {
            _generator.publish("generator.info.psState", "Receiving PS state info");
            _photoshopState = message.body;
            // Add quick reference for layers
            if (_photoshopState.layers) {
                console.log("---layerstate---");
                _photoshopState.layers.forEach(function (layerInfo) {
                                                            //self._layerState[layerInfo.layerID] = layerInfo;
                                                            console.log("Layer [" + layerInfo.id + "]: " + layerInfo.name);
                                                        });
            }
        }
    }
    
    function init(generator) {
        _generator = generator;
        _generator.subscribe("photoshop.event.imageChanged", handleImageChanged);
        _generator.subscribe("photoshop.message", handlePsInfoMessage);
        requestStateUpdate();

        // create a place to save assets
        var homeDir = getUserHomeDirectory();
        if (homeDir) {
            var newDir = resolve(homeDir, "Desktop", "generator-assets");
            mkdirp(newDir, function (err) {
                if (err) {
                    _generator.publish(
                        "assets.error",
                        "Could not create directory '" + newDir + "', no assets will be dumped"
                    );
                } else {
                    assetGenerationDir = newDir;
                }
            });
        } else {
            _generator.publish("assets.error", "Could not locate home directory in env vars, no assets will be dumped");
        }
    }

    exports.init = init;

}());