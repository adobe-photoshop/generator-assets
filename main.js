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
        _photoshopState = {};

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
        _generator.publish("assets.debug.dump", "dumping " + filename);

        var args = ["-", "-size", pixmap.width + "x" + pixmap.height, "png:-"];
        var proc = convert(args, _generator._photoshop._applicationPath);
        var fileStream = fs.createWriteStream(filename);
        var stderr = "";

        proc.stderr.on("data", function (chunk) { stderr += chunk; });
        
        xpm2png(pixmap, proc.stdin.end.bind(proc.stdin));
        proc.stdout.pipe(fileStream);
        
        proc.stderr.on("close", function () {
            if (stderr) {
                _generator.publish("assets.error.convert", "error from ImageMagick: " + stderr);
            }
        });
    }

    function handleImageChanged(document) {
        if (document.id && document.layers) {
            document.layers.forEach(function (layer) {
                _generator.getPixmap(layer.id, 100).then(
                    function (pixmap) {
                        if (assetGenerationDir) {
                            savePixmap(
                                pixmap,
                                resolve(assetGenerationDir, document.id + "-" + layer.id + ".png")
                            );
                        }
                    }, function (err) {
                        _generator.publish("assets.error.getPixmap", "Error: " + err);
                    });
            });
        }
    }
    
    function updateLayerDict(docID) {
        var doc = _photoshopState[docID];
        var layerDict = {};
        if (doc.layers) {
            doc.layers.forEach(function (layer) {
                layerDict[layer.id] = layer;
            });
            doc.layerDict = layerDict;
        }
    }
    
    // http://www.slideshare.net/async_io/javascript-promisesq-library-17206726
    // https://github.com/kriskowal/q/wiki/API-Reference
    
    function handlePsInfoMessage(message) {
        if (message.body.hasOwnProperty("id")) {
            _generator.publish("generator.info.psState", "Receiving PS state info");
            var docID = message.body.id;
            // This should really key off the type of the message!
            if (! _photoshopState[docID]) {
                _photoshopState[docID] = message.body;
                updateLayerDict(docID);
            }
            else if (message.body.layers) {
                message.body.layers.forEach(function (layerInfo) {
                    Object.keys(layerInfo).forEach(function (layerItem) {
                        _photoshopState[docID].layerDict[layerInfo.id][layerItem] = layerInfo[layerItem];
                    });
                });

                console.log("---layerstate for doc:" + docID + "---");
                _photoshopState[docID].layers.forEach(function (layerInfo) {
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
                        "assets.error.init",
                        "Could not create directory '" + newDir + "', no assets will be dumped"
                    );
                } else {
                    assetGenerationDir = newDir;
                }
            });
        } else {
            _generator.publish(
                "assets.error.init",
                "Could not locate home directory in env vars, no assets will be dumped"
            );
        }
    }

    exports.init = init;

}());
