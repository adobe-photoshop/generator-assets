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
        tmp = require("tmp"),
        Q = require("q"),
        convert = require("./lib/convert"),
        xpm2png = require("./lib/xpm2png");

    var DELAY_TO_WAIT_UNTIL_USER_DONE = 300;

    var _generator = null,
        _photoshopPath = null,
        _assetGenerationDir = null,
        _contextPerLayer = {},
        _photoshopState = {};

    function getUserHomeDirectory() {
        return process.env[(process.platform === "win32") ? "USERPROFILE" : "HOME"];
    }

    function savePixmap(pixmap, filename) {
        var fileCompleteDeferred = Q.defer();

        _generator.publish("assets.debug.dump", "dumping " + filename);

        var args = ["-", "-size", pixmap.width + "x" + pixmap.height, "png:-"];
        var proc = convert(args, _photoshopPath);
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
        
        if (!_contextPerLayer[contextID]) {
            // Initialize the context object for this layer.
            // It will be deleted again once an update has finished
            // without the image changing during the update.
            _contextPerLayer[contextID] = {
                // Store the context ID here so the context can be deleted by finishLayerUpdate
                contextID:          contextID,
                documentID:         document.id,
                layerID:            layer.id,
                updateIsScheduled:  false,
                updateIsObsolete:   false,
                updateDelayTimeout: null
            };
        }

        scheduleLayerUpdate(_contextPerLayer[contextID]);
    }

    // Run the update now if none is in progress, or wait until the current one is finished
    function scheduleLayerUpdate(layerContext) {
        // If no update is scheduled or the scheduled update is still being delayed, start from scratch
        if (!layerContext.updateIsScheduled || layerContext.updateDelayTimeout) {
            layerContext.updateIsScheduled = true;
            clearTimeout(layerContext.updateDelayTimeout);

            layerContext.updateDelayTimeout = setTimeout(function () {
                layerContext.updateDelayTimeout = null;
                startLayerUpdate(layerContext).fin(function () {
                    finishLayerUpdate(layerContext);
                });
            }, DELAY_TO_WAIT_UNTIL_USER_DONE);
        }
        // Otherwise, mark the scheduled update as obsolete so we can start over when it's done
        else if (!layerContext.updateIsObsolete) {
            layerContext.updateIsObsolete = true;
        }
    }

    // Start a new update
    function startLayerUpdate(layerContext) {
        var layerUpdatedDeferred = Q.defer();
        
        _generator.getPixmap(layerContext.layerID, 100).then(
            function (pixmap) {
                var fileName = layerContext.documentID + "-" + layerContext.layerID + ".png",
                    path     = resolve(_assetGenerationDir, fileName);

                // Prevent an error after deleting a layer's contents, resulting in a 0x0 pixmap
                if (pixmap.width === 0 || pixmap.height === 0) {
                    // Delete the image for the empty layer
                    fs.unlink(path, function (err) {
                        if (err) {
                            layerUpdatedDeferred.reject(err);
                        } else {
                            layerUpdatedDeferred.resolve();
                        }
                    });
                }
                else {
                    tmp.tmpName(function (err, tmpPath) {
                        if (err) {
                            layerUpdatedDeferred.reject(err);
                            return;
                        }
                        
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
                    });
                }
            },
            function (err) {
                _generator.publish("assets.error.getPixmap", "Error: " + err);
                layerUpdatedDeferred.reject(err);
            }
        );

        return layerUpdatedDeferred.promise;
    }

    // Run a pending update if necessary
    function finishLayerUpdate(layerContext) {
        layerContext.updateIsScheduled = false;
        // If the update is obsolete, schedule another one right after
        // This update will still be delayed to give Photoshop some time to catch its breath
        if (layerContext.updateIsObsolete) {
            layerContext.updateIsObsolete = false;
            scheduleLayerUpdate(layerContext);
        }
        // This is the final update for now: clean up
        else {
            delete _contextPerLayer[layerContext.contextID];
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
            function (message) {
                handlePsInfoMessage(message);
            },
            function (err) {
                _generator.publish("generator.info.psState", "error requestiong state: " + err);
            });
    }

    function cacheLayerInfo(document) {
        var docID = document.id;
        if (document.layers) {
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

    // Called when the entire layer state is sent in response to requestStateUpdate()
    function handlePsInfoMessage(message) {
        if (message.hasOwnProperty("id")) {
            var docID = message.id;
            var saveFilename = null;
            _generator.publish("generator.info.psState", "Receiving PS state info");

            // First, preserve the filename if we already have it
            // and the message doesn't re-define it.
            if (_photoshopState[docID] &&
                _photoshopState[docID].file &&
                !message.file) {
                saveFilename = _photoshopState[docID].file;
            }

            _photoshopState[docID] = message;

            // Build a map for the layers so we don't have to search the list.
            if (_photoshopState[docID].layers) {
                var layerMap = {};
                _photoshopState[docID].layers.forEach(function (layer) {
                    layerMap[layer.id] = layer;
                });
                _photoshopState[docID].layerMap = layerMap;
            }

            if (saveFilename) {
                _photoshopState[docID].file = saveFilename;
            }
        }
    }
    
    function init(generator) {
        _generator = generator;
        requestStateUpdate();

        // TODO: Much of this initialization is currently temporary. Once
        // we have storage of assets in the correct location implemented, we
        // should rewrite this to be more structured. The steps of init should
        // be something like:
        //
        // 1. Get PS path
        // 2. Register for PS events we care about
        // 3. Get document info on current document
        // 4. Initiate asset generation on current document if enabled
        //

        _generator.getPhotoshopPath().done(
            function (path) {
                _photoshopPath = path;
                _generator.subscribe("photoshop.event.imageChanged", handleImageChanged);
            },
            function (err) {
                _generator.publish(
                    "assets.error.init",
                    "Could not get photoshop path: " + err
                );
            }
        );

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
