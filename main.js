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
        temp = require("temp"),
        Q = require("q"),
        convert = require("./lib/convert"),
        xpm2png = require("./lib/xpm2png");

    var DELAY_TO_WAIT_UNTIL_USER_DONE = 300;

    var _generator = null,
        _assetGenerationDir = null,
        _changeContextPerLayer = {},
        _photoshopState = {};

    function getUserHomeDirectory() {
        return process.env[(process.platform === "win32") ? "USERPROFILE" : "HOME"];
    }

    function savePixmap(pixmap, filename) {
        var fileCompleteDeferred = Q.defer();

        _generator.publish("assets.debug.dump", "dumping " + filename);

        var args = ["-", "-size", pixmap.width + "x" + pixmap.height, "png:-"];
        var proc = convert(args, _generator._photoshop._applicationPath);
        var fileStream = fs.createWriteStream(filename);
        var stderr = "";

        proc.stderr.on("data", function (chunk) { stderr += chunk; });
        proc.stdout.on("close", function () {
            fileCompleteDeferred.resolve(filename);
        });
        
        xpm2png(pixmap, proc.stdin.end.bind(proc.stdin));
        proc.stdout.pipe(fileStream);
        
        proc.stderr.on("close", function () {
            if (stderr) {
                var error = "error from ImageMagick: " + stderr;
                _generator.publish("assets.error.convert", error);
                fileCompleteDeferred.reject(error);
            }
        });
        
        return fileCompleteDeferred.promise;
    }

    function handleImageChanged(document) {
        if (document.id && document.layers) {
            cacheLayerInfo(document);
            document.layers.forEach(function (layer) {
                handleImageChangedForLayer(document, layer);
            });
        }
        // New document is coming by
        if (document.id && document.file && !_photoshopState[document.id]) {
            // Capture the filename, then ask for the layer data.
            _photoshopState[document.id] = { file: document.file };
            requestStateUpdate();
        }
    }

    function handleImageChangedForLayer(document, layer) {
        if (!_assetGenerationDir) {
            return;
        }

        var contextID = document.id + "-" + layer.id;
        
        if (!_changeContextPerLayer[contextID]) {
            // Initialize the context object for this layer.
            // It will be deleted again once an update has finished
            // without the image changing during the update.
            _changeContextPerLayer[contextID] = {
                // Store the context ID here so the context can be deleted by finishLayerUpdate
                id:                 contextID,
                document:           document,
                layer:              layer,
                updateIsScheduled:  false,
                updateIsObsolete:   false,
                updateDelayTimeout: null
            };
        }

        scheduleLayerUpdate(_changeContextPerLayer[contextID]);
    }
    
    // Run the update now if none is in progress, or wait until the current one is finished
    function scheduleLayerUpdate(changeContext) {
        // If no update is scheduled or the scheduled update is still being delayed, start from scratch
        if (!changeContext.updateIsScheduled || changeContext.updateDelayTimeout) {
            changeContext.updateIsScheduled = true;
            clearTimeout(changeContext.updateDelayTimeout);

            changeContext.updateDelayTimeout = setTimeout(function () {
                changeContext.updateDelayTimeout = null;
                startLayerUpdate(changeContext).fin(function () {
                    finishLayerUpdate(changeContext);
                });
            }, DELAY_TO_WAIT_UNTIL_USER_DONE);
        }
        // Otherwise, mark the scheduled update as obsolete so we can start over when it's done
        else if (!changeContext.updateIsObsolete) {
            changeContext.updateIsObsolete = true;
        }
    }

    // Start a new update
    function startLayerUpdate(changeContext) {
        var layerUpdatedDeferred = Q.defer();

        var layer    = changeContext.layer,
            fileName = changeContext.document.id + "-" + changeContext.layer.id + ".png",
            path     = resolve(_assetGenerationDir, fileName);

        function deleteLayerImage() {
            // Delete the image for the empty layer
            fs.unlink(path, function (err) {
                if (err) {
                    layerUpdatedDeferred.reject(err);
                } else {
                    layerUpdatedDeferred.resolve();
                }
            });
        }

        function createLayerImage() {
            _generator.getPixmap(changeContext.layer.id, 100).then(
                function (pixmap) {
                    var fileName = changeContext.document.id + "-" + changeContext.layer.id + ".png",
                        path     = resolve(_assetGenerationDir, fileName);

                    // Prevent an error after deleting a layer's contents, resulting in a 0x0 pixmap
                    if (pixmap.width === 0 || pixmap.height === 0) {
                        deleteLayerImage();
                    }
                    else {
                        var tmpPath = temp.path({ suffix: ".png" });

                        // Save the image in a temporary file
                        savePixmap(pixmap, tmpPath)
                            .fail(function (err) {
                                layerUpdatedDeferred.reject(err);
                            })
                            // When ImageMagick is done
                            .done(function () {
                                // ...move the temporary file to the desired location
                                fs.rename(tmpPath, path, function (err) {
                                    if (err) {
                                        layerUpdatedDeferred.reject(err);
                                    } else {
                                        layerUpdatedDeferred.resolve();
                                    }
                                });
                            });
                    }
                },
                function (err) {
                    _generator.publish("assets.error.getPixmap", "Error: " + err);
                    layerUpdatedDeferred.reject(err);
                }
            );
        }

        if (layer.added) {
            // Nothing to do since the layer is empty
            layerUpdatedDeferred.resolve();
        }
        else if (layer.removed) {
            // Delete the image if the layer was removed
            deleteLayerImage();
        }
        else if (layer.pixels) {
            // Update the layer image since its pixels were changed
            createLayerImage();
        }
        else {
            console.warn("Unknown type of layer change", layer);
            layerUpdatedDeferred.reject();
        }

        return layerUpdatedDeferred.promise;
    }

    // Run a pending update if necessary
    function finishLayerUpdate(changeContext) {
        changeContext.updateIsScheduled = false;
        // If the update is obsolete, schedule another one right after
        // This update will still be delayed to give Photoshop some time to catch its breath
        if (changeContext.updateIsObsolete) {
            changeContext.updateIsObsolete = false;
            scheduleLayerUpdate(changeContext);
        }
        // This is the final update for now: clean up
        else {
            delete _changeContextPerLayer[changeContext.id];
        }
    }
    
    function layerNameToCSS(layerName) {
        var kMaxLayerNameLength = 50;   // Was "const" in ExtendScript
    
        // If there's a file type suffix, don't mangle that.
        var suffix = "",
            suffixPos = layerName.search(/[.](\w{3,4})$/);
        if (suffixPos >= 0) {
            suffix = layerName.slice(suffixPos);
            layerName = layerName.slice(0, suffixPos);
        }
    
        // Remove any user-supplied class/ID delimiter
        if ((layerName[0] === ".") || (layerName[0] === "#")) {
            layerName = layerName.slice(1);
        }
        
        // Remove any other creepy punctuation.
        var badStuff = /[“”";!.?,'`@’#'$%^&*)(+=|}{><\x2F\s-]/g;
        layerName = layerName.replace(badStuff, "_");
    
        // Text layer names may be arbitrarily long; keep it real
        if (layerName.length > kMaxLayerNameLength) {
            layerName = layerName.slice(0, kMaxLayerNameLength - 3);
        }
    
        // Layers can't start with digits, force an _ in front in that case.
        if (layerName.match(/^[\d].*/)) {
            layerName = "_" + layerName;
        }
        
        layerName += suffix;
    
        return layerName;
    }

    function requestStateUpdate() {
        _generator.getDocumentInfo().then(
            function () {
                _generator.publish("generator.info.psState", "Requested PS State");
            },
            function (err) {
                _generator.publish("generator.info.psState", "error requestiong state: " + err);
            });
    }

    function cacheLayerInfo(document) {
        var docID = document.id;
        if (! _photoshopState[docID]) {
            _photoshopState[docID] = document;
            console.log("Updating layers for an unknown document #" + docID + "?");
        }
        else if (document.layers) {
            document.layers.forEach(function (layerInfo) {
                if (_photoshopState[docID].layerMap[layerInfo.id]) {
                    Object.keys(layerInfo).forEach(function (layerItem) {
                        _photoshopState[docID].layerMap[layerInfo.id][layerItem] = layerInfo[layerItem];
                    });
                } else {
                    // New layer
                    _photoshopState[docID].layers.push(layerInfo);
                    _photoshopState[docID].layerMap[layerInfo.id] = layerInfo;
                }
                // Need to also handle deleting a layer, but that currently crashes PS
            });
        }
    }

    // Build a map for the layers so we don't have to search the list.
    function updateLayerDict(docID) {
        var doc = _photoshopState[docID];
        var layerMap = {};
        if (doc.layers) {
            doc.layers.forEach(function (layer) {
                layerMap[layer.id] = layer;
            });
            doc.layerMap = layerMap;
        }
    }

    // Called when the entire layer state is sent in response to requestStateUpdate()
    function handlePsInfoMessage(message) {
        if (message.body.hasOwnProperty("id")) {
            var docID = message.body.id;
            var saveFilename = null;
            _generator.publish("generator.info.psState", "Receiving PS state info");

            // First, preserve the filename if we already have it.
            if (_photoshopState[docID] && _photoshopState[docID].file) {
                saveFilename = _photoshopState[docID].file;
            }

            _photoshopState[docID] = message.body;
            updateLayerDict(docID);

            if (saveFilename) {
                _photoshopState[docID].file = saveFilename;
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
                    _assetGenerationDir = newDir;
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
