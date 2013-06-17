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
        // Name the module paths instead of path to avoid conflicts with variables named path
        paths = require("path"),
        resolve = require("path").resolve,
        mkdirp = require("mkdirp"),
        tmp = require("tmp"),
        Q = require("q"),
        convert = require("./lib/convert"),
        xpm2png = require("./lib/xpm2png");

    var DELAY_TO_WAIT_UNTIL_USER_DONE = 300;

    var _generator = null,
        _photoshopPath = null,
        // For unsaved files
        _fallbackBaseDirectory = null,
        _contextPerDocument = {},
        _changeContextPerLayer = {};

    // TODO: Once we get the layer change management/updating right, we should add a
    // big comment at the top of this file explaining how this all works. In particular
    // we should explain what contexts are, and how we manage scheduling updates.

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

    function deleteDirectoryRecursively(directory) {
        // Directory doesn't exist? We're done.
        if (!fs.existsSync(directory)) {
            return;
        }
        
        // Delete all entries in the directory
        var files = fs.readdirSync(directory);
        files.forEach(function (file) {
            var path = resolve(directory, file);
            if (fs.statSync(path).isDirectory()) {
                deleteDirectoryRecursively(path);
            } else {
                fs.unlinkSync(path);
            }
        });

        // Delete the now empty directory
        fs.rmdirSync(directory);
    }

    function deleteDirectoryIfEmpty(directory) {
        if (fs.existsSync(directory) && fs.readdirSync(directory).length === 0) {
            fs.rmdirSync(directory);
        }
    }

    function fakeUserTurningAssetGenerationOn(documentId) {
        setTimeout(function () {
            _generator.publish("photoshop.event.generatorSettingsChange", {
                id: documentId,
                settings: {
                    generateAssets: true
                }
            });
        }, 100);
    }

    function handleGeneratorSettingsChanged(event) {
        var context = _contextPerDocument[event.id];
        
        if (!context) {
            // This shouldn't happen due to handleImageChanged creating the context
            console.warn("No context for document with ID " + event.id);
            return;
        }

        if (context.assetGenerationEnabled !== event.settings.generateAssets) {
            context.assetGenerationEnabled = event.settings.generateAssets;
            generateAllAssets();
        }
    }

    function handleImageChanged(document) {
        // If the document was closed
        if (document.closed) {
            delete _contextPerDocument[document.id];
            // Stop here
            return;
        }

        var context = _contextPerDocument[document.id];
        if (!context) {
            context = _contextPerDocument[document.id] = {
                document: { id: document.id },
                // Initially (new/opened file), turn asset generation off
                assetGenerationEnabled: false
            };

            // But act as if the user then turns it on
            fakeUserTurningAssetGenerationOn(document.id);
        }

        // If there is a file name (e.g., after saving or when switching between files, even unsaved ones)
        if (document.file) {
            handlePathChanged(document);
        }
        // If there are layer changes
        if (document.id && document.layers) {
            document.layers.forEach(function (layer) {
                handleImageChangedForLayer(document, layer);
            });
        }
    }

    function handlePathChanged(document)
    {
        var context            = _contextPerDocument[document.id],
            wasSaved           = context.isSaved,
            previousPath       = context.path,
            previousStorageDir = context.assetGenerationDir;

        updatePathInfoForDocument(document);

        // Did the user perform "Save as..."?
        if (wasSaved && previousPath !== context.path) {
            // Turn asset generation off
            context.assetGenerationEnabled = false;
            // But act as if the user then turns it on
            fakeUserTurningAssetGenerationOn(document.id);
        }

        if (!wasSaved && context.isSaved && previousStorageDir) {
            // Delete the assets of a previous file
            // Photoshop will have asked the user to confirm overwriting the PSD file at this point,
            // so "overwriting" its assets is fine, too
            if (fs.existsSync(context.assetGenerationDir)) {
                deleteDirectoryRecursively(context.assetGenerationDir);
            }

            // Move the directory with the assets to the new location
            // TODO: check whether this works when moving from one drive letter to another on Windows
            fs.rename(previousStorageDir, context.assetGenerationDir, function (err) {
                if (err) {
                    _generator.publish("assets.error.rename", err);
                }
            });

            // Delete ~/Desktop/generator if it is empty now
            deleteDirectoryIfEmpty(_fallbackBaseDirectory);
        }
    }

    function updatePathInfoForDocument(document)
    {
        var context = _contextPerDocument[document.id],
            // The path to the document's file, or just its name (e.g., "Untitled-1" or "/foo/bar/hero-image.psd")
            path = document.file,
            // Determine whether the file is saved (i.e., it contains slashes or backslashes)...
            isSaved = path.match(/[\/\\]/),
            // The file extension, including the dot (e.g., ".psd")
            extension = paths.extname(path),
            // The file name, possibly with an extension (e.g., "Untitled-1" or "hero-image.psd")
            fileName = paths.basename(path),
            // The file name without its extension (e.g., "Untitled-1" or "hero-image")
            documentName = extension.length ? fileName.slice(0, -extension.length) : fileName,
            // For saved files, the directory the file was saved to. Otherwise, ~/Desktop/generator
            baseDirectory = isSaved ? paths.dirname(path) : _fallbackBaseDirectory;

        // Store the document's path
        context.path = path;
        // Determine whether the file is saved (i.e., the path is absolute, thus containing slashes or backslashes)...
        context.isSaved = isSaved;
        // Store the directory to store generated assets in
        context.assetGenerationDir = baseDirectory ? resolve(baseDirectory, documentName + "-assets") : null;
    }

    function handleImageChangedForLayer(document, layer) {
        // Document context
        var documentContext = _contextPerDocument[document.id];
        if (!documentContext.assetGenerationEnabled || !documentContext.assetGenerationDir) {
            return;
        }

        // Layer change context
        var contextID = document.id + "-" + layer.id;
        if (!_changeContextPerLayer[contextID]) {
            // Initialize the context object for this layer.
            // It will be deleted again once an update has finished
            // without the image changing during the update.
            _changeContextPerLayer[contextID] = {
                // Store the context ID here so the context can be deleted by finishLayerUpdate
                id:                 contextID,
                document:           document,
                documentContext:    documentContext,
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

    function ensureDirectory(directory) {
        var directoryCreatedDeferred = Q.defer();

        mkdirp(directory, function (err) {
            if (err) {
                _generator.publish(
                    "assets.error.init",
                    "Could not create directory '" + directory + "', no assets will be dumped"
                );
                directoryCreatedDeferred.reject(err);
            } else {
                directoryCreatedDeferred.resolve(directory);
            }
        });

        return directoryCreatedDeferred.promise;
    }

    // Start a new update
    function startLayerUpdate(changeContext) {
        var layerUpdatedDeferred = Q.defer();

        var layer    = changeContext.layer,
            fileName = "layer-" + changeContext.layer.id + ".png",
            path     = resolve(changeContext.documentContext.assetGenerationDir, fileName);

        function deleteLayerImage() {
            // Delete the image for the empty layer
            fs.unlink(path, function (err) {
                if (err) {
                    layerUpdatedDeferred.reject(err);
                } else {
                    // Delete directory foo-assets/ for foo.psd if it is empty now
                    deleteDirectoryIfEmpty(changeContext.documentContext.assetGenerationDir);
                    // Delete ~/Desktop/generator if it is empty now
                    deleteDirectoryIfEmpty(_fallbackBaseDirectory);
                    layerUpdatedDeferred.resolve();
                }
            });
        }

        function createLayerImage() {
            _generator.getPixmap(changeContext.layer.id, 100).then(
                function (pixmap) {
                    // Prevent an error after deleting a layer's contents, resulting in a 0x0 pixmap
                    if (pixmap.width === 0 || pixmap.height === 0) {
                        deleteLayerImage();
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
                                    ensureDirectory(changeContext.documentContext.assetGenerationDir)
                                        .fail(layerUpdatedDeferred.reject)
                                        .done(function () {
                                            // ...move the temporary file to the desired location
                                            // TODO: check whether this works when moving from one
                                            // drive letter to another on Windows
                                            fs.rename(tmpPath, path, function (err) {
                                                if (err) {
                                                    layerUpdatedDeferred.reject(err);
                                                } else {
                                                    layerUpdatedDeferred.resolve();
                                                }
                                            });
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
        }

        if (layer.removed) {
            // Delete the image if the layer was removed
            deleteLayerImage();
        }
        else {
            // Update the layer image
            // The change could be layer.pixels, layer.added, layer.path, ...
            // Always update if it has been added because it could
            // have been dragged & dropped or copied & pasted,
            // and therefore might not be empty like new layers
            createLayerImage();
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

    function generateAllAssets() {
        _generator.getDocumentInfo()
            .fail(function (err) {
                _generator.publish("assets.error.getDocumentInfo", err);
            })
            .done(function (document) {
                // Act as if all the layers have changed
                handleImageChanged(document);
            });
    }
    
    function init(generator) {
        _generator = generator;

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
                
                // First, check whether we can retrieve the user's home directory
                var homeDirectory = getUserHomeDirectory();
                if (homeDirectory) {
                    _fallbackBaseDirectory = resolve(homeDirectory, "Desktop", "generator");
                } else {
                    _generator.publish(
                        "assets.error.init",
                        "Could not locate home directory in env vars, no assets will be dumped for unsaved files"
                    );
                }

                _generator.subscribe("photoshop.event.imageChanged", handleImageChanged);
                _generator.subscribe("photoshop.event.generatorSettingsChange", handleGeneratorSettingsChanged);
            },
            function (err) {
                _generator.publish(
                    "assets.error.init",
                    "Could not get photoshop path: " + err
                );
            }
        );
    }

    exports.init = init;

}());