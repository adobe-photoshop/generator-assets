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

    var path = require("path"),
        util = require("util"),
        EventEmitter = require("events").EventEmitter;

    var Q = require("q"),
        fs = require("fs-extra");

    var AsyncQueue = require("./asyncqueue");

    // Files that are ignored when trying to determine whether a directory is empty
    var FILES_TO_IGNORE = new RegExp("(.DS_Store)$|(desktop.ini)$", "i");

    var _homeDirectory = process.env[(process.platform === "win32") ? "USERPROFILE" : "HOME"],
        _desktopDirectory = _homeDirectory && path.resolve(_homeDirectory, "Desktop");

    function FileManager() {
        this._basePath = null;

        this._queue = new AsyncQueue();
    }

    util.inherits(FileManager, EventEmitter);

    FileManager.prototype._basePath = null;

    FileManager.prototype._queue = null;

    FileManager.prototype._nextBaseDirFn = null;

    FileManager.prototype._nextBaseDirPromise = null;

    Object.defineProperties(FileManager.prototype, {
        "basePath": {
            get: function () { return this._basePath; },
            set: function () { throw new Error("Cannot set basePath"); }
        }
    });

    FileManager.prototype.updateBasePath = function (documentFile) {
        var extension = path.extname(documentFile),
            // The file name, possibly with an extension (e.g., "Untitled-1" or "hero-image.psd")
            fileName = path.basename(documentFile),
            // The file name without its extension (e.g., "Untitled-1" or "hero-image")
            documentName = extension.length ? fileName.slice(0, -extension.length) : fileName,
            // Determine whether the file is saved (i.e., it contains slashes or backslashes and is not in the trash)
            // Note that on Windows, a deleted file is reported without an absolute path
            isSaved = documentFile.match(/[\/\\]/) && documentFile.indexOf("/.Trashes/") === -1,
            documentDirectory = isSaved ? path.dirname(documentFile) : _desktopDirectory,
            basePath = documentDirectory ? path.resolve(documentDirectory, documentName + "-assets") : null;

        var previousBasePath = this._basePath;
        this._basePath = basePath;


        if (previousBasePath) {
            this._moveBaseDirectory(previousBasePath);
        } else {
            this._initBaseDirectory();
        }
        
        console.log("Base directory:", basePath);

        return basePath;
    };

    FileManager.prototype._finishBaseDirUpdate = function () {
        this._nextBaseDirPromise = null;
        if (this._nextBaseDirFn) {
            this._asap(this._nextBaseDirFn);
        } else {
            this._queue.unpause();
        }
    };

    FileManager.prototype._asap = function (fn) {
        if (this._nextBaseDirPromise) {
            this._nextBaseDirFn = fn;
        } else {
            var currentOpPromise = this._queue.pause(),
                nextBaseDirPromise;

            if (currentOpPromise) {
                this._nextBaseDirFn = fn;
                nextBaseDirPromise = currentOpPromise
                    .then(function () {
                        var fn = this._nextBaseDirFn = null;
                        this._nextBaseDirFn = null;
                        return fn();
                    }.bind(this));
            } else {
                this._nextBaseDirPromise = fn();
            }

            this._nextBaseDirPromise = nextBaseDirPromise
                .finally(this._finishBaseDirUpdate.bind(this))
                .done();
        }
    };

    FileManager.prototype._later = function (fn) {
        this._queue.push(fn);
    };

    FileManager.prototype._initBaseDirectory = function () {
        var basePath = this._basePath;

        // prioritize base directory operations ahead of asset operations
        this._queue.unshift(function () {
            console.log("Initializing base directory: ", basePath);
            return Q.ninvoke(fs, "stat", basePath).then(function (stats) {
                if (!stats.isDirectory()) {
                    throw new Error("Can't initialize base directory: file already exists.");
                }
            }, function (err) {
                if (err.code === "ENOENT") {
                    return Q.ninvoke(fs, "mkdir", basePath);
                } else {
                    throw new Error("Can't initialize base directory: ", err);
                }
            });
        }.bind(this));
    };

    FileManager.prototype._moveBaseDirectory = function (previousBasePath) {
        var basePath = this._basePath;

        // prioritize base directory operations ahead of asset operations
        this._queue.unshift(function () {
            console.log("Moving base directory:", basePath);
            return Q.ninvoke(fs, "rename", previousBasePath, basePath).fail(function (err) {
                console.warn("Unable to rename base directory: ", err);
                return Q.ninvoke(fs, "copy", previousBasePath, basePath, FILES_TO_IGNORE)
                    .then(Q.bind(fs, "remove", previousBasePath));
            });
        });
    };

    FileManager.prototype.moveFileAbsolute = function (sourceFullPath, targetFullPath) {
        this._queue.push(function () {
            return Q.ninvoke(fs, "rename", sourceFullPath, targetFullPath).fail(function (err) {
                console.warn("Unable to move asset into base directory: ", err);
                return Q.ninvoke(fs, "copy", sourceFullPath, targetFullPath)
                    .then(Q.nbind(fs, "remove", sourceFullPath));
            });
        });
    };

    FileManager.prototype.moveFileInto = function (sourceFullPath, targetRelativePath) {
        var basePath = this._basePath;
        if (!basePath) {
            console.warn("Can't move file: no base path");
            return;
        }

        var targetFullPath = path.resolve(basePath, targetRelativePath);

        this.moveFileAbsolute(sourceFullPath, targetFullPath);
    };

    FileManager.prototype.moveFileWithin = function (sourceRelativePath, targetRelativePath) {
        var basePath = this._basePath;
        if (!basePath) {
            console.warn("Can't move file: no base path");
            return;
        }

        var sourceFullPath = path.resolve(basePath, targetRelativePath),
            targetFullPath = path.resolve(basePath, targetRelativePath);

        this.moveFileAbsolute(sourceFullPath, targetFullPath);
    };

    FileManager.prototype.removeFileAbsolute = function (fullPath) {
        this._queue.push(function () {
            console.log("Removing file:", fullPath);
            return Q.ninvoke(fs, "remove", fullPath);
        });
    };

    FileManager.prototype.removeFileWithin = function (relativePath) {
        var basePath = this._basePath;
        if (!basePath) {
            console.warn("Can't remove file: no base path");
            return;
        }

        var fullPath = path.resolve(basePath, relativePath);

        this.removeFileAbsolute(fullPath);
    };

    module.exports = FileManager;
}());