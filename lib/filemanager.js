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

    var assert = require("assert"),
        path = require("path");

    var fs = require("fs-extra"),
        Q = require("q");
        

    var AsyncQueue = require("./asyncqueue");

    // Files that are ignored when trying to determine whether a directory is empty
    var FILES_TO_IGNORE = new RegExp("(.DS_Store)$|(desktop.ini)$", "i");

    var _homeDirectory = process.env[(process.platform === "win32") ? "USERPROFILE" : "HOME"],
        _desktopDirectory = _homeDirectory && path.resolve(_homeDirectory, "Desktop");

    function FileManager(generator, config, logger) {
        this._generator = generator;
        this._config = config;
        this._logger = logger;

        this._queue = new AsyncQueue();
        this._queue.pause();
        this._queue.on("error", function (err) {
            this._logger.error(err);
        }.bind(this));
    }

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

    FileManager.prototype._asap = function (fn) {
        this._nextBaseDirFn = fn;

        if (this._nextBaseDirPromise) {
            return;
        }

        this._nextBaseDirPromise = this._queue.pause()
            .then(function () {
                if (this._nextBaseDirFn) {
                    var fn = this._nextBaseDirFn;
                    this._nextBaseDirFn = null;
                    return fn();
                }
            }.bind(this))
            .finally(function () {
                this._nextBaseDirPromise = null;
                if (this._nextBaseDirFn) {
                    var fn = this._nextBaseDirFn;
                    this._nextBaseDirFn = null;
                    this._asap(fn);
                } else {
                    this._queue.unpause();
                }
            }.bind(this))
            .done();
    };

    FileManager.prototype._later = function (fn) {
        this._queue.push(fn);
    };

    /**
     * Delete directories that are empty (modulo FILES_TO_IGNORE) between basePath and targetDirectory.
     * 
     * @private
     * @param {string} basePath An absolute path
     * @param {string} targetDirectory An absolute path that is a child of basePath.
     * @return {Promise} Resolves once directory deletion is complete.
     */
    FileManager.prototype._cleanup = function (basePath, targetDirectory) {
        assert(targetDirectory.indexOf(basePath) === 0);

        if (targetDirectory === basePath) {
            return;
        }

        return Q.ninvoke(fs, "readdir", targetDirectory)
            .then(function (files) {
                var nonempty = files.some(function (file) {
                    return !FILES_TO_IGNORE.test(file);
                });

                if (nonempty) {
                    return false;
                } else {
                    return Q.ninvoke(fs, "remove", targetDirectory)
                        .thenResolve(true);
                }
            }.bind(this), function (err) {
                if (err.code === "ENOENT") {
                    return false;
                } else {
                    throw err;
                }
            }).then(function (removed) {
                if (removed) {
                    var parent = path.dirname(targetDirectory);
                    return this._cleanup(basePath, parent);
                }
            }.bind(this));
    };

    FileManager.prototype._moveFileHelper = function (sourceFullPath, targetFullPath) {
        var targetDirectory = path.dirname(targetFullPath);

        return Q.ninvoke(fs, "mkdirs", targetDirectory)
            .then(function () {
                return Q.ninvoke(fs, "rename", sourceFullPath, targetFullPath);
            }.bind(this))
            .fail(function (err) {
                this._logger.warn("Unable to rename asset; copying instead:", err);
                return Q.ninvoke(fs, "copy", sourceFullPath, targetFullPath)
                    .then(function () {
                        return Q.ninvoke(fs, "remove", sourceFullPath);
                    });
            }.bind(this));
    };

    FileManager.prototype._removeFileHelper = function (fullPath) {
        return Q.ninvoke(fs, "remove", fullPath);
    };

    FileManager.prototype._appendHelper = function (fullPath, data) {
        var directory = path.dirname(fullPath);

        return Q.ninvoke(fs, "mkdirs", directory)
            .then(function () {
                return Q.ninvoke(fs, "appendFile", fullPath, data);
            });
    };

    FileManager.prototype.updateBasePath = function (document) {
        var extension = document.extension || "",
            // The file name without its extension (e.g., "Untitled-1" or "hero-image")
            documentName = extension.length ? document.name.slice(0, -extension.length) : document.name,
            // Determine whether the file is saved (i.e., it contains slashes or backslashes and is not in the trash)
            // Note that on Windows, a deleted file is reported without an absolute path
            isSaved = document.saved && document.file.indexOf("/.Trashes/") === -1,
            documentDirectory = isSaved ? document.directory : _desktopDirectory,
            basePath = documentDirectory ? path.resolve(documentDirectory, documentName + "-assets") : null;

        var previousBasePath = this._basePath;

        if (basePath) {
            this._basePath = basePath;
            if (previousBasePath) {
                this._updateBaseDirectory(previousBasePath);
            } else {
                this._queue.unpause();
            }
        }
        
        this._logger.info("Base directory:", basePath);

        return basePath;
    };

    FileManager.prototype._updateBaseDirectory = function (previousBasePath) {
        // prioritize base directory operations ahead of asset operations
        this._asap(function () {
            var basePath = this._basePath;
            return Q.ninvoke(fs, "stat", previousBasePath)
                .then(function (stats) {
                    if (!stats.isDirectory()) {
                        throw new Error("Can't move base directory: not a directory.");
                    }

                    return this._moveFileHelper(previousBasePath, basePath);
                }.bind(this), function (err) {
                    // Do nothing if the directory doesn't exist yet;
                    // queued filesystem operations will create it on demand
                    if (err.code !== "ENOENT") {
                        throw err;
                    }
                });
        }.bind(this));
    };

    FileManager.prototype.moveFileInto = function (sourceFullPath, targetRelativePath) {
        this._later(function () {
            var basePath = this._basePath;
            if (!basePath) {
                throw new Error("Can't move file: no base path");
            }

            var targetFullPath = path.resolve(basePath, targetRelativePath);
            return this._moveFileHelper(sourceFullPath, targetFullPath);
        }.bind(this));
    };

    FileManager.prototype.moveFileWithin = function (sourceRelativePath, targetRelativePath) {
        this._later(function () {
            var basePath = this._basePath;
            if (!basePath) {
                throw new Error("Can't move file: no base path");
            }


            var sourceFullPath = path.resolve(basePath, targetRelativePath),
                targetFullPath = path.resolve(basePath, targetRelativePath);

            return this._moveFileHelper(sourceFullPath, targetFullPath)
                .then(function () {
                    var sourceDirectory = path.dirname(sourceFullPath);
                    this._cleanup(basePath, sourceDirectory);
                }.bind(this));
        }.bind(this));
    };

    FileManager.prototype.removeFileAbsolute = function (fullPath) {
        this._later(function () {
            return this._removeFileHelper(fullPath);
        }.bind(this));
    };

    FileManager.prototype.removeFileWithin = function (relativePath) {
        this._later(function () {
            var basePath = this._basePath;
            if (!basePath) {
                throw new Error("Can't remove file: no base path");
            }
            
            var fullPath = path.resolve(basePath, relativePath);

            return this._removeFileHelper(fullPath)
                .then(function () {
                    var targetDirectory = path.dirname(fullPath);
                    return this._cleanup(basePath, targetDirectory);
                }.bind(this));
        }.bind(this));
    };

    FileManager.prototype.appendWithin = function (relativePath, data) {
        this._later(function () {
            var basePath = this._basePath;
            if (!basePath) {
                throw new Error("Can't remove file: no base path");
            }
            
            var fullPath = path.resolve(basePath, relativePath);

            return this._appendHelper(fullPath, data);
        }.bind(this));
    };

    FileManager.prototype.cancelAll = function () {
        this._queue.removeAll();
    };

    module.exports = FileManager;
}());